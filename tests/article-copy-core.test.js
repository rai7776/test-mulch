const test = require('node:test');
const assert = require('node:assert/strict');
const copyCore = require('../article-copy-core.js');
const workspace = require('../workspace-core.js');

function createFakeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    async getItem(key) { return store.has(key) ? store.get(key) : null; },
    async setItem(key, value) { store.set(key, value); return value; }
  };
}

function deterministicIdFactory() {
  let n = 0;
  return prefix => `${prefix}-copy-${++n}`;
}

test('cloneArticleForWorkspace copies learning content but resets learning/read state', () => {
  const source = {
    id: 10,
    type: 'article',
    name: 'Source',
    parentId: 5,
    content: 'Text',
    readingPosition: { chapterId: 'c1', paragraphIndex: 3 },
    readingPositions: { c1: { paragraphIndex: 3 } },
    chapters: [{ id: 'c1', title: 'One', content: 'Text' }],
    words: [{ id: 20, word: 'alpha', meaning: 'A', chapterId: 'c1', memorized: true, study: { seenCount: 4, dueAt: 999 } }],
    notes: [{ id: 30, originalText: 'Text', translation: '訳', chapterId: 'c1', structure: { annotations: [{ id: 'a1', text: 'Text' }] } }],
    bookmarks: [{ id: 40, text: 'mark', chapterId: 'c1' }],
    questions: [{ id: 50, question: 'Q', answer: 'A', chapterId: 'c1', attempts: [{ result: 'correct' }], needsReview: true }]
  };

  const copied = copyCore.cloneArticleForWorkspace(source, {
    now: 1000,
    idFactory: deterministicIdFactory()
  });

  assert.equal(copied.id, 'article-copy-1');
  assert.equal(copied.parentId, null);
  assert.equal(copied.readingPosition, undefined);
  assert.equal(copied.readingPositions, undefined);
  assert.equal(copied.copiedFrom.articleId, 10);
  assert.equal(copied.chapters[0].id, 'chapter-copy-2');
  assert.equal(copied.words[0].chapterId, 'chapter-copy-2');
  assert.equal(copied.notes[0].chapterId, 'chapter-copy-2');
  assert.equal(copied.bookmarks[0].chapterId, 'chapter-copy-2');
  assert.equal(copied.questions[0].chapterId, 'chapter-copy-2');
  assert.equal(copied.words[0].id, 'word-copy-3');
  assert.equal(copied.notes[0].id, 'note-copy-4');
  assert.equal(copied.bookmarks[0].id, 'bookmark-copy-5');
  assert.equal(copied.questions[0].id, 'question-copy-6');
  assert.equal(copied.words[0].memorized, false);
  assert.equal(copied.words[0].study, undefined);
  assert.deepEqual(copied.questions[0].attempts, []);
  assert.equal(copied.questions[0].needsReview, false);
  assert.deepEqual(copied.notes[0].structure, source.notes[0].structure);

  copied.notes[0].structure.annotations[0].text = 'Changed';
  assert.equal(source.notes[0].structure.annotations[0].text, 'Text');
});

test('cloneArticleForWorkspace can keep a selected destination folder', () => {
  const source = { id: 10, type: 'article', name: 'Source' };
  const copied = copyCore.cloneArticleForWorkspace(source, {
    now: 10,
    parentId: 'folder-target',
    idFactory: deterministicIdFactory()
  });
  assert.equal(copied.parentId, 'folder-target');
});

test('cloneLibraryItemTree recursively copies a folder and remaps descendants', () => {
  const library = [
    { id: 1, type: 'folder', name: 'Root folder', parentId: null },
    { id: 2, type: 'folder', name: 'Child folder', parentId: 1 },
    { id: 3, type: 'article', name: 'Article', parentId: 2, words: [], notes: [], bookmarks: [], questions: [] },
    { id: 4, type: 'article', name: 'Outside', parentId: null, words: [], notes: [], bookmarks: [], questions: [] }
  ];

  const result = copyCore.cloneLibraryItemTree(library, 1, {
    now: 100,
    parentId: 'destination',
    idFactory: deterministicIdFactory()
  });

  assert.equal(result.items.length, 3);
  assert.equal(result.rootItem.type, 'folder');
  assert.equal(result.rootItem.parentId, 'destination');
  const copiedChild = result.items.find(item => item.type === 'folder' && item !== result.rootItem);
  const copiedArticle = result.items.find(item => item.type === 'article');
  assert.equal(copiedChild.parentId, result.rootItem.id);
  assert.equal(copiedArticle.parentId, copiedChild.id);
  assert.equal(result.items.some(item => item.name === 'Outside'), false);
});

test('copyArticleToWorkspace writes to inactive workspace root without switching', async () => {
  const english = workspace.createDefaultWorkspace(1);
  const japanese = workspace.createWorkspace({
    id: 'workspace-ja', name: '日本語', kind: 'language', contentLanguage: 'ja'
  }, 2);
  const source = { id: 10, type: 'article', name: 'Source', words: [], notes: [], bookmarks: [], questions: [] };
  const db = createFakeDb({
    [workspace.WORKSPACES_KEY]: [english, japanese],
    [workspace.ACTIVE_WORKSPACE_KEY]: english.id,
    [workspace.GLOBAL_SETTINGS_KEY]: { explanationLanguage: 'ja' },
    library_items: [source],
    [japanese.libraryKey]: []
  });

  const result = await copyCore.copyArticleToWorkspace(db, workspace, source, japanese.id, {
    now: 100,
    idFactory: deterministicIdFactory()
  });

  assert.equal(result.workspace.id, japanese.id);
  assert.equal(result.libraryKey, japanese.libraryKey);
  const target = await db.getItem(japanese.libraryKey);
  assert.equal(target.length, 1);
  assert.equal(target[0].name, 'Source');
  assert.equal(target[0].parentId, null);
  assert.equal(await db.getItem(workspace.ACTIVE_WORKSPACE_KEY), english.id);
  assert.equal((await db.getItem('library_items')).length, 1);
});

test('copyLibraryItemToWorkspace can duplicate an item inside the current workspace', async () => {
  const english = workspace.createDefaultWorkspace(1);
  const folder = { id: 5, type: 'folder', name: 'Folder', parentId: null };
  const source = { id: 10, type: 'article', name: 'Source', parentId: 5, words: [], notes: [], bookmarks: [], questions: [] };
  const db = createFakeDb({
    [workspace.WORKSPACES_KEY]: [english],
    [workspace.ACTIVE_WORKSPACE_KEY]: english.id,
    [workspace.GLOBAL_SETTINGS_KEY]: { explanationLanguage: 'ja' },
    library_items: [folder, source]
  });

  const result = await copyCore.copyLibraryItemToWorkspace(
    db,
    workspace,
    [folder, source],
    source.id,
    english.id,
    {
      allowCurrent: true,
      activeLibrary: [folder, source],
      targetParentId: folder.id,
      now: 200,
      idFactory: deterministicIdFactory()
    }
  );

  assert.equal(result.workspace.id, english.id);
  assert.equal(result.rootItem.name, 'Source');
  assert.equal(result.rootItem.parentId, folder.id);
  assert.notEqual(result.rootItem.id, source.id);
  const stored = await db.getItem('library_items');
  assert.equal(stored.length, 3);
  assert.equal(stored.filter(item => item.name === 'Source').length, 2);
});

test('copyArticleToWorkspace rejects current workspace by default', async () => {
  const english = workspace.createDefaultWorkspace(1);
  const source = { id: 10, type: 'article', name: 'Source' };
  const db = createFakeDb({
    [workspace.WORKSPACES_KEY]: [english],
    [workspace.ACTIVE_WORKSPACE_KEY]: english.id,
    [workspace.GLOBAL_SETTINGS_KEY]: { explanationLanguage: 'ja' },
    library_items: [source]
  });
  await assert.rejects(
    () => copyCore.copyArticleToWorkspace(db, workspace, source, english.id),
    /current workspace/
  );
});
