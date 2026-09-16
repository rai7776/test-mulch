(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SmartReaderWorkspaceBackup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const FORMAT = 'smart-reader-workspace-backup';
    const BACKUP_VERSION = 1;

    function isObject(value) {
        return !!value && typeof value === 'object' && !Array.isArray(value);
    }

    function uniqueRestoredName(workspaces, desired) {
        const base = String(desired || '復元したスペース').trim() || '復元したスペース';
        const names = new Set((workspaces || []).map(item => String(item?.name || '')));
        if (!names.has(base)) return base;
        let index = 1;
        let candidate = `${base} (復元)`;
        while (names.has(candidate)) candidate = `${base} (復元 ${++index})`;
        return candidate;
    }

    function generateWorkspaceId(now = Date.now()) {
        return `workspace-restored-${Number(now).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function resolveDataKeys(workspace, activeId, workspaceApi) {
        const active = workspace?.id === activeId;
        return {
            libraryKey: active ? workspaceApi.ACTIVE_LIBRARY_KEY : workspace.libraryKey,
            studyHistoryKey: active ? workspaceApi.ACTIVE_STUDY_HISTORY_KEY : workspace.studyHistoryKey
        };
    }

    function captureLocalSettings(workspace, activeId, workspaceApi, localStore) {
        const values = {};
        if (!localStore || typeof localStore.getItem !== 'function') return values;
        const active = workspace.id === activeId;
        for (const key of workspaceApi.WORKSPACE_LOCAL_SETTING_KEYS || []) {
            const sourceKey = active ? key : workspaceApi.dedicatedLocalSettingKey(workspace.id, key);
            values[key] = localStore.getItem(sourceKey);
        }
        return values;
    }

    async function createWorkspaceBackup(database, workspaceApi, workspaceId, localStore = null, now = Date.now()) {
        const state = await workspaceApi.readWorkspaceState(database);
        const workspace = (state.workspaces || []).find(item => item.id === workspaceId);
        if (!workspace) throw new Error('Workspace not found.');
        const keys = resolveDataKeys(workspace, state.activeWorkspaceId, workspaceApi);
        const libraryItems = await database.getItem(keys.libraryKey);
        const studyHistory = await database.getItem(keys.studyHistoryKey);
        return {
            format: FORMAT,
            backupVersion: BACKUP_VERSION,
            exportedAt: new Date(now).toISOString(),
            workspace: {
                name: workspace.name,
                kind: workspace.kind,
                contentLanguage: workspace.contentLanguage || '',
                explanationLanguageOverride: workspace.explanationLanguageOverride || null
            },
            data: {
                libraryItems: Array.isArray(libraryItems) ? libraryItems : [],
                studyHistory: Array.isArray(studyHistory) ? studyHistory : [],
                localSettings: captureLocalSettings(workspace, state.activeWorkspaceId, workspaceApi, localStore)
            }
        };
    }

    function validateWorkspaceBackup(raw) {
        if (!isObject(raw) || raw.format !== FORMAT) return { valid: false, error: '学習スペースのバックアップ形式ではありません。' };
        if (raw.backupVersion !== BACKUP_VERSION) return { valid: false, error: 'このバックアップVersionには対応していません。' };
        if (!isObject(raw.workspace) || !String(raw.workspace.name || '').trim()) return { valid: false, error: 'スペース情報が不正です。' };
        if (!['language', 'general'].includes(raw.workspace.kind)) return { valid: false, error: 'スペース種類が不正です。' };
        if (raw.workspace.kind === 'language' && !String(raw.workspace.contentLanguage || '').trim()) return { valid: false, error: '学習対象言語がありません。' };
        if (!isObject(raw.data) || !Array.isArray(raw.data.libraryItems) || !Array.isArray(raw.data.studyHistory)) return { valid: false, error: 'バックアップデータが不正です。' };
        if (raw.data.localSettings !== undefined && !isObject(raw.data.localSettings)) return { valid: false, error: 'Study設定の形式が不正です。' };
        return { valid: true, backup: raw };
    }

    function writeArchivedLocalSettings(workspaceId, settings, workspaceApi, localStore) {
        if (!localStore || typeof localStore.setItem !== 'function' || !isObject(settings)) return [];
        const written = [];
        for (const key of workspaceApi.WORKSPACE_LOCAL_SETTING_KEYS || []) {
            const value = settings[key];
            if (value === null || value === undefined) continue;
            const targetKey = workspaceApi.dedicatedLocalSettingKey(workspaceId, key);
            localStore.setItem(targetKey, String(value));
            written.push(targetKey);
        }
        return written;
    }

    async function restoreWorkspaceBackup(database, workspaceApi, raw, localStore = null, options = {}) {
        const validation = validateWorkspaceBackup(raw);
        if (!validation.valid) throw new Error(validation.error);
        const backup = validation.backup;
        const state = await workspaceApi.readWorkspaceState(database);
        const now = Number.isFinite(options.now) ? options.now : Date.now();
        const id = options.id || generateWorkspaceId(now);
        const name = uniqueRestoredName(state.workspaces, options.name || backup.workspace.name);
        const restored = workspaceApi.createWorkspace({
            id,
            name,
            kind: backup.workspace.kind,
            contentLanguage: backup.workspace.contentLanguage || '',
            explanationLanguageOverride: backup.workspace.explanationLanguageOverride || null
        }, now);
        const originalWorkspaces = state.workspaces.slice();
        const localKeys = [];
        try {
            await database.setItem(restored.libraryKey, backup.data.libraryItems);
            await database.setItem(restored.studyHistoryKey, backup.data.studyHistory);
            localKeys.push(...writeArchivedLocalSettings(restored.id, backup.data.localSettings || {}, workspaceApi, localStore));
            await database.setItem(workspaceApi.WORKSPACES_KEY, [...originalWorkspaces, restored]);
            return restored;
        } catch (error) {
            try { await database.setItem(workspaceApi.WORKSPACES_KEY, originalWorkspaces); } catch (_) {}
            if (typeof database.removeItem === 'function') {
                try { await database.removeItem(restored.libraryKey); } catch (_) {}
                try { await database.removeItem(restored.studyHistoryKey); } catch (_) {}
            }
            if (localStore && typeof localStore.removeItem === 'function') {
                localKeys.forEach(key => { try { localStore.removeItem(key); } catch (_) {} });
            }
            throw error;
        }
    }

    return Object.freeze({
        FORMAT,
        BACKUP_VERSION,
        isObject,
        uniqueRestoredName,
        generateWorkspaceId,
        resolveDataKeys,
        captureLocalSettings,
        createWorkspaceBackup,
        validateWorkspaceBackup,
        writeArchivedLocalSettings,
        restoreWorkspaceBackup
    });
});
