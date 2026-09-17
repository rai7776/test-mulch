const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'settings-hub.js'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'note-structure-ui.js'), 'utf8');

test('settings hub uses DOM APIs instead of dynamic innerHTML', () => {
  assert.equal(/\.innerHTML\s*=/.test(source), false);
});

test('settings hub exposes the agreed global sections', () => {
  for (const label of ['アカウント', 'バックアップ', '画面設定', '言語', '学習スペース']) {
    assert.match(source, new RegExp(label));
  }
});

test('explanation language and theme are saved through global workspace settings', () => {
  assert.match(source, /updateGlobalSettings/);
  assert.match(source, /explanationLanguage/);
  assert.match(source, /theme/);
});

test('settings hub can switch directly to another workspace with rollback-safe core API', () => {
  assert.match(source, /switchWorkspaceFromSettings/);
  assert.match(source, /api\.switchWorkspace\(dbRef, item\.id, window\.localStorage\)/);
  assert.match(source, /window\.location\.reload\(\)/);
  assert.match(source, /データは元のスペースに戻されています/);
});

test('loader cache-busts updated workspace modules and loads settings hub', () => {
  assert.match(loader, /workspace-core\.js\?v=4/);
  assert.match(loader, /workspace-ui\.js\?v=3/);
  assert.match(loader, /settings-hub\.js\?v=2/);
  assert.match(loader, /settings-hub\.css\?v=1/);
});
