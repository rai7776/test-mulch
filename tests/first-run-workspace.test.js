const test = require('node:test');
const assert = require('node:assert/strict');
const workspace = require('../workspace-core.js');

function createFakeDb(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    async getItem(key) { return store.has(key) ? store.get(key) : null; },
    async setItem(key, value) { store.set(key, value); return value; },
    async removeItem(key) { store.delete(key); }
  };
}

test('a completely fresh database starts with a pending workspace instead of assuming English', async () => {
  const db = createFakeDb();
  const state = await workspace.readWorkspaceState(db);

  assert.equal(state.workspaces.length, 1);
  assert.equal(state.activeWorkspaceId, workspace.INITIAL_WORKSPACE_ID);
  assert.equal(state.activeWorkspace.name, '学習スペース');
  assert.equal(state.activeWorkspace.kind, 'general');
  assert.equal(state.activeWorkspace.contentLanguage, '');
  assert.equal(state.activeWorkspace.setupPending, true);
  assert.equal(state.activeWorkspace.migratedFromLegacy, false);
  assert.equal(await db.getItem(workspace.ACTIVE_LIBRARY_KEY), null);
  assert.equal(await db.getItem(workspace.ACTIVE_STUDY_HISTORY_KEY), null);
});

test('existing legacy library data still migrates to the English workspace', async () => {
  const legacy = [{ id: 1, type: 'article', name: 'Existing article' }];
  const db = createFakeDb({ [workspace.ACTIVE_LIBRARY_KEY]: legacy });
  const state = await workspace.readWorkspaceState(db);

  assert.equal(state.activeWorkspaceId, workspace.DEFAULT_WORKSPACE_ID);
  assert.equal(state.activeWorkspace.name, '英語');
  assert.equal(state.activeWorkspace.kind, 'language');
  assert.equal(state.activeWorkspace.contentLanguage, 'en');
  assert.equal(state.activeWorkspace.setupPending, undefined);
  assert.deepEqual(await db.getItem(workspace.ACTIVE_LIBRARY_KEY), legacy);
});

test('initial setup converts the pending workspace in place without touching learning data', async () => {
  const db = createFakeDb();
  await workspace.readWorkspaceState(db);
  const before = await db.getItem(workspace.WORKSPACES_KEY);
  const originalId = before[0].id;

  const completed = await workspace.completeInitialWorkspaceSetup(db, {
    name: '日本語',
    kind: 'language',
    contentLanguage: 'ja'
  });

  assert.equal(completed.id, originalId);
  assert.equal(completed.name, '日本語');
  assert.equal(completed.kind, 'language');
  assert.equal(completed.contentLanguage, 'ja');
  assert.equal(completed.setupPending, undefined);
  assert.equal(await db.getItem(workspace.ACTIVE_WORKSPACE_KEY), originalId);
  assert.equal(await db.getItem(workspace.ACTIVE_LIBRARY_KEY), null);
  assert.equal(await db.getItem(workspace.ACTIVE_STUDY_HISTORY_KEY), null);
});

test('initial setup also supports a general study workspace', async () => {
  const db = createFakeDb();
  await workspace.readWorkspaceState(db);
  const completed = await workspace.completeInitialWorkspaceSetup(db, {
    name: 'ITパスポート',
    kind: 'general',
    contentLanguage: 'en'
  });

  assert.equal(completed.kind, 'general');
  assert.equal(completed.contentLanguage, '');
});

test('initial setup cannot overwrite an already configured workspace', async () => {
  const english = workspace.createDefaultWorkspace(1);
  const db = createFakeDb({
    [workspace.WORKSPACES_KEY]: [english],
    [workspace.ACTIVE_WORKSPACE_KEY]: english.id,
    [workspace.GLOBAL_SETTINGS_KEY]: { explanationLanguage: 'ja' }
  });

  await assert.rejects(
    workspace.completeInitialWorkspaceSetup(db, { name: 'Overwrite', kind: 'general' }),
    /not pending/
  );
});
