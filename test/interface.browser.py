"""Browser checks for Alfa Bravo Desk (Playwright for Python; not part of CI).

Run with a Python that already has Playwright and its Chromium, Firefox and WebKit:
    python -X utf8 -B test/interface.browser.py
    python -X utf8 -B test/interface.browser.py --output <folder> --browser chromium

Every case runs at 320x568, 390x844 and 1280x800, in Japanese and English, light and dark, in the three browsers, with the page
served over HTTP: the three tabs are opened one by one, and there must be no console error, no CSP violation and no sideways
scroll of the page; the tab bar stays where it was when the tab changes; on the English page no Japanese is left (except the
katakana guide on the cards). The voice is a stand-in for speechSynthesis put in before the page loads, so that the checks can
see what would be read: nothing is read when the page opens, Read aloud reads the words in order with the marks on the row,
the word in the text and the letter in the line, Stop stops and can be pressed only while reading, Slow uses the slower rate,
and a device without an English voice gets the buttons turned off and the message. The page also opens from file://.
Viewport and full-page screenshots of each tab (Japanese, light, 1280 and 390 wide) are written to --output (default: a new
folder in the system temporary directory). Nothing is written inside the repository.
"""
import argparse
import re
import sys
import tempfile
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SIZES = ((320, 568), (390, 844), (1280, 800))
BROWSERS = ("chromium", "firefox", "webkit")
TABS = ("spell", "find", "reference")
JAPANESE = re.compile("[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿！-｠]")
GAP_WAIT_MS = 900  # longer than the slow gap between words (700 ms)

FAKE_SPEECH = """(() => {
  const log = [];
  window.__speechLog = log;
  class FakeUtterance {
    constructor(text) { this.text = text; this.voice = null; this.lang = ''; this.rate = 1; this.onend = null; this.onerror = null; }
  }
  const voices = window.__noVoices ? [] : window.__noVoice ? [{ name: 'Fake Japanese', lang: 'ja-JP', localService: true }]
    : [{ name: 'Fake Japanese', lang: 'ja-JP', localService: true }, { name: 'Fake English', lang: 'en-US', localService: true }];
  const synth = {
    current: null,
    getVoices() { return voices; },
    speak(u) { log.push({ text: u.text, rate: u.rate, lang: u.lang }); this.current = u; },
    cancel() { this.current = null; log.push({ cancel: true }); },
    addEventListener() {},
    removeEventListener() {},
  };
  window.__finishUtterance = () => {
    const u = synth.current;
    if (!u) return false;
    synth.current = null;
    if (u.onend) u.onend({});
    return true;
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = FakeUtterance;
})();"""
CSP_WATCH = """document.addEventListener('securitypolicyviolation', (e) => {
  (window.__csp = window.__csp || []).push(e.violatedDirective + ' ' + e.blockedURI); });"""

# '' when 通話表ツール in the subtitle sits on one line
SUBTITLE_BREAK = """() => { const p = document.querySelector('.subtitle');
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let node = null, n;
  while ((n = walker.nextNode())) if (n.textContent.includes('通話表ツール')) node = n;
  if (!node) return 'not in one text node'; const i = node.textContent.indexOf('通話表ツール');
  const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 6);
  const tops = new Set([...r.getClientRects()].map(x => Math.round(x.top))); return tops.size > 1 ? 'broken' : ''; }"""

SPELL_SWITCHES = ("spelling-common", "digit-icao", "digit-icao-plain", "case-off", "spelling-official", "digit-plain", "case-on", "say-case",
                  "say-case")
# The run of letters of the test of the core (one letter each, a line break every 16 letters)
SPACED = "\n".join([
    "A L P H A M I K E E C H O T A N", "G O H O T E L Y A N K E E S I E", "R R A T A N G O D E L T A I N D",
    "I G O A L P H A M I K E O S C A", "R N O V E M B E R D E L T A E C", "H O M I K E E C H O R O M E O A",
    "L P H A L I M A D E L T A Q U E", "B E C U N I F O R M A L P H A R", "O M E O T A N G O Z U L U Q Q Q"])

# The explanations on the screen: no line breaks inside a word, and the last line is not a lone short phrase (Japanese: one phrase
# narrower than a quarter of the paragraph; English: one word). A phrase is a text node: the scripts put a <wbr> between phrases.
WRAP_CHECK = """(lang) => {
  const sel = ['.intro-lead', '.intro-list li', '.intro .note'].concat(['.lead', '.seg-note:not(.stack)', '.seg-note.stack > .on',
    '.english-note', '.mode-line', '.study-card p'].map((x) => '.panel:not([hidden]) ' + x)).join(', ');
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    if (!el.getClientRects().length) continue;
    const chars = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node, ni = 0;
    while ((node = walker.nextNode())) {
      const t = node.textContent;
      for (let i = 0; i < t.length; i++) {
        if (/\\s/.test(t[i])) { chars.push({ node: ni, space: true }); continue; }
        const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 1);
        const rect = [...r.getClientRects()].find((x) => x.width > 0);
        if (rect) chars.push({ ch: t[i], node: ni, top: rect.top, left: rect.left, right: rect.right, space: false });
      }
      ni += 1;
    }
    const lines = [];
    for (const c of chars) {
      if (c.space) { if (lines.length) lines[lines.length - 1].push(c); continue; }
      const line = lines[lines.length - 1];
      const first = line && line.find((x) => !x.space);
      if (!line || Math.abs(c.top - first.top) > 4) lines.push([c]); else line.push(c);
    }
    const name = (el.className || el.tagName) + ': ' + el.textContent.slice(0, 24);
    for (let L = 0; L < lines.length - 1; L++) {
      const vis = lines[L].filter((c) => !c.space);
      const a = vis[vis.length - 1];
      const b = lines[L + 1].find((c) => !c.space);
      if (a && b && a.node === b.node && !lines[L][lines[L].length - 1].space && !/[-/]/.test(a.ch)) out.push(['mid-word', name, a.ch + '|' + b.ch]);
    }
    if (lines.length >= 2) {
      const last = lines[lines.length - 1];
      const vis = last.filter((c) => !c.space);
      const inner = last.slice(last.indexOf(vis[0]), last.lastIndexOf(vis[vis.length - 1]) + 1);
      const onePhrase = new Set(vis.map((c) => c.node)).size === 1 && !inner.some((c) => c.space);
      const cs = getComputedStyle(el);
      const content = el.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const width = vis[vis.length - 1].right - vis[0].left;
      const text = vis.map((c) => c.ch).join('');
      if (lang === 'ja' && onePhrase && width < content / 4) out.push(['short last line', name, text]);
      if (lang === 'en' && !inner.some((c) => c.space)) out.push(['one word on the last line', name, text]);
    }
  }
  return out;
}"""
WRAP_ISSUES = []

FAILURES = []


def check(condition, message):
    if not condition:
        FAILURES.append(message)
        print("FAIL", message)


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@contextmanager
def serve():
    handler = partial(QuietHandler, directory=str(ROOT))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}/index.html"
    finally:
        server.shutdown()


def open_page(browser, url, width, height, language, theme, no_voice=False, no_voices=False):
    context = browser.new_context(viewport={"width": width, "height": height}, color_scheme=theme, reduced_motion="reduce",
                                  locale="ja-JP" if language == "ja" else "en-US")
    page = context.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: errors.append(str(e)))
    if no_voice:
        page.add_init_script("window.__noVoice = true;")
    if no_voices:
        page.add_init_script("window.__noVoices = true;")
    page.add_init_script(FAKE_SPEECH)
    page.add_init_script(CSP_WATCH)
    page.goto(url + ("?lang=" + language if language else ""))
    page.wait_for_function("document.getElementById('spell-body').children.length > 0")
    page.wait_for_timeout(100)
    return context, page, errors


def assert_clean(page, errors, name):
    check(not errors, (name, "console errors", errors))
    check(page.evaluate("window.__csp || []") == [], (name, "CSP violations", page.evaluate("window.__csp || []")))


def overflow(page):
    return page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")


def visible_text(page):
    return page.evaluate("""() => {
      const clone = document.body.cloneNode(true);
      for (const el of clone.querySelectorAll('.kn, [hidden], noscript')) el.remove();
      return clone.textContent; }""")


def test_layout(browser, url, width, height, language, theme, name):
    context, page, errors = open_page(browser, url, width, height, language, theme)
    check(page.evaluate("document.documentElement.lang") == language, (name, "lang"))
    check(page.evaluate("document.documentElement.dataset.theme") == theme, (name, "theme"))
    check(page.evaluate("window.__speechLog.length") == 0, (name, "nothing is read when the page opens"))
    # Under 600 px the list of what the tool does folds into "More"; from 600 px it is open and its summary hidden
    opened = page.evaluate("document.getElementById('intro-more').open")
    check(opened == (width >= 600), (name, "intro folded", opened))
    # Right after opening on a phone (390x844), the whole tab bar is on the screen
    if (width, height) == (390, 844):
        bottom = page.evaluate("document.querySelector('.tabs').getBoundingClientRect().bottom")
        check(bottom <= height, (name, "tab bar below the first screen", bottom))
    # The subtitle never breaks inside 通話表ツール
    if language == "ja":
        broken = page.evaluate(SUBTITLE_BREAK)
        check(not broken, (name, "subtitle", broken))
    bar_top = "document.querySelector('.tabs').getBoundingClientRect().top"
    bar_height = "document.querySelector('.tabs').getBoundingClientRect().height"
    lines = "[...document.querySelectorAll('.tab-name')].map(e => Math.round(e.getBoundingClientRect().height))"
    first_height, first_lines = page.evaluate(bar_height), page.evaluate(lines)
    for tab in TABS:
        # The tab is pressed in place (a script click, so that the test does not scroll): the tab bar must not move
        before = page.evaluate(bar_top)
        page.evaluate(f"document.getElementById('tab-{tab}').click()")
        page.wait_for_timeout(50)
        after = page.evaluate(bar_top)
        check(abs(after - before) < 1, (name, tab, "tab bar moved", before, after))
        # Choosing a tab changes neither the height of the bar nor how each tab name wraps
        check(abs(page.evaluate(bar_height) - first_height) < 1, (name, tab, "tab bar height changed"))
        check(page.evaluate(lines) == first_lines, (name, tab, "tab names wrap differently", first_lines, page.evaluate(lines)))
        check(page.evaluate(f"!document.getElementById('panel-{tab}').hidden"), (name, tab, "panel shown"))
        check(page.evaluate("location.hash") == "#" + tab, (name, tab, "hash"))
        if tab == "find":
            page.click("#find-example")
        check(overflow(page) <= 0, (name, tab, "sideways scroll", overflow(page)))
        for issue in page.evaluate(WRAP_CHECK, language):
            WRAP_ISSUES.append((name, tab, *issue))
            # Lines breaking inside a word are always an error; a short last line is listed (only Chromium has text-wrap: pretty)
            if issue[0] == "mid-word" or name[0] == "chromium":
                check(False, (name, tab, *issue))
        if tab == "spell":
            # Every choice of the switches: the result below does not move, and nothing sticks out sideways
            head = "document.querySelector('#panel-spell .result-head').getBoundingClientRect().top"
            start = page.evaluate(head)
            for button in SPELL_SWITCHES:
                page.evaluate(f"document.getElementById('{button}').click()")
                check(abs(page.evaluate(head) - start) < 1, (name, "switch moved the result", button))
                check(overflow(page) <= 0, (name, "sideways scroll after", button))
        if tab == "reference":
            heights = page.evaluate("[...new Set([...document.querySelectorAll('.letter-card')].map(e => Math.round(e.offsetHeight)))]")
            check(len(heights) == 1, (name, "cards of different heights", heights))
        if tab == "find":
            # The run without breaks: the whole find tab still fits the width
            page.click("#find-example-joined")
            check(overflow(page) <= 0, (name, "sideways scroll with the run of letters", overflow(page)))
            page.click("#find-example")
        # Nothing sticks out of the panel (a wide table or a long word)
        wide = page.evaluate(f"""() => {{ const p = document.getElementById('panel-{tab}').getBoundingClientRect();
          return [...document.querySelectorAll('#panel-{tab} *')].filter(e => {{ const r = e.getBoundingClientRect();
            return r.width && (r.right > p.right + 1 || r.left < p.left - 1); }}).map(e => e.tagName + '.' + e.className).slice(0, 5); }}""")
        check(not wide, (name, tab, "sticks out of the panel", wide))
    if language == "en":
        left = [s for s in JAPANESE.findall(visible_text(page))]
        check(not left, (name, "Japanese on the English page", "".join(left)[:40]))
        attrs = page.evaluate("""() => [...document.querySelectorAll('[aria-label]')].map(e => e.getAttribute('aria-label'))""")
        check(not [a for a in attrs if JAPANESE.search(a)], (name, "Japanese in aria-label"))
    # Scroll down, change the tab: the place on the page does not jump
    page.click("#tab-reference")
    page.evaluate("window.scrollTo(0, document.querySelector('.tabs').getBoundingClientRect().top + window.scrollY - 10)")
    before = page.evaluate("window.scrollY")
    page.click("#tab-spell")
    page.wait_for_timeout(50)
    check(abs(page.evaluate("window.scrollY") - before) < 2, (name, "scroll jumped when the tab changed"))
    assert_clean(page, errors, name)
    context.close()


def test_speech(browser, url, name):
    context, page, errors = open_page(browser, url, 390, 844, "ja", "light")
    log = lambda: page.evaluate("window.__speechLog")
    check(page.is_disabled("#spell-stop"), (name, "stop disabled before reading"))
    page.click("#spell-speak")
    check(log()[-1]["text"] == "Capital Papa", (name, "first word", log()))
    check(log()[-1]["rate"] == 1, (name, "normal rate"))
    check(log()[-1]["lang"] == "en-US", (name, "English voice"))
    check(page.is_enabled("#spell-stop"), (name, "stop enabled while reading"))
    check(page.evaluate("document.querySelector('#spell-body tr.now').dataset.index") == "0", (name, "mark on row 1"))
    check(page.text_content("#spell-status") == "1文字目を読んでいます", (name, "status 1"))
    page.evaluate("window.__finishUtterance()")
    page.wait_for_timeout(GAP_WAIT_MS)
    check(log()[-1]["text"] == "Small Alpha", (name, "second word (Alfa read as Alpha)", log()[-1]))
    check(page.evaluate("document.querySelector('#spell-body tr.now').dataset.index") == "1", (name, "mark on row 2"))
    page.click("#spell-stop")
    check(page.is_disabled("#spell-stop"), (name, "stop disabled after stop"))
    check(page.evaluate("document.querySelectorAll('#spell-body tr.now').length") == 0, (name, "mark removed"))
    check(page.text_content("#spell-status").startswith("止めました。"), (name, "stopped status", page.text_content("#spell-status")))
    count = len(log())
    page.wait_for_timeout(GAP_WAIT_MS)
    check(len(log()) == count, (name, "nothing more after stop"))
    # Slow, and to the end
    page.click("#panel-spell [data-speed=slow]")
    page.fill("#spell-input", "a1")
    page.click("#spell-speak")
    check(log()[-1]["rate"] == 0.7, (name, "slow rate", log()[-1]))
    page.evaluate("window.__finishUtterance()")
    page.wait_for_timeout(GAP_WAIT_MS)
    check(log()[-1]["text"] == "One", (name, "digit", log()[-1]))
    page.evaluate("window.__finishUtterance()")
    page.wait_for_timeout(GAP_WAIT_MS)
    check(page.text_content("#spell-status").startswith("読み終わりました。"), (name, "finished"))
    check(page.is_disabled("#spell-stop"), (name, "stop disabled at the end"))
    # Over the limit
    page.fill("#spell-input", "x" * 205)
    check(len(page.input_value("#spell-input")) == 200, (name, "200 characters kept"))
    check(page.is_visible("#spell-over") and page.text_content("#spell-over") == "200文字までです。超えた分は入りません。", (name, "over"))
    # Find in text
    page.click("#tab-find")
    page.click("#find-example")
    check(page.text_content("#decoded-line") == "AB79 XE", (name, "decoded line"))
    check(page.evaluate("document.querySelectorAll('#find-text mark.single').length") == 1, (name, "one single word"))
    page.click("#find-speak")
    check(log()[-1]["text"] == "Alpha", (name, "find first word", log()[-1]))
    check(page.evaluate("document.querySelector('#find-text mark.now').dataset.k") == "0", (name, "mark in the text"))
    check(page.evaluate("document.querySelector('#decoded .now').dataset.k") == "0", (name, "mark in the line"))
    check(page.text_content("#find-status") == "1語目を読んでいます", (name, "find status"))
    page.evaluate("window.__finishUtterance()")
    page.wait_for_timeout(GAP_WAIT_MS)
    check(page.evaluate("document.querySelector('#find-text mark.now').dataset.k") == "1", (name, "mark moved"))
    page.click("#find-stop")
    check(page.evaluate("document.querySelectorAll('#find-text mark.now, #decoded .now').length") == 0, (name, "find marks removed"))
    # Changing the tab stops the reading
    page.click("#find-speak")
    page.click("#tab-reference")
    check(log()[-1].get("cancel") is True, (name, "tab change cancels"))
    page.click("#letter-grid .letter-card >> nth=9")
    check(log()[-1]["text"] == "Juliet", (name, "card J read as Juliet", log()[-1]))
    check(page.evaluate("document.querySelectorAll('.letter-card.now').length") == 1, (name, "card marked"))
    page.evaluate("window.__finishUtterance()")
    page.wait_for_timeout(GAP_WAIT_MS)
    check(page.evaluate("document.querySelectorAll('.letter-card.now').length") == 0, (name, "card mark removed"))
    # Copy (the button gives a message either way)
    page.click("#tab-spell")
    page.fill("#spell-input", "Ab")
    check(page.text_content("#spell-copy-text") == "Capital Alfa, Small Bravo", (name, "copy text"))
    assert_clean(page, errors, name)
    context.close()


def test_spelling_and_find(browser, url, name, output=None):
    context, page, errors = open_page(browser, url, 390, 844, "ja", "light")
    log = lambda: page.evaluate("window.__speechLog")
    # Letter spelling and digits: the table, the line to copy and the voice follow the choice
    page.fill("#spell-input", "Aj1")
    page.click("#spelling-common")
    page.click("#digit-icao")
    check(page.text_content("#spell-copy-text") == "Capital Alpha, Small Juliet, Wun", (name, "copy common + icao"))
    check(page.evaluate("document.querySelector('#digit-note .on').textContent").startswith("ICAO式で、綴りは原典のとおりです"), (name, "digit note"))
    page.click("#digit-icao-plain")
    check(page.text_content("#spell-copy-text") == "Capital Alpha, Small Juliet, One", (name, "copy icao plain"))
    page.click("#spell-speak")
    check(log()[-1]["text"] == "Capital Alpha", (name, "voice follows the spelling"))
    page.click("#spell-stop")
    # The switch "Say capital / small": on by default; off leaves them out of the voice only
    check(page.get_attribute("#say-case", "aria-checked") == "true", (name, "say case on by default"))
    check(page.get_attribute("#say-case", "role") == "switch", (name, "switch role"))
    page.click("#say-case")
    check(page.get_attribute("#say-case", "aria-checked") == "false" and page.text_content("#say-case-state") == "オフ", (name, "switch off"))
    page.click("#spell-speak")
    check(log()[-1]["text"] == "Alpha", (name, "voice without capital", log()[-1]))
    page.click("#spell-stop")
    check(page.text_content("#spell-copy-text") == "Capital Alpha, Small Juliet, One", (name, "copy keeps capital"))
    check(page.evaluate("document.querySelector('#spell-body tr .case').textContent") == "大文字の", (name, "table keeps capital"))
    page.click("#case-off")
    check(page.is_disabled("#say-case"), (name, "switch disabled when ignoring case"))
    check(page.evaluate("document.querySelector('#say-case-note .on').textContent").startswith("「大文字と小文字」を「区別しない」"), (name, "reason"))
    page.click("#case-on")
    page.click("#say-case")
    check(page.get_attribute("#say-case", "aria-checked") == "true", (name, "switch back on"))
    page.click("#spelling-official")
    page.click("#digit-plain")
    check(page.text_content("#spell-copy-text") == "Capital Alfa, Small Juliett, One", (name, "copy official"))
    # Find in text: the buttons that remove spaces and line breaks, and undo
    page.click("#tab-find")
    for button in ("remove-spaces", "remove-breaks", "undo-remove"):
        check(page.is_disabled("#" + button), (name, "disabled on an empty text", button))
    page.click("#find-example-joined")
    original = page.input_value("#find-input")
    check(page.text_content("#decoded-line") == "SECRET?KEY?", (name, "joined example", page.text_content("#decoded-line")))
    check(page.text_content("#find-mode-line").startswith("自動で判断し、英字が切れ目なく続く並びとして"), (name, "mode line"))
    check(page.evaluate("document.querySelectorAll('#find-text mark.unread').length") == 2, (name, "two unreadable parts marked"))
    check(page.evaluate("[...document.querySelectorAll('#unread li')].map(e => e.textContent)") == ["PURPLE（6文字）", "ZZ（2文字）"], (name, "list"))
    check(page.is_hidden("#singles-block") and page.is_visible("#unread-block"), (name, "unread list instead of singles"))
    check(page.is_enabled("#remove-spaces") and page.is_enabled("#remove-breaks") and page.is_disabled("#undo-remove"), (name, "buttons"))
    page.click("#remove-spaces")
    check(page.text_content("#remove-status") == "空白を49個消しました。", (name, "removed spaces", page.text_content("#remove-status")))
    check(" " not in page.input_value("#find-input"), (name, "no space left"))
    check(page.is_disabled("#remove-spaces") and page.is_enabled("#undo-remove"), (name, "after removing spaces"))
    page.click("#undo-remove")
    check(page.input_value("#find-input") == original, (name, "undo"))
    check(page.text_content("#remove-status") == "元に戻しました。" and page.is_disabled("#undo-remove"), (name, "after undo"))
    page.click("#remove-spaces")
    page.click("#remove-breaks")
    check(page.text_content("#remove-status") == "改行を3個消しました。", (name, "removed breaks"))
    check(page.text_content("#decoded-line") == "SECRET?KEY?", (name, "same result in one run"))
    # Typing drops the undo
    page.type("#find-input", "A")
    check(page.is_disabled("#undo-remove"), (name, "typing drops undo"))
    # The run of letters of the test, and the switch of how to read
    page.fill("#find-input", SPACED)
    check(page.text_content("#decoded-line") == "AMETHYSTD?AMONDEMERALDQUARTZ?", (name, "spaced run", page.text_content("#decoded-line")))
    check(page.text_content("#find-count") == "区切った単語：27語・読めない部分：2か所", (name, "count line"))
    page.click("[data-findmode=words]")
    check(page.text_content("#find-mode-line") == "単語ごとに読みました。", (name, "words mode line"))
    check(page.text_content("#decoded-line") == "", (name, "nothing in word mode"))
    page.click("[data-findmode=auto]")
    # Only the spaces removed (16 letters a line, 9 lines): read as a run automatically
    page.fill("#find-input", SPACED.replace(" ", ""))
    check(page.text_content("#decoded-line") == "AMETHYSTD?AMONDEMERALDQUARTZ?", (name, "lines without spaces"))
    check(page.text_content("#find-mode-line").startswith("自動で判断し、英字が切れ目なく続く並びとして区切りました。"), (name, "auto joined line"))
    check(page.is_visible("#unread-block"), (name, "unread list shown"))
    # A run inside a sentence: read word by word, and only the run is split
    page.fill("#find-input", "The answer: ALPHAMIKEECHOTANGO done")
    check(page.text_content("#decoded-line") == "AMET", (name, "run in a sentence"))
    check(page.text_content("#find-mode-line") == "自動で判断し、単語ごとに読みました。長い英字のまとまり1か所は、通話表の単語に区切って読みました。", (name, "split line"))
    page.fill("#find-input", SPACED.replace(" ", ""))
    if output:
        for width, height in ((1280, 800), (390, 844)):
            page.set_viewport_size({"width": width, "height": height})
            page.evaluate("document.querySelector('.tabs').scrollIntoView()")
            page.wait_for_timeout(200)
            page.screenshot(path=str(output / f"find_lines_{width}.png"), caret="initial")
            page.screenshot(path=str(output / f"find_lines_{width}_full.png"), full_page=True, caret="initial")
    assert_clean(page, errors, name)
    context.close()


NOTICE_JA = "この端末には英語の声がないため、日本語の声で読みます（発音は日本語の読み方になります）。"
NOTICE_NONE = "この端末には読み上げの声がないため、読み上げられません。"


def notice_state(page):
    return page.evaluate("""() => ['spell-voice-note', 'find-voice-note', 'ref-voice-note'].map(id => {
      const el = document.getElementById(id); return [el.hidden, el.textContent]; })""")


def test_no_voice(browser, url, name, output=None):
    # Only a Japanese voice: the buttons work, and the notice in the colored band is the same on the three tabs
    context, page, errors = open_page(browser, url, 390, 844, "ja", "light", no_voice=True)
    page.wait_for_timeout(300)
    states = notice_state(page)
    check(all(not hidden and text.startswith("注意" + NOTICE_JA) and "English (United States)" in text for hidden, text in states),
          (name, "Japanese voice notice", states))
    check(page.is_enabled("#spell-speak"), (name, "speak works with a Japanese voice"))
    top = page.evaluate("document.getElementById('spell-speak').getBoundingClientRect().top + window.scrollY")
    page.click("#spell-speak")
    check(page.evaluate("window.__speechLog")[-1]["lang"] == "ja-JP", (name, "read with the Japanese voice"))
    page.click("#spell-stop")
    page.wait_for_timeout(1700)
    check(abs(page.evaluate("document.getElementById('spell-speak').getBoundingClientRect().top + window.scrollY") - top) < 1, (name, "button moved"))
    page.click("#tab-reference")
    page.click("#letter-grid .letter-card >> nth=0")
    check(page.evaluate("window.__speechLog")[-1]["text"] == "Alpha", (name, "card read with the Japanese voice"))
    # The band stands out: its colors differ from the panel, with a thick line on the left
    band = page.evaluate("""() => { const s = getComputedStyle(document.getElementById('ref-voice-note'));
      const p = getComputedStyle(document.getElementById('panel-reference'));
      return [s.backgroundColor !== p.backgroundColor, parseFloat(s.borderLeftWidth)]; }""")
    check(band[0] and band[1] >= 4, (name, "band", band))
    if output:
        for width, height in ((1280, 800), (390, 844)):
            page.set_viewport_size({"width": width, "height": height})
            for tab in TABS:
                page.click(f"#tab-{tab}")
                if tab == "find":
                    page.click("#find-example")
                page.evaluate(f"document.getElementById('{ {'spell': 'spell-speak', 'find': 'find-speak', 'reference': 'ref-voice-note'}[tab] }')"
                              ".scrollIntoView({ block: 'center' })")
                page.wait_for_timeout(200)
                page.screenshot(path=str(output / f"notice_{tab}_{width}.png"), caret="initial")
    assert_clean(page, errors, name)
    context.close()
    # English page: the same notice in English
    context, page, errors = open_page(browser, url, 390, 844, "en", "dark", no_voice=True)
    page.wait_for_timeout(300)
    text = page.text_content("#spell-voice-note")
    check(text.startswith("NoteThis device has no English voice") and "English (United States)" in text, (name, "English notice", text))
    assert_clean(page, errors, name)
    context.close()
    # No voice at all: the buttons are off, the cards stay, and pressing a card says why
    context, page, errors = open_page(browser, url, 390, 844, "ja", "light", no_voices=True)
    page.wait_for_timeout(1700)
    check(page.is_disabled("#spell-speak"), (name, "speak disabled without any voice"))
    states = notice_state(page)
    check(all(not hidden and text.startswith("注意" + NOTICE_NONE) for hidden, text in states), (name, "no voice notice", states))
    page.click("#tab-find")
    page.click("#find-example")
    check(page.is_disabled("#find-speak"), (name, "find speak disabled"))
    page.click("#tab-reference")
    check(page.evaluate("document.querySelectorAll('.letter-card').length") == 36, (name, "cards still shown"))
    page.click("#letter-grid .letter-card >> nth=0")
    check(page.text_content("#ref-status") == NOTICE_NONE, (name, "card message"))
    check(not [x for x in page.evaluate("window.__speechLog") if "text" in x], (name, "nothing read"))
    assert_clean(page, errors, name)
    context.close()


def test_file_url(browser, name):
    context = browser.new_context(viewport={"width": 390, "height": 844})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto((ROOT / "index.html").as_uri() + "#find")
    page.wait_for_function("document.getElementById('spell-body').children.length > 0")
    check(not page.evaluate("document.getElementById('panel-find').hidden"), (name, "file:// opens #find"))
    check(not errors, (name, "file:// errors", errors))
    context.close()


def shots(browser, url, output):
    for width, height in ((1280, 800), (390, 844)):
        context, page, errors = open_page(browser, url, width, height, "ja", "light")
        for tab in TABS:
            page.click(f"#tab-{tab}")
            if tab == "find":
                page.click("#find-example")
            page.evaluate("window.scrollTo(0, 0)")
            page.wait_for_timeout(300)
            page.screenshot(path=str(output / f"{tab}_{width}.png"), caret="initial")
            page.screenshot(path=str(output / f"{tab}_{width}_full.png"), full_page=True, caret="initial")
            if tab == "reference":
                page.evaluate("document.getElementById('letter-grid').scrollIntoView()")
                page.wait_for_timeout(200)
                page.screenshot(path=str(output / f"cards_{width}.png"), caret="initial")
        context.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output")
    parser.add_argument("--browser", choices=BROWSERS)
    args = parser.parse_args()
    output = Path(args.output) if args.output else Path(tempfile.mkdtemp(prefix="alfa-bravo-desk-"))
    output.mkdir(parents=True, exist_ok=True)
    cases = 0
    with serve() as url, sync_playwright() as p:
        for browser_name in ([args.browser] if args.browser else BROWSERS):
            browser = getattr(p, browser_name).launch()
            for width, height in SIZES:
                for language in ("ja", "en"):
                    for theme in ("light", "dark"):
                        test_layout(browser, url, width, height, language, theme, (browser_name, width, language, theme))
                        cases += 1
            test_speech(browser, url, (browser_name, "speech"))
            test_spelling_and_find(browser, url, (browser_name, "spelling and find"), output if browser_name == "chromium" else None)
            test_no_voice(browser, url, (browser_name, "no voice"), output if browser_name == "chromium" else None)
            test_file_url(browser, (browser_name, "file"))
            cases += 4
            if browser_name == "chromium":
                shots(browser, url, output)
            browser.close()
    print(f"wrap issues (all browsers): {len(WRAP_ISSUES)}")
    for issue in WRAP_ISSUES:
        print("  ", issue)
    print(f"cases: {cases}, failures: {len(FAILURES)}, output: {output}")
    sys.exit(1 if FAILURES else 0)


if __name__ == "__main__":
    main()
