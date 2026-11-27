'use strict';
// README（日英）：YAML の構造と値・見出しの順と対応・例の値を計算部で出し直す・画像の実在と大きさ・ツリー・使わない語・手元の印
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../js/abd-core.js');
const M = require('../js/messages.js');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const ja = read('README.md');
const en = read('README.en.md');
const html = read('index.html');

const yaml = ja.slice(ja.indexOf('<!--\n---\n') + 9, ja.indexOf('\n---\n-->'));
const value = (key) => (yaml.match(new RegExp(`^${key}: "?(.*?)"?$`, 'm')) || [])[1];
const list = (key) => {
  const at = yaml.indexOf(`\n${key}:\n`);
  assert.ok(at >= 0, key);
  const items = [];
  for (const line of yaml.slice(at + key.length + 3).split('\n')) {
    if (!line.startsWith('  - ')) break;
    items.push(line.slice(4));
  }
  return items;
};

test('YAML：HTMLコメントの中に置き、id・slug・URL・hub の値、カテゴリーとタグはブロック形式', () => {
  assert.ok(ja.startsWith('<!--\n---\nid: day129\nslug: alfa-bravo-desk\n'));
  assert.equal(value('title'), 'Alfa Bravo Desk');
  assert.equal(value('repo_url'), 'https://github.com/ipusiron/alfa-bravo-desk');
  assert.equal(value('demo_url'), 'https://ipusiron.github.io/alfa-bravo-desk/');
  assert.equal(value('hub'), 'true');
  assert.equal(value('difficulty'), '1');
  assert.deepEqual(list('category_ja'), ['通信技術', '符号化', '学習支援']);
  assert.deepEqual(list('category_en'), ['Communication Technologies', 'Encoding', 'Learning Support']);
  assert.ok(list('tags').includes('nato-phonetic-alphabet'));
  assert.ok(list('tags').length >= 5);
  for (const key of ['subtitle_ja', 'subtitle_en', 'description_ja', 'description_en']) assert.ok(value(key), key);
  // 英語の副題と説明に NATO phonetic alphabet を入れる。日本語の副題は画面の副題と同じ
  assert.match(value('subtitle_en'), /NATO phonetic alphabet/);
  assert.match(value('description_en'), /NATO phonetic alphabet/);
  assert.equal(value('subtitle_ja'), M.ja.subtitle);
  assert.equal(value('subtitle_en'), M.en.subtitle);
  assert.doesNotMatch(en, /<!--\n---/, 'YAML is only in README.md');
});

test('OGP とページの説明は description_ja と同じ', () => {
  const desc = value('description_ja');
  assert.ok(html.includes(`<meta name="description" content="${desc}">`));
  assert.ok(html.includes(`<meta property="og:description" content="${desc}">`));
  assert.ok(html.includes('<meta property="og:title" content="Alfa Bravo Desk">'));
  assert.ok(html.includes('<meta property="og:url" content="https://ipusiron.github.io/alfa-bravo-desk/">'));
  assert.ok(html.includes('<meta property="og:image" content="https://ipusiron.github.io/alfa-bravo-desk/assets/screenshot.png">'));
  assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'));
});

const HEADINGS = [
  ['🌐 デモページ', '🌐 Demo'], ['📸 スクリーンショット', '📸 Screenshots'], ['✨ 機能', '✨ Features'], ['📖 使い方', '📖 How to use'],
  ['🎯 ユースケース', '🎯 Use cases'], ['🔬 技術的な説明', '🔬 Technical notes'], ['🔒 セキュリティ', '🔒 Security'], ['🔗 参考', '🔗 References'],
  ['🧪 テスト', '🧪 Tests'], ['📁 ディレクトリー構造', '📁 Directory structure'], ['💻 動作環境', '💻 Requirements'], ['📄 ライセンス', '📄 License'],
  ['🛠️ このツールについて', '🛠️ About this tool'],
];
const headings = (text, level) => [...text.replace(/```[\s\S]*?```/g, '').matchAll(new RegExp(`^${level} (.+)$`, 'gm'))].map((m) => m[1]);

test('見出し：シリーズの順で、日英が同じ数・同じ順', () => {
  assert.deepEqual(headings(ja, '##'), HEADINGS.map((h) => h[0]));
  assert.deepEqual(headings(en, '##'), HEADINGS.map((h) => h[1]));
  assert.deepEqual(headings(ja, '###'), ['このツールならではの使い方', 'ほかの使い方', '限界']);
  assert.deepEqual(headings(en, '###'), ['Ways of using this tool in particular', 'Other uses', 'Limits']);
  assert.equal(headings(ja, '#').length, 1);
  assert.equal(headings(en, '#').length, 1);
  assert.match(ja, /^# Alfa Bravo Desk - 聞き違えない綴りの伝え方を、読み上げて確かめる通話表ツール$/m);
  assert.match(ja, /^\*\*Day129 - 生成AIで作るセキュリティツール200\*\*$/m);
  assert.match(en, /^\*\*Day129 - 200 Security Tools with Generative AI\*\*$/m);
  assert.ok(en.startsWith('English · [日本語](README.md)\n'));
  assert.ok(ja.includes('[English](README.en.md) · 日本語'));
  assert.ok(ja.includes('https://akademeia.info/?page_id=44607') && en.includes('https://akademeia.info/?page_id=44607'));
  assert.ok(ja.includes('(https://hackinglab.online/#day129)'));
  assert.ok(en.includes('(https://hackinglab.online/?lang=en#day129)'));
  assert.doesNotMatch(ja + en, /\?ref=/);
});

test('例の値：このツールならではの使い方の値を、計算部で出し直して日英とも照らし合わせる', () => {
  const values = [
    C.copyLine(C.spell('Rx9-Lp')),
    C.copyLine(C.spell('O0l1')),
    C.find(M.ja.exampleJoinedText).decoded,
    ...C.DIGIT_MODES.map((digitMode) => C.copyLine(C.spell('3159', { digitMode }))),
  ];
  assert.deepEqual(values, ['Capital Romeo, Small X-ray, Nine, Hyphen, Capital Lima, Small Papa', 'Capital Oscar, Zero, Small Lima, One',
    'SECRET?KEY?', 'Three, One, Five, Nine', 'Tree, Wun, Fife, Niner', 'Tree, One, Fife, Niner']);
  for (const v of values) {
    assert.ok(ja.includes('`' + v + '`'), `ja: ${v}`);
    assert.ok(en.includes('`' + v + '`'), `en: ${v}`);
  }
  // 機能の欄の数（上限・記号・速さ・間）
  assert.ok(ja.includes(`（${C.MAX_SPELL}文字まで）`) && ja.includes(`（${C.formatNumber(C.MAX_FIND)}文字まで）`));
  assert.ok(ja.includes(C.SYMBOLS.map((s) => s.ch).join(' ')) && en.includes(C.SYMBOLS.map((s) => s.ch).join(' ')));
  assert.ok(ja.includes(`${C.SYMBOLS.length}個`));
  assert.ok(ja.includes(`ふつう${C.GAP_MS.normal}ミリ秒・ゆっくり${C.GAP_MS.slow}ミリ秒`));
  assert.ok(en.includes(`${C.GAP_MS.normal} ms at Normal and ${C.GAP_MS.slow} ms at Slow`));
  assert.ok(ja.includes(`割合が${C.AUTO_JOINED_MIN}以上`) && ja.includes(`${C.AUTO_JOINED_MARGIN}以上多ければ`));
  assert.ok(ja.includes(`英字の並びとして${C.AUTO_JOINED_MIN_WHEN_NONE}以上読めれば`));
  assert.ok(en.includes(`at least ${C.AUTO_JOINED_MIN_WHEN_NONE} of its letters`));
  assert.ok(ja.includes(`${C.LONG_TOKEN}文字以上のまとまりで${C.LONG_TOKEN_MIN * 10}割以上`));
});

// PNG の幅と高さ（IHDR）
function pngSize(file) {
  const b = fs.readFileSync(path.join(root, file));
  assert.equal(b.toString('latin1', 1, 4), 'PNG', file);
  return [b.readUInt32BE(16), b.readUInt32BE(20), b.length];
}

test('画像：README から参照する画像はすべて実在し、幅808px・300KB以下。assets の画像はどれも参照されている', () => {
  const refs = (text) => [...text.matchAll(/!\[[^\]]*\]\((assets\/[^)]+)\)/g)].map((m) => m[1]);
  const jaRefs = refs(ja);
  const enRefs = refs(en);
  assert.equal(jaRefs.length, 6);
  assert.deepEqual(enRefs, jaRefs.map((r) => r.replace('assets/', 'assets/en/')));
  for (const ref of [...jaRefs, ...enRefs]) {
    assert.ok(fs.existsSync(path.join(root, ref)), ref);
    const [w, h, bytes] = pngSize(ref);
    assert.equal(w, 808, ref);
    assert.ok(h <= 1100 && bytes <= 300000, `${ref}: ${h} ${bytes}`);
  }
  for (const dir of ['assets', 'assets/en']) {
    for (const f of fs.readdirSync(path.join(root, dir)).filter((x) => x.endsWith('.png'))) {
      assert.ok([...jaRefs, ...enRefs].includes(`${dir}/${f}`), `${dir}/${f} is not referenced`);
    }
  }
  // キャプションは画像ごとに1行（> *…*）
  assert.equal((ja.match(/^> \*.+\*$/gm) || []).length, 6);
  assert.equal((en.match(/^> \*.+\*$/gm) || []).length, 6);
});

test('ディレクトリー構造：リポジトリーのファイルがすべて載り、どの行にも説明がある（日英）', () => {
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((d) => {
    const rel = dir ? `${dir}/${d.name}` : d.name;
    if (d.name === '.git' || d.name === 'node_modules') return [];
    return d.isDirectory() ? walk(rel) : [rel];
  });
  for (const text of [ja, en]) {
    const tree = text.slice(text.indexOf('```text\nalfa-bravo-desk/'), text.indexOf('```', text.indexOf('```text\nalfa-bravo-desk/') + 7));
    const lines = tree.split('\n').slice(1).filter(Boolean);
    for (const line of lines) assert.match(line, /\S\s+# \S/, line);
    const names = lines.map((l) => l.replace(/\s+#.*$/, '').replace(/^[|`\- ]+/, ''));
    for (const file of walk('')) {
      const base = file.split('/').pop();
      assert.ok(names.includes(base), `${file} is not in the tree`);
    }
  }
});

test('文：使わない語・内部の印・手元のパス・作業の回を書かない。英語版に日本語を残さない', () => {
  const AVOIDED = ['分かる', '全て', '既に', '無い', 'おすすめ', 'オススメ', '効く', '走る', '照合', '突き合わせ', '断定', '構図', '落とし穴', '潰す',
    'ブラウザ ', 'サーバ ', 'ユーザ ', 'インターフェース'];
  for (const word of AVOIDED) assert.ok(!ja.includes(word), word);
  const marks = /(?<![A-Za-z])[A-Z]:[\\/]|ipusiron-work|scratchpad|\btmp\/|試作|プロトタイプ|渚|本人|作者|第[0-9０-９]+弾|以前は|改修前/;
  for (const [name, text] of [['ja', ja], ['en', en]]) {
    for (const line of text.split('\n')) assert.doesNotMatch(line, marks, `${name}: ${line}`);
  }
  // 英語版：1行目（日本語への切り替え）と、日本語の資料名を除いて、日本語の文字を残さない
  const JAPANESE = /[ぁ-んァ-ヶ一-龯]/;
  for (const line of en.split('\n').slice(1)) assert.doesNotMatch(line, JAPANESE, line);
  // 日本語版：和文と英数字の間に空白を入れない（コードの中と表は除く）
  const prose = ja.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, 'X').split('\n').filter((l) => !l.startsWith('|') && !l.startsWith('description_'));
  const jaChar = '[\\u3040-\\u30ff\\u3400-\\u9fff]';
  for (const line of prose) assert.doesNotMatch(line, new RegExp(`${jaChar} [A-Za-z0-9]|[A-Za-z0-9] ${jaChar}`), line);
});
