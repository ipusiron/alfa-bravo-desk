'use strict';
// 配色：文字と背景の組が、明るい画面と暗い画面の両方でコントラスト比4.5以上（style.css の色の値から計算する）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

function block(selector) {
  const at = css.indexOf(selector + ' {');
  assert.ok(at >= 0, selector);
  const body = css.slice(at, css.indexOf('}', at));
  return Object.fromEntries([...body.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]));
}
const light = block(':root');
const dark = { ...light, ...block(':root[data-theme="dark"]') };
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
// 文字の色と背景の色の組（声についての知らせの帯・本文・注記・選んだボタン・警告・印の文字）
const PAIRS = [['notice-ink', 'notice-bg'], ['ink', 'bg'], ['ink', 'paper'], ['muted', 'paper'], ['muted', 'bg'], ['on-accent', 'accent'],
  ['accent', 'paper'], ['accent', 'bg'], ['warn', 'paper'], ['warn', 'bg'], ['ink', 'mark'], ['ink', 'now']];

test('文字と背景のコントラスト比が、明るい画面と暗い画面の両方で4.5以上', () => {
  for (const [name, colors] of [['light', light], ['dark', dark]]) {
    for (const [fg, bg] of PAIRS) {
      assert.ok(colors[fg] && colors[bg], `${name}: ${fg} ${bg}`);
      const r = ratio(colors[fg], colors[bg]);
      assert.ok(r >= 4.5, `${name}: ${fg} on ${bg} = ${r.toFixed(2)}`);
    }
  }
});
