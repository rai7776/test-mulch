const test = require('node:test');
const assert = require('node:assert/strict');
const backupCore = require('../workspace-backup-core.js');
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

function createFakeLocalStorage(seed = {}) {
  const store = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
  return {
    store,
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); }
  };
}

test('exports active workspace data and active Study settings', async () => {
  const english = workspace.createDefaultWorkspace(1);
  const library = [{ id: 1, type: 'article', name: 'A' }];
  const history = [{ id: 'session-1' }];
  const db = createFakeDb({
    [workspace.WORKSPACES_KEY]: [english],
    [workspace.ACTIVE_WORKSPACE_KEY]: english.id,
    [workspace.GLOBAL_SETTINGS_KEY]: { explanationLanguage: 'ja' },
    [workspace.ACTIVE_LIBRARY_KEY]: library,
    [workspace.ACTIVE_STUDY_HISTORY_KEY]: history
  });
  const local = createFakeLocalStorage({ 'smart-reader-study-settings-v1': '{"newLimit":10}' });

  const backup = await backupCore.createWorkspaceBackup(db, workspace, english.id, local, Date.UTC(2026, 8, 17));
  assert.equal(backup.format, backupCore.FORMAT);
  assert.equal(backup.workspace.name, '英語');
  assert.deepEqual(backup.data.libraryItems, library);
  assert.deepEqual(backup.data.studyHistory, history);
  assert.equal(backup.data.localSettings['smart-reader-study-settings-v1'], '{"newLimit":10}');
});

test('exports inactive workspace data from dedicated keys', async () => {
  const english = workspace.createDefaultWorkspace(1);
  const japanese = workspace.createWorkspace({ id: 'workspace-ja', name: '日本語', kind: 'language', contentLanguage: 'ja' }, 2);
  const db = createFakeDb({
    [workspace.WORKSPACES_KEY]: [english, japanese],
    [workspace.ACTIVE_WORKSPACE_KEY]: english.id,
    [workspace.GLOBAL_SETTINGS_KEY]: { explanationLanguage: 'ja' },
    [workspace.ACTIVE_LIBRARY_KEY]: [],
    [workspace.ACTIVE_STUDY_HISTORY_KEY]: [],
    [japanese.libraryKey]: [{ id: 9, type: 'article', name: '日本語' }],
    [japanese.studyHistoryKey]: [{ id: 'ja-history' }]
  });
  const local = createFakeLocalStorage({
    [workspace.dedicatedLocalSettingKey(japanese.id, 'smart-reader-study-settings-v1')]: 'ja-settings'
  });
  const backup = await backupCore.createWorkspaceBackup(db, workspace, japanese.id, local, 1000);
  assert.equal(backup.data.libraryItems[0].name, '日本語');
  assert.equal(backup.data.studyHistory[0].id, 'ja-history');
  assert.equal(backup.data.localSettings['smart-reader-study-settings-v1'], 'ja-settings');
});

test('restores backup as a new workspace without replacing existing data', async () => {
  const english = workspace.createDefaultWorkspace(1);
  const existingLibrary = [{ id: 1, type: 'article', name: 'Existing' }];
  const db = createFakeDb({
    [workspace.WORKSPACES_KEY]: [english],
    [workspace.ACTIVE_WORKSPACE_KEY]: english.id,
    [workspace.GLOBAL_SETTINGS_KEY]: { explanationLanguage: 'ja' },
    [workspace.ACTIVE_LIBRARY_KEY]: existingLibrary,
    [workspace.ACTIVE_STUDY_HISTORY_KEY]: []
  });
  const local = createFakeLocalStorage();
  const backup = {
    format: backupCore.FORMAT,
    backupVersion: 1,
    exportedAt: new Date(0).toISOString(),
    workspace: { name: '英語', kind: 'language', contentLanguage: 'en', explanationLanguageOverride: null },
    data: {
      libraryItems: [{ id: 2, type: 'article', name: 'Restored' }],
      studyHistory: [{ id: 'restored-history' }],
      localSettings: { 'smart-reader-study-settings-v1': 'restored-settings' }
    }
  };

  const restored = await backupCore.restoreWorkspaceBackup(db, workspace, backup, local, { id: 'workspace-restored-test', now: 100 });
  assert.equal(restored.name, '英語 (復元)');
  assert.deepEqual(await db.getItem(workspace.ACTIVE_LIBRARY_KEY), existingLibrary);
  assert.deepEqual(await db.getItem(restored.libraryKey), backup.data.libraryItems);
  assert.deepEqual(await db.getItem(restored.studyHistoryKey), backup.data.studyHistory);
  assert.equal(local.getItem(workspace.dedicatedLocalSettingKey(restored.id, 'smart-reader-study-settings-v1')), 'restored-settings');
  assert.equal(await db.getItem(workspace.ACTIVE_WORKSPACE_KEY), english.id);
  const spaces = await db.getItem(workspace.WORKSPACES_KEY);
  assert.equal(spaces.length, 2);
});

test('rejects malformed workspace backups', () => {
  assert.equal(backupCore.validateWorkspaceBackup({}).valid, false);
  assert.equal(backupCore.validateWorkspaceBackup({ format: backupCore.FORMAT, backupVersion: 99 }).valid, false);
});
