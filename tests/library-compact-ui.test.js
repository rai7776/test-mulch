const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const polish = fs.readFileSync(path.join(root, 'library-toolbar-polish.css'), 'utf8');
const folderPanel = fs.readFileSync(path.join(root, 'folder-panel-context.js'), 'utf8');

test('Library search options are collapsed by default behind a toggle', () => {
  assert.match(index, /id="library-search-options-toggle"[^>]*aria-expanded="false"/);
  assert.match(index, /id="library-search-options-toggle"[^>]*onclick="toggleLibrarySearchOptions\(\)"/);
  assert.match(index, /class="library-search-options" id="library-search-options"/);
  assert.match(app, /function toggleLibrarySearchOptions\(\)/);
  assert.match(app, /classList\.toggle\('is-open'\)/);
  assert.match(polish, /#library-section \.library-search-options \{\s*display: none;/);
  assert.match(polish, /\.library-search-options\.is-open \{\s*display: flex;/);
  // The existing option inputs keep their ids and handlers.
  assert.match(index, /id="global-search-whole-word" onchange="performGlobalSearch\(\)"/);
  assert.match(index, /id="global-search-prefix" onchange="performGlobalSearch\(\)"/);
  assert.match(index, /id="global-search-case-sensitive" onchange="performGlobalSearch\(\)"/);
});

test('Folder study bar is a slim single row', () => {
  assert.match(folderPanel, /\.folder-study-bar button\{[^}]*min-height:34px/);
  assert.doesNotMatch(folderPanel, /\.folder-study-bar button\{[^}]*min-height:48px/);
});
