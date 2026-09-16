(function () {
    'use strict';

    const SECTION_ID = 'settings-workspace-backup-section';
    const FILE_INPUT_ID = 'workspace-backup-file-input';

    function database() {
        try { return typeof db !== 'undefined' ? db : null; } catch (_) { return null; }
    }
    function backupApi() { return window.SmartReaderWorkspaceBackup || null; }
    function workspaceApi() { return window.SmartReaderWorkspace || null; }

    function option(value, text) {
        const node = document.createElement('option');
        node.value = value;
        node.textContent = text;
        return node;
    }

    function safeFilename(value) {
        return String(value || 'workspace').replace(/[\\/:*?"<>|\x00-\x1F]/g, '_').trim() || 'workspace';
    }

    function downloadJson(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function refreshWorkspaceState() {
        const api = workspaceApi();
        const dbRef = database();
        if (!api?.readWorkspaceState || !dbRef) return null;
        const state = await api.readWorkspaceState(dbRef);
        window.SmartReaderWorkspaceState = state;
        window.dispatchEvent(new CustomEvent('smartreader:workspace-ready', { detail: state }));
        return state;
    }

    function ensureFileInput() {
        let input = document.getElementById(FILE_INPUT_ID);
        if (input) return input;
        input = document.createElement('input');
        input.id = FILE_INPUT_ID;
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.hidden = true;
        input.addEventListener('change', handleRestoreFile);
        document.body.appendChild(input);
        return input;
    }

    async function exportSelectedWorkspace(select, status) {
        const api = backupApi();
        const workspaces = workspaceApi();
        const dbRef = database();
        if (!api?.createWorkspaceBackup || !workspaces || !dbRef || !select.value) return;
        status.textContent = 'バックアップを作成しています…';
        try {
            const backup = await api.createWorkspaceBackup(dbRef, workspaces, select.value, window.localStorage);
            const stamp = String(backup.exportedAt || '').replace(/[:.]/g, '-');
            downloadJson(backup, `smart-reader-space-${safeFilename(backup.workspace.name)}-${stamp}.json`);
            status.textContent = `「${backup.workspace.name}」のバックアップを保存しました。`;
        } catch (error) {
            console.error('Workspace backup export failed', error);
            status.textContent = 'スペースのバックアップに失敗しました。';
        }
    }

    async function handleRestoreFile(event) {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        const section = document.getElementById(SECTION_ID);
        const status = section?.querySelector('[data-workspace-backup-status]');
        const api = backupApi();
        const workspaces = workspaceApi();
        const dbRef = database();
        if (!api || !workspaces || !dbRef || !status) return;
        status.textContent = 'バックアップを確認しています…';
        try {
            const raw = JSON.parse(await file.text());
            const validation = api.validateWorkspaceBackup(raw);
            if (!validation.valid) throw new Error(validation.error);
            const sourceName = validation.backup.workspace.name;
            if (!confirm(`「${sourceName}」を新しい学習スペースとして復元しますか？\n現在のスペースは上書きされません。`)) {
                status.textContent = '復元をキャンセルしました。';
                return;
            }
            const restored = await api.restoreWorkspaceBackup(dbRef, workspaces, raw, window.localStorage);
            await refreshWorkspaceState();
            status.textContent = `「${restored.name}」として復元しました。`;
        } catch (error) {
            console.error('Workspace backup restore failed', error);
            status.textContent = error?.message || 'スペースの復元に失敗しました。';
        }
    }

    function ensureSection() {
        const body = document.querySelector('[data-settings-hub-body]');
        if (!body || document.getElementById(SECTION_ID)) return;
        const section = document.createElement('section');
        section.id = SECTION_ID;
        section.className = 'settings-hub-section workspace-backup-section';

        const heading = document.createElement('h3');
        heading.textContent = 'スペースのバックアップ';
        const description = document.createElement('p');
        description.className = 'settings-hub-section-description';
        description.textContent = '選んだ学習スペースだけを1つのファイルとして保存できます。復元時は新しいスペースとして追加されます。';

        const select = document.createElement('select');
        select.className = 'workspace-backup-select';
        const state = window.SmartReaderWorkspaceState;
        (state?.workspaces || []).forEach(item => select.appendChild(option(item.id, item.name || 'スペース')));
        if (state?.activeWorkspaceId) select.value = state.activeWorkspaceId;

        const actions = document.createElement('div');
        actions.className = 'settings-hub-actions workspace-backup-actions';
        const saveButton = document.createElement('button');
        saveButton.type = 'button';
        saveButton.className = 'btn-sub';
        saveButton.textContent = 'このスペースを保存';
        saveButton.addEventListener('click', () => exportSelectedWorkspace(select, status));
        const restoreButton = document.createElement('button');
        restoreButton.type = 'button';
        restoreButton.className = 'btn-sub';
        restoreButton.textContent = 'スペースを復元';
        restoreButton.addEventListener('click', () => ensureFileInput().click());
        actions.append(saveButton, restoreButton);

        const status = document.createElement('p');
        status.className = 'workspace-backup-status';
        status.dataset.workspaceBackupStatus = '';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');

        section.append(heading, description, select, actions, status);
        body.appendChild(section);
    }

    const observer = new MutationObserver(() => ensureSection());
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ensureFileInput();
            observer.observe(document.body, { childList: true, subtree: true });
            ensureSection();
        }, { once: true });
    } else {
        ensureFileInput();
        observer.observe(document.body, { childList: true, subtree: true });
        ensureSection();
    }
    window.addEventListener('smartreader:workspace-ready', () => setTimeout(ensureSection, 0));
})();
