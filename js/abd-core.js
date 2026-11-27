/* Alfa Bravo Desk - MIT (c) 2026 ipusiron. */
// 計算部（UMD・依存なし・DOMに触れない）。
// 通話表の表・記号の名前・綴りを伝える変換・文章から見つける処理・綴りの揺れの表・読み上げ用の綴りの置き換え・速さと間の定数・
// 日本語の文の折り返してよい位置を持つ。
//
// 出典（画面の「出典と関連ツール」と同じ）
// - 英字の単語と発音の表記：無線局運用規則（昭和25年電波監理委員会規則第17号）第14条第3項・別表第五号「通話表」の欧文通話表
//   https://laws.e-gov.go.jp/law/325M50080000017
// - 数字の発音の表記（ICAO式）：同じ別表第五号の航空移動業務の欄（ZE-RO・WUN・TOO・TREE・FOW-er・FIFE・SIX・SEV-en・AIT・NIN-er）と、
//   UK CAA「CAP 413 Radiotelephony Manual」Edition 24（2026年7月1日）Chapter 2 Table 3
//   （ZERO・WUN・TOO・TREE・FOWER・FIFE・SIX・SEVEN・AIT・NINER）
//   https://www.caa.co.uk/our-work/publications/documents/content/cap-413/
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AbdCore = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ===== 入力の上限（文字数はコードポイントで数える） =====
  const MAX_SPELL = 200;
  const MAX_FIND = 5000;

  // ===== 読み上げの速さと、語と語の間（ミリ秒） =====
  const RATES = Object.freeze({ normal: 1.0, slow: 0.7 });
  const GAP_MS = Object.freeze({ normal: 350, slow: 700 });

  // ===== 英字：単語・読み方の目安（カタカナ）・発音の表記（別表第五号） =====
  const LETTERS = Object.freeze([
    ['A', 'Alfa', 'アルファ', 'AL FAH'], ['B', 'Bravo', 'ブラボー', 'BRAH VOH'], ['C', 'Charlie', 'チャーリー', 'CHAR LEE'],
    ['D', 'Delta', 'デルタ', 'DELL TAH'], ['E', 'Echo', 'エコー', 'ECK OH'], ['F', 'Foxtrot', 'フォックストロット', 'FOKS TROT'],
    ['G', 'Golf', 'ゴルフ', 'GOLF'], ['H', 'Hotel', 'ホテル', 'HOH TELL'], ['I', 'India', 'インディア', 'IN DEE AH'],
    ['J', 'Juliett', 'ジュリエット', 'JEW LEE ETT'], ['K', 'Kilo', 'キロ', 'KEY LOH'], ['L', 'Lima', 'リマ', 'LEE MAH'],
    ['M', 'Mike', 'マイク', 'MIKE'], ['N', 'November', 'ノベンバー', 'NO VEM BER'], ['O', 'Oscar', 'オスカー', 'OSS CAH'],
    ['P', 'Papa', 'パパ', 'PAH PAH'], ['Q', 'Quebec', 'ケベック', 'KEH BECK'], ['R', 'Romeo', 'ロメオ', 'ROW ME OH'],
    ['S', 'Sierra', 'シエラ', 'SEE AIR RAH'], ['T', 'Tango', 'タンゴ', 'TANG GO'], ['U', 'Uniform', 'ユニフォーム', 'YOU NEE FORM'],
    ['V', 'Victor', 'ビクター', 'VIK TAH'], ['W', 'Whiskey', 'ウィスキー', 'WISS KEY'], ['X', 'X-ray', 'エックスレイ', 'ECKS RAY'],
    ['Y', 'Yankee', 'ヤンキー', 'YANG KEY'], ['Z', 'Zulu', 'ズールー', 'ZOO LOO'],
  ].map(([ch, word, kana, pron]) => Object.freeze({ ch, word, kana, pron })));

  // ===== 数字：ふつうの英語・ICAO式（発音の表記をもとにした綴り）・読み方の目安 =====
  const DIGITS = Object.freeze([
    ['0', 'Zero', 'Zero', 'ゼロ'], ['1', 'One', 'Wun', 'ワン'], ['2', 'Two', 'Too', 'ツー'], ['3', 'Three', 'Tree', 'スリー'],
    ['4', 'Four', 'Fower', 'フォー'], ['5', 'Five', 'Fife', 'ファイブ'], ['6', 'Six', 'Six', 'シックス'], ['7', 'Seven', 'Seven', 'セブン'],
    ['8', 'Eight', 'Ait', 'エイト'], ['9', 'Nine', 'Niner', 'ナイン'],
  ].map(([ch, word, icao, kana]) => Object.freeze({ ch, word, icao, kana })));

  // ===== 名前を持つ記号（パスワードによく使うもの）。画面の日本語の名前は messages.js の symbol.<id> =====
  const SYMBOLS = Object.freeze([
    ['!', 'exclamation', 'Exclamation mark'], ['@', 'at', 'At sign'], ['#', 'hash', 'Hash'], ['$', 'dollar', 'Dollar sign'],
    ['%', 'percent', 'Percent sign'], ['&', 'ampersand', 'Ampersand'], ['*', 'asterisk', 'Asterisk'], ['-', 'hyphen', 'Hyphen'],
    ['_', 'underscore', 'Underscore'], ['.', 'period', 'Period'], [',', 'comma', 'Comma'], ['?', 'question', 'Question mark'],
    ['/', 'slash', 'Slash'], ['+', 'plus', 'Plus sign'], ['=', 'equals', 'Equals sign'], [':', 'colon', 'Colon'],
    [';', 'semicolon', 'Semicolon'], ['~', 'tilde', 'Tilde'],
  ].map(([ch, id, name]) => Object.freeze({ ch, id, name })));

  const SPACE_WORD = 'Space';
  const CAPITAL = 'Capital';
  const SMALL = 'Small';

  // ===== 読み上げだけの綴りの置き換え（画面とコピーには正式な綴りを出す） =====
  // Juliett・Alfa は声が綴りどおりに崩れやすいので英語のふつうの綴りで読ませる。Wun・Too・Ait は One・Two・Eight と同じ音。
  // Fower は「フラワー」に寄らないよう、音の切れ目を入れる。
  const SPEECH_REPLACE = Object.freeze({ Juliett: 'Juliet', Alfa: 'Alpha', Wun: 'One', Too: 'Two', Ait: 'Eight', Fower: 'Fow-er' });
  function speechText(text) {
    return String(text).split(' ').map((w) => (Object.prototype.hasOwnProperty.call(SPEECH_REPLACE, w) ? SPEECH_REPLACE[w] : w)).join(' ');
  }

  const letterOf = new Map(LETTERS.map((l) => [l.ch, l]));
  const digitOf = new Map(DIGITS.map((d) => [d.ch, d]));
  const symbolOf = new Map(SYMBOLS.map((s) => [s.ch, s]));

  // ===== 入力の上限 =====
  function clampText(text, max) {
    const chars = Array.from(String(text));
    if (chars.length <= max) return { text: String(text), over: false, length: chars.length };
    return { text: chars.slice(0, max).join(''), over: true, length: max };
  }

  // ===== タブ1：綴りを伝える =====
  // options.caseMode: 'distinguish'（Capital／Small を付ける）か 'ignore'（綴りだけ）
  // options.digitMode: 'plain'（One, Two…）か 'icao'（Wun, Too, Tree…）
  // spoken は読み上げとコピーに使う英語（読まない文字は null）
  function spell(text, options = {}) {
    const caseMode = options.caseMode === 'ignore' ? 'ignore' : 'distinguish';
    const digitMode = options.digitMode === 'icao' ? 'icao' : 'plain';
    const items = Array.from(String(text)).map((ch, index) => {
      const upper = ch.toUpperCase();
      if (/^[A-Za-z]$/.test(ch)) {
        const letter = letterOf.get(upper);
        const letterCase = caseMode === 'ignore' ? null : (ch === upper ? 'capital' : 'small');
        const prefix = letterCase === 'capital' ? CAPITAL + ' ' : letterCase === 'small' ? SMALL + ' ' : '';
        return { index, ch, type: 'letter', word: letter.word, letterCase, spoken: prefix + letter.word };
      }
      if (digitOf.has(ch)) {
        const d = digitOf.get(ch);
        const word = digitMode === 'icao' ? d.icao : d.word;
        return { index, ch, type: 'digit', word, letterCase: null, spoken: word };
      }
      if (symbolOf.has(ch)) {
        const s = symbolOf.get(ch);
        return { index, ch, type: 'symbol', word: s.name, symbolId: s.id, letterCase: null, spoken: s.name };
      }
      if (ch === ' ') return { index, ch, type: 'space', word: SPACE_WORD, letterCase: null, spoken: SPACE_WORD };
      // ASCII の記号で名前を持たないもの（" ' ( ) < > [ ] \ ^ ` { | } など）と、それ以外の文字（日本語・アクセント付きの英字・空白以外の空白類）
      const type = /^[!-~]$/.test(ch) ? 'unnamed' : 'other';
      return { index, ch, type, word: null, letterCase: null, spoken: null };
    });
    return items;
  }

  function countTypes(items) {
    const counts = { letter: 0, digit: 0, symbol: 0, space: 0, unnamed: 0, other: 0 };
    for (const item of items) counts[item.type] += 1;
    return counts;
  }

  // 読み方を1行にまとめる。読まない文字は、その文字のまま入れる
  function copyLine(items) {
    return items.map((item) => (item.spoken === null ? item.ch : item.spoken)).join(', ');
  }

  // 読み上げる順の一覧（読まない文字は飛ばす）。index は表の行の番号（0から）
  function speechQueue(items) {
    return items.filter((item) => item.spoken !== null).map((item) => ({ index: item.index, text: speechText(item.spoken) }));
  }

  // ===== タブ2：文章から見つける =====
  // 拾う語（小文字）→ 表す文字・通話表の綴り・揺れの種類（null＝正式な綴り、'spelling'＝綴りの揺れ、'icao'＝ICAO式の数字）
  const FIND_WORDS = new Map();
  for (const l of LETTERS) if (l.ch !== 'X') FIND_WORDS.set(l.word.toLowerCase(), { char: l.ch, canon: l.word, variant: null, kind: 'letter' });
  for (const [alias, canon] of [['alpha', 'Alfa'], ['juliet', 'Juliett'], ['whisky', 'Whiskey']]) {
    const l = LETTERS.find((x) => x.word === canon);
    FIND_WORDS.set(alias, { char: l.ch, canon, variant: 'spelling', kind: 'letter' });
  }
  const DIGIT_WORDS = new Map();
  for (const d of DIGITS) {
    DIGIT_WORDS.set(d.word.toLowerCase(), { char: d.ch, canon: d.word, variant: null, kind: 'digit' });
    if (d.icao !== d.word) DIGIT_WORDS.set(d.icao.toLowerCase(), { char: d.ch, canon: d.word, icao: d.icao, variant: 'icao', kind: 'digit' });
  }
  // X-ray の形：つないだ1語（xray）と、空白・ハイフン・改行を1つはさむ形（x ray／x-ray／x↵ray）
  const X_JOINS = /^(?: |-|\r?\n)$/;
  const GAP_IN_RUN = /^[\s\p{P}]*$/u;

  function find(text, options = {}) {
    const source = String(text);
    const digits = options.digits !== false;
    const tokens = [...source.matchAll(/\p{L}+/gu)].map((m) => ({ text: m[0], start: m.index, end: m.index + m[0].length }));
    const matches = [];
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const lower = tok.text.toLowerCase();
      if (lower === 'x' && i + 1 < tokens.length && tokens[i + 1].text.toLowerCase() === 'ray'
        && X_JOINS.test(source.slice(tok.end, tokens[i + 1].start))) {
        const end = tokens[i + 1].end;
        const found = source.slice(tok.start, end);
        matches.push({ start: tok.start, end, text: found, char: 'X', canon: 'X-ray', kind: 'letter',
          variant: /^x-ray$/i.test(found) ? null : 'spelling' });
        i += 1;
        continue;
      }
      if (lower === 'xray') {
        matches.push({ start: tok.start, end: tok.end, text: tok.text, char: 'X', canon: 'X-ray', kind: 'letter', variant: 'spelling' });
        continue;
      }
      const entry = FIND_WORDS.get(lower) || (digits ? DIGIT_WORDS.get(lower) : undefined);
      if (entry) matches.push({ start: tok.start, end: tok.end, text: tok.text, ...entry });
    }
    // 続けて並んだ語のまとまり：あいだが空白・句読点・改行だけなら同じまとまり
    const runs = [];
    let current = [];
    matches.forEach((m, k) => {
      if (k > 0 && GAP_IN_RUN.test(source.slice(matches[k - 1].end, m.start))) current.push(k);
      else { if (current.length) runs.push(current); current = [k]; }
    });
    if (current.length) runs.push(current);
    const sequences = runs.filter((r) => r.length >= 2);
    const singles = runs.filter((r) => r.length === 1).map((r) => r[0]);
    sequences.forEach((r, n) => r.forEach((k) => { matches[k].run = n; matches[k].inSequence = true; }));
    for (const k of singles) { matches[k].run = null; matches[k].inSequence = false; }
    const decodedRuns = sequences.map((r) => r.map((k) => matches[k].char).join(''));
    // 揺れの一覧：同じ形（大文字と小文字を区別しない・空白類は1つの空白に）は1行にまとめ、最初に出た順に並べる
    const variants = [];
    const seen = new Set();
    for (const m of matches) {
      if (!m.variant) continue;
      const key = m.text.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) continue;
      seen.add(key);
      variants.push({ text: m.text.replace(/\s+/g, ' '), canon: m.canon, char: m.char, variant: m.variant });
    }
    return { matches, sequences, singles, decodedRuns, decoded: decodedRuns.join(' '), variants };
  }

  // 英字の列を読み上げる順（続けて並んだ語だけ）。text は通話表の綴りを読み上げ用に置き換えたもの
  function findQueue(result) {
    return result.sequences.flat().map((k) => ({ index: k, text: speechText(result.matches[k].icao || result.matches[k].canon) }));
  }

  // ===== 読み上げの声：言語が en で始まる声から1つ（en-US、en-GB、そのほかの en の順。同じなら端末に入っている声を先に） =====
  function pickVoice(voices) {
    const list = Array.from(voices || []).filter((v) => v && /^en(?:[-_]|$)/i.test(String(v.lang || '')));
    if (!list.length) return null;
    const rank = (v) => {
      const lang = String(v.lang).replace('_', '-').toLowerCase();
      return (lang === 'en-us' ? 0 : lang === 'en-gb' ? 1 : 2) * 2 + (v.localService === false ? 1 : 0);
    };
    return list.slice().sort((a, b) => rank(a) - rank(b))[0];
  }

  // ===== 日本語の文の折り返してよい位置 =====
  // 助詞のあと（次がひらがなでないとき）・句読点のあと・カタカナと漢字の境目・英字とカタカナの境目・開きかっこの前・閉じかっこのあとで区切る。
  // ZWSP（U+200B）は明示の区切り。行頭に来てはいけない文字の前では区切らない。日本語を含まない文はそのまま返す。
  const ZWSP = String.fromCharCode(0x200b);
  const PARTICLES = 'のでをにがはとかもへや';
  // 2文字以上の助詞など（次がひらがなでないときは、そのあとで区切る）
  const TAIL_WORDS = ['から', 'まで', 'より', 'ずつ', 'ように', 'ため', 'とき', 'ごと'];
  const WHOLE_WORDS = ['ドイツ語', '通話表ツール'];
  const NO_LINE_START = '、。，．・：；？！ー）」』】〕ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ〜';
  const scriptOf = (ch) => (/[゠-ヿ]/.test(ch) ? 'katakana' : /[㐀-䶿一-鿿]/.test(ch) ? 'kanji'
    : /[぀-ゟ]/.test(ch) ? 'hiragana' : /[A-Za-z0-9]/.test(ch) ? 'latin' : 'other');
  function phrases(text) {
    const source = String(text);
    if (!/[぀-ヿ㐀-䶿一-鿿]/.test(source)) return source.split(ZWSP).filter((p) => p !== '');
    const chars = Array.from(source);
    // 短いかぎかっこ（「朝日のア」など10文字まで）の中では区切らない
    const inside = new Set();
    let open = -1;
    chars.forEach((ch, i) => {
      if (ch === '「') open = i;
      else if (ch === '」' && open >= 0) {
        if (i - open <= 11) for (let k = open; k < i; k++) inside.add(k);
        open = -1;
      }
    });
    // 英字の組（MとN）の中では区切らない
    for (const m of source.matchAll(/[A-Za-z0-9]と[A-Za-z0-9]/g)) {
      const start = Array.from(source.slice(0, m.index)).length;
      inside.add(start);
      inside.add(start + 1);
    }
    // 1語として扱う語（カタカナと漢字の境目でも区切らない）
    for (const word of WHOLE_WORDS) {
      const size = Array.from(word).length;
      for (let at = source.indexOf(word); at >= 0; at = source.indexOf(word, at + word.length)) {
        const start = Array.from(source.slice(0, at)).length;
        for (let k = start; k < start + size - 1; k++) inside.add(k);
      }
    }
    const out = [];
    let piece = '';
    chars.forEach((ch, i) => {
      if (ch === ZWSP) { if (piece) out.push(piece); piece = ''; return; }
      piece += ch;
      const next = chars[i + 1];
      if (next === undefined || next === ZWSP || NO_LINE_START.includes(next) || inside.has(i)) return;
      const a = scriptOf(ch), b = scriptOf(next);
      const tail = chars.slice(Math.max(0, i - 2), i + 1).join('');
      let run = 0;
      for (let k = i; k >= 0 && scriptOf(chars[k]) === 'hiragana'; k--) run += 1;
      const cut = (PARTICLES.includes(ch) && b !== 'hiragana')
        || (a === 'hiragana' && b === 'kanji' && run >= 2)
        || (b !== 'hiragana' && TAIL_WORDS.some((w) => tail.endsWith(w)))
        || (a === 'katakana' && b === 'kanji') || (a === 'kanji' && b === 'katakana') || (a === 'latin' && b === 'katakana')
        || ((next === '（' || next === '「') && !' （「'.includes(ch)) || (ch === '）' && b !== 'hiragana') || (ch === '」' && b !== 'hiragana')
        || '、。・：'.includes(ch);
      if (cut) { out.push(piece); piece = ''; }
    });
    if (piece) out.push(piece);
    return out;
  }

  // 数の表示（3桁ごとのコンマ）
  function formatNumber(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  return Object.freeze({
    MAX_SPELL, MAX_FIND, RATES, GAP_MS, LETTERS, DIGITS, SYMBOLS, SPACE_WORD, CAPITAL, SMALL, SPEECH_REPLACE,
    speechText, clampText, spell, countTypes, copyLine, speechQueue, find, findQueue, pickVoice, phrases, formatNumber,
  });
}));
