/* Alfa Bravo Desk - MIT (c) 2026 ipusiron. */
// 描画の前に明暗を決める（保存した選択 → 端末の設定）。初回は保存しない。想定外の保存値は無視する。
(function (global) {
  'use strict';
  let saved = null;
  try {
    saved = global.localStorage.getItem('alfa-bravo-desk.theme');
  } catch (_) { /* 保存は使えなくてもよい */ }
  const prefersDark = typeof global.matchMedia === 'function'
    && global.matchMedia('(prefers-color-scheme: dark)').matches;
  global.document.documentElement.dataset.theme = ['light', 'dark'].includes(saved)
    ? saved : (prefersDark ? 'dark' : 'light');
}(typeof window !== 'undefined' ? window : globalThis));
