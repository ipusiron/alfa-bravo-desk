'use strict';
// 日英の辞書：同じキーと差し込む値、英語に日本語を残さない、和文と英数字の間に空白を入れない、使わない語、記号の名前、言語の選び方
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/messages.js');
const C = require('../js/abd-core.js');
const I18n = require('../js/i18n.js');

const JAPANESE = /[　-〿぀-ヿ㐀-䶿一-鿿豈-﫿！-｠]/;
const placeholders = (s) => [...s.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]).sort();
// 画面で使わない語（直訳調の語・勧める言い方・表記の決まり）
const AVOIDED = ['効く', '走る', '照合', '突き合わせ', '断定', '構図', '落とし穴', '潰す', '向き合', 'おすすめ', 'オススメ', 'てみる', 'てみて',
  '分かる', '全て', '既に', '無い', '出来る'];

test('日英で同じキー・空でない文字列・同じ差し込む値', () => {
  assert.deepEqual(Object.keys(M.ja).sort(), Object.keys(M.en).sort());
  for (const key of Object.keys(M.ja)) {
    assert.equal(typeof M.ja[key], 'string', key);
    assert.ok(M.ja[key].trim() && M.en[key].trim(), key);
    assert.deepEqual(placeholders(M.ja[key]), placeholders(M.en[key]), key);
  }
});

test('英語の値に日本語の文字と全角の記号がない', () => {
  for (const [key, value] of Object.entries(M.en)) assert.doesNotMatch(value, JAPANESE, `${key}: ${value}`);
  assert.ok(M.ja.languageToggle.startsWith('EN：'));
  assert.ok(M.en.languageToggle.startsWith('JA: '));
});

test('日本語の値：和文と英数字の間に半角の空白を入れない（値を差し込んだ形も）', () => {
  const ja = '[\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff]';
  const pattern = new RegExp(`${ja} [A-Za-z0-9]|[A-Za-z0-9] ${ja}`);
  for (const [key, value] of Object.entries(M.ja)) {
    assert.doesNotMatch(value, pattern, key);
    assert.doesNotMatch(value.replace(/\{[a-zA-Z0-9_]+\}/g, '0'), pattern, key);
    assert.doesNotMatch(value.replace(/\{[a-zA-Z0-9_]+\}/g, 'Alfa'), pattern, key);
  }
});

test('日本語の値は使わない語を含まない。英語の値も勧める言い方をしない', () => {
  for (const [key, value] of Object.entries(M.ja)) {
    for (const word of AVOIDED) assert.ok(!value.includes(word), `${key} uses ${word}`);
  }
  for (const [key, value] of Object.entries(M.en)) assert.doesNotMatch(value, /\brecommend|\btry it\b/i, key);
});

test('記号の名前：計算部の18個の記号と辞書の symbol.<id> が一対一', () => {
  const ids = C.SYMBOLS.map((s) => 'symbol.' + s.id).sort();
  const keys = Object.keys(M.ja).filter((k) => k.startsWith('symbol.')).sort();
  assert.deepEqual(keys, ids);
  for (const s of C.SYMBOLS) assert.equal(M.en['symbol.' + s.id], s.name);
});

test('値を差し込む文：差し込んだ形を読む', () => {
  assert.equal(M.t('resultSummary', { n: 9, parts: '英字6・数字2・記号1' }, 'ja'), '9文字（英字6・数字2・記号1）');
  assert.equal(M.t('spellReading', { n: 3 }, 'ja'), '3文字目を読んでいます');
  assert.equal(M.t('foundCount', { n: 7, seq: 6, single: 1 }, 'ja'), '見つかった数：7語（続けて並んだ語6・単独の語1）');
  assert.equal(M.t('overLimit', { max: '200' }, 'ja'), '200文字までです。超えた分は入りません。');
  assert.equal(M.t('overLimit', { max: '5,000' }, 'ja'), '5,000文字までです。超えた分は入りません。');
  assert.equal(M.t('counter', { n: '9', max: '200' }, 'ja'), '9／200文字');
  assert.equal(M.t('variantIcao', { word: 'Nine' }, 'ja'), 'Nine（ICAO式の数字）');
  assert.equal(M.t('singleItem', { word: 'hotel', ch: 'H' }, 'en'), 'hotel (H)');
  assert.equal(M.t('cardSpeak', { ch: 'A', word: 'Alfa' }, 'ja'), 'A：Alfaを読み上げる');
  assert.equal(M.t('spellSkipped', { n: 2 }, 'en'), 'Symbols without a name and characters without a code word (2) are skipped.');
});

test('言語の選び方：?lang= → 保存した選択 → ブラウザーの言語（日本語以外は英語）', () => {
  assert.equal(I18n.detectLanguage('?lang=en', 'ja', 'ja-JP'), 'en');
  assert.equal(I18n.detectLanguage('?lang=xx', 'en', 'ja-JP'), 'en');
  assert.equal(I18n.detectLanguage('', null, 'ja-JP'), 'ja');
  assert.equal(I18n.detectLanguage('', null, 'fr-FR'), 'en');
  assert.equal(I18n.detectLanguage('', 'zz', ''), 'en');
  assert.equal(I18n.STORAGE_KEY, 'alfa-bravo-desk.lang');
});
