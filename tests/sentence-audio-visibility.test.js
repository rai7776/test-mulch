const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'chinese-learning.css'), 'utf8');

test('sentence audio buttons are hidden by default and reserve no inline width', () => {
    assert.match(app, /sentenceAudioButtonsVisible:\s*false/);
    assert.match(css, /#text-display \.chinese-sentence-audio\s*\{\s*display:\s*none;/);
    assert.match(css, /#text-display\.sentence-audio-visible \.chinese-sentence-audio\s*\{\s*display:\s*inline-flex;/);
});

test('compact toggle is outside Chinese-only pinyin options and uses cache-busted assets', () => {
    assert.match(html, /class="reader-display-options"[^>]*>[\s\S]*?<\/div>\s*<label class="reader-sentence-audio-option"/);
    assert.match(html, /id="reader-sentence-audio-visible"[^>]*onchange="setReaderSentenceAudioVisibility\(this.checked\)"/);
    assert.match(html, /🔊表示/);
    assert.match(html, /chinese-learning\.css\?v=10/);
    assert.match(html, /reader-sentence-overlay\.js\?v=1/);
    assert.match(html, /app\.js\?v=4\.17/);
    assert.match(css, /\.reader-sentence-audio-option\s*\{\s*flex:0 0 auto;/);
});

test('toggle preserves the article DOM and persists settings across reader renders', () => {
    const start = app.indexOf('function syncReaderSentenceAudioVisibility() {');
    const end = app.indexOf('function setChinesePinyinVisibility(visible) {', start);
    assert.ok(start >= 0 && end > start, 'visibility handler block is present');

    const calls = [];
    const toggle = { checked: false };
    const display = {
        classList: {
            toggle(name, enabled) {
                calls.push([name, enabled]);
            }
        }
    };
    const saves = [];
    const context = vm.createContext({
        readerSettings: { sentenceAudioButtonsVisible: false },
        document: {
            getElementById(id) {
                return id === 'text-display' ? display
                    : id === 'reader-sentence-audio-visible' ? toggle : null;
            }
        },
        db: { setItem(key, state) {
            saves.push({ key, visible: state.sentenceAudioButtonsVisible });
            return Promise.resolve();
        } }
    });
    vm.runInContext(app.slice(start, end), context);

    vm.runInContext('syncReaderSentenceAudioVisibility()', context);
    assert.deepEqual(calls.at(-1), ['sentence-audio-visible', false]);
    assert.equal(toggle.checked, false);

    vm.runInContext('setReaderSentenceAudioVisibility(true)', context);
    assert.deepEqual(calls.at(-1), ['sentence-audio-visible', true]);
    assert.equal(toggle.checked, true);
    assert.deepEqual(saves.at(-1), { key: 'reader_settings', visible: true });

    // Rendering another chapter uses the saved flag, not the default.
    vm.runInContext('syncReaderSentenceAudioVisibility()', context);
    assert.deepEqual(calls.at(-1), ['sentence-audio-visible', true]);

    vm.runInContext('setReaderSentenceAudioVisibility(false)', context);
    assert.deepEqual(calls.at(-1), ['sentence-audio-visible', false]);
    assert.equal(toggle.checked, false);
    assert.deepEqual(saves.at(-1), { key: 'reader_settings', visible: false });

    const rendering = app.slice(app.indexOf('function renderArticleText()'), app.indexOf('function setChinesePinyinVisibility(visible) {'));
    assert.match(rendering, /syncReaderSentenceAudioVisibility\(\)/);
    assert.doesNotMatch(app.slice(start,end), /renderArticleText\(\)/);
});
