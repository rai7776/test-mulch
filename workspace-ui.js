(function () {
    'use strict';

    const CONTROL_ID = 'smart-reader-workspace-control';
    const OVERLAY_ID = 'smart-reader-workspace-create-overlay';
    const LANGUAGE_OPTIONS = [
        ['en', 'English'],
        ['ja', '日本語'],
        ['zh', '中文'],
        ['es', 'Español'],
        ['ko', '한국어'],
        ['fr', 'Français'],
        ['de', 'Deutsch'],
        ['pt', 'Português'],
        ['it', 'Italiano']
    ];
    let modalMode = 'create';

    function workspaceApi() {
        return window.SmartReaderWorkspace || null;
    }

    function currentState() {
        return window.SmartReaderWorkspaceState || null;
    }

    function database() {
        try {
            return typeof db !== 'undefined' ? db : null;
        } catch (_) {
            return null;
        }
    }

    function isInitialSetupPending() {
        return currentState()?.activeWorkspace?.setupPending === true;
    }

    function createOption(value, label) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
    }

    function ensureControl() {
        const state = currentState();
        const api = workspaceApi();
        if (!state || !api || !state.activeWorkspace) return;
        if (state.activeWorkspace.setupPending === true) {
            document.getElementById(CONTROL_ID)?.remove();
            return;
        }
        let control = document.getElementById(CONTROL_ID);
        if (!control) {
            const headerLeft = document.querySelector('.app-header .header-left');
            if (!headerLeft) return;
            control = document.createElement('div');
            control.id = CONTROL_ID;
            control.className = 'workspace-control';

            const select = document.createElement('select');
            select.className = 'workspace-select';
            select.setAttribute('aria-label', '学習スペース');
            select.addEventListener('change', async () => {
                const nextId = select.value;
                const dbRef = database();
                if (!dbRef || nextId === currentState()?.activeWorkspaceId) return;
                select.disabled = true;
                try {
                    await api.switchWorkspace(dbRef, nextId, window.localStorage);
                    window.location.reload();
                } catch (error) {
                    console.error('Workspace switch failed', error);
                    alert('学習スペースの切り替えに失敗しました。データは元のスペースに戻されています。');
                    select.disabled = false;
                    renderControl();
                }
            });

            const addButton = document.createElement('button');
            addButton.type = 'button';
            addButton.className = 'workspace-add-button';
            addButton.textContent = '＋';
            addButton.title = '新しい学習スペース';
            addButton.setAttribute('aria-label', '新しい学習スペースを作成');
            addButton.addEventListener('click', openCreateModal);

            control.append(select, addButton);
            headerLeft.appendChild(control);
        }
        renderControl();
    }

    function renderControl() {
        const state = currentState();
        const select = document.querySelector(`#${CONTROL_ID} .workspace-select`);
        if (!state || !select) return;
        select.replaceChildren();
        state.workspaces.forEach(item => {
            select.appendChild(createOption(item.id, item.name || 'スペース'));
        });
        select.value = state.activeWorkspaceId || '';
    }

    function labeledField(labelText, control) {
        const label = document.createElement('label');
        label.className = 'workspace-form-field';
        const text = document.createElement('span');
        text.textContent = labelText;
        label.append(text, control);
        return label;
    }

    function ensureCreateModal() {
        let overlay = document.getElementById(OVERLAY_ID);
        if (overlay) return overlay;

        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'workspace-create-overlay';
        overlay.hidden = true;

        const card = document.createElement('section');
        card.className = 'workspace-create-card';
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        card.setAttribute('aria-labelledby', 'workspace-create-title');

        const heading = document.createElement('h2');
        heading.id = 'workspace-create-title';
        heading.textContent = '新しい学習スペース';

        const description = document.createElement('p');
        description.id = 'workspace-create-description';
        description.className = 'workspace-create-description';
        description.textContent = '教材・単語・Study履歴は、ほかのスペースと混ざらずに保存されます。';

        const nameInput = document.createElement('input');
        nameInput.id = 'workspace-create-name';
        nameInput.type = 'text';
        nameInput.placeholder = '例：英語 / 古文 / ITパスポート';
        nameInput.autocomplete = 'off';

        const kindSelect = document.createElement('select');
        kindSelect.id = 'workspace-create-kind';
        kindSelect.append(
            createOption('language', '語学'),
            createOption('general', '一般学習・資格')
        );

        const languageSelect = document.createElement('select');
        languageSelect.id = 'workspace-create-language';
        LANGUAGE_OPTIONS.forEach(([value, label]) => languageSelect.appendChild(createOption(value, label)));

        const languageField = labeledField('学習対象言語', languageSelect);
        languageField.id = 'workspace-create-language-field';

        kindSelect.addEventListener('change', () => {
            languageField.hidden = kindSelect.value !== 'language';
        });

        const status = document.createElement('p');
        status.id = 'workspace-create-status';
        status.className = 'workspace-create-status';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');

        const actions = document.createElement('div');
        actions.className = 'workspace-create-actions';
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'btn-sub';
        cancel.textContent = 'キャンセル';
        cancel.dataset.workspaceCancel = '';
        cancel.addEventListener('click', closeCreateModal);
        const create = document.createElement('button');
        create.type = 'button';
        create.className = 'start-btn';
        create.textContent = '作成する';
        create.dataset.workspaceSubmit = '';
        create.addEventListener('click', submitCreateWorkspace);
        actions.append(cancel, create);

        card.append(
            heading,
            description,
            labeledField('スペース名', nameInput),
            labeledField('種類', kindSelect),
            languageField,
            status,
            actions
        );
        overlay.appendChild(card);
        overlay.addEventListener('click', event => {
            if (event.target === overlay && modalMode !== 'setup') closeCreateModal();
        });
        document.body.appendChild(overlay);
        return overlay;
    }

    function configureModal(mode) {
        const heading = document.getElementById('workspace-create-title');
        const description = document.getElementById('workspace-create-description');
        const cancel = document.querySelector(`#${OVERLAY_ID} [data-workspace-cancel]`);
        const submit = document.querySelector(`#${OVERLAY_ID} [data-workspace-submit]`);
        if (mode === 'setup') {
            if (heading) heading.textContent = '最初の学習スペースを作成';
            if (description) description.textContent = 'まず、このスペースで何を学ぶか設定します。教材・単語・Study履歴はスペースごとに分けて保存されます。';
            if (cancel) cancel.hidden = true;
            if (submit) submit.textContent = 'はじめる';
        } else {
            if (heading) heading.textContent = '新しい学習スペース';
            if (description) description.textContent = '教材・単語・Study履歴は、ほかのスペースと混ざらずに保存されます。';
            if (cancel) cancel.hidden = false;
            if (submit) submit.textContent = '作成する';
        }
    }

    function resetModalFields() {
        const nameInput = document.getElementById('workspace-create-name');
        const kindSelect = document.getElementById('workspace-create-kind');
        const languageSelect = document.getElementById('workspace-create-language');
        const languageField = document.getElementById('workspace-create-language-field');
        const status = document.getElementById('workspace-create-status');
        if (nameInput) nameInput.value = '';
        if (kindSelect) kindSelect.value = 'language';
        if (languageSelect) languageSelect.value = 'en';
        if (languageField) languageField.hidden = false;
        if (status) status.textContent = '';
    }

    function openCreateModal() {
        modalMode = 'create';
        const overlay = ensureCreateModal();
        resetModalFields();
        configureModal('create');
        overlay.hidden = false;
        document.body.classList.add('workspace-modal-open');
        setTimeout(() => document.getElementById('workspace-create-name')?.focus(), 0);
    }

    function openInitialSetupModal() {
        modalMode = 'setup';
        const overlay = ensureCreateModal();
        resetModalFields();
        configureModal('setup');
        overlay.hidden = false;
        document.body.classList.add('workspace-modal-open');
        setTimeout(() => document.getElementById('workspace-create-name')?.focus(), 0);
    }

    function closeCreateModal() {
        if (modalMode === 'setup' && isInitialSetupPending()) return;
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay) overlay.hidden = true;
        document.body.classList.remove('workspace-modal-open');
        modalMode = 'create';
    }

    function generateWorkspaceId() {
        const random = Math.random().toString(36).slice(2, 8);
        return `workspace-${Date.now().toString(36)}-${random}`;
    }

    async function submitCreateWorkspace() {
        const api = workspaceApi();
        const dbRef = database();
        const name = String(document.getElementById('workspace-create-name')?.value || '').trim();
        const kind = document.getElementById('workspace-create-kind')?.value || 'language';
        const contentLanguage = document.getElementById('workspace-create-language')?.value || 'en';
        const status = document.getElementById('workspace-create-status');
        const createButton = document.querySelector(`#${OVERLAY_ID} .start-btn`);

        if (!name) {
            if (status) status.textContent = 'スペース名を入力してください。';
            return;
        }
        if (!api || !dbRef) {
            if (status) status.textContent = '保存機能を読み込めませんでした。';
            return;
        }

        if (createButton) createButton.disabled = true;
        if (status) status.textContent = modalMode === 'setup' ? '設定を保存しています…' : '作成しています…';
        try {
            if (modalMode === 'setup' && isInitialSetupPending()) {
                if (typeof api.completeInitialWorkspaceSetup !== 'function') throw new Error('Initial setup API is unavailable.');
                await api.completeInitialWorkspaceSetup(dbRef, {
                    name,
                    kind,
                    contentLanguage: kind === 'language' ? contentLanguage : ''
                });
                window.location.reload();
                return;
            }

            const created = await api.addWorkspace(dbRef, {
                id: generateWorkspaceId(),
                name,
                kind,
                contentLanguage: kind === 'language' ? contentLanguage : ''
            });
            await api.switchWorkspace(dbRef, created.id, window.localStorage);
            window.location.reload();
        } catch (error) {
            console.error('Workspace creation/setup failed', error);
            if (status) status.textContent = modalMode === 'setup'
                ? '設定の保存に失敗しました。入力内容を確認してください。'
                : '作成に失敗しました。元のスペースのデータは変更されていません。';
            if (createButton) createButton.disabled = false;
        }
    }

    function onWorkspaceReady(event) {
        if (event?.detail) window.SmartReaderWorkspaceState = event.detail;
        if (isInitialSetupPending()) {
            document.getElementById(CONTROL_ID)?.remove();
            openInitialSetupModal();
            return;
        }
        ensureControl();
    }

    window.addEventListener('smartreader:workspace-ready', onWorkspaceReady);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ensureCreateModal();
            if (isInitialSetupPending()) openInitialSetupModal();
            else if (currentState()) ensureControl();
        }, { once: true });
    } else {
        ensureCreateModal();
        if (isInitialSetupPending()) openInitialSetupModal();
        else if (currentState()) ensureControl();
    }
})();
