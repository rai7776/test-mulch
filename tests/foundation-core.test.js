const test = require('node:test');
const assert = require('node:assert/strict');
const foundation = require('../smart-reader-foundation-core.js');

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
