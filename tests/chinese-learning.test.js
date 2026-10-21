const test = require('node:test');
const assert = require('node:assert/strict');
const chinese = require('../chinese-learning.js');

const chineseState = { activeWorkspace: { id: 'zh-workspace', kind: 'language', contentLanguage: 'zh' } };
const englishState = { activeWorkspace: { id: 'en-workspace', kind: 'language', contentLanguage: 'en' } };

function withWorkspace(state, fn) {
    const previous = global.window;
    global.window = { SmartReaderWorkspaceState: state };
    try { return fn(); } finally {
        if (previous === undefined) delete global.window;
        else global.window = previous;
    }
}

test('language setting follows Workspace, never article.language', () => {
    assert.equal(chinese.language({ language: 'en' }, chineseState), 'zh');
    assert.equal(chinese.isChinese({ language: 'en' }, chineseState), true);
    assert.equal(chinese.isChinese({ language: 'zh' }, englishState), false);
});

test('non-Chinese workspaces do not receive pinyin', () => withWorkspace(englishState, () => {
    const item = { word: 'apple', meaning: 'りんご', memorized: false };
    chinese.applyReading(item, null, { language: 'zh' }, 'píng guǒ');
    assert.equal(item.annotations, undefined);
    chinese.setLearning(item, 'meaning', true);
    assert.equal(item.study, undefined);
}));

test('pinyin is saved as an optional annotation and other annotations are preserved', () => withWorkspace(chineseState, () => {
    const original = { annotations: [{ id: 'ipa', value: 'tɛst' }] };
    const word = { word: '学习', meaning: '学ぶ', memorized: false };
    chinese.applyReading(word, original, null, 'xué xí');
    assert.equal(chinese.reading(word), 'xué xí');
    assert.equal(word.annotations.length, 2);
    assert.equal(word.annotations[0].id, 'ipa');
}));

test('pinyin and meaning are independently learnable without discarding SRS state', () => withWorkspace(chineseState, () => {
    const word = { word: '学习', meaning: '学ぶ', memorized: false, study: { level: 2 } };
    chinese.applyReading(word, null, null, 'xué xí');
    chinese.setLearning(word, 'pinyin', true);
    assert.deepEqual(chinese.learning(word), { pinyin: true, meaning: false });
    assert.equal(word.memorized, false);
    chinese.setLearning(word, 'meaning', true);
    assert.equal(word.memorized, true);
    assert.equal(word.study.level, 2);
    chinese.setLearning(word, 'pinyin', false);
    assert.equal(word.memorized, false);
    assert.equal(word.study.chinese.meaning, true);
}));

test('editing the pinyin resets pinyin mastery only', () => withWorkspace(chineseState, () => {
    const word = { word: '行', memorized: true, study: { chinese: { pinyin: true, meaning: true } } };
    chinese.applyReading(word, null, null, 'xíng');
    const edited = { ...word, annotations: word.annotations.slice(), study: { ...word.study, chinese: { ...word.study.chinese } } };
    chinese.applyReading(edited, word, null, 'háng');
    assert.equal(chinese.reading(edited), 'háng');
    assert.deepEqual(chinese.learning(edited), { pinyin: false, meaning: true });
    assert.equal(edited.memorized, false);
}));

test('whole-word SRS mastery can synchronize Chinese sub-targets', () => withWorkspace(chineseState, () => {
    const word = { word: '中文', memorized: true, annotations: [{ id: 'pinyin', value: 'zhōng wén' }] };
    chinese.mirrorMastery(word);
    assert.deepEqual(chinese.learning(word), { pinyin: true, meaning: true });
    word.memorized = false;
    chinese.mirrorMastery(word);
    assert.deepEqual(chinese.learning(word), { pinyin: false, meaning: false });
}));

test('Chinese word counts use segmentation and groups distinguish readings', () => withWorkspace(chineseState, () => {
    assert.equal(chinese.countWords('我喜欢学习中文', null), 4);
    const a = { word: '行', annotations: [{ id: 'pinyin', value: 'xíng' }] };
    const b = { word: '行', annotations: [{ id: 'pinyin', value: 'háng' }] };
    assert.notEqual(chinese.groupKey(a), chinese.groupKey(b));
}));

test('automatic reading generator degrades without CDN, accepts an injected engine', () => {
    assert.equal(chinese.generate('学习', {}), '');
    assert.equal(chinese.generate('学习', { pinyin: () => 'xué xí' }), 'xué xí');
});
