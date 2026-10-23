const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'learning-ui.css'), 'utf8');

test('Library home exposes three learning destinations without a redundant Library tab', () => {
  const navigation = index.split('<nav class="library-primary-tabs"')[1].split('</nav>')[0];
  assert.equal((navigation.match(/<button/g) || []).length, 3);
  for (const name of ['Vocabulary', 'Study', 'Problems']) assert.ok(navigation.includes('>' + name + '</strong>'));
  assert.ok(navigation.includes('window.showStudyCenter?.()'));
  assert.ok(css.includes('grid-template-columns:repeat(3,minmax(0,1fr))'));
});
test('folder breadcrumbs are accessible and hidden only at Library home', () => {
  assert.ok(index.includes('id="breadcrumbs" class="breadcrumbs" aria-label="フォルダの場所"'));
  assert.ok(css.includes('#library-section:not(.in-folder) #breadcrumbs { display:none; }'));
});
