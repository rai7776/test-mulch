const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspace = require('../workspace-core.js');
const backupCore = require('../workspace-backup-core.js');

const root = path.resolve(__dirname, '..');

function createFaultDb(seed = {}, failKey = null) {
  const store = new Map(Object.entries(seed));
  let failed = false;
  return {
    store,
    async getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async setItem(key, value) {
      if (!failed && failKey && key === failKey) {
        failed = true;
        throw new Error(`Injected setItem failure for ${key}`);
      }
      store.set(key, value);
      return value;
    },
    async removeItem(key) {
      store.delete(key);
    }
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

test('release HTML pins LocalForage and allows browser zoom', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /https:\/\/unpkg\.com\/localforage@1\.10\.0\/dist\/localforage\.min\.js/);
  assert.doesNotMatch(html, /https:\/\/unpkg\.com\/localforage\/dist\/localforage\.min\.js/);
  assert.doesNotMatch(html, /user-scalable\s*=\s*no/i);
  assert.doesNotMatch(html, /maximum-scale\s*=\s*1(?:\.0)?/i);
});

test('workspace switch restores active data when alias replacement fails midway', async () => {
  const english = workspace.createDefaultWorkspace(1);
  const japanese = workspace.createWorkspace({
    id: 'workspace-ja-hardening',
    name: '日本語',
    kind: 'language',
    contentLanguage: 'ja'
  }, 2);
  const englishLibrary = [{ id: 1, name: 'English current' }];
  const englishHistory = [{ id: 'en-history' }];
  const japaneseLibrary = [{ id: 2, name: 'Japanese target' }];
  const japaneseHistory = [{ id: 'ja-history' }];
  const db = createFaultDb({
    [workspace.WORKSPACES_KEY]: [english, japanese],
    [workspace.ACTIVE_WORKSPACE_KEY]: english.id,
    [workspace.GLOBAL_SETTINGS_KEY]: { explanationLanguage: 'ja' },
    [workspace.ACTIVE_LIBRARY_KEY]: englishLibrary,
    [workspace.ACTIVE_STUDY_HISTORY_KEY]: englishHistory,
    [japanese.libraryKey]: japaneseLibrary,
    [japanese.studyHistoryKey]: japaneseHistory
  }, workspace.ACTIVE_STUDY_HISTORY_KEY);
  const local = createFakeLocalStorage({
    'smart-reader-study-settings-v1': 'english-settings',
    [workspace.dedicatedLocalSettingKey(japanese.id, 'smart-reader-study-settings-v1')]: 'japanese-settings'
  });

  await assert.rejects(
    () => workspace.switchWorkspace(db, japanese.id, local),
    /Injected setItem failure/
  );

  assert.deepEqual(await db.getItem(workspace.ACTIVE_LIBRARY_KEY), englishLibrary);
  assert.deepEqual(await db.getItem(workspace.ACTIVE_STUDY_HISTORY_KEY), englishHistory);
  assert.equal(await db.getItem(workspace.ACTIVE_WORKSPACE_KEY), english.id);
  assert.equal(local.getItem('smart-reader-study-settings-v1'), 'english-settings');
  const spaces = await db.getItem(workspace.WORKSPACES_KEY);
  assert.equal(workspace.getWorkspaceById(spaces, english.id).libraryKey, workspace.ACTIVE_LIBRARY_KEY);
  assert.equal(workspace.getWorkspaceById(spaces, japanese.id).libraryKey, japanese.libraryKey);
});

test('workspace restore removes partial data if metadata commit fails', async () => {
  const english = workspace.createDefaultWorkspace(1);
  const existingLibrary = [{ id: 1, name: 'Existing' }];
  const db = createFaultDb({
    [workspace.WORKSPACES_KEY]: [english],
    [workspace.ACTIVE_WORKSPACE_KEY]: english.id,
    [workspace.GLOBAL_SETTINGS_KEY]: { explanationLanguage: 'ja' },
    [workspace.ACTIVE_LIBRARY_KEY]: existingLibrary,
    [workspace.ACTIVE_STUDY_HISTORY_KEY]: []
  }, workspace.WORKSPACES_KEY);
  const local = createFakeLocalStorage();
  const restoredId = 'workspace-restore-hardening';
  const backup = {
    format: backupCore.FORMAT,
    backupVersion: backupCore.BACKUP_VERSION,
    exportedAt: new Date(0).toISOString(),
    workspace: {
      name: 'Restored',
      kind: 'language',
      contentLanguage: 'en',
      explanationLanguageOverride: null
    },
    data: {
      libraryItems: [{ id: 9, name: 'Incoming' }],
      studyHistory: [{ id: 'incoming-history' }],
      localSettings: { 'smart-reader-study-settings-v1': 'incoming-settings' }
    }
  };

  await assert.rejects(
    () => backupCore.restoreWorkspaceBackup(db, workspace, backup, local, { id: restoredId, now: 100 }),
    /Injected setItem failure/
  );

  assert.deepEqual(await db.getItem(workspace.ACTIVE_LIBRARY_KEY), existingLibrary);
  assert.equal(await db.getItem(workspace.ACTIVE_WORKSPACE_KEY), english.id);
  assert.equal(await db.getItem(workspace.dedicatedLibraryKey(restoredId)), null);
  assert.equal(await db.getItem(workspace.dedicatedStudyHistoryKey(restoredId)), null);
  assert.equal(local.getItem(workspace.dedicatedLocalSettingKey(restoredId, 'smart-reader-study-settings-v1')), null);
  assert.deepEqual(await db.getItem(workspace.WORKSPACES_KEY), [english]);
});

test('workspace backup validation rejects malformed language and local-setting payloads', () => {
  const base = {
    format: backupCore.FORMAT,
    backupVersion: backupCore.BACKUP_VERSION,
    workspace: { name: 'Language', kind: 'language', contentLanguage: 'ja' },
    data: { libraryItems: [], studyHistory: [], localSettings: {} }
  };

  assert.equal(backupCore.validateWorkspaceBackup({
    ...base,
    workspace: { ...base.workspace, contentLanguage: '' }
  }).valid, false);

  assert.equal(backupCore.validateWorkspaceBackup({
    ...base,
    data: { ...base.data, localSettings: [] }
  }).valid, false);
});
