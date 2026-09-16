const test = require('node:test');
const assert = require('node:assert/strict');
const foundation = require('../smart-reader-foundation-core.js');
const workspace = require('../workspace-core.js');

function createFakeDb(seed = {}) {
    const store = new Map(Object.entries(seed));
    return {
        store,
        async getItem(key) { return store.has(key) ? store.get(key) : null; },
        async setItem(key, value) { store.set(key, value); return value; },
        async removeItem(key) { store.delete(key); },
        async clear() { store.clear(); },
        async keys() { return [...store.keys()]; },
        async iterate(iterator) { for (const [key, value] of store) iterator(value, key); },
        async length() { return store.size; },
        async key(index) { return [...store.keys()][index] ?? null; }
    };
}

test('external URLs allow only http and https', () => {
    assert.equal(foundation.sanitizeExternalUrl('https://example.com/a'), 'https://example.com/a');
    assert.equal(foundation.sanitizeExternalUrl('http://example.com'), 'http://example.com/');
    assert.equal(foundation.sanitizeExternalUrl('javascript:alert(1)'), null);
    assert.equal(foundation.sanitizeExternalUrl('data:text/html,hello'), null);
    assert.equal(foundation.sanitizeExternalUrl('file:///tmp/test'), null);
});

test('schema migration marks existing data without rewriting it', async () => {
    const originalLibrary = [{ id: 1, type: 'article', name: 'Existing' }];
    const db = createFakeDb({ library_items: originalLibrary });
    const storage = foundation.installStorageFoundation(db);
    await storage.ensureSchema();
    assert.deepEqual(await db.getItem('library_items'), originalLibrary);
    assert.equal(await db.getItem(foundation.SCHEMA_VERSION_KEY), 1);
});

test('schema key cannot be removed accidentally through patched removeItem', async () => {
    const db = createFakeDb();
    foundation.installStorageFoundation(db);
    await db.setItem('library_items', []);
    await db.removeItem(foundation.SCHEMA_VERSION_KEY);
    assert.equal(await db.getItem(foundation.SCHEMA_VERSION_KEY), 1);
});

test('clear preserves the schema marker for subsequent migrations', async () => {
    const db = createFakeDb({ library_items: [{ id: 1 }] });
    foundation.installStorageFoundation(db);
    await db.clear();
    assert.equal(await db.getItem(foundation.SCHEMA_VERSION_KEY), 1);
    assert.equal(await db.getItem('library_items'), null);
});

test('newer unsupported schema fails before data operations', async () => {
    const db = createFakeDb({ [foundation.SCHEMA_VERSION_KEY]: 99 });
    foundation.installStorageFoundation(db);
    await assert.rejects(() => db.getItem('library_items'), /newer than this app supports/);
});

test('schema metadata stays invisible to legacy exact-key backup logic', async () => {
    const db = createFakeDb({ library_items: [], reader_settings: {} });
    foundation.installStorageFoundation(db);
    const keys = await db.keys();
    assert.deepEqual(keys.sort(), ['library_items', 'reader_settings']);
    assert.equal(await db.length(), 2);
    assert.equal(await db.key(0), 'library_items');
    assert.equal(db.store.has(foundation.SCHEMA_VERSION_KEY), true);
});

test('foundation can run workspace v2 migration without rewriting legacy library data', async () => {
    const originalLibrary = [{ id: 7, type: 'article', name: 'Existing English data' }];
    const db = createFakeDb({
        [foundation.SCHEMA_VERSION_KEY]: 1,
        library_items: originalLibrary
    });
    const storage = foundation.installStorageFoundation(db, {
        currentVersion: workspace.WORKSPACE_SCHEMA_VERSION,
        migrations: { 2: workspace.migrateToWorkspaceMetadata }
    });
    await storage.ensureSchema();

    assert.equal(await db.getItem(foundation.SCHEMA_VERSION_KEY), 2);
    assert.deepEqual(await db.getItem('library_items'), originalLibrary);
    const workspaces = await db.getItem(workspace.WORKSPACES_KEY);
    assert.equal(workspaces.length, 1);
    assert.equal(workspaces[0].name, '英語');
    assert.equal(workspaces[0].libraryKey, 'library_items');
});
