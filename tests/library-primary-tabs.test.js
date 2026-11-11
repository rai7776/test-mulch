const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'learning-ui.css'), 'utf8');

test('All five destinations share one navigation component with a single active tab', () => {
  const navigation = index.split('<nav class="library-primary-tabs"')[1].split('</nav>')[0];
  assert.match(navigation, /data-main-nav/);
  assert.match(navigation, /data-active-tab="library"/);
  const shared = fs.readFileSync(path.join(root, 'main-navigation.js'), 'utf8');
  for (const id of ['library','discover','vocabulary','study','problems']) {
    assert.match(shared, new RegExp("id: '" + id + "'"));
  }
  assert.match(shared, /setAttribute\('aria-current', 'page'\)/);
  assert.match(css, /overflow-x:auto/);
});
test('folder breadcrumbs are accessible and hidden only at Library home', () => {
  assert.ok(index.includes('id="breadcrumbs" class="breadcrumbs" aria-label="フォルダの場所"'));
  assert.ok(css.includes('#library-section:not(.in-folder) #breadcrumbs { display:none; }'));
});
