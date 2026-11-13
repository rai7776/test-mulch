const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const tour = read('onboarding.js');
const css = read('onboarding.css');
const app = read('app.js');

test('six welcome slides cover the real five main sections and an overview', () => {
    assert.match(html, /onboarding\.css\?v=4/);
    assert.match(html, /onboarding\.js\?v=7/);
    assert.ok(html.indexOf('discover.js?v=5') < html.indexOf('onboarding.js?v=7'));
    const slides = ['overview', 'library', 'discover', 'vocabulary', 'study', 'problems'];
    for (const kind of slides) assert.ok(tour.includes("kind: '" + kind + "'"), kind);
    assert.match(tour, /INTRO_PAGES\.forEach/);
    assert.match(tour, /slide: slide \+ 1/);
    assert.match(tour, /slide: slide - 1/);
    assert.match(tour, /読みながら、言葉を自分のものに。/);
});

test('first run reuses the existing workspace setup and starts from Library', () => {
    assert.match(tour, /smart-reader-onboarding-v2/);
    assert.match(tour, /if \(!state && setupPending\(\)\)/);
    assert.match(tour, /if \(!state\) return; \/\/ Existing users/);
    assert.match(tour, /setPhase\('setup'\)/);
    assert.match(tour, /async function beginLibrary/);
    assert.match(tour, /window\.goToFolder\?\.\(null\)/);
    assert.doesNotMatch(tour, /function beginDiscover/);
});

test('coaches do not smoothly scroll under the spotlight', () => {
    assert.doesNotMatch(tour, /scrollIntoView/);
    assert.match(css, /\.sr-tour-spotlight \{ transition: none !important; \}/);
    assert.match(tour, /rect\.bottom <= 0/);
    assert.match(tour, /getBoundingClientRect\(\)/);
    assert.match(css, /prefers-reduced-motion: reduce/);
});

test('word capture requires text selection before the existing add button', () => {
    assert.match(tour, /state\.phase === 'select'/);
    assert.match(tour, /selectionchange/);
    assert.match(tour, /root\?\.contains\(selection\.getRangeAt\(0\)\.commonAncestorContainer\)/);
    assert.match(tour, /setPhase\('add', \{ capturedText:/);
    assert.match(tour, /state\?\.phase === 'add'/);
    assert.match(tour, /TARGETS\.add/);
    assert.match(app, /document\.addEventListener\('selectionchange'/);
    assert.match(html, /data-tour-id="add-entry"/);
});

test('word, note and question explanations are inline, not floating over the meaning input', () => {
    assert.match(tour, /function inlineGuide/);
    assert.match(tour, /form\.prepend\(section\)/);
    assert.match(css, /\.sr-tour-inline-guide \{/);
    assert.doesNotMatch(css, /\.sr-tour-inline-guide\s*\{[^}]*position:\s*(fixed|absolute)/s);
    assert.match(tour, /window\.switchModalType\?\.\('note'\)/);
    assert.match(tour, /window\.switchModalType\?\.\('question'\)/);
    assert.match(tour, /単語と意味を入力/);
    assert.match(tour, /「問題」「回答」「解説」/);
});

test('chapters are explained before word selection, Library tools before Discover', () => {
    assert.match(tour, /TARGETS\.chapter/);
    assert.match(tour, /title: '章を切り替えられます'/);
    assert.match(tour, /state\.phase === 'library-tools'/);
    assert.match(tour, /state\.phase === 'discover-tab'/);
    assert.match(tour, /state\.phase === 'discover-guide'/);
    assert.match(html, /id="chapter-title-btn"/);
    assert.match(tour, /Discoverで文章を探しましょう/);
});

test('chapter navigation emits success only after changing and saving', async () => {
    const start = app.indexOf('async function switchToChapter(chapterId, options = {}) {');
    const end = app.indexOf('\nfunction goToPreviousChapter()', start);
    assert.ok(start >= 0 && end > start);
    const events = [];
    let current = 'chapter-a';
    let saves = 0;
    const ctx = {
        currentArticle: { id: 1234 },
        currentTab: 'words',
        currentChapterId: current,
        getCurrentChapters: () => [
            { id: 'chapter-a', title: 'First' },
            { id: 'chapter-b', title: 'Second' }
        ],
        getCurrentChapterId: () => ctx.currentChapterId,
        closeChapterDropdown: () => {},
        rememberReadingPosition: () => {},
        async saveToDB() { saves++; },
        renderChapterNavigation: () => {},
        renderArticleText: () => {},
        reapplyReaderSearchForCurrentContent: () => {},
        renderList: () => {},
        document: { getElementById: () => ({ value: '' }) },
        renderBookmarks: () => {},
        getSavedPositionForChapter: () => null,
        hasStoredChapters: () => false,
        restoreReadingPosition: () => {},
        window: { dispatchEvent(event) { events.push(event); } },
        CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
        Date
    };
    vm.runInNewContext(app.slice(start, end), ctx);
    await ctx.switchToChapter('chapter-a');
    assert.equal(events.length, 0);
    await ctx.switchToChapter('chapter-b');
    assert.equal(ctx.currentChapterId, 'chapter-b');
    assert.equal(saves, 2);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'smartreader:chapter-changed');
    assert.equal(events[0].detail.chapterId, 'chapter-b');
    assert.equal(events[0].detail.articleId, '1234');
});

test('chapter coach automatically proceeds to selection, while hiding competing FABs', () => {
    assert.match(tour, /window\.addEventListener\('smartreader:chapter-changed'/);
    assert.match(tour, /state\?\.phase !== 'chapter'/);
    assert.match(tour, /setPhase\('select'\)/);
    assert.match(tour, /切り替えが完了すると自動で次へ進みます/);
    assert.doesNotMatch(tour, /nextText: '単語の選択へ'/);
    assert.match(tour, /sr-tour-reader-focus/);
    assert.match(css, /body\.sr-tour-reader-focus #add-btn/);
    assert.match(css, /body\.sr-tour-reader-focus #fab-toggle/);
    assert.match(tour, /\['chapter', 'select'\]\.includes\(state\?\.phase\)/);
});


test('back to Library targets the visible breadcrumb and advances after navigation', () => {
    const readerHeader = read('reader-header.js');
    const readerHeaderCss = read('reader-header.css');
    assert.match(readerHeader, /nav\.replaceChildren\(list\)/);
    assert.match(readerHeader, /label\.addEventListener\('click', \(\) => navigate\(crumb\.id\)\)/);
    assert.match(readerHeaderCss, /\.reader-header #app-title, \.reader-header #back-to-library/);
    assert.match(tour, /libraryBack: '#reader-breadcrumbs ol > li:first-child button'/);
    assert.match(tour, /window\.addEventListener\('smartreader:library-shown'/);
    assert.match(tour, /state\?\.phase === 'return-library'/);
    assert.match(app, /new CustomEvent\('smartreader:library-shown'/);
    assert.doesNotMatch(tour, /event\.target\.closest\?\.\(TARGETS\.libraryBack\)/);
    assert.match(css, /body\.sr-tour-return-library #reader-breadcrumbs li:first-child button/);
});

test('showLibrary signals completion after the Library list is rendered', () => {
    const start = app.indexOf('function showLibrary() {');
    const end = app.indexOf('\nfunction createManualChapterId', start);
    assert.ok(start >= 0 && end > start);
    const events = [];
    const library = { style: { display: 'none' } };
    const elements = {
        'library-section': library,
        'library-list': { innerHTML: '' },
        breadcrumbs: {}
    };
    const ctx = {
        currentFolderId: null,
        libraryItems: [],
        window: { dispatchEvent(e) { events.push({type:e.type,detail:e.detail,display:library.style.display}); } },
        document: { getElementById(id) { return elements[id] || null; } },
        CustomEvent: class {
            constructor(type, options) { this.type = type; this.detail = options.detail; }
        },
        flushReadingPositionSave() {},
        hideAllSections() {},
        resetImportReviewSearch() {}
    };
    vm.runInNewContext(app.slice(start,end),ctx);
    ctx.showLibrary();
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'smartreader:library-shown');
    assert.equal(events[0].display, 'block');
    ctx.goToFolder(null);
    assert.equal(events.length, 2);
});

test('unified word modal is horizontally locked but vertically scrollable', () => {
    const style = read('style.css');
    assert.match(style, /#unified-modal-overlay \.unified-modal-content \{[\s\S]*?overflow-x: hidden;[\s\S]*?overflow-y: auto;/);
    assert.match(style, /#unified-modal-overlay \.unified-modal-content \{[\s\S]*?touch-action: pan-y;/);
    assert.match(style, /#unified-modal-overlay \.unified-modal-content form,[\s\S]*?max-width: 100%;/);
    assert.match(style, /#unified-modal-overlay \.unified-modal-content input,[\s\S]*?max-width: 100%;/);
    assert.match(html, /style\.css\?v=1\.7/);
});

test('the onboarding sample preserves existing Library entries and has two chapters', async () => {
    const a = app.indexOf('const ONBOARDING_LIBRARY_SAMPLE_KEY');
    const b = app.indexOf('\nfunction openArticle(id', a);
    assert.ok(a >= 0 && b > a);
    const existing = [{ id: 5, type: 'folder', name: 'My Folder' }];
    const writes = [];
    const context = {
        libraryItems: existing.slice(),
        window: { SmartReaderWorkspaceState: { activeWorkspace: { contentLanguage: 'en' } } },
        db: { async setItem(key, value) { writes.push({key, items: JSON.parse(JSON.stringify(value))}); } },
        Date, console
    };
    vm.runInNewContext(app.slice(a,b), context);
    const first = await context.window.SmartReaderOnboardingEnsureSample();
    assert.ok(first.id);
    assert.equal(context.libraryItems.length, 2);
    assert.deepEqual(context.libraryItems[0], existing[0]);
    const article = context.libraryItems[1];
    assert.equal(article.chapters.length, 2);
    assert.equal(article.words.length, 0);
    assert.equal(article.parentId, null);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].key, 'library_items');
    const again = await context.window.SmartReaderOnboardingEnsureSample();
    assert.equal(again.id, first.id);
    assert.equal(writes.length, 1);
});

test('first-visit tab guides remain optional and can be replayed from Settings', () => {
    assert.match(tour, /smart-reader-tab-hints-v1/);
    assert.match(tour, /'done', 'skipped'/);
    assert.match(tour, /window\.SmartReaderOnboarding = Object\.freeze/);
    assert.match(read('settings-hub.js'), /window\.SmartReaderOnboarding\?\.restart\(\)/);
    assert.match(read('note-structure-ui.js'), /settings-hub\.js\?v=4/);
});

test('all walkthrough steps expose actionable guidance, verified against real navigation targets', () => {
    const navigation = read('main-navigation.js');
    const discover = read('discover.js');
    const header = read('reader-header.js');
    const study = read('study-center.js');
    const buttonTargets = [
        ['chapter', /id="chapter-title-btn"/, html],
        ['add', /data-tour-id="add-entry"/, html],
        ['word', /data-tour-id="word-input"/, html],
        ['note', /data-tour-id="note-type"/, html],
        ['question', /data-tour-id="question-type"/, html],
        ['add-material', /class="start-btn" onclick="showInputArea\(\)"/, html],
        ['discover-search', /id="discover-search"/, discover],
        ['Library breadcrumb', /nav\.replaceChildren\(list\)/, header],
        ['Study heading', /class="learning-section-heading"/, study]
    ];
    for (const [name, regex, source] of buttonTargets) assert.match(source, regex, name);
    assert.match(navigation, /item\.dataset\.mainTabTarget = tab\.id/);
    assert.match(html, /data-main-nav data-active-tab="library"/);
    assert.match(tour, /discoverTab: '#library-section \[data-main-tab-target="discover"\]'/);
    assert.match(tour, /discoverSearch: '#discover-search'/);
});

test('the whole main walkthrough contains every phase and a skip or next action', () => {
    const start = tour.indexOf('function renderPhase() {');
    const end = tour.indexOf('function finishWithoutTour()', start);
    assert.ok(start >= 0 && end > start);
    const phases = [
        'welcome', 'setup', 'library-article', 'chapter', 'select',
        'add', 'word', 'extras', 'note', 'question',
        'return-library', 'library-tools', 'discover-tab', 'discover-guide'
    ];
    const source = tour.slice(start, end);
    for (const phase of phases) assert.ok(source.includes("state.phase === '" + phase + "'"), phase);
    for (const phase of ['library-article', 'chapter', 'select', 'add', 'extras', 'return-library', 'library-tools', 'discover-tab']) {
        const startOfStep = source.indexOf("state.phase === '" + phase + "'");
        const nextStep = source.indexOf("} else if", startOfStep + 1);
        const segment = source.slice(startOfStep, nextStep < 0 ? undefined : nextStep);
        assert.match(segment, /onSkip:|onNext:|nextText:/, phase);
    }
    assert.match(source, /function/); // Every phase is in a callable renderer.
});

test('first-visit tab hints are available to existing users without forcing main onboarding', () => {
    const start = tour.indexOf('function showTabHint(tab) {');
    const end = tour.indexOf('function onClick(event) {', start);
    assert.ok(start >= 0 && end > start);
    const calls = [];
    const context = {
        HINT_COPY: { vocabulary: ['単語帳へ', '単語帳です'] },
        TARGETS: { vocabulary: '.vocabulary-header' },
        activeHint: null,
        state: null,
        read: () => ({}),
        document: { getElementById: () => ({ style: { display: 'block' } }) },
        coach(options) { calls.push(options); },
        write() {}, removeCoach() {}
    };
    vm.runInNewContext(tour.slice(start, end), context);
    context.showTabHint('vocabulary');
    assert.equal(calls.length, 1, 'existing users without a main tour should get a hint');
    calls[0].onNext();
    assert.equal(context.activeHint, null);
    context.state = { phase: 'chapter' };
    context.showTabHint('vocabulary');
    assert.equal(calls.length, 1, 'hints must not interrupt the main walkthrough');
    context.state = { phase: 'done' };
    context.showTabHint('vocabulary');
    assert.equal(calls.length, 2, 'hints should work after the walkthrough completes');
});

test('canceling a tutorial modal recovers a visible step rather than leaving a stale guide', () => {
    const start = tour.indexOf('function onClick(event) {');
    const end = tour.indexOf('function init() {', start);
    assert.ok(start >= 0 && end > start);
    const queued = [];
    const context = {
        state: { phase: 'word' },
        TARGETS: { add: '#add-btn', libraryBack: '#back-to-library' },
        HINT_COPY: {},
        activeHint: null,
        document: {
            querySelector: () => ({ classList: { contains: () => false } })
        },
        setTimeout(fn) { queued.push(fn); },
        setPhase(phase) { context.state = { phase }; },
        removeCoach() {},
        showTabHint() {}
    };
    vm.runInNewContext(tour.slice(start, end), context);
    const clicked = {
        target: {
            closest(selector) {
                return selector.includes('.modal-actions button') ? {} : null;
            }
        }
    };
    context.onClick(clicked);
    assert.equal(queued.length, 1);
    queued.shift()();
    assert.equal(context.state.phase, 'add', 'word edit cancel should return to the add button');
    context.state.phase = 'note';
    context.onClick(clicked);
    queued.shift()();
    assert.equal(context.state.phase, 'return-library', 'note edit cancel should not trap the user');
    context.state.phase = 'question';
    context.onClick(clicked);
    queued.shift()();
    assert.equal(context.state.phase, 'return-library', 'question edit cancel should not trap the user');
});
