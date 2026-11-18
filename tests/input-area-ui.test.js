const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'learning-ui.css'), 'utf8');

const inputArea = index.slice(index.indexOf('<div id="input-area"'), index.indexOf('<div id="import-review-area"'));

test('Registration header shows the save destination and its folder link', () => {
  assert.match(inputArea, /id="input-destination-label"/);
  assert.match(inputArea, /id="input-destination-link"[^>]*style="display:none;"/);
  assert.match(app, /function updateInputDestination\(folderId\)/);
  assert.match(app, /updateInputDestination\(currentFolderId\)/);
  assert.match(app, /保存先：/);
});

test('Paste buttons sit on the label rows and fail silently', () => {
  assert.match(inputArea, /onclick="pasteIntoField\('text-url'\)"/);
  assert.match(inputArea, /onclick="pasteIntoField\('text-input'\)"/);
  assert.match(app, /async function pasteIntoField\(id\)/);
  assert.match(app, /navigator\.clipboard\.readText\(\)/);
});

test('Body field is compact with a character count and a full-screen editor', () => {
  assert.match(inputArea, /id="text-input-count"/);
  assert.match(inputArea, /id="body-editor-overlay"/);
  assert.match(inputArea, /onclick="openBodyEditor\(\)"/);
  assert.match(inputArea, /onclick="closeBodyEditor\(true\)"/);
  assert.match(app, /function openBodyEditor\(\)/);
  assert.match(app, /function closeBodyEditor\(apply\)/);
  assert.match(css, /\.full-width-form textarea \{ height:188px; min-height:188px;/);
  assert.match(css, /\.full-width-form input \{ height:40px;[^}]*font-size:16px;/);
});

test('Actions stick to the bottom and chapter mode is a slim toggle row', () => {
  assert.match(inputArea, /onclick="saveNewArticle\(\)"/);
  assert.match(inputArea, /id="manual-chapter-mode"/);
  assert.match(css, /\.input-card \.input-actions \{\s*position:sticky; bottom:0;/);
  assert.match(css, /\.chapter-mode-option input\[type="checkbox"\]:checked \{ background:#6f5a48; \}/);
  assert.match(css, /\.file-label \{[^}]*min-height:60px;/);
});
