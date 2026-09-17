const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'workspace-management-ui.js'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'note-structure-ui.js'), 'utf8');

test('workspace management observer does not rerender an existing section', () => {
  const match = source.match(/function ensureSection\(\) \{([\s\S]*?)\n    \}\n\n    function refreshSection/);
  assert.ok(match, 'ensureSection should be separated from refreshSection');
  assert.match(match[1], /if \(!section\) \{/);
  assert.doesNotMatch(match[1], /else\s*\{[\s\S]*renderSection\(section\)/);
  assert.match(match[1], /return section;/);
  assert.match(source, /new MutationObserver\(\(\) => ensureSection\(\)\)/);
});

test('workspace state changes refresh management controls explicitly', () => {
  assert.match(source, /function refreshSection\(\)/);
  assert.match(source, /if \(section\) renderSection\(section\)/);
  assert.match(source, /smartreader:workspace-ready[\s\S]*setTimeout\(refreshSection, 0\)/);
});

test('loader cache-busts the fixed workspace management UI', () => {
  assert.match(loader, /workspace-management-ui\.js\?v=2/);
});
