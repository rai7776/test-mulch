const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const polish = fs.readFileSync(path.join(root, 'library-toolbar-polish.css'), 'utf8');

test('Library search exposes compact option toggles including prefix matching', () => {
  assert.match(index, /id="global-search-whole-word"/);
  assert.match(index, /id="global-search-prefix"/);
  assert.match(index, /id="global-search-case-sensitive"/);
  assert.match(index, />単語一致</);
  assert.match(index, />前方一致</);
  assert.match(index, />Aa 区別</);
  assert.match(polish, /\.library-search-option input:checked \+ span/);
});

test('Library prefix mode only keeps matches at the start of each searched field', () => {
  assert.match(app, /prefixOnly:\s*false/);
  assert.match(app, /global-search-prefix/);
  assert.match(app, /prefixOnly:\s*!!prefixOnly\?\.checked/);
  assert.match(app, /options\?\.prefixOnly \? matches\.filter\(match => match\.index === 0\) : matches/);
});

test('Library toolbar no longer duplicates full backup and restore actions', () => {
  const libraryBlock = index.slice(index.indexOf('<div id="library-section">'), index.indexOf('<div id="vocabulary-section"'));
  assert.doesNotMatch(libraryBlock, /onclick="exportSmartReaderBackup\(\)"/);
  assert.doesNotMatch(libraryBlock, /onclick="openSmartReaderRestore\(\)"/);
  assert.match(libraryBlock, /id="backup-file-input"/);
});
