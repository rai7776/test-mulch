const test = require('node:test');
const assert = require('node:assert/strict');
const samples = require('../workspace-samples.js');

const chinese = { id: 'zh-a', name: '中国語', kind: 'language', contentLanguage: 'zh', libraryKey: 'workspace:zh-a:library_items' };
const english = { id: 'en-a', name: '英語', kind: 'language', contentLanguage: 'en', libraryKey: 'workspace:en-a:library_items' };
const general = { id: 'g-a', name: '情報', kind: 'general', contentLanguage: 'zh', libraryKey: 'workspace:g-a:library_items' };

function store(initial = {}) {
    const map = new Map(Object.entries(initial));
    const writes = [];
    return {
        map, writes,
        async getItem(key) { return map.has(key) ? map.get(key) : null; },
        async setItem(key, value) { map.set(key, value); writes.push(key); }
    };
}

test('only zh-family language Workspaces receive Mandarin sample data', () => {
    assert.equal(samples.isChineseWorkspace(chinese), true);
    assert.equal(samples.isChineseWorkspace({ ...chinese, contentLanguage: 'zh-CN' }), true);
    assert.equal(samples.isChineseWorkspace({ ...chinese, contentLanguage: 'en' }), false);
    assert.equal(samples.isChineseWorkspace(general), false);
    assert.deepEqual(samples.createChineseSample(english, 100), []);
    assert.deepEqual(samples.createChineseSample(general, 100), []);
});

test('sample contains Chinese article and useful vocabulary with readings', () => {
    const items = samples.createChineseSample(chinese, 123);
    assert.equal(items.length, 2);
    const folder = items.find(item => item.type === 'folder');
    const article = items.find(item => item.type === 'article');
    assert.equal(article.parentId, folder.id);
    assert.match(article.content, /图书馆.*安静/u);
    assert.ok(!article.content.includes('The Pomodoro Technique'));
    assert.equal(article.words.length, 8);
    assert.ok(article.words.every(word => !word.memorized));
    assert.ok(article.words.every(word => word.annotations.some(annotation =>
        annotation.id === 'pinyin' && annotation.value.length > 0 && annotation.display === 'ruby')));
    assert.ok(article.words.every(word => article.content.includes(word.word)));
    assert.ok(article.notes.every(note => article.content.includes(note.originalText) && note.translation));
    assert.ok(samples.hasChineseSample(items));
});

test('new Chinese Workspace is seeded to its own dedicated library key', async () => {
    const db = store({ library_items: [{ id: 10, type: 'article', name: 'keep existing English article' }],
        [chinese.libraryKey]: [] });
    const changed = await samples.seedNewChineseWorkspace(db, chinese);
    assert.equal(changed, true);
    assert.equal(db.map.get('library_items').length, 1);
    assert.equal(db.map.get(chinese.libraryKey).length, 2);
    assert.deepEqual(db.writes, [chinese.libraryKey]);
});

test('first-run setup seeds active library key, leaving unrelated Workspace archives alone', async () => {
    const db = store({ library_items: [], [english.libraryKey]: [{ id: 3 }] });
    const changed = await samples.seedNewChineseWorkspace(db, chinese, { initialSetup: true });
    assert.equal(changed, true);
    assert.equal(db.map.get('library_items').length, 2);
    assert.deepEqual(db.map.get(english.libraryKey), [{ id: 3 }]);
    assert.deepEqual(db.writes, ['library_items']);
});

test('existing articles and deleted samples are never auto-overwritten or reinserted', async () => {
    const preserved = [{ id: 3, name: 'my article', type: 'article' }];
    const db = store({ [chinese.libraryKey]: preserved });
    assert.equal(await samples.seedNewChineseWorkspace(db, chinese), false);
    assert.equal(db.map.get(chinese.libraryKey), preserved);
    assert.deepEqual(db.writes, []);

    const db2 = store({ [chinese.libraryKey]: [] });
    assert.equal(await samples.seedNewChineseWorkspace(db2, english), false);
    assert.deepEqual(db2.writes, []);
});

test('manual sample construction makes fresh IDs and does not duplicate static records', () => {
    const first = samples.createChineseSample(chinese, 123);
    const second = samples.createChineseSample(chinese, 124);
    assert.notEqual(first[0].id, second[0].id);
    assert.notEqual(first[1].id, second[1].id);
    assert.notEqual(first[1].words[0].id, second[1].words[0].id);
});
