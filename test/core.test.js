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
  assert.deepEqual({ ...C.SPEECH_REPLACE },
    { Juliett: 'Juliet', Alfa: 'Alpha', Wun: 'One', Too: 'Two', Ait: 'Eight', Fower: 'Fow-er', Xray: 'X-ray' });
  assert.equal(C.speechText('Capital Juliett'), 'Capital Juliet');
  assert.equal(C.speechText('Small Alfa'), 'Small Alpha');
  assert.equal(C.speechText('Bravo'), 'Bravo');
  const items = C.spell('Ja1', { digitMode: 'icao' });
  assert.equal(C.copyLine(items), 'Capital Juliett, Small Alfa, Wun');
  assert.deepEqual(C.speechQueue(items).map((q) => q.text), ['Capital Juliet', 'Small Alpha', 'One']);
});

// 綴りの切り替え：英字2択×数字3択のすべての組み合わせで、表示・コピー・読み上げを確かめる
const LETTER_FORMS = {
  official: ['Capital Alfa', 'Small Juliett', 'Capital X-ray', 'Small Whiskey', 'Capital Bravo'],
  common: ['Capital Alpha', 'Small Juliet', 'Capital Xray', 'Small Whisky', 'Capital Bravo'],
};
const LETTER_SPEECH = {
  official: ['Capital Alpha', 'Small Juliet', 'Capital X-ray', 'Small Whiskey', 'Capital Bravo'],
  common: ['Capital Alpha', 'Small Juliet', 'Capital X-ray', 'Small Whisky', 'Capital Bravo'],
};
const DIGIT_FORMS = {
  plain: ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'],
  icao: ['Zero', 'Wun', 'Too', 'Tree', 'Fower', 'Fife', 'Six', 'Seven', 'Ait', 'Niner'],
  icaoPlain: ['Zero', 'One', 'Two', 'Tree', 'Four', 'Fife', 'Six', 'Seven', 'Eight', 'Niner'],
};
const DIGIT_SPEECH = {
  plain: DIGIT_FORMS.plain,
  icao: ['Zero', 'One', 'Two', 'Tree', 'Fow-er', 'Fife', 'Six', 'Seven', 'Eight', 'Niner'],
  icaoPlain: DIGIT_FORMS.icaoPlain,
};

test('綴りの表：英語でよく見る綴りは A・J・W・X の4つ、数字は3つの読み方', () => {
  assert.deepEqual({ ...C.COMMON_SPELLINGS }, { A: 'Alpha', J: 'Juliet', W: 'Whisky', X: 'Xray' });
  assert.deepEqual(C.LETTERS.filter((l) => l.alt).map((l) => l.ch), ['A', 'J', 'W', 'X']);
  assert.deepEqual([...C.LETTER_SPELLINGS], ['official', 'common']);
  assert.deepEqual([...C.DIGIT_MODES], ['plain', 'icao', 'icaoPlain']);
  assert.deepEqual(C.DIGITS.map((d) => d.icaoPlain), DIGIT_FORMS.icaoPlain);
});

test('綴りの切り替え：英字2択×数字3択の6通りすべて（表示・コピー・読み上げ）', () => {
  let combos = 0;
  for (const letterSpelling of C.LETTER_SPELLINGS) {
    for (const digitMode of C.DIGIT_MODES) {
      const items = C.spell('AjXwB0123456789', { letterSpelling, digitMode });
      const expected = [...LETTER_FORMS[letterSpelling], ...DIGIT_FORMS[digitMode]];
      assert.deepEqual(items.map((x) => x.spoken), expected, `${letterSpelling} ${digitMode}`);
      assert.equal(C.copyLine(items), expected.join(', '));
      assert.deepEqual(C.speechQueue(items).map((q) => q.text), [...LETTER_SPEECH[letterSpelling], ...DIGIT_SPEECH[digitMode]]);
      // 大文字と小文字を区別しないときは綴りだけ
      const plainCase = C.spell('Aj', { letterSpelling, digitMode, caseMode: 'ignore' }).map((x) => x.spoken);
      assert.deepEqual(plainCase, LETTER_FORMS[letterSpelling].slice(0, 2).map((s) => s.split(' ')[1]));
      combos += 1;
    }
  }
  assert.equal(combos, 6);
  // 決まっていない値は既定（原典どおり・ふつうの英語）
  assert.deepEqual(C.spell('A1', { letterSpelling: 'x', digitMode: 'y' }).map((x) => x.spoken), ['Capital Alfa', 'One']);
});

test('読み上げで大文字・小文字も言うか：言わないときは声だけ Capital／Small を外し、表とコピーはそのまま', () => {
  const items = C.spell('Pa5!');
  assert.deepEqual(C.speechQueue(items).map((q) => q.text), ['Capital Papa', 'Small Alpha', 'Five', 'Exclamation mark']);
  assert.deepEqual(C.speechQueue(items, { sayCase: true }).map((q) => q.text), ['Capital Papa', 'Small Alpha', 'Five', 'Exclamation mark']);
  assert.deepEqual(C.speechQueue(items, { sayCase: false }).map((q) => q.text), ['Papa', 'Alpha', 'Five', 'Exclamation mark']);
  assert.equal(C.copyLine(items), 'Capital Papa, Small Alfa, Five, Exclamation mark');
  // 英語でよく見る綴りでも同じ
  const common = C.spell('Jx', { letterSpelling: 'common' });
  assert.deepEqual(C.speechQueue(common, { sayCase: false }).map((q) => q.text), ['Juliet', 'X-ray']);
  // 表で区別しないときは、どちらでも同じ
  const ignore = C.spell('Pa', { caseMode: 'ignore' });
  assert.deepEqual(C.speechQueue(ignore, { sayCase: true }), C.speechQueue(ignore, { sayCase: false }));
});

test('速さと語の間：ふつう1.0・ゆっくり0.7、間はゆっくりのほうが長い', () => {
  assert.deepEqual({ ...C.RATES }, { normal: 1.0, slow: 0.7 });
  assert.deepEqual({ ...C.GAP_MS }, { normal: 350, slow: 700 });
  assert.ok(C.GAP_MS.slow > C.GAP_MS.normal);
  assert.ok(Object.isFrozen(C.RATES) && Object.isFrozen(C.GAP_MS));
});

test('声：英語（en-US を先に）→ 日本語 → そのほかの最初の声の順に選ぶ。声がなければ null', () => {
  // 英語あり
  assert.equal(C.pickVoice([{ lang: 'ja-JP', name: 'j' }, { lang: 'en-GB', name: 'g' }]).name, 'g');
  assert.equal(C.pickVoice([{ lang: 'en-GB', name: 'g' }, { lang: 'en-US', name: 'u' }]).name, 'u');
  assert.equal(C.pickVoice([{ lang: 'en-US', name: 'net', localService: false }, { lang: 'en-US', name: 'local', localService: true }]).name, 'local');
  assert.equal(C.pickVoice([{ lang: 'de-DE', name: 'd' }, { lang: 'en_AU', name: 'a' }]).name, 'a');
  // 日本語だけ・日本語とほかの言語
  assert.equal(C.pickVoice([{ lang: 'ja-JP', name: 'j' }]).name, 'j');
  assert.equal(C.pickVoice([{ lang: 'de-DE', name: 'd' }, { lang: 'ja-JP', name: 'j' }]).name, 'j');
  // ほかの言語だけ：一覧の最初の声（同じ順位なら一覧の順）
  assert.equal(C.pickVoice([{ lang: 'de-DE', name: 'd' }, { lang: 'fr-FR', name: 'f' }]).name, 'd');
  assert.equal(C.pickVoice([{ lang: 'eng', name: 'x' }]).name, 'x');
  // 空
  assert.equal(C.pickVoice([]), null);
  assert.equal(C.pickVoice(null), null);
  // 声の言語の種類
  assert.deepEqual([{ lang: 'en-US' }, { lang: 'EN_gb' }, { lang: 'ja-JP' }, { lang: 'ja' }, { lang: 'de-DE' }, { lang: 'eng' }, {}].map(C.voiceKind),
    ['en', 'en', 'ja', 'ja', 'other', 'other', 'other']);
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
