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

  // ===== 英語でよく見る綴り（原典の綴りとは違うもの）。「英字の綴り」で選べる =====
  const COMMON_SPELLINGS = Object.freeze({ A: 'Alpha', J: 'Juliet', W: 'Whisky', X: 'Xray' });
  const LETTER_SPELLINGS = Object.freeze(['official', 'common']);
  const DIGIT_MODES = Object.freeze(['plain', 'icao', 'icaoPlain']);

  // ===== 英字：単語・読み方の目安（カタカナ）・発音の表記（別表第五号）・英語でよく見る綴り =====
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
  ].map(([ch, word, kana, pron]) => Object.freeze({ ch, word, kana, pron, alt: COMMON_SPELLINGS[ch] || null })));

  // ===== 数字：ふつうの英語・ICAO式（原典の綴り）・ICAO式（ふつうの綴り）・読み方の目安 =====
  // ICAO式・ふつうの綴りは、音の違う3・5・9（Tree・Fife・Niner）だけ ICAO式にし、ほかはふつうの英語の綴りにしたもの
  const DIGITS = Object.freeze([
    ['0', 'Zero', 'Zero', 'ゼロ'], ['1', 'One', 'Wun', 'ワン'], ['2', 'Two', 'Too', 'ツー'], ['3', 'Three', 'Tree', 'スリー'],
    ['4', 'Four', 'Fower', 'フォー'], ['5', 'Five', 'Fife', 'ファイブ'], ['6', 'Six', 'Six', 'シックス'], ['7', 'Seven', 'Seven', 'セブン'],
    ['8', 'Eight', 'Ait', 'エイト'], ['9', 'Nine', 'Niner', 'ナイン'],
  ].map(([ch, word, icao, kana]) => Object.freeze({ ch, word, icao, kana, icaoPlain: ['3', '5', '9'].includes(ch) ? icao : word })));

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
  // Fower は「フラワー」に寄らないよう、音の切れ目を入れる。英語でよく見る綴りの Xray は X-ray と同じ音で読ませる。
  const SPEECH_REPLACE = Object.freeze({ Juliett: 'Juliet', Alfa: 'Alpha', Wun: 'One', Too: 'Two', Ait: 'Eight', Fower: 'Fow-er',
    Xray: 'X-ray' });
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
  // options.letterSpelling: 'official'（Alfa・Juliett・X-ray・Whiskey）か 'common'（Alpha・Juliet・Xray・Whisky）
  // options.digitMode: 'plain'（One, Two…）か 'icao'（Wun, Too, Tree…）か 'icaoPlain'（One, Two, Tree…）
  // spoken は読み上げとコピーに使う英語（読まない文字は null）
  function spell(text, options = {}) {
    const caseMode = options.caseMode === 'ignore' ? 'ignore' : 'distinguish';
    const digitMode = DIGIT_MODES.includes(options.digitMode) ? options.digitMode : 'plain';
    const common = options.letterSpelling === 'common';
    const items = Array.from(String(text)).map((ch, index) => {
      const upper = ch.toUpperCase();
      if (/^[A-Za-z]$/.test(ch)) {
        const letter = letterOf.get(upper);
        const letterCase = caseMode === 'ignore' ? null : (ch === upper ? 'capital' : 'small');
        const prefix = letterCase === 'capital' ? CAPITAL + ' ' : letterCase === 'small' ? SMALL + ' ' : '';
        const word = common && letter.alt ? letter.alt : letter.word;
        return { index, ch, type: 'letter', word, letterCase, spoken: prefix + word };
      }
      if (digitOf.has(ch)) {
        const d = digitOf.get(ch);
        const word = digitMode === 'icao' ? d.icao : digitMode === 'icaoPlain' ? d.icaoPlain : d.word;
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

  // 読み上げる順の一覧（読まない文字は飛ばす）。index は表の行の番号（0から）。
  // options.sayCase が false なら、声だけ Capital／Small を言わない（表とコピーはそのまま）
  function speechQueue(items, options = {}) {
    const sayCase = options.sayCase !== false;
    return items.filter((item) => item.spoken !== null)
      .map((item) => ({ index: item.index, text: speechText(!sayCase && item.type === 'letter' ? item.word : item.spoken) }));
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

  // 読み方：'words'＝単語ごと（単語の間に空白がある文章）、'joined'＝英字が切れ目なく続く並び（1文字ずつ空白・改行で区切った並びを含む）
  const FIND_MODES = Object.freeze(['auto', 'words', 'joined']);
  // 自動の判断：英字が切れ目なく続く並びとして読んだとき、読めた英字の割合が AUTO_JOINED_MIN 以上で、
  // 単語ごとに読んだとき（長いまとまりを区切らない読み方）より AUTO_JOINED_MARGIN 以上多ければ、切れ目なく続く並びとして読む
  const AUTO_JOINED_MIN = 0.7;
  const AUTO_JOINED_MARGIN = 0.2;
  // 単語ごとに読むときも、LONG_TOKEN 文字以上のまとまり（通話表の語より長い）は区切ってみて、LONG_TOKEN_MIN 以上読めたら区切った結果を使う
  const LONG_TOKEN = 9;
  const LONG_TOKEN_MIN = 0.8;
  const JOINED_MAX = 8; // 通話表の語の最長（November・Whiskey などは8文字以下）

  const asciiLetters = (s) => (String(s).match(/[A-Za-z]/g) || []).length;
  // 読めた英字の割合（英字がなければ0）
  function readRatio(result, source) {
    const total = asciiLetters(source);
    if (!total) return 0;
    return result.matches.reduce((a, m) => a + asciiLetters(m.text), 0) / total;
  }

  function detectMode(text, digits = true) {
    const source = String(text);
    const words = readRatio(findWords(source, digits, false), source);
    const joined = readRatio(findJoined(source, digits), source);
    return joined >= AUTO_JOINED_MIN && joined - words >= AUTO_JOINED_MARGIN ? 'joined' : 'words';
  }

  function find(text, options = {}) {
    const source = String(text);
    const digits = options.digits !== false;
    const requested = FIND_MODES.includes(options.mode) ? options.mode : 'auto';
    const mode = requested === 'auto' ? detectMode(source, digits) : requested;
    const result = mode === 'joined' ? findJoined(source, digits) : findWords(source, digits, true);
    // 揺れの一覧：同じ形（大文字と小文字を区別しない）は1行にまとめ、最初に出た順に並べる。
    // 区切って読んだ語は、あいだの空白・改行を除いた英字だけで示す
    const variants = [];
    const seen = new Set();
    for (const m of result.matches) {
      if (!m.variant) continue;
      const shown = m.split ? m.text.replace(/[^A-Za-z]/g, '') : m.text.replace(/\s+/g, ' ');
      const key = shown.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      variants.push({ text: shown, canon: m.canon, char: m.char, variant: m.variant });
    }
    return { ...result, mode, auto: requested === 'auto', variants };
  }

  // 英字の並び（小文字）を通話表の語に区切る。読めない文字が最も少なく、同じなら語の数が少ない区切りを動的計画法で選ぶ。
  // 返すのは区切りの並び：{ from, to, word }（word が null の区切りは読めない1文字）
  function segmentLetters(letters, digits) {
    const dict = new Map(FIND_WORDS);
    dict.set('xray', { char: 'X', canon: 'X-ray', variant: null, kind: 'letter' });
    if (digits) for (const [w, e] of DIGIT_WORDS) dict.set(w, e);
    const n = letters.length;
    const best = Array.from({ length: n + 1 }, () => null);
    best[0] = { cost: 0, words: 0, prev: -1, word: null };
    const better = (a, b) => !b || a.cost < b.cost || (a.cost === b.cost && a.words < b.words);
    for (let i = 0; i < n; i++) {
      const skip = { cost: best[i].cost + 1, words: best[i].words, prev: i, word: null };
      if (better(skip, best[i + 1])) best[i + 1] = skip;
      for (let len = 2; len <= JOINED_MAX && i + len <= n; len++) {
        const entry = dict.get(letters.slice(i, i + len));
        if (!entry) continue;
        const take = { cost: best[i].cost, words: best[i].words + 1, prev: i, word: entry };
        if (better(take, best[i + len])) best[i + len] = take;
      }
    }
    const steps = [];
    for (let j = n; j > 0; j = best[j].prev) steps.push({ from: best[j].prev, to: j, word: best[j].word });
    return steps.reverse();
  }

  // 区切りの並びを、語（matches に足す）と読めない部分（続いた読めない文字を1つにまとめる）の並びにする。
  // pos[i] は i 番目の英字の、元の文での位置
  function piecesOf(steps, pos, source) {
    const span = (from, to) => ({ start: pos[from], end: pos[to - 1] + 1, text: source.slice(pos[from], pos[to - 1] + 1) });
    const pieces = [];
    for (const step of steps) {
      const last = pieces[pieces.length - 1];
      if (step.word) pieces.push({ ...span(step.from, step.to), ...step.word, kind: 'word', split: true });
      else if (last && last.kind === 'unread') Object.assign(last, span(last.from, step.to), { letters: last.letters + 1 });
      else pieces.push({ kind: 'unread', ...span(step.from, step.to), from: step.from, letters: 1 });
    }
    return pieces;
  }

  // 語と読めない部分の並び（元の文の順）から、結果の形にまとめる。
  // groups は「続けて並んだ語のまとまり」の候補（部品の番号の配列）。2つ以上の部品からなるまとまりだけを英字の列に入れる
  function assemble(pieces, groups) {
    const matches = [];
    const unread = [];
    const parts = pieces.map((p) => {
      if (p.kind === 'word') {
        const { kind, ...m } = p;
        matches.push(m);
        return { kind: 'word', k: matches.length - 1 };
      }
      unread.push({ start: p.start, end: p.end, text: p.text, letters: p.letters });
      return { kind: 'unread', u: unread.length - 1 };
    });
    const runParts = groups.filter((g) => g.length >= 2).map((g) => g.map((i) => parts[i]));
    const sequences = runParts.map((r) => r.filter((p) => p.kind === 'word').map((p) => p.k)).filter((r) => r.length);
    sequences.forEach((r, n) => r.forEach((k) => { matches[k].run = n; matches[k].inSequence = true; }));
    const singles = [];
    for (const g of groups) {
      if (g.length === 1 && parts[g[0]].kind === 'word') {
        const k = parts[g[0]].k;
        matches[k].run = null;
        matches[k].inSequence = false;
        singles.push(k);
      }
    }
    const decodedRuns = runParts.map((r) => r.map((p) => (p.kind === 'word' ? matches[p.k].char : '?')).join(''));
    return { matches, unread, parts, runParts, sequences, singles, decodedRuns, decoded: decodedRuns.join(' '), splitTokens: 0 };
  }

  // 単語ごとに読む。splitLong が真なら、LONG_TOKEN 文字以上で通話表の語でないまとまりを区切ってみる
  function findWords(source, digits, splitLong) {
    const tokens = [...source.matchAll(/\p{L}+/gu)].map((m) => ({ text: m[0], start: m.index, end: m.index + m[0].length }));
    const pieces = [];
    let splitTokens = 0;
    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const lower = tok.text.toLowerCase();
      if (lower === 'x' && i + 1 < tokens.length && tokens[i + 1].text.toLowerCase() === 'ray'
        && X_JOINS.test(source.slice(tok.end, tokens[i + 1].start))) {
        const end = tokens[i + 1].end;
        const found = source.slice(tok.start, end);
        pieces.push({ kind: 'word', start: tok.start, end, text: found, char: 'X', canon: 'X-ray', variant: /^x-ray$/i.test(found) ? null : 'spelling' });
        i += 1;
        continue;
      }
      if (lower === 'xray') {
        pieces.push({ kind: 'word', start: tok.start, end: tok.end, text: tok.text, char: 'X', canon: 'X-ray', variant: 'spelling' });
        continue;
      }
      const entry = FIND_WORDS.get(lower) || (digits ? DIGIT_WORDS.get(lower) : undefined);
      if (entry) { pieces.push({ start: tok.start, end: tok.end, text: tok.text, ...entry, kind: 'word', wordKind: entry.kind }); continue; }
      if (splitLong && /^[A-Za-z]+$/.test(tok.text) && tok.text.length >= LONG_TOKEN) {
        const pos = Array.from(tok.text, (_, k) => tok.start + k);
        const split = piecesOf(segmentLetters(lower, digits), pos, source);
        const read = split.filter((p) => p.kind === 'word').reduce((a, p) => a + p.text.length, 0);
        if (read / tok.text.length >= LONG_TOKEN_MIN) { pieces.push(...split); splitTokens += 1; }
      }
    }
    // 続けて並んだ語のまとまり：あいだが空白・句読点・改行だけなら同じまとまり
    const groups = [];
    pieces.forEach((p, i) => {
      if (i > 0 && GAP_IN_RUN.test(source.slice(pieces[i - 1].end, p.start))) groups[groups.length - 1].push(i);
      else groups.push([i]);
    });
    return { ...assemble(pieces, groups), splitTokens };
  }

  // 英字が切れ目なく続く並び：英字（A〜Z）だけを1本につなぎ、通話表の語（綴りの揺れ・数字の語を含む）に区切る。
  // 読めない文字が続いた部分は「読めない部分」として1つにまとめ、英字の列ではその部分ごとに「?」を1つ置く。推測では埋めない
  function findJoined(source, digits) {
    const pos = [];
    let letters = '';
    for (const m of source.matchAll(/[A-Za-z]/g)) { pos.push(m.index); letters += m[0].toLowerCase(); }
    const pieces = piecesOf(segmentLetters(letters, digits), pos, source);
    return assemble(pieces, pieces.length ? [pieces.map((_, i) => i)] : []);
  }

  // 入力欄の空白（半角・全角・タブ）と改行を取り除く。count は取り除いた数（CRLF は改行1つ）
  function removeSpaces(text) {
    const source = String(text);
    const count = (source.match(/[ \t　]/g) || []).length;
    return { text: source.replace(/[ \t　]/g, ''), count };
  }
  function removeLineBreaks(text) {
    const source = String(text);
    const count = (source.match(/\r\n|\r|\n/g) || []).length;
    return { text: source.replace(/\r\n|\r|\n/g, ''), count };
  }

  // 英字の列を読み上げる順（続けて並んだ語だけ）。text は通話表の綴りを読み上げ用に置き換えたもの
  function findQueue(result) {
    return result.sequences.flat().map((k) => ({ index: k, text: speechText(result.matches[k].icao || result.matches[k].canon) }));
  }

  // ===== 読み上げの声：英語（en-US、en-GB、そのほかの en の順）→ 日本語（ja）→ そのほかの最初の声。
  // 同じ順位なら端末に入っている声を先に。声がまったくなければ null =====
  function voiceKind(voice) {
    const lang = String((voice && voice.lang) || '').replace('_', '-').toLowerCase();
    return /^en(?:-|$)/.test(lang) ? 'en' : /^ja(?:-|$)/.test(lang) ? 'ja' : 'other';
  }
  function pickVoice(voices) {
    const list = Array.from(voices || []).filter(Boolean);
    if (!list.length) return null;
    const rank = (v) => {
      const lang = String(v.lang || '').replace('_', '-').toLowerCase();
      const kind = voiceKind(v);
      const group = kind === 'en' ? (lang === 'en-us' ? 0 : lang === 'en-gb' ? 1 : 2) : kind === 'ja' ? 3 : 4;
      return group * 2 + (v.localService === false ? 1 : 0);
    };
    // 同じ順位の中では、一覧に出た順を保つ
    return list.map((v, i) => [rank(v), i, v]).sort((a, b) => a[0] - b[0] || a[1] - b[1])[0][2];
  }

  // ===== 日本語の文の折り返してよい位置 =====
  // 助詞のあと（次がひらがなでないとき）・句読点のあと・カタカナと漢字の境目・英字とカタカナの境目・開きかっこの前・閉じかっこのあとで区切る。
  // ZWSP（U+200B）は明示の区切り。行頭に来てはいけない文字の前では区切らない。日本語を含まない文はそのまま返す。
  const ZWSP = String.fromCharCode(0x200b);
  const PARTICLES = 'のでをにがはとかもへや';
  // 2文字以上の助詞など（次がひらがなでないときは、そのあとで区切る）
  const TAIL_WORDS = ['から', 'まで', 'より', 'ずつ', 'ように', 'ため', 'とき', 'ごと'];
  const WHOLE_WORDS = ['ドイツ語', '通話表ツール'];
  const NO_LINE_START = '、。，．・：；？！＝ー）」』】〕ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ〜';
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
    MAX_SPELL, MAX_FIND, RATES, GAP_MS, COMMON_SPELLINGS, LETTER_SPELLINGS, DIGIT_MODES, LETTERS, DIGITS, SYMBOLS, SPACE_WORD, CAPITAL, SMALL, SPEECH_REPLACE,
    speechText, clampText, spell, countTypes, copyLine, speechQueue,
    FIND_MODES, AUTO_JOINED_MIN, AUTO_JOINED_MARGIN, LONG_TOKEN, LONG_TOKEN_MIN, detectMode, readRatio, find, findQueue, removeSpaces, removeLineBreaks,
    pickVoice, voiceKind, phrases, formatNumber,
  });
}));
