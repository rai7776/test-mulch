const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

// Exercise the actual Discover Reader handlers from app.js without loading the browser UI.
function harness(options = {}) {
    const script = readFileSync(join(__dirname, '..', 'app.js'), 'utf8');
    const start = script.indexOf('function readerBack() {');
    const end = script.indexOf('function openArticle(id, origin = null) {', start);
    assert.ok(start >= 0 && end > start, 'Discover Reader handler section exists');
    const handlers = script.slice(start, end)
        .replace('window.openDiscoverReader = openDiscoverReader;', '');
    const create = new Function('env', `
        let libraryItems=env.libraryItems, discoverReaderItems=env.discoverReaderItems, currentArticle=null;
        const window=env.window, db=env.db, console=env.logger, alert=env.alert,
            saveToDB=env.saveToDB, openArticle=env.openArticle,
            discoverReaderStorageKey=env.discoverReaderStorageKey, showLibrary=env.showLibrary,
            navigator=env.navigator, location=env.location;
        ${handlers}
        return { openDiscoverReader, saveCurrentDiscoverToLibrary,
            getState:()=>({ libraryItems, discoverReaderItems }),
            setCurrent:(article)=>{ currentArticle=article; } };
    `);
    const opened = [];
    const persisted = {};
    const env = {
        libraryItems:[], discoverReaderItems:[],
        window:{SmartReaderAppReady:Promise.resolve()},
        db:{setItem:async (key, data) => {
            if (options.failLibrary && key === 'library_items') throw new Error('storage unavailable');
            persisted[key] = JSON.parse(JSON.stringify(data));
        }},
        logger:{error(){},warn(){}}, alert:()=>{},
        saveToDB:async ()=>{},
        openArticle:(id, origin)=>opened.push({id, origin}),
        discoverReaderStorageKey:()=> 'discover_reader_items_v1:test-workspace',
        showLibrary:()=>{}, navigator:{}, location:{href:'https://example.test/reader'}
    };
    return {...create(env), opened, persisted};
}

const article = {
    id:'source-001', title:'Example', content:'A paragraph.\\n\\nAnother paragraph.',
    sourceUrl:'https://example.test/article', language:'en', sourceName:'Example Source'
};

test('Discover opens Reader directly without adding anything to Library', async () => {
    const app = harness();
    await app.openDiscoverReader(article);
    assert.equal(app.getState().libraryItems.length, 0);
    assert.equal(app.getState().discoverReaderItems.length, 1);
    assert.deepEqual(app.opened, [{ id:'discover:source-001', origin:'discover' }]);
    assert.equal(app.getState().discoverReaderItems[0].url, article.sourceUrl);
    assert.ok(app.persisted['discover_reader_items_v1:test-workspace']);
});

test('Reopening an article retains reader words and bookmarks', async () => {
    const app = harness();
    await app.openDiscoverReader(article);
    const entry = app.getState().discoverReaderItems[0];
    entry.words.push({id:1,word:'paragraph'});
    entry.bookmarks.push({id:2,pIndex:1,label:'Later'});
    await app.openDiscoverReader({...article,content:'Updated article text'});
    assert.equal(app.getState().discoverReaderItems.length, 1);
    assert.equal(entry.words[0].word, 'paragraph');
    assert.equal(entry.bookmarks[0].pIndex, 1);
    assert.equal(entry.content, 'Updated article text');
});

test('Explicit Library save transfers study data, then does not duplicate on future opens', async () => {
    const app = harness();
    await app.openDiscoverReader(article);
    const entry = app.getState().discoverReaderItems[0];
    entry.words.push({id:3,word:'example'});
    entry.bookmarks.push({id:4,pIndex:0,label:'Start'});
    app.setCurrent(entry);
    await app.saveCurrentDiscoverToLibrary();
    assert.equal(app.getState().libraryItems.length, 1);
    assert.equal(app.getState().discoverReaderItems.length, 0);
    const saved = app.getState().libraryItems[0];
    assert.equal(saved.discoverId, article.id);
    assert.equal(saved.isDiscoverArticle, undefined);
    assert.deepEqual(saved.words, [{id:3,word:'example'}]);
    assert.deepEqual(saved.bookmarks, [{id:4,pIndex:0,label:'Start'}]);
    await app.openDiscoverReader(article);
    assert.equal(app.getState().discoverReaderItems.length, 0);
    assert.equal(app.opened.at(-1).id, saved.id);
});

test('Failed Library persistence keeps Discover article and annotations intact', async () => {
    const app = harness({failLibrary:true});
    await app.openDiscoverReader(article);
    const entry = app.getState().discoverReaderItems[0];
    entry.words.push({id:5,word:'keep'});
    app.setCurrent(entry);
    await app.saveCurrentDiscoverToLibrary();
    assert.equal(app.getState().libraryItems.length, 0);
    assert.equal(app.getState().discoverReaderItems.length, 1);
    assert.equal(app.getState().discoverReaderItems[0].words[0].word, 'keep');
});
