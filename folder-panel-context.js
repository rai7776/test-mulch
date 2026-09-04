(function () {
    'use strict';

    const state = {
        folderId: null,
        rendering: false
    };

    const originalShowLibrary = typeof showLibrary === 'function' ? showLibrary : null;
    const originalOpenArticle = typeof openArticle === 'function' ? openArticle : null;
    const originalTogglePanel = typeof togglePanel === 'function' ? togglePanel : null;
    const originalRenderList = typeof renderList === 'function' ? renderList : null;

    function idKey(value) {
        return value === null || value === undefined ? '' : String(value);
    }

    function getLibraryItems() {
        try { return Array.isArray(libraryItems) ? libraryItems : []; }
        catch (_) { return []; }
    }

    function getFolder(folderId) {
        return getLibraryItems().find(item => item && item.type === 'folder' && idKey(item.id) === idKey(folderId)) || null;
    }

    function getFolderArticles(folderId) {
        if (folderId === null || folderId === undefined) return [];
        const items = getLibraryItems();
        const folderIds = new Set([idKey(folderId)]);
        let changed = true;
        while (changed) {
            changed = false;
            items.forEach(item => {
                if (!item || item.type !== 'folder') return;
                const parent = idKey(item.parentId);
                const key = idKey(item.id);
                if (folderIds.has(parent) && !folderIds.has(key)) {
                    folderIds.add(key);
                    changed = true;
                }
            });
        }
        return items.filter(item => item && item.type === 'article' && folderIds.has(idKey(item.parentId)));
    }

    function getFolderCounts(folderId) {
        const articles = getFolderArticles(folderId);
        return {
            articles,
            words: articles.reduce((sum, article) => sum + (Array.isArray(article.words) ? article.words.length : 0), 0),
            notes: articles.reduce((sum, article) => sum + (Array.isArray(article.notes) ? article.notes.length : 0), 0),
            questions: articles.reduce((sum, article) => sum + (Array.isArray(article.questions) ? article.questions.length : 0), 0)
        };
    }

    function chapterInfo(article, item) {
        const chapterId = item?.chapterId === undefined || item?.chapterId === null || item?.chapterId === ''
            ? null
            : String(item.chapterId);
        if (chapterId === null) return { id: null, title: '章未設定' };
        const chapters = Array.isArray(article?.chapters) ? article.chapters : [];
        const chapter = chapters.find(entry => String(entry?.id) === chapterId);
        return { id: chapterId, title: String(chapter?.title || '章未設定') };
    }

    function makeStudyEntry(article, word, sourceIndex) {
        const chapter = chapterInfo(article, word);
        const hasId = word?.id !== undefined && word?.id !== null && String(word.id) !== '';
        return {
            key: hasId
                ? `${String(article.id)}::id::${String(word.id)}`
                : `${String(article.id)}::index::${String(sourceIndex)}`,
            article,
            articleId: article.id,
            articleTitle: String(article.name || '無題'),
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            word,
            sourceIndex
        };
    }

    function getFolderStudyEntries(folderId) {
        return getFolderArticles(folderId).flatMap(article =>
            (Array.isArray(article.words) ? article.words : [])
                .map((word, sourceIndex) => word ? makeStudyEntry(article, word, sourceIndex) : null)
                .filter(Boolean)
        );
    }

    function isLibraryVisible() {
        const section = document.getElementById('library-section');
        return !!section && getComputedStyle(section).display !== 'none';
    }

    function isFolderContextActive() {
        return state.folderId !== null && state.folderId !== undefined && isLibraryVisible();
    }

    function removeVocabularyButtons() {
        document.querySelectorAll('#library-list .card-actions button').forEach(button => {
            if (String(button.textContent || '').trim().toLowerCase() === 'vocabulary') button.remove();
        });
    }

    function ensurePanelContextLabel() {
        let label = document.getElementById('folder-panel-context-label');
        if (label) return label;
        const search = document.getElementById('list-search-controls');
        if (!search) return null;
        label = document.createElement('div');
        label.id = 'folder-panel-context-label';
        label.className = 'folder-panel-context-label';
        label.hidden = true;
        search.insertAdjacentElement('beforebegin', label);
        return label;
    }

    function ensureFolderStudyBar() {
        let bar = document.getElementById('folder-study-bar');
        if (bar) return bar;
        const list = document.getElementById('library-list');
        if (!list) return null;
        bar = document.createElement('section');
        bar.id = 'folder-study-bar';
        bar.className = 'folder-study-bar';
        bar.hidden = true;
        bar.innerHTML = `
            <button type="button" id="folder-study-button">
                <span aria-hidden="true">🎴</span>
                <span class="folder-study-label">このフォルダの単語を学習</span>
                <strong id="folder-study-count">0</strong>
            </button>
        `;
        list.insertAdjacentElement('beforebegin', bar);
        bar.querySelector('#folder-study-button')?.addEventListener('click', () => {
            if (!isFolderContextActive()) return;
            const entries = getFolderStudyEntries(state.folderId);
            if (!entries.length) return;
            const folder = getFolder(state.folderId);
            if (window.SmartReaderStudy?.open) {
                window.SmartReaderStudy.open(entries, `このフォルダ · ${folder?.name || 'フォルダ'}`);
            }
        });
        return bar;
    }

    function bindArticleContext(group, article) {
        const activate = () => {
            try { currentArticle = article; }
            catch (_) {}
        };
        ['pointerdown', 'click', 'change', 'input', 'keydown'].forEach(type => {
            group.addEventListener(type, activate, true);
        });
    }

    function addSourceHeading(group, article, count) {
        const heading = document.createElement('div');
        heading.className = 'folder-panel-source-heading';
        const title = document.createElement('strong');
        title.textContent = article?.name || '無題';
        const badge = document.createElement('span');
        badge.textContent = `${count}件`;
        heading.append(title, badge);
        group.appendChild(heading);
    }

    function withArticleWithoutChapterScope(article, callback) {
        const hadOwnChapters = Object.prototype.hasOwnProperty.call(article, 'chapters');
        const chapters = article.chapters;
        try {
            article.chapters = null;
            return callback();
        } finally {
            if (hadOwnChapters) article.chapters = chapters;
            else delete article.chapters;
        }
    }

    function updateFolderPanelMeta(type, articles) {
        const folder = getFolder(state.folderId);
        const counts = getFolderCounts(state.folderId);
        const label = ensurePanelContextLabel();
        if (label) {
            const noun = type === 'notes' ? 'ノート' : type === 'questions' ? '問題' : '単語';
            const value = type === 'notes' ? counts.notes : type === 'questions' ? counts.questions : counts.words;
            label.hidden = false;
            label.innerHTML = `<strong>📁 ${escapeHtml(folder?.name || 'フォルダ')}</strong><span>${articles.length}記事 · ${noun} ${value}</span>`;
        }
        const stats = document.getElementById('article-vocabulary-statistics');
        if (stats) {
            if (type === 'words') {
                const allWords = articles.flatMap(article => Array.isArray(article.words) ? article.words : []);
                const unique = new Set(allWords.map(word => String(word?.word || '').trim().toLowerCase()).filter(Boolean)).size;
                const memorized = allWords.filter(word => !!word?.memorized).length;
                stats.textContent = `${allWords.length} words · ${unique} unique · ${memorized} memorized`;
            } else {
                stats.textContent = '';
            }
        }
    }

    function renderFolderList(type, filter = '') {
        if (!originalRenderList || state.rendering) return;
        const container = document.getElementById('panel-content');
        if (!container) return;
        const articles = getFolderArticles(state.folderId);
        const previousArticle = (() => {
            try { return currentArticle; }
            catch (_) { return null; }
        })();

        state.rendering = true;
        try {
            const panel = document.getElementById('side-panel');
            panel?.classList.add('folder-panel-mode');
            const chapterScope = document.getElementById('chapter-scope-controls');
            if (chapterScope) chapterScope.hidden = true;

            if (type === 'settings') {
                const fallback = articles[0] || previousArticle;
                if (fallback) {
                    currentArticle = fallback;
                    originalRenderList(type, filter);
                } else {
                    container.innerHTML = '<div class="folder-panel-empty">設定を表示できません。</div>';
                }
                ensurePanelContextLabel()?.setAttribute('hidden', '');
                return;
            }

            const fragment = document.createDocumentFragment();
            let visibleGroups = 0;

            articles.forEach(article => {
                ensureArticleCollections?.(article);
                currentArticle = article;
                withArticleWithoutChapterScope(article, () => originalRenderList(type, filter));
                const nodes = Array.from(container.children);
                if (!nodes.length) return;

                const group = document.createElement('section');
                group.className = 'folder-panel-source-group';
                group.dataset.articleId = String(article.id);
                bindArticleContext(group, article);
                addSourceHeading(group, article, nodes.length);
                nodes.forEach(node => group.appendChild(node));
                fragment.appendChild(group);
                visibleGroups += 1;
            });

            container.innerHTML = '';
            if (visibleGroups) {
                container.appendChild(fragment);
            } else {
                const empty = document.createElement('div');
                empty.className = 'folder-panel-empty';
                empty.textContent = filter ? '検索条件に一致するデータはありません。' : 'このフォルダにデータはありません。';
                container.appendChild(empty);
            }

            updateFolderPanelMeta(type, articles);
        } finally {
            try { currentArticle = previousArticle; }
            catch (_) {}
            state.rendering = false;
        }
    }

    function refreshFolderLibraryUi() {
        removeVocabularyButtons();
        const active = isFolderContextActive();
        const panel = document.getElementById('side-panel');
        panel?.classList.toggle('folder-panel-mode', active);

        const bar = ensureFolderStudyBar();
        const today = document.getElementById('study-today-card');
        if (!active) {
            if (bar) bar.hidden = true;
            if (today) today.hidden = false;
            const label = ensurePanelContextLabel();
            if (label) label.hidden = true;
            return;
        }

        const folder = getFolder(state.folderId);
        const counts = getFolderCounts(state.folderId);
        if (bar) {
            bar.hidden = false;
            const button = bar.querySelector('#folder-study-button');
            const count = bar.querySelector('#folder-study-count');
            const label = bar.querySelector('.folder-study-label');
            if (count) count.textContent = String(counts.words);
            if (label) label.textContent = `このフォルダの単語を学習`;
            if (button) {
                button.disabled = counts.words === 0;
                button.setAttribute('aria-label', `${folder?.name || 'このフォルダ'}の単語 ${counts.words}語を学習`);
            }
        }
        if (today) today.hidden = true;
    }

    function syncFolderContextFromLibrary() {
        try {
            state.folderId = currentFolderId === null || currentFolderId === undefined ? null : currentFolderId;
        } catch (_) {
            state.folderId = null;
        }
        refreshFolderLibraryUi();
        window.setTimeout(refreshFolderLibraryUi, 0);
        window.setTimeout(refreshFolderLibraryUi, 40);
    }

    function wrappedShowLibrary() {
        const result = originalShowLibrary ? originalShowLibrary.apply(this, arguments) : undefined;
        syncFolderContextFromLibrary();
        return result;
    }

    function wrappedOpenArticle() {
        state.folderId = null;
        document.getElementById('side-panel')?.classList.remove('folder-panel-mode');
        const label = ensurePanelContextLabel();
        if (label) label.hidden = true;
        return originalOpenArticle ? originalOpenArticle.apply(this, arguments) : undefined;
    }

    function wrappedTogglePanel() {
        const panel = document.getElementById('side-panel');
        const wasOpen = !!panel?.classList.contains('is-open');
        const result = originalTogglePanel ? originalTogglePanel.apply(this, arguments) : undefined;
        const opening = !wasOpen && !!panel?.classList.contains('is-open');
        if (opening && isFolderContextActive()) {
            renderFolderList(currentTab || 'words', document.getElementById('list-search')?.value || '');
        }
        return result;
    }

    function wrappedRenderList(type, filter = '') {
        if (isFolderContextActive()) {
            renderFolderList(type, filter);
            return;
        }
        document.getElementById('side-panel')?.classList.remove('folder-panel-mode');
        const label = ensurePanelContextLabel();
        if (label) label.hidden = true;
        return originalRenderList ? originalRenderList.apply(this, arguments) : undefined;
    }

    function injectStyles() {
        if (document.getElementById('folder-panel-context-style')) return;
        const style = document.createElement('style');
        style.id = 'folder-panel-context-style';
        style.textContent = `
            .folder-study-bar{margin:10px 0 14px}.folder-study-bar[hidden]{display:none!important}.folder-study-bar button{width:100%;min-height:48px;display:flex;align-items:center;justify-content:center;gap:9px;padding:9px 14px;border:1px solid var(--primary,#8d5a2b);border-radius:12px;background:var(--primary,#8d5a2b);color:#fff;font-weight:800;font-size:.95rem}.folder-study-bar button:disabled{opacity:.45}.folder-study-bar strong{min-width:28px;padding:2px 7px;border-radius:999px;background:rgba(255,255,255,.2)}
            .folder-panel-context-label{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 11px;border-bottom:1px solid #eee5dc;background:#faf7f3;color:#6d5f52;font-size:.78rem}.folder-panel-context-label[hidden]{display:none!important}.folder-panel-context-label strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.folder-panel-context-label span{flex:0 0 auto;color:#8b7d70;font-size:.72rem}
            .folder-panel-source-group{margin:0 0 12px;padding:0 0 4px;border:1px solid #e7ded5;border-radius:11px;background:#fff;overflow:hidden}.folder-panel-source-heading{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:#f8f4ef;border-bottom:1px solid #e9e0d7;color:#655548;font-size:.8rem}.folder-panel-source-heading strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.folder-panel-source-heading span{flex:0 0 auto;padding:2px 7px;border-radius:999px;background:#ebe1d7;color:#786653;font-size:.68rem}.folder-panel-source-group>.note-card,.folder-panel-source-group>.note-block-card,.folder-panel-source-group>.question-card{margin:7px!important}.folder-panel-empty{padding:28px 14px;text-align:center;color:#8a8076;font-size:.86rem}
            #side-panel.folder-panel-mode #chapter-scope-controls,#side-panel.folder-panel-mode #sidebar-study-controls{display:none!important}#side-panel.folder-panel-mode #list-search-controls .btn-export{display:none!important}
            @media(max-width:700px){.folder-study-bar{margin:8px 0 11px}.folder-study-bar button{min-height:44px;border-radius:10px;font-size:.88rem}.folder-panel-context-label{padding:6px 9px;font-size:.74rem}.folder-panel-source-group{margin-bottom:9px;border-radius:9px}.folder-panel-source-heading{padding:7px 9px}.folder-panel-source-group>.note-card,.folder-panel-source-group>.note-block-card,.folder-panel-source-group>.question-card{margin:6px!important}}
        `;
        document.head.appendChild(style);
    }

    function init() {
        injectStyles();
        ensurePanelContextLabel();
        ensureFolderStudyBar();

        try { showLibrary = wrappedShowLibrary; } catch (_) {}
        try { openArticle = wrappedOpenArticle; } catch (_) {}
        try { togglePanel = wrappedTogglePanel; } catch (_) {}
        try { renderList = wrappedRenderList; } catch (_) {}
        window.showLibrary = wrappedShowLibrary;
        window.openArticle = wrappedOpenArticle;
        window.togglePanel = wrappedTogglePanel;
        window.renderList = wrappedRenderList;

        if (isLibraryVisible()) syncFolderContextFromLibrary();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
