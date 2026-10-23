const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../learning-targets.js');
const chinese = require('../chinese-learning.js');
const zh = { activeWorkspace: { kind: 'language', contentLanguage: 'zh' } };
const en = { activeWorkspace: { kind: 'language', contentLanguage: 'en' } };
const example = () => ({ word: '学习', meaning: '学ぶ', memorized: true, context: '我学习中文。', study: { level: 4, seenCount: 18, nextReviewAt: 1234 } });
function withChinese(fn) {
    const previous = global.window;
    global.window = { SmartReaderWorkspaceState: zh };
    try { return fn(); } finally { if (previous === undefined) delete global.window; else global.window = previous; }
}

test('ST-05 no pinyin means only meaning counts; context/memo never add targets', () => {
    const word = example();
    word.memo = 'note';
    core.normalize(word, zh);
    assert.equal(word.memorized, true);
    assert.deepEqual(core.targets(word, zh).map(target => target.id), ['meaning']);
    core.setAll(word, false, zh);
    assert.equal(word.memorized, false);
    core.setAll(word, true, zh);
    assert.equal(word.annotations, undefined);
    assert.equal(word.study.level, 4);
    assert.equal(word.study.nextReviewAt, 1234);
});

test('ST-06 adding a saved pinyin target resets only pinyin and removing it restores meaning-only mastery', () => withChinese(() => {
    const before = example();
    const added = structuredClone(before);
    chinese.applyReading(added, before, null, 'xué xí');
    assert.deepEqual(chinese.learning(added), { pinyin: false, meaning: true });
    assert.equal(added.memorized, false);
    assert.equal(added.study.seenCount, 18);
    chinese.setLearning(added, 'pinyin', true);
    added.study.learningTargets['reading:pinyin'].history = [{ result: 'known' }];
    const removed = structuredClone(added);
    chinese.applyReading(removed, added, null, '');
    assert.equal(removed.memorized, true);
    assert.ok(!removed.annotations.some(annotation => annotation.id === 'pinyin'));
    assert.deepEqual(removed.study.learningTargets['reading:pinyin'].history, [{ result: 'known' }]);
    const readded = structuredClone(removed);
    chinese.applyReading(readded, removed, null, 'xué xí');
    assert.equal(readded.memorized, false);
    assert.equal(readded.study.learningTargets['reading:pinyin'].learned, false);
}));

test('ST-07 explicit custom targets start unlearned and all toggle covers three targets', () => {
    const word = example();
    word.annotations = [{ id: 'pinyin', value: 'xué xí', learnable: true }];
    core.normalize(word, zh);
    word.learningTargets = [{ id: 'custom:formal-usage', label: '用法', value: 'usage' }];
    core.normalize(word, zh);
    assert.equal(word.memorized, false);
    assert.deepEqual(core.summary(word, zh), { total: 3, learnedCount: 2, all: false, partial: true });
    const input = { setAttribute(key, value) { this[key] = value; } };
    core.syncCheckbox(input, word, zh);
    assert.equal(input.indeterminate, true);
    assert.equal(input['aria-checked'], 'mixed');
    core.setAll(word, true, zh);
    assert.equal(word.memorized, true);
    core.setAll(word, false, zh);
    assert.equal(core.summary(word, zh).learnedCount, 0);
    assert.equal(word.study.seenCount, 18);
});

test('ST-08 disabled, empty and non-participating targets do not block mastery', () => {
    const word = example();
    word.learningTargets = [
        { id: 'custom:blank', value: '' },
        { id: 'custom:disabled', value: 'x', enabled: false },
        { id: 'custom:extra', value: 'y', countsTowardMastery: false }
    ];
    core.normalize(word, zh);
    assert.equal(word.memorized, true);
    assert.equal(core.summary(word, zh).total, 1);
    word.learningTargets[1].enabled = true;
    core.normalize(word, zh);
    assert.equal(word.memorized, false);
    assert.equal(core.summary(word, zh).partial, true);
});

test('canonical target state wins over stale legacy flags and preserves target history', () => {
    const word = example();
    word.study.chinese = { meaning: false, pinyin: false };
    word.study.learningTargets = { meaning: { learned: true, history: [{ at: 1 }] }, 'custom:deleted': { learned: true, history: ['keep'] } };
    core.normalize(word, zh);
    assert.equal(word.memorized, true);
    assert.equal(word.study.chinese.meaning, true);
    core.set(word, 'meaning', false, zh);
    assert.deepEqual(word.study.learningTargets.meaning.history, [{ at: 1 }]);
    assert.deepEqual(word.study.learningTargets['custom:deleted'].history, ['keep']);
});

test('English legacy behavior remains a single memorized flag; explicit custom IDs work in any language', () => {
    const word = example();
    const before = structuredClone(word);
    core.normalize(word, en);
    assert.deepEqual(word, before);
    core.setAll(word, false, en);
    assert.equal(word.memorized, false);
    assert.equal(word.study.learningTargets, undefined);
    word.learningTargets = [{ id: 'custom:gender', value: 'feminine' }];
    core.normalize(word, en);
    core.setAll(word, true, en);
    assert.equal(word.memorized, true);
    assert.ok(word.study.learningTargets['custom:gender'].learned);
});

test('blank saved pinyin is not regenerated on edit and clearing a new candidate is respected', () => withChinese(() => {
    const previous = global.document;
    const input = { value: '', dataset: {} };
    const text = { value: '学习' };
    const box = { hidden: false };
    const hint = {};
    global.document = { getElementById: id => ({ 'input-word-pinyin': input, 'input-word-text': text, 'chinese-word-field': box })[id], querySelector: () => hint };
    window.pinyinPro = { pinyin: () => 'xué xí' };
    try {
        chinese.syncEditor(null, example());
        assert.equal(input.value, '');
        text.value = '学习中文';
        chinese.wordTextChanged();
        assert.equal(input.value, '');
        chinese.syncEditor(null, null);
        assert.equal(input.value, 'xué xí');
        input.value = '';
        chinese.readingEdited();
        text.value = '学习中文';
        chinese.wordTextChanged();
        assert.equal(input.value, '');
        chinese.regenerate();
        assert.equal(input.value, 'xué xí');
    } finally { if (previous === undefined) delete global.document; else global.document = previous; }
}));

test('copy keeps target definitions but resets mastery and SRS for the destination', () => {
    const copy = require('../article-copy-core.js');
    const word = example();
    word.learningTargets = [{ id: 'custom:usage', value: 'formal' }];
    core.setAll(word, true, zh);
    const result = copy.cloneArticleForWorkspace({ id: 1, type: 'article', name: 'test', content: '学习', words: [word] });
    const copied = result.words[0];
    assert.deepEqual(copied.learningTargets, word.learningTargets);
    assert.equal(copied.study, undefined);
    core.normalize(copied, zh);
    assert.equal(copied.memorized, false);
    assert.equal(core.summary(copied, zh).learnedCount, 0);
    assert.equal(word.memorized, true);
});
