/* --- サンプルデータの定義 --- */
const SAMPLE_DATA = [
    {
        id: 1001,
        type: 'folder',
        name: "📚 チュートリアル",
        parentId: null
    },
    {
        id: 1002,
        type: 'article',
        name: "Smart Readerの使い方",
        parentId: 1001, // 「チュートリアル」フォルダの中に入れる
        content: "Smart Readerへようこそ！\n\nこのアプリは、英文を読みながら気になった単語やフレーズを素早く保存できるツールです。\n\n右下の「📋」ボタンでサイドパネルを開き、単語やノートを確認できます。また、「＋」ボタンで新しい単語を追加できます。\n\nサンプル単語の「Collaborator」がこの文章の中にあります。クリックしてみてください。",
        url: "https://example.com",
        words: [
            { id: 2001, word: "Collaborator", meaning: "協力者、共同制作者", memo: "発音注意：kəlǽbəreitər", memorized: false }
        ],
        notes: [
            { id: 3001, originalText: "Welcome to Smart Reader!", translation: "Smart Readerへようこそ！", extra: "基本の挨拶フレーズです。" }
        ],
        bookmarks: []
    },
    {
        id: 1003,
        type: 'article',
        name: "🍅 The Pomodoro Technique",
        parentId: 1001, // 「チュートリアル」フォルダに入ります
        content: "The Pomodoro Technique is a time management method developed by Francesco Cirillo in the late 1980s.\n\nIt uses a timer to break work into intervals, traditionally 25 minutes in length, separated by short breaks. Each interval is known as a pomodoro, from the Italian word for 'tomato', after the tomato-shaped kitchen timer that Cirillo used as a university student.\n\nThe method is simple: choose a task, set the timer for 25 minutes, and work until the timer rings. Then, take a short break (about 5 minutes). After four pomodoros, take a longer break.",
        url: "https://en.wikipedia.org/wiki/Pomodoro_Technique",
        words: [
            { id: 2002, word: "interval", meaning: "間隔、合間", memo: "発音: íntervəl", memorized: false },
            { id: 2003, word: "traditionally", meaning: "伝統的に、慣例として", memo: "traditional (形容詞) の副詞形", memorized: false },
            { id: 2004, word: "separated", meaning: "分けられた、離れた", memo: "separate (動詞/形容詞) の過去分詞形", memorized: false }
        ],
        notes: [
            { 
                id: 3002, 
                originalText: "It uses a timer to break work into intervals, traditionally 25 minutes in length, separated by short breaks.", 
                translation: "この手法ではタイマーを使い、作業を短い休憩で区切られた（通常は25分間の）「間隔」へと分割します。", 
                extra: "「separated by short breaks」は前の「intervals」を詳しく説明する過去分詞の後置修飾です。" 
            },
            { 
                id: 3003, 
                originalText: "Each interval is known as a pomodoro, from the Italian word for 'tomato'", 
                translation: "各インターバルは「ポモドーロ」として知られており、これはイタリア語で「トマト」を意味します。", 
                extra: "「be known as ～」＝「～として知られている」という重要表現が含まれています。" 
            }
        ],
        bookmarks: []
    }
];


const db = localforage.createInstance({ name: "ProjectA_DB_v3" });
const DEFAULT_READER_SETTINGS = Object.freeze({ fontSize: 18, lineHeight: 1.8 });

let libraryItems = [], currentFolderId = null, currentArticle = null;
let currentChapterId = null;
let readerWordCounts = { articleId: null, chapterId: null, chapter: 0, book: 0, chapterChars: 0, bookChars: 0 };
let pendingImportedDocument = null;
let importReviewState = null;
let importReviewActiveIndex = 0;
let importReviewTempSequence = 0;
let importReviewFeedbackTimer = null;
let importReviewSearchState = {
    query: '',
    scope: 'current',
    caseSensitive: false,
    currentIndex: -1,
    matches: []
};
let currentTab = 'words', isAnkiMode = false, selectedText = "", editingId = null;
let selectedReaderCapture = null;
let readerSelectionSuppressUntil = 0;
let readerSettings = { ...DEFAULT_READER_SETTINGS };
let movingItemId = null;
let currentModalType = 'word';
let editingSourceIndex = null;
const questionCardRevealState = new Map();
let readingPositionSaveTimer = null;
let suppressReadingPositionSave = false;
let readingPositionRestoreToken = 0;
let pendingSmartReaderRestore = null;
let readerSearchState = {
    query: '',
    wholeWord: false,
    caseSensitive: false,
    scope: 'chapter',
    articleId: null,
    currentIndex: -1,
    matches: [],
    results: []
};
let globalSearchState = {
    query: '',
    wholeWord: false,
    caseSensitive: false
};
let globalVocabularyEditRef = null;
let globalProblemEditRef = null;
const QUESTION_TYPES = Object.freeze(['blank', 'choice', 'vocabulary', 'grammar', 'translation', 'reading', 'free', 'sorting', 'true/false', 'other']);
const QUESTION_RESULTS = Object.freeze(['correct', 'incorrect', 'partial', 'ungraded']);
let globalVocabularyState = {
    entries: [],
    query: '',
    exact: false,
    status: 'all',
    tag: 'all',
    partOfSpeech: 'all',
    sourceId: 'all',
    chapterId: 'all',
    sort: 'newest',
    grouped: false,
    ankiMode: false,
    ankiTarget: 'both',
    expandedKey: null,
    contextExpandedKeys: new Set(),
    contextCollapsedKeys: new Set(),
    contextRevealedMaskKeys: new Set(),
    ankiRevealedKeys: new Set()
};
let globalProblemsState = {
    entries: [],
    query: '',
    status: 'all',
    questionType: 'all',
    tag: 'all',
    sourceId: 'all',
    chapterId: 'all',
    difficulty: 'all',
    sort: 'newest',
    expandedKey: null,
    historyExpandedKeys: new Set(),
    answerExpandedKeys: new Set(),
    explanationExpandedKeys: new Set(),
    memoExpandedKeys: new Set()
};
let readerScrollLockState = null;

// --- 初期化関数 (1つに統合) ---
async function init() {
    // DBからデータを取得
    libraryItems = await db.getItem('library_items') || [];

    // データが空ならサンプルを投入
    if (libraryItems.length === 0) {
        libraryItems = SAMPLE_DATA; // SAMPLE_DATAが定義されている前提
        await db.setItem('library_items', libraryItems);
    }

    const savedSet = await db.getItem('reader_settings');
    if (savedSet) { 
        readerSettings = savedSet; 
        applySettings(); 
    }

    showLibrary(); 
    renderList('words');
    setupEventListeners(); // リスナー設定を呼び出す
}

// --- イベントリスナー設定 ---
function setupEventListeners() {
    const bookmarkBtn = document.getElementById('bookmark-btn');
    if (bookmarkBtn) {
        // HTML側にも onclick="addBookmark()" がある場合は、二重登録にならないよう注意
        bookmarkBtn.onclick = addBookmark; 
    }
    
    // +ボタン (単語・ノート追加)
    const addBtn = document.getElementById('add-btn');
    if (addBtn) {
        addBtn.onclick = openUnifiedModal; 
    }
    
    const textDisplay = document.getElementById('text-display');
    if (textDisplay) {
        textDisplay.onscroll = updateProgress;
    }

    document.addEventListener('click', event => {
        const navigation = document.getElementById('chapter-navigation');
        if (navigation && !navigation.contains(event.target)) closeChapterDropdown();
    });

    setupImportReviewControls();
}

// --- 新規追加: 暗記モードの切り替え ---
function toggleAnkiMode() {
    const check = document.getElementById('anki-mode-check');
    isAnkiMode = check ? check.checked : false;
    
    // 画面を更新してマスクを適用
    renderList(currentTab, document.getElementById('list-search').value);
}

// 選択テキスト保持
document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';
    if (!text) return;
    selectedText = text;

    const display = document.getElementById('text-display');
    const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    if (display && range && display.contains(range.commonAncestorContainer)) {
        selectedReaderCapture = captureReaderSelection(range, text);
        // 長押し選択直後に発生する合成clickを、単語ジャンプとして扱わない。
        readerSelectionSuppressUntil = Date.now() + 700;
    } else {
        selectedReaderCapture = null;
    }
});

// --- ファイル読み込み関連 ---
function setFileImportStatus(message, isError = false) {
    const status = document.getElementById('file-import-message');
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('is-error', !!isError);
}

function getImportedDocumentText(documentData) {
    if (!documentData) return '';
    if (!Array.isArray(documentData.chapters) || documentData.chapters.length === 0) {
        return typeof documentData.content === 'string' ? documentData.content : '';
    }
    return documentData.chapters
        .map(chapter => typeof chapter.content === 'string' ? chapter.content : '')
        .filter(Boolean)
        .join('\n\n');
}

function createImportReviewState(documentData) {
    const sourceName = documentData?.sourceName || 'document';
    const rawChapters = Array.isArray(documentData?.chapters) ? documentData.chapters : [];
    const chapters = rawChapters.length ? rawChapters : [{
        title: '本文',
        content: typeof documentData?.content === 'string' ? documentData.content : '',
        order: 0
    }];
    return {
        mode: 'import',
        articleId: null,
        title: String(documentData?.title || '').trim() || '無題',
        sourceType: documentData?.sourceType || 'text',
        sourceName,
        warnings: Array.isArray(documentData?.warnings) ? documentData.warnings.slice() : [],
        chapters: chapters.map((chapter, index) => ({
            ...chapter,
            id: chapter.id !== undefined && chapter.id !== null && String(chapter.id).trim()
                ? String(chapter.id)
                : 'review-temp-' + (++importReviewTempSequence),
            title: String(chapter.title || '').trim() || '本文',
            content: typeof chapter.content === 'string' ? chapter.content : '',
            order: index
        }))
    };
}

function createSavedBookEditorState(article) {
    const rawChapters = Array.isArray(article?.chapters) ? article.chapters : [];
    const chapters = rawChapters
        .filter(chapter => chapter && typeof chapter === 'object')
        .sort((a, b) => {
            const aOrder = Number.isFinite(Number(a.order)) ? Number(a.order) : 0;
            const bOrder = Number.isFinite(Number(b.order)) ? Number(b.order) : 0;
            return aOrder - bOrder;
        })
        .map((chapter, index) => ({
            ...chapter,
            id: chapter.id !== undefined && chapter.id !== null && String(chapter.id).trim()
                ? chapter.id
                : `chapter-${index + 1}`,
            title: String(chapter.title || '').trim() || `Chapter ${index + 1}`,
            content: typeof chapter.content === 'string' ? chapter.content : '',
            order: index
        }));

    return {
        mode: 'saved',
        articleId: article?.id,
        title: String(article?.name || '').trim() || '無題',
        sourceType: article?.sourceType || '',
        sourceName: article?.sourceName || '',
        warnings: [],
        readingPositionRedirects: {},
        chapters
    };
}

function isSavedBookEditor() {
    return !!(importReviewState && importReviewState.mode === 'saved');
}

function resetImportReviewSearch() {
    importReviewSearchState = {
        query: '',
        scope: 'current',
        caseSensitive: false,
        currentIndex: -1,
        matches: []
    };
    const input = document.getElementById('import-review-search-input');
    const scope = document.getElementById('import-review-search-scope');
    const caseSensitive = document.getElementById('import-review-search-case-sensitive');
    if (input) input.value = '';
    if (scope) scope.value = 'current';
    if (caseSensitive) caseSensitive.checked = false;
    updateImportReviewSearch(false);
}

function openImportReview(documentData) {
    importReviewState = createImportReviewState(documentData);
    importReviewActiveIndex = 0;
    pendingImportedDocument = documentData;
    resetImportReviewSearch();
    const titleInput = document.getElementById('text-title');
    const bodyInput = document.getElementById('text-input');
    if (titleInput) titleInput.value = importReviewState.title;
    if (bodyInput) {
        bodyInput.value = getImportedDocumentText(importReviewState);
        bodyInput.readOnly = true;
    }
    hideAllSections();
    document.getElementById('add-btn').style.display = 'none';
    document.getElementById('fab-toggle').style.display = 'none';
    const review = document.getElementById('import-review-area');
    if (review) review.style.display = 'flex';
    renderImportReview();
    setImportReviewStatus(
        importReviewState.chapters.length + '章を保存前に確認・修正できます。'
        + (importReviewState.warnings.length ? ' ' + importReviewState.warnings.join(' ') : '')
    );
}

function openSavedBookEditor(article) {
    if (!article || !hasStoredChapters(article)) return;
    flushReadingPositionSave();
    editingId = null;
    pendingImportedDocument = null;
    importReviewState = createSavedBookEditorState(article);
    const currentIndex = importReviewState.chapters.findIndex(chapter =>
        String(chapter.id) === String(currentChapterId)
    );
    importReviewActiveIndex = currentIndex >= 0 ? currentIndex : 0;
    resetImportReviewSearch();
    hideAllSections();
    document.getElementById('add-btn').style.display = 'none';
    document.getElementById('fab-toggle').style.display = 'none';
    const review = document.getElementById('import-review-area');
    if (review) review.style.display = 'flex';
    renderImportReview();
    setImportReviewStatus('保存済み書籍を編集しています。既存chapter IDと登録データは保護されます。');
}

function setImportReviewStatus(message, isError = false) {
    const status = document.getElementById('import-review-status');
    if (!status) return;
    status.textContent = message || '';
    status.classList.toggle('is-error', !!isError);
}

function finalizeImportReviewDocument() {
    if (!importReviewState) return null;
    const sourceType = importReviewState.sourceType || 'text';
    const sourceName = importReviewState.sourceName || 'document';
    const chapters = importReviewState.chapters.map((chapter, index) => {
        const title = String(chapter.title || '').trim() || '本文';
        const sourceKey = chapter.sourceKey || sourceName + '|review-' + index;
        const id = SmartReaderImporters.generateStableChapterId({
            sourceType,
            sourceKey,
            index,
            title
        });
        return {
            ...chapter,
            id,
            title,
            content: typeof chapter.content === 'string' ? chapter.content : '',
            order: index
        };
    });
    return {
        title: String(importReviewState.title || '').trim() || '無題',
        sourceType,
        sourceName,
        content: chapters.map(chapter => chapter.content).filter(Boolean).join('\n\n'),
        chapters,
        warnings: importReviewState.warnings.slice()
    };
}

function finalizeSavedBookEditorDocument() {
    if (!importReviewState || !isSavedBookEditor()) return null;
    syncImportReviewEditor();
    const chapters = importReviewState.chapters.map((chapter, index) => ({
        ...chapter,
        id: chapter.id,
        title: String(chapter.title || '').trim() || `Chapter ${index + 1}`,
        content: typeof chapter.content === 'string' ? chapter.content : '',
        order: index
    }));
    return {
        title: String(importReviewState.title || '').trim() || '無題',
        sourceType: importReviewState.sourceType,
        sourceName: importReviewState.sourceName,
        content: chapters.map(chapter => chapter.content).filter(Boolean).join('\n\n'),
        chapters
    };
}

async function saveImportReviewDocument() {
    if (!importReviewState) return;
    syncImportReviewEditor();
    const finalized = finalizeImportReviewDocument();
    if (!finalized) return;
    pendingImportedDocument = finalized;
    const titleInput = document.getElementById('text-title');
    const bodyInput = document.getElementById('text-input');
    if (titleInput) titleInput.value = finalized.title;
    if (bodyInput) bodyInput.value = finalized.content;
    importReviewState = null;
    resetImportReviewSearch();
    await saveNewArticle();
}

async function saveSavedBookEditor() {
    if (!importReviewState || !isSavedBookEditor()) return;
    const finalized = finalizeSavedBookEditorDocument();
    if (!finalized) return;
    const article = libraryItems.find(item => String(item.id) === String(importReviewState.articleId));
    if (!article) {
        setImportReviewStatus('保存対象の記事が見つかりません。', true);
        return;
    }

    applySavedReadingPositionResets(article, importReviewState.readingPositionRedirects);
    article.name = finalized.title;
    article.content = finalized.content;
    article.chapters = finalized.chapters;
    if (finalized.sourceType) article.sourceType = finalized.sourceType;
    if (finalized.sourceName) article.sourceName = finalized.sourceName;

    await saveToDB();
    importReviewState = null;
    resetImportReviewSearch();
    openArticle(article.id);
}

async function saveChapterEditor() {
    if (isSavedBookEditor()) await saveSavedBookEditor();
    else await saveImportReviewDocument();
}

async function saveReviewedImport() {
    await saveChapterEditor();
}

function cancelChapterEditor() {
    const savedArticleId = isSavedBookEditor() ? importReviewState.articleId : null;
    importReviewState = null;
    pendingImportedDocument = null;
    resetImportReviewSearch();
    if (savedArticleId !== null && savedArticleId !== undefined) openArticle(savedArticleId);
    else showInputArea();
}

function cancelImportReview() {
    cancelChapterEditor();
}

function setupImportReviewControls() {
    const input = document.getElementById('import-review-search-input');
    const scope = document.getElementById('import-review-search-scope');
    const caseSensitive = document.getElementById('import-review-search-case-sensitive');
    const previous = document.getElementById('import-review-search-prev');
    const next = document.getElementById('import-review-search-next');

    if (input) {
        input.oninput = () => updateImportReviewSearch(true, false);
        input.onkeydown = handleImportReviewSearchKeydown;
    }
    if (scope) scope.onchange = () => updateImportReviewSearch(true, false);
    if (caseSensitive) caseSensitive.onchange = () => updateImportReviewSearch(true, false);
    if (previous) previous.onclick = () => navigateImportReviewSearch(-1);
    if (next) next.onclick = () => navigateImportReviewSearch(1);
}

function normalizeImportReviewOrders() {
    if (!importReviewState || !Array.isArray(importReviewState.chapters)) return;
    importReviewState.chapters.forEach((chapter, index) => { chapter.order = index; });
}

function getImportReviewChapter(index = importReviewActiveIndex) {
    if (!importReviewState || !Array.isArray(importReviewState.chapters)) return null;
    return importReviewState.chapters[index] || null;
}

function getSavedChapterReferenceCounts(article, chapterIds) {
    const ids = new Set((chapterIds || []).map(id => String(id)));
    const countItems = items => {
        if (!Array.isArray(items)) return { protected: 0, unscoped: 0 };
        let protectedCount = 0;
        let unscoped = 0;
        items.forEach(item => {
            if (!item) return;
            if (item.chapterId === undefined || item.chapterId === null || item.chapterId === '') {
                protectedCount += 1;
                unscoped += 1;
            } else if (ids.has(String(item.chapterId))) {
                protectedCount += 1;
            }
        });
        return { protected: protectedCount, unscoped };
    };
    const words = countItems(article?.words);
    const notes = countItems(article?.notes);
    const bookmarks = countItems(article?.bookmarks);
    const questions = countItems(article?.questions);
    let readingPositions = 0;
    if (article?.readingPosition?.chapterId !== undefined && ids.has(String(article.readingPosition.chapterId))) {
        readingPositions += 1;
    }
    if (article?.readingPositions && typeof article.readingPositions === 'object') {
        readingPositions += Object.keys(article.readingPositions)
            .filter(id => ids.has(String(id))).length;
    }
    return {
        words: words.protected,
        notes: notes.protected,
        bookmarks: bookmarks.protected,
        questions: questions.protected,
        unscoped: words.unscoped + notes.unscoped + bookmarks.unscoped + questions.unscoped,
        readingPositions
    };
}

function ensureSavedChapterStructureEditAllowed(chapterIndexes, operation) {
    if (!isSavedBookEditor()) return true;
    const article = libraryItems.find(item => String(item.id) === String(importReviewState.articleId));
    const chapters = (chapterIndexes || [])
        .map(index => importReviewState.chapters[index])
        .filter(Boolean);
    if (!article || chapters.length === 0) return false;

    const counts = getSavedChapterReferenceCounts(article, chapters.map(chapter => chapter.id));
    const protectedDataCount = counts.words + counts.notes + counts.bookmarks + counts.questions;
    if (protectedDataCount === 0) return true;

    const message = [
        'この章には登録済みデータがあります。',
        '',
        `単語: ${counts.words}`,
        `ノート: ${counts.notes}`,
        `しおり: ${counts.bookmarks}`,
        `読書位置: ${counts.readingPositions}`,
        ...(counts.unscoped > 0 ? [`章情報なしのlegacyデータ: ${counts.unscoped}`] : []),
        '',
        `データとの関連を保護するため、現在はこの章を${operation}できません。`,
        '本文や章タイトルの編集は可能です。'
    ].join('\n');
    setImportReviewStatus(message, true);
    alert(message);
    return false;
}

function queueSavedReadingPositionReset(chapterIds, replacementChapterId = null) {
    if (!isSavedBookEditor()) return false;
    const article = libraryItems.find(item => String(item.id) === String(importReviewState.articleId));
    if (!article) return false;
    const ids = new Set((chapterIds || []).map(id => String(id)));
    const redirects = importReviewState.readingPositionRedirects || {};
    let changed = false;

    if (article.readingPosition?.chapterId !== undefined && ids.has(String(article.readingPosition.chapterId))) {
        changed = true;
    }
    if (article.readingPositions && typeof article.readingPositions === 'object') {
        Object.keys(article.readingPositions).forEach(id => {
            if (ids.has(String(id))) changed = true;
        });
    }
    if (!changed) return false;

    const replacement = replacementChapterId === null || replacementChapterId === undefined
        ? null
        : String(replacementChapterId);
    ids.forEach(id => { redirects[id] = replacement; });
    importReviewState.readingPositionRedirects = redirects;
    return true;
}

function createResetReadingPosition(chapterId) {
    return {
        chapterId: String(chapterId),
        paragraphIndex: 0,
        paragraphOffset: 0,
        scrollRatio: 0,
        updatedAt: Date.now()
    };
}

function applySavedReadingPositionResets(article, redirects = {}) {
    if (!article || !redirects || typeof redirects !== 'object') return;
    const latest = article.readingPosition;
    if (latest?.chapterId !== undefined) {
        const target = redirects[String(latest.chapterId)];
        if (Object.prototype.hasOwnProperty.call(redirects, String(latest.chapterId))) {
            if (target === null || target === undefined) delete article.readingPosition;
            else article.readingPosition = createResetReadingPosition(target);
        }
    }

    if (!article.readingPositions || typeof article.readingPositions !== 'object') return;
    const replacements = new Set();
    Object.keys(article.readingPositions).forEach(id => {
        if (!Object.prototype.hasOwnProperty.call(redirects, String(id))) return;
        const target = redirects[String(id)];
        delete article.readingPositions[id];
        if (target !== null && target !== undefined) replacements.add(String(target));
    });
    replacements.forEach(id => {
        article.readingPositions[id] = createResetReadingPosition(id);
    });
}

function createChapterEditorNewId() {
    if (!isSavedBookEditor()) return 'review-temp-' + (++importReviewTempSequence);
    const articleId = importReviewState.articleId ?? 'book';
    const existing = new Set(importReviewState.chapters.map(chapter => String(chapter.id)));
    let candidate = '';
    do {
        candidate = `chapter-${articleId}-new-${Date.now()}-${++importReviewTempSequence}`;
    } while (existing.has(candidate));
    return candidate;
}

function syncImportReviewEditor() {
    const chapter = getImportReviewChapter();
    if (!chapter) return;
    const titleInput = document.getElementById('import-review-chapter-title');
    const contentInput = document.getElementById('import-review-chapter-content');
    if (titleInput) chapter.title = titleInput.value;
    if (contentInput) chapter.content = contentInput.value;
    normalizeImportReviewOrders();
}

function renderImportReviewChapterList() {
    const list = document.getElementById('import-review-chapter-list');
    if (!list || !importReviewState) return;
    list.textContent = '';

    importReviewState.chapters.forEach((chapter, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'import-review-chapter-option' +
            (index === importReviewActiveIndex ? ' is-current' : '');
        button.setAttribute('aria-current', index === importReviewActiveIndex ? 'true' : 'false');
        button.title = chapter.title || '本文';
        button.textContent = `${index + 1}. ${chapter.title || '本文'}`;
        button.onclick = () => selectImportReviewChapter(index);
        list.appendChild(button);
    });
    updateImportReviewMobileNavigation();
}

function showImportReviewActionFeedback(message) {
    const feedback = document.getElementById('import-review-action-feedback');
    if (!feedback) return;
    clearTimeout(importReviewFeedbackTimer);
    feedback.textContent = message || '';
    feedback.classList.add('is-visible');
    importReviewFeedbackTimer = setTimeout(() => feedback.classList.remove('is-visible'), 2200);
}

function updateImportReviewMobileNavigation() {
    const chaptersPanel = document.querySelector('.import-review-chapters');
    const current = document.getElementById('import-review-mobile-current');
    const toggle = document.getElementById('import-review-chapter-list-toggle');
    if (!chaptersPanel || !importReviewState) return;
    const total = importReviewState.chapters.length;
    const currentLabel = `Chapter ${importReviewActiveIndex + 1} / ${total}`;
    const collapsed = chaptersPanel.classList.contains('is-mobile-collapsed');
    if (current) current.textContent = currentLabel;
    if (toggle) {
        toggle.textContent = `章一覧（${total}章） ${collapsed ? '▼' : '▲'}`;
        toggle.setAttribute('aria-expanded', String(!collapsed));
    }
}

function toggleImportReviewChapterList() {
    const chaptersPanel = document.querySelector('.import-review-chapters');
    if (!chaptersPanel) return;
    chaptersPanel.classList.toggle('is-mobile-collapsed');
    updateImportReviewMobileNavigation();
}

function toggleImportReviewSearch() {
    const searchBar = document.querySelector('.import-review-search-bar');
    const toggle = document.getElementById('import-review-search-toggle');
    const input = document.getElementById('import-review-search-input');
    if (!searchBar) return;
    const isOpen = searchBar.classList.toggle('is-mobile-open');
    if (!isOpen) searchBar.classList.remove('is-mobile-options-open');
    if (toggle) {
        toggle.textContent = isOpen ? '×' : '🔍';
        toggle.setAttribute('aria-label', isOpen ? '本文検索を閉じる' : '本文検索を開く');
        toggle.setAttribute('aria-expanded', String(isOpen));
    }
    if (isOpen && input) setTimeout(() => input.focus(), 0);
}

function toggleImportReviewSearchOptions() {
    const searchBar = document.querySelector('.import-review-search-bar');
    if (searchBar) searchBar.classList.toggle('is-mobile-options-open');
}

function toggleImportReviewChapterActions() {
    const menu = document.getElementById('import-review-chapter-actions-menu');
    const toggle = document.getElementById('import-review-chapter-actions-toggle');
    if (!menu || !toggle) return;
    const isOpen = menu.hidden;
    hideImportReviewFormatActions();
    menu.hidden = !isOpen;
    toggle.setAttribute('aria-expanded', String(isOpen));
}

function hideImportReviewChapterActions() {
    const menu = document.getElementById('import-review-chapter-actions-menu');
    const toggle = document.getElementById('import-review-chapter-actions-toggle');
    if (menu) menu.hidden = true;
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function toggleImportReviewFormatActions() {
    const menu = document.getElementById('import-review-format-actions-menu');
    const toggle = document.getElementById('import-review-format-actions-toggle');
    if (!menu || !toggle) return;
    const isOpen = menu.hidden;
    hideImportReviewChapterActions();
    menu.hidden = !isOpen;
    toggle.setAttribute('aria-expanded', String(isOpen));
}

function hideImportReviewFormatActions() {
    const menu = document.getElementById('import-review-format-actions-menu');
    const toggle = document.getElementById('import-review-format-actions-toggle');
    if (menu) menu.hidden = true;
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

function renderImportReviewEditor() {
    const chapter = getImportReviewChapter();
    if (!chapter) return;
    const label = document.getElementById('import-review-current-label');
    const titleInput = document.getElementById('import-review-chapter-title');
    const contentInput = document.getElementById('import-review-chapter-content');
    if (label) label.textContent = `Chapter ${importReviewActiveIndex + 1} / ${importReviewState.chapters.length}`;
    if (titleInput) {
        titleInput.value = chapter.title || '';
        titleInput.oninput = () => {
            chapter.title = titleInput.value;
            renderImportReviewChapterList();
        };
    }
    if (contentInput) {
        contentInput.value = chapter.content || '';
        contentInput.oninput = () => {
            chapter.content = contentInput.value;
            if (importReviewSearchState.query) updateImportReviewSearch(false, false);
        };
    }
}

function renderImportReview() {
    if (!importReviewState) return;
    normalizeImportReviewOrders();
    const heading = document.getElementById('chapter-editor-heading');
    const saveButton = document.getElementById('chapter-editor-save');
    const titleInput = document.getElementById('import-review-title');
    const source = document.getElementById('import-review-source');
    if (heading) heading.textContent = isSavedBookEditor() ? 'Book Editor' : 'Import Review';
    if (saveButton) saveButton.textContent = isSavedBookEditor() ? '変更を保存' : '保存して読む';
    if (titleInput) {
        titleInput.value = importReviewState.title || '';
        titleInput.oninput = () => { importReviewState.title = titleInput.value; };
    }
    if (source) source.textContent = isSavedBookEditor()
        ? '保存済み書籍'
        : `${importReviewState.sourceType || 'text'} · ${importReviewState.sourceName || 'document'}`;
    renderImportReviewChapterList();
    renderImportReviewEditor();
    updateImportReviewSearch(false, false);
}

function selectImportReviewChapter(index) {
    if (!importReviewState || index < 0 || index >= importReviewState.chapters.length) return;
    syncImportReviewEditor();
    importReviewActiveIndex = index;
    renderImportReviewChapterList();
    renderImportReviewEditor();
    updateImportReviewSearch(true, false);
}

function getImportReviewSearchMatches() {
    if (!importReviewState || !importReviewSearchState.query) return [];
    const query = importReviewSearchState.caseSensitive
        ? importReviewSearchState.query
        : importReviewSearchState.query.toLocaleLowerCase();
    const chapters = importReviewSearchState.scope === 'all'
        ? importReviewState.chapters
        : [getImportReviewChapter()].filter(Boolean);
    const matches = [];

    chapters.forEach(chapter => {
        const chapterIndex = importReviewState.chapters.indexOf(chapter);
        const content = typeof chapter.content === 'string' ? chapter.content : '';
        const haystack = importReviewSearchState.caseSensitive ? content : content.toLocaleLowerCase();
        if (!query || !haystack) return;
        let from = 0;
        while (from <= haystack.length) {
            const start = haystack.indexOf(query, from);
            if (start < 0) break;
            matches.push({ chapterIndex, start, end: start + query.length });
            from = start + Math.max(query.length, 1);
        }
    });
    return matches;
}

function updateImportReviewSearch(resetIndex = true, shouldFocus = false) {
    const count = document.getElementById('import-review-search-count');
    const previous = document.getElementById('import-review-search-prev');
    const next = document.getElementById('import-review-search-next');
    if (!importReviewState) {
        importReviewSearchState.matches = [];
        importReviewSearchState.currentIndex = -1;
        if (count) count.textContent = '0 / 0';
        if (previous) previous.disabled = true;
        if (next) next.disabled = true;
        return;
    }

    const input = document.getElementById('import-review-search-input');
    const scope = document.getElementById('import-review-search-scope');
    const caseSensitive = document.getElementById('import-review-search-case-sensitive');
    if (input) importReviewSearchState.query = input.value.trim();
    if (scope) importReviewSearchState.scope = scope.value === 'all' ? 'all' : 'current';
    if (caseSensitive) importReviewSearchState.caseSensitive = !!caseSensitive.checked;

    const oldIndex = importReviewSearchState.currentIndex;
    importReviewSearchState.matches = getImportReviewSearchMatches();
    if (importReviewSearchState.matches.length === 0) {
        importReviewSearchState.currentIndex = -1;
    } else if (resetIndex) {
        importReviewSearchState.currentIndex = -1;
    } else {
        importReviewSearchState.currentIndex = oldIndex < 0
            ? -1
            : Math.min(oldIndex, importReviewSearchState.matches.length - 1);
    }

    const displayIndex = importReviewSearchState.currentIndex >= 0
        ? importReviewSearchState.currentIndex + 1
        : 0;
    if (count) count.textContent = `${displayIndex} / ${importReviewSearchState.matches.length}`;
    if (previous) previous.disabled = importReviewSearchState.matches.length === 0;
    if (next) next.disabled = importReviewSearchState.matches.length === 0;
    if (shouldFocus && importReviewSearchState.currentIndex >= 0) focusImportReviewSearchMatch();
}

function focusImportReviewSearchMatch() {
    const match = importReviewSearchState.matches[importReviewSearchState.currentIndex];
    if (!match || !importReviewState) return;

    if (match.chapterIndex !== importReviewActiveIndex) {
        syncImportReviewEditor();
        importReviewActiveIndex = match.chapterIndex;
        renderImportReviewChapterList();
        renderImportReviewEditor();
    }

    const textarea = document.getElementById('import-review-chapter-content');
    if (!textarea) return;
    const apply = () => {
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(match.start, match.end);
        scrollTextareaOffsetIntoView(textarea, match.start);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply);
    else setTimeout(apply, 0);
}

function scrollTextareaOffsetIntoView(textarea, offset) {
    if (!textarea || typeof document === 'undefined' || typeof getComputedStyle !== 'function') return;

    const computed = getComputedStyle(textarea);
    const paddingLeft = parseFloat(computed.paddingLeft) || 0;
    const paddingRight = parseFloat(computed.paddingRight) || 0;
    const mirror = document.createElement('div');
    const marker = document.createElement('span');
    const value = String(textarea.value || '');
    const safeOffset = Math.max(0, Math.min(Number(offset) || 0, value.length));

    Object.assign(mirror.style, {
        position: 'fixed',
        left: '-10000px',
        top: '0',
        visibility: 'hidden',
        pointerEvents: 'none',
        overflow: 'hidden',
        whiteSpace: 'pre-wrap',
        overflowWrap: computed.overflowWrap || 'break-word',
        wordBreak: computed.wordBreak,
        tabSize: computed.tabSize,
        boxSizing: 'content-box',
        width: `${Math.max(0, textarea.clientWidth - paddingLeft - paddingRight)}px`,
        padding: computed.padding,
        border: '0',
        fontFamily: computed.fontFamily,
        fontSize: computed.fontSize,
        fontStyle: computed.fontStyle,
        fontWeight: computed.fontWeight,
        lineHeight: computed.lineHeight,
        letterSpacing: computed.letterSpacing,
        textTransform: computed.textTransform,
        textIndent: computed.textIndent
    });

    mirror.appendChild(document.createTextNode(value.slice(0, safeOffset)));
    marker.textContent = '\u200b';
    mirror.appendChild(marker);
    mirror.appendChild(document.createTextNode(value.slice(safeOffset)));
    document.body.appendChild(mirror);

    const maxScroll = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
    const targetScroll = marker.offsetTop - (textarea.clientHeight * 0.35);
    textarea.scrollTop = Math.max(0, Math.min(maxScroll, targetScroll));
    mirror.remove();
}

function navigateImportReviewSearch(direction) {
    if (!importReviewSearchState.matches.length) return;
    const length = importReviewSearchState.matches.length;
    if (importReviewSearchState.currentIndex < 0) {
        importReviewSearchState.currentIndex = direction < 0 ? length - 1 : 0;
    } else {
        importReviewSearchState.currentIndex = (importReviewSearchState.currentIndex + direction + length) % length;
    }
    const count = document.getElementById('import-review-search-count');
    if (count) count.textContent = `${importReviewSearchState.currentIndex + 1} / ${length}`;
    focusImportReviewSearchMatch();
}

function handleImportReviewSearchKeydown(event) {
    if (event?.isComposing || event?.keyCode === 229 || event?.key !== 'Enter') return;
    event.preventDefault();
    navigateImportReviewSearch(event.shiftKey ? -1 : 1);
}

function addImportReviewChapter() {
    if (!importReviewState) return;
    syncImportReviewEditor();
    const index = importReviewActiveIndex + 1;
    importReviewState.chapters.splice(index, 0, {
        id: createChapterEditorNewId(),
        title: '新しい章',
        content: '',
        order: index,
        ...(isSavedBookEditor() ? {} : { sourceKey: 'review-add-' + importReviewTempSequence })
    });
    importReviewActiveIndex = index;
    normalizeImportReviewOrders();
    renderImportReview();
    setImportReviewStatus('新しいchapterを追加しました。');
    const titleInput = document.getElementById('import-review-chapter-title');
    if (titleInput) { titleInput.focus(); titleInput.select(); }
}

function deleteImportReviewChapter() {
    if (!importReviewState) return;
    if (importReviewState.chapters.length <= 1) {
        alert('最後のchapterは削除できません。');
        return;
    }
    if (!ensureSavedChapterStructureEditAllowed([importReviewActiveIndex], '削除')) return;
    if (typeof window.confirm === 'function' && !window.confirm('このchapterを削除しますか？')) return;
    syncImportReviewEditor();
    const deletedChapterId = importReviewState.chapters[importReviewActiveIndex].id;
    const replacementChapterId = importReviewState.chapters[importReviewActiveIndex - 1]?.id
        ?? importReviewState.chapters[importReviewActiveIndex + 1]?.id
        ?? null;
    const readingPositionReset = queueSavedReadingPositionReset([deletedChapterId], replacementChapterId);
    importReviewState.chapters.splice(importReviewActiveIndex, 1);
    importReviewActiveIndex = Math.min(importReviewActiveIndex, importReviewState.chapters.length - 1);
    normalizeImportReviewOrders();
    renderImportReview();
    setImportReviewStatus(readingPositionReset
        ? 'chapterを削除しました。対象chapterの読書位置を安全な位置へリセットします。'
        : 'chapterを削除しました。');
}

function moveImportReviewChapter(direction) {
    if (!importReviewState) return;
    const target = importReviewActiveIndex + direction;
    if (target < 0 || target >= importReviewState.chapters.length) return;
    syncImportReviewEditor();
    const chapters = importReviewState.chapters;
    [chapters[importReviewActiveIndex], chapters[target]] = [chapters[target], chapters[importReviewActiveIndex]];
    importReviewActiveIndex = target;
    normalizeImportReviewOrders();
    renderImportReview();
}

function combineImportReviewContent(left, right) {
    const first = String(left || '').replace(/\s+$/u, '');
    const second = String(right || '').replace(/^\s+/u, '');
    if (!first) return second;
    if (!second) return first;
    return `${first}\n\n${second}`;
}

function mergeImportReviewChapter(direction) {
    if (!importReviewState) return;
    const target = importReviewActiveIndex + direction;
    if (target < 0 || target >= importReviewState.chapters.length) return;
    if (!ensureSavedChapterStructureEditAllowed([importReviewActiveIndex, target], '結合')) return;
    syncImportReviewEditor();
    const chapters = importReviewState.chapters;
    const retainedChapterId = direction < 0 ? chapters[target].id : chapters[importReviewActiveIndex].id;
    const removedChapterId = direction < 0 ? chapters[importReviewActiveIndex].id : chapters[target].id;
    const readingPositionReset = queueSavedReadingPositionReset(
        [retainedChapterId, removedChapterId],
        retainedChapterId
    );
    if (direction < 0) {
        chapters[target].content = combineImportReviewContent(chapters[target].content, chapters[importReviewActiveIndex].content);
        importReviewState.chapters.splice(importReviewActiveIndex, 1);
        importReviewActiveIndex = target;
    } else {
        chapters[importReviewActiveIndex].content = combineImportReviewContent(chapters[importReviewActiveIndex].content, chapters[target].content);
        importReviewState.chapters.splice(target, 1);
    }
    normalizeImportReviewOrders();
    renderImportReview();
    setImportReviewStatus(readingPositionReset
        ? 'chapterを結合しました。対象chapterの読書位置をリセットします。'
        : 'chapterを結合しました。');
}

function splitImportReviewChapter() {
    const chapter = getImportReviewChapter();
    const textarea = document.getElementById('import-review-chapter-content');
    if (!chapter || !textarea) return;
    if (!ensureSavedChapterStructureEditAllowed([importReviewActiveIndex], '分割')) return;
    const originalChapterId = chapter.id;
    syncImportReviewEditor();
    const position = Number.isInteger(textarea.selectionStart) ? textarea.selectionStart : 0;
    if (position <= 0 || position >= chapter.content.length) {
        alert('本文の途中にカーソルを置いてください。');
        return;
    }
    const left = chapter.content.slice(0, position).replace(/\s+$/u, '');
    const right = chapter.content.slice(position).replace(/^\s+/u, '');
    if (!left || !right) {
        alert('空のchapterにならない位置を指定してください。');
        return;
    }
    const newIndex = importReviewActiveIndex + 1;
    const newChapter = {
        id: createChapterEditorNewId(),
        title: `Chapter ${newIndex + 1}`,
        content: right,
        order: newIndex,
        ...(isSavedBookEditor()
            ? {}
            : { sourceKey: (chapter.sourceKey || chapter.id || 'chapter') + '|split-' + importReviewTempSequence })
    };
    chapter.content = left;
    importReviewState.chapters.splice(newIndex, 0, newChapter);
    importReviewActiveIndex = newIndex;
    const readingPositionReset = queueSavedReadingPositionReset([originalChapterId], originalChapterId);
    normalizeImportReviewOrders();
    renderImportReview();
    setImportReviewStatus(readingPositionReset
        ? 'chapterを分割しました。対象chapterの読書位置は先頭へリセットします。'
        : 'chapterを分割しました。タイトルを確認してください。');
    const titleInput = document.getElementById('import-review-chapter-title');
    if (titleInput) { titleInput.focus(); titleInput.select(); }
}

function joinImportReviewWrappedLines() {
    const chapter = getImportReviewChapter();
    if (!chapter) return;
    syncImportReviewEditor();
    const originalContent = String(chapter.content || '');
    const paragraphs = String(chapter.content || '')
        .replace(/\r\n?/gu, '\n')
        .split(/\n\s*\n/gu)
        .map(paragraph => paragraph.split('\n').map(line => line.trim()).filter(Boolean).join(' '))
        .filter(Boolean);
    chapter.content = paragraphs.join('\n\n');
    renderImportReview();
    const changed = chapter.content !== originalContent;
    const message = changed ? '折り返し改行を結合しました。' : '結合できる折り返し改行はありません。';
    setImportReviewStatus(message);
    showImportReviewActionFeedback(message);
}

function normalizeImportReviewParagraphSpacing() {
    const chapter = getImportReviewChapter();
    if (!chapter) return;
    syncImportReviewEditor();
    const originalContent = String(chapter.content || '');
    chapter.content = originalContent
        .replace(/\r\n?/gu, '\n')
        .split('\n')
        .map(line => line.replace(/[ \t]+/gu, ' ').replace(/\s+$/u, ''))
        .join('\n')
        .replace(/\n{3,}/gu, '\n\n')
        .trim();
    renderImportReview();
    const message = chapter.content !== originalContent ? '段落間隔を整理しました。' : '段落間隔はすでに整っています。';
    setImportReviewStatus(message);
    showImportReviewActionFeedback(message);
}

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const titleInput = document.getElementById('text-title');
    const bodyInput = document.getElementById('text-input');
    const label = document.getElementById('file-label-text');

    if (label) label.innerText = "⏳ 読み込み中...";
    setFileImportStatus('');

    try {
        const documentData = await SmartReaderImporters.parseImportedFile(file);
        pendingImportedDocument = documentData;
        if (!titleInput.value) titleInput.value = documentData.title || file.name.replace(/\.[^/.]+$/, "");
        bodyInput.value = getImportedDocumentText(documentData);
        bodyInput.readOnly = true;
        if (label) label.innerText = "✅ 読み込み完了！";
        openImportReview(documentData);
    } catch (e) {
        console.error(e);
        pendingImportedDocument = null;
        const message = e?.message || 'ファイルの読み込みに失敗しました。';
        alert(message);
        bodyInput.readOnly = false;
        if (label) label.innerText = "📄 EPUB / PDF / HTML / TXT ファイルを読み込む";
        setFileImportStatus(message, true);
    }
}

function readText(file) { 
    return new Promise((r, j) => { 
        const rd = new FileReader(); 
        rd.onload = e => r(e.target.result); 
        rd.onerror = j; 
        rd.readAsText(file); 
    }); 
}

async function readPDF(file) {
    const documentData = await SmartReaderImporters.parsePdfImport(file);
    return getImportedDocumentText(documentData);
}


// --- 本棚・ライブラリ管理 (参考サイトのカードデザイン再現) ---
function showLibrary() {
    flushReadingPositionSave();
    hideAllSections();
    document.getElementById('side-panel')?.classList.remove('is-open');
    document.getElementById('add-btn').style.display = '';
    document.getElementById('fab-toggle').style.display = '';
    editingId = null; // 本棚に戻る際は編集IDをリセット
    pendingImportedDocument = null;
    importReviewState = null;
    resetImportReviewSearch();
    document.getElementById('library-section').style.display = 'block';
    const list = document.getElementById('library-list');
    const bc = document.getElementById('breadcrumbs');
    list.innerHTML = '';

    let path = [], tempId = currentFolderId;
    while(tempId) {
        let f = libraryItems.find(i => i.id === tempId);
        if(f) { path.unshift(f); tempId = f.parentId; } else break;
    }
    let html = `<span onclick="goToFolder(null)">🏠 本棚</span>`;
    path.forEach((f, idx) => {
        if(idx === path.length -1) html += ` > <b>${escapeHtml(f.name)}</b>`;
        else html += ` > <span onclick="goToFolder(${f.id})">${escapeHtml(f.name)}</span>`;
    });
    bc.innerHTML = html;

    libraryItems.filter(i => i.parentId === currentFolderId).forEach(item => {
        const card = document.createElement('div');
        card.className = `item-card ${item.type === 'folder' ? 'folder-icon' : 'article-icon'}`;
        card.onclick = () => item.type === 'folder' ? goToFolder(item.id) : openArticle(item.id);
        card.innerHTML = `
            <h3>${escapeHtml(item.name || "無題")}</h3>
            <div class="card-actions">
                <button class="small-btn move" onclick="event.stopPropagation(); openMoveModal(${item.id})">移動</button>
                <button class="small-btn del" onclick="event.stopPropagation(); deleteLibraryItem(${item.id})">削除</button>
            </div>
        `;
        if (item.type === 'article') {
            const actions = card.querySelector('.card-actions');
            if (actions) {
                const vocabularyButton = document.createElement('button');
                vocabularyButton.type = 'button';
                vocabularyButton.className = 'small-btn';
                vocabularyButton.textContent = 'Vocabulary';
                vocabularyButton.addEventListener('click', event => {
                    event.stopPropagation();
                    showGlobalVocabularyForArticle(item.id);
                });
                actions.appendChild(vocabularyButton);
            }
        }
        list.appendChild(card);
    });
}

function goToFolder(id) { currentFolderId = id; showLibrary(); }

function createManualChapterId(article) {
    const base = `chapter-${article?.id ?? 'article'}-main`;
    const existing = new Set(Array.isArray(article?.chapters) ? article.chapters.map(chapter => String(chapter?.id ?? '')) : []);
    if (!existing.has(base)) return base;
    let index = 2;
    while (existing.has(`${base}-${index}`)) index += 1;
    return `${base}-${index}`;
}

function convertArticleToChapterMode(article, content = article?.content || '') {
    if (!article || article.type !== 'article' || hasStoredChapters(article)) return false;
    const chapterId = createManualChapterId(article);
    const fullText = String(content ?? '');
    article.content = fullText;
    article.chapters = [{ id: chapterId, title: '本文', content: fullText, order: 0 }];
    ensureArticleCollections(article);
    ['words', 'notes', 'bookmarks', 'questions'].forEach(type => {
        if (!Array.isArray(article[type])) return;
        article[type] = article[type].map(item => {
            if (!item || (item.chapterId !== undefined && item.chapterId !== null && item.chapterId !== '')) return item;
            return { ...item, chapterId };
        });
    });
    if (article.readingPosition && (article.readingPosition.chapterId === undefined || article.readingPosition.chapterId === null || article.readingPosition.chapterId === 'legacy-main')) {
        article.readingPosition = { ...article.readingPosition, chapterId };
    }
    if (article.readingPositions && typeof article.readingPositions === 'object' && article.readingPositions['legacy-main']) {
        if (!article.readingPositions[chapterId]) article.readingPositions[chapterId] = { ...article.readingPositions['legacy-main'], chapterId };
        delete article.readingPositions['legacy-main'];
    }
    return chapterId;
}

async function convertCurrentArticleToChapterMode() {
    if (!currentArticle || hasStoredChapters(currentArticle)) return;
    if (typeof window.confirm === 'function' && !window.confirm('この記事を章モードに変換します。本文全体を最初の1章として作成し、既存の単語・ノート・しおり・問題は保持します。')) return;
    const chapterId = convertArticleToChapterMode(currentArticle, currentArticle.content);
    if (!chapterId) return;
    await saveToDB();
    openSavedBookEditor(currentArticle);
}

function showInputArea() {
    flushReadingPositionSave();
    hideAllSections();
    document.getElementById('add-btn').style.display = '';
    document.getElementById('fab-toggle').style.display = '';
    editingId = null;
    pendingImportedDocument = null;
    importReviewState = null;
    resetImportReviewSearch();
    document.getElementById('input-title-label').innerText = "記事を登録";
    document.getElementById('text-title').value = ""; 
    document.getElementById('text-url').value = ""; 
    document.getElementById('text-input').value = "";
    document.getElementById('text-input').readOnly = false;
    document.getElementById('manual-chapter-mode').checked = false;
    document.getElementById('convert-to-chapter-btn').style.display = 'none';
    document.getElementById('input-area').style.display = 'block';
    document.getElementById('file-input').value = ""; 
    setFileImportStatus('');
}

function editCurrentArticle() { 
    if(!currentArticle) return; 
    if (hasStoredChapters(currentArticle)) {
        openSavedBookEditor(currentArticle);
        return;
    }
    flushReadingPositionSave();
    editingId = currentArticle.id; 
    hideAllSections(); 
    document.getElementById('input-title-label').innerText = "記事を編集";
    document.getElementById('text-title').value = currentArticle.name; 
    document.getElementById('text-url').value = currentArticle.url || ""; 
    document.getElementById('text-input').value = typeof currentArticle.content === 'string' && currentArticle.content
        ? currentArticle.content
        : getArticleFullText(currentArticle);
    document.getElementById('text-input').readOnly = false;
    document.getElementById('manual-chapter-mode').checked = false;
    document.getElementById('convert-to-chapter-btn').style.display = 'inline-block';
    document.getElementById('input-area').style.display = 'block'; 
}

async function saveNewArticle() {
    const name = document.getElementById('text-title').value || "無題";
    const content = document.getElementById('text-input').value;
    const url = document.getElementById('text-url').value;
    const imported = pendingImportedDocument;
    const chapterMode = !!document.getElementById('manual-chapter-mode')?.checked && !imported;
    const importedContent = getImportedDocumentText(imported);
    if (!imported && !content) return alert("本文を入力してください");

    if (editingId) {
        const art = libraryItems.find(i => i.id === editingId);
        if (art) {
            if (hasStoredChapters(art)) {
                alert("章構造の記事は本文を平坦化して編集できません。");
                return;
            }
            art.name = name;
            art.content = imported ? importedContent : content;
            art.url = url;
            if (chapterMode && !hasStoredChapters(art)) convertArticleToChapterMode(art, content);
            if (imported) {
                art.chapters = imported.chapters;
                art.sourceType = imported.sourceType;
                art.sourceName = imported.sourceName;
            }
        }
    } else {
        const newArt = { 
            id: Date.now(),
            type: 'article',
            name: imported?.title && name === "無題" ? imported.title : name,
            parentId: currentFolderId,
            content: imported ? importedContent : content,
            url,
            words: [], notes: [], bookmarks: [], questions: []
        };
        if (chapterMode) {
            const chapterId = `chapter-${newArt.id}-main`;
            newArt.chapters = [{ id: chapterId, title: '本文', content, order: 0 }];
        }
        if (imported) {
            newArt.chapters = imported.chapters;
            newArt.sourceType = imported.sourceType;
            newArt.sourceName = imported.sourceName;
        }
        libraryItems.push(newArt);
        editingId = newArt.id;
    }
    pendingImportedDocument = null;
    await saveToDB(); 
    openArticle(editingId);
}

// --- 検索システム (Library全体検索) ---
function readGlobalSearchState() {
    const input = document.getElementById('global-search-input');
    const wholeWord = document.getElementById('global-search-whole-word');
    const caseSensitive = document.getElementById('global-search-case-sensitive');
    globalSearchState = {
        query: String(input?.value || '').trim(),
        wholeWord: !!wholeWord?.checked,
        caseSensitive: !!caseSensitive?.checked
    };
    return { ...globalSearchState };
}

function getGlobalSearchMatches(value, options) {
    return findSearchMatches(
        String(value ?? ''),
        String(options?.query || ''),
        !!options?.wholeWord,
        !!options?.caseSensitive
    );
}

function highlightSearchHtml(value, options, className = 'search-highlight') {
    const text = String(value ?? '');
    const matches = getGlobalSearchMatches(text, options);
    if (!matches.length) return escapeHtml(text);

    let html = '';
    let cursor = 0;
    matches.forEach(match => {
        html += escapeHtml(text.slice(cursor, match.index));
        html += `<span class="${className}">${escapeHtml(text.slice(match.index, match.index + match.length))}</span>`;
        cursor = match.index + match.length;
    });
    return html + escapeHtml(text.slice(cursor));
}

function getGlobalSearchMatchInfo(item, options) {
    if (!item) return null;
    const titleMatches = getGlobalSearchMatches(item.name, options);
    if (item.type === 'folder') return { titleMatches };

    const searchableContent = getArticleSearchableText(item);
    const contentMatches = getGlobalSearchMatches(searchableContent, options);
    const wordMatches = (Array.isArray(item.words) ? item.words : []).filter(word => [
        word?.word,
        word?.meaning,
        word?.memo
    ].some(value => getGlobalSearchMatches(value, options).length > 0));
    const noteMatches = (Array.isArray(item.notes) ? item.notes : []).filter(note => [
        note?.originalText,
        note?.translation,
        note?.extra
    ].some(value => getGlobalSearchMatches(value, options).length > 0));
    return { titleMatches, contentMatches, wordMatches, noteMatches, searchableContent };
}

function clearGlobalSearch() {
    const input = document.getElementById('global-search-input');
    if (!input) return;
    input.value = '';
    performGlobalSearch();
    input.focus();
}

function performGlobalSearch() {
    const options = readGlobalSearchState();
    const list = document.getElementById('library-list');
    if (!list) return;
    list.innerHTML = '';

    if (!options.query) {
        showLibrary();
        return;
    }

    const results = libraryItems.filter(item => {
        const info = getGlobalSearchMatchInfo(item, options);
        return !!info && (
            info.titleMatches.length > 0 ||
            info.contentMatches?.length > 0 ||
            info.wordMatches?.length > 0 ||
            info.noteMatches?.length > 0
        );
    });

    results.forEach(item => {
        const info = getGlobalSearchMatchInfo(item, options);
        const card = document.createElement('div');
        card.className = `item-card ${item.type === 'folder' ? 'folder-icon' : 'article-icon'}`;
        card.onclick = () => item.type === 'folder'
            ? goToFolder(item.id)
            : openArticleFromGlobalSearch(item.id, options);

        const title = document.createElement('h3');
        title.textContent = item.name || '無題';
        card.appendChild(title);

        if (item.type === 'article') {
            const snippets = document.createElement('div');
            snippets.className = 'search-snippets';

            const addMatchRow = (tag, tagClass, text, handler) => {
                const row = document.createElement('div');
                row.className = 'match-row';
                row.addEventListener('click', event => {
                    event.stopPropagation();
                    handler();
                });
                const tagElement = document.createElement('span');
                tagElement.className = `match-tag ${tagClass}`;
                tagElement.textContent = tag;
                const textElement = document.createElement('div');
                textElement.className = 'match-text';
                textElement.innerHTML = highlightSearchHtml(text, options);
                row.append(tagElement, textElement);
                snippets.appendChild(row);
            };

            if (info.titleMatches.length > 0) {
                addMatchRow('タイトル', 'title-tag', item.name, () => openArticleFromGlobalSearch(item.id, options));
            }

            if (info.contentMatches.length > 0) {
                const firstMatch = info.contentMatches[0];
                const start = Math.max(0, firstMatch.index - 15);
                const rawText = info.searchableContent.slice(start, firstMatch.index + firstMatch.length + 20);
                addMatchRow('本文', 'content-tag', `${start > 0 ? '…' : ''}${rawText}…`, () => openArticleAndSearch(item.id, options.query, options));
            }

            info.wordMatches.forEach(word => {
                addMatchRow('単語', 'word-tag', `${word?.word || ''}: ${word?.meaning || ''}`, () => openArticleAndJump(item.id, word?.id, 'word'));
            });

            info.noteMatches.forEach(note => {
                addMatchRow('ノート', 'note-tag', note?.originalText || note?.translation || '', () => openArticleAndJump(item.id, note?.id, 'note'));
            });
            card.appendChild(snippets);
        }

        const actions = document.createElement('div');
        actions.className = 'card-actions';
        const moveButton = document.createElement('button');
        moveButton.className = 'small-btn move';
        moveButton.textContent = '移動';
        moveButton.addEventListener('click', event => {
            event.stopPropagation();
            openMoveModal(item.id);
        });
        const deleteButton = document.createElement('button');
        deleteButton.className = 'small-btn del';
        deleteButton.textContent = '削除';
        deleteButton.addEventListener('click', event => {
            event.stopPropagation();
            deleteLibraryItem(item.id);
        });
        actions.append(moveButton, deleteButton);
        card.appendChild(actions);
        list.appendChild(card);
    });
}

function applyLibrarySearchToReader(options, shouldJump = true) {
    const searchInput = document.getElementById('reader-search-input');
    if (!searchInput) return;

    const query = String(options?.query || '').trim();
    const wholeWord = !!options?.wholeWord;
    const caseSensitive = !!options?.caseSensitive;
    const scope = document.getElementById('reader-search-scope');
    const useBookScope = hasStoredChapters(currentArticle) && getCurrentChapters().length > 1;
    readerSearchState.scope = useBookScope ? 'book' : 'chapter';
    if (scope) scope.value = readerSearchState.scope;
    searchInput.value = query;
    const wholeWordInput = document.getElementById('search-whole-word');
    const caseSensitiveInput = document.getElementById('search-case-sensitive');
    if (wholeWordInput) wholeWordInput.checked = wholeWord;
    if (caseSensitiveInput) caseSensitiveInput.checked = caseSensitive;

    searchInText();
    const total = isBookWideSearchActive() ? readerSearchState.results.length : readerSearchState.matches.length;
    if (shouldJump && total > 0) setActiveSearchResult(0, true);
}

function openArticleFromGlobalSearch(articleId, options = globalSearchState) {
    openArticle(articleId);
    setTimeout(() => applyLibrarySearchToReader(options, true), 100);
}

function openArticleAndSearch(articleId, query, options = {}) {
    openArticle(articleId);
    setTimeout(() => applyLibrarySearchToReader({
        query,
        wholeWord: !!options.wholeWord,
        caseSensitive: !!options.caseSensitive
    }, true), 100);
}

// 検索結果から単語・ノートへ直接ジャンプする関数
function openArticleAndJump(articleId, itemId, type) {
    openArticle(articleId);
    setTimeout(() => {
        jumpToResult(itemId, type);
    }, 100);
}


// --- リーダー機能 ---
// --- 章データ互換レイヤー ---
// 既存記事はarticle.contentを仮想的な1章として扱い、LocalForageの保存形式は変更しない。
function getArticleChapters(article) {
    if (!article) return [];

    if (Array.isArray(article.chapters) && article.chapters.length > 0) {
        const chapters = article.chapters
            .filter(chapter => chapter && typeof chapter === 'object')
            .map((chapter, index) => ({
                id: chapter.id !== undefined && chapter.id !== null && String(chapter.id).trim()
                    ? String(chapter.id)
                    : `chapter-${index + 1}`,
                title: typeof chapter.title === 'string' && chapter.title.trim()
                    ? chapter.title
                    : `Chapter ${index + 1}`,
                content: typeof chapter.content === 'string' ? chapter.content : '',
                order: Number.isFinite(Number(chapter.order)) ? Number(chapter.order) : index
            }));
        if (chapters.length > 0) return chapters.sort((a, b) => a.order - b.order);
    }

    return [{
        id: 'legacy-main',
        title: '本文',
        content: typeof article.content === 'string' ? article.content : '',
        order: 0,
        isVirtual: true
    }];
}

function hasStoredChapters(article = currentArticle) {
    return !!(article && Array.isArray(article.chapters) && article.chapters.length > 0 && getArticleChapters(article).length > 0);
}

function getCurrentChapters() { return getArticleChapters(currentArticle); }

function getCurrentChapter() {
    const chapters = getCurrentChapters();
    return chapters.find(chapter => String(chapter.id) === String(currentChapterId)) || chapters[0] || null;
}

function getCurrentChapterContent() {
    const chapter = getCurrentChapter();
    return chapter ? chapter.content : '';
}

function getCurrentChapterId() {
    const chapter = getCurrentChapter();
    return chapter ? String(chapter.id) : 'legacy-main';
}

function getInitialChapterId(article) {
    const chapters = getArticleChapters(article);
    const savedId = article?.readingPosition?.chapterId;
    const savedChapter = chapters.find(chapter => savedId !== undefined && String(chapter.id) === String(savedId));
    return savedChapter ? savedChapter.id : (chapters[0] ? chapters[0].id : null);
}

function getSavedPositionForChapter(article, chapterId) {
    if (!article) return null;
    const key = String(chapterId);
    const positions = article.readingPositions;
    if (positions && typeof positions === 'object' && positions[key]) return positions[key];

    const latest = article.readingPosition;
    if (!latest) return null;
    if (latest.chapterId === undefined || latest.chapterId === null) {
        return key === 'legacy-main' ? latest : null;
    }
    return String(latest.chapterId) === key ? latest : null;
}

function closeChapterDropdown() {
    const dropdown = document.getElementById('chapter-dropdown');
    const titleButton = document.getElementById('chapter-title-btn');
    if (dropdown) dropdown.classList.remove('is-open');
    if (titleButton) titleButton.setAttribute('aria-expanded', 'false');
}

function toggleChapterDropdown(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('chapter-dropdown');
    const titleButton = document.getElementById('chapter-title-btn');
    if (!dropdown || !titleButton || getCurrentChapters().length <= 1) return;
    const isOpen = dropdown.classList.toggle('is-open');
    titleButton.setAttribute('aria-expanded', String(isOpen));
}

function renderChapterNavigation() {
    const navigation = document.getElementById('chapter-navigation');
    const title = document.getElementById('chapter-title');
    const previous = document.getElementById('chapter-prev-btn');
    const next = document.getElementById('chapter-next-btn');
    const dropdown = document.getElementById('chapter-dropdown');
    if (!navigation || !title || !previous || !next || !dropdown) return;

    const chapters = getCurrentChapters();
    const currentIndex = chapters.findIndex(chapter => String(chapter.id) === String(getCurrentChapterId()));
    const currentChapter = chapters[currentIndex >= 0 ? currentIndex : 0];
    const showNavigation = chapters.length > 1;
    navigation.style.display = showNavigation ? 'flex' : 'none';
    closeChapterDropdown();
    if (!currentChapter) return;

    title.textContent = currentChapter.title;
    previous.disabled = !showNavigation || currentIndex <= 0;
    next.disabled = !showNavigation || currentIndex >= chapters.length - 1;
    dropdown.innerHTML = '';

    if (!showNavigation) return;
    chapters.forEach(chapter => {
        const option = document.createElement('button');
        const isCurrent = String(chapter.id) === String(currentChapter.id);
        option.type = 'button';
        option.className = `chapter-option${isCurrent ? ' is-current' : ''}`;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(isCurrent));
        const label = document.createElement('span');
        label.textContent = chapter.title;
        option.appendChild(label);
        if (isCurrent) {
            const check = document.createElement('span');
            check.className = 'chapter-option-check';
            check.textContent = '✓';
            check.setAttribute('aria-hidden', 'true');
            option.appendChild(check);
        }
        option.onclick = () => {
            closeChapterDropdown();
            void switchToChapter(chapter.id);
        };
        dropdown.appendChild(option);
    });
}

async function switchToChapter(chapterId, options = {}) {
    if (!currentArticle) return;
    const target = getCurrentChapters().find(chapter => String(chapter.id) === String(chapterId));
    if (!target) return;
    const targetId = String(target.id);
    if (targetId === String(getCurrentChapterId())) {
        closeChapterDropdown();
        return;
    }

    // 章移動前に、移動元の章と書籍全体の最新位置を保存する。
    rememberReadingPosition();
    await saveToDB();

    currentChapterId = target.id;
    renderChapterNavigation();
    renderArticleText();
    reapplyReaderSearchForCurrentContent();
    renderList(currentTab, document.getElementById('list-search')?.value || '');
    renderBookmarks();

    const savedPosition = getSavedPositionForChapter(currentArticle, targetId);
    const targetPosition = savedPosition
        ? { ...savedPosition, chapterId: targetId, updatedAt: Date.now() }
        : { chapterId: targetId, paragraphIndex: 0, paragraphOffset: 0, scrollRatio: 0, updatedAt: Date.now() };
    currentArticle.readingPosition = targetPosition;
    if (hasStoredChapters(currentArticle)) {
        if (!currentArticle.readingPositions || typeof currentArticle.readingPositions !== 'object') currentArticle.readingPositions = {};
        currentArticle.readingPositions[targetId] = targetPosition;
    }
    await saveToDB();
    if (!options.skipPositionRestore) restoreReadingPosition(savedPosition);
}

function goToPreviousChapter() {
    const chapters = getCurrentChapters();
    const index = chapters.findIndex(chapter => String(chapter.id) === String(getCurrentChapterId()));
    if (index > 0) void switchToChapter(chapters[index - 1].id);
}

function goToNextChapter() {
    const chapters = getCurrentChapters();
    const index = chapters.findIndex(chapter => String(chapter.id) === String(getCurrentChapterId()));
    if (index >= 0 && index < chapters.length - 1) void switchToChapter(chapters[index + 1].id);
}

function openArticle(id) {
    const nextArticle = libraryItems.find(i => i.id === id);
    if (!nextArticle) return;

    // 記事を切り替える前に、現在の記事の自動読書位置を確定する。
    if (currentArticle && currentArticle.id !== nextArticle.id) flushReadingPositionSave();

    currentArticle = nextArticle;
    ensureArticleCollections(currentArticle);
    if (!currentArticle) return;
    currentChapterId = getInitialChapterId(currentArticle);
    hideAllSections();
    document.getElementById('add-btn').style.display = '';
    document.getElementById('fab-toggle').style.display = '';
    document.getElementById('reader-wrapper').style.display = 'flex';
    document.getElementById('back-to-library').style.display = 'inline-block';
    document.getElementById('article-meta').style.display = 'flex';
    document.getElementById('display-url').href = currentArticle.url || '#';
    document.getElementById('display-url').style.display = currentArticle.url ? 'inline' : 'none';

    renderChapterNavigation();
    renderArticleText();
    reapplyReaderSearchForCurrentContent();
    renderList('words');
    renderBookmarks();
    restoreReadingPosition(getSavedPositionForChapter(currentArticle, currentChapterId));
}

function isQuestionInChapter(question, chapterId) {
    if (!question) return false;
    if (question.chapterId !== undefined && question.chapterId !== null && question.chapterId !== '' && String(question.chapterId) !== String(chapterId)) return false;
    if (hasStoredChapters(currentArticle) && (question.chapterId === undefined || question.chapterId === null || question.chapterId === '') && String(chapterId) !== String(getArticleChapters(currentArticle)[0]?.id)) return false;
    return true;
}

function getQuestionMarkerEntries(paragraphs, chapterId) {
    const questions = Array.isArray(currentArticle?.questions) ? currentArticle.questions : [];
    const byParagraph = new Map();
    questions.forEach((question, questionIndex) => {
        if (!question) return;
        if (!isQuestionInChapter(question, chapterId)) return;
        const selected = String(question.selectedText || question.anchor?.selectedText || '');
        if (!selected) return;
        const anchor = question.anchor || {};
        const paragraphIndex = Number.isInteger(anchor.paragraphIndex) ? anchor.paragraphIndex : -1;
        const paragraph = paragraphIndex >= 0 ? paragraphs[paragraphIndex] : null;
        let start = paragraph ? Number(anchor.textOffset) : -1;
        if (!paragraph || start < 0 || paragraph.slice(start, start + selected.length) !== selected) {
            const normalizedSelected = selected.toLocaleLowerCase();
            const fallbackIndex = paragraphs.findIndex(value => value.toLocaleLowerCase().includes(normalizedSelected));
            if (fallbackIndex < 0) return;
            start = paragraphs[fallbackIndex].toLocaleLowerCase().indexOf(normalizedSelected);
            const matchedSelected = paragraphs[fallbackIndex].slice(start, start + selected.length);
            byParagraph.set(fallbackIndex, [...(byParagraph.get(fallbackIndex) || []), { question, questionIndex, start, selected: matchedSelected }]);
            return;
        }
        byParagraph.set(paragraphIndex, [...(byParagraph.get(paragraphIndex) || []), { question, questionIndex, start, selected }]);
    });
    return byParagraph;
}

function renderQuestionMarkerText(selected, question, chapterId, questionIndex = null) {
    const text = String(selected || '');
    const words = (Array.isArray(currentArticle?.words) ? currentArticle.words : [])
        .map((word, wordIndex) => ({ word, wordIndex }))
        .filter(({ word }) => {
            if (!word || typeof word.word !== 'string' || word.word.length < 2) return false;
            return word.chapterId === undefined || word.chapterId === null || String(word.chapterId) === String(chapterId);
        })
        .filter(({ word }) => getVocabularyWordSurfaceText(word).length >= 2)
        .sort((left, right) => getVocabularyWordSurfaceText(right.word).length - getVocabularyWordSurfaceText(left.word).length);
    const matches = [];
    words.forEach(({ word, wordIndex }) => {
        findSearchMatches(text, getVocabularyWordSurfaceText(word), false, false).forEach(match => {
            if (!matches.some(existing => match.index < existing.index + existing.length && existing.index < match.index + match.length)) {
                matches.push({ ...match, word, wordIndex });
            }
        });
    });
    matches.sort((left, right) => left.index - right.index);
    let cursor = 0;
    let content = '';
    matches.forEach(match => {
        if (match.index > cursor) content += escapeHtml(text.slice(cursor, match.index));
        const wordId = hasGlobalWordId(match.word.id) ? ` data-jump-id="${escapeHtml(String(match.word.id))}"` : '';
        content += `<span class="word-highlight"${wordId} data-word-index="${match.wordIndex}" data-type="word">${escapeHtml(text.slice(match.index, match.index + match.length))}</span>`;
        cursor = match.index + match.length;
    });
    if (cursor < text.length) content += escapeHtml(text.slice(cursor));
    const questionId = hasGlobalProblemId(question.id) ? escapeHtml(String(question.id)) : '';
    const sourceIndex = Number.isInteger(questionIndex) ? ` data-question-index="${questionIndex}"` : '';
    return `<span class="question-marker problem-highlight" data-question-id="${questionId}"${sourceIndex} data-type="question"><button type="button" class="problem-marker-badge" aria-label="問題を開く" data-question-id="${questionId}"${sourceIndex} data-type="question">Q</button><span class="problem-marker-text">${content}</span></span>`;
}

function renderArticleText() {
    if(!currentArticle) return;
    ensureArticleCollections(currentArticle);
    const display = document.getElementById('text-display');
    const content = getCurrentChapterContent();
    const currentChapterIdForHighlight = getCurrentChapterId();
    const paragraphs = getReaderParagraphs(content);
    const questionMarkers = getQuestionMarkerEntries(paragraphs, currentChapterIdForHighlight);
    const questionTokens = [];
    let html = paragraphs.map((paragraph, index) => {
        let source = paragraph;
        const entries = (questionMarkers.get(index) || []).sort((left, right) => right.start - left.start);
        entries.forEach(entry => {
            const token = `\uE000${questionTokens.length}\uE001`;
            questionTokens.push({ token, question: entry.question, selected: entry.selected, questionIndex: entry.questionIndex });
            source = source.slice(0, entry.start) + token + source.slice(entry.start + entry.selected.length);
        });
        return `<p data-paragraph-index="${index}">${escapeHtml(source)}</p>`;
    }).join('');
    
    // ハイライト置換 (ノート > 単語 の順で処理)
    const sn = [...currentArticle.notes].sort((a,b) => String(b.originalText || '').length - String(a.originalText || '').length);
    sn.forEach(n => {
        if (n.chapterId !== undefined && n.chapterId !== null && String(n.chapterId) !== currentChapterIdForHighlight) return;
        if (typeof n.originalText !== 'string' || n.originalText.length < 2) return;
        const escaped = escapeRegExp(escapeHtml(n.originalText));
        html = html.replace(new RegExp(`(${escaped})`, 'gi'), `<span class="note-highlight" data-jump-id="${n.id}" data-type="note">$1</span>`);
    });

    const sw = currentArticle.words
        .map((word, wordIndex) => ({ word, wordIndex }))
        .sort((a, b) => getVocabularyWordSurfaceText(b.word).length - getVocabularyWordSurfaceText(a.word).length);
    sw.forEach(({ word: w, wordIndex }) => {
        if (w.chapterId !== undefined && w.chapterId !== null && String(w.chapterId) !== currentChapterIdForHighlight) return;
        const surfaceText = getVocabularyWordSurfaceText(w);
        if (surfaceText.length < 2) return;
        const escaped = escapeRegExp(escapeHtml(surfaceText));
        const wordId = hasGlobalWordId(w.id) ? ` data-jump-id="${escapeHtml(String(w.id))}"` : '';
        html = html.replace(new RegExp(`(?<!>)${escaped}(?!<)`, 'gi'), `<span class="word-highlight"${wordId} data-word-index="${wordIndex}" data-type="word">$&</span>`);
    });

    questionTokens.forEach(({ token, question, selected, questionIndex }) => {
        const marker = renderQuestionMarkerText(selected, question, currentChapterIdForHighlight, questionIndex);
        html = html.split(token).join(marker);
    });

    display.innerHTML = html;
    updateProgress(null, true);
}

function hasActiveReaderTextSelection() {
    const selection = window.getSelection?.();
    const display = document.getElementById('text-display');
    if (!selection || selection.isCollapsed || !selection.toString().trim() || !display || !selection.rangeCount) return false;
    const range = selection.getRangeAt(0);
    return display.contains(range.commonAncestorContainer);
}

function handleReaderClick(e) {
    if (hasActiveReaderTextSelection() || Date.now() < readerSelectionSuppressUntil) return;
    const target = e.target;
    const wordTarget = target?.closest?.('.word-highlight');
    if (wordTarget && (wordTarget.dataset?.jumpId || wordTarget.dataset?.wordIndex !== undefined)) {
        e.stopPropagation();
        const wordId = wordTarget.dataset.jumpId ? parseInt(wordTarget.dataset.jumpId, 10) : null;
        const sourceIndex = Number.parseInt(wordTarget.dataset.wordIndex, 10);
        jumpToResult(wordId, 'word', Number.isInteger(sourceIndex) ? sourceIndex : null);
        return;
    }
    const questionTarget = target?.closest?.('.problem-marker-badge, .problem-highlight, .question-marker');
    if (questionTarget && (hasGlobalProblemId(questionTarget.dataset?.questionId) || questionTarget.dataset?.questionIndex !== undefined)) {
        e.stopPropagation();
        const sourceIndex = Number.parseInt(questionTarget.dataset.questionIndex, 10);
        jumpToResult(questionTarget.dataset.questionId, 'question', Number.isInteger(sourceIndex) ? sourceIndex : null);
        return;
    }
    const existingTarget = target?.closest?.('[data-jump-id]');
    if (existingTarget?.dataset?.jumpId) {
        jumpToResult(parseInt(existingTarget.dataset.jumpId), existingTarget.dataset.type);
    }
}

function handleReaderKeydown(event) {
    if (event?.key !== 'Enter' && event?.key !== ' ') return;
    const wordTarget = event.target?.closest ? event.target.closest('.word-highlight') : null;
    if (wordTarget && (wordTarget.dataset?.jumpId || wordTarget.dataset?.wordIndex !== undefined) && !hasActiveReaderTextSelection()) {
        event.preventDefault();
        event.stopPropagation();
        const wordId = wordTarget.dataset.jumpId ? parseInt(wordTarget.dataset.jumpId, 10) : null;
        const sourceIndex = Number.parseInt(wordTarget.dataset.wordIndex, 10);
        jumpToResult(wordId, 'word', Number.isInteger(sourceIndex) ? sourceIndex : null);
        return;
    }
    const target = event.target?.closest ? event.target.closest('.problem-marker-badge, .problem-highlight, .question-marker') : null;
    if (!target || (!hasGlobalProblemId(target.dataset?.questionId) && target.dataset?.questionIndex === undefined) || hasActiveReaderTextSelection()) return;
    event.preventDefault();
    const sourceIndex = Number.parseInt(target.dataset.questionIndex, 10);
    jumpToResult(target.dataset.questionId, 'question', Number.isInteger(sourceIndex) ? sourceIndex : null);
}

function jumpToResult(id, type, sourceIndex = null) {
    const tab = type === 'word' ? 'words' : type === 'note' ? 'notes' : type === 'question' ? 'questions' : null;
    if (!tab) return;
    if (type === 'question') {
        const search = document.getElementById('list-search');
        if (search) search.value = '';
    }
    switchTab(tab);
    document.getElementById('side-panel').classList.add('is-open');
    setTimeout(() => {
        const cardId = !hasGlobalProblemId(id) && Number.isInteger(sourceIndex)
            ? `${type}-card-index-${sourceIndex}`
            : `${type}-card-${id}`;
        const card = document.getElementById(cardId);
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('flash-card');
            setTimeout(() => card.classList.remove('flash-card'), 2000);
        }
    }, 300);
}

// --- しおり機能 (段落インデックス方式) ---
async function addBookmark() {
    if (!currentArticle) return;
    const d = document.getElementById('text-display');
    const position = rememberReadingPosition();
    const targetIdx = position ? position.paragraphIndex : 0;

    const progress = Math.round((d.scrollTop / (d.scrollHeight - d.clientHeight)) * 100) || 0;
    let name = prompt("しおりの名前", `${progress}% 付近`);
    if (name === null) return;
    if (!name.trim()) name = `${progress}% 付近`;

    if (!currentArticle.bookmarks) currentArticle.bookmarks = [];
    const bookmark = { id: Date.now(), pIndex: targetIdx, label: name };
    if (hasStoredChapters(currentArticle)) bookmark.chapterId = getCurrentChapterId();
    currentArticle.bookmarks.push(bookmark);
    await saveToDB();
    renderBookmarks();
    restoreReadingPosition(position);
}

// chapterId付きのしおりは対象章へ切り替えてから位置へ移動する。
// 既存しおりはchapterIdがないため、現在章のしおりとして従来通り扱う。
function renderBookmarks() {
    const container = document.getElementById('bookmark-list');
    if (!container || !currentArticle) return;
    container.innerHTML = '';
    (currentArticle.bookmarks || []).forEach(bk => {
        const item = document.createElement('div');
        item.style = "background: white; border: 1px solid #ddd; padding: 6px 12px; border-radius: 20px; font-size: 0.75em; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);";
        const jump = document.createElement('span');
        jump.textContent = `\u{1F4CD} ${bk.label || ''}`;
        jump.onclick = () => void jumpToBookmark(bk.pIndex, bk.chapterId);
        const remove = document.createElement('span');
        remove.textContent = '\u00D7';
        remove.style = 'color:#ccc; border-left:1px solid #eee; padding-left:4px;';
        remove.onclick = event => {
            event.stopPropagation();
            void deleteBookmark(bk.id);
        };
        item.appendChild(jump);
        item.appendChild(remove);
        container.appendChild(item);
    });
}

async function jumpToBookmark(pIdx, chapterId) {
    if (chapterId !== undefined && chapterId !== null && String(chapterId) !== String(getCurrentChapterId())) {
        await switchToChapter(chapterId);
    }
    const ps = document.getElementById('text-display').querySelectorAll('p');
    if (ps[pIdx]) ps[pIdx].scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function deleteBookmark(id) {
    currentArticle.bookmarks = currentArticle.bookmarks.filter(b => b.id !== id);
    await saveToDB();
    renderBookmarks();
}

// --- 単語・ノートリスト制御 ---
function normalizeQuestionType(value) {
    const type = String(value ?? '').trim();
    return QUESTION_TYPES.includes(type) ? type : 'other';
}

function normalizeQuestionTags(value) {
    const rawTags = Array.isArray(value) ? value : String(value ?? '').split(/[,、]/);
    return [...new Set(rawTags
        .flatMap(tag => String(tag ?? '').split(/[,、]/))
        .map(tag => tag.trim())
        .filter(Boolean))];
}

function normalizeQuestionDifficulty(value) {
    if (value === null || value === undefined || value === '') return null;
    const difficulty = Number(value);
    return Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5 ? difficulty : null;
}

function getQuestionRuntimeMetadata(question) {
    return {
        questionType: normalizeQuestionType(question?.questionType),
        tags: normalizeQuestionTags(question?.tags),
        difficulty: normalizeQuestionDifficulty(question?.difficulty),
        needsReview: question?.needsReview === true,
        attempts: Array.isArray(question?.attempts) ? question.attempts : []
    };
}

function getQuestionFormValues() {
    const getValue = id => document.getElementById(id)?.value ?? '';
    return {
        selectedText: String(getValue('input-question-selected-text')),
        question: getValue('input-question-question'),
        answer: getValue('input-question-answer'),
        explanation: getValue('input-question-explanation'),
        memo: getValue('input-question-memo'),
        questionType: normalizeQuestionType(getValue('input-question-type')),
        tags: normalizeQuestionTags(getValue('input-question-tags')),
        difficulty: normalizeQuestionDifficulty(getValue('input-question-difficulty')),
        needsReview: document.getElementById('input-question-needs-review')?.checked === true
    };
}

function setQuestionFormValues(question) {
    const metadata = getQuestionRuntimeMetadata(question);
    document.getElementById('input-question-selected-text').value = question.selectedText || question.anchor?.selectedText || '';
    document.getElementById('input-question-question').value = question.question || '';
    document.getElementById('input-question-answer').value = question.answer || '';
    document.getElementById('input-question-explanation').value = question.explanation || '';
    document.getElementById('input-question-memo').value = question.memo || '';
    document.getElementById('input-question-type').value = metadata.questionType;
    document.getElementById('input-question-tags').value = metadata.tags.join(', ');
    document.getElementById('input-question-difficulty').value = metadata.difficulty ?? '';
    document.getElementById('input-question-needs-review').checked = metadata.needsReview;
}

function createQuestionAttemptId() {
    return `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatQuestionAttemptDate(value) {
    const timestamp = Number(value);
    if (!Number.isFinite(timestamp)) return '日時不明';
    return new Date(timestamp).toLocaleDateString('ja-JP');
}

function formatQuestionAttemptResult(result) {
    if (result === 'correct') return '○';
    if (result === 'incorrect') return '×';
    if (result === 'partial') return '△';
    if (result === 'ungraded') return '－';
    return String(result || '－');
}

function getQuestionTypeLabel(type) {
    return {
        blank: '空欄補充',
        choice: '選択問題',
        vocabulary: '語彙',
        grammar: '文法',
        translation: '翻訳',
        reading: '内容一致',
        free: '自由記述',
        sorting: '整序',
        'true/false': '正誤',
        other: 'その他'
    }[type] || 'その他';
}

function getQuestionCardStateKey(id) {
    return `${currentArticle?.id ?? 'article'}::${String(id)}`;
}

function getQuestionCardState(id) {
    const key = getQuestionCardStateKey(id);
    if (!questionCardRevealState.has(key)) {
        questionCardRevealState.set(key, { answer: false, explanation: false, memo: false, history: false });
    }
    return questionCardRevealState.get(key);
}

function setQuestionCardField(card, question, field, visible, stateKey = question.id) {
    const state = getQuestionCardState(stateKey);
    state[field] = !!visible;
    const value = card.querySelector(`[data-question-field="${field}"]`);
    const button = card.querySelector(`[data-question-toggle="${field}"]`);
    const label = field === 'answer' ? '回答' : field === 'explanation' ? '解説' : 'メモ';
    if (value) {
        value.hidden = !state[field];
        value.textContent = String(question[field] || '');
    }
    if (button) button.textContent = state[field] ? `${label}を隠す` : `${label}を見る`;
}

function setQuestionCardHistory(card, question, visible, stateKey = question.id) {
    const state = getQuestionCardState(stateKey);
    state.history = !!visible;
    const history = card.querySelector('[data-question-history-list]');
    const button = card.querySelector('[data-question-history]');
    if (history) history.hidden = !state.history;
    if (button) button.textContent = state.history ? '履歴を隠す' : '履歴を見る';
}

async function recordQuestionAttempt(id, sourceIndex, result, event) {
    event?.stopPropagation();
    if (!currentArticle || !QUESTION_RESULTS.includes(result)) return;
    const card = event?.currentTarget?.closest?.('.question-card');
    const answerInput = card?.querySelector('[data-question-answer-input]');
    const itemIndex = resolveArticleCollectionIndex(currentArticle.questions, id, sourceIndex);
    const question = itemIndex >= 0 ? currentArticle.questions[itemIndex] : null;
    if (!question) return;

    const answeredAt = Date.now();
    const attempt = {
        id: createQuestionAttemptId(),
        userAnswer: String(answerInput?.value ?? ''),
        result,
        answeredAt
    };
    question.attempts = [...getQuestionRuntimeMetadata(question).attempts, attempt];
    question.updatedAt = answeredAt;
    await saveToDB();
    renderList('questions', document.getElementById('list-search')?.value || '');
}

async function toggleQuestionNeedsReview(id, sourceIndex, event) {
    event?.stopPropagation();
    if (!currentArticle) return;
    const itemIndex = resolveArticleCollectionIndex(currentArticle.questions, id, sourceIndex);
    const question = itemIndex >= 0 ? currentArticle.questions[itemIndex] : null;
    if (!question) return;
    question.needsReview = !getQuestionRuntimeMetadata(question).needsReview;
    question.updatedAt = Date.now();
    await saveToDB();
    renderList('questions', document.getElementById('list-search')?.value || '');
}

function renderQuestionCard(card, question, sourceIndex, filter) {
    const selectedText = question.selectedText || question.anchor?.selectedText || '';
    const metadata = getQuestionRuntimeMetadata(question);
    const attempts = metadata.attempts;
    const latestAttempt = attempts[attempts.length - 1];
    const cardKey = question.id === undefined ? `index-${sourceIndex}` : question.id;
    const highlight = value => {
        const safe = escapeHtml(value);
        if (!filter) return safe;
        const escapedFilter = escapeRegExp(escapeHtml(filter));
        return safe.replace(new RegExp(`(${escapedFilter})`, 'gi'), '<span class="text-highlight">$1</span>');
    };
    const tagText = metadata.tags.map(tag => `#${tag}`).join(' ');
    const typeText = getQuestionTypeLabel(metadata.questionType);
    const historyMarkup = attempts.length === 0
        ? '<div class="question-card-history-empty">まだ回答履歴はありません</div>'
        : attempts.map(attempt => `<div class="question-card-history-item"><span>${formatQuestionAttemptResult(attempt?.result)} ${formatQuestionAttemptDate(attempt?.answeredAt)}</span><span>${escapeHtml(attempt?.userAnswer || '（未入力）')}</span></div>`).join('');
    card.id = `question-card-${cardKey}`;
    card.className = 'note-block-card question-card';
    card.innerHTML = `
        <div class="question-card-meta"><span>種類: ${escapeHtml(typeText)}</span>${metadata.difficulty === null ? '' : `<span>難易度: ${metadata.difficulty}</span>`}${tagText ? `<span>${escapeHtml(tagText)}</span>` : ''}</div>
        <div class="question-card-selected"><strong>選択したテキスト</strong><div>${highlight(selectedText)}</div></div>
        <div class="question-card-question"><strong>問題</strong><div>${highlight(question.question || '')}</div></div>
        <div class="question-card-reveal"><button type="button" data-question-toggle="answer">回答を見る</button><div class="question-card-hidden" data-question-field="answer" hidden></div></div>
        <div class="question-card-reveal"><button type="button" data-question-toggle="explanation">解説を見る</button><div class="question-card-hidden" data-question-field="explanation" hidden></div></div>
        <div class="question-card-reveal"><button type="button" data-question-toggle="memo">メモを見る</button><div class="question-card-hidden" data-question-field="memo" hidden></div></div>
        <div class="question-card-attempt">
            <label for="question-answer-${cardKey}">自分の回答</label>
            <textarea id="question-answer-${cardKey}" data-question-answer-input rows="2" placeholder="回答を入力"></textarea>
            <div class="question-card-attempt-actions"><button type="button" data-question-attempt="correct">○ 正解</button><button type="button" data-question-attempt="incorrect">× 不正解</button></div>
        </div>
        <div class="question-card-history-summary"><span>履歴 ${attempts.length}回${latestAttempt ? ` / 最新: ${formatQuestionAttemptResult(latestAttempt.result)} ${formatQuestionAttemptDate(latestAttempt.answeredAt)}` : ''}</span><button type="button" data-question-history>履歴を見る</button></div>
        <div class="question-card-history-list" data-question-history-list hidden>${historyMarkup}</div>
        <div class="question-card-actions"><button type="button" data-question-review>${metadata.needsReview ? '★ 要復習' : '☆ 要復習'}</button><button type="button" data-question-edit>編</button><button type="button" class="del" data-question-delete>消</button></div>`;
    ['answer', 'explanation', 'memo'].forEach(field => {
        card.querySelector(`[data-question-toggle="${field}"]`).onclick = event => {
            event.stopPropagation();
            const state = getQuestionCardState(cardKey);
            setQuestionCardField(card, question, field, !state[field], cardKey);
        };
        setQuestionCardField(card, question, field, getQuestionCardState(cardKey)[field], cardKey);
    });
    ['correct', 'incorrect'].forEach(result => {
        card.querySelector(`[data-question-attempt="${result}"]`).onclick = event => {
            void recordQuestionAttempt(question.id, sourceIndex, result, event);
        };
    });
    card.querySelector('[data-question-history]').onclick = event => {
        event.stopPropagation();
        const state = getQuestionCardState(cardKey);
        setQuestionCardHistory(card, question, !state.history, cardKey);
    };
    card.querySelector('[data-question-review]').onclick = event => {
        void toggleQuestionNeedsReview(question.id, sourceIndex, event);
    };
    card.querySelector('[data-question-edit]').onclick = event => {
        event.stopPropagation();
        editItem(question.id, 'question', sourceIndex);
    };
    card.querySelector('[data-question-delete]').onclick = event => {
        event.stopPropagation();
        void deleteListItem(question.id, 'questions', sourceIndex);
    };
}

function renderList(type, filter = '') {
    const container = document.getElementById('panel-content');
    if (!container || !currentArticle) return;
    container.innerHTML = '';

    const searchControls = document.getElementById('list-search-controls');
    const vocabularyControls = document.getElementById('vocabulary-controls');
    if (searchControls) searchControls.hidden = type === 'settings';
    if (vocabularyControls) vocabularyControls.hidden = type !== 'words';
    if (type === 'settings') { renderSettingsUI(container); return; }
    renderArticleVocabularyStatistics(type);

    applyAnkiMaskClass(container, type === 'words' && isAnkiMode, document.getElementById('anki-target-select')?.value);

    const sourceList = type === 'words' ? (currentArticle.words || []) : type === 'notes' ? (currentArticle.notes || []) : (currentArticle.questions || []);
    let list = sourceList.map((item, sourceIndex) => ({ item, sourceIndex }));
    if (type === 'words' && document.getElementById('hide-memorized-check')?.checked) list = list.filter(entry => !entry.item.memorized);

    if (filter) {
        const q = filter.toLowerCase();
        list = list.filter(({ item }) => {
            if (type === 'words') return `${item.word || ''} ${item.meaning || ''} ${item.memo || ''}`.toLowerCase().includes(q);
            if (type === 'notes') return `${item.originalText || ''} ${item.translation || ''} ${item.extra || ''}`.toLowerCase().includes(q);
            return `${item.selectedText || item.anchor?.selectedText || ''} ${item.question || ''} ${item.answer || ''} ${item.explanation || ''} ${item.memo || ''} ${normalizeQuestionTags(item.tags).join(' ')}`.toLowerCase().includes(q);
        });
    }

    list.forEach(({ item, sourceIndex }) => {
        const card = document.createElement('div');
        const itemIdArgument = item.id === undefined ? 'undefined' : escapeHtml(JSON.stringify(item.id));
        const highlight = (t) => {
            const safe = escapeHtml(t);
            if (!filter) return safe;
            const escapedFilter = escapeRegExp(escapeHtml(filter));
            return safe.replace(new RegExp(`(${escapedFilter})`, 'gi'), '<span class="text-highlight">$1</span>');
        };
        if (type === 'words') {
            card.id = item.id === undefined || item.id === null || item.id === ''
                ? `word-card-index-${sourceIndex}`
                : `word-card-${item.id}`;
            card.className = `note-card compact-card ${item.memorized ? 'memorized-item' : ''}`;
            card.onclick = () => isAnkiMode && card.classList.toggle('revealed');
            card.innerHTML = `
                <div class="word-row">
                    <div class="word-left">
                        <input type="checkbox" onchange="toggleMemorized(${itemIdArgument}, event, ${sourceIndex})" onclick="event.stopPropagation()" ${item.memorized ? 'checked' : ''}>
                        <span onclick="event.stopPropagation(); speakWord('${item.word.replace(/'/g, "\\'")}')">🔊</span>
                        <span class="word-text">${highlight(item.word)}</span>
                    </div>
                    <div class="meaning-right">${highlight(item.meaning)}</div>
                </div>
                ${item.memo ? `<div class="memo-row">${highlight(item.memo)}</div>` : ''}
                <div class="action-group"><button onclick="event.stopPropagation(); editItem(${itemIdArgument}, 'word', ${sourceIndex})">編</button><button onclick="event.stopPropagation(); deleteListItem(${itemIdArgument}, 'words', ${sourceIndex})">消</button></div>`;
        } else if (type === 'notes') {
            card.id = `note-card-${item.id}`;
            card.className = 'note-block-card';
            card.innerHTML = `
                <div class="block-english">${highlight(item.originalText)}</div>
                <hr class="note-divider"><div class="block-memo">${highlight(item.translation)}</div>
                ${item.extra ? `<div class="block-extra">💡 ${highlight(item.extra)}</div>` : ''}
                <div class="note-footer"><button onclick="editItem(${itemIdArgument}, 'note', ${sourceIndex})">編</button><button onclick="deleteListItem(${itemIdArgument}, 'notes', ${sourceIndex})">消</button></div>`;
        } else {
            renderQuestionCard(card, item, sourceIndex, filter);
        }
        container.appendChild(card);
    });
}

// --- 単語・ノート保存ロジック (モーダル内) ---
async function handleUnifiedSave(e) {
    e.preventDefault();
    if (globalVocabularyEditRef) {
        await saveGlobalVocabularyWordFromModal();
        return;
    }
    const savingGlobalProblem = currentModalType === 'question' && !!globalProblemEditRef;
    const targetArticle = savingGlobalProblem
        ? libraryItems.find(item => item?.type === 'article' && globalIdsEqual(item.id, globalProblemEditRef.articleId))
        : currentArticle;
    if (!targetArticle) return;
    const readingPosition = currentArticle ? rememberReadingPosition() : null;
    try {
        if (currentModalType === 'question') {
            const activeChapterId = targetArticle === currentArticle ? getActiveChapterIdForItem() : null;
            const now = Date.now();
            const values = getQuestionFormValues();
            ensureArticleCollections(targetArticle);
            const questionId = savingGlobalProblem ? globalProblemEditRef.questionId : editingId;
            const questionSourceIndex = savingGlobalProblem ? globalProblemEditRef.sourceIndex : editingSourceIndex;
            const editIndex = resolveArticleCollectionIndex(targetArticle.questions, questionId, questionSourceIndex);
            if (editIndex >= 0) {
                targetArticle.questions = targetArticle.questions.map((item, index) => {
                    if (index !== editIndex) return item;
                    const updated = Object.assign({}, item, values, { updatedAt: now });
                    if ((updated.chapterId === undefined || updated.chapterId === null) && activeChapterId) updated.chapterId = activeChapterId;
                    return updated;
                });
            } else {
                const question = {
                    id: now,
                    ...values,
                    attempts: [],
                    createdAt: now,
                    updatedAt: now
                };
                if (activeChapterId) question.chapterId = activeChapterId;
                if (selectedReaderCapture?.anchor && values.selectedText === selectedReaderCapture.anchor.selectedText) question.anchor = selectedReaderCapture.anchor;
                targetArticle.questions.push(question);
            }
        } else if (currentModalType === 'word') {
            const activeChapterId = getActiveChapterIdForItem();
            const values = getVocabularyFormValues();
            values.updatedAt = Date.now();
            const editIndex = resolveArticleCollectionIndex(currentArticle.words, editingId, editingSourceIndex);
            if (editIndex >= 0) {
                const old = currentArticle.words[editIndex];
                if (old) {
                    currentArticle.words = currentArticle.words.map((i, index) => {
                        if (index !== editIndex) return i;
                        const updated = Object.assign({}, i, values);
                        if ((updated.chapterId === undefined || updated.chapterId === null) && activeChapterId) {
                            updated.chapterId = activeChapterId;
                        }
                        return updated;
                    });
                }
            } else {
                const word = Object.assign({ id: Date.now(), memorized: false, createdAt: Date.now() }, values);
                if (activeChapterId) word.chapterId = activeChapterId;
                if (selectedReaderCapture?.anchor && selectedText === selectedReaderCapture.anchor.selectedText) {
                    word.anchor = selectedReaderCapture.anchor;
                }
                currentArticle.words.push(word);
            }
        } else {
            const activeChapterId = getActiveChapterIdForItem();
            const values = { originalText: document.getElementById('input-note-eng').value, translation: document.getElementById('input-note-trans').value, extra: document.getElementById('input-note-extra').value };
            const editIndex = resolveArticleCollectionIndex(currentArticle.notes, editingId, editingSourceIndex);
            if (editIndex >= 0) {
                const old = currentArticle.notes[editIndex];
                if (old) {
                    const updated = Object.assign({}, old, values);
                    if ((updated.chapterId === undefined || updated.chapterId === null) && activeChapterId) {
                        updated.chapterId = activeChapterId;
                    }
                    currentArticle.notes = currentArticle.notes.map((i, index) => index === editIndex ? updated : i);
                }
            } else {
                const n = { id: Date.now(), ...values };
                if (activeChapterId) n.chapterId = activeChapterId;
                currentArticle.notes.push(n);
            }
        }
        await saveToDB();
        closeModal();
        if (savingGlobalProblem) {
            globalProblemsState.entries = collectGlobalProblems();
            renderGlobalProblems();
            return;
        }
        rerenderReaderAtPosition(readingPosition);
        renderList(currentTab, document.getElementById('list-search').value);
    } catch (err) { console.error(err); }
}

function switchModalType(type) {
    currentModalType = type;
    const isW = (type === 'word');
    const isN = (type === 'note');
    document.getElementById('form-word-section').style.display = isW ? 'block' : 'none';
    document.getElementById('form-note-section').style.display = isN ? 'block' : 'none';
    document.getElementById('form-question-section').style.display = type === 'question' ? 'block' : 'none';
    document.getElementById('input-word-text').required = isW;
    document.getElementById('input-word-meaning').required = isW;
    document.getElementById('input-note-eng').required = isN;
    document.getElementById('input-question-question').required = type === 'question';
    const r = document.querySelector(`input[name="modal-type"][value="${type}"]`);
    if (r) r.checked = true;
}

function resolveArticleCollectionIndex(collection, id, sourceIndex) {
    if (!Array.isArray(collection)) return -1;
    if (id !== undefined && id !== null && id !== '') {
        return collection.findIndex(item => item && String(item.id) === String(id));
    }
    return Number.isInteger(sourceIndex) && collection[sourceIndex] ? sourceIndex : -1;
}

function editItem(id, type, sourceIndex = null) {
    globalVocabularyEditRef = null;
    const collection = type === 'word' ? currentArticle.words : type === 'note' ? currentArticle.notes : currentArticle.questions;
    const itemIndex = resolveArticleCollectionIndex(collection, id, sourceIndex);
    const item = itemIndex >= 0 ? collection[itemIndex] : null;
    if (!item) return;
    editingId = item.id;
    editingSourceIndex = itemIndex;
    switchModalType(type);
    if (type === 'word') {
        const metadata = getVocabularyWordRuntimeMetadata(item);
        document.getElementById('input-word-text').value = item.word || '';
        document.getElementById('input-word-surface-text').value = metadata.surfaceText;
        document.getElementById('input-word-meaning').value = item.meaning || '';
        document.getElementById('input-word-part-of-speech').value = metadata.partOfSpeech;
        document.getElementById('input-word-tags').value = metadata.tags.join(', ');
        document.getElementById('input-word-memo').value = item.memo || '';
        document.getElementById('input-word-context').value = item.context || '';
    } else if (type === 'note') {
        document.getElementById('input-note-eng').value = item.originalText;
        document.getElementById('input-note-trans').value = item.translation;
        document.getElementById('input-note-extra').value = item.extra || '';
    } else {
        setQuestionFormValues(item);
    }
    showUnifiedModal();
}

// --- ＋ボタンを押した時にモーダルを新規状態で開く ---
function openUnifiedModal() {
    if (!currentArticle) {
        alert("記事を開いてから追加してください");
        return;
    }
    globalVocabularyEditRef = null;
    editingId = null; // 編集ではなく新規作成モードにする
    editingSourceIndex = null;
    
    // 入力欄をリセット（選択テキストがあれば自動入力）
    document.getElementById('input-word-text').value = selectedText || "";
    document.getElementById('input-word-surface-text').value = selectedReaderCapture?.anchor?.selectedText || selectedText || "";
    document.getElementById('input-word-meaning').value = "";
    document.getElementById('input-word-part-of-speech').value = "";
    document.getElementById('input-word-tags').value = "";
    document.getElementById('input-word-memo').value = "";
    document.getElementById('input-word-context').value = selectedReaderCapture?.context || '';
    document.getElementById('input-note-eng').value = selectedText || "";
    document.getElementById('input-note-trans').value = "";
    document.getElementById('input-note-extra').value = "";
    document.getElementById('input-question-selected-text').value = selectedText || "";
    document.getElementById('input-question-question').value = "";
    document.getElementById('input-question-answer').value = "";
    document.getElementById('input-question-explanation').value = "";
    document.getElementById('input-question-memo').value = "";
    document.getElementById('input-question-type').value = 'other';
    document.getElementById('input-question-tags').value = '';
    document.getElementById('input-question-difficulty').value = '';
    document.getElementById('input-question-needs-review').checked = false;

    // デフォルトで「単語」タブを選択状態にする
    switchModalType('word');

    // モーダルを表示
    showUnifiedModal();
}


// --- 共通ユーティリティ ---
function ensureArticleCollections(article) {
    if (!article) return;
    if (!Array.isArray(article.words)) article.words = [];
    if (!Array.isArray(article.notes)) article.notes = [];
    if (!Array.isArray(article.bookmarks)) article.bookmarks = [];
    if (!Array.isArray(article.questions)) article.questions = [];
}

function getActiveChapterIdForItem() {
    return hasStoredChapters(currentArticle) ? getCurrentChapterId() : null;
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getReaderParagraphs(content) {
    return String(content ?? '').replace(/\r\n?/g, '\n').split('\n').filter(paragraph => paragraph.trim());
}

function getReaderParagraphElement(node) {
    const element = node?.nodeType === 1 ? node : node?.parentElement;
    return element?.closest ? element.closest('#text-display p[data-paragraph-index]') : null;
}

function getTextOffsetInElement(element, node, offset) {
    if (!element || !node) return 0;
    try {
        const range = document.createRange();
        range.selectNodeContents(element);
        range.setEnd(node, offset);
        return range.toString().length;
    } catch (error) {
        return 0;
    }
}

function extractSentenceContext(text, startOffset = 0, endOffset = startOffset) {
    const value = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!value) return '';
    const start = Math.max(0, Math.min(Number(startOffset) || 0, value.length));
    const end = Math.max(start, Math.min(Number(endOffset) || start, value.length));
    const before = value.slice(0, start);
    const after = value.slice(end);
    const boundaryBefore = Math.max(before.lastIndexOf('. '), before.lastIndexOf('! '), before.lastIndexOf('? '));
    const boundaryAfter = [after.indexOf('.'), after.indexOf('!'), after.indexOf('?')]
        .filter(index => index >= 0)
        .sort((left, right) => left - right)[0];
    const sentenceStart = boundaryBefore >= 0 ? boundaryBefore + 2 : 0;
    const sentenceEnd = boundaryAfter === undefined ? value.length : end + boundaryAfter + 1;
    const sentence = value.slice(sentenceStart, sentenceEnd).trim();
    return sentence || value;
}

function captureReaderSelection(range, selected) {
    const paragraph = getReaderParagraphElement(range.startContainer);
    if (!paragraph) return null;
    const paragraphText = String(paragraph.textContent || '');
    const textOffset = getTextOffsetInElement(paragraph, range.startContainer, range.startOffset);
    const selectedText = String(selected || '').trim();
    const endOffset = textOffset + selectedText.length;
    return {
        context: extractSentenceContext(paragraphText, textOffset, endOffset),
        anchor: {
            chapterId: getCurrentChapterId(),
            paragraphIndex: Number(paragraph.dataset.paragraphIndex) || 0,
            textOffset,
            selectedText,
            prefix: paragraphText.slice(Math.max(0, textOffset - 80), textOffset),
            suffix: paragraphText.slice(endOffset, endOffset + 80)
        }
    };
}

function applyAnkiMaskClass(container, active, target) {
    if (!container) return;
    container.classList.remove('anki-mask-both', 'anki-mask-word', 'anki-mask-meaning');
    if (active) container.classList.add('anki-mask-' + (target || 'both'));
}

function getReaderElementTop(element, container) {
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    return elementRect.top - containerRect.top + container.scrollTop;
}

function storeReadingPosition(position) {
    if (!position || !currentArticle) return;
    currentArticle.readingPosition = position;
    if (hasStoredChapters(currentArticle)) {
        const chapterId = position.chapterId || getCurrentChapterId();
        if (!currentArticle.readingPositions || typeof currentArticle.readingPositions !== 'object') currentArticle.readingPositions = {};
        currentArticle.readingPositions[String(chapterId)] = position;
    }
}

function captureReadingPosition() {
    const display = document.getElementById('text-display');
    if (!display || !currentArticle) return null;

    const maxScroll = Math.max(0, display.scrollHeight - display.clientHeight);
    const paragraphs = Array.from(display.querySelectorAll('p'));
    let paragraphIndex = 0;

    paragraphs.forEach((paragraph, index) => {
        if (getReaderElementTop(paragraph, display) <= display.scrollTop + 1) paragraphIndex = index;
    });

    const paragraphTop = paragraphs[paragraphIndex]
        ? getReaderElementTop(paragraphs[paragraphIndex], display)
        : display.scrollTop;

    const position = {
        paragraphIndex,
        paragraphOffset: display.scrollTop - paragraphTop,
        scrollRatio: maxScroll > 0 ? display.scrollTop / maxScroll : 0,
        updatedAt: Date.now()
    };
    if (hasStoredChapters(currentArticle)) position.chapterId = getCurrentChapterId();
    return position;
}

function rememberReadingPosition() {
    const position = captureReadingPosition();
    storeReadingPosition(position);
    return position;
}

function restoreReadingPosition(position) {
    const display = document.getElementById('text-display');
    if (!display) return;

    const articleId = currentArticle && currentArticle.id;
    const restoreToken = ++readingPositionRestoreToken;
    const apply = () => {
        if (!display || restoreToken !== readingPositionRestoreToken || (currentArticle && currentArticle.id !== articleId)) return;
        if (position?.chapterId !== undefined && String(position.chapterId) !== String(getCurrentChapterId())) return;

        suppressReadingPositionSave = true;
        const maxScroll = Math.max(0, display.scrollHeight - display.clientHeight);
        let targetScroll = 0;

        if (position) {
            const paragraphs = Array.from(display.querySelectorAll('p'));
            const paragraph = Number.isInteger(position.paragraphIndex)
                ? paragraphs[position.paragraphIndex]
                : null;

            if (paragraph) {
                const paragraphTop = getReaderElementTop(paragraph, display);
                if (Number.isFinite(position.paragraphOffset)) {
                    targetScroll = paragraphTop + position.paragraphOffset;
                } else if (Number.isFinite(position.scrollRatio)) {
                    targetScroll = maxScroll * Math.max(0, Math.min(1, position.scrollRatio));
                } else {
                    targetScroll = paragraphTop;
                }
            } else if (Number.isFinite(position.scrollTop)) {
                targetScroll = position.scrollTop;
            } else if (Number.isFinite(position.scrollRatio)) {
                targetScroll = maxScroll * Math.max(0, Math.min(1, position.scrollRatio));
            }
        }

        display.scrollTop = Math.max(0, Math.min(maxScroll, targetScroll));
        updateProgress();
        suppressReadingPositionSave = false;
    };

    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply);
    else setTimeout(apply, 0);
}

function rerenderReaderAtPosition(position) {
    renderArticleText();

    if (readerSearchState.query) {
        if (isBookWideSearchActive()) {
            readerSearchState.results = buildBookSearchResults(
                currentArticle,
                readerSearchState.query,
                readerSearchState.wholeWord,
                readerSearchState.caseSensitive
            );
            readerSearchState.currentIndex = -1;
            applySearchHighlights();
            updateSearchCount();
            restoreReadingPosition(position);
            return;
        }
        applySearchHighlights();
        readerSearchState.currentIndex = -1;
        updateSearchCount();
    } else {
        readerSearchState.matches = [];
        readerSearchState.currentIndex = -1;
        updateSearchCount();
    }

    restoreReadingPosition(position);
}

async function saveCurrentReadingPosition() {
    if (!currentArticle || !document.getElementById('text-display')) return;
    const position = captureReadingPosition();
    if (!position) return;
    storeReadingPosition(position);
    await saveToDB();
}

function scheduleReadingPositionSave() {
    if (!currentArticle || suppressReadingPositionSave) return;
    clearTimeout(readingPositionSaveTimer);
    const articleId = currentArticle.id;
    readingPositionSaveTimer = setTimeout(() => {
        if (currentArticle && currentArticle.id === articleId) void saveCurrentReadingPosition();
    }, 500);
}

function flushReadingPositionSave() {
    clearTimeout(readingPositionSaveTimer);
    readingPositionSaveTimer = null;
    if (currentArticle) void saveCurrentReadingPosition();
}

async function saveToDB() { await db.setItem('library_items', libraryItems); }
function hideAllSections() { ['library-section', 'vocabulary-section', 'problems-section', 'input-area', 'import-review-area', 'reader-wrapper', 'back-to-library', 'article-meta'].forEach(id => { const el = document.getElementById(id); if(el) el.style.display = 'none'; }); }
function lockReaderScrollForModal() {
    const display = document.getElementById('text-display');
    if (!display || !currentArticle || readerScrollLockState) return;
    readerScrollLockState = { element: display, scrollTop: display.scrollTop };
    display.classList.add('is-scroll-locked');
    display.scrollTop = readerScrollLockState.scrollTop;
}

function unlockReaderScrollForModal() {
    const state = readerScrollLockState;
    readerScrollLockState = null;
    if (!state?.element) return;
    state.element.classList.remove('is-scroll-locked');
    state.element.scrollTop = state.scrollTop;
}

function showUnifiedModal() {
    lockReaderScrollForModal();
    document.getElementById('unified-modal-overlay')?.classList.add('show');
}

function closeModal() {
    document.getElementById('unified-modal-overlay').classList.remove('show');
    unlockReaderScrollForModal();
    editingId = null;
    editingSourceIndex = null;
    globalVocabularyEditRef = null;
    globalProblemEditRef = null;
    selectedReaderCapture = null;
}
function togglePanel() {
    const panel = document.getElementById('side-panel');
    if (!panel) return;
    const opening = !panel.classList.contains('is-open');
    panel.classList.toggle('is-open');
    if (opening) panel.classList.remove('is-expanded');
    updateMobilePanelSizeButton();
}

function updateMobilePanelSizeButton() {
    const panel = document.getElementById('side-panel');
    const button = document.getElementById('panel-expand-btn');
    if (!panel || !button) return;
    const expanded = panel.classList.contains('is-expanded');
    button.textContent = expanded ? '⤡' : '⤢';
    button.setAttribute('aria-label', expanded ? '単語帳を縮小' : '単語帳を拡大');
    button.setAttribute('aria-pressed', String(expanded));
}

function toggleMobilePanelSize() {
    const panel = document.getElementById('side-panel');
    if (!panel) return;
    panel.classList.toggle('is-expanded');
    updateMobilePanelSizeButton();
}
function countEnglishWords(text) {
    return getEnglishTokens(text).length;
}

function getEnglishTokens(text) {
    return String(text ?? '').match(/[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+(?:['’][A-Za-z]+)*)*/g) || [];
}

function getArticleFullText(article) {
    if (!article) return '';
    if (hasStoredChapters(article)) return getArticleChapters(article).map(chapter => chapter.content).join('\n\n');
    return typeof article.content === 'string' ? article.content : '';
}

function getArticleSearchableText(article) {
    return getArticleFullText(article);
}

function getReaderWordCounts(article = currentArticle) {
    const chapterText = article === currentArticle ? getCurrentChapterContent() : getArticleChapters(article)[0]?.content || '';
    const bookText = getArticleFullText(article);
    const bookChars = hasStoredChapters(article)
        ? getArticleChapters(article).reduce((sum, chapter) => sum + String(chapter.content || '').length, 0)
        : bookText.length;
    return {
        chapter: countEnglishWords(chapterText),
        book: countEnglishWords(bookText),
        chapterChars: chapterText.length,
        bookChars
    };
}

function clampReaderProgress(value) {
    return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function getChapterScrollProgress(display) {
    const maxScroll = Math.max(0, display.scrollHeight - display.clientHeight);
    return maxScroll > 0 ? clampReaderProgress(display.scrollTop / maxScroll) : 0;
}

function getBookScrollProgress(article, chapterProgress) {
    const chapters = getArticleChapters(article);
    if (!hasStoredChapters(article) || chapters.length <= 1) return chapterProgress;
    const currentIndex = chapters.findIndex(chapter => String(chapter.id) === String(getCurrentChapterId()));
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const lengths = chapters.map(chapter => String(chapter.content || '').length);
    const totalLength = lengths.reduce((sum, length) => sum + length, 0);
    if (totalLength <= 0) return 0;
    const completedLength = lengths.slice(0, safeIndex).reduce((sum, length) => sum + length, 0);
    return clampReaderProgress((completedLength + (lengths[safeIndex] || 0) * chapterProgress) / totalLength);
}

function normalizeVocabularyWord(value) {
    return String(value ?? '').trim().toLocaleLowerCase();
}

function getArticleVocabularyStatistics(article = currentArticle) {
    const words = Array.isArray(article?.words) ? article.words : [];
    return {
        total: words.length,
        unique: new Set(words.map(word => normalizeVocabularyWord(word.word)).filter(Boolean)).size,
        memorized: words.filter(word => !!word.memorized).length
    };
}

function renderArticleVocabularyStatistics(type = currentTab) {
    const target = document.getElementById('article-vocabulary-statistics');
    if (!target) return;
    if (!currentArticle || type !== 'words') {
        target.textContent = '';
        return;
    }
    const stats = getArticleVocabularyStatistics(currentArticle);
    target.textContent = `${stats.total} words · ${stats.unique} unique · ${stats.memorized} memorized`;
}

function updateProgress(event, forceWordCount = false) {
    const d = document.getElementById('text-display');
    if(!d || !currentArticle) return;
    const content = getCurrentChapterContent();
    const chapterId = getCurrentChapterId();
    if (forceWordCount || readerWordCounts.articleId !== currentArticle.id || readerWordCounts.chapterId !== chapterId) {
        const counts = getReaderWordCounts(currentArticle);
        readerWordCounts = { articleId: currentArticle.id, chapterId, ...counts };
        const statusBar = document.getElementById('reading-status-bar');
        if (statusBar) {
            statusBar.dataset.chapterWordCount = String(readerWordCounts.chapter);
            statusBar.dataset.bookWordCount = String(readerWordCounts.book);
            statusBar.dataset.chapterCharCount = String(readerWordCounts.chapterChars);
            statusBar.dataset.bookCharCount = String(readerWordCounts.bookChars);
        }
    }
    const chapterProgress = getChapterScrollProgress(d);
    const bookProgress = getBookScrollProgress(currentArticle, chapterProgress);
    const hasMultipleChapters = hasStoredChapters(currentArticle) && getCurrentChapters().length > 1;
    const wordCount = document.getElementById('word-count');
    if (wordCount) wordCount.innerText = `${readerWordCounts.chapter.toLocaleString()} words`;
    const charCount = document.getElementById('char-count');
    if (charCount) charCount.innerText = `${readerWordCounts.chapterChars.toLocaleString()}文字`;
    const progress = Math.round(chapterProgress * 100);
    const readProgress = document.getElementById('read-progress');
    if (readProgress) readProgress.innerText = `${progress}%`;

    const chapterLabel = document.getElementById('chapter-status-label');
    const bookLine = document.getElementById('book-status-line');
    if (chapterLabel) chapterLabel.style.display = hasMultipleChapters ? '' : 'none';
    if (bookLine) bookLine.style.display = hasMultipleChapters ? '' : 'none';
    const bookWordCount = document.getElementById('book-word-count');
    const bookCharCount = document.getElementById('book-char-count');
    const bookReadProgress = document.getElementById('book-read-progress');
    if (bookWordCount) bookWordCount.innerText = `${readerWordCounts.book.toLocaleString()} words`;
    if (bookCharCount) bookCharCount.innerText = `${readerWordCounts.bookChars.toLocaleString()}文字`;
    if (bookReadProgress) bookReadProgress.innerText = `${Math.round(bookProgress * 100)}%`;
    if (event && event.type === 'scroll') scheduleReadingPositionSave();
}
function handleListSearch() { renderList(currentTab, document.getElementById('list-search').value); }
async function toggleMemorized(id, e, sourceIndex = null) {
    if (e) e.stopPropagation();
    const wordIndex = resolveArticleCollectionIndex(currentArticle.words, id, sourceIndex);
    const w = wordIndex >= 0 ? currentArticle.words[wordIndex] : null;
    if (!w) return;
    const readingPosition = rememberReadingPosition();
    w.memorized = !w.memorized;
    await saveToDB();
    renderList('words', document.getElementById('list-search').value);
    restoreReadingPosition(readingPosition);
}
function speakWord(t) { if ('speechSynthesis' in window) { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'en-US'; speechSynthesis.speak(u); } }
function applySettings() { document.documentElement.style.setProperty('--reader-font-size', readerSettings.fontSize+'px'); document.documentElement.style.setProperty('--reader-line-height', readerSettings.lineHeight); }
function renderSettingsUI(c) { c.innerHTML = `<div class="settings-group"><p>文字: ${readerSettings.fontSize}px</p><input type="range" min="14" max="30" value="${readerSettings.fontSize}" oninput="updateSetting('font', this.value)"><p>行間: ${readerSettings.lineHeight}</p><input type="range" min="1.2" max="2.5" step="0.1" value="${readerSettings.lineHeight}" oninput="updateSetting('line', this.value)"></div>`; }
function updateSetting(t, v) { if (t==='font') readerSettings.fontSize=v; else readerSettings.lineHeight=v; applySettings(); db.setItem('reader_settings', readerSettings); renderList('settings'); }
function createNewFolder() { const n = prompt("フォルダ名"); if(n){ libraryItems.push({id:Date.now(), type:'folder', name:n, parentId:currentFolderId}); saveToDB(); showLibrary(); } }
async function deleteLibraryItem(id) { if(confirm("削除しますか？")){ libraryItems = libraryItems.filter(i=>i.id!==id); await saveToDB(); showLibrary(); } }
async function deleteListItem(id, type, sourceIndex = null) {
    if (!confirm("消去しますか？")) return;
    const readingPosition = rememberReadingPosition();
    const collection = type === 'words' ? currentArticle.words : type === 'notes' ? currentArticle.notes : currentArticle.questions;
    const itemIndex = resolveArticleCollectionIndex(collection, id, sourceIndex);
    if (itemIndex < 0) return;
    if (type === 'questions') {
        const question = collection[itemIndex];
        const stateKey = question?.id === undefined ? `index-${itemIndex}` : question.id;
        questionCardRevealState.delete(getQuestionCardStateKey(stateKey));
    }
    collection.splice(itemIndex, 1);
    await saveToDB();
    renderList(type);
    rerenderReaderAtPosition(readingPosition);
}
function switchTab(t) {
    currentTab = t;
    document.querySelectorAll('.tab-btn').forEach(button => button.classList.toggle('active', button.dataset.tab === t));
    renderList(t, document.getElementById('list-search')?.value || '');
}
function openMoveModal(id) { movingItemId = id; const item = libraryItems.find(i => i.id === id); if(!item) return; document.getElementById('move-target-name').innerText = item.name; const s = document.getElementById('move-select'); s.innerHTML = '<option value="">🏠 Root</option>'; libraryItems.filter(i=>i.type==='folder'&&i.id!==id).forEach(f=>{ const o=document.createElement('option'); o.value=f.id; o.innerText=f.name; s.appendChild(o); }); document.getElementById('move-modal-overlay').classList.add('show'); }
async function submitMove() { if(!movingItemId) return; const val = document.getElementById('move-select').value; const pid = val?parseInt(val):null; const item = libraryItems.find(i=>i.id===movingItemId); if(item){ item.parentId=pid; await saveToDB(); document.getElementById('move-modal-overlay').classList.remove('show'); showLibrary(); } }
function exportToCSV() { if (!currentArticle || currentArticle.words.length === 0) { alert("データなし"); return; } let csv = "Word,Meaning,Memo\n"; currentArticle.words.forEach(i => { const e=t=>t?`"${t.replace(/"/g, '""')}"`:""; csv+=`${e(i.word)},${e(i.meaning)},${e(i.memo)}\n`; }); const b = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv' }); const l = document.createElement("a"); l.href=URL.createObjectURL(b); l.download="words.csv"; l.click(); }

const COMMON_FREQUENCY_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'for', 'with', 'at', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'that', 'this', 'as', 'i', 'you', 'he', 'she', 'we', 'they', 'his', 'her', 'their', 'my', 'your', 'not', 'do', 'does', 'did', 'have', 'has', 'had']);

function getWordFrequency(article, excludeCommon = false) {
    const counts = new Map();
    getEnglishTokens(getArticleFullText(article)).forEach(token => {
        const word = token.toLocaleLowerCase();
        if (excludeCommon && COMMON_FREQUENCY_WORDS.has(word)) return;
        counts.set(word, (counts.get(word) || 0) + 1);
    });
    return Array.from(counts, ([word, count]) => ({ word, count }))
        .sort((left, right) => right.count - left.count || left.word.localeCompare(right.word));
}

function openWordStatistics() {
    if (!currentArticle) return;
    document.getElementById('word-statistics-overlay')?.classList.add('show');
    renderWordStatistics();
}

function closeWordStatistics() {
    document.getElementById('word-statistics-overlay')?.classList.remove('show');
}

function renderWordStatistics() {
    const container = document.getElementById('word-statistics-list');
    const summary = document.getElementById('word-statistics-summary');
    if (!container || !currentArticle) return;
    const excludeCommon = !!document.getElementById('frequency-exclude-common')?.checked;
    const frequency = getWordFrequency(currentArticle, excludeCommon).slice(0, 80);
    const total = countEnglishWords(getArticleFullText(currentArticle));
    if (summary) summary.textContent = `${total.toLocaleString()} words · ${frequency.length} 件を表示`;
    container.innerHTML = '';
    frequency.forEach(entry => {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'word-frequency-row';
        const registered = currentArticle.words.some(word => normalizeVocabularyWord(word.word) === entry.word);
        row.textContent = `${entry.word}  ${entry.count}${registered ? ' · 登録済み' : ''}`;
        row.onclick = () => openFrequencyWord(entry.word);
        container.appendChild(row);
    });
}

function openFrequencyWord(word) {
    const text = getCurrentChapterContent();
    const matchIndex = text.toLocaleLowerCase().indexOf(String(word).toLocaleLowerCase());
    selectedText = word;
    selectedReaderCapture = {
        context: extractSentenceContext(text, Math.max(0, matchIndex), Math.max(0, matchIndex) + word.length),
        anchor: null
    };
    closeWordStatistics();
    openUnifiedModal();
}

function getLibraryBackupCounts(items = libraryItems) {
    const articles = (items || []).filter(item => item?.type === 'article');
    return {
        articles: articles.length,
        folders: (items || []).filter(item => item?.type === 'folder').length,
        chapters: articles.reduce((sum, article) => sum + (Array.isArray(article.chapters) ? article.chapters.length : 0), 0),
        words: articles.reduce((sum, article) => sum + (Array.isArray(article.words) ? article.words.length : 0), 0),
        notes: articles.reduce((sum, article) => sum + (Array.isArray(article.notes) ? article.notes.length : 0), 0),
        bookmarks: articles.reduce((sum, article) => sum + (Array.isArray(article.bookmarks) ? article.bookmarks.length : 0), 0),
        questions: articles.reduce((sum, article) => sum + (Array.isArray(article.questions) ? article.questions.length : 0), 0)
    };
}

function isBackupObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function collectSmartReaderPersistentData() {
    await saveToDB();
    const keys = await db.keys();
    const data = {};
    for (const key of keys) data[key] = await db.getItem(key);

    // 画面上の最新状態も必ず含め、将来追加されるLocalForage keyは上の走査で保持する。
    data.library_items = libraryItems;
    data.reader_settings = readerSettings;
    return data;
}

async function createSmartReaderBackup() {
    return {
        format: 'smart-reader-backup',
        backupVersion: 1,
        exportedAt: new Date().toISOString(),
        data: await collectSmartReaderPersistentData()
    };
}

function normalizeSmartReaderBackup(raw) {
    if (!isBackupObject(raw)) return null;
    if (raw.format === 'smart-reader-backup') return { ...raw, legacy: false };

    // Phase 4初期版で書き出したbackupも復元可能にする。
    if (raw.app === 'Smart Reader' && raw.backupVersion === 1 && Array.isArray(raw.library_items)) {
        return {
            format: 'smart-reader-backup',
            backupVersion: 1,
            exportedAt: raw.exportedAt,
            data: {
                library_items: raw.library_items,
                reader_settings: isBackupObject(raw.reader_settings)
                    ? raw.reader_settings
                    : { ...DEFAULT_READER_SETTINGS }
            },
            legacy: true
        };
    }
    return null;
}

function validateSmartReaderBackup(raw) {
    const backup = normalizeSmartReaderBackup(raw);
    if (!backup || backup.format !== 'smart-reader-backup') {
        return { valid: false, error: 'Smart Readerのバックアップ形式ではありません。' };
    }
    if (backup.backupVersion !== 1) {
        return { valid: false, error: `このバックアップVersion（${String(backup.backupVersion)}）には対応していません。` };
    }
    if (!isBackupObject(backup.data) || !Array.isArray(backup.data.library_items)) {
        return { valid: false, error: 'バックアップ内のdataまたはlibrary_itemsが不正です。' };
    }
    if (backup.data.reader_settings !== undefined && !isBackupObject(backup.data.reader_settings)) {
        return { valid: false, error: 'reader_settingsの形式が不正です。' };
    }
    if (!backup.data.library_items.every(item => isBackupObject(item) && typeof item.type === 'string')) {
        return { valid: false, error: 'ライブラリ項目の形式が不正です。' };
    }
    if (backup.data.reader_settings === undefined) {
        backup.data = { ...backup.data, reader_settings: { ...DEFAULT_READER_SETTINGS } };
    }
    return {
        valid: true,
        backup,
        counts: getLibraryBackupCounts(backup.data.library_items)
    };
}

function createBackupFilename(prefix, exportedAt = new Date().toISOString()) {
    const timestamp = String(exportedAt || new Date().toISOString())
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .replace('Z', '');
    return `${prefix}-${timestamp}.json`;
}

function downloadSmartReaderBackup(backup, prefix = 'smart-reader-backup') {
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = createBackupFilename(prefix, backup.exportedAt);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportSmartReaderBackup() {
    try {
        const backup = await createSmartReaderBackup();
        downloadSmartReaderBackup(backup);
    } catch (error) {
        console.error(error);
        alert('バックアップを書き出せませんでした。');
    }
}

function openSmartReaderRestore() {
    const input = document.getElementById('backup-file-input');
    if (input) {
        input.value = '';
        input.click();
    }
}

async function handleSmartReaderRestore(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    try {
        const parsed = JSON.parse(await file.text());
        const validation = validateSmartReaderBackup(parsed);
        if (!validation.valid) {
            alert(validation.error);
            return;
        }
        pendingSmartReaderRestore = {
            backup: validation.backup,
            counts: validation.counts,
            fileName: file.name
        };
        showSmartReaderRestorePreview();
    } catch (error) {
        console.error(error);
        alert('JSONを読み込めませんでした。ファイルが壊れていないか確認してください。');
    } finally {
        event.target.value = '';
    }
}

function setRestorePreviewText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value ?? '');
}

function showSmartReaderRestorePreview() {
    if (!pendingSmartReaderRestore) return;
    const { backup, counts, fileName } = pendingSmartReaderRestore;
    const exportedDate = new Date(backup.exportedAt);
    setRestorePreviewText('backup-restore-file', fileName || 'backup.json');
    setRestorePreviewText('backup-restore-date', Number.isNaN(exportedDate.getTime())
        ? '作成日時: 不明'
        : `作成日時: ${exportedDate.toLocaleString('ja-JP')}`);
    ['articles', 'folders', 'chapters', 'words', 'notes', 'bookmarks', 'questions'].forEach(key => {
        setRestorePreviewText(`backup-count-${key}`, counts[key] || 0);
    });
    const status = document.getElementById('backup-restore-status');
    if (status) {
        status.textContent = '';
        status.classList.remove('is-error');
    }
    document.getElementById('backup-restore-overlay')?.classList.add('show');
}

function closeSmartReaderRestorePreview(force = false) {
    const confirmButton = document.getElementById('backup-restore-confirm');
    if (!force && confirmButton?.disabled) return;
    document.getElementById('backup-restore-overlay')?.classList.remove('show');
    pendingSmartReaderRestore = null;
}

async function replaceSmartReaderPersistentData(targetData, options = {}) {
    const targetKeys = Object.keys(targetData);
    const existingKeys = await db.keys();
    const removeAbsentKeys = options.removeAbsentKeys === true;
    const writeKeys = targetKeys.filter(key => key !== 'library_items');
    if (targetKeys.includes('library_items')) writeKeys.push('library_items');

    // 記事本体は最後に書き込み、他keyの失敗でlibrary_itemsだけが先行更新されるのを避ける。
    for (const key of writeKeys) await db.setItem(key, targetData[key]);
    if (removeAbsentKeys) {
        for (const key of existingKeys) {
            if (!targetKeys.includes(key)) await db.removeItem(key);
        }
    }

    const finalKeys = await db.keys();
    if (targetKeys.some(key => !finalKeys.includes(key))) {
        throw new Error('LocalForage key verification failed');
    }
    if (removeAbsentKeys && finalKeys.length !== targetKeys.length) {
        throw new Error('LocalForage exact key verification failed');
    }
    for (const key of targetKeys) {
        const restoredValue = await db.getItem(key);
        if (JSON.stringify(restoredValue) !== JSON.stringify(targetData[key])) {
            throw new Error(`LocalForage value verification failed: ${key}`);
        }
    }
}

async function confirmSmartReaderRestore() {
    if (!pendingSmartReaderRestore) return;
    const confirmButton = document.getElementById('backup-restore-confirm');
    const cancelButton = document.getElementById('backup-restore-cancel');
    const status = document.getElementById('backup-restore-status');
    if (confirmButton) confirmButton.disabled = true;
    if (cancelButton) cancelButton.disabled = true;
    if (status) {
        status.textContent = '復元前の安全バックアップを作成しています…';
        status.classList.remove('is-error');
    }

    let safetyBackup = null;
    try {
        safetyBackup = await createSmartReaderBackup();
        downloadSmartReaderBackup(safetyBackup, 'smart-reader-pre-restore');
        if (status) status.textContent = 'データを復元しています…';

        const restoreBackup = pendingSmartReaderRestore.backup;
        await replaceSmartReaderPersistentData(restoreBackup.data);

        libraryItems = restoreBackup.data.library_items;
        readerSettings = { ...DEFAULT_READER_SETTINGS, ...restoreBackup.data.reader_settings };
        currentArticle = null;
        currentChapterId = null;
        currentFolderId = null;
        pendingImportedDocument = null;
        importReviewState = null;
        applySettings();
        closeSmartReaderRestorePreview(true);
        showLibrary();
        alert('バックアップを復元しました。復元前のデータもJSONで保存しました。');
    } catch (error) {
        console.error(error);
        let rolledBack = false;
        if (safetyBackup) {
            try {
                await replaceSmartReaderPersistentData(safetyBackup.data, { removeAbsentKeys: true });
                libraryItems = safetyBackup.data.library_items;
                readerSettings = { ...DEFAULT_READER_SETTINGS, ...safetyBackup.data.reader_settings };
                rolledBack = true;
            } catch (rollbackError) {
                console.error('Smart Reader restore rollback failed', rollbackError);
            }
        }
        if (status) {
            status.textContent = rolledBack
                ? '復元に失敗したため、元のデータへ戻しました。'
                : '復元に失敗しました。安全バックアップJSONを保管してください。';
            status.classList.add('is-error');
        }
        alert(rolledBack
            ? '復元に失敗しました。現在のデータは元の状態へ戻しました。'
            : '復元に失敗し、自動的に元へ戻せませんでした。安全バックアップJSONから復元してください。');
    } finally {
        if (confirmButton) confirmButton.disabled = false;
        if (cancelButton) cancelButton.disabled = false;
    }
}

function resetReaderSearch() {
    readerSearchState = {
        query: '',
        wholeWord: false,
        caseSensitive: false,
        scope: 'chapter',
        articleId: null,
        currentIndex: -1,
        matches: [],
        results: []
    };
    const input = document.getElementById('reader-search-input');
    const wholeWord = document.getElementById('search-whole-word');
    const caseSensitive = document.getElementById('search-case-sensitive');
    if (input) input.value = '';
    if (wholeWord) wholeWord.checked = false;
    if (caseSensitive) caseSensitive.checked = false;
    updateReaderSearchScopeUI();
    updateSearchCount();
}

function updateReaderSearchScopeUI() {
    const scope = document.getElementById('reader-search-scope');
    if (!scope) return;
    const canSearchBook = hasStoredChapters(currentArticle) && getCurrentChapters().length > 1;
    scope.style.display = canSearchBook ? '' : 'none';
    scope.value = readerSearchState.scope || 'chapter';
}

function changeReaderSearchScope(value) {
    readerSearchState.scope = value === 'book' ? 'book' : 'chapter';
    searchInText();
}

function isBookWideSearchActive() {
    return readerSearchState.scope === 'book' && hasStoredChapters(currentArticle);
}

function syncReaderSearchControls() {
    const input = document.getElementById('reader-search-input');
    const wholeWord = document.getElementById('search-whole-word');
    const caseSensitive = document.getElementById('search-case-sensitive');
    if (input) input.value = readerSearchState.query;
    if (wholeWord) wholeWord.checked = readerSearchState.wholeWord;
    if (caseSensitive) caseSensitive.checked = readerSearchState.caseSensitive;
    updateReaderSearchScopeUI();
}

function reapplyReaderSearchForCurrentContent() {
    syncReaderSearchControls();
    readerSearchState.matches = [];
    readerSearchState.currentIndex = -1;
    if (!readerSearchState.query || !currentArticle) {
        readerSearchState.results = [];
        updateSearchCount();
        return;
    }

    readerSearchState.articleId = currentArticle.id;
    if (isBookWideSearchActive()) {
        readerSearchState.results = buildBookSearchResults(
            currentArticle,
            readerSearchState.query,
            readerSearchState.wholeWord,
            readerSearchState.caseSensitive
        );
        applySearchHighlights();
        updateSearchCount();
        return;
    }

    readerSearchState.results = [];
    applySearchHighlights();
    updateSearchCount();
}

function clearReaderSearch({ blur = false } = {}) {
    const position = captureReadingPosition();
    readerSearchState.query = '';
    readerSearchState.currentIndex = -1;
    readerSearchState.matches = [];
    readerSearchState.results = [];
    readerSearchState.articleId = currentArticle?.id || null;
    const input = document.getElementById('reader-search-input');
    if (input) input.value = '';
    renderArticleText();
    updateSearchCount();
    restoreReadingPosition(position);
    if (input) {
        if (blur) input.blur();
        else input.focus();
    }
}

function handleReaderSearchFocus(event) {
    const input = event?.target;
    if (input && input.value) setTimeout(() => input.select(), 0);
}

function handleReaderSearchKeydown(event) {
    if (event?.isComposing || event?.keyCode === 229) return;
    if (event?.key === 'Escape') {
        event.preventDefault();
        clearReaderSearch({ blur: true });
        return;
    }
    if (event?.key === 'Enter') {
        event.preventDefault();
        if (event.shiftKey) previousSearchResult();
        else nextSearchResult();
    }
}

function updateSearchCount() {
    const count = document.getElementById('search-count');
    const total = isBookWideSearchActive() ? readerSearchState.results.length : readerSearchState.matches.length;
    const current = total > 0 && readerSearchState.currentIndex >= 0
        ? readerSearchState.currentIndex + 1
        : 0;
    if (count) count.innerText = `${current} / ${total}`;

    const previous = document.getElementById('search-prev-btn');
    const next = document.getElementById('search-next-btn');
    if (previous) previous.disabled = total === 0;
    if (next) next.disabled = total === 0;
}

function isSearchWordCharacter(char) {
    return !!char && /[A-Za-z]/.test(char);
}

function findSearchMatches(text, query, wholeWord, caseSensitive) {
    const haystack = caseSensitive ? text : text.toLocaleLowerCase();
    const needle = caseSensitive ? query : query.toLocaleLowerCase();
    const matches = [];
    if (!needle) return matches;

    let start = 0;
    while (start < haystack.length) {
        const index = haystack.indexOf(needle, start);
        if (index === -1) break;
        const before = text[index - 1];
        const after = text[index + needle.length];
        if (!wholeWord || (!isSearchWordCharacter(before) && !isSearchWordCharacter(after))) {
            matches.push({ index, length: needle.length });
        }
        start = index + Math.max(needle.length, 1);
    }
    return matches;
}

function buildBookSearchResults(article, query, wholeWord, caseSensitive) {
    if (!article || !query) return [];
    const results = [];
    getArticleChapters(article).forEach((chapter, chapterIndex) => {
        getReaderParagraphs(chapter.content).forEach((paragraph, paragraphIndex) => {
            findSearchMatches(paragraph, query, wholeWord, caseSensitive).forEach((hit, matchIndexInParagraph) => {
                results.push({
                    chapterId: chapter.id,
                    chapterIndex,
                    paragraphIndex,
                    textOffset: hit.index,
                    length: hit.length,
                    matchIndexInParagraph
                });
            });
        });
    });
    return results;
}

function applySearchHighlights() {
    const display = document.getElementById('text-display');
    if (!display || !readerSearchState.query) {
        readerSearchState.matches = [];
        readerSearchState.currentIndex = -1;
        updateSearchCount();
        return;
    }

    const walker = document.createTreeWalker(display, NodeFilter.SHOW_TEXT);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    const matches = [];
    textNodes.forEach(textNode => {
        const text = textNode.nodeValue;
        const hits = findSearchMatches(
            text,
            readerSearchState.query,
            readerSearchState.wholeWord,
            readerSearchState.caseSensitive
        );
        if (hits.length === 0) return;

        const fragment = document.createDocumentFragment();
        let cursor = 0;
        hits.forEach(hit => {
            if (hit.index > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, hit.index)));
            const span = document.createElement('span');
            span.className = 'search-match';
            span.textContent = text.slice(hit.index, hit.index + hit.length);
            fragment.appendChild(span);
            matches.push(span);
            cursor = hit.index + hit.length;
        });
        if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)));
        textNode.parentNode.replaceChild(fragment, textNode);
    });

    readerSearchState.matches = matches;
    if (!isBookWideSearchActive() && readerSearchState.currentIndex >= matches.length) readerSearchState.currentIndex = -1;
    updateSearchCount();
}

function setActiveSearchResult(index, shouldScroll = true) {
    if (isBookWideSearchActive()) {
        void setBookSearchResult(index, shouldScroll);
        return;
    }
    const matches = readerSearchState.matches;
    if (matches.length === 0) {
        readerSearchState.currentIndex = -1;
        updateSearchCount();
        return;
    }

    matches.forEach(match => match.classList.remove('current-search-match'));
    readerSearchState.currentIndex = (index + matches.length) % matches.length;
    const match = matches[readerSearchState.currentIndex];
    match.classList.add('current-search-match');
    if (shouldScroll) match.scrollIntoView({ behavior: 'smooth', block: 'center' });
    updateSearchCount();
}

async function setBookSearchResult(index, shouldScroll = true) {
    const results = readerSearchState.results;
    if (!results.length) {
        readerSearchState.currentIndex = -1;
        updateSearchCount();
        return;
    }
    readerSearchState.currentIndex = (index + results.length) % results.length;
    const result = results[readerSearchState.currentIndex];
    if (String(result.chapterId) !== String(getCurrentChapterId())) {
        await switchToChapter(result.chapterId, { preserveSearch: true, skipPositionRestore: true });
    }
    applySearchHighlights();
    const paragraph = document.querySelector(`#text-display p[data-paragraph-index="${result.paragraphIndex}"]`);
    const match = paragraph ? paragraph.querySelectorAll('.search-match')[result.matchIndexInParagraph] : null;
    document.querySelectorAll('.current-search-match').forEach(element => element.classList.remove('current-search-match'));
    if (match) {
        match.classList.add('current-search-match');
        if (shouldScroll) match.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    updateSearchCount();
}

function nextSearchResult() {
    if ((isBookWideSearchActive() ? readerSearchState.results : readerSearchState.matches).length === 0) return;
    setActiveSearchResult(readerSearchState.currentIndex + 1);
    document.getElementById('reader-search-input')?.focus({ preventScroll: true });
}

function previousSearchResult() {
    if ((isBookWideSearchActive() ? readerSearchState.results : readerSearchState.matches).length === 0) return;
    const total = isBookWideSearchActive() ? readerSearchState.results.length : readerSearchState.matches.length;
    setActiveSearchResult(readerSearchState.currentIndex < 0
        ? total - 1
        : readerSearchState.currentIndex - 1);
    document.getElementById('reader-search-input')?.focus({ preventScroll: true });
}

function searchInText() {
    const input = document.getElementById('reader-search-input');
    const wholeWord = document.getElementById('search-whole-word');
    const caseSensitive = document.getElementById('search-case-sensitive');
    const position = captureReadingPosition();
    const query = input ? input.value.trim() : '';

    readerSearchState.query = query;
    readerSearchState.wholeWord = !!wholeWord?.checked;
    readerSearchState.caseSensitive = !!caseSensitive?.checked;
    readerSearchState.articleId = currentArticle?.id || null;
    readerSearchState.currentIndex = -1;
    readerSearchState.matches = [];
    readerSearchState.results = isBookWideSearchActive()
        ? buildBookSearchResults(currentArticle, query, readerSearchState.wholeWord, readerSearchState.caseSensitive)
        : [];

    renderArticleText();
    if (!query) {
        readerSearchState.results = [];
        updateSearchCount();
        restoreReadingPosition(position);
        return;
    }

    applySearchHighlights();
    readerSearchState.currentIndex = -1;
    updateSearchCount();
    restoreReadingPosition(position);
}

window.addEventListener('pagehide', flushReadingPositionSave);
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushReadingPositionSave();
});

window.onload = init;

// --- Global Vocabulary ----------------------------------------------------
// Global VocabularyはLocalForageに専用コピーを作らず、libraryItems内の
// 各article.wordsから都度作る表示用view modelだけを保持する。
function globalIdsEqual(left, right) {
    return String(left) === String(right);
}

function hasGlobalWordId(wordId) {
    return wordId !== undefined && wordId !== null && wordId !== '';
}

const VOCABULARY_PARTS_OF_SPEECH = Object.freeze(['', 'noun', 'verb', 'adjective', 'adverb', 'phrase', 'preposition', 'conjunction', 'other']);

function normalizeVocabularyTags(value) {
    const rawTags = Array.isArray(value) ? value : String(value ?? '').split(/[,、]/);
    return [...new Set(rawTags
        .flatMap(tag => String(tag ?? '').split(/[,、]/))
        .map(tag => tag.trim())
        .filter(Boolean))];
}

function normalizeVocabularyPartOfSpeech(value) {
    const partOfSpeech = String(value ?? '').trim();
    return VOCABULARY_PARTS_OF_SPEECH.includes(partOfSpeech) ? partOfSpeech : '';
}

function getVocabularyWordSurfaceText(word) {
    const surfaceText = String(word?.surfaceText || '').trim();
    if (surfaceText) return surfaceText;
    const anchorText = String(word?.anchor?.selectedText || '').trim();
    return anchorText || String(word?.word || '').trim();
}

function getVocabularyWordRuntimeMetadata(word) {
    return {
        surfaceText: getVocabularyWordSurfaceText(word),
        tags: normalizeVocabularyTags(word?.tags),
        partOfSpeech: normalizeVocabularyPartOfSpeech(word?.partOfSpeech)
    };
}

function getVocabularyFormValues() {
    const canonical = String(document.getElementById('input-word-text')?.value || '').trim();
    const enteredSurfaceText = String(document.getElementById('input-word-surface-text')?.value || '').trim();
    return {
        word: canonical,
        surfaceText: enteredSurfaceText || canonical,
        meaning: String(document.getElementById('input-word-meaning')?.value || ''),
        partOfSpeech: normalizeVocabularyPartOfSpeech(document.getElementById('input-word-part-of-speech')?.value),
        tags: normalizeVocabularyTags(document.getElementById('input-word-tags')?.value),
        memo: String(document.getElementById('input-word-memo')?.value || ''),
        context: String(document.getElementById('input-word-context')?.value || '').trim()
    };
}

function getGlobalArticleTitle(article) {
    return String(article?.name || article?.title || '無題');
}

function getGlobalChapterInfo(article, word) {
    if (!word || word.chapterId === undefined || word.chapterId === null || word.chapterId === '') {
        return { id: '', title: '' };
    }

    const chapterId = word.chapterId;
    const chapters = Array.isArray(article?.chapters) ? article.chapters : [];
    const chapter = chapters.find(item => item && globalIdsEqual(item.id, chapterId));
    return {
        id: chapterId,
        title: String(chapter?.title || chapterId)
    };
}

function collectGlobalVocabulary() {
    let sequence = 0;
    const entries = [];

    libraryItems
        .filter(item => item && item.type === 'article')
        .forEach(article => {
            const words = Array.isArray(article.words) ? article.words : [];
            words.forEach((word, sourceIndex) => {
                const chapter = getGlobalChapterInfo(article, word);
                const wordId = word?.id;
                const metadata = getVocabularyWordRuntimeMetadata(word);
                const key = hasGlobalWordId(wordId)
                    ? `${String(article.id)}::id::${String(wordId)}`
                    : `${String(article.id)}::index::${String(sourceIndex)}`;
                entries.push({
                    key,
                    articleId: article.id,
                    articleTitle: getGlobalArticleTitle(article),
                    chapterId: chapter.id,
                    chapterTitle: chapter.title,
                    chapterKey: chapter.id === '' ? '' : `${String(article.id)}::${String(chapter.id)}`,
                    wordId,
                    sourceIndex,
                    word,
                    wordText: String(word?.word || ''),
                    surfaceText: metadata.surfaceText,
                    tags: metadata.tags,
                    partOfSpeech: metadata.partOfSpeech,
                    meaning: String(word?.meaning || ''),
                    memo: String(word?.memo || ''),
                    context: word?.context,
                    contextMeaning: word?.contextMeaning,
                    memorized: !!word?.memorized,
                    createdAt: word?.createdAt,
                    updatedAt: word?.updatedAt,
                    sourceName: String(article?.sourceName || article?.name || article?.title || ''),
                    sequence: sequence++
                });
            });
        });

    return entries;
}

function findGlobalEntry(key) {
    return globalVocabularyState.entries.find(entry => entry.key === String(key)) || null;
}

function resolveGlobalWordSourceIndex(words, wordId, sourceIndex) {
    if (!Array.isArray(words)) return -1;
    if (hasGlobalWordId(wordId)) {
        return words.findIndex(word => word && globalIdsEqual(word.id, wordId));
    }
    return Number.isInteger(sourceIndex) && words[sourceIndex] ? sourceIndex : -1;
}

function getGlobalEntrySource(entry) {
    if (!entry) return null;
    const article = libraryItems.find(item => item.type === 'article' && globalIdsEqual(item.id, entry.articleId));
    if (!article) return null;
    ensureArticleCollections(article);

    const index = resolveGlobalWordSourceIndex(article.words, entry.wordId, entry.sourceIndex);
    if (index < 0 || !article.words[index]) return null;
    return { article, word: article.words[index], index };
}

function getGlobalCreatedTimestamp(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value instanceof Date) return value.getTime();
    if (value) {
        const parsed = Date.parse(String(value));
        if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
}

function globalVocabularyFieldMatches(value, query, exact) {
    const normalizedValue = String(value ?? '').toLocaleLowerCase();
    const normalizedQuery = String(query ?? '').toLocaleLowerCase();
    return exact ? normalizedValue === normalizedQuery : normalizedValue.includes(normalizedQuery);
}

function getFilteredGlobalVocabulary() {
    const state = globalVocabularyState;
    const query = String(state.query || '').trim();
    let entries = state.entries.filter(entry => {
        if (state.status === 'memorized' && !entry.memorized) return false;
        if (state.status === 'unmemorized' && entry.memorized) return false;
        if (state.tag !== 'all' && !entry.tags.includes(state.tag)) return false;
        if (state.partOfSpeech === 'unset' && entry.partOfSpeech !== '') return false;
        if (state.partOfSpeech !== 'all' && state.partOfSpeech !== 'unset' && entry.partOfSpeech !== state.partOfSpeech) return false;
        if (state.sourceId !== 'all' && String(entry.articleId) !== String(state.sourceId)) return false;
        if (state.chapterId !== 'all' && String(entry.chapterKey) !== String(state.chapterId)) return false;

        if (!query) return true;
        return [
            entry.wordText,
            entry.surfaceText,
            entry.meaning,
            entry.memo,
            entry.context,
            entry.tags.join(' '),
            entry.articleTitle,
            entry.sourceName,
            entry.chapterTitle
        ].some(value => globalVocabularyFieldMatches(value, query, state.exact));
    });

    entries.sort((left, right) => {
        if (state.sort === 'az' || state.sort === 'za') {
            const direction = state.sort === 'az' ? 1 : -1;
            const wordCompare = left.wordText.localeCompare(right.wordText, undefined, { sensitivity: 'base' });
            if (wordCompare !== 0) return wordCompare * direction;
            return left.sequence - right.sequence;
        }

        const leftTime = getGlobalCreatedTimestamp(left.createdAt);
        const rightTime = getGlobalCreatedTimestamp(right.createdAt);
        if (leftTime !== rightTime) {
            return state.sort === 'oldest' ? leftTime - rightTime : rightTime - leftTime;
        }
        // createdAtを持たないlegacy word同士も安定して並べる。
        return state.sort === 'oldest'
            ? left.sequence - right.sequence
            : right.sequence - left.sequence;
    });

    return entries;
}

function getGlobalVocabularyStatistics(entries = globalVocabularyState.entries) {
    const list = Array.isArray(entries) ? entries : [];
    return {
        total: list.length,
        unique: new Set(list.map(entry => normalizeVocabularyWord(entry.wordText)).filter(Boolean)).size,
        memorized: list.filter(entry => entry.memorized).length
    };
}

function groupGlobalVocabularyEntries(entries) {
    const groups = new Map();
    (entries || []).forEach(entry => {
        const key = normalizeVocabularyWord(entry.wordText) || `__empty__${entry.key}`;
        if (!groups.has(key)) groups.set(key, { key, wordText: entry.wordText, entries: [] });
        groups.get(key).entries.push(entry);
    });
    return Array.from(groups.values());
}

function appendGlobalVocabularyOption(select, value, label) {
    if (!select) return;
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = String(label);
    select.appendChild(option);
}

function renderGlobalVocabularyControls() {
    const state = globalVocabularyState;
    const sourceSelect = document.getElementById('global-vocab-source');
    const chapterSelect = document.getElementById('global-vocab-chapter');
    const tagSelect = document.getElementById('global-vocab-tag');
    const partOfSpeechSelect = document.getElementById('global-vocab-part-of-speech');
    if (!sourceSelect || !chapterSelect) return;

    const title = document.getElementById('global-vocab-title');
    const selectedArticle = state.sourceId === 'all'
        ? null
        : state.entries.find(entry => String(entry.articleId) === String(state.sourceId));
    if (title) title.textContent = selectedArticle ? `Global Vocabulary · ${selectedArticle.articleTitle}` : 'Global Vocabulary';

    const articles = [];
    state.entries.forEach(entry => {
        if (!articles.some(article => globalIdsEqual(article.id, entry.articleId))) {
            articles.push({ id: entry.articleId, title: entry.articleTitle });
        }
    });

    sourceSelect.innerHTML = '';
    const allSources = document.createElement('option');
    allSources.value = 'all';
    allSources.textContent = 'すべての記事・書籍';
    sourceSelect.appendChild(allSources);
    articles.forEach(article => {
        const option = document.createElement('option');
        option.value = String(article.id);
        option.textContent = article.title;
        sourceSelect.appendChild(option);
    });
    if (!articles.some(article => String(article.id) === String(state.sourceId))) state.sourceId = 'all';
    sourceSelect.value = String(state.sourceId);

    const tags = Array.from(new Set(state.entries.flatMap(entry => entry.tags || [])))
        .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
    if (tagSelect) {
        tagSelect.innerHTML = '';
        appendGlobalVocabularyOption(tagSelect, 'all', 'すべてのタグ');
        tags.forEach(tag => appendGlobalVocabularyOption(tagSelect, tag, tag));
        if (!tags.includes(state.tag)) state.tag = 'all';
        tagSelect.value = state.tag;
    }

    const partOfSpeechLabels = {
        '': '未設定',
        noun: '名詞',
        verb: '動詞',
        adjective: '形容詞',
        adverb: '副詞',
        phrase: '句・フレーズ',
        preposition: '前置詞',
        conjunction: '接続詞',
        other: 'その他'
    };
    if (partOfSpeechSelect) {
        partOfSpeechSelect.innerHTML = '';
        appendGlobalVocabularyOption(partOfSpeechSelect, 'all', 'すべての品詞');
        appendGlobalVocabularyOption(partOfSpeechSelect, 'unset', partOfSpeechLabels['']);
        VOCABULARY_PARTS_OF_SPEECH.filter(value => value !== '').forEach(value => {
            appendGlobalVocabularyOption(partOfSpeechSelect, value, partOfSpeechLabels[value] || value);
        });
        if (!VOCABULARY_PARTS_OF_SPEECH.includes(state.partOfSpeech) && !['all', 'unset'].includes(state.partOfSpeech)) state.partOfSpeech = 'all';
        partOfSpeechSelect.value = state.partOfSpeech;
    }

    const chapters = [];
    state.entries
        .filter(entry => state.sourceId === 'all' || String(entry.articleId) === String(state.sourceId))
        .forEach(entry => {
            if (!entry.chapterId) return;
            const key = String(entry.articleId) + '::' + String(entry.chapterId);
            if (!chapters.some(chapter => chapter.key === key)) {
                chapters.push({
                    key,
                    id: entry.chapterId,
                    title: entry.chapterTitle || String(entry.chapterId)
                });
            }
        });

    chapterSelect.innerHTML = '';
    const allChapters = document.createElement('option');
    allChapters.value = 'all';
    allChapters.textContent = 'すべての章';
    chapterSelect.appendChild(allChapters);
    chapters.forEach(chapter => {
        const option = document.createElement('option');
        option.value = String(chapter.key);
        option.textContent = chapter.title;
        chapterSelect.appendChild(option);
    });
    if (!chapters.some(chapter => String(chapter.key) === String(state.chapterId))) state.chapterId = 'all';
    chapterSelect.value = String(state.chapterId);
    chapterSelect.style.display = chapters.length > 0 ? '' : 'none';

    const queryInput = document.getElementById('global-vocab-search');
    const exactInput = document.getElementById('global-vocab-exact');
    const statusSelect = document.getElementById('global-vocab-status');
    const sortSelect = document.getElementById('global-vocab-sort');
    const ankiInput = document.getElementById('global-vocab-anki');
    const ankiTarget = document.getElementById('global-vocab-anki-target');
    const groupedInput = document.getElementById('global-vocab-grouped');
    if (queryInput) queryInput.value = state.query;
    if (exactInput) exactInput.checked = state.exact;
    if (statusSelect) statusSelect.value = state.status;
    if (sortSelect) sortSelect.value = state.sort;
    if (ankiInput) ankiInput.checked = state.ankiMode;
    if (ankiTarget) ankiTarget.value = state.ankiTarget;
    if (groupedInput) groupedInput.checked = state.grouped;
}

function addGlobalVocabularyDetail(container, label, value) {
    if (value === undefined || value === null || String(value) === '') return;
    const row = document.createElement('div');
    row.className = 'global-vocabulary-detail-row';
    const labelElement = document.createElement('span');
    labelElement.className = 'global-vocabulary-detail-label';
    labelElement.textContent = label;
    const valueElement = document.createElement('span');
    valueElement.className = 'global-vocabulary-detail-value';
    valueElement.textContent = String(value);
    row.append(labelElement, valueElement);
    container.appendChild(row);
}

function formatGlobalVocabularyDate(value) {
    const timestamp = getGlobalCreatedTimestamp(value);
    return timestamp > 0 ? new Date(timestamp).toLocaleDateString('ja-JP') : '';
}

function globalVocabularySelectionIntersects(element) {
    const selection = window.getSelection?.();
    if (!selection || selection.isCollapsed || !selection.toString().trim() || !selection.rangeCount) return false;
    const range = selection.getRangeAt(0);
    if (element.contains(range.commonAncestorContainer)) return true;
    try {
        return range.intersectsNode(element);
    } catch (_error) {
        return false;
    }
}

function setGlobalVocabularyContextMaskState(mask, answer, placeholder, revealed) {
    mask.classList.toggle('global-vocabulary-context-mask', !revealed);
    mask.classList.toggle('global-vocabulary-context-answer', revealed);
    mask.textContent = revealed ? answer : placeholder;
    mask.setAttribute('aria-label', revealed ? '単語を隠す' : '伏字を表示');
    mask.setAttribute('aria-pressed', String(revealed));
}

function appendGlobalVocabularyContextText(container, context, word, { interactive = false, entryKey = '' } = {}) {
    const text = String(context ?? '');
    const phrase = String(word ?? '').trim();
    if (!text) return;
    const matches = phrase
        ? getGlobalSearchMatches(text, { query: phrase, wholeWord: false, caseSensitive: false })
        : [];
    if (!phrase || !matches.length) {
        container.textContent = text;
        return;
    }
    let cursor = 0;
    matches.forEach((match, occurrenceIndex) => {
        if (match.index > cursor) container.appendChild(document.createTextNode(text.slice(cursor, match.index)));
        if (interactive) {
            const answer = text.slice(match.index, match.index + match.length);
            const placeholder = '＿'.repeat(Math.max(4, Math.min(20, Array.from(answer).length)));
            const maskKey = `${entryKey}::${occurrenceIndex}`;
            const isRevealed = globalVocabularyState.contextRevealedMaskKeys.has(maskKey);
            const mask = document.createElement('span');
            mask.setAttribute('role', 'button');
            mask.setAttribute('tabindex', '0');
            mask.dataset.contextMaskKey = maskKey;
            setGlobalVocabularyContextMaskState(mask, answer, placeholder, isRevealed);

            const toggleMask = () => {
                const shouldReveal = !globalVocabularyState.contextRevealedMaskKeys.has(maskKey);
                if (shouldReveal) globalVocabularyState.contextRevealedMaskKeys.add(maskKey);
                else globalVocabularyState.contextRevealedMaskKeys.delete(maskKey);
                setGlobalVocabularyContextMaskState(mask, answer, placeholder, shouldReveal);
            };
            mask.addEventListener('click', event => {
                event.stopPropagation();
                if (globalVocabularySelectionIntersects(mask)) return;
                toggleMask();
            });
            mask.addEventListener('keydown', event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                toggleMask();
            });
            container.appendChild(mask);
        } else {
            const highlight = document.createElement('mark');
            highlight.className = 'global-vocabulary-context-highlight';
            highlight.textContent = text.slice(match.index, match.index + match.length);
            container.appendChild(highlight);
        }
        cursor = match.index + match.length;
    });
    if (cursor < text.length) container.appendChild(document.createTextNode(text.slice(cursor)));
}

function appendGlobalVocabularyContext(container, entry) {
    const context = String(entry?.context ?? '');
    if (!context.trim()) return false;

    const key = String(entry.key);
    const isAnkiModeActive = !!globalVocabularyState.ankiMode;
    const isOpen = isAnkiModeActive
        ? globalVocabularyState.contextExpandedKeys.has(key)
        : !globalVocabularyState.contextCollapsedKeys.has(key);

    const wrapper = document.createElement('div');
    wrapper.className = 'global-vocabulary-context';
    wrapper.addEventListener('click', event => event.stopPropagation());

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'global-vocabulary-context-toggle';
    toggle.textContent = isOpen ? '例文を隠す' : '例文';
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        if (isAnkiModeActive) {
            if (isOpen) globalVocabularyState.contextExpandedKeys.delete(key);
            else globalVocabularyState.contextExpandedKeys.add(key);
        } else if (isOpen) {
            globalVocabularyState.contextCollapsedKeys.add(key);
        } else {
            globalVocabularyState.contextCollapsedKeys.delete(key);
        }
        renderGlobalVocabulary();
    });
    wrapper.appendChild(toggle);

    if (isOpen) {
        const panel = document.createElement('div');
        panel.className = 'global-vocabulary-context-panel';
        appendGlobalVocabularyContextText(panel, context, entry.surfaceText || entry.wordText, {
            interactive: isAnkiModeActive,
            entryKey: key
        });

        if (entry.contextMeaning) {
            const contextMeaning = document.createElement('div');
            contextMeaning.className = 'global-vocabulary-context-meaning';
            contextMeaning.textContent = `Context meaning: ${String(entry.contextMeaning)}`;
            panel.appendChild(contextMeaning);
        }

        if (isAnkiModeActive) {
            const openButton = document.createElement('button');
            openButton.type = 'button';
            openButton.className = 'small-btn global-vocabulary-context-open';
            openButton.textContent = '本文で開く';
            openButton.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                openGlobalVocabularyEntry(entry.key);
            });
            panel.appendChild(openButton);
        }
        wrapper.appendChild(panel);
    }
    container.appendChild(wrapper);
    return true;
}

function createGlobalVocabularyCard(entry, { forceExpanded = false } = {}) {
    const card = document.createElement('article');
    card.className = 'note-card compact-card global-vocabulary-card' + (entry.memorized ? ' memorized-item' : '');
    const entryKey = String(entry.key);
    if (globalVocabularyState.ankiRevealedKeys.has(entryKey)) card.classList.add('revealed');
    card.addEventListener('click', event => {
        if (event.target.closest('button, input, select, a')) return;
        if (globalVocabularyState.ankiMode) {
            if (globalVocabularyState.ankiRevealedKeys.has(entryKey)) {
                globalVocabularyState.ankiRevealedKeys.delete(entryKey);
                card.classList.remove('revealed');
            } else {
                globalVocabularyState.ankiRevealedKeys.add(entryKey);
                card.classList.add('revealed');
            }
            return;
        }
        if (forceExpanded) return;
        const opening = globalVocabularyState.expandedKey !== entry.key;
        globalVocabularyState.expandedKey = opening ? entry.key : null;
        if (opening) globalVocabularyState.contextCollapsedKeys.delete(entryKey);
        renderGlobalVocabulary();
    });

    const summary = document.createElement('div');
    summary.className = 'word-row global-vocabulary-summary';
    const left = document.createElement('div');
    left.className = 'word-left';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = entry.memorized;
    check.title = '暗記済み';
    check.addEventListener('click', event => event.stopPropagation());
    check.addEventListener('change', event => toggleGlobalMemorized(entry.key, event));
    const speaker = document.createElement('span');
    speaker.textContent = '🔊';
    speaker.title = '発音';
    speaker.addEventListener('click', event => {
        event.stopPropagation();
        speakWord(entry.wordText);
    });
    const word = document.createElement('span');
    word.className = 'word-text';
    word.textContent = entry.wordText;
    const metadata = document.createElement('span');
    metadata.className = 'global-vocabulary-card-metadata';
    if (entry.partOfSpeech) {
        const partOfSpeech = document.createElement('span');
        partOfSpeech.className = 'global-vocabulary-chip';
        partOfSpeech.textContent = getVocabularyPartOfSpeechLabel(entry.partOfSpeech);
        metadata.appendChild(partOfSpeech);
    }
    left.append(check, speaker, word, metadata);
    const meaning = document.createElement('div');
    meaning.className = 'meaning-right';
    meaning.textContent = entry.meaning;
    summary.append(left, meaning);
    card.appendChild(summary);

    const isExpanded = !globalVocabularyState.ankiMode && (forceExpanded || globalVocabularyState.expandedKey === entry.key);
    if (isExpanded) {
        const details = document.createElement('div');
        details.className = 'global-vocabulary-details';
        appendGlobalVocabularyContext(details, entry);
        addGlobalVocabularyDetail(details, '出典', entry.articleTitle);
        if (entry.chapterTitle) addGlobalVocabularyDetail(details, '章', entry.chapterTitle);
        if (entry.surfaceText && entry.surfaceText !== entry.wordText) addGlobalVocabularyDetail(details, '本文での表現', entry.surfaceText);
        if (entry.partOfSpeech) addGlobalVocabularyDetail(details, '品詞', getVocabularyPartOfSpeechLabel(entry.partOfSpeech));
        if (entry.tags.length) addGlobalVocabularyDetail(details, 'タグ', entry.tags.join(', '));
        if (entry.memo) addGlobalVocabularyDetail(details, 'Memo', entry.memo);
        if (entry.contextMeaning) addGlobalVocabularyDetail(details, 'Context訳', entry.contextMeaning);
        if (entry.createdAt) addGlobalVocabularyDetail(details, '登録日', formatGlobalVocabularyDate(entry.createdAt));

        const actions = document.createElement('div');
        actions.className = 'global-vocabulary-actions';
        const editButton = document.createElement('button');
        editButton.className = 'small-btn';
        editButton.textContent = '編集';
        editButton.addEventListener('click', event => {
            event.stopPropagation();
            openGlobalVocabularyWordEditor(entry.key);
        });
        const deleteButton = document.createElement('button');
        deleteButton.className = 'small-btn del';
        deleteButton.textContent = '削除';
        deleteButton.addEventListener('click', event => {
            event.stopPropagation();
            deleteGlobalVocabularyWord(entry.key);
        });
        const openButton = document.createElement('button');
        openButton.className = 'small-btn';
        openButton.textContent = '本文で開く';
        openButton.addEventListener('click', event => {
            event.stopPropagation();
            openGlobalVocabularyEntry(entry.key);
        });
        actions.append(editButton, deleteButton, openButton);
        details.appendChild(actions);
        card.appendChild(details);
    } else if (globalVocabularyState.ankiMode) {
        appendGlobalVocabularyContext(card, entry);
    }

    return card;
}

function createGlobalVocabularyGroupCard(group) {
    const card = document.createElement('article');
    const memorized = group.entries.filter(entry => entry.memorized).length;
    const expanded = globalVocabularyState.expandedKey === `group:${group.key}`;
    card.className = 'note-card compact-card global-vocabulary-card global-vocabulary-group';
    const summary = document.createElement('div');
    summary.className = 'word-row global-vocabulary-summary';
    const word = document.createElement('span');
    word.className = 'word-text';
    word.textContent = group.wordText;
    const label = document.createElement('div');
    label.className = 'meaning-right global-vocabulary-group-count';
    const meanings = Array.from(new Set(group.entries.map(entry => entry.meaning).filter(Boolean)));
    const meaningLabel = meanings.length <= 1 ? (meanings[0] || '') : `${meanings.length} meanings`;
    label.textContent = `${meaningLabel} · × ${group.entries.length} · ${memorized}/${group.entries.length} 暗記済み`;
    summary.append(word, label);
    summary.addEventListener('click', () => {
        globalVocabularyState.expandedKey = expanded ? null : `group:${group.key}`;
        renderGlobalVocabulary();
    });
    card.appendChild(summary);
    if (!expanded) return card;

    const actions = document.createElement('div');
    actions.className = 'global-vocabulary-actions global-vocabulary-group-actions';
    const markAll = document.createElement('button');
    markAll.className = 'small-btn';
    markAll.textContent = 'すべて暗記済みにする';
    markAll.onclick = () => void setGlobalGroupMemorized(group.key, true);
    const clearAll = document.createElement('button');
    clearAll.className = 'small-btn';
    clearAll.textContent = 'すべて未暗記にする';
    clearAll.onclick = () => void setGlobalGroupMemorized(group.key, false);
    actions.append(markAll, clearAll);
    card.appendChild(actions);
    const entries = document.createElement('div');
    entries.className = 'global-vocabulary-group-entries';
    group.entries.forEach(entry => entries.appendChild(createGlobalVocabularyCard(entry, { forceExpanded: true })));
    card.appendChild(entries);
    return card;
}

function renderGlobalVocabulary() {
    const container = document.getElementById('global-vocabulary-list');
    if (!container) return;

    renderGlobalVocabularyControls();
    const entries = getFilteredGlobalVocabulary();
    const total = globalVocabularyState.entries.length;
    const count = document.getElementById('global-vocab-count');
    if (count) {
        count.textContent = entries.length === total
            ? total.toLocaleString() + ' words'
            : entries.length.toLocaleString() + ' / ' + total.toLocaleString() + ' words';
    }
    const statsTarget = document.getElementById('global-vocab-statistics');
    if (statsTarget) {
        const filteredStats = getGlobalVocabularyStatistics(entries);
        const allStats = getGlobalVocabularyStatistics(globalVocabularyState.entries);
        const prefix = entries.length === total ? '' : `${filteredStats.total} / ${allStats.total} entries · `;
        statsTarget.textContent = `${prefix}${filteredStats.unique} unique · ${filteredStats.memorized} memorized · ${filteredStats.total - filteredStats.memorized} unmemorized`;
    }

    applyAnkiMaskClass(container, globalVocabularyState.ankiMode, globalVocabularyState.ankiTarget);
    container.innerHTML = '';
    if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'global-vocabulary-empty';
        empty.textContent = total === 0 ? '登録された単語はありません。' : '条件に一致する単語はありません。';
        container.appendChild(empty);
        return;
    }
    if (globalVocabularyState.grouped) {
        groupGlobalVocabularyEntries(entries).forEach(group => container.appendChild(createGlobalVocabularyGroupCard(group)));
    } else {
        entries.forEach(entry => container.appendChild(createGlobalVocabularyCard(entry)));
    }
}

function showGlobalVocabulary() {
    flushReadingPositionSave();
    hideAllSections();
    document.getElementById('side-panel')?.classList.remove('is-open');
    document.getElementById('add-btn').style.display = 'none';
    document.getElementById('fab-toggle').style.display = 'none';
    const section = document.getElementById('vocabulary-section');
    if (!section) return;
    section.style.display = 'block';
    globalVocabularyState.entries = collectGlobalVocabulary();
    renderGlobalVocabulary();
}

function updateGlobalVocabulary(field, value) {
    if (field === 'query') globalVocabularyState.query = String(value || '');
    if (field === 'exact') globalVocabularyState.exact = !!value;
    if (field === 'status') globalVocabularyState.status = value;
    if (field === 'tag') globalVocabularyState.tag = value || 'all';
    if (field === 'partOfSpeech') globalVocabularyState.partOfSpeech = value || 'all';
    if (field === 'sourceId') {
        globalVocabularyState.sourceId = value;
        globalVocabularyState.chapterId = 'all';
    }
    if (field === 'chapterId') globalVocabularyState.chapterId = value;
    if (field === 'sort') globalVocabularyState.sort = value;
    renderGlobalVocabulary();
}

function showGlobalVocabularyForArticle(articleId) {
    globalVocabularyState.sourceId = articleId === undefined || articleId === null ? 'all' : String(articleId);
    globalVocabularyState.chapterId = 'all';
    showGlobalVocabulary();
}

function showCurrentArticleVocabulary() {
    if (currentArticle) showGlobalVocabularyForArticle(currentArticle.id);
    else showGlobalVocabulary();
}

function toggleGlobalAnkiMode() {
    const checkbox = document.getElementById('global-vocab-anki');
    globalVocabularyState.ankiMode = !!checkbox?.checked;
    renderGlobalVocabulary();
}

function toggleGlobalVocabularyGrouping() {
    globalVocabularyState.grouped = !!document.getElementById('global-vocab-grouped')?.checked;
    globalVocabularyState.expandedKey = null;
    renderGlobalVocabulary();
}

function updateGlobalAnkiTarget(value) {
    globalVocabularyState.ankiTarget = value || 'both';
    renderGlobalVocabulary();
}

async function toggleGlobalMemorized(key, event) {
    if (event) event.stopPropagation();
    const entry = findGlobalEntry(key);
    const source = getGlobalEntrySource(entry);
    if (!source) return;
    source.word.memorized = !source.word.memorized;
    await saveToDB();
    globalVocabularyState.entries = collectGlobalVocabulary();
    renderGlobalVocabulary();
}

async function setGlobalGroupMemorized(groupKey, memorized) {
    const entries = globalVocabularyState.entries.filter(entry => normalizeVocabularyWord(entry.wordText) === groupKey);
    entries.forEach(entry => {
        const source = getGlobalEntrySource(entry);
        if (source) source.word.memorized = memorized;
    });
    await saveToDB();
    globalVocabularyState.entries = collectGlobalVocabulary();
    renderGlobalVocabulary();
}

function openGlobalVocabularyWordEditor(key) {
    const entry = findGlobalEntry(key);
    const source = getGlobalEntrySource(entry);
    if (!entry || !source) return;
    globalVocabularyEditRef = {
        articleId: source.article.id,
        wordId: source.word.id,
        sourceIndex: source.index
    };
    editingId = source.word.id;
    switchModalType('word');
    const metadata = getVocabularyWordRuntimeMetadata(source.word);
    document.getElementById('input-word-text').value = source.word.word || '';
    document.getElementById('input-word-surface-text').value = metadata.surfaceText;
    document.getElementById('input-word-meaning').value = source.word.meaning || '';
    document.getElementById('input-word-part-of-speech').value = metadata.partOfSpeech;
    document.getElementById('input-word-tags').value = metadata.tags.join(', ');
    document.getElementById('input-word-memo').value = source.word.memo || '';
    document.getElementById('input-word-context').value = source.word.context || '';
    showUnifiedModal();
}

async function saveGlobalVocabularyWordFromModal() {
    const reference = globalVocabularyEditRef;
    if (!reference) return;
    const article = libraryItems.find(item => item.type === 'article' && globalIdsEqual(item.id, reference.articleId));
    if (!article) {
        closeModal();
        return;
    }
    ensureArticleCollections(article);
    const wordIndex = resolveGlobalWordSourceIndex(article.words, reference.wordId, reference.sourceIndex);
    const oldWord = article.words[wordIndex];
    if (!oldWord) {
        closeModal();
        return;
    }

    article.words[wordIndex] = Object.assign({}, oldWord, getVocabularyFormValues(), { updatedAt: Date.now() });
    await saveToDB();
    closeModal();
    globalVocabularyState.entries = collectGlobalVocabulary();
    renderGlobalVocabulary();
}

async function deleteGlobalVocabularyWord(key) {
    const entry = findGlobalEntry(key);
    const source = getGlobalEntrySource(entry);
    if (!source) return;
    if (!confirm('この単語を削除しますか？')) return;
    source.article.words.splice(source.index, 1);
    await saveToDB();
    globalVocabularyState.expandedKey = null;
    globalVocabularyState.entries = collectGlobalVocabulary();
    renderGlobalVocabulary();
}

function getGlobalWordPosition(word) {
    if (!word) return null;
    if (word.position && typeof word.position === 'object') return word.position;
    if (word.readingPosition && typeof word.readingPosition === 'object') return word.readingPosition;
    if (Number.isInteger(word.paragraphIndex)) {
        return {
            paragraphIndex: word.paragraphIndex,
            paragraphOffset: Number.isFinite(word.paragraphOffset) ? word.paragraphOffset : 0,
            scrollRatio: Number.isFinite(word.scrollRatio) ? word.scrollRatio : 0
        };
    }
    return null;
}

function findAnchorInParagraphs(paragraphs, anchor, context = '') {
    const list = Array.isArray(paragraphs) ? paragraphs.map(value => String(value ?? '')) : [];
    const selectedText = String(anchor?.selectedText || '').trim();
    const paragraphIndex = Number.isInteger(anchor?.paragraphIndex) ? anchor.paragraphIndex : -1;
    const textOffset = Number.isFinite(anchor?.textOffset) ? anchor.textOffset : -1;
    const tryParagraph = (index, source) => {
        const paragraph = list[index];
        if (paragraph === undefined) return null;
        if (selectedText && textOffset >= 0 && paragraph.slice(textOffset, textOffset + selectedText.length) === selectedText) {
            return { paragraphIndex: index, textOffset, length: selectedText.length, source };
        }
        if (selectedText) {
            const indexInParagraph = paragraph.indexOf(selectedText);
            if (indexInParagraph >= 0) return { paragraphIndex: index, textOffset: indexInParagraph, length: selectedText.length, source: `${source}-text` };
        }
        return null;
    };
    if (paragraphIndex >= 0) {
        const exact = tryParagraph(paragraphIndex, 'anchor');
        if (exact) return exact;
    }
    const needle = String(context || '').trim();
    if (needle) {
        for (let index = 0; index < list.length; index += 1) {
            const offset = list[index].indexOf(needle);
            if (offset >= 0) return { paragraphIndex: index, textOffset: offset, length: needle.length, source: 'context' };
        }
    }
    if (anchor?.prefix || anchor?.suffix) {
        for (let index = 0; index < list.length; index += 1) {
            const prefixIndex = anchor.prefix ? list[index].indexOf(anchor.prefix) : 0;
            const suffixIndex = anchor.suffix ? list[index].indexOf(anchor.suffix, Math.max(0, prefixIndex)) : -1;
            if (prefixIndex >= 0 && (suffixIndex >= 0 || !anchor.suffix)) {
                return { paragraphIndex: index, textOffset: prefixIndex + String(anchor.prefix || '').length, length: selectedText.length, source: 'surrounding-text' };
            }
        }
    }
    if (paragraphIndex >= 0 && list[paragraphIndex] !== undefined && textOffset >= 0) {
        return { paragraphIndex, textOffset: Math.min(textOffset, list[paragraphIndex].length), length: selectedText.length, source: 'paragraph-offset' };
    }
    return null;
}

function flashReaderAnchor(resolution, word) {
    const display = document.getElementById('text-display');
    const paragraph = display?.querySelector(`p[data-paragraph-index="${resolution.paragraphIndex}"]`);
    if (!paragraph) return false;
    paragraph.classList.add('temporary-reader-anchor');
    const wordTarget = Array.from(paragraph.querySelectorAll('[data-jump-id]')).find(element =>
        globalIdsEqual(element.dataset.jumpId, word.id) && element.dataset.type === 'word');
    if (wordTarget) wordTarget.classList.add('temporary-reader-highlight');
    paragraph.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
        paragraph.classList.remove('temporary-reader-anchor');
        wordTarget?.classList.remove('temporary-reader-highlight');
    }, 2500);
    return true;
}

function openGlobalVocabularyEntry(key) {
    const entry = findGlobalEntry(key);
    const source = getGlobalEntrySource(entry);
    if (!entry || !source) return;

    openArticle(entry.articleId);
    setTimeout(async () => {
        if (!currentArticle || !globalIdsEqual(currentArticle.id, entry.articleId)) return;
        if (entry.chapterId && hasStoredChapters(currentArticle) && typeof switchToChapter === 'function') {
            await switchToChapter(entry.chapterId);
        }

        const paragraphs = getReaderParagraphs(getCurrentChapterContent());
        const anchor = source.word.anchor && typeof source.word.anchor === 'object'
            ? { ...source.word.anchor, selectedText: source.word.anchor.selectedText || entry.surfaceText || entry.wordText }
            : { selectedText: entry.surfaceText || entry.wordText };
        const resolution = findAnchorInParagraphs(paragraphs, anchor, source.word.context);
        if (resolution && flashReaderAnchor(resolution, source.word)) return;

        const position = getGlobalWordPosition(source.word);
        if (position) restoreReadingPosition(position);

        const display = document.getElementById('text-display');
        const target = display
            ? Array.from(display.querySelectorAll('.word-highlight')).find(element =>
                (hasGlobalWordId(source.word.id) && globalIdsEqual(element.dataset.jumpId, source.word.id)) ||
                Number.parseInt(element.dataset.wordIndex, 10) === source.index)
            : null;
        if (target) {
            target.classList.add('temporary-reader-highlight');
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => target.classList.remove('temporary-reader-highlight'), 2500);
        }
    }, 120);
}

function globalCsvValue(value) {
    const text = String(value ?? '');
    return '"' + text.replace(/"/g, '""') + '"';
}

function downloadGlobalVocabularyCsv(csv, filename) {
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportGlobalVocabularyCSV() {
    const entries = collectGlobalVocabulary();
    if (entries.length === 0) {
        alert('データなし');
        return;
    }
    const header = ['Word', 'SurfaceText', 'Meaning', 'PartOfSpeech', 'Tags', 'Memo', 'Context', 'Article', 'Chapter', 'Memorized', 'CreatedAt', 'UpdatedAt'];
    const rows = entries.map(entry => [
        entry.wordText,
        entry.surfaceText,
        entry.meaning,
        entry.partOfSpeech,
        entry.tags.join(', '),
        entry.memo,
        entry.context || '',
        entry.articleTitle,
        entry.chapterTitle,
        entry.memorized ? 'true' : 'false',
        entry.createdAt || '',
        entry.updatedAt || ''
    ]);
    const csv = [header, ...rows].map(row => row.map(globalCsvValue).join(',')).join('\r\n') + '\r\n';
    downloadGlobalVocabularyCsv(csv, 'global-vocabulary.csv');
}

// --- Global Problems ------------------------------------------------------
// Global ProblemsはLocalForageに専用コピーを作らず、各article.questionsから
// 画面表示用のruntime entryを毎回構築する。
function hasGlobalProblemId(questionId) {
    return questionId !== undefined && questionId !== null && questionId !== '';
}

function getGlobalProblemChapterInfo(article, question) {
    const chapter = getGlobalChapterInfo(article, question);
    if (chapter.id !== '') return chapter;
    if (!hasStoredChapters(article)) return { id: 'legacy-main', title: '本文' };
    const firstChapter = getArticleChapters(article)[0];
    if (firstChapter) return { id: firstChapter.id, title: firstChapter.title };
    return chapter;
}

function collectGlobalProblems() {
    let sequence = 0;
    const entries = [];
    libraryItems
        .filter(item => item && item.type === 'article')
        .forEach(article => {
            const questions = Array.isArray(article.questions) ? article.questions : [];
            questions.forEach((question, sourceIndex) => {
                if (!question || typeof question !== 'object') return;
                const metadata = getQuestionRuntimeMetadata(question);
                const chapter = getGlobalProblemChapterInfo(article, question);
                const questionId = question.id;
                const key = hasGlobalProblemId(questionId)
                    ? `${String(article.id)}::id::${String(questionId)}`
                    : `${String(article.id)}::index::${String(sourceIndex)}`;
                entries.push({
                    key,
                    articleId: article.id,
                    articleTitle: getGlobalArticleTitle(article),
                    chapterId: chapter.id,
                    chapterTitle: chapter.title,
                    chapterKey: chapter.id === '' ? '' : `${String(article.id)}::${String(chapter.id)}`,
                    questionId,
                    sourceIndex,
                    selectedText: String(question.selectedText || question.anchor?.selectedText || ''),
                    question: String(question.question || ''),
                    answer: String(question.answer || ''),
                    explanation: String(question.explanation || ''),
                    memo: String(question.memo || ''),
                    questionType: metadata.questionType,
                    tags: metadata.tags,
                    difficulty: metadata.difficulty,
                    needsReview: metadata.needsReview,
                    attempts: metadata.attempts,
                    createdAt: question.createdAt,
                    updatedAt: question.updatedAt ?? question.createdAt ?? null,
                    sequence: sequence++
                });
            });
        });
    return entries;
}

function findGlobalProblemEntry(key) {
    return globalProblemsState.entries.find(entry => entry.key === String(key)) || null;
}

function resolveGlobalProblemSourceIndex(questions, questionId, sourceIndex) {
    if (!Array.isArray(questions)) return -1;
    if (hasGlobalProblemId(questionId)) {
        return questions.findIndex(question => question && globalIdsEqual(question.id, questionId));
    }
    return Number.isInteger(sourceIndex) && questions[sourceIndex] ? sourceIndex : -1;
}

function getGlobalProblemEntrySource(entry) {
    if (!entry) return null;
    const article = libraryItems.find(item => item?.type === 'article' && globalIdsEqual(item.id, entry.articleId));
    if (!article) return null;
    ensureArticleCollections(article);
    const index = resolveGlobalProblemSourceIndex(article.questions, entry.questionId, entry.sourceIndex);
    if (index < 0 || !article.questions[index]) return null;
    return { article, question: article.questions[index], index };
}

function getGlobalProblemAttemptSummary(attempts) {
    const list = Array.isArray(attempts) ? attempts : [];
    let correctCount = 0;
    let incorrectCount = 0;
    let partialCount = 0;
    let latestAttempt = null;
    let latestTimestamp = -1;
    list.forEach((attempt, index) => {
        if (attempt?.result === 'correct') correctCount += 1;
        if (attempt?.result === 'incorrect') incorrectCount += 1;
        if (attempt?.result === 'partial') partialCount += 1;
        const timestamp = getGlobalCreatedTimestamp(attempt?.answeredAt);
        if (timestamp > latestTimestamp || (timestamp === latestTimestamp && latestAttempt === null)) {
            latestTimestamp = timestamp;
            latestAttempt = attempt;
        } else if (timestamp === latestTimestamp && latestAttempt !== null) {
            // 同時刻の履歴は配列後方を最新として扱う。
            const latestIndex = list.indexOf(latestAttempt);
            if (index > latestIndex) latestAttempt = attempt;
        }
    });
    const gradedCount = correctCount + incorrectCount + partialCount;
    return {
        attemptCount: list.length,
        correctCount,
        incorrectCount,
        gradedCount,
        accuracy: gradedCount > 0 ? correctCount / gradedCount : null,
        latestAttempt,
        lastAnsweredAt: latestAttempt?.answeredAt ?? null
    };
}

function getGlobalProblemAttemptMark(attempt) {
    return formatQuestionAttemptResult(attempt?.result);
}

function formatGlobalProblemAccuracy(summary) {
    return summary.accuracy === null ? '未挑戦' : `${Math.round(summary.accuracy * 100)}%`;
}

function getFilteredGlobalProblems() {
    const state = globalProblemsState;
    const query = String(state.query || '').trim().toLocaleLowerCase();
    let entries = state.entries.filter(entry => {
        const summary = getGlobalProblemAttemptSummary(entry.attempts);
        if (state.status === 'unattempted' && summary.attemptCount !== 0) return false;
        if (state.status === 'answered' && summary.attemptCount === 0) return false;
        if (state.status === 'latestCorrect' && summary.latestAttempt?.result !== 'correct') return false;
        if (state.status === 'latestIncorrect' && summary.latestAttempt?.result !== 'incorrect') return false;
        if (state.status === 'everIncorrect' && summary.incorrectCount === 0) return false;
        if (state.status === 'needsReview' && !entry.needsReview) return false;
        if (state.questionType !== 'all' && entry.questionType !== state.questionType) return false;
        if (state.tag !== 'all' && !entry.tags.includes(state.tag)) return false;
        if (state.sourceId !== 'all' && String(entry.articleId) !== String(state.sourceId)) return false;
        if (state.chapterId !== 'all' && entry.chapterKey !== state.chapterId) return false;
        if (state.difficulty === 'unset' && entry.difficulty !== null) return false;
        if (state.difficulty !== 'all' && state.difficulty !== 'unset' && String(entry.difficulty) !== String(state.difficulty)) return false;
        if (!query) return true;
        return [
            entry.selectedText,
            entry.question,
            entry.answer,
            entry.explanation,
            entry.memo,
            ...entry.tags,
            entry.articleTitle,
            entry.chapterTitle
        ].some(value => String(value ?? '').toLocaleLowerCase().includes(query));
    });

    const createdTimestamp = entry => getGlobalCreatedTimestamp(entry.createdAt);
    const recentTimestamp = entry => getGlobalProblemAttemptSummary(entry.attempts).lastAnsweredAt
        ? getGlobalCreatedTimestamp(getGlobalProblemAttemptSummary(entry.attempts).lastAnsweredAt)
        : 0;
    entries.sort((left, right) => {
        const leftCreated = createdTimestamp(left);
        const rightCreated = createdTimestamp(right);
        if (state.sort === 'oldest') return leftCreated - rightCreated || left.sequence - right.sequence;
        if (state.sort === 'recentAnswered') {
            const leftAnswered = recentTimestamp(left);
            const rightAnswered = recentTimestamp(right);
            if (leftAnswered === 0 && rightAnswered !== 0) return 1;
            if (leftAnswered !== 0 && rightAnswered === 0) return -1;
            return rightAnswered - leftAnswered || rightCreated - leftCreated || left.sequence - right.sequence;
        }
        if (state.sort === 'mostIncorrect') {
            const leftIncorrect = getGlobalProblemAttemptSummary(left.attempts).incorrectCount;
            const rightIncorrect = getGlobalProblemAttemptSummary(right.attempts).incorrectCount;
            return rightIncorrect - leftIncorrect || rightCreated - leftCreated || left.sequence - right.sequence;
        }
        if (state.sort === 'lowestAccuracy') {
            const leftAccuracy = getGlobalProblemAttemptSummary(left.attempts).accuracy;
            const rightAccuracy = getGlobalProblemAttemptSummary(right.attempts).accuracy;
            if (leftAccuracy === null && rightAccuracy !== null) return 1;
            if (leftAccuracy !== null && rightAccuracy === null) return -1;
            return (leftAccuracy ?? 0) - (rightAccuracy ?? 0) || rightCreated - leftCreated || left.sequence - right.sequence;
        }
        return rightCreated - leftCreated || left.sequence - right.sequence;
    });
    return entries;
}

function getGlobalProblemsStatistics(entries = globalProblemsState.entries) {
    const statistics = { total: entries.length, unattempted: 0, latestCorrect: 0, latestIncorrect: 0, needsReview: 0 };
    entries.forEach(entry => {
        const summary = getGlobalProblemAttemptSummary(entry.attempts);
        if (summary.attemptCount === 0) statistics.unattempted += 1;
        if (summary.latestAttempt?.result === 'correct') statistics.latestCorrect += 1;
        if (summary.latestAttempt?.result === 'incorrect') statistics.latestIncorrect += 1;
        if (entry.needsReview) statistics.needsReview += 1;
    });
    return statistics;
}

function appendGlobalProblemOption(select, value, label) {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = label;
    select.appendChild(option);
}

function renderGlobalProblemsControls() {
    const state = globalProblemsState;
    const tagSelect = document.getElementById('global-problems-tag');
    const sourceSelect = document.getElementById('global-problems-source');
    const chapterSelect = document.getElementById('global-problems-chapter');
    if (!tagSelect || !sourceSelect || !chapterSelect) return;

    tagSelect.innerHTML = '';
    appendGlobalProblemOption(tagSelect, 'all', 'すべてのタグ');
    const tags = Array.from(new Set(state.entries.flatMap(entry => entry.tags))).sort((left, right) => left.localeCompare(right, 'ja'));
    tags.forEach(tag => appendGlobalProblemOption(tagSelect, tag, tag));
    if (!tags.includes(state.tag)) state.tag = 'all';
    tagSelect.value = state.tag;

    sourceSelect.innerHTML = '';
    appendGlobalProblemOption(sourceSelect, 'all', 'すべての記事・書籍');
    const articles = libraryItems.filter(item => item?.type === 'article');
    articles.forEach(article => appendGlobalProblemOption(sourceSelect, article.id, getGlobalArticleTitle(article)));
    if (!articles.some(article => String(article.id) === String(state.sourceId))) state.sourceId = 'all';
    sourceSelect.value = String(state.sourceId);

    chapterSelect.innerHTML = '';
    appendGlobalProblemOption(chapterSelect, 'all', 'すべての章');
    const chapters = [];
    articles
        .filter(article => state.sourceId === 'all' || String(article.id) === String(state.sourceId))
        .forEach(article => getArticleChapters(article).forEach(chapter => {
            const chapterKey = `${String(article.id)}::${String(chapter.id)}`;
            if (!chapters.some(item => item.key === chapterKey)) chapters.push({ key: chapterKey, title: `${getGlobalArticleTitle(article)} / ${chapter.title}` });
        }));
    chapters.forEach(chapter => appendGlobalProblemOption(chapterSelect, chapter.key, chapter.title));
    if (!chapters.some(chapter => chapter.key === state.chapterId)) state.chapterId = 'all';
    chapterSelect.value = state.chapterId;

    const query = document.getElementById('global-problems-search');
    const status = document.getElementById('global-problems-status');
    const type = document.getElementById('global-problems-type');
    const difficulty = document.getElementById('global-problems-difficulty');
    const sort = document.getElementById('global-problems-sort');
    if (query) query.value = state.query;
    if (status) status.value = state.status;
    if (type) type.value = state.questionType;
    if (difficulty) difficulty.value = state.difficulty;
    if (sort) sort.value = state.sort;
}

function appendGlobalProblemDetail(container, label, value) {
    const row = document.createElement('div');
    row.className = 'global-problem-detail-row';
    const labelElement = document.createElement('span');
    labelElement.className = 'global-problem-detail-label';
    labelElement.textContent = label;
    const valueElement = document.createElement('span');
    valueElement.className = 'global-problem-detail-value';
    valueElement.textContent = String(value ?? '');
    row.append(labelElement, valueElement);
    container.appendChild(row);
}

function getVocabularyPartOfSpeechLabel(value) {
    const labels = {
        noun: '名詞',
        verb: '動詞',
        adjective: '形容詞',
        adverb: '副詞',
        phrase: '句・フレーズ',
        preposition: '前置詞',
        conjunction: '接続詞',
        other: 'その他'
    };
    return labels[value] || '';
}

function createGlobalProblemReveal(container, entry, field, label, stateSet) {
    const group = document.createElement('div');
    group.className = 'global-problem-reveal-group';
    const button = document.createElement('button');
    button.type = 'button';
    const value = document.createElement('div');
    value.className = 'global-problem-hidden-value';
    const revealed = stateSet.has(entry.key);
    button.textContent = revealed ? `${label}を隠す` : `${label}を見る`;
    value.textContent = entry[field];
    value.hidden = !revealed;
    button.onclick = event => {
        event.stopPropagation();
        if (stateSet.has(entry.key)) stateSet.delete(entry.key);
        else stateSet.add(entry.key);
        renderGlobalProblems();
    };
    group.append(button, value);
    container.appendChild(group);
}

function createGlobalProblemHistory(container, entry, summary) {
    const historyButton = document.createElement('button');
    historyButton.type = 'button';
    historyButton.className = 'small-btn';
    const expanded = globalProblemsState.historyExpandedKeys.has(entry.key);
    historyButton.textContent = expanded ? '履歴を隠す' : `履歴を見る（${summary.attemptCount}回）`;
    historyButton.onclick = event => {
        event.stopPropagation();
        if (expanded) globalProblemsState.historyExpandedKeys.delete(entry.key);
        else globalProblemsState.historyExpandedKeys.add(entry.key);
        renderGlobalProblems();
    };
    container.appendChild(historyButton);
    if (!expanded) return;

    const history = document.createElement('div');
    history.className = 'global-problem-history';
    const attempts = [...entry.attempts].sort((left, right) => getGlobalCreatedTimestamp(right?.answeredAt) - getGlobalCreatedTimestamp(left?.answeredAt));
    attempts.forEach(attempt => {
        const item = document.createElement('div');
        item.className = 'global-problem-history-item';
        const result = document.createElement('strong');
        result.textContent = `${formatGlobalVocabularyDate(attempt?.answeredAt) || '日時不明'} ${getGlobalProblemAttemptMark(attempt)}`;
        const answer = document.createElement('span');
        answer.textContent = `自分の回答：${String(attempt?.userAnswer || '（未入力）')}`;
        item.append(result, answer);
        history.appendChild(item);
    });
    container.appendChild(history);
}

function createGlobalProblemCard(entry) {
    const summary = getGlobalProblemAttemptSummary(entry.attempts);
    const card = document.createElement('article');
    const expanded = globalProblemsState.expandedKey === entry.key;
    card.className = `global-problem-card${expanded ? ' is-expanded' : ''}`;
    card.setAttribute('aria-expanded', String(expanded));
    card.addEventListener('click', event => {
        if (event.target.closest('button, input, select, textarea, a')) return;
        globalProblemsState.expandedKey = expanded ? null : entry.key;
        renderGlobalProblems();
    });

    const meta = document.createElement('div');
    meta.className = 'global-problem-meta';
    const type = document.createElement('span');
    type.className = 'global-problem-chip';
    type.textContent = getQuestionTypeLabel(entry.questionType);
    meta.appendChild(type);
    entry.tags.forEach(tag => {
        const tagElement = document.createElement('span');
        tagElement.className = 'global-problem-chip';
        tagElement.textContent = `#${tag}`;
        meta.appendChild(tagElement);
    });
    const reviewButton = document.createElement('button');
    reviewButton.type = 'button';
    reviewButton.className = 'global-problem-review';
    reviewButton.textContent = entry.needsReview ? '★ 要復習' : '☆ 要復習';
    reviewButton.title = entry.needsReview ? '要復習を解除' : '要復習にする';
    reviewButton.onclick = event => void toggleGlobalProblemNeedsReview(entry.key, event);
    meta.appendChild(reviewButton);
    card.appendChild(meta);

    const selected = document.createElement('div');
    selected.className = 'global-problem-selected';
    selected.textContent = entry.selectedText || '選択テキストなし';
    card.appendChild(selected);
    const question = document.createElement('div');
    question.className = 'global-problem-question';
    question.textContent = entry.question || '問題文なし';
    card.appendChild(question);

    const source = document.createElement('div');
    source.className = 'global-problem-source';
    source.textContent = `${entry.articleTitle}${entry.chapterTitle ? ` / ${entry.chapterTitle}` : ''}`;
    card.appendChild(source);

    const progress = document.createElement('div');
    progress.className = 'global-problem-progress';
    progress.textContent = `${summary.attemptCount}回 | ○${summary.correctCount} ×${summary.incorrectCount} | ${formatGlobalProblemAccuracy(summary)} | 最新 ${summary.latestAttempt ? getGlobalProblemAttemptMark(summary.latestAttempt) : '－'}${summary.lastAnsweredAt ? ` ${formatGlobalVocabularyDate(summary.lastAnsweredAt)}` : ''}`;
    card.appendChild(progress);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'global-problem-expand-toggle';
    toggle.textContent = expanded ? '詳細を隠す' : '詳細を見る';
    toggle.onclick = event => {
        event.stopPropagation();
        globalProblemsState.expandedKey = expanded ? null : entry.key;
        renderGlobalProblems();
    };
    card.appendChild(toggle);

    if (!expanded) return card;

    const details = document.createElement('div');
    details.className = 'global-problem-details';
    appendGlobalProblemDetail(details, '問題種類', getQuestionTypeLabel(entry.questionType));
    appendGlobalProblemDetail(details, 'タグ', entry.tags.join(', '));
    appendGlobalProblemDetail(details, '難易度', entry.difficulty === null ? '未設定' : entry.difficulty);
    appendGlobalProblemDetail(details, '選択範囲', entry.selectedText);
    createGlobalProblemReveal(details, entry, 'answer', '回答', globalProblemsState.answerExpandedKeys);
    createGlobalProblemReveal(details, entry, 'explanation', '解説', globalProblemsState.explanationExpandedKeys);
    createGlobalProblemReveal(details, entry, 'memo', 'メモ', globalProblemsState.memoExpandedKeys);
    createGlobalProblemHistory(details, entry, summary);

    const actions = document.createElement('div');
    actions.className = 'global-problem-actions';
    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'small-btn';
    openButton.textContent = '本文で開く';
    openButton.onclick = event => {
        event.stopPropagation();
        openGlobalProblemEntry(entry.key);
    };
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.className = 'small-btn';
    editButton.textContent = '編集';
    editButton.onclick = event => {
        event.stopPropagation();
        openGlobalProblemEditor(entry.key);
    };
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'small-btn del';
    deleteButton.textContent = '削除';
    deleteButton.onclick = event => {
        event.stopPropagation();
        void deleteGlobalProblem(entry.key);
    };
    actions.append(openButton, editButton, deleteButton);
    details.appendChild(actions);
    card.appendChild(details);
    return card;
}

function renderGlobalProblems() {
    const container = document.getElementById('global-problems-list');
    if (!container) return;
    renderGlobalProblemsControls();
    const entries = getFilteredGlobalProblems();
    const total = globalProblemsState.entries.length;
    const count = document.getElementById('global-problems-count');
    if (count) count.textContent = entries.length === total ? `${total.toLocaleString()} problems` : `${entries.length.toLocaleString()} / ${total.toLocaleString()} problems`;
    const statistics = getGlobalProblemsStatistics(entries);
    const statisticsTarget = document.getElementById('global-problems-statistics');
    if (statisticsTarget) statisticsTarget.textContent = `未挑戦 ${statistics.unattempted} | 最新○ ${statistics.latestCorrect} | 最新× ${statistics.latestIncorrect} | 要復習 ${statistics.needsReview}`;
    container.innerHTML = '';
    if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'global-problems-empty';
        empty.textContent = total === 0 ? '登録された問題はありません。' : '条件に一致する問題はありません。';
        container.appendChild(empty);
        return;
    }
    entries.forEach(entry => container.appendChild(createGlobalProblemCard(entry)));
}

function showGlobalProblems() {
    flushReadingPositionSave();
    hideAllSections();
    document.getElementById('side-panel')?.classList.remove('is-open');
    document.getElementById('add-btn').style.display = 'none';
    document.getElementById('fab-toggle').style.display = 'none';
    const section = document.getElementById('problems-section');
    if (!section) return;
    section.style.display = 'block';
    globalProblemsState.entries = collectGlobalProblems();
    renderGlobalProblems();
}

function updateGlobalProblems(field, value) {
    if (field === 'query') globalProblemsState.query = String(value || '');
    if (field === 'status') globalProblemsState.status = value;
    if (field === 'questionType') globalProblemsState.questionType = value;
    if (field === 'tag') globalProblemsState.tag = value;
    if (field === 'sourceId') {
        globalProblemsState.sourceId = value;
        globalProblemsState.chapterId = 'all';
    }
    if (field === 'chapterId') globalProblemsState.chapterId = value;
    if (field === 'difficulty') globalProblemsState.difficulty = value;
    if (field === 'sort') globalProblemsState.sort = value;
    renderGlobalProblems();
}

async function toggleGlobalProblemNeedsReview(key, event) {
    event?.stopPropagation();
    const entry = findGlobalProblemEntry(key);
    const source = getGlobalProblemEntrySource(entry);
    if (!source) return;
    source.question.needsReview = !getQuestionRuntimeMetadata(source.question).needsReview;
    source.question.updatedAt = Date.now();
    await saveToDB();
    globalProblemsState.entries = collectGlobalProblems();
    renderGlobalProblems();
}

function openGlobalProblemEditor(key) {
    const entry = findGlobalProblemEntry(key);
    const source = getGlobalProblemEntrySource(entry);
    if (!entry || !source) return;
    globalVocabularyEditRef = null;
    globalProblemEditRef = {
        articleId: source.article.id,
        questionId: entry.questionId,
        sourceIndex: entry.sourceIndex
    };
    editingId = source.question.id;
    editingSourceIndex = source.index;
    switchModalType('question');
    setQuestionFormValues(source.question);
    showUnifiedModal();
}

async function deleteGlobalProblem(key) {
    const entry = findGlobalProblemEntry(key);
    const source = getGlobalProblemEntrySource(entry);
    if (!source || !confirm('この問題を削除しますか？本文は削除されません。')) return;
    source.article.questions.splice(source.index, 1);
    await saveToDB();
    globalProblemsState.expandedKey = null;
    globalProblemsState.historyExpandedKeys.delete(key);
    globalProblemsState.answerExpandedKeys.delete(key);
    globalProblemsState.explanationExpandedKeys.delete(key);
    globalProblemsState.memoExpandedKeys.delete(key);
    globalProblemsState.entries = collectGlobalProblems();
    renderGlobalProblems();
}

function flashGlobalProblemAnchor(resolution, question) {
    const display = document.getElementById('text-display');
    const paragraph = display?.querySelector(`p[data-paragraph-index="${resolution.paragraphIndex}"]`);
    if (!paragraph) return false;
    paragraph.classList.add('temporary-reader-anchor');
    const questionId = question?.id;
    const target = Array.from(paragraph.querySelectorAll('[data-question-id]')).find(element =>
        String(element.dataset.questionId) === String(questionId));
    const highlight = target || paragraph;
    highlight.classList.add('temporary-reader-highlight');
    paragraph.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
        paragraph.classList.remove('temporary-reader-anchor');
        highlight.classList.remove('temporary-reader-highlight');
    }, 2500);
    return true;
}

function openGlobalProblemEntry(key) {
    const entry = findGlobalProblemEntry(key);
    const source = getGlobalProblemEntrySource(entry);
    if (!entry || !source) return;
    openArticle(entry.articleId);
    setTimeout(async () => {
        if (!currentArticle || !globalIdsEqual(currentArticle.id, entry.articleId)) return;
        if (entry.chapterId && entry.chapterId !== 'legacy-main' && hasStoredChapters(currentArticle)) await switchToChapter(entry.chapterId);
        const paragraphs = getReaderParagraphs(getCurrentChapterContent());
        const anchor = source.question.anchor && typeof source.question.anchor === 'object'
            ? { ...source.question.anchor, selectedText: source.question.anchor.selectedText || entry.selectedText }
            : { selectedText: entry.selectedText };
        const resolution = findAnchorInParagraphs(paragraphs, anchor, source.question.context);
        if (resolution && flashGlobalProblemAnchor(resolution, source.question)) return;
        const position = getGlobalWordPosition(source.question);
        if (position) restoreReadingPosition(position);
        const display = document.getElementById('text-display');
        const target = display
            ? Array.from(display.querySelectorAll('[data-question-id]')).find(element => String(element.dataset.questionId) === String(entry.questionId))
            : null;
        if (target) {
            target.classList.add('temporary-reader-highlight');
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => target.classList.remove('temporary-reader-highlight'), 2500);
        }
    }, 120);
}
