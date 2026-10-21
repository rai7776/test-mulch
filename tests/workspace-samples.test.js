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
    assert.deepEqual(db.writes, [chinese.libraryKey, samples.initializedKey(chinese)]);
});

test('first-run setup seeds active library key, leaving unrelated Workspace archives alone', async () => {
    const db = store({ library_items: [], [english.libraryKey]: [{ id: 3 }] });
    const changed = await samples.seedNewChineseWorkspace(db, chinese, { initialSetup: true });
    assert.equal(changed, true);
    assert.equal(db.map.get('library_items').length, 2);
    assert.deepEqual(db.map.get(english.libraryKey), [{ id: 3 }]);
    assert.deepEqual(db.writes, ['library_items', samples.initializedKey(chinese)]);
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


const stockEnglish = [
    { id: 1001, type: 'folder', name: '📚 チュートリアル', parentId: null },
    { id: 1002, type: 'article', parentId: 1001, name: 'Smart Readerの使い方',
      content: 'Smart Readerへようこそ！', words: [{ id: 2001, memorized: true }] },
    { id: 1003, type: 'article', parentId: 1001, name: '🍅 The Pomodoro Technique',
      content: 'The Pomodoro Technique is a time management method.', words: [] }
];

test('old English sample data is archived and replaced by Mandarin only in Chinese Workspace', async () => {
    const original = stockEnglish.map(item => ({ ...item }));
    const db = store({ library_items: original });
    const updated = await samples.repairActiveChineseWorkspace(db, chinese, stockEnglish);
    assert.equal(updated.length, 2);
    assert.equal(updated.some(item => item.name === '🍅 The Pomodoro Technique'), false);
    assert.equal(updated.some(item => item.name === 'Smart Readerの使い方'), false);
    assert.equal(updated.some(item => item.type === 'article' && /图书馆/.test(item.content)), true);
    assert.deepEqual(db.map.get(samples.legacyArchiveKey(chinese)), original);
    assert.equal(db.map.get(samples.initializedKey(chinese)), true);
    assert.deepEqual(db.map.get('library_items'), updated);
});

test('repair preserves user articles even inside the stock English tutorial folder', async () => {
    const userArticle = { id: 9876, type: 'article', name: '自分の中国語学習', content: '你好！', parentId: 1001 };
    const db = store({ library_items: [...stockEnglish, userArticle] });
    const updated = await samples.repairActiveChineseWorkspace(db, chinese, stockEnglish);
    assert.ok(updated.some(item => item.id === 9876 && item.content === '你好！'));
    assert.ok(updated.some(item => item.id === 1001)); // Keep parent so the user article stays reachable
    assert.ok(updated.some(item => item.type === 'article' && item.sampleKey === samples.SAMPLE_KEY));
    assert.equal(updated.some(item => item.id === 1002 || item.id === 1003), false);
    assert.equal(db.map.get(samples.legacyArchiveKey(chinese)).length, 4);
});

test('edited article contents that resemble samples are not removed', async () => {
    const modified = { ...stockEnglish[1], content: '我的私人日记。' };
    const db = store({ library_items: [modified] });
    const updated = await samples.repairActiveChineseWorkspace(db, chinese, stockEnglish);
    assert.ok(updated.some(item => item === modified));
    assert.ok(updated.some(item => item.sampleKey === samples.SAMPLE_KEY));
    assert.equal(db.map.has(samples.legacyArchiveKey(chinese)), false);
});

test('repair never touches an English or general Workspace', async () => {
    for (const target of [english, general]) {
        const original = stockEnglish.map(item => ({ ...item }));
        const db = store({ library_items: original });
        const returned = await samples.repairActiveChineseWorkspace(db, target, stockEnglish);
        assert.equal(returned, null);
        assert.strictEqual(db.map.get('library_items'), original);
        assert.deepEqual(db.writes, []);
    }
});

test('a user deleting the Mandarin sample does not cause repeated re-seeding', async () => {
    const db = store({ library_items: [] });
    const first = await samples.repairActiveChineseWorkspace(db, chinese, stockEnglish);
    assert.equal(first.length, 2);
    db.map.set('library_items', []); // Explicit user deletion
    const second = await samples.repairActiveChineseWorkspace(db, chinese, stockEnglish);
    assert.deepEqual(second, []);
    assert.deepEqual(db.map.get('library_items'), []);
});

test('an existing Chinese Workspace with real articles gets a Mandarin example once', async () => {
    const doc = { id: 9959, type: 'article', name: '私の作文', content: '我喜欢茶。' };
    const db = store({ library_items: [doc] });
    const first = await samples.repairActiveChineseWorkspace(db, chinese, stockEnglish);
    assert.equal(first.length, 3);
    assert.ok(first.includes(doc));
    const second = await samples.repairActiveChineseWorkspace(db, chinese, stockEnglish);
    assert.equal(second.length, 3);
    assert.ok(second.includes(doc));
});

test('stock English cleanup never hides a different article with the same ID', async () => {
    const userArticle = { ...stockEnglish[1], name: '中国語の記事', content: '学习很快乐。' };
    const db = store({ library_items: [userArticle] });
    const updated = await samples.repairActiveChineseWorkspace(db, chinese, stockEnglish);
    assert.ok(updated.includes(userArticle));
});
