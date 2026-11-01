const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const start = source.indexOf('function isReaderVocabularyHighlightable(');
const end = source.indexOf('\nfunction renderArticleText()', start);
assert.ok(start > 0 && end > start, 'Reader highlight helpers must be defined');

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[char]));
}
function escapeRegExp(value) {
    return String(value).split('').map(char =>
        '\\.^$*+?()[]{}|'.includes(char) ? '\\' + char : char).join('');
}

function createReaderContext(chinese = true) {
    const display = { innerHTML: '' };
    const context = vm.createContext({
        window: {
            SmartReaderChinese: {
                isChinese: () => chinese,
                stopSentenceAudio() {},
                decorateReader() {},
                syncReaderControls() {},
                setSpeechRate() {}
            },
            SmartReaderReaderHeader: { render() {} }
        },
        document: { getElementById(id) { return id === 'text-display' ? display : null; } },
        display,
        escapeHtml,
        escapeRegExp,
        getVocabularyWordSurfaceText: word =>
            String(word?.surfaceText || word?.anchor?.selectedText || word?.word || '').trim(),
        hasGlobalWordId: id => id !== null && id !== undefined,
        hasGlobalProblemId: id => id !== null && id !== undefined,
        currentArticle: { id: 7, words: [], notes: [], questions: [] },
        libraryItems: [],
        goToFolder() {},
        ensureArticleCollections() {},
        getCurrentChapterContent: () => context.articleText,
        getCurrentChapterId() { return null; },
        getReaderParagraphs: content => String(content).split('\n').filter(Boolean),
        getQuestionMarkerEntries: () => new Map(),
        readerSettings: { annotationVisibility: {}, speechRate: 0.85 },
        updateProgress() {},
        articleText: ''
    });
    vm.runInContext(source.slice(start, end), context);
    const renderStart = source.indexOf('function renderArticleText()');
    const renderEnd = source.indexOf('\nfunction setChinesePinyinVisibility(', renderStart);
    assert.ok(renderStart > 0 && renderEnd > renderStart);
    vm.runInContext(source.slice(renderStart, renderEnd), context);
    return context;
}

test('Chinese one-character words highlight in text, including paragraph boundaries', () => {
    const context = createReaderContext();
    context.articleText = '烟在这里。下班后\n后';
    context.currentArticle.words = [
        { id: 1, word: '烟', meaning: 'タバコ' },
        { id: 2, word: '后', meaning: '後' }
    ];
    context.renderArticleText();
    assert.equal((context.display.innerHTML.match(/class="word-highlight"/g) || []).length, 3);
    assert.match(context.display.innerHTML, /<p data-paragraph-index="0"><span class="word-highlight"[^>]*>烟<\/span>/);
    assert.match(context.display.innerHTML, /下班<span class="word-highlight"[^>]*>后<\/span><\/p>/);
    assert.match(context.display.innerHTML, /<p data-paragraph-index="1"><span class="word-highlight"[^>]*>后<\/span><\/p>/);
});

test('English single-character terms are unchanged, but multiple letters are highlighted', () => {
    const context = createReaderContext(false);
    context.articleText = 'I write.';
    context.currentArticle.words = [
        { id: 1, word: 'I', meaning: '私' },
        { id: 2, word: 'write', meaning: '書く' }
    ];
    context.renderArticleText();
    assert.equal((context.display.innerHTML.match(/class="word-highlight"/g) || []).length, 1);
    assert.match(context.display.innerHTML, /<p data-paragraph-index="0">I <span class="word-highlight"[^>]*>write<\/span>\.<\/p>/);
});

test('longest word wins and shorter registered Han words do not nest highlights', () => {
    const context = createReaderContext();
    const words = [
        { id: 11, word: '刻' },
        { id: 12, word: '刻板印象' },
        { id: 13, word: '印象' }
    ];
    const result = context.highlightReaderVocabularyHtml('<p>刻板印象。刻。</p>', words, null);
    assert.equal((result.match(/class="word-highlight"/g) || []).length, 2);
    assert.match(result, /data-word-index="1" data-type="word">刻板印象<\/span>/);
    assert.match(result, /data-word-index="0" data-type="word">刻<\/span>/);
    assert.doesNotMatch(result, /word-highlight[^>]*>刻<span/);
});

test('HTML attributes remain untouched while words inside note text are highlighted', () => {
    const context = createReaderContext();
    const original = '<p><span class="note-highlight" data-label="烟" data-jump-id="5">这个烟</span></p>';
    const result = context.highlightReaderVocabularyHtml(original, [{ id: 3, word: '烟' }], null);
    assert.match(result, /data-label="烟" data-jump-id="5"/);
    assert.match(result, /这个<span class="word-highlight"[^>]*>烟<\/span><\/span>/);
    assert.equal((result.match(/class="word-highlight"/g) || []).length, 1);
});

test('word highlights inside problem marker text include one-character Han', () => {
    const context = createReaderContext();
    context.currentArticle.words = [
        { id: 3, word: '烟' },
        { id: 5, word: '刻板印象' }
    ];
    const result = context.renderQuestionMarkerText('这个烟有刻板印象。', { id: 50 }, null, 0);
    assert.match(result, /data-word-index="0" data-type="word">烟<\/span>/);
    assert.match(result, /data-word-index="1" data-type="word">刻板印象<\/span>/);
    assert.match(result, /data-question-id="50"/);
});

test('only current chapter words are highlighted', () => {
    const context = createReaderContext();
    const words = [
        { id: 1, word: '烟', chapterId: 'chapter-2' },
        { id: 2, word: '后', chapterId: 'chapter-1' },
        { id: 3, word: '学', chapterId: null }
    ];
    const result = context.highlightReaderVocabularyHtml('<p>烟后学。</p>', words, 'chapter-1');
    assert.doesNotMatch(result, /data-word-index="0"/);
    assert.match(result, /data-word-index="1"/);
    assert.match(result, /data-word-index="2"/);
});
