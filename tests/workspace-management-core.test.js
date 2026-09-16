const test = require('node:test');
const assert = require('node:assert/strict');
const management = require('../workspace-management-core.js');
const workspace = require('../workspace-core.js');

function createFakeDb(seed = {}, options = {}) {
  const store = new Map(Object.entries(seed));
  const removed = [];
  return {
    store,
    removed,
    async getItem(key) { return store.has(key) ? store.get(key) : null; },
    async setItem(key, value) {
      if (options.failSetKey === key) throw new Error(`failed set ${key}`);
      store.set(key, value);
      return value;
    },
    async removeItem(key) { removed.push(key); store.delete(key); }
  };
}

function createFakeLocalStorage(seed = {}) {
  const store = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
  const removed = [];
  return {
    store,
    removed,
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { removed.push(key); store.delete(key); }
  };
}

function seedTwoWorkspaces() {
  const english = workspace.createDefaultWorkspace(1);
  const japanese = workspace.createWorkspace({
    id: 'workspace-ja',
    name: '日本語',
    kind: 'language',
    contentLanguage: 'ja'
  }, 2);
  return { english, japanese };
}

test('renames a workspace after normalizing whitespace', async () => {
  const { english, japanese } = seedTwoWorkspaces();
  const db = createFakeDb({
    [workspace.WORKSPACES_KEY]: [english, japanese],
    [workspace.ACTIVE_WORKSPACE_KEY]: english.id,
    [workspace.GLOBAL_SETTINGS_KEY]: { explanationLanguage: 'ja' }
  });

  const renamed = await management.renameWorkspace(db, workspace, japanese.id, '  日本語   学習  ');
  assert.equal(renamed.name, '日本語 学習');
  const saved = await db.getItem(workspace.WORKSPACES_KEY);
  assert.equal(saved.find(item => item.id === japanese.id).name, '日本語 学習');
});

test('rejects duplicate workspace names case-insensitively', async () => {
  const { english, japanese } = seedTwoWorkspaces();
  english.name = 'English';
  const db = createFakeDb({
    [workspace.WORKSPACES_KEY]: [english, japanese],
    [workspace.ACTIVE_WORKSPACE_KEY]: english.id,
    [workspace.GLOBAL_SETTINGS_KEY]: { explanationLanguage: 'ja' }
  });

  await assert.rejects(
    management.renameWorkspace(db, workspace, japanese.id, ' english '),
    /同じ名前/
  );
});

test('never deletes the active workspace', async () => {
  const { english, japanese } = seedTwoWorkspaces();
  const activeLibrary = [{ id: 1, type: 'article', name: 'Keep me' }];
  const db = createFakeDb({
    [workspace.WORKSPACES_KEY]: [english, japanese],
    [workspace.ACTIVE_WORKSPACE_KEY]: english.id,
    [workspace.GLOBAL_SETTINGS_KEY]: { explanationLanguage: 'ja' },
    [workspace.ACTIVE_LIBRARY_KEY]: activeLibrary
  });

  await assert.rejects(
    management.deleteWorkspace(db, workspace, english.id),
    /使用中/
  );
  assert.deepEqual(await db.getItem(workspace.ACTIVE_LIBRARY_KEY), activeLibrary);
  assert.equal(db.removed.length, 0);
});

test('deletes only the selected inactive workspace data and settings', async () => {
  const { english, japanese } = seedTwoWorkspaces();
  const activeLibrary = [{ id: 1, type: 'article', name: 'English' }];
  const inactiveLibrary = [{ id: 2, type: 'article', name: 'Japanese' }];
  const inactiveHistory = [{ id: 'history-ja' }];
  const db = createFakeDb({
    [workspace.WORKSPACES_KEY]: [english, japanese],
    [workspace.ACTIVE_WORKSPACE_KEY]: english.id,
    [workspace.GLOBAL_SETTINGS_KEY]: { explanationLanguage: 'ja' },
    [workspace.ACTIVE_LIBRARY_KEY]: activeLibrary,
    [workspace.ACTIVE_STUDY_HISTORY_KEY]: [{ id: 'history-en' }],
    [japanese.libraryKey]: inactiveLibrary,
    [japanese.studyHistoryKey]: inactiveHistory
  });
  const localKey = workspace.dedicatedLocalSettingKey(japanese.id, workspace.WORKSPACE_LOCAL_SETTING_KEYS[0]);
  const local = createFakeLocalStorage({ [localKey]: 'settings-ja' });

  const deleted = await management.deleteWorkspace(db, workspace, japanese.id, local);
  assert.equal(deleted.id, japanese.id);
  assert.deepEqual(await db.getItem(workspace.ACTIVE_LIBRARY_KEY), activeLibrary);
  assert.equal(await db.getItem(japanese.libraryKey), null);
  assert.equal(await db.getItem(japanese.studyHistoryKey), null);
  assert.equal(local.getItem(localKey), null);
  const spaces = await db.getItem(workspace.WORKSPACES_KEY);
  assert.deepEqual(spaces.map(item => item.id), [english.id]);
});

test('does not delete workspace content if metadata removal cannot be committed', async () => {
  const { english, japanese } = seedTwoWorkspaces();
  const inactiveLibrary = [{ id: 2, type: 'article', name: 'Protected' }];
  const db = createFakeDb({
    [workspace.WORKSPACES_KEY]: [english, japanese],
    [workspace.ACTIVE_WORKSPACE_KEY]: english.id,
    [workspace.GLOBAL_SETTINGS_KEY]: { explanationLanguage: 'ja' },
    [japanese.libraryKey]: inactiveLibrary,
    [japanese.studyHistoryKey]: [{ id: 'protected-history' }]
  }, { failSetKey: workspace.WORKSPACES_KEY });

  await assert.rejects(
    management.deleteWorkspace(db, workspace, japanese.id),
    /failed set/
  );
  assert.deepEqual(await db.getItem(japanese.libraryKey), inactiveLibrary);
  assert.equal(db.removed.length, 0);
});
