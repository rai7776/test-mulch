const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const jsFiles = fs.readdirSync(root).filter(name => name.endsWith('.js'));

function read(name) {
  return fs.readFileSync(path.join(root, name), 'utf8');
}

test('dangerous dynamic-code primitives are not used', () => {
  const forbidden = [
    /\beval\s*\(/,
    /\bnew\s+Function\s*\(/,
    /document\.write\s*\(/,
    /document\.writeln\s*\(/
  ];
  for (const file of jsFiles) {
    const source = read(file);
    for (const pattern of forbidden) {
      assert.equal(pattern.test(source), false, `${file} contains forbidden primitive ${pattern}`);
    }
  }
});

test('known user-controlled values are not directly interpolated into HTML', () => {
  const checks = [
    ['app.js', /\$\{\s*item\.name\s*\}/],
    ['app.js', /\$\{\s*article\.name\s*\}/],
    ['app.js', /\$\{\s*source\.word\.meaning\s*\}/],
    ['flashcard-study.js', /\$\{\s*wordText\s*\}/],
    ['flashcard-study.js', /\$\{\s*meaning\s*\}/]
  ];
  for (const [file, pattern] of checks) {
    assert.equal(pattern.test(read(file)), false, `${file} directly interpolates a user-controlled value into HTML`);
  }
});

test('external source links are guarded by the shared URL sanitizer', () => {
  const foundation = read('smart-reader-foundation-core.js');
  assert.match(foundation, /ALLOWED_EXTERNAL_PROTOCOLS/);
  assert.match(foundation, /noopener noreferrer/);
  assert.match(foundation, /sanitizeExternalUrl/);
});

test('LocalForage runtime version is explicitly checked until the CDN URL is pinned', () => {
  const foundation = read('smart-reader-foundation-core.js');
  assert.match(foundation, /EXPECTED_LOCALFORAGE_VERSION/);
  assert.match(foundation, /localforage/i);
});
