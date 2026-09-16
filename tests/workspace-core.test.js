const test = require('node:test');
const assert = require('node:assert/strict');
const workspace = require('../workspace-core.js');

function createFakeDb(seed = {}, options = {}) {
  const store = new Map(Object.entries(seed));
  let failed = false;
  return {
    store,
    async getItem(key) { return store.has(key) ? store.get(key) : null; },
    async setItem(key, value) {
      if (!failed && options.failSetKey && key === options.failSetKey) {
        failed = true;
        throw new Error(`Injected setItem failure for ${key}`);
      }
      store.set(key, value);
      return value;
    },
    async removeItem(key) { store.delete(key); }
  };
}

test('legacy data is represented as one English workspace without copying library data', async () => {
  const legacyLibrary = [{ id: 1, type: 'article', name: 'Legacy article' }];
  const db = createFakeDb({ library_items: legacyLibrary, study_history_v1: [{ id: 1 }] });
  const result = await workspace.migrateToWorkspaceMetadata(db, 1, 2, 123456);

  assert.equal(result.workspaces.length, 1);
  assert.deepEqual(result.workspaces[0], {
    id: 'workspace-english',
    name: '英語',
    kind: 'language',
    contentLanguage: 'en',
    explanationLanguageOverride: null,
    libraryKey: 'library_items',
    studyHistoryKey: 'study_history_v1',
    createdAt: 123456,
    migratedFromLegacy: true
  });
  assert.equal(result.activeWorkspaceId, 'workspace-english');
  assert.deepEqual(await db.getItem('library_items'), legacyLibrary);
});

test('workspace migration is idempotent and keeps existing metadata', async () => {
  const custom = workspace.createWorkspace({
    id: 'workspace-japanese',
    name: 'Japanese',
    kind: 'language',
    contentLanguage: 'ja'
  }, 100);
  const db = createFakeDb({
    [workspace.WORKSPACES_KEY]: [custom],
    [workspace.ACTIVE_WORKSPACE_KEY]: custom.id,
    [workspace.GLOBAL_SETTINGS_KEY]: { explanationLanguage: 'en' }
  });

  await workspace.migrateToWorkspaceMetadata(db, 1, 2, 200);
  assert.deepEqual(await db.getItem(workspace.WORKSPACES_KEY), [custom]);
  assert.equal(await db.getItem(workspace.ACTIVE_WORKSPACE_KEY), custom.id);
  assert.deepEqual(await db.getItem(workspace.GLOBAL_SETTINGS_KEY), { explanationLanguage: 'en' });
});

test('invalid active workspace falls back to the first workspace', async () => {
  const custom = workspace.createWorkspace({
    id: 'workspace-it',
    name: 'IT Passport',
    kind: 'general'
  }, 100);
  const db = createFakeDb({
    [workspace.WORKSPACES_KEY]: [custom],
    [workspace.ACTIVE_WORKSPACE_KEY]: 'missing'
  });
  await workspace.migrateToWorkspaceMetadata(db, 1, 2, 200);
  assert.equal(await db.getItem(workspace.ACTIVE_WORKSPACE_KEY), custom.id);
});

test('workspace state self-repairs after restoring a legacy backup without workspace metadata', async () => {
  const legacyLibrary = [{ id: 9, type: 'article', name: 'Restored legacy article' }];
  const db = createFakeDb({ library_items: legacyLibrary });
  const state = await workspace.readWorkspaceState(db);

  assert.equal(state.workspaces.length, 1);
  assert.equal(state.activeWorkspaceId, workspace.DEFAULT_WORKSPACE_ID);
  assert.equal(state.activeWorkspace.libraryKey, 'library_items');
  assert.equal(state.globalSettings.explanationLanguage, 'ja');
  assert.deepEqual(await db.getItem('library_items'), legacyLibrary);
});

test('language workspace requires contentLanguage', () => {
  assert.throws(() => workspace.createWorkspace({
    id: 'workspace-x',
    name: 'X',
    kind: 'language'
  }), /contentLanguage/);
});

test('general workspace does not require contentLanguage', () => {
  const result = workspace.createWorkspace({
    id: 'workspace-general',
    name: '資格',
    kind: 'general'
  }, 10);
  assert.equal(result.kind, 'general');
  assert.equal(result.contentLanguage, '');
});

test('switchWorkspace archives current data and restores target data through legacy active keys', async () => {
  const englishLibrary = [{ id: 1, type: 'article', name: 'English' }];
  const englishHistory = [{ sessionId: 'en-1' }];
  const japanese = workspace.createWorkspace({
    id: 'workspace-japanese',
    name: '日本語',
    kind: 'language',
    contentLanguage: 'ja'
  }, 100);
  const japaneseLibrary = [{ id: 2, type: 'article', name: '日本語' }];
  const japaneseHistory = [{ sessionId: 'ja-1' }];
  const english = workspace.createDefaultWorkspace(1);
  const db = createFakeDb({
    [workspace.WORKSPACES_KEY]: [english, japanese],
    [workspace.ACTIVE_WORKSPACE_KEY]: english.id,
    [workspace.GLOBAL_SETTINGS_KEY]: { explanationLanguage: 'ja' },
    [workspace.ACTIVE_LIBRARY_KEY]: englishLibrary,
    [workspace.ACTIVE_STUDY_HISTORY_KEY]: englishHistory,
    [japanese.libraryKey]: japaneseLibrary,
    [japanese.studyHistoryKey]: japaneseHistory
  });

  const next = await workspace.switchWorkspace(db, japanese.id);
  assert.equal(next.activeWorkspaceId, japanese.id);
  assert.deepEqual(await db.getItem(workspace.ACTIVE_LIBRARY_KEY), japaneseLibrary);
  assert.deepEqual(await db.getItem(workspace.ACTIVE_STUDY_HISTORY_KEY), japaneseHistory);
  assert.deepEqual(await db.getItem(workspace.dedicatedLibraryKey(english.id)), englishLibrary);
  assert.deepEqual(await db.getItem(workspace.dedicatedStudyHistoryKey(english.id)), englishHistory);
  assert.equal(await db.getItem(japanese.libraryKey), null);
  assert.equal(await db.getItem(japanese.studyHistoryKey), null);

  const savedWorkspaces = await db.getItem(workspace.WORKSPACES_KEY);
  assert.equal(workspace.getWorkspaceById(savedWorkspaces, english.id).libraryKey, workspace.dedicatedLibraryKey(english.id));
  assert.equal(workspace.getWorkspaceById(savedWorkspaces, japanese.id).libraryKey, workspace.ACTIVE_LIBRARY_KEY);
});

test('switchWorkspace round-trip preserves edits in both workspaces', async () => {
  const english = workspace.createDefaultWorkspace(1);
  const japanese = workspace.createWorkspace({
    id: 'workspace-japanese',
    name: '日本語',
    kind: 'language',
    contentLanguage: 'ja'
  }, 2);
  const db = createFakeDb({
    [workspace.WORKSPACES_KEY]: [english, japanese],
    [workspace.ACTIVE_WORKSPACE_KEY]: english.id,
    [workspace.GLOBAL_SETTINGS_KEY]: { explanationLanguage: 'ja' },
    [workspace.ACTIVE_LIBRARY_KEY]: [{ id: 1, name: 'English A' }],
    [workspace.ACTIVE_STUDY_HISTORY_KEY]: [],
    [japanese.libraryKey]: [{ id: 2, name: 'Japanese A' }],
    [japanese.studyHistoryKey]: []
  });

  await workspace.switchWorkspace(db, japanese.id);
  await db.setItem(workspace.ACTIVE_LIBRARY_KEY, [{ id: 2, name: 'Japanese edited' }]);
  await workspace.switchWorkspace(db, english.id);

  assert.deepEqual(await db.getItem(workspace.ACTIVE_LIBRARY_KEY), [{ id: 1, name: 'English A' }]);
  assert.deepEqual(await db.getItem(workspace.dedicatedLibraryKey(japanese.id)), [{ id: 2, name: 'Japanese edited' }]);
});

test('switchWorkspace rolls back active aliases if metadata update fails', async () => {
  const englishLibrary = [{ id: 1, name: 'English' }];
  const japaneseLibrary = [{ id: 2, name: 'Japanese' }];
  const english = workspace.createDefaultWorkspace(1);
  const japanese = workspace.createWorkspace({
    id: 'workspace-japanese',
    name: '日本語',
    kind: 'language',
    contentLanguage: 'ja'
  }, 2);
  const db = createFakeDb({
    [workspace.WORKSPACES_KEY]: [english, japanese],
    [workspace.ACTIVE_WORKSPACE_KEY]: english.id,
    [workspace.GLOBAL_SETTINGS_KEY]: { explanationLanguage: 'ja' },
    [workspace.ACTIVE_LIBRARY_KEY]: englishLibrary,
    [workspace.ACTIVE_STUDY_HISTORY_KEY]: [],
    [japanese.libraryKey]: japaneseLibrary,
    [japanese.studyHistoryKey]: []
  }, { failSetKey: workspace.WORKSPACES_KEY });

  await assert.rejects(() => workspace.switchWorkspace(db, japanese.id), /Injected setItem failure/);
  assert.deepEqual(await db.getItem(workspace.ACTIVE_LIBRARY_KEY), englishLibrary);
  assert.equal(await db.getItem(workspace.ACTIVE_WORKSPACE_KEY), english.id);
});
