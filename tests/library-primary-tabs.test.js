const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'library-toolbar-polish.css'), 'utf8');

test('Library exposes four primary tabs in a single equal-width navigation', () => {
  assert.match(index, /class="library-primary-tab is-active"[^>]*>Library<\/button>/);
  assert.match(index, /class="library-primary-tab"[^>]*>Vocabulary<\/button>/);
  assert.match(index, /class="library-primary-tab study-center-entry-button"[^>]*>Study<\/button>/);
  assert.match(index, /class="library-primary-tab"[^>]*>Problems<\/button>/);
  assert.match(css, /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
});

test('root Library breadcrumb no longer duplicates the current Library tab', () => {
  assert.doesNotMatch(app, /🏠 本棚/);
  assert.match(app, /bc\.style\.display = path\.length \? '' : 'none'/);
});
