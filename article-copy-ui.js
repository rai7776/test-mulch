(function () {
    'use strict';

    const SECTION_ID = 'article-copy-move-section';
    const TARGET_ID = 'article-copy-workspace-target';
    const STATUS_ID = 'article-copy-workspace-status';
    const SUBMIT_ID = 'article-copy-workspace-submit';
    let refreshToken = 0;

    function database() {
        try { return typeof db !== 'undefined' ? db : null; } catch (_) { return null; }
    }

    function copyApi() { return window.SmartReaderArticleCopy || null; }
    function workspaceApi() { return window.SmartReaderWorkspace || null; }

    function libraryItemById(id) {
        try {
            if (!Array.isArray(libraryItems)) return null;
            return libraryItems.find(item => String(item?.id) === String(id)) || null;
        } catch (_) {
            return null;
        }
    }

    function currentMovingItem() {
        try {
            return typeof movingItemId !== 'undefined' ? libraryItemById(movingItemId) : null;
        } catch (_) {
            return null;
        }
    }

    function createOption(value, label) {
        const option = document.createElement('option');
        option.value = value;
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
    }

    function ensureMoveCopySection() {
        const overlay = document.getElementById('move-modal-overlay');
        const card = overlay?.querySelector('.modal-content');
        const actions = card?.querySelector('.modal-actions');
        if (!overlay || !card || !actions) return null;

        let section = document.getElementById(SECTION_ID);
        if (section) return section;

        section = document.createElement('section');
        section.id = SECTION_ID;
        section.className = 'article-copy-move-section';
        section.hidden = true;

        const heading = document.createElement('h4');
        heading.textContent = '別の学習スペースへコピー';

        const description = document.createElement('p');
        description.className = 'article-copy-move-description';
        description.textContent = '別スペースを選ぶと、元の記事を残したまま本文・単語・ノート・問題・しおりをコピーします。';

        const field = document.createElement('label');
        field.className = 'article-copy-move-field';
        const labelText = document.createElement('span');
        labelText.textContent = 'コピー先';
        const select = document.createElement('select');
        select.id = TARGET_ID;
        field.append(labelText, select);

        const status = document.createElement('p');
        status.id = STATUS_ID;
        status.className = 'article-copy-move-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');

        const submit = document.createElement('button');
        submit.id = SUBMIT_ID;
        submit.type = 'button';
        submit.className = 'article-copy-move-submit';
        submit.textContent = 'このスペースへコピー';
        submit.addEventListener('click', submitWorkspaceCopy);

        section.append(heading, description, field, status, submit);
        card.insertBefore(section, actions);
        return section;
    }

    async function refreshMoveCopySection(itemId) {
        const token = ++refreshToken;
        const section = ensureMoveCopySection();
        const overlay = document.getElementById('move-modal-overlay');
        const modalHeading = overlay?.querySelector('.modal-content > h3');
        const item = libraryItemById(itemId) || currentMovingItem();
        if (!section) return;

        const select = document.getElementById(TARGET_ID);
        const status = document.getElementById(STATUS_ID);
        const submit = document.getElementById(SUBMIT_ID);
        if (status) status.textContent = '';

        if (!item || item.type !== 'article') {
            section.hidden = true;
            if (modalHeading) modalHeading.textContent = '移動先を選択';
            return;
        }

        if (modalHeading) modalHeading.textContent = '記事の移動・コピー';
        section.dataset.articleId = String(item.id);
        if (select) {
            select.replaceChildren(createOption('', '読み込み中…'));
            select.disabled = true;
        }
        if (submit) submit.disabled = true;
        section.hidden = false;

        const dbRef = database();
        const workspaces = workspaceApi();
        if (!dbRef || !workspaces?.readWorkspaceState || !select) {
            section.hidden = true;
            return;
        }

        try {
            const state = await workspaces.readWorkspaceState(dbRef);
            if (token !== refreshToken) return;
            window.SmartReaderWorkspaceState = state;
            const targets = (state.workspaces || []).filter(workspace => workspace.id !== state.activeWorkspaceId);
            select.replaceChildren();
            targets.forEach(workspace => select.appendChild(createOption(workspace.id, workspace.name || 'スペース')));

            if (targets.length === 0) {
                section.hidden = true;
                return;
            }

            section.hidden = false;
            select.disabled = false;
            if (submit) submit.disabled = false;
        } catch (error) {
            console.error('Workspace list load failed', error);
            if (token !== refreshToken) return;
            section.hidden = true;
        }
    }

    async function submitWorkspaceCopy() {
        const section = document.getElementById(SECTION_ID);
        const article = libraryItemById(section?.dataset.articleId) || currentMovingItem();
        const dbRef = database();
        const api = copyApi();
        const workspaces = workspaceApi();
        const select = document.getElementById(TARGET_ID);
        const status = document.getElementById(STATUS_ID);
        const submit = document.getElementById(SUBMIT_ID);
        const targetId = select?.value;
        if (!article || article.type !== 'article' || !dbRef || !api?.copyArticleToWorkspace || !workspaces || !targetId) return;

        if (submit) submit.disabled = true;
        if (select) select.disabled = true;
        if (status) status.textContent = 'コピーしています…';
        try {
            const result = await api.copyArticleToWorkspace(dbRef, workspaces, article, targetId);
            if (status) status.textContent = `「${result.workspace.name}」へコピーしました。`;
            setTimeout(() => {
                document.getElementById('move-modal-overlay')?.classList.remove('show');
            }, 850);
        } catch (error) {
            console.error('Article copy failed', error);
            if (status) status.textContent = 'コピーに失敗しました。元の記事とコピー先のデータは変更されていません。';
            if (submit) submit.disabled = false;
            if (select) select.disabled = false;
        }
    }

    function hookMoveModal() {
        const original = window.openMoveModal;
        if (typeof original !== 'function' || original.__articleWorkspaceCopyIntegrated) return;
        const wrapped = function (id) {
            const result = original.apply(this, arguments);
            void refreshMoveCopySection(id);
            return result;
        };
        wrapped.__articleWorkspaceCopyIntegrated = true;
        window.openMoveModal = wrapped;
    }

    function observeMoveModal() {
        const overlay = document.getElementById('move-modal-overlay');
        if (!overlay || overlay.dataset.articleWorkspaceCopyObserved === 'true') return;
        overlay.dataset.articleWorkspaceCopyObserved = 'true';
        const observer = new MutationObserver(() => {
            if (overlay.classList.contains('show')) void refreshMoveCopySection(currentMovingItem()?.id);
        });
        observer.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    }

    function initialize() {
        removeReaderHeaderActions();
        ensureMoveCopySection();
        hookMoveModal();
        observeMoveModal();
    }

    window.addEventListener('smartreader:workspace-ready', () => {
        removeReaderHeaderActions();
        if (document.getElementById('move-modal-overlay')?.classList.contains('show')) {
            void refreshMoveCopySection(currentMovingItem()?.id);
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
