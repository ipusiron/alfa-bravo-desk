'use strict';
// 計算部：文章から見つける（揺れ・続けて並んだ語と単独の語・改行をはさむ X ray・数字の語・大文字にそろえる）
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/abd-core.js');
const M = require('../js/messages.js');

const texts = (r, ks) => ks.map((k) => r.matches[k].text);

test('例文：Alpha bravo seven Niner と X ray Echo が続けて並んだ語、hotel は単独の語', () => {
  assert.equal(M.ja.exampleText, M.en.exampleText);
  const r = C.find(M.ja.exampleText);
  assert.equal(r.matches.length, 7);
  assert.equal(r.decoded, 'AB79 XE');
  assert.deepEqual(r.decodedRuns, ['AB79', 'XE']);
  assert.deepEqual(texts(r, r.singles), ['hotel']);
  assert.deepEqual(r.variants.map((v) => [v.text, v.canon, v.char, v.variant]),
    [['Alpha', 'Alfa', 'A', 'spelling'], ['Niner', 'Nine', '9', 'icao'], ['X ray', 'X-ray', 'X', 'spelling']]);
  // 例文は入力欄に収まる長さ（幅320pxで4行の欄）
  assert.ok(M.ja.exampleText.length <= 90);
});

test('揺れ：Alpha・Juliet・Whisky・Xray・X ray・X-ray を拾い、正式な綴りは揺れに入れない', () => {
  const r = C.find('alpha alfa juliet juliett whisky whiskey xray x ray x-ray');
  assert.equal(r.decoded, 'AAJJWWXXX');
  assert.deepEqual(r.variants.map((v) => v.text), ['alpha', 'juliet', 'whisky', 'xray', 'x ray']);
});

test('大文字と小文字を区別しない。戻した英字はいつも大文字', () => {
  const r = C.find('ECHO echo EcHo golf');
  assert.equal(r.decoded, 'EEEG');
  assert.deepEqual(r.variants, []);
});

test('X ray：空白・ハイフン・改行を1つはさむ形は1語、2つ以上はさむ形は1語にしない', () => {
  assert.equal(C.find('X\nray Bravo').decoded, 'XB');
  assert.equal(C.find('X\r\nray Bravo').decoded, 'XB');
  assert.equal(C.find('X-Ray Bravo').decoded, 'XB');
  const two = C.find('X  ray Bravo');
  assert.equal(two.matches.length, 1);
  assert.equal(two.matches[0].text, 'Bravo');
  // 改行をはさんだ語は、揺れの一覧では空白1つにして出す
  assert.deepEqual(C.find('x\nray echo').variants.map((v) => v.text), ['x ray']);
});

test('続けて並んだ語：あいだが空白・句読点・改行だけならつながり、ほかの語や数字が入れば切れる', () => {
  const r = C.find('Delta, Echo.\nFoxtrot; the end. Golf 42 Hotel');
  assert.deepEqual(r.decodedRuns, ['DEF']);
  assert.deepEqual(texts(r, r.singles), ['Golf', 'Hotel']);
  assert.equal(r.matches.filter((m) => m.inSequence).length, 3);
  // 単独の語だけのとき、英字の列は空
  const alone = C.find('I stayed at a hotel.');
  assert.equal(alone.decoded, '');
  assert.deepEqual(texts(alone, alone.singles), ['hotel']);
});

test('数字の語：Zero〜Nine と ICAO式（Wun・Too・Tree・Fower・Fife・Ait・Niner）を拾い、切り替えで拾わない', () => {
  const words = 'zero one two three four five six seven eight nine';
  assert.equal(C.find(words).decoded, '0123456789');
  assert.equal(C.find('Zero Wun Too Tree Fower Fife Six Seven Ait Niner').decoded, '0123456789');
  assert.equal(C.find('Tree Niner Fife Fower').decoded, '3954');
  // 拾わないとき、one はふつうの語なので、Alfa と Bravo のつながりを切る
  const off = C.find('Alfa one Bravo Charlie', { digits: false });
  assert.equal(off.decoded, 'BC');
  assert.equal(off.matches.length, 3);
  // Tree も単独のときは英字の列に入れない
  const tree = C.find('a tree by the road');
  assert.equal(tree.decoded, '');
  assert.equal(tree.singles.length, 1);
});

test('語の一部は拾わない（Alfa2 の Alfa は拾い、Hotels・Café は拾わない）', () => {
  assert.equal(C.find('Hotels Golfer Café').matches.length, 0);
  assert.equal(C.find('Alfa2 Bravo').decoded, '');
  assert.equal(C.find('Alfa2 Bravo').matches.length, 2);
});

test('読み上げる順：続けて並んだ語だけを、通話表の綴り（読み上げ用に置き換えたもの）で', () => {
  const r = C.find('juliet x ray Wun, then hotel');
  assert.deepEqual(C.findQueue(r).map((q) => q.text), ['Juliet', 'X-ray', 'One']);
  assert.deepEqual(C.findQueue(r).map((q) => q.index), [0, 1, 2]);
});

test('空の文章と最大長', () => {
  const r = C.find('');
  assert.deepEqual([r.matches.length, r.decoded, r.singles.length], [0, '', 0]);
  const long = C.clampText('Alfa '.repeat(1001), C.MAX_FIND);
  assert.equal(long.over, true);
  assert.equal(long.text.length, 5000);
  assert.equal(C.find(long.text).decoded, 'A'.repeat(1000));
});

// 1文字ずつ空白で区切り、16文字ごとに改行した並び（語が行をまたぐ）。通話表にない語（INDIGO）と、読めない末尾（QQQ）を含む
const SPACED = [
  'A L P H A M I K E E C H O T A N',
  'G O H O T E L Y A N K E E S I E',
  'R R A T A N G O D E L T A I N D',
  'I G O A L P H A M I K E O S C A',
  'R N O V E M B E R D E L T A E C',
  'H O M I K E E C H O R O M E O A',
  'L P H A L I M A D E L T A Q U E',
  'B E C U N I F O R M A L P H A R',
  'O M E O T A N G O Z U L U Q Q Q',
].join('\n');

test('区切りのない並び：1文字ずつ区切った並びを通話表の語に区切り、読めない部分は「?」を1つずつ置く', () => {
  const r = C.find(SPACED);
  assert.equal(r.mode, 'joined');
  assert.equal(r.auto, true);
  assert.equal(r.decoded, 'AMETHYSTD?AMONDEMERALDQUARTZ?');
  assert.equal(r.matches.length, 27);
  assert.deepEqual(r.unread.map((u) => [u.text.replace(/\s/g, ''), u.letters]), [['INDIGO', 6], ['QQQ', 3]]);
  // ALPHA は綴りの揺れ（通話表では Alfa）
  assert.deepEqual(r.variants.map((v) => [v.text, v.canon]), [['ALPHA', 'Alfa']]);
  // 行をまたぐ語（TAN／GO）も1語。印の範囲は元の文の位置
  const tango = r.matches[3];
  assert.equal(tango.canon, 'Tango');
  assert.equal(tango.text, 'T A N\nG O');
  assert.equal(SPACED.slice(tango.start, tango.end), tango.text);
  // 読み上げは語だけ
  assert.equal(C.findQueue(r).length, 27);
});

test('区切りのない並び：空白と改行を消しても、空白のない1本の並びでも同じ結果', () => {
  const noSpace = C.removeSpaces(SPACED);
  assert.equal(noSpace.count, 9 * 15);
  const oneRun = C.removeLineBreaks(noSpace.text);
  assert.equal(oneRun.count, 8);
  assert.match(oneRun.text, /^[A-Z]+$/);
  assert.equal(C.find(oneRun.text).decoded, 'AMETHYSTD?AMONDEMERALDQUARTZ?');
  assert.equal(C.find('alphabravocharlie').decoded, 'ABC');
  assert.equal(C.find('ALPHABRAVO').mode, 'joined');
});

test('区切りのない並び：自作の例は SECRET?KEY?、読み方を切り替えると単語ごとにも読める', () => {
  assert.equal(M.ja.exampleJoinedText, M.en.exampleJoinedText);
  const r = C.find(M.ja.exampleJoinedText);
  assert.equal(r.decoded, 'SECRET?KEY?');
  assert.deepEqual(r.unread.map((u) => u.text.replace(/\s/g, '')), ['PURPLE', 'ZZ']);
  assert.ok(M.ja.exampleJoinedText.split('\n').every((line) => line.replace(/ /g, '').length <= 16));
  // 同じ並びを単語ごとに読むと、1文字の語は通話表の語ではないので何も見つからない
  assert.equal(C.find(M.ja.exampleJoinedText, { mode: 'words' }).matches.length, 0);
  // ふつうの英文は、自動では単語ごとに読む（区切って読まない）
  assert.equal(C.find(M.ja.exampleText).mode, 'words');
  assert.equal(C.find('Hotels Golfer Cafe').mode, 'words');
  assert.equal(C.find('I stayed at a hotel.').mode, 'words');
  // 単語ごとに読む文章を、切り替えで区切って読むこともできる
  assert.equal(C.find('alpha bravo', { mode: 'joined' }).decoded, 'AB');
});

test('区切りのない並び：数字の語の切り替えと、英字のない文', () => {
  assert.equal(C.find('ALFANINERBRAVO').decoded, 'A9B');
  assert.equal(C.find('ALFANINERBRAVO', { digits: false }).decoded, 'A?B');
  const empty = C.find('1234 !!', { mode: 'joined' });
  assert.deepEqual([empty.decoded, empty.matches.length, empty.unread.length], ['', 0, 0]);
  assert.equal(C.detectMode(''), 'words');
  assert.deepEqual([...C.FIND_MODES], ['auto', 'words', 'joined']);
});

test('空白と改行を消す：半角・全角・タブの空白と、CRLF・LF・CR の改行を数えて取り除く', () => {
  const ideographicSpace = String.fromCharCode(0x3000);
  assert.deepEqual(C.removeSpaces('a b\tc' + ideographicSpace + 'd'), { text: 'abcd', count: 3 });
  assert.deepEqual(C.removeLineBreaks('a\r\nb\nc\rd'), { text: 'abcd', count: 3 });
  assert.deepEqual(C.removeSpaces('abc'), { text: 'abc', count: 0 });
  assert.deepEqual(C.removeLineBreaks(''), { text: '', count: 0 });
});
