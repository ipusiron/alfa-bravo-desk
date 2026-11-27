/* Alfa Bravo Desk - MIT (c) 2026 ipusiron. */
// 言語の選択と、HTML に書いた静的な文言（data-i18n・data-i18n-attr）の差し替え。
// 日本語の文は AbdCore.phrases で語の切れ目に <wbr> を入れる（style.css の word-break: keep-all と組で、語の途中で折り返さない）。
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./messages.js'), require('./abd-core.js'));
  else root.AbdI18n = factory(root.AbdMessages, root.AbdCore);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Messages, Core) {
  'use strict';
  const STORAGE_KEY = 'alfa-bravo-desk.lang';

  // ?lang= → 保存した選択 → ブラウザーの言語（ja で始まれば日本語、ほかは英語）
  function detectLanguage(search, stored, navigatorLanguage) {
    const q = new URLSearchParams(search || '').get('lang');
    if (Messages.LANGS.includes(q)) return q;
    if (Messages.LANGS.includes(stored)) return stored;
    return String(navigatorLanguage || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
  }

  function readStored() {
    try { return globalThis.localStorage.getItem(STORAGE_KEY); } catch (_) { return null; }
  }
  function store(lang) {
    try { globalThis.localStorage.setItem(STORAGE_KEY, lang); } catch (_) { /* 保存できない環境では、そのページの間だけ切り替える */ }
  }

  // 文を要素へ入れる（HTML として解釈しない）
  function setText(el, text) {
    const doc = el.ownerDocument;
    const parts = [];
    Core.phrases(text).forEach((piece, i) => {
      if (i) parts.push(doc.createElement('wbr'));
      parts.push(doc.createTextNode(piece));
    });
    el.replaceChildren(...parts);
  }

  const listeners = [];
  const api = {
    lang: 'ja',
    STORAGE_KEY,
    detectLanguage,
    setText,
    t(key, vars) { return Messages.t(key, vars, api.lang); },
    applyStatic(doc) {
      for (const el of doc.querySelectorAll('[data-i18n]')) setText(el, api.t(el.dataset.i18n));
      for (const el of doc.querySelectorAll('[data-i18n-attr]')) {
        for (const pair of el.dataset.i18nAttr.split(';')) {
          const [attr, key] = pair.split(':');
          if (attr && key) el.setAttribute(attr.trim(), api.t(key.trim()));
        }
      }
      doc.documentElement.lang = api.lang;
    },
    init(doc) {
      api.lang = detectLanguage(globalThis.location.search, readStored(), globalThis.navigator.language);
      api.applyStatic(doc);
    },
    set(doc, lang) {
      if (!Messages.LANGS.includes(lang)) return;
      api.lang = lang;
      store(lang);
      api.applyStatic(doc);
      for (const fn of listeners) fn(lang);
    },
    onChange(fn) { listeners.push(fn); },
  };
  return api;
}));
