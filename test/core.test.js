'use strict';
// 計算部：綴りを伝える変換・記号の名前・数字の2つの読み方・最大長・読み上げ用の置き換えと定数・声の選び方・日本語の折り返し位置
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/abd-core.js');

const ICAO_LETTERS = ['Alfa', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima', 'Mike',
  'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'X-ray', 'Yankee', 'Zulu'];

test('英字：26文字が A〜Z の順に通話表の単語を持つ（Alfa・Juliett・Whiskey・X-ray の綴り）', () => {
  assert.equal(C.LETTERS.length, 26);
  assert.deepEqual(C.LETTERS.map((l) => l.ch).join(''), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  assert.deepEqual(C.LETTERS.map((l) => l.word), ICAO_LETTERS);
  for (const l of C.LETTERS) {
    assert.ok(l.kana && /^[ァ-ヿ]+$/.test(l.kana), l.word);
    assert.match(l.pron, /^[A-Z ]+$/, l.word);
  }
  assert.equal(C.LETTERS[0].pron, 'AL FAH');
  assert.equal(C.LETTERS[9].pron, 'JEW LEE ETT');
});

test('数字：ふつうの英語と ICAO式（Zero・Wun・Too・Tree・Fower・Fife・Six・Seven・Ait・Niner）', () => {
  assert.deepEqual(C.DIGITS.map((d) => d.ch).join(''), '0123456789');
  assert.deepEqual(C.DIGITS.map((d) => d.word), ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine']);
  assert.deepEqual(C.DIGITS.map((d) => d.icao), ['Zero', 'Wun', 'Too', 'Tree', 'Fower', 'Fife', 'Six', 'Seven', 'Ait', 'Niner']);
  assert.equal(C.copyLine(C.spell('0123456789')), 'Zero, One, Two, Three, Four, Five, Six, Seven, Eight, Nine');
  assert.equal(C.copyLine(C.spell('0123456789', { digitMode: 'icao' })), 'Zero, Wun, Too, Tree, Fower, Fife, Six, Seven, Ait, Niner');
});

test('大文字と小文字：区別するときは Capital／Small を付け、区別しないときは綴りだけ（3つの形）', () => {
  const on = C.spell('Pp');
  assert.deepEqual(on.map((x) => [x.letterCase, x.spoken]), [['capital', 'Capital Papa'], ['small', 'Small Papa']]);
  const off = C.spell('Pp', { caseMode: 'ignore' });
  assert.deepEqual(off.map((x) => [x.letterCase, x.spoken]), [[null, 'Papa'], [null, 'Papa']]);
  // 数字と記号には付けない
  assert.deepEqual(C.spell('5!').map((x) => x.spoken), ['Five', 'Exclamation mark']);
});

test('既知の例：Pa55w0rd! の読み方の1行', () => {
  assert.equal(C.copyLine(C.spell('Pa55w0rd!')),
    'Capital Papa, Small Alfa, Five, Five, Small Whiskey, Zero, Small Romeo, Small Delta, Exclamation mark');
  assert.deepEqual(C.countTypes(C.spell('Pa55w0rd!')), { letter: 5, digit: 3, symbol: 1, space: 0, unnamed: 0, other: 0 });
});

test('記号：名前を持つ18個はパスワードによく使うもの、名前のない記号と日本語は読まない', () => {
  assert.equal(C.SYMBOLS.length, 18);
  assert.deepEqual(C.SYMBOLS.map((s) => s.ch).join(''), '!@#$%&*-_.,?/+=:;~');
  assert.equal(new Set(C.SYMBOLS.map((s) => s.id)).size, 18);
  for (const ch of '"\'()<>[]\\^`{|}') {
    const [item] = C.spell(ch);
    assert.equal(item.type, 'unnamed', ch);
    assert.equal(item.spoken, null, ch);
  }
  const mixed = C.spell('aあé\t');
  assert.deepEqual(mixed.map((x) => x.type), ['letter', 'other', 'other', 'other']);
  // 読まない文字はコピーの1行にはそのまま入り、読み上げの順からは外れる
  assert.equal(C.copyLine(C.spell('a^b')), 'Small Alfa, ^, Small Bravo');
  assert.deepEqual(C.speechQueue(C.spell('a^b')).map((q) => q.index), [0, 2]);
});

test('空白：「Space」と読む', () => {
  const items = C.spell('a b');
  assert.equal(items[1].type, 'space');
  assert.equal(items[1].spoken, 'Space');
  assert.equal(C.copyLine(items), 'Small Alfa, Space, Small Bravo');
});

test('最大長：200文字（タブ2は5,000文字）。コードポイントで数え、超えた分は切る', () => {
  assert.equal(C.MAX_SPELL, 200);
  assert.equal(C.MAX_FIND, 5000);
  assert.deepEqual(C.clampText('a'.repeat(200), 200), { text: 'a'.repeat(200), over: false, length: 200 });
  const over = C.clampText('a'.repeat(201), 200);
  assert.equal(over.text.length, 200);
  assert.equal(over.over, true);
  // サロゲートペアを途中で切らない
  const emoji = C.clampText('😀'.repeat(201), 200);
  assert.equal(Array.from(emoji.text).length, 200);
  assert.equal(emoji.text, '😀'.repeat(200));
  assert.deepEqual(C.clampText('', 200), { text: '', over: false, length: 0 });
  assert.deepEqual(C.spell(''), []);
  assert.equal(C.spell('😀').length, 1);
});

test('読み上げ用の置き換え：画面とコピーは正式な綴り、声だけ読みやすい綴り', () => {
  assert.deepEqual({ ...C.SPEECH_REPLACE }, { Juliett: 'Juliet', Alfa: 'Alpha', Wun: 'One', Too: 'Two', Ait: 'Eight', Fower: 'Fow-er' });
  assert.equal(C.speechText('Capital Juliett'), 'Capital Juliet');
  assert.equal(C.speechText('Small Alfa'), 'Small Alpha');
  assert.equal(C.speechText('Bravo'), 'Bravo');
  const items = C.spell('Ja1', { digitMode: 'icao' });
  assert.equal(C.copyLine(items), 'Capital Juliett, Small Alfa, Wun');
  assert.deepEqual(C.speechQueue(items).map((q) => q.text), ['Capital Juliet', 'Small Alpha', 'One']);
});

test('速さと語の間：ふつう1.0・ゆっくり0.7、間はゆっくりのほうが長い', () => {
  assert.deepEqual({ ...C.RATES }, { normal: 1.0, slow: 0.7 });
  assert.deepEqual({ ...C.GAP_MS }, { normal: 350, slow: 700 });
  assert.ok(C.GAP_MS.slow > C.GAP_MS.normal);
  assert.ok(Object.isFrozen(C.RATES) && Object.isFrozen(C.GAP_MS));
});

test('声：言語が en で始まる声から選ぶ（en-US を先に）。なければ null', () => {
  assert.equal(C.pickVoice([]), null);
  assert.equal(C.pickVoice([{ lang: 'ja-JP' }, { lang: 'de-DE' }]), null);
  assert.equal(C.pickVoice([{ lang: 'ja-JP', name: 'j' }, { lang: 'en-GB', name: 'g' }]).name, 'g');
  assert.equal(C.pickVoice([{ lang: 'en-GB', name: 'g' }, { lang: 'en-US', name: 'u' }]).name, 'u');
  assert.equal(C.pickVoice([{ lang: 'en-US', name: 'net', localService: false }, { lang: 'en-US', name: 'local', localService: true }]).name, 'local');
  assert.equal(C.pickVoice([{ lang: 'en_AU', name: 'a' }]).name, 'a');
  assert.equal(C.pickVoice([{ lang: 'eng' }]), null);
  assert.equal(C.pickVoice(null), null);
});

test('日本語の折り返し位置：語の切れ目で区切り、行頭に来てはいけない文字の前と短いかぎかっこの中では区切らない', () => {
  assert.deepEqual(C.phrases('英字や数字を電話で伝えると、'), ['英字や', '数字を', '電話で', '伝えると、']);
  assert.deepEqual(C.phrases('「朝日のア」のように'), ['「朝日のア」のように']);
  assert.deepEqual(C.phrases('Spell it out'), ['Spell it out']);
  assert.deepEqual(C.phrases('a' + String.fromCharCode(0x200b) + 'b'), ['a', 'b']);
  for (const piece of C.phrases('通話表は、文字ごとに決めた表です。')) assert.doesNotMatch(piece, /^[、。）」]/);
  assert.equal(C.phrases('英字や数字を電話で伝えると、').join(''), '英字や数字を電話で伝えると、');
});

test('数の表示：3桁ごとのコンマ', () => {
  assert.equal(C.formatNumber(5000), '5,000');
  assert.equal(C.formatNumber(200), '200');
});
