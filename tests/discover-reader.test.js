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
            flushReadingPositionSave=env.flushReadingPositionSave,
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
        saveToDB:async ()=>{}, flushReadingPositionSave:()=>{},
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

test('Untrusted Discover source URLs do not become Reader links', async () => {
    const app = harness();
    await app.openDiscoverReader({...article, id:'bad-url', sourceUrl:'javascript:alert(1)'});
    assert.equal(app.getState().discoverReaderItems[0].url, '');
});


test('TOEIC Discover samples seed linked Problems and vocabulary exactly once', async () => {
    const catalog = JSON.parse(readFileSync(join(__dirname, '..', 'discover-data', 'index.json'), 'utf8'));
    const samples = catalog.articles.filter(item => item.collection === 'TOEIC');
    assert.equal(samples.length, 2);
    const app = harness();
    let questionCount = 0;
    for (const sample of samples) {
        for (const question of sample.questions) {
            assert.ok(sample.content.includes(question.selectedText), question.id);
            assert.equal(question.questionType, 'choice');
            assert.ok(question.question.includes('(A)') && question.question.includes('(D)'));
        }
        await app.openDiscoverReader(sample);
        const saved = app.getState().discoverReaderItems.find(item => item.discoverId === sample.id);
        assert.deepEqual(saved.questions, sample.questions);
        assert.deepEqual(saved.words, sample.words);
        assert.equal(saved.discoverStudyVersion, sample.studyDataVersion);
        questionCount += saved.questions.length;
    }
    assert.equal(questionCount, 6);
    assert.equal(app.getState().libraryItems.length, 0);
    assert.equal(app.getState().discoverReaderItems.length, 2);
});

test('Reopening a TOEIC sample preserves answers, edits, and intentionally removed questions', async () => {
    const sample = {
        ...article,
        studyDataVersion: 1,
        questions: [
            {id:'toeic-q1', question:'Original', answer:'(B)', attempts:[]},
            {id:'toeic-q2', question:'Second', answer:'(A)', attempts:[]}
        ]
    };
    const app = harness();
    await app.openDiscoverReader(sample);
    const saved = app.getState().discoverReaderItems[0];
    saved.questions[0].question = 'Edited by the reader';
    saved.questions[0].attempts.push({result:'correct', userAnswer:'B', answeredAt:123});
    saved.questions.pop();
    await app.openDiscoverReader(sample);
    assert.equal(saved.questions.length, 1);
    assert.equal(saved.questions[0].question, 'Edited by the reader');
    assert.equal(saved.questions[0].attempts[0].result, 'correct');
    await app.openDiscoverReader({
        ...sample, studyDataVersion: 2,
        questions: [
            ...sample.questions,
            {id:'toeic-q3', question:'Newly published question', answer:'(C)', attempts:[]}
        ]
    });
    assert.deepEqual(saved.questions.map(question => question.id), ['toeic-q1', 'toeic-q3']);
    assert.equal(saved.questions[0].attempts[0].result, 'correct');
});

test('Existing Discover caches gain new catalog Problems without losing personal questions', async () => {
    const app = harness();
    await app.openDiscoverReader(article);
    const saved = app.getState().discoverReaderItems[0];
    saved.questions.push({id:'personal-1',question:'My question',answer:'My answer',attempts:[{result:'incorrect'}]});
    const upgraded = {
        ...article, studyDataVersion:1,
        questions:[{id:'catalog-1',question:'Catalog question',answer:'(A)',attempts:[]}]
    };
    await app.openDiscoverReader(upgraded);
    assert.equal(saved.questions.length, 2);
    assert.equal(saved.questions[0].question, 'My question');
    assert.equal(saved.questions[0].attempts[0].result, 'incorrect');
    assert.equal(saved.questions[1].id, 'catalog-1');
    await app.openDiscoverReader(upgraded);
    assert.equal(saved.questions.length, 2);
});

test('Saved Library articles keep Problems and receive only newly versioned ones', async () => {
    const initial = {
        ...article, studyDataVersion:1,
        questions:[{id:'catalog-1',question:'Original',answer:'(A)',attempts:[]}]
    };
    const app = harness();
    await app.openDiscoverReader(initial);
    const cache = app.getState().discoverReaderItems[0];
    cache.questions[0].attempts.push({result:'correct', userAnswer:'A'});
    app.setCurrent(cache);
    await app.saveCurrentDiscoverToLibrary();
    assert.equal(app.getState().libraryItems.length, 1);
    assert.equal(app.getState().libraryItems[0].questions.length, 1);
    await app.openDiscoverReader({
        ...initial,
        studyDataVersion:2,
        questions:[
            initial.questions[0],
            {id:'catalog-2',question:'New question',answer:'(C)',attempts:[]}
        ]
    });
    const saved = app.getState().libraryItems[0];
    assert.equal(saved.questions.length, 2);
    assert.equal(saved.questions[0].attempts[0].result, 'correct');
    assert.equal(saved.questions[1].id, 'catalog-2');
    assert.equal(app.getState().discoverReaderItems.length, 0);
});
