/* Alfa Bravo Desk - MIT (c) 2026 ipusiron. */
// 画面の処理。計算は AbdCore（js/abd-core.js）、文言は AbdI18n（js/i18n.js）と AbdMessages（js/messages.js）に任せる。
// 文字は textContent と要素の組み立てだけで入れる（HTML として解釈しない）。保存するのは言語と明暗だけ。
(function () {
  'use strict';
  const Core = window.AbdCore;
  const I18n = window.AbdI18n;
  const t = (key, vars) => I18n.t(key, vars);
  const $ = (id) => document.getElementById(id);
  const THEME_KEY = 'alfa-bravo-desk.theme';
  const TABS = ['spell', 'find', 'reference'];

  // 要素を組み立てる（属性は setAttribute、中身は文字か要素）
  function E(tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [name, value] of Object.entries(attrs || {})) {
      if (value === null || value === undefined || value === false) continue;
      el.setAttribute(name, value === true ? '' : String(value));
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === '') continue;
      el.append(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return el;
  }
  function words(text) {
    const span = E('span');
    I18n.setText(span, text);
    return span;
  }

  const state = {
    tab: 'spell',
    caseMode: 'distinguish',
    digitMode: 'plain',
    findDigits: true,
    speed: 'normal',
    spellItems: [],
    findResult: null,
  };

  // ===== 読み上げ =====
  const speech = {
    synth: ('speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function') ? window.speechSynthesis : null,
    voice: null,
    status: 'pending', // pending | ready | none | unsupported
    session: 0,
    timer: null,
    owner: null,
    current: null,
  };

  function updateVoice() {
    if (!speech.synth) { speech.status = 'unsupported'; return; }
    const voice = Core.pickVoice(speech.synth.getVoices());
    if (voice) { speech.voice = voice; speech.status = 'ready'; }
    else if (speech.status !== 'pending') speech.status = 'none';
  }
  function initVoices() {
    if (!speech.synth) { speech.status = 'unsupported'; refreshSpeakButtons(); return; }
    updateVoice();
    const settle = () => { updateVoice(); if (speech.status === 'pending') speech.status = 'none'; refreshSpeakButtons(); };
    if (typeof speech.synth.addEventListener === 'function') {
      speech.synth.addEventListener('voiceschanged', () => { updateVoice(); if (speech.voice) speech.status = 'ready'; refreshSpeakButtons(); });
    }
    // 声の一覧が届かない端末もあるので、少し待ってから「声がない」と決める
    if (speech.status === 'pending') window.setTimeout(settle, 1500);
    refreshSpeakButtons();
  }
  function voiceProblem() {
    if (speech.status === 'unsupported') return t('noSpeech');
    if (speech.status === 'none') return t('noVoice');
    return '';
  }

  // queue: [{ index, text }]。onWord(index, n) は読み始める語ごと、onEnd(reason) は 'finished' か 'stopped'
  function speakQueue(owner, queue, onWord, onEnd) {
    stopSpeaking();
    if (speech.status !== 'ready' || !queue.length) return false;
    const session = ++speech.session;
    speech.owner = { name: owner, onEnd };
    let i = 0;
    const next = () => {
      if (session !== speech.session) return;
      if (i >= queue.length) { finish('finished'); return; }
      const item = queue[i];
      onWord(item.index, i + 1);
      const u = new window.SpeechSynthesisUtterance(item.text);
      u.voice = speech.voice;
      u.lang = speech.voice.lang;
      u.rate = Core.RATES[state.speed];
      u.onend = () => {
        if (session !== speech.session) return;
        i += 1;
        speech.timer = window.setTimeout(next, Core.GAP_MS[state.speed]);
      };
      u.onerror = () => { if (session === speech.session) finish('stopped'); };
      speech.current = u; // 読み終わる前に片付けられないよう持っておく
      speech.synth.speak(u);
    };
    const finish = (reason) => {
      const o = speech.owner;
      speech.session += 1;
      speech.owner = null;
      speech.current = null;
      if (o) o.onEnd(reason);
    };
    speech.finish = finish;
    refreshSpeakButtons(owner);
    next();
    return true;
  }
  function stopSpeaking() {
    window.clearTimeout(speech.timer);
    if (speech.synth) speech.synth.cancel();
    if (speech.owner && speech.finish) speech.finish('stopped');
    refreshSpeakButtons();
  }
  function refreshSpeakButtons(active) {
    const reading = active || (speech.owner && speech.owner.name);
    const ok = speech.status === 'ready';
    $('spell-speak').disabled = !ok || !state.spellItems.some((x) => x.spoken !== null);
    $('find-speak').disabled = !ok || !(state.findResult && state.findResult.sequences.length);
    $('spell-stop').disabled = reading !== 'spell';
    $('find-stop').disabled = reading !== 'find';
    const problem = voiceProblem();
    if (problem) {
      $('spell-status').textContent = problem;
      $('find-status').textContent = problem;
    }
  }

  // ===== 見出し・明暗・言語 =====
  function renderThemeButton() {
    const dark = document.documentElement.dataset.theme === 'dark';
    $('theme-label').textContent = t(dark ? 'themeLight' : 'themeDark');
  }
  $('theme').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* 保存は使えなくてもよい */ }
    renderThemeButton();
  });
  $('language').addEventListener('click', () => {
    I18n.set(document, I18n.lang === 'ja' ? 'en' : 'ja');
  });

  // 幅390px未満では「できること」を「くわしく」の中にたたむ
  const wide = window.matchMedia('(min-width: 390px)');
  const syncIntro = () => { $('intro-more').open = wide.matches; };
  if (typeof wide.addEventListener === 'function') wide.addEventListener('change', syncIntro);
  else if (typeof wide.addListener === 'function') wide.addListener(syncIntro);

  // ===== タブ =====
  function selectTab(name, focus) {
    if (!TABS.includes(name)) name = 'spell';
    if (state.tab !== name) stopSpeaking();
    state.tab = name;
    for (const tab of TABS) {
      const button = $('tab-' + tab);
      const on = tab === name;
      button.setAttribute('aria-selected', on ? 'true' : 'false');
      button.tabIndex = on ? 0 : -1;
      $('panel-' + tab).hidden = !on;
    }
    if (focus) $('tab-' + name).focus();
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  }
  for (const tab of TABS) {
    $('tab-' + tab).addEventListener('click', () => selectTab(tab));
    $('tab-' + tab).addEventListener('keydown', (event) => {
      const at = TABS.indexOf(tab);
      const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: TABS.length - 1 }[event.key];
      if (to === undefined) return;
      event.preventDefault();
      selectTab(TABS[(to + TABS.length) % TABS.length], true);
    });
  }
  const tabFromHash = () => {
    const h = location.hash.replace('#', '');
    return TABS.includes(h) ? h : 'spell';
  };
  window.addEventListener('hashchange', () => selectTab(tabFromHash()));

  // ===== 2択のボタン =====
  function setPressed(buttons, active) {
    for (const b of buttons) b.setAttribute('aria-pressed', b === active ? 'true' : 'false');
  }
  function bindPair(onId, offId, apply) {
    const on = $(onId), off = $(offId);
    on.addEventListener('click', () => { setPressed([on, off], on); apply(true); });
    off.addEventListener('click', () => { setPressed([on, off], off); apply(false); });
  }
  bindPair('case-on', 'case-off', (on) => { state.caseMode = on ? 'distinguish' : 'ignore'; stopSpeaking(); computeSpell(); });
  bindPair('digit-plain', 'digit-icao', (plain) => { state.digitMode = plain ? 'plain' : 'icao'; stopSpeaking(); computeSpell(); });
  bindPair('digits-on', 'digits-off', (on) => { state.findDigits = on; stopSpeaking(); computeFind(); });
  const speedButtons = [...document.querySelectorAll('[data-speed]')];
  for (const b of speedButtons) {
    b.addEventListener('click', () => {
      state.speed = b.dataset.speed;
      for (const x of speedButtons) x.setAttribute('aria-pressed', x.dataset.speed === state.speed ? 'true' : 'false');
    });
  }

  // ===== 入力の上限 =====
  function bindLimited(input, max, overId, counterId, onChange) {
    const over = $(overId);
    const update = (fromUser) => {
      const clamped = Core.clampText(input.value, max);
      if (clamped.over) input.value = clamped.text;
      if (clamped.over) { over.hidden = false; over.textContent = t('overLimit', { max: Core.formatNumber(max) }); }
      else if (fromUser && clamped.length < max) over.hidden = true;
      $(counterId).textContent = t('counter', { n: Core.formatNumber(clamped.length), max: Core.formatNumber(max) });
      onChange();
    };
    input.addEventListener('input', () => { stopSpeaking(); update(true); });
    return update;
  }

  // ===== タブ1：綴りを伝える =====
  const spellInput = $('spell-input');
  const updateSpellInput = bindLimited(spellInput, Core.MAX_SPELL, 'spell-over', 'spell-counter', () => computeSpell());
  function computeSpell() {
    state.spellItems = Core.spell(spellInput.value, { caseMode: state.caseMode, digitMode: state.digitMode });
    renderSpell();
  }
  function readingCell(item) {
    const ja = I18n.lang === 'ja';
    switch (item.type) {
      case 'letter': {
        const prefix = item.letterCase === 'capital' ? t('capitalPrefix') : item.letterCase === 'small' ? t('smallPrefix') : '';
        return [prefix ? E('span', { class: 'case' }, prefix) : null, E('span', { class: 'word', lang: 'en' }, item.word)];
      }
      case 'digit': return [E('span', { class: 'word', lang: 'en' }, item.word)];
      case 'symbol': {
        const name = t('symbol.' + item.symbolId);
        return ja ? [E('span', { class: 'word' }, name), E('span', { class: 'sub', lang: 'en' }, '（' + item.word.toLowerCase() + '）')]
          : [E('span', { class: 'word' }, name)];
      }
      case 'space':
        return ja ? [E('span', { class: 'word' }, t('spaceReading')), E('span', { class: 'sub', lang: 'en' }, '（space）')]
          : [E('span', { class: 'word' }, t('spaceReading'))];
      case 'unnamed': return [E('span', { class: 'word' }, t('unnamedReading')), E('span', { class: 'skip' }, t('skipNote'))];
      default: return [E('span', { class: 'word' }, t('otherReading')), E('span', { class: 'skip' }, t('skipNote'))];
    }
  }
  const TYPE_KEYS = { letter: 'typeLetter', digit: 'typeDigit', symbol: 'typeSymbol', space: 'typeSpace', unnamed: 'typeUnnamed', other: 'typeOther' };
  const PART_KEYS = [['letter', 'partLetter'], ['digit', 'partDigit'], ['symbol', 'partSymbol'], ['space', 'partSpace'],
    ['unnamed', 'partUnnamed'], ['other', 'partOther']];
  function renderSpell() {
    const items = state.spellItems;
    const rows = items.map((item) => E('tr', { 'data-index': item.index },
      E('td', { class: 'num' }, String(item.index + 1)),
      E('td', { class: 'ch' }, E('span', { class: 'chbox', lang: 'en', 'aria-label': item.ch === ' ' ? t('spaceReading') : null },
        item.ch === ' ' ? '␣' : item.ch)),
      E('td', null, readingCell(item)),
      E('td', { class: 'type' }, t(TYPE_KEYS[item.type]))));
    $('spell-body').replaceChildren(...rows);
    $('spell-table').hidden = !items.length;
    $('spell-empty').hidden = items.length > 0;
    I18n.setText($('spell-empty'), t('resultEmpty'));
    const counts = Core.countTypes(items);
    const sep = I18n.lang === 'ja' ? '・' : ', ';
    const parts = PART_KEYS.filter(([type]) => counts[type]).map(([type, key]) => t(counts[type] === 1 ? key + 'One' : key, { n: counts[type] })).join(sep);
    $('spell-summary').textContent = items.length ? t(items.length === 1 ? 'resultSummaryOne' : 'resultSummary', { n: items.length, parts }) : '';
    $('spell-copy-text').textContent = Core.copyLine(items);
    $('spell-copy').disabled = !items.length;
    $('case-note').replaceChildren(words(t(state.caseMode === 'ignore' ? 'caseNoteOff' : 'caseNoteOn')));
    $('digit-note').replaceChildren(words(t(state.digitMode === 'icao' ? 'digitNoteIcao' : 'digitNotePlain')));
    if (!speech.owner || speech.owner.name !== 'spell') setSpellIdle();
    refreshSpeakButtons();
  }
  function setSpellIdle(message) {
    const skipped = state.spellItems.filter((x) => x.spoken === null).length;
    const lines = [message || (state.spellItems.length ? t('spellIdle') : ''), skipped ? t('spellSkipped', { n: skipped }) : '']
      .filter(Boolean).join(' ');
    $('spell-status').replaceChildren(words(lines));
    refreshSpeakButtons();
  }
  function markSpellRow(index) {
    for (const tr of $('spell-body').querySelectorAll('tr.now')) tr.classList.remove('now');
    if (index === null) return;
    const tr = $('spell-body').querySelector('tr[data-index="' + index + '"]');
    if (tr) { tr.classList.add('now'); tr.scrollIntoView({ block: 'nearest' }); }
  }
  $('spell-speak').addEventListener('click', () => {
    speakQueue('spell', Core.speechQueue(state.spellItems), (index) => {
      markSpellRow(index);
      $('spell-status').textContent = t('spellReading', { n: index + 1 });
    }, (reason) => {
      markSpellRow(null);
      setSpellIdle(t(reason === 'finished' ? 'finished' : 'stopped'));
    });
  });
  $('spell-stop').addEventListener('click', () => stopSpeaking());

  // ===== コピー =====
  function copyText(text, sourceEl, statusEl) {
    const done = (ok) => { statusEl.textContent = t(ok ? 'copied' : 'copyFailed'); };
    const fallback = () => {
      try {
        const range = document.createRange();
        range.selectNodeContents(sourceEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        done(document.execCommand('copy'));
      } catch (_) { done(false); }
    };
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(() => done(true), fallback);
    } else fallback();
  }
  $('spell-copy').addEventListener('click', () => copyText(Core.copyLine(state.spellItems), $('spell-copy-text'), $('spell-copy-status')));

  // ===== タブ2：文章から見つける =====
  const findInput = $('find-input');
  const updateFindInput = bindLimited(findInput, Core.MAX_FIND, 'find-over', 'find-counter', () => computeFind());
  $('find-example').addEventListener('click', () => {
    stopSpeaking();
    findInput.value = t('exampleText');
    updateFindInput(true);
  });
  function computeFind() {
    state.findResult = Core.find(findInput.value, { digits: state.findDigits });
    renderFind();
  }
  function renderFind() {
    const r = state.findResult;
    const text = findInput.value;
    const box = $('find-text');
    if (!text) {
      box.replaceChildren(words(t('findEmpty')));
      box.setAttribute('lang', I18n.lang);
    } else {
      box.setAttribute('lang', 'en');
      const parts = [];
      let last = 0;
      r.matches.forEach((m, k) => {
        if (m.start > last) parts.push(text.slice(last, m.start));
        parts.push(E('mark', { class: m.inSequence ? 'seq' : 'single', 'data-k': k }, m.text, E('sup', null, m.char)));
        last = m.end;
      });
      if (last < text.length) parts.push(text.slice(last));
      box.replaceChildren(...parts);
    }
    const seq = r.sequences.reduce((a, s) => a + s.length, 0);
    $('find-count').textContent = text ? (r.matches.length
      ? t(r.matches.length === 1 ? 'foundCountOne' : 'foundCount', { n: r.matches.length, seq, single: r.singles.length }) : t('noneFound')) : '';
    const decoded = [];
    r.sequences.forEach((s, n) => {
      if (n) decoded.push(E('span', { class: 'gap', 'aria-hidden': 'true' }));
      for (const k of s) decoded.push(E('span', { class: 'decoded-item', 'data-k': k }, E('b', null, r.matches[k].char), E('small', null, r.matches[k].text)));
    });
    if (!decoded.length) decoded.push(words(t('decodedEmpty')));
    $('decoded').replaceChildren(...decoded);
    $('decoded-line').textContent = r.decoded;
    $('decoded-line').hidden = !r.decoded;
    $('find-copy').disabled = !r.decoded;
    const singles = r.singles.map((k) => E('li', null, t('singleItem', { word: r.matches[k].text.replace(/\s+/g, ' '), ch: r.matches[k].char })));
    $('singles').replaceChildren(...(singles.length ? singles : [E('li', { class: 'empty' }, t('singlesEmpty'))]));
    const rows = r.variants.map((v) => E('tr', null, E('td', null, v.text),
      E('td', null, v.variant === 'icao' ? words(t('variantIcao', { word: v.canon })) : v.canon), E('td', null, v.char)));
    $('variants-body').replaceChildren(...rows);
    $('variants-table').hidden = !rows.length;
    $('variants-empty').hidden = rows.length > 0;
    $('variants-empty').textContent = t('variantsEmpty');
    if (!speech.owner || speech.owner.name !== 'find') setFindIdle();
    refreshSpeakButtons();
  }
  function setFindIdle(message) {
    const r = state.findResult;
    $('find-status').replaceChildren(words(message || (r && r.sequences.length ? t('findIdle') : '')));
    refreshSpeakButtons();
  }
  function markFind(k) {
    for (const el of document.querySelectorAll('#find-text mark.now, #decoded .now')) el.classList.remove('now');
    if (k === null) return;
    for (const el of document.querySelectorAll('#find-text mark[data-k="' + k + '"], #decoded [data-k="' + k + '"]')) el.classList.add('now');
  }
  $('find-speak').addEventListener('click', () => {
    speakQueue('find', Core.findQueue(state.findResult), (k, n) => {
      markFind(k);
      $('find-status').textContent = t('findReading', { n });
    }, (reason) => {
      markFind(null);
      setFindIdle(t(reason === 'finished' ? 'finished' : 'stopped'));
    });
  });
  $('find-stop').addEventListener('click', () => stopSpeaking());
  $('find-copy').addEventListener('click', () => copyText(state.findResult.decoded, $('decoded-line'), $('find-copy-status')));

  // ===== タブ3：一覧と座学 =====
  function card(ch, word, kana, icao) {
    const button = E('button', { class: 'letter-card', type: 'button', 'data-word': word, lang: 'en',
      'aria-label': t('cardSpeak', { ch, word }) },
    E('span', { class: 'lt', 'aria-hidden': 'true' }, ch), E('span', { class: 'spk', 'aria-hidden': 'true' }, '▶'),
    E('span', { class: 'sp', 'aria-hidden': 'true' }, word), E('span', { class: 'kn', lang: 'ja', 'aria-hidden': 'true' }, kana),
    icao ? E('span', { class: 'ic', 'aria-hidden': 'true' }, E('span', { lang: I18n.lang }, t('icaoLabel')), E('br'), E('b', null, icao)) : null);
    button.addEventListener('click', () => speakCard(button, word));
    return button;
  }
  function renderReference() {
    $('letter-grid').replaceChildren(...Core.LETTERS.map((l) => card(l.ch, l.word, l.kana, null)));
    $('digit-grid').replaceChildren(...Core.DIGITS.map((d) => card(d.ch, d.word, d.kana, d.icao)));
    $('ref-status').textContent = '';
  }
  function speakCard(button, word) {
    const problem = voiceProblem();
    if (problem || speech.status !== 'ready') { $('ref-status').textContent = problem || t('noVoice'); return; }
    speakQueue('reference', [{ index: 0, text: Core.speechText(word) }], () => {
      button.classList.add('now');
      $('ref-status').textContent = t('refReading', { word });
    }, () => {
      button.classList.remove('now');
      $('ref-status').textContent = '';
    });
  }

  // ===== 言語を替えたときは描き直すだけ（計算し直さない） =====
  function renderAll() {
    renderThemeButton();
    renderSpell();
    renderFind();
    renderReference();
    $('spell-counter').textContent = t('counter', { n: Core.formatNumber(Core.clampText(spellInput.value, Core.MAX_SPELL).length),
      max: Core.formatNumber(Core.MAX_SPELL) });
    $('find-counter').textContent = t('counter', { n: Core.formatNumber(Core.clampText(findInput.value, Core.MAX_FIND).length),
      max: Core.formatNumber(Core.MAX_FIND) });
    for (const id of ['spell-over', 'find-over']) {
      if (!$(id).hidden) $(id).textContent = t('overLimit', { max: Core.formatNumber(id === 'spell-over' ? Core.MAX_SPELL : Core.MAX_FIND) });
    }
  }
  I18n.onChange(() => { stopSpeaking(); renderAll(); });

  // ===== 開始 =====
  I18n.init(document);
  syncIntro();
  updateSpellInput(false);
  updateFindInput(false);
  renderAll();
  selectTab(tabFromHash());
  initVoices();
  // 読み上げ中にページを離れたら止める
  window.addEventListener('pagehide', () => { if (speech.synth) speech.synth.cancel(); });
}());
