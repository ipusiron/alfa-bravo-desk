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
    letterSpelling: 'official',
    sayCase: true,
    findDigits: true,
    findMode: 'auto',
    undo: null,
    speed: 'normal',
    spellItems: [],
    findResult: null,
  };

  // ===== 読み上げ =====
  const speech = {
    synth: ('speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function') ? window.speechSynthesis : null,
    voice: null,
    status: 'pending', // pending | ready | none | unsupported
    kind: null, // 選んだ声の言語：en | ja | other
    session: 0,
    timer: null,
    owner: null,
    current: null,
  };

  function updateVoice() {
    if (!speech.synth) { speech.status = 'unsupported'; return; }
    const voice = Core.pickVoice(speech.synth.getVoices());
    if (voice) { speech.voice = voice; speech.kind = Core.voiceKind(voice); speech.status = 'ready'; }
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
  // 声についての知らせ（なければ null）：英語以外の声で読むとき・声がないとき・読み上げに対応していないとき
  function voiceNotice() {
    if (speech.status === 'unsupported') return { key: 'noSpeech', howTo: false };
    if (speech.status === 'none') return { key: 'noVoice', howTo: true };
    if (speech.status === 'ready' && speech.kind === 'ja') return { key: 'voiceJa', howTo: true };
    if (speech.status === 'ready' && speech.kind === 'other') return { key: 'voiceOther', howTo: true };
    return null;
  }
  // 3つのタブの知らせの帯を同じ中身にする
  function renderVoiceNotices() {
    const notice = voiceNotice();
    for (const id of ['spell-voice-note', 'find-voice-note', 'ref-voice-note']) {
      const box = $(id);
      box.hidden = !notice;
      if (!notice) { box.replaceChildren(); continue; }
      box.replaceChildren(E('span', { class: 'notice-label' }, t('noticeLabel')),
        E('span', { class: 'notice-text' }, words(t(notice.key)), notice.howTo ? E('span', { class: 'notice-howto' }, words(t('voiceHowTo'))) : null));
    }
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
    renderVoiceNotices();
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

  // ===== ヘルプ（<dialog>）：開くと中へフォーカスが移り、Esc・「閉じる」・外側の暗い所で閉じる。閉じたらヘルプのボタンへ戻る =====
  const helpDialog = $('help-dialog');
  $('help').addEventListener('click', () => {
    if (helpDialog.open) return;
    document.documentElement.classList.add('dialog-open'); // 開いている間は後ろをスクロールさせない
    helpDialog.showModal();
    $('help-close').focus();
  });
  // 閉じる：後ろのスクロールを戻し、フォーカスをヘルプのボタンへ戻す（close の知らせを待たずにその場で行う。ブラウザーによって知らせが遅れるため）
  function closeHelp(focusHelp = true) {
    document.documentElement.classList.remove('dialog-open');
    if (helpDialog.open) helpDialog.close();
    if (focusHelp) $('help').focus();
  }
  $('help-close').addEventListener('click', () => closeHelp());
  helpDialog.addEventListener('click', (event) => { if (event.target === helpDialog) closeHelp(); });
  helpDialog.addEventListener('cancel', (event) => { event.preventDefault(); closeHelp(); }); // Esc
  helpDialog.addEventListener('close', () => document.documentElement.classList.remove('dialog-open'));
  for (const button of document.querySelectorAll('.help-go')) {
    button.addEventListener('click', () => {
      closeHelp(false);
      selectTab(button.dataset.go, true);
      $('tab-' + button.dataset.go).scrollIntoView({ block: 'nearest' });
    });
  }
  function renderHelp() {
    const names = { spell: 'tabSpell', find: 'tabFind', reference: 'tabReference' };
    for (const button of document.querySelectorAll('.help-go')) I18n.setText(button, t('helpGo', { tab: t(names[button.dataset.go]) }));
  }

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
  bindPair('spelling-official', 'spelling-common', (official) => {
    state.letterSpelling = official ? 'official' : 'common';
    stopSpeaking();
    computeSpell();
  });
  const digitButtons = [...document.querySelectorAll('[data-digit]')];
  for (const b of digitButtons) {
    b.addEventListener('click', () => {
      setPressed(digitButtons, b);
      state.digitMode = b.dataset.digit;
      stopSpeaking();
      computeSpell();
    });
  }
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
    state.spellItems = Core.spell(spellInput.value, { caseMode: state.caseMode, digitMode: state.digitMode, letterSpelling: state.letterSpelling });
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
    stackNote($('case-note'), ['caseNoteOn', 'caseNoteOff'], state.caseMode === 'ignore' ? 'caseNoteOff' : 'caseNoteOn');
    stackNote($('spelling-note'), ['spellingNoteOfficial', 'spellingNoteCommon'],
      state.letterSpelling === 'common' ? 'spellingNoteCommon' : 'spellingNoteOfficial');
    stackNote($('digit-note'), ['digitNotePlain', 'digitNoteIcao', 'digitNoteIcaoPlain'],
      { plain: 'digitNotePlain', icao: 'digitNoteIcao', icaoPlain: 'digitNoteIcaoPlain' }[state.digitMode]);
    renderSayCase();
    if (!speech.owner || speech.owner.name !== 'spell') setSpellIdle();
    refreshSpeakButtons();
  }
  // 読み上げで大文字・小文字も言うかのスイッチ。表で区別しないときは、言うものがないので押せない
  function renderSayCase() {
    const button = $('say-case');
    const usable = state.caseMode !== 'ignore';
    button.disabled = !usable;
    button.setAttribute('aria-checked', state.sayCase ? 'true' : 'false');
    $('say-case-state').textContent = t(state.sayCase ? 'switchOn' : 'switchOff');
    stackNote($('say-case-note'), ['sayCaseNoteOn', 'sayCaseNoteOff'], usable ? 'sayCaseNoteOn' : 'sayCaseNoteOff');
  }
  $('say-case').addEventListener('click', () => {
    state.sayCase = !state.sayCase;
    stopSpeaking();
    renderSayCase();
  });
  // 切り替えの下の説明：選べる文をすべて同じ場所に重ね、選んだ文だけを見せる（高さは長い文に合わせて変わらない）
  function stackNote(el, keys, active) {
    el.replaceChildren(...keys.map((key) => {
      const span = words(t(key));
      span.className = key === active ? 'on' : 'off';
      if (key !== active) span.setAttribute('aria-hidden', 'true');
      return span;
    }));
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
    speakQueue('spell', Core.speechQueue(state.spellItems, { sayCase: state.sayCase }), (index) => {
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
  function putFindText(text, status) {
    stopSpeaking();
    findInput.value = text;
    updateFindInput(true);
    $('remove-status').textContent = status || '';
  }
  $('find-example').addEventListener('click', () => { state.undo = null; putFindText(t('exampleText')); });
  $('find-example-joined').addEventListener('click', () => { state.undo = null; putFindText(t('exampleJoinedText')); });
  // 空白・改行を消す（1段だけ元に戻せる）。手で書き換えたら、元に戻す先は捨てる
  $('remove-spaces').addEventListener('click', () => {
    const r = Core.removeSpaces(findInput.value);
    state.undo = findInput.value;
    putFindText(r.text, t('removedSpaces', { n: Core.formatNumber(r.count) }));
  });
  $('remove-breaks').addEventListener('click', () => {
    const r = Core.removeLineBreaks(findInput.value);
    state.undo = findInput.value;
    putFindText(r.text, t('removedBreaks', { n: Core.formatNumber(r.count) }));
  });
  $('undo-remove').addEventListener('click', () => {
    const previous = state.undo;
    state.undo = null;
    if (previous !== null) putFindText(previous, t('undone'));
  });
  findInput.addEventListener('input', () => { state.undo = null; $('remove-status').textContent = ''; refreshTidyButtons(); });
  function refreshTidyButtons() {
    $('remove-spaces').disabled = Core.removeSpaces(findInput.value).count === 0;
    $('remove-breaks').disabled = Core.removeLineBreaks(findInput.value).count === 0;
    $('undo-remove').disabled = state.undo === null;
  }
  const modeButtons = [...document.querySelectorAll('[data-findmode]')];
  for (const b of modeButtons) {
    b.addEventListener('click', () => {
      setPressed(modeButtons, b);
      state.findMode = b.dataset.findmode;
      stopSpeaking();
      computeFind();
    });
  }
  function computeFind() {
    state.findResult = Core.find(findInput.value, { digits: state.findDigits, mode: state.findMode });
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
      const spans = r.parts.map((p) => (p.kind === 'word' ? { ...r.matches[p.k], k: p.k } : { ...r.unread[p.u], unread: true }));
      for (const m of spans) {
        if (m.start > last) parts.push(text.slice(last, m.start));
        parts.push(m.unread ? E('mark', { class: 'unread' }, m.text, E('sup', null, '?'))
          : E('mark', { class: m.inSequence ? 'seq' : 'single', 'data-k': m.k }, m.text, E('sup', null, m.char)));
        last = m.end;
      }
      if (last < text.length) parts.push(text.slice(last));
      box.replaceChildren(...parts);
    }
    const seq = r.sequences.reduce((a, s) => a + s.length, 0);
    const joined = r.mode === 'joined';
    const countLine = joined ? t('foundCountJoined', { n: r.matches.length, m: r.unread.length })
      : t(r.matches.length === 1 ? 'foundCountOne' : 'foundCount', { n: r.matches.length, seq, single: r.singles.length });
    $('find-count').textContent = text ? (r.matches.length || r.unread.length ? countLine : t('noneFound')) : '';
    const modeKey = joined ? (r.auto ? 'modeJoinedAuto' : 'modeJoined')
      : (r.auto ? 'modeWordsAuto' : 'modeWords') + (r.splitTokens ? 'Split' : '');
    $('find-mode-line').replaceChildren(text ? words(t(modeKey, { n: r.splitTokens })) : '');
    // 区切って読んだ語は、あいだの空白・改行を除いた英字だけで示す
    const shownOf = (m) => (m.split ? m.text.replace(/[^A-Za-z]/g, '') : m.text.replace(/\s+/g, ' '));
    const decoded = [];
    r.runParts.forEach((run, n) => {
      if (n) decoded.push(E('span', { class: 'gap', 'aria-hidden': 'true' }));
      for (const p of run) {
        decoded.push(p.kind === 'word'
          ? E('span', { class: 'decoded-item', 'data-k': p.k }, E('b', null, r.matches[p.k].char), E('small', null, shownOf(r.matches[p.k])))
          : E('span', { class: 'decoded-item unread' }, E('b', null, '?'), E('small', null, r.unread[p.u].text.replace(/[^A-Za-z]/g, ''))));
      }
    });
    if (!decoded.length) decoded.push(words(t('decodedEmpty')));
    $('decoded').replaceChildren(...decoded);
    $('decoded-line').textContent = r.decoded;
    $('decoded-line').hidden = !r.decoded;
    $('find-copy').disabled = !r.decoded;
    const singles = r.singles.map((k) => E('li', null, t('singleItem', { word: r.matches[k].text.replace(/\s+/g, ' '), ch: r.matches[k].char })));
    $('singles').replaceChildren(...(singles.length ? singles : [E('li', { class: 'empty' }, t('singlesEmpty'))]));
    $('singles-block').hidden = joined;
    $('unread-block').hidden = !joined && !r.unread.length;
    const unread = r.unread.map((u) => E('li', null, t('unreadItem', { text: u.text.replace(/[^A-Za-z]/g, ''), n: u.letters })));
    $('unread').replaceChildren(...(unread.length ? unread : [E('li', { class: 'empty' }, t('unreadEmpty'))]));
    refreshTidyButtons();
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
  function card(ch, word, kana, icao, alt) {
    const button = E('button', { class: 'letter-card', type: 'button', 'data-word': word, lang: 'en',
      'aria-label': t('cardSpeak', { ch, word }) },
    E('span', { class: 'lt', 'aria-hidden': 'true' }, ch), E('span', { class: 'spk', 'aria-hidden': 'true' }, '▶'),
    E('span', { class: 'sp', 'aria-hidden': 'true' }, word), E('span', { class: 'kn', lang: 'ja', 'aria-hidden': 'true' }, kana),
    icao ? E('span', { class: 'ic', 'aria-hidden': 'true' }, E('span', { lang: I18n.lang }, t('icaoLabel')), E('br'), E('b', null, icao))
      : alt ? E('span', { class: 'ic', 'aria-hidden': 'true' }, E('span', { lang: I18n.lang }, t('altLabel')), E('br'), E('b', null, alt))
        : E('span', { class: 'ic', 'aria-hidden': 'true' }, '\u00a0', E('br'), '\u00a0'));
    button.addEventListener('click', () => speakCard(button, word));
    return button;
  }
  function renderReference() {
    $('letter-grid').replaceChildren(...Core.LETTERS.map((l) => card(l.ch, l.word, l.kana, null, l.alt)));
    $('digit-grid').replaceChildren(...Core.DIGITS.map((d) => card(d.ch, d.word, d.kana, d.icao, null)));
    $('ref-status').textContent = '';
  }
  function speakCard(button, word) {
    if (speech.status !== 'ready') { $('ref-status').textContent = t(speech.status === 'unsupported' ? 'noSpeech' : 'noVoice'); return; }
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
    renderHelp();
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
  updateSpellInput(false);
  updateFindInput(false);
  renderAll();
  selectTab(tabFromHash());
  initVoices();
  // 読み上げ中にページを離れたら止める
  window.addEventListener('pagehide', () => { if (speech.synth) speech.synth.cancel(); });
}());
