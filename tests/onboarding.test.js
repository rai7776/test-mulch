const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const tour = read('onboarding.js');
const css = read('onboarding.css');
const app = read('app.js');
const discover = read('discover.js');

test('welcome and coachmark assets are loaded after the product UI scripts', () => {
    assert.match(html, /onboarding\.css\?v=1/);
    assert.match(html, /onboarding\.js\?v=2/);
    assert.ok(html.indexOf('discover.js?v=5') < html.indexOf('onboarding.js?v=2'));
    assert.match(tour, /読みながら、言葉を自分のものに。/);
    assert.match(tour, /Vocabular(y|ies)/i);
    assert.match(tour, /Problems/);
});

test('first-run gating reuses initial workspace setup and never forces established users', () => {
    assert.match(tour, /if \(!state && setupPending\(\)\)/);
    assert.match(tour, /if \(!state\) return; \/\/ Existing users/);
    assert.match(tour, /phase: 'welcome'/);
    assert.match(tour, /phase: 'setup'/);
    assert.match(tour, /setupPending\(\) \? 'はじめる'/);
    assert.match(tour, /localStorage\.setItem/);
});

test('real reader entry actions expose stable hooks for the coachmarks', () => {
    for (const id of ['save-discover', 'reader-text', 'add-entry', 'word-input', 'note-type', 'question-type']) {
        assert.ok(html.includes('data-tour-id="' + id + '"'), id);
        assert.ok(tour.includes('data-tour-id="' + id + '"'), id);
    }
    assert.match(discover, /data-tour-id="discover-article"/);
    assert.match(app, /card\.dataset\.tourId = 'library-item'/);
    assert.match(tour, /getBoundingClientRect\(\)/);
    assert.match(tour, /scrollIntoView/);
    assert.match(tour, /MutationObserver/);
});

test('progress only reacts after genuine article, word and library saves', () => {
    assert.match(app, /smartreader:article-opened/);
    assert.match(app, /smartreader:unified-item-saved/);
    assert.match(app, /smartreader:discover-saved/);
    assert.match(tour, /addEventListener\('smartreader:article-opened'/);
    assert.match(tour, /addEventListener\('smartreader:unified-item-saved'/);
    assert.match(tour, /addEventListener\('smartreader:discover-saved'/);
    assert.match(tour, /event\.detail\?\.type === 'word'/);
});

test('language-specific intro articles exist and do not alter existing learning records', () => {
    const items = JSON.parse(read('discover-data/index.json')).articles;
    assert.ok(items.some(a => a.id === 'sample-story-001' && a.language === 'en'));
    assert.ok(items.some(a => a.id === 'tour-zh-001' && a.language === 'zh' && a.content.length > 50));
    assert.match(tour, /SAMPLES = Object\.freeze\(\{ en: 'sample-story-001', zh: 'tour-zh-001' \}\)/);
});

test('optional first-visit guides and replay remain independent of the main tutorial', () => {
    assert.match(tour, /smart-reader-tab-hints-v1/);
    assert.match(tour, /'done', 'skipped'/);
    assert.match(tour, /window\.SmartReaderOnboarding = Object\.freeze/);
    assert.match(read('settings-hub.js'), /window\.SmartReaderOnboarding\?\.restart\(\)/);
    assert.match(read('note-structure-ui.js'), /settings-hub\.js\?v=4/);
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(css, /pointer-events: none/);
});