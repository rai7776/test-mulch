(function () {
    'use strict';

    const originalRenderGlobalVocabularyControls = renderGlobalVocabularyControls;
    const originalGetFilteredGlobalVocabulary = getFilteredGlobalVocabulary;
    const originalUpdateGlobalVocabulary = updateGlobalVocabulary;

    function globalSourceId(value) {
        return String(value);
    }

    function getGlobalSourceArticles() {
        return libraryItems.filter(item => item && item.type === 'article');
    }

    function getAllGlobalSourceArticleIds() {
        return getGlobalSourceArticles().map(article => globalSourceId(article.id));
    }

    function ensureGlobalSourceSelectionState() {
        if (Object.prototype.hasOwnProperty.call(globalVocabularyState, 'selectedArticleIds')) return;
        if (globalVocabularyState.sourceId && globalVocabularyState.sourceId !== 'all') {
            globalVocabularyState.selectedArticleIds = new Set([globalSourceId(globalVocabularyState.sourceId)]);
        } else {
            globalVocabularyState.selectedArticleIds = null;
        }
        globalVocabularyState.sourceId = 'all';
    }

    function normalizeSelectedArticleIds() {
        ensureGlobalSourceSelectionState();
        const allIds = new Set(getAllGlobalSourceArticleIds());
        const selection = globalVocabularyState.selectedArticleIds;
        if (selection === null) return;

        const normalized = new Set(
            Array.from(selection || [], globalSourceId).filter(id => allIds.has(id))
        );
        if (allIds.size > 0 && normalized.size === allIds.size) {
            globalVocabularyState.selectedArticleIds = null;
        } else {
            globalVocabularyState.selectedArticleIds = normalized;
        }
    }

    function getSelectedArticleIdSet() {
        normalizeSelectedArticleIds();
        if (globalVocabularyState.selectedArticleIds === null) return null;
        return new Set(globalVocabularyState.selectedArticleIds);
    }

    function getEffectiveSelectedArticleIds() {
        const selection = getSelectedArticleIdSet();
        return selection === null ? getAllGlobalSourceArticleIds() : Array.from(selection);
    }

    function setSelectedArticleIds(ids) {
        const allIds = getAllGlobalSourceArticleIds();
        const validIds = new Set(allIds);
        const next = new Set(Array.from(ids || [], globalSourceId).filter(id => validIds.has(id)));
        globalVocabularyState.selectedArticleIds = allIds.length > 0 && next.size === allIds.length
            ? null
            : next;
        globalVocabularyState.sourceId = 'all';
        globalVocabularyState.chapterId = 'all';
    }

    function materializeSelection() {
        const selected = getSelectedArticleIdSet();
        return selected === null ? new Set(getAllGlobalSourceArticleIds()) : selected;
    }

    function idsEqualNullable(left, right) {
        if (left === null || left === undefined || left === '') {
            return right === null || right === undefined || right === '';
        }
        return String(left) === String(right);
    }

    function getDirectChildren(parentId) {
        return libraryItems.filter(item => item && idsEqualNullable(item.parentId, parentId));
    }

    function getDescendantArticleIds(folderId) {
        const result = new Set();
        const visitedFolders = new Set();

        function visit(parentId) {
            const parentKey = globalSourceId(parentId);
            if (visitedFolders.has(parentKey)) return;
            visitedFolders.add(parentKey);

            getDirectChildren(parentId).forEach(item => {
                if (item.type === 'article') {
                    result.add(globalSourceId(item.id));
                } else if (item.type === 'folder') {
                    visit(item.id);
                }
            });
        }

        visit(folderId);
        return result;
    }

    function getFolderSelectionState(folderId, selectedSet) {
        const articleIds = Array.from(getDescendantArticleIds(folderId));
        if (!articleIds.length) return { checked: false, indeterminate: false, count: 0 };
        const selectedCount = articleIds.filter(id => selectedSet.has(id)).length;
        return {
            checked: selectedCount === articleIds.length,
            indeterminate: selectedCount > 0 && selectedCount < articleIds.length,
            count: articleIds.length
        };
    }

    function toggleArticleSelection(articleId) {
        const selection = materializeSelection();
        const id = globalSourceId(articleId);
        if (selection.has(id)) selection.delete(id);
        else selection.add(id);
        setSelectedArticleIds(selection);
        renderGlobalVocabulary();
    }

    function toggleFolderSelection(folderId) {
        const selection = materializeSelection();
        const descendantIds = Array.from(getDescendantArticleIds(folderId));
        const allSelected = descendantIds.length > 0 && descendantIds.every(id => selection.has(id));
        descendantIds.forEach(id => {
            if (allSelected) selection.delete(id);
            else selection.add(id);
        });
        setSelectedArticleIds(selection);
        renderGlobalVocabulary();
    }

    function selectAllGlobalSources() {
        globalVocabularyState.selectedArticleIds = null;
        globalVocabularyState.sourceId = 'all';
        globalVocabularyState.chapterId = 'all';
        renderGlobalVocabulary();
    }

    function clearAllGlobalSources() {
        setSelectedArticleIds([]);
        renderGlobalVocabulary();
    }

    function getSelectionLabel() {
        const allArticles = getGlobalSourceArticles();
        const selectedIds = getEffectiveSelectedArticleIds();
        const selectedSet = new Set(selectedIds);
        if (globalVocabularyState.selectedArticleIds === null) return '出典: すべて';
        if (!selectedIds.length) return '出典: 0件';
        if (selectedIds.length === 1) {
            const article = allArticles.find(item => selectedSet.has(globalSourceId(item.id)));
            return article ? `出典: ${getGlobalArticleTitle(article)}` : '出典: 1件';
        }
        return `出典: ${selectedIds.length}件の記事`;
    }

    function createSourceTreeRow(item, depth, selectedSet) {
        const row = document.createElement('label');
        row.className = `global-vocab-source-row global-vocab-source-${item.type}`;
        row.style.setProperty('--source-depth', String(depth));

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';

        const label = document.createElement('span');
        label.className = 'global-vocab-source-name';

        if (item.type === 'folder') {
            const state = getFolderSelectionState(item.id, selectedSet);
            checkbox.checked = state.checked;
            checkbox.indeterminate = state.indeterminate;
            checkbox.disabled = state.count === 0;
            checkbox.onchange = () => toggleFolderSelection(item.id);
            label.textContent = `📁 ${item.name || '無題フォルダ'}`;
        } else {
            const id = globalSourceId(item.id);
            checkbox.checked = selectedSet.has(id);
            checkbox.onchange = () => toggleArticleSelection(id);
            label.textContent = `📄 ${getGlobalArticleTitle(item)}`;
        }

        row.append(checkbox, label);
        return row;
    }

    function appendSourceTree(container, parentId, depth, selectedSet, visitedFolders) {
        const children = getDirectChildren(parentId).slice().sort((left, right) => {
            if (left.type !== right.type) return left.type === 'folder' ? -1 : 1;
            return String(left.name || '').localeCompare(String(right.name || ''), 'ja');
        });

        children.forEach(item => {
            container.appendChild(createSourceTreeRow(item, depth, selectedSet));
            if (item.type !== 'folder') return;
            const key = globalSourceId(item.id);
            if (visitedFolders.has(key)) return;
            visitedFolders.add(key);
            appendSourceTree(container, item.id, depth + 1, selectedSet, visitedFolders);
        });
    }

    function renderSourcePickerMenu() {
        const menu = document.getElementById('global-vocab-source-picker-menu');
        if (!menu) return;
        const wasOpen = !menu.hidden;
        menu.innerHTML = '';

        const toolbar = document.createElement('div');
        toolbar.className = 'global-vocab-source-toolbar';

        const allButton = document.createElement('button');
        allButton.type = 'button';
        allButton.textContent = 'すべて選択';
        allButton.onclick = selectAllGlobalSources;

        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.textContent = '選択解除';
        clearButton.onclick = clearAllGlobalSources;

        toolbar.append(allButton, clearButton);
        menu.appendChild(toolbar);

        const tree = document.createElement('div');
        tree.className = 'global-vocab-source-tree';
        const selectedSet = new Set(getEffectiveSelectedArticleIds());
        appendSourceTree(tree, null, 0, selectedSet, new Set());
        menu.appendChild(tree);
        menu.hidden = !wasOpen;
    }

    function ensureSourcePicker(sourceSelect) {
        let picker = document.getElementById('global-vocab-source-picker');
        if (!picker) {
            picker = document.createElement('div');
            picker.id = 'global-vocab-source-picker';
            picker.className = 'global-vocab-source-picker';

            const button = document.createElement('button');
            button.id = 'global-vocab-source-picker-button';
            button.type = 'button';
            button.className = 'global-vocab-source-picker-button';
            button.setAttribute('aria-haspopup', 'true');
            button.setAttribute('aria-expanded', 'false');
            button.onclick = event => {
                event.stopPropagation();
                const menu = document.getElementById('global-vocab-source-picker-menu');
                if (!menu) return;
                menu.hidden = !menu.hidden;
                button.setAttribute('aria-expanded', String(!menu.hidden));
            };

            const menu = document.createElement('div');
            menu.id = 'global-vocab-source-picker-menu';
            menu.className = 'global-vocab-source-picker-menu';
            menu.hidden = true;
            menu.onclick = event => event.stopPropagation();

            picker.append(button, menu);
            sourceSelect.parentNode.insertBefore(picker, sourceSelect);
        }

        sourceSelect.style.display = 'none';
        const button = document.getElementById('global-vocab-source-picker-button');
        if (button) button.textContent = getSelectionLabel();
        renderSourcePickerMenu();
    }

    function renderSelectedArticleChapterControl(chapterSelect) {
        const selectedIds = getEffectiveSelectedArticleIds();
        if (selectedIds.length !== 1) {
            globalVocabularyState.chapterId = 'all';
            chapterSelect.innerHTML = '';
            chapterSelect.style.display = 'none';
            return;
        }

        const selectedId = selectedIds[0];
        const chapters = [];
        globalVocabularyState.entries
            .filter(entry => globalSourceId(entry.articleId) === selectedId && entry.chapterId)
            .forEach(entry => {
                if (!chapters.some(chapter => globalSourceId(chapter.id) === globalSourceId(entry.chapterId))) {
                    chapters.push({ id: entry.chapterId, title: entry.chapterTitle || String(entry.chapterId) });
                }
            });

        chapterSelect.innerHTML = '';
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = 'すべての章';
        chapterSelect.appendChild(allOption);
        chapters.forEach(chapter => {
            const option = document.createElement('option');
            option.value = globalSourceId(chapter.id);
            option.textContent = chapter.title;
            chapterSelect.appendChild(option);
        });

        if (!chapters.some(chapter => globalSourceId(chapter.id) === globalSourceId(globalVocabularyState.chapterId))) {
            globalVocabularyState.chapterId = 'all';
        }
        chapterSelect.value = String(globalVocabularyState.chapterId);
        chapterSelect.style.display = chapters.length ? '' : 'none';
    }

    renderGlobalVocabularyControls = function () {
        ensureGlobalSourceSelectionState();
        globalVocabularyState.sourceId = 'all';
        originalRenderGlobalVocabularyControls();

        const sourceSelect = document.getElementById('global-vocab-source');
        const chapterSelect = document.getElementById('global-vocab-chapter');
        if (!sourceSelect || !chapterSelect) return;
        ensureSourcePicker(sourceSelect);
        renderSelectedArticleChapterControl(chapterSelect);
    };

    getFilteredGlobalVocabulary = function () {
        ensureGlobalSourceSelectionState();
        const entries = originalGetFilteredGlobalVocabulary();
        const selected = getSelectedArticleIdSet();
        if (selected === null) return entries;
        return entries.filter(entry => selected.has(globalSourceId(entry.articleId)));
    };

    updateGlobalVocabulary = function (field, value) {
        if (field === 'sourceId') {
            if (value === 'all') selectAllGlobalSources();
            else {
                setSelectedArticleIds([value]);
                renderGlobalVocabulary();
            }
            return;
        }
        originalUpdateGlobalVocabulary(field, value);
    };

    document.addEventListener('click', event => {
        const picker = document.getElementById('global-vocab-source-picker');
        const menu = document.getElementById('global-vocab-source-picker-menu');
        const button = document.getElementById('global-vocab-source-picker-button');
        if (!picker || !menu || picker.contains(event.target)) return;
        menu.hidden = true;
        button?.setAttribute('aria-expanded', 'false');
    });

    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const menu = document.getElementById('global-vocab-source-picker-menu');
        const button = document.getElementById('global-vocab-source-picker-button');
        if (!menu || menu.hidden) return;
        menu.hidden = true;
        button?.setAttribute('aria-expanded', 'false');
        button?.focus();
    });

    const style = document.createElement('style');
    style.textContent = `
        .global-vocab-source-picker { position: relative; min-width: 180px; }
        .global-vocab-source-picker-button {
            width: 100%; min-height: 38px; padding: 8px 12px; border: 1px solid #d8c9b8;
            border-radius: 8px; background: #fff; color: inherit; text-align: left; cursor: pointer;
        }
        .global-vocab-source-picker-menu {
            position: absolute; z-index: 80; top: calc(100% + 6px); left: 0; width: min(360px, 86vw);
            max-height: min(440px, 60vh); overflow: auto; padding: 8px; border: 1px solid #d8c9b8;
            border-radius: 10px; background: #fff; box-shadow: 0 12px 28px rgba(0, 0, 0, 0.14);
        }
        .global-vocab-source-toolbar { display: flex; gap: 8px; padding: 2px 2px 8px; position: sticky; top: -8px; background: #fff; z-index: 1; }
        .global-vocab-source-toolbar button { flex: 1; padding: 7px 9px; border: 1px solid #d8c9b8; border-radius: 7px; background: #faf7f2; cursor: pointer; }
        .global-vocab-source-tree { display: flex; flex-direction: column; gap: 2px; }
        .global-vocab-source-row {
            display: flex; align-items: center; gap: 8px; min-height: 34px; padding: 5px 8px 5px calc(8px + var(--source-depth, 0) * 18px);
            border-radius: 7px; cursor: pointer; user-select: none;
        }
        .global-vocab-source-row:hover { background: #f6efe6; }
        .global-vocab-source-row input { margin: 0; flex: 0 0 auto; }
        .global-vocab-source-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .global-vocab-source-folder .global-vocab-source-name { font-weight: 600; }
        @media (max-width: 700px) {
            .global-vocab-source-picker { width: 100%; min-width: 0; }
            .global-vocab-source-picker-menu { position: fixed; left: 12px; right: 12px; top: 22%; width: auto; max-height: 62vh; }
        }
    `;
    document.head.appendChild(style);
}());
