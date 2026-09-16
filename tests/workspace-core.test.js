const test = require('node:test');
const assert = require('node:assert/strict');
const workspace = require('../workspace-core.js');

function createFakeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    async getItem(key) { return store.has(key) ? store.get(key) : null; },
    async setItem(key, value) { store.set(key, value); return value; }
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
