(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SmartReaderWorkspaceManagement = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function normalizeName(value) {
        return String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 80);
    }

    async function renameWorkspace(database, workspaceApi, workspaceId, nextName) {
        const state = await workspaceApi.readWorkspaceState(database);
        const target = (state.workspaces || []).find(item => item.id === workspaceId);
        if (!target) throw new Error('学習スペースが見つかりません。');
        const name = normalizeName(nextName);
        if (!name) throw new Error('スペース名を入力してください。');
        const duplicate = state.workspaces.some(item => item.id !== workspaceId && normalizeName(item.name).toLocaleLowerCase() === name.toLocaleLowerCase());
        if (duplicate) throw new Error('同じ名前の学習スペースがあります。');
        const updated = state.workspaces.map(item => item.id === workspaceId ? { ...item, name } : item);
        await database.setItem(workspaceApi.WORKSPACES_KEY, updated);
        return updated.find(item => item.id === workspaceId);
    }

    async function deleteWorkspace(database, workspaceApi, workspaceId, localStore = null) {
        const state = await workspaceApi.readWorkspaceState(database);
        const target = (state.workspaces || []).find(item => item.id === workspaceId);
        if (!target) throw new Error('学習スペースが見つかりません。');
        if (target.id === state.activeWorkspaceId) throw new Error('使用中の学習スペースは削除できません。先に別のスペースへ切り替えてください。');
        if (state.workspaces.length <= 1) throw new Error('最後の学習スペースは削除できません。');

        // Remove the workspace from visible metadata first. If this write fails,
        // none of the workspace content is deleted.
        const remaining = state.workspaces.filter(item => item.id !== workspaceId);
        await database.setItem(workspaceApi.WORKSPACES_KEY, remaining);

        // Storage cleanup is best-effort after the safe metadata commit. A failed
        // cleanup can only leave orphaned data; it cannot delete another workspace.
        const dataKeys = new Set([
            target.libraryKey,
            target.studyHistoryKey,
            workspaceApi.dedicatedLibraryKey(workspaceId),
            workspaceApi.dedicatedStudyHistoryKey(workspaceId)
        ]);
        dataKeys.delete(workspaceApi.ACTIVE_LIBRARY_KEY);
        dataKeys.delete(workspaceApi.ACTIVE_STUDY_HISTORY_KEY);
        if (typeof database.removeItem === 'function') {
            for (const key of dataKeys) {
                if (!key) continue;
                try { await database.removeItem(key); } catch (_) {}
            }
        }

        if (localStore && typeof localStore.removeItem === 'function') {
            for (const key of workspaceApi.WORKSPACE_LOCAL_SETTING_KEYS || []) {
                try { localStore.removeItem(workspaceApi.dedicatedLocalSettingKey(workspaceId, key)); } catch (_) {}
            }
        }
        return target;
    }

    return Object.freeze({ normalizeName, renameWorkspace, deleteWorkspace });
});
