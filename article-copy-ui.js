(function () {
    'use strict';

    const BUTTON_ID = 'article-copy-workspace-button';
    const OVERLAY_ID = 'article-copy-workspace-overlay';

    function database() {
        try { return typeof db !== 'undefined' ? db : null; } catch (_) { return null; }
    }

    function activeArticle() {
        try { return typeof currentArticle !== 'undefined' ? currentArticle : null; } catch (_) { return null; }
    }

    function copyApi() { return window.SmartReaderArticleCopy || null; }
    function workspaceApi() { return window.SmartReaderWorkspace || null; }

    function createOption(value, label) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
    }

    function ensureButton() {
        const meta = document.getElementById('article-meta');
        if (!meta || document.getElementById(BUTTON_ID)) return;
        const button = document.createElement('button');
        button.id = BUTTON_ID;
        button.type = 'button';
        button.className = 'small-edit-btn article-copy-workspace-button';
        button.textContent = '別スペースへコピー';
        button.addEventListener('click', openCopyModal);
        const sourceLink = document.getElementById('display-url');
        if (sourceLink && sourceLink.parentElement === meta) meta.insertBefore(button, sourceLink);
        else meta.appendChild(button);
    }

    function ensureOverlay() {
        let overlay = document.getElementById(OVERLAY_ID);
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'article-copy-workspace-overlay';
        overlay.hidden = true;

        const card = document.createElement('section');
        card.className = 'article-copy-workspace-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        card.setAttribute('aria-labelledby', 'article-copy-workspace-title');

        const title = document.createElement('h2');
        title.id = 'article-copy-workspace-title';
        title.textContent = '別の学習スペースへコピー';

        const description = document.createElement('p');
        description.className = 'article-copy-workspace-description';
        description.textContent = '本文・単語・ノート・問題・しおりをまとめてコピーします。学習履歴と読書位置は引き継ぎません。';

        const articleName = document.createElement('div');
        articleName.className = 'article-copy-workspace-source';
        articleName.dataset.copyArticleName = '';

        const label = document.createElement('label');
        label.className = 'article-copy-workspace-field';
        const labelText = document.createElement('span');
        labelText.textContent = 'コピー先';
        const select = document.createElement('select');
        select.id = 'article-copy-workspace-target';
        label.append(labelText, select);

        const status = document.createElement('p');
        status.id = 'article-copy-workspace-status';
        status.className = 'article-copy-workspace-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');

        const actions = document.createElement('div');
        actions.className = 'article-copy-workspace-actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'btn-sub';
        cancel.textContent = 'キャンセル';
        cancel.addEventListener('click', closeCopyModal);
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'start-btn';
        copy.textContent = 'コピーする';
        copy.dataset.copySubmit = '';
        copy.addEventListener('click', submitCopy);
        actions.append(cancel, copy);

        card.append(title, description, articleName, label, status, actions);
        overlay.appendChild(card);
        overlay.addEventListener('click', event => {
            if (event.target === overlay) closeCopyModal();
        });
        document.body.appendChild(overlay);
        return overlay;
    }

    async function openCopyModal() {
        const article = activeArticle();
        const dbRef = database();
        const workspaces = workspaceApi();
        const overlay = ensureOverlay();
        const select = document.getElementById('article-copy-workspace-target');
        const status = document.getElementById('article-copy-workspace-status');
        const submit = overlay.querySelector('[data-copy-submit]');
        const name = overlay.querySelector('[data-copy-article-name]');
        if (status) status.textContent = '';
        if (name) name.textContent = article?.name || '無題';
        if (!article || !dbRef || !workspaces?.readWorkspaceState || !select) {
            if (status) status.textContent = 'コピー機能を読み込めませんでした。';
            overlay.hidden = false;
            return;
        }

        select.replaceChildren();
        try {
            const state = await workspaces.readWorkspaceState(dbRef);
            const targets = (state.workspaces || []).filter(item => item.id !== state.activeWorkspaceId);
            targets.forEach(item => select.appendChild(createOption(item.id, item.name || 'スペース')));
            if (targets.length === 0) {
                select.appendChild(createOption('', 'コピーできる別のスペースがありません'));
                select.disabled = true;
                if (submit) submit.disabled = true;
            } else {
                select.disabled = false;
                if (submit) submit.disabled = false;
            }
        } catch (error) {
            console.error('Workspace list load failed', error);
            select.appendChild(createOption('', 'スペースを読み込めませんでした'));
            select.disabled = true;
            if (submit) submit.disabled = true;
        }

        overlay.hidden = false;
        document.body.classList.add('article-copy-workspace-open');
        select.focus();
    }

    function closeCopyModal() {
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay) overlay.hidden = true;
        document.body.classList.remove('article-copy-workspace-open');
    }

    async function submitCopy() {
        const article = activeArticle();
        const dbRef = database();
        const api = copyApi();
        const workspaces = workspaceApi();
        const select = document.getElementById('article-copy-workspace-target');
        const status = document.getElementById('article-copy-workspace-status');
        const submit = document.querySelector(`#${OVERLAY_ID} [data-copy-submit]`);
        const targetId = select?.value;
        if (!article || !dbRef || !api?.copyArticleToWorkspace || !workspaces || !targetId) return;

        if (submit) submit.disabled = true;
        if (status) status.textContent = 'コピーしています…';
        try {
            const result = await api.copyArticleToWorkspace(dbRef, workspaces, article, targetId);
            if (status) status.textContent = `「${result.workspace.name}」へコピーしました。`;
            if (select) select.disabled = true;
            setTimeout(closeCopyModal, 900);
        } catch (error) {
            console.error('Article copy failed', error);
            if (status) status.textContent = 'コピーに失敗しました。元の記事とコピー先のデータは変更されていません。';
            if (submit) submit.disabled = false;
        }
    }

    function updateButtonAvailability() {
        ensureButton();
        const button = document.getElementById(BUTTON_ID);
        const state = window.SmartReaderWorkspaceState;
        if (button) button.hidden = !state || (state.workspaces || []).length < 2;
    }

    window.addEventListener('smartreader:workspace-ready', updateButtonAvailability);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !document.getElementById(OVERLAY_ID)?.hidden) closeCopyModal();
    });
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ensureOverlay();
            updateButtonAvailability();
        }, { once: true });
    } else {
        ensureOverlay();
        updateButtonAvailability();
    }
})();
