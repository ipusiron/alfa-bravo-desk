'use strict';
// index.html とスクリプトの構造：CSP・読み込みの順・タブとパネル・外部リンク・送信と保存をしない・HTML として解釈しない・手元の印を書かない
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
  + "base-uri 'none'; form-action 'none'; frame-src 'none'; object-src 'none'; connect-src 'none'";
const SCRIPTS = ['theme-init.js', 'js/abd-core.js', 'js/messages.js', 'js/i18n.js', 'app.js'];
const CODE = ['app.js', 'theme-init.js', 'js/abd-core.js', 'js/messages.js', 'js/i18n.js'];

test('厳しい CSP・referrer・アイコン・noscript・インラインのコードなし', () => {
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy"
    content="${CSP}">`));
  assert.doesNotMatch(html, /frame-ancestors/);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
  assert.match(html, /<link rel="icon" href="data:,">/);
  assert.match(html, /<noscript>[^<]+<\/noscript>/);
  assert.match(html, /<title>Alfa Bravo Desk<\/title>/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/, 'no inline script');
  assert.doesNotMatch(html, /<script[^>]*\btype=/, 'classic scripts only (file:// で動くように)');
  assert.doesNotMatch(html, /<style\b|\sstyle=/, 'no inline style');
  assert.doesNotMatch(html, /\son[a-z]+=/i, 'no inline event handlers');
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]), SCRIPTS);
});

test('タブ3つ（spell・find・reference）と、それぞれのパネル', () => {
  const tabs = ['spell', 'find', 'reference'];
  assert.deepEqual([...html.matchAll(/<button\s+id="tab-([a-z]+)" class="tab" type="button" role="tab"/g)].map((m) => m[1]), tabs);
  assert.deepEqual([...html.matchAll(/<section id="panel-([a-z]+)" class="panel" role="tabpanel" aria-labelledby="tab-\1"/g)].map((m) => m[1]), tabs);
  for (const id of ['spell-input', 'spell-body', 'spell-speak', 'spell-stop', 'spell-copy', 'find-input', 'find-text', 'decoded', 'decoded-line',
    'find-speak', 'find-stop', 'find-copy', 'find-example', 'singles', 'variants-body', 'letter-grid', 'digit-grid', 'theme', 'language', 'intro-more']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  // 止めるボタンは、読んでいないときは押せない
  assert.match(html, /<button id="spell-stop" type="button" data-i18n="stop" disabled>/);
  assert.match(html, /<button id="find-stop" type="button" data-i18n="stop" disabled>/);
  assert.equal((html.match(/class="study-card"/g) || []).length, 6);
});

test('外部リンクはすべて別タブ・opener なし。フッターに GitHub のリンク', () => {
  const links = [...html.matchAll(/<a [^>]*href="(https?:[^"]+)"[^>]*>/g)];
  assert.ok(links.length >= 7);
  for (const m of links) assert.match(m[0], /target="_blank" rel="noopener noreferrer"/, m[1]);
  assert.match(html, /href="https:\/\/github.com\/ipusiron\/alfa-bravo-desk"[^>]*data-i18n="githubLink"/);
  assert.doesNotMatch(html, /cypher/i);
});

test('スクリプト：HTML として解釈しない・送信しない・乱数を使わない・保存は言語と明暗だけ', () => {
  for (const file of CODE) {
    const src = read(file).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(src, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, file);
    assert.doesNotMatch(src, /\.style\b/, file);
    assert.doesNotMatch(src, /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource/, file);
    assert.doesNotMatch(src, /Math\.random/, file);
    assert.doesNotMatch(src, /\beval\(|new Function/, file);
    assert.doesNotMatch(src, /sessionStorage|indexedDB|document\.cookie/, file);
  }
  const keys = CODE.flatMap((file) => [...read(file).matchAll(/'(alfa-bravo-desk\.[a-z]+)'/g)].map((m) => m[1]));
  assert.deepEqual([...new Set(keys)].sort(), ['alfa-bravo-desk.lang', 'alfa-bravo-desk.theme']);
});

test('公開する文書に手元のパスや作業の印を書かない', () => {
  const files = [...CODE, 'index.html', 'style.css', 'README.md', 'package.json', ...fs.readdirSync(path.join(root, 'test')).map((f) => 'test/' + f)];
  const marks = /(?<![A-Za-z])[A-Z]:[\\/]|ipusiron-work|scratchpad|\btmp\/|試作|プロトタイプ|渚|作者|本人/;
  for (const file of files) {
    const lines = read(file).split('\n').filter((line) => !line.includes('const marks ='));
    for (const line of lines) assert.doesNotMatch(line, marks, `${file}: ${line}`);
  }
});

test('明暗の初期化：保存した値か端末の設定で、描画の前に決める', () => {
  const src = read('theme-init.js');
  assert.match(src, /'alfa-bravo-desk\.theme'/);
  assert.match(src, /prefers-color-scheme: dark/);
  assert.doesNotMatch(src, /setItem/, '初回は保存しない');
  assert.ok(html.indexOf('href="style.css"') < html.indexOf('src="theme-init.js"'));
});
