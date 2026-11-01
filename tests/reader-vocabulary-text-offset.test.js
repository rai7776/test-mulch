const test = require('node:test');
const assert = require('node:assert/strict');
const highlighter = require('../reader-vocabulary-highlights.js');

const chinese = { isChinese: true };
const english = { isChinese: false };

test('registered multi-character terms match original Chinese paragraph text', () => {
    const text = '按照刻板印象来说，烟在后面。';
    const words = [
        { word: '按照', surfaceText: '按 照' }, // stale/incorrect imported surfaceText
        { word: '刻板印象' },
        { word: '烟' },
        { word: '后' }
    ];
    const found = highlighter.findMatches(text, words, 'legacy-main', chinese);
    assert.deepEqual(found.map(m => text.slice(m.start, m.end)), ['按照', '刻板印象', '烟', '后']);
    assert.deepEqual(found.map(m => m.wordIndex), [0,1,2,3]);
});

test('single Chinese characters are allowed but English single letters stay unhighlighted', () => {
    assert.equal(highlighter.isEligible('烟', true), true);
    assert.equal(highlighter.isEligible('烟', false), false);
    assert.equal(highlighter.isEligible('I', true), false);
    assert.equal(highlighter.isEligible('I', false), false);
    assert.deepEqual(highlighter.findMatches('I write', [{word:'I'},{word:'write'}], null, english)
        .map(m => m.wordIndex), [1]);
});

test('canonical form remains searchable when surfaceText is stale or different', () => {
    const text = '按照算法按照';
    const words = [{ word: '按照', surfaceText: '按    照' }];
    const matched = highlighter.findMatches(text, words, null, chinese);
    assert.deepEqual(matched.map(m => m.start), [0,4]);
    const englishFound = highlighter.findMatches('write writing', [{word:'write',surfaceText:'writing'}], null, english);
    assert.deepEqual(englishFound.map(m => m.start), [6]);
});

test('longest match wins, smaller overlapping terms are not nested or duplicated', () => {
    const text = '刻板印象和刻板印象';
    const words = [{word:'刻'}, {word:'印象'}, {word:'刻板印象'}, {word:'刻板印象'}];
    const found = highlighter.findMatches(text, words, 'legacy-main', chinese);
    assert.equal(found.length, 2);
    assert.deepEqual(found.map(m=>m.wordIndex), [2,2]);
    assert.deepEqual(found.map(m => text.slice(m.start,m.end)), ['刻板印象','刻板印象']);
});

test('chapter-scoped words do not highlight in the wrong chapter', () => {
    const text = '按照烟后';
    const words = [
        {word:'按照',chapterId:'a'},
        {word:'烟',chapterId:'b'},
        {word:'后'}
    ];
    const found = highlighter.findMatches(text, words, 'a', chinese);
    assert.deepEqual(found.map(m => m.wordIndex), [0,2]);
});

test('regex punctuation in registered words is escaped rather than interpreted', () => {
    const found = highlighter.findMatches('C++? C++? 你好', [
        {word:'C++?'}, {word:'你好'}
    ],null,chinese);
    assert.deepEqual(found.map(m => m.wordIndex), [0,0,1]);
});

test('UTF-16 offsets remain aligned with source text containing supplementary Unicode', () => {
    const text='📚按照。📖烟';
    const found=highlighter.findMatches(text,[{word:'按照'}, {word:'烟'}],null,chinese);
    assert.deepEqual(found.map(m=>[m.start,m.end]),[[2,4],[7,8]]);
    assert.deepEqual(found.map(m=>text.slice(m.start,m.end)),['按照','烟']);
});
