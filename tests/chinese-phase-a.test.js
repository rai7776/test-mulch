const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const profile = require('../language-profile.js');
const chinese = require('../chinese-learning.js');
const state = language => ({ activeWorkspace: { kind: 'language', contentLanguage: language } });
function workspace(fn) {
    const previous = global.window;
    global.window = { SmartReaderWorkspaceState: state('zh') };
    try { return fn(); } finally { chinese.stopSentenceAudio(); if (previous === undefined) delete global.window; else global.window = previous; }
}
function word(study = {}) { return { word: '行', meaning: '行く', memorized: false, annotations: [{ id: 'pinyin', value: 'xíng' }], study }; }

test('profile resolves Workspace regions and neutral unsupported languages', () => {
    assert.equal(profile.active(state('zh-CN')).id, 'zh');
    assert.equal(profile.active(state('zh-TW')).locale, 'zh-TW');
    assert.equal(profile.active(state('ja')).id, 'ja');
    assert.deepEqual(profile.active(state('xx')).annotations, []);
    assert.equal(profile.active({ activeWorkspace: { kind: 'general', contentLanguage: 'zh' } }).id, '');
    assert.equal(profile.wholeWord('我喜欢学习中文。', 3, 2, state('zh')), true);
    assert.equal(profile.wholeWord('learning', 0, 5, state('en')), false);
    assert.equal(profile.wordSegments('我喜欢学习中文。', state('zh')).length, 4);
});

test('old PR learning flags normalize without changing SRS or annotations', () => workspace(() => {
    const item = word({ meaning: true, annotations: { pinyin: false }, level: 5, nextReviewAt: 12345, seenCount: 71, custom: { retained: true } });
    chinese.normalizeLearning(item);
    assert.deepEqual(item.study.chinese, { pinyin: false, meaning: true });
    assert.equal(item.memorized, false);
    assert.equal(item.study.level, 5);
    assert.equal(item.study.nextReviewAt, 12345);
    assert.equal(item.study.seenCount, 71);
    assert.ok(item.study.custom.retained);
    chinese.setLearning(item, 'pinyin', true);
    assert.equal(item.memorized, true);
    // A stale legacy field never overrides canonical flags.
    item.study.meaning = false;
    chinese.normalizeLearning(item);
    assert.equal(item.study.chinese.meaning, true);
}));

test('optional missing readings allow meaning-only mastery without generating an annotation', () => workspace(() => {
    const item = { word: '学习', meaning: '学ぶ', memorized: true };
    chinese.normalizeLearning(item);
    assert.equal(item.memorized, true);
    chinese.setAllLearning(item, true);
    assert.equal(item.memorized, true);
    assert.equal(item.study.chinese.meaning, true);
    assert.equal(item.annotations, undefined);
}));

test('editing old PR readings resets only pinyin and preserves unknown annotations', () => workspace(() => {
    const original = word({ meaning: true, annotations: { pinyin: true }, level: 3 });
    original.annotations.push({ id: 'custom', value: 'keep' });
    const updated = structuredClone(original);
    chinese.applyReading(updated, original, null, 'háng');
    assert.deepEqual(updated.study.chinese, { pinyin: false, meaning: true });
    assert.equal(updated.study.level, 3);
    assert.equal(updated.annotations[0].value, 'keep');
    assert.equal(chinese.reading(original), 'xíng');
}));

test('actual SRS grading retains independent flags while advancing level and schedule', () => workspace(() => {
    const source = fs.readFileSync(require.resolve('../flashcard-study.js'), 'utf8');
    const start = source.indexOf('    function applyStudyResult(');
    const end = source.indexOf('    function sessionSnapshot(', start);
    const item = word({ chinese: { pinyin: true, meaning: false }, level: 3, nextReviewAt: 1,
        sessionCount: 2, firstKnownCount: 1, seenCount: 5, knownCount: 2, unsureCount: 1, wrongCount: 2,
        correctStreak: 1, firstResponseCount: 2, lapseCount: 0, difficultyScore: 40 });
    const context = vm.createContext({ window: { SmartReaderChinese: chinese },
        session: { evaluated: new Set() }, Date, Math,
        ensureStudy: value => { chinese.normalizeLearning(value); return value.study; },
        startOfNextLocalDay: () => Date.now() + 86400000,
        sessionAttemptState: () => ({ responses: 0, known: 0, wrong: 0, unsure: 0 }),
        adjustDifficulty: () => {}, adaptiveIntervalDays: () => 3,
        localDayAfter: days => Date.now() + days * 86400000
    });
    vm.runInContext(source.slice(start, end) + ';this.grade=applyStudyResult;', context);
    context.grade({ word: item, key: 'one' }, 'known');
    assert.equal(item.study.level, 4);
    assert.ok(item.study.nextReviewAt > Date.now());
    assert.deepEqual(item.study.chinese, { pinyin: true, meaning: false });
    assert.equal(item.memorized, false);
}));

test('speech speed, errors and competing audio safely release playback', () => workspace(() => {
    const spoken = [];
    let cancelled = 0;
    const button = { setAttribute(name, value) { this[name] = value; } };
    window.speechSynthesis = { cancel() { cancelled++; }, speak(value) { spoken.push(value); } };
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    chinese.setSpeechRate(1.2);
    chinese.playSentence('学习中文。', button);
    assert.equal(spoken[0].rate, 1.2);
    assert.equal(spoken[0].lang, 'zh-CN');
    chinese.beforeSpeech({ text: 'another source' });
    assert.equal(button['aria-pressed'], 'false');
    assert.ok(cancelled >= 2);
    chinese.playSentence('再来。', button);
    spoken[1].onerror();
    assert.equal(button['aria-pressed'], 'false');
    chinese.setSpeechRate(0.85);
}));

test('sentence fallback supports Chinese, Latin punctuation, quotes and newline boundaries', () => {
    const text = '我学习中文。你呢？\n“Hello!”\n末尾';
    const sentences = profile.sentences(text, state('zh'));
    assert.equal(sentences.map(part => part.text).join(''), text);
    assert.ok(sentences.length >= 4);
    for (const part of sentences) assert.equal(text.slice(part.start, part.end), part.text);
});

// Minimal DOM contract used by the real decorator; verifies text/queue behavior
// without launching a browser or loading third-party packages.
function readerFixture(text) {
    const classes = () => { const values = new Set(); return { add: x => values.add(x), remove: x => values.delete(x),
        contains: x => values.has(x), toggle(x, enabled) { enabled ? values.add(x) : values.delete(x); } }; };
    const paragraph = { dataset: {} };
    const doc = {
        createElement() { return { dataset: {}, classList: classes(), attributes: {}, textContent: '',
            setAttribute(key, value) { this.attributes[key] = value; }, addEventListener() {} }; },
        createTextNode(value) { return { textContent: value }; },
        createDocumentFragment() { return { children: [], appendChild(child) { this.children.push(child); } }; },
        createTreeWalker() { let used = false; return { currentNode: null, nextNode() {
            if (used) return false; used = true; this.currentNode = node; return true;
        } }; }
    };
    const node = { nodeValue: text, parentElement: { closest: () => null }, replaceWith(fragment) { paragraph.children = fragment.children; } };
    return { ownerDocument: doc, classList: classes(), querySelectorAll: () => [paragraph], paragraph };
}

test('RD-01/AU-01 decorator keeps original text, queues sentences and cancels safely', () => workspace(() => {
    const text = '我学习中文。你呢？';
    const display = readerFixture(text);
    const spoken = [];
    window.pinyinPro = { pinyin: value => Array.from(value).map(() => 'pīn') };
    window.speechSynthesis = { cancel() {}, speak(value) { spoken.push(value); } };
    window.SpeechSynthesisUtterance = class { constructor(value) { this.text = value; } };
    chinese.decorateReader(display, { words: [] }, true);
    assert.equal(display.paragraph.children.map(child => child.textContent).join(''), text);
    assert.equal(display.paragraph.children.filter(child => child.dataset?.pinyin).length, 7);
    const childCount = display.paragraph.children.length;
    chinese.decorateReader(display, { words: [] }, false);
    assert.equal(display.paragraph.children.length, childCount);
    assert.equal(display.classList.contains('chinese-pinyin-visible'), false);
    chinese.playAllSentences(display);
    assert.equal(spoken[0].text, '我学习中文。');
    spoken[0].onend();
    assert.equal(spoken[1].text, '你呢？');
    chinese.stopSentenceAudio();
    spoken[1].onend();
    assert.equal(spoken.length, 2);
    assert.ok(display.paragraph.children.filter(child => child.classList).every(child => !child.classList.contains('is-speaking')));
}));

test('ST-03 undo restores both flags and SRS snapshot', () => workspace(() => {
    const source = fs.readFileSync(require.resolve('../flashcard-study.js'), 'utf8');
    const start = source.indexOf('    function restoreSnapshot(');
    const end = source.indexOf('    function answerCurrent(', start);
    const item = word({ chinese: { pinyin: false, meaning: false }, level: 5 });
    const original = { chinese: { pinyin: true, meaning: false }, level: 2, nextReviewAt: 456 };
    const context = vm.createContext({ session: {}, cloneStudy: structuredClone, scheduleSave() {} });
    vm.runInContext(source.slice(start, end) + ';this.restore=restoreSnapshot;', context);
    context.restore({ hadStudy: true, entry: { word: item }, study: original, memorized: false,
        sessionState: { queue: [], nextRound: [], stats: {}, evaluated: [], answeredUnique: [], attempts: [] } });
    assert.deepEqual(item.study, original);
    assert.equal(item.memorized, false);
}));

test('SR-02 Reader search spans split pinyin nodes as one original-text match', () => {
    const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
    const paragraph = {};
    const nodes = Array.from('我喜欢学习中文。').map(char => ({ nodeValue: char,
        parentElement: { closest: () => null }, replaceWith(fragment) { this.rendered = fragment.children; } }));
    const display = { querySelectorAll: selector => selector === 'p[data-paragraph-index]' ? [paragraph] : [] };
    const document = {
        getElementById: () => display,
        createTreeWalker() { let index = 0; return { currentNode: null, nextNode() { this.currentNode = nodes[index++]; return this.currentNode; } }; },
        createDocumentFragment() { return { children: [], appendChild(child) { this.children.push(child); } }; },
        createElement() { return {}; }, createTextNode: textContent => ({ textContent })
    };
    const context = vm.createContext({ document, NodeFilter: { SHOW_TEXT: 4 },
        readerSearchState: { query: '学习', wholeWord: true, caseSensitive: false, currentIndex: -1 },
        updateSearchCount() {}, isBookWideSearchActive: () => false,
        isWholeWordMatch: (text, index, length) => profile.wholeWord(text, index, length, state('zh'))
    });
    for (const [name, next] of [['findSearchMatches', 'buildBookSearchResults'], ['applySearchHighlights', 'setActiveSearchResult']]) {
        const start = source.indexOf('function ' + name + '(');
        let end = source.indexOf('\nfunction ' + next + '(', start);
        if (end < 0) end = source.indexOf('\nfunction ', start + 10);
        vm.runInContext(source.slice(start, end), context);
    }
    vm.runInContext('applySearchHighlights()', context);
    assert.equal(context.readerSearchState.matches.length, 1);
    assert.equal(context.readerSearchState.matches[0].searchParts.map(part => part.textContent).join(''), '学习');
    assert.equal(nodes.map(node => node.rendered.map(part => part.textContent).join('')).join(''), '我喜欢学习中文。');
});

test('VO-02 CSV exports canonical reading columns while keeping legacy columns', () => workspace(() => {
    const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
    const item = word({ chinese: { pinyin: true, meaning: false } });
    let exported;
    const entry = { word: item, wordText: '行', language: 'zh', reading: 'xíng', tags: [] };
    const context = vm.createContext({ window: { SmartReaderChinese: chinese },
        collectGlobalVocabulary: () => [entry], globalCsvValue: value => String(value ?? ''),
        downloadGlobalVocabularyCsv: value => { exported = value; } });
    const start = source.indexOf('function exportGlobalVocabularyCSV(');
    const end = source.indexOf('// --- Global Problems', start);
    vm.runInContext(source.slice(start, end) + ';exportGlobalVocabularyCSV()', context);
    const [headers, values] = exported.trim().split('\r\n').map(line => line.split(','));
    for (const name of ['Language','ReadingSystem','Reading','ReadingLearned','MeaningLearned','PinyinLearned']) assert.ok(headers.includes(name));
    assert.equal(values[headers.indexOf('ReadingSystem')], 'pinyin');
    assert.equal(values[headers.indexOf('ReadingLearned')], 'true');
    assert.equal(values[headers.indexOf('MeaningLearned')], 'false');
}));
