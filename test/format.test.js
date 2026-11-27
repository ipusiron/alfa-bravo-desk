'use strict';
// 書式：1行に詰め込んだファイルがない（最長行と行数の下限）
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

const LIMITS = { 'index.html': [250, 150], 'style.css': [160, 150], 'app.js': [160, 250], 'theme-init.js': [160, 8],
  'js/abd-core.js': [160, 150], 'js/messages.js': [160, 250], 'js/i18n.js': [160, 50] };

test('最長行と行数の下限', () => {
  for (const [file, [maxLine, minLines]] of Object.entries(LIMITS)) {
    const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
    const longest = Math.max(...lines.map((l) => l.length));
    assert.ok(longest <= maxLine, `${file}: longest line ${longest}`);
    assert.ok(lines.length >= minLines, `${file}: ${lines.length} lines`);
  }
  for (const file of fs.readdirSync(path.join(root, 'test')).filter((f) => f.endsWith('.js'))) {
    const lines = fs.readFileSync(path.join(root, 'test', file), 'utf8').split('\n');
    assert.ok(Math.max(...lines.map((l) => l.length)) <= 160, file);
  }
});
