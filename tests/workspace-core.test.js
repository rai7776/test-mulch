const test = require('node:test');
const assert = require('node:assert/strict');
const workspace = require('../smart-reader-workspace-core.js');

function createFakeDb(seed = {}) {
    const store = new Map(Object.entries(seed));
    return {
        store,
        async getItem(key) { return store.has(key) ? store.get(key) : null; },
        async setItem(key, value) { store.set(key, value); return value; },
        async removeItem(key) { store.delete(key); },
        async clear() { store.clear(); },
        async keys() { return [...store.keys()]; },
        async iterate(iterator) {
            let index = 1;
            for (const [key, value] of store) {
                const result = iterator(value, key, index++);
                if (result !== undefined) return result;
            }
            return undefined;
        },
        async length() { return store.size; },
        async key(index) { return [...store.keys()][index] ?? null; }
    };
}

function createFakeStorage(seed = {}) {
    const store = new Map(Object.entries(seed).map(([key, value]) => [key, String(value)]));
    return {
        store,
        getItem(key) { return store.has(String(key)) ? store.get(String(key)) : null; },
        setItem(key, value) { store.set(String(key), String(value)); },
        removeItem(key) { store.delete(String(key)); }
    };
}

test('legacy data is copied non-destructively into the default English workspace', async () => {
    const legacyLibrary = [{ id: 1, type: 'article', name: 'Existing English' }];
    const legacyHistory = [{ result: 'correct', wordId: 1 }];
    const db = createFakeDb({ library_items: legacyLibrary, study_history_v1: legacyHistory });
    const storage = createFakeStorage({ 'smart-reader-study-settings-v1': '{"reviewLimit":30}' });

    const api = workspace.install(db, storage);
    await api.ready;

    assert.deepEqual(await db.getItem('library_items'), legacyLibrary);
    assert.deepEqual(await db.getItem('study_history_v1'), legacyHistory);
    assert.deepEqual(db.store.get('library_items'), legacyLibrary, 'legacy recovery copy is kept');
    assert.deepEqual(
        db.store.get(workspace.workspaceDbKey(workspace.DEFAULT_WORKSPACE_ID, 'library_items')),
        legacyLibrary
    );
    assert.equal(
        storage.store.get(workspace.workspaceLocalKey(workspace.DEFAULT_WORKSPACE_ID, 'smart-reader-study-settings-v1')),
        '{"reviewLimit":30}'
    );
    const active = await api.getActiveWorkspace();
    assert.equal(active.name, '英語');
    assert.equal(active.contentLanguage, 'en');
});

test('libraries remain isolated when switching workspaces', async () => {
    const db = createFakeDb({ library_items: [{ id: 1, type: 'article', name: 'English' }] });
    const storage = createFakeStorage();
    const api = workspace.install(db, storage);
    await api.ready;

    const second = await api.createWorkspace({ name: '古文', kind: 'general' });
    await api.switchWorkspace(second.id);
    assert.deepEqual(await db.getItem('library_items'), []);
    await db.setItem('library_items', [{ id: 2, type: 'article', name: '源氏物語' }]);

    await api.switchWorkspace(workspace.DEFAULT_WORKSPACE_ID);
    assert.deepEqual(await db.getItem('library_items'), [{ id: 1, type: 'article', name: 'English' }]);
    await api.switchWorkspace(second.id);
    assert.deepEqual(await db.getItem('library_items'), [{ id: 2, type: 'article', name: '源氏物語' }]);
});

test('global settings remain shared while study settings are workspace scoped', async () => {
    const db = createFakeDb({ reader_settings: { fontSize: 19 } });
    const storage = createFakeStorage({ 'smart-reader-study-settings-v1': '{"newLimit":10}' });
    const api = workspace.install(db, storage);
    await api.ready;

    const second = await api.createWorkspace({ name: '資格', kind: 'general' });
    assert.deepEqual(await db.getItem('reader_settings'), { fontSize: 19 });
    assert.equal(storage.getItem('smart-reader-study-settings-v1'), '{"newLimit":10}');

    await api.switchWorkspace(second.id);
    assert.deepEqual(await db.getItem('reader_settings'), { fontSize: 19 });
    assert.equal(storage.getItem('smart-reader-study-settings-v1'), null);
    storage.setItem('smart-reader-study-settings-v1', '{"newLimit":50}');

    await api.switchWorkspace(workspace.DEFAULT_WORKSPACE_ID);
    assert.equal(storage.getItem('smart-reader-study-settings-v1'), '{"newLimit":10}');
    await api.switchWorkspace(second.id);
    assert.equal(storage.getItem('smart-reader-study-settings-v1'), '{"newLimit":50}');
});

test('workspace metadata and internal physical keys stay hidden from legacy backup key enumeration', async () => {
    const db = createFakeDb({ library_items: [], reader_settings: { fontSize: 18 } });
    const storage = createFakeStorage();
    const api = workspace.install(db, storage);
    await api.ready;

    const keys = (await db.keys()).sort();
    assert.deepEqual(keys, ['library_items', 'reader_settings']);
    assert.equal(keys.some(key => key.startsWith(workspace.WORKSPACE_PREFIX)), false);
    assert.equal(keys.includes(workspace.WORKSPACES_KEY), false);
});

test('active workspace choice is mirrored for the next app boot', async () => {
    const db = createFakeDb({ library_items: [] });
    const storage = createFakeStorage();
    const api = workspace.install(db, storage);
    await api.ready;
    const second = await api.createWorkspace({ name: 'Chinese', kind: 'language', contentLanguage: 'zh-CN' });
    await api.switchWorkspace(second.id);
    assert.equal(storage.store.get(workspace.ACTIVE_WORKSPACE_LOCAL_KEY), second.id);

    const db2 = createFakeDb(Object.fromEntries(db.store));
    const storage2 = createFakeStorage(Object.fromEntries(storage.store));
    const api2 = workspace.install(db2, storage2);
    await api2.ready;
    assert.equal(api2.getActiveWorkspaceId(), second.id);
});

test('workspace export contains only the requested workspace data', async () => {
    const db = createFakeDb({ library_items: [{ id: 1, type: 'article', name: 'A' }] });
    const storage = createFakeStorage();
    const api = workspace.install(db, storage);
    await api.ready;
    const second = await api.createWorkspace({ name: 'Second', kind: 'general' });
    await api.switchWorkspace(second.id);
    await db.setItem('library_items', [{ id: 2, type: 'article', name: 'B' }]);

    const firstExport = await api.exportWorkspace(workspace.DEFAULT_WORKSPACE_ID);
    const secondExport = await api.exportWorkspace(second.id);
    assert.equal(firstExport.format, 'smart-reader-workspace');
    assert.equal(firstExport.data.library_items[0].name, 'A');
    assert.equal(secondExport.data.library_items[0].name, 'B');

    const all = await api.exportAll();
    assert.equal(all.workspaces.length, 2);
    assert.equal(all.activeWorkspaceId, second.id);
});

test('the final workspace cannot be deleted', async () => {
    const db = createFakeDb({ library_items: [] });
    const storage = createFakeStorage();
    const api = workspace.install(db, storage);
    await api.ready;
    await assert.rejects(() => api.deleteWorkspace(workspace.DEFAULT_WORKSPACE_ID), /last workspace/i);
});

test('language and workspace normalization accepts future multilingual pairs', () => {
    assert.equal(workspace.normalizeLanguage('zh-CN'), 'zh-CN');
    assert.equal(workspace.normalizeLanguage('es'), 'es');
    assert.equal(workspace.normalizeLanguage('ja'), 'ja');
    assert.equal(workspace.normalizeLanguage('not a language', 'en'), 'en');
    const record = workspace.normalizeWorkspace({ name: '日本語', kind: 'language', contentLanguage: 'ja' });
    assert.equal(record.contentLanguage, 'ja');
    assert.equal(record.kind, 'language');
});
