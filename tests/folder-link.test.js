const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ui = require('../learning-ui.js');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('folderLinkUrl only returns http(s) URLs stored on folders', () => {
  assert.equal(ui.folderLinkUrl({ type: 'folder', url: 'https://archiveofourown.org/' }), 'https://archiveofourown.org/');
  assert.equal(ui.folderLinkUrl({ type: 'folder', url: 'http://example.com/news' }), 'http://example.com/news');
  assert.equal(ui.folderLinkUrl({ type: 'folder', url: 'javascript:alert(1)' }), null);
  assert.equal(ui.folderLinkUrl({ type: 'folder', url: 'ftp://example.com/' }), null);
  assert.equal(ui.folderLinkUrl({ type: 'folder', url: 'not a url' }), null);
  assert.equal(ui.folderLinkUrl({ type: 'folder' }), null);
  assert.equal(ui.folderLinkUrl({ type: 'article', url: 'https://example.com/' }), null);
  assert.equal(ui.folderLinkUrl(null), null);
});

test('normalizeFolderLinkInput accepts domains, rejects unsafe schemes, empty clears', () => {
  assert.deepEqual(ui.normalizeFolderLinkInput(''), { ok: true, url: null });
  assert.deepEqual(ui.normalizeFolderLinkInput('   '), { ok: true, url: null });
  assert.deepEqual(ui.normalizeFolderLinkInput('archiveofourown.org'), { ok: true, url: 'https://archiveofourown.org/' });
  assert.deepEqual(ui.normalizeFolderLinkInput('https://example.com/a?b=1'), { ok: true, url: 'https://example.com/a?b=1' });
  assert.equal(ui.normalizeFolderLinkInput('javascript:alert(1)').ok, false);
  assert.equal(ui.normalizeFolderLinkInput('data:text/html;base64,x').ok, false);
  assert.equal(ui.normalizeFolderLinkInput('ftp://example.com/').ok, false);
});

test('folder cards and breadcrumb expose the link through the shared helpers', () => {
  assert.match(app, /function editFolderLink\(id\)/);
  assert.match(app, /normalizeFolderLinkInput\(input\)/);
  assert.match(app, /addFolderLinkControls\(card, item\)/);
  const learningUi = fs.readFileSync(path.join(root, 'learning-ui.js'), 'utf8');
  assert.match(learningUi, /breadcrumb-folder-link/);
  assert.match(learningUi, /folderLinkUrl\(folder\)/);
});
