(function () {
    'use strict';

    const SECTION_ID = 'settings-workspace-management-section';

    function database() {
        try { return typeof db !== 'undefined' ? db : null; } catch (_) { return null; }
    }
    function workspaceApi() { return window.SmartReaderWorkspace || null; }
    function managementApi() { return window.SmartReaderWorkspaceManagement || null; }
    function backupApi() { return window.SmartReaderWorkspaceBackup || null; }

    async function refreshWorkspaceState() {
        const api = workspaceApi();
        const dbRef = database();
        if (!api?.readWorkspaceState || !dbRef) return null;
        const state = await api.readWorkspaceState(dbRef);
        window.SmartReaderWorkspaceState = state;
        window.dispatchEvent(new CustomEvent('smartreader:workspace-ready', { detail: state }));
        return state;
    }

    function setStatus(section, text, isError = false) {
        const status = section.querySelector('[data-workspace-management-status]');
        if (!status) return;
        status.textContent = text || '';
        status.dataset.error = isError ? 'true' : 'false';
    }

    function createOption(item) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name || 'スペース';
        return option;
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

    async function createSafetyBackup(target) {
        const api = backupApi();
        const workspaces = workspaceApi();
        const dbRef = database();
        if (!api?.createWorkspaceBackup || !workspaces || !dbRef) {
            throw new Error('バックアップ機能を読み込めないため削除できません。');
        }
        const backup = await api.createWorkspaceBackup(dbRef, workspaces, target.id, window.localStorage);
        const stamp = String(backup.exportedAt || '').replace(/[:.]/g, '-');
        downloadJson(backup, `smart-reader-space-${safeFilename(target.name)}-before-delete-${stamp}.json`);
        return backup;
    }

    function updateDeleteState(section) {
        const select = section.querySelector('[data-workspace-management-select]');
        const deleteButton = section.querySelector('[data-workspace-delete]');
        const state = window.SmartReaderWorkspaceState;
        if (!select || !deleteButton) return;
        deleteButton.disabled = !select.value || select.value === state?.activeWorkspaceId || (state?.workspaces?.length || 0) <= 1;
        deleteButton.title = select.value === state?.activeWorkspaceId ? '使用中のスペースは削除できません' : '';
    }

    async function renameSelected(section) {
        const select = section.querySelector('[data-workspace-management-select]');
        const state = window.SmartReaderWorkspaceState || await refreshWorkspaceState();
        const target = state?.workspaces?.find(item => item.id === select?.value);
        if (!target) return;
        const nextName = prompt('新しいスペース名', target.name || '');
        if (nextName === null) return;
        try {
            const renamed = await managementApi().renameWorkspace(database(), workspaceApi(), target.id, nextName);
            await refreshWorkspaceState();
            setStatus(section, `「${renamed.name}」に変更しました。`);
        } catch (error) {
            console.error('Workspace rename failed', error);
            setStatus(section, error?.message || '名前変更に失敗しました。', true);
        }
    }

    async function deleteSelected(section) {
        const select = section.querySelector('[data-workspace-management-select]');
        const state = window.SmartReaderWorkspaceState || await refreshWorkspaceState();
        const target = state?.workspaces?.find(item => item.id === select?.value);
        if (!target) return;
        if (target.id === state.activeWorkspaceId) {
            setStatus(section, '使用中のスペースは削除できません。先に別のスペースへ切り替えてください。', true);
            return;
        }
        const confirmed = confirm(`「${target.name}」を削除しますか？\n削除前にこのスペースのバックアップファイルを自動保存します。`);
        if (!confirmed) return;
        try {
            setStatus(section, '削除前のバックアップを作成しています…');
            await createSafetyBackup(target);
            setStatus(section, 'バックアップを保存しました。スペースを削除しています…');
            await managementApi().deleteWorkspace(database(), workspaceApi(), target.id, window.localStorage);
            await refreshWorkspaceState();
            setStatus(section, `「${target.name}」を削除しました。削除前バックアップも保存済みです。`);
        } catch (error) {
            console.error('Workspace delete failed', error);
            setStatus(section, error?.message || '削除に失敗しました。', true);
        }
    }

    function renderSection(section) {
        const state = window.SmartReaderWorkspaceState;
        const select = section.querySelector('[data-workspace-management-select]');
        if (!select) return;
        const previous = select.value;
        select.replaceChildren();
        (state?.workspaces || []).forEach(item => select.appendChild(createOption(item)));
        if ((state?.workspaces || []).some(item => item.id === previous)) select.value = previous;
        else if (state?.activeWorkspaceId) select.value = state.activeWorkspaceId;
        updateDeleteState(section);
    }

    function createSection() {
        const section = document.createElement('section');
        section.id = SECTION_ID;
        section.className = 'settings-hub-section workspace-management-section';

        const heading = document.createElement('h3');
        heading.textContent = 'スペース管理';
        const description = document.createElement('p');
        description.className = 'settings-hub-section-description';
        description.textContent = '学習スペースの名前変更や削除ができます。使用中のスペースは削除できません。削除前にはバックアップを自動保存します。';

        const select = document.createElement('select');
        select.dataset.workspaceManagementSelect = '';
        select.className = 'workspace-management-select';
        select.addEventListener('change', () => updateDeleteState(section));

        const actions = document.createElement('div');
        actions.className = 'settings-hub-actions workspace-management-actions';
        const rename = document.createElement('button');
        rename.type = 'button';
        rename.className = 'btn-sub';
        rename.textContent = '名前を変更';
        rename.addEventListener('click', () => void renameSelected(section));
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn-sub workspace-delete-button';
        remove.textContent = '削除';
        remove.dataset.workspaceDelete = '';
        remove.addEventListener('click', () => void deleteSelected(section));
        actions.append(rename, remove);

        const status = document.createElement('p');
        status.className = 'workspace-management-status';
        status.dataset.workspaceManagementStatus = '';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');

        section.append(heading, description, select, actions, status);
        renderSection(section);
        return section;
    }

    function ensureSection() {
        const body = document.querySelector('[data-settings-hub-body]');
        if (!body) return;
        let section = document.getElementById(SECTION_ID);
        if (!section) {
            section = createSection();
            body.appendChild(section);
        } else {
            renderSection(section);
        }
    }

    const observer = new MutationObserver(() => ensureSection());
    function start() {
        observer.observe(document.body, { childList: true, subtree: true });
        ensureSection();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
    window.addEventListener('smartreader:workspace-ready', () => setTimeout(ensureSection, 0));
})();
