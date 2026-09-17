(function () {
    'use strict';

    const OVERLAY_ID = 'library-copy-overlay';
    const WORKSPACE_SELECT_ID = 'library-copy-workspace';
    const FOLDER_SELECT_ID = 'library-copy-folder';
    const STATUS_ID = 'library-copy-status';
    const SUBMIT_ID = 'library-copy-submit';
    let copyItemId = null;
    let copyWorkspaceState = null;
    let targetLibraryCache = [];
    let decorationQueued = false;
    let folderRefreshToken = 0;

    function database() {
        try { return typeof db !== 'undefined' ? db : null; } catch (_) { return null; }
    }

    function copyApi() { return window.SmartReaderArticleCopy || null; }
    function workspaceApi() { return window.SmartReaderWorkspace || null; }

    function sameId(left, right) {
        if (left === null || left === undefined || right === null || right === undefined) return left === right;
        return String(left) === String(right);
    }

    function allLibraryItems() {
        try { return Array.isArray(libraryItems) ? libraryItems : []; } catch (_) { return []; }
    }

    function currentFolder() {
        try { return typeof currentFolderId !== 'undefined' ? currentFolderId : null; } catch (_) { return null; }
    }

    function libraryItemById(id) {
        return allLibraryItems().find(item => sameId(item?.id, id)) || null;
    }

    function createOption(value, label) {
        const option = document.createElement('option');
        option.value = value === null || value === undefined ? '' : String(value);
        option.textContent = label;
        return option;
    }

    function removeReaderHeaderActions() {
        document.querySelectorAll('#article-meta button').forEach(button => {
            const handler = button.getAttribute('onclick') || '';
            if (handler.includes('showCurrentArticleVocabulary')) button.remove();
        });
        document.getElementById('article-copy-workspace-button')?.remove();
        document.getElementById('article-copy-workspace-overlay')?.remove();
        document.getElementById('article-copy-move-section')?.remove();
        const moveHeading = document.querySelector('#move-modal-overlay .modal-content > h3');
        if (moveHeading) moveHeading.textContent = '移動先を選択';
    }

    function ensureCopyModal() {
        const existing = document.getElementById(OVERLAY_ID);
        if (existing) return existing;

        const overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'modal-overlay library-copy-overlay';
        overlay.addEventListener('click', event => {
            if (event.target === overlay) closeCopyModal();
        });

        const card = document.createElement('div');
        card.className = 'modal-content library-copy-modal';

        const heading = document.createElement('h3');
        heading.textContent = 'コピー先を選択';

        const targetName = document.createElement('p');
        targetName.id = 'library-copy-target-name';
        targetName.className = 'library-copy-target-name';

        const workspaceField = document.createElement('label');
        workspaceField.className = 'library-copy-field';
        const workspaceLabel = document.createElement('span');
        workspaceLabel.textContent = '学習スペース';
        const workspaceSelect = document.createElement('select');
        workspaceSelect.id = WORKSPACE_SELECT_ID;
        workspaceSelect.addEventListener('change', () => void refreshFolderOptions(false));
        workspaceField.append(workspaceLabel, workspaceSelect);

        const folderField = document.createElement('label');
        folderField.className = 'library-copy-field';
        const folderLabel = document.createElement('span');
        folderLabel.textContent = '保存先フォルダ';
        const folderSelect = document.createElement('select');
        folderSelect.id = FOLDER_SELECT_ID;
        folderField.append(folderLabel, folderSelect);

        const description = document.createElement('p');
        description.className = 'library-copy-description';
        description.textContent = '元のデータは残したまま複製します。同じ学習スペース内にもコピーできます。';

        const status = document.createElement('p');
        status.id = STATUS_ID;
        status.className = 'library-copy-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');

        const actions = document.createElement('div');
        actions.className = 'modal-actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = '中止';
        cancel.addEventListener('click', closeCopyModal);
        const submit = document.createElement('button');
        submit.id = SUBMIT_ID;
        submit.type = 'button';
        submit.className = 'btn-save';
        submit.textContent = 'コピー';
        submit.addEventListener('click', submitCopy);
        actions.append(cancel, submit);

        card.append(heading, targetName, workspaceField, folderField, description, status, actions);
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        return overlay;
    }

    function closeCopyModal() {
        document.getElementById(OVERLAY_ID)?.classList.remove('show');
        copyItemId = null;
        targetLibraryCache = [];
    }

    function folderPathLabel(folder, library) {
        const names = [];
        let current = folder;
        const seen = new Set();
        while (current && names.length < 30) {
            const key = String(current.id);
            if (seen.has(key)) break;
            seen.add(key);
            names.unshift(String(current.name || 'フォルダ'));
            current = library.find(item => item?.type === 'folder' && sameId(item.id, current.parentId)) || null;
        }
        return names.join(' / ');
    }

    function collectFolderDescendants(library, sourceFolderId) {
        const blocked = new Set([String(sourceFolderId)]);
        let changed = true;
        while (changed) {
            changed = false;
            library.forEach(item => {
                if (item?.type !== 'folder') return;
                if (blocked.has(String(item.id))) return;
                if (item.parentId !== null && item.parentId !== undefined && blocked.has(String(item.parentId))) {
                    blocked.add(String(item.id));
                    changed = true;
                }
            });
        }
        return blocked;
    }

    function resolveTargetWorkspace() {
        const select = document.getElementById(WORKSPACE_SELECT_ID);
        const targetId = select?.value;
        return (copyWorkspaceState?.workspaces || []).find(workspace => workspace.id === targetId) || null;
    }

    async function loadTargetLibrary(workspace) {
        const dbRef = database();
        if (!workspace || !dbRef) return [];
        if (workspace.id === copyWorkspaceState?.activeWorkspaceId) return allLibraryItems();
        const key = workspace.libraryKey || `workspace:${workspace.id}:library_items`;
        const stored = await dbRef.getItem(key);
        return Array.isArray(stored) ? stored : [];
    }

    async function refreshFolderOptions(preferSourceFolder) {
        const token = ++folderRefreshToken;
        const item = libraryItemById(copyItemId);
        const workspace = resolveTargetWorkspace();
        const folderSelect = document.getElementById(FOLDER_SELECT_ID);
        const submit = document.getElementById(SUBMIT_ID);
        const status = document.getElementById(STATUS_ID);
        if (!item || !workspace || !folderSelect) return;

        folderSelect.replaceChildren(createOption('', '読み込み中…'));
        folderSelect.disabled = true;
        if (submit) submit.disabled = true;
        if (status) status.textContent = '';

        try {
            const targetLibrary = await loadTargetLibrary(workspace);
            if (token !== folderRefreshToken) return;
            targetLibraryCache = targetLibrary;
            folderSelect.replaceChildren(createOption('', '🏠 Root'));

            let blocked = new Set();
            const isCurrentWorkspace = workspace.id === copyWorkspaceState?.activeWorkspaceId;
            if (isCurrentWorkspace && item.type === 'folder') {
                blocked = collectFolderDescendants(targetLibrary, item.id);
            }

            targetLibrary
                .filter(folder => folder?.type === 'folder' && !blocked.has(String(folder.id)))
                .forEach(folder => folderSelect.appendChild(createOption(folder.id, `📁 ${folderPathLabel(folder, targetLibrary)}`)));

            if (isCurrentWorkspace && preferSourceFolder && item.parentId !== null && item.parentId !== undefined) {
                const parent = targetLibrary.find(folder => folder?.type === 'folder' && sameId(folder.id, item.parentId));
                if (parent && !blocked.has(String(parent.id))) folderSelect.value = String(parent.id);
            }

            folderSelect.disabled = false;
            if (submit) submit.disabled = false;
        } catch (error) {
            console.error('Copy target folder load failed', error);
            if (token !== folderRefreshToken) return;
            folderSelect.replaceChildren(createOption('', '🏠 Root'));
            folderSelect.disabled = false;
            if (submit) submit.disabled = false;
            if (status) status.textContent = '保存先フォルダの取得に失敗したため、Rootへコピーできます。';
        }
    }

    async function openCopyModal(itemId) {
        const item = libraryItemById(itemId);
        const dbRef = database();
        const workspaces = workspaceApi();
        const overlay = ensureCopyModal();
        const workspaceSelect = document.getElementById(WORKSPACE_SELECT_ID);
        const targetName = document.getElementById('library-copy-target-name');
        const status = document.getElementById(STATUS_ID);
        if (!item || !dbRef || !workspaces?.readWorkspaceState || !workspaceSelect) return;

        copyItemId = item.id;
        if (targetName) targetName.textContent = item.name || '無題';
        if (status) status.textContent = '';
        workspaceSelect.replaceChildren(createOption('', '読み込み中…'));
        workspaceSelect.disabled = true;
        overlay.classList.add('show');

        try {
            copyWorkspaceState = await workspaces.readWorkspaceState(dbRef);
            window.SmartReaderWorkspaceState = copyWorkspaceState;
            workspaceSelect.replaceChildren();
            (copyWorkspaceState.workspaces || []).forEach(workspace => {
                const suffix = workspace.id === copyWorkspaceState.activeWorkspaceId ? '（現在）' : '';
                workspaceSelect.appendChild(createOption(workspace.id, `${workspace.name || 'スペース'}${suffix}`));
            });
            workspaceSelect.value = copyWorkspaceState.activeWorkspaceId || workspaceSelect.options[0]?.value || '';
            workspaceSelect.disabled = false;
            await refreshFolderOptions(true);
        } catch (error) {
            console.error('Workspace list load failed', error);
            if (status) status.textContent = '学習スペースの取得に失敗しました。';
        }
    }

    function resolveSelectedFolderId() {
        const value = document.getElementById(FOLDER_SELECT_ID)?.value;
        if (!value) return null;
        const folder = targetLibraryCache.find(item => item?.type === 'folder' && sameId(item.id, value));
        return folder ? folder.id : null;
    }

    async function submitCopy() {
        const item = libraryItemById(copyItemId);
        const dbRef = database();
        const api = copyApi();
        const workspaces = workspaceApi();
        const workspaceSelect = document.getElementById(WORKSPACE_SELECT_ID);
        const folderSelect = document.getElementById(FOLDER_SELECT_ID);
        const submit = document.getElementById(SUBMIT_ID);
        const status = document.getElementById(STATUS_ID);
        const targetWorkspaceId = workspaceSelect?.value;
        if (!item || !dbRef || !api?.copyLibraryItemToWorkspace || !workspaces || !targetWorkspaceId) return;

        if (workspaceSelect) workspaceSelect.disabled = true;
        if (folderSelect) folderSelect.disabled = true;
        if (submit) submit.disabled = true;
        if (status) status.textContent = 'コピーしています…';

        try {
            const result = await api.copyLibraryItemToWorkspace(
                dbRef,
                workspaces,
                allLibraryItems(),
                item.id,
                targetWorkspaceId,
                {
                    allowCurrent: true,
                    activeLibrary: allLibraryItems(),
                    targetParentId: resolveSelectedFolderId()
                }
            );

            const copiedToCurrent = result.workspace.id === copyWorkspaceState?.activeWorkspaceId;
            if (copiedToCurrent) {
                try { libraryItems = result.library; } catch (_) { /* global library remains DB-backed */ }
                if (typeof showLibrary === 'function') showLibrary();
            }

            if (status) status.textContent = `「${result.workspace.name || 'スペース'}」へコピーしました。`;
            setTimeout(closeCopyModal, copiedToCurrent ? 250 : 650);
        } catch (error) {
            console.error('Library item copy failed', error);
            if (status) status.textContent = 'コピーに失敗しました。元のデータは変更されていません。';
            if (workspaceSelect) workspaceSelect.disabled = false;
            if (folderSelect) folderSelect.disabled = false;
            if (submit) submit.disabled = false;
        }
    }

    function visibleLibraryItems() {
        const folderId = currentFolder();
        return allLibraryItems().filter(item => sameId(item?.parentId, folderId));
    }

    function decorateLibraryActions() {
        decorationQueued = false;
        const list = document.getElementById('library-list');
        if (!list) return;
        const cards = Array.from(list.children).filter(node => node.classList?.contains('item-card'));
        const items = visibleLibraryItems();
        if (!cards.length || cards.length !== items.length) return;

        cards.forEach((card, index) => {
            const item = items[index];
            const actions = card.querySelector('.card-actions');
            if (!actions || !item) return;

            let button = actions.querySelector('.library-copy-button');
            if (!button) {
                button = document.createElement('button');
                button.type = 'button';
                button.className = 'small-btn copy library-copy-button';
                button.textContent = 'コピー';
                actions.appendChild(button);
            }
            button.dataset.itemId = String(item.id);
            button.onclick = event => {
                event.stopPropagation();
                void openCopyModal(item.id);
            };
        });
    }

    function scheduleDecoration() {
        if (decorationQueued) return;
        decorationQueued = true;
        queueMicrotask(decorateLibraryActions);
    }

    function observeLibrary() {
        const list = document.getElementById('library-list');
        if (!list || list.dataset.libraryCopyObserved === 'true') return;
        list.dataset.libraryCopyObserved = 'true';
        const observer = new MutationObserver(scheduleDecoration);
        observer.observe(list, { childList: true, subtree: true });
        scheduleDecoration();
    }

    function initialize() {
        removeReaderHeaderActions();
        ensureCopyModal();
        observeLibrary();
    }

    window.addEventListener('smartreader:workspace-ready', () => {
        removeReaderHeaderActions();
        scheduleDecoration();
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
