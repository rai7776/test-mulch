(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SmartReaderWorkspace = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const WORKSPACES_KEY = 'smart_reader_workspaces_v1';
    const ACTIVE_WORKSPACE_KEY = 'smart_reader_active_workspace_id';
    const GLOBAL_SETTINGS_KEY = 'smart_reader_global_settings_v1';
    const DEFAULT_WORKSPACE_ID = 'workspace-english';
    const DEFAULT_EXPLANATION_LANGUAGE = 'ja';
    const WORKSPACE_SCHEMA_VERSION = 2;
    const WORKSPACE_KINDS = Object.freeze(['language', 'general']);

    function normalizeLanguageCode(value, fallback = '') {
        const text = String(value ?? '').trim();
        if (!text) return fallback;
        return text;
    }

    function createDefaultWorkspace(now = Date.now()) {
        return {
            id: DEFAULT_WORKSPACE_ID,
            name: '英語',
            kind: 'language',
            contentLanguage: 'en',
            explanationLanguageOverride: null,
            libraryKey: 'library_items',
            studyHistoryKey: 'study_history_v1',
            createdAt: Number.isFinite(now) ? now : Date.now(),
            migratedFromLegacy: true
        };
    }

    function createWorkspace(input = {}, now = Date.now()) {
        const id = String(input.id || '').trim();
        const name = String(input.name || '').trim();
        const kind = WORKSPACE_KINDS.includes(input.kind) ? input.kind : 'language';
        if (!id) throw new Error('Workspace id is required.');
        if (!name) throw new Error('Workspace name is required.');
        const contentLanguage = kind === 'language'
            ? normalizeLanguageCode(input.contentLanguage)
            : '';
        if (kind === 'language' && !contentLanguage) {
            throw new Error('Language workspaces require contentLanguage.');
        }
        return {
            id,
            name,
            kind,
            contentLanguage,
            explanationLanguageOverride: input.explanationLanguageOverride || null,
            libraryKey: input.libraryKey || `workspace:${id}:library_items`,
            studyHistoryKey: input.studyHistoryKey || `workspace:${id}:study_history_v1`,
            createdAt: Number.isFinite(now) ? now : Date.now(),
            migratedFromLegacy: !!input.migratedFromLegacy
        };
    }

    function normalizeWorkspaceList(value) {
        if (!Array.isArray(value)) return [];
        return value.filter(item => item && typeof item === 'object' && String(item.id || '').trim());
    }

    function getWorkspaceById(workspaces, id) {
        return normalizeWorkspaceList(workspaces).find(item => item.id === id) || null;
    }

    async function migrateToWorkspaceMetadata(raw, _fromVersion, _toVersion, now = Date.now()) {
        let workspaces = normalizeWorkspaceList(await raw.getItem(WORKSPACES_KEY));
        if (workspaces.length === 0) {
            workspaces = [createDefaultWorkspace(now)];
            await raw.setItem(WORKSPACES_KEY, workspaces);
        }

        const currentActive = await raw.getItem(ACTIVE_WORKSPACE_KEY);
        if (!getWorkspaceById(workspaces, currentActive)) {
            await raw.setItem(ACTIVE_WORKSPACE_KEY, workspaces[0].id);
        }

        const currentSettings = await raw.getItem(GLOBAL_SETTINGS_KEY);
        if (!currentSettings || typeof currentSettings !== 'object' || Array.isArray(currentSettings)) {
            await raw.setItem(GLOBAL_SETTINGS_KEY, {
                explanationLanguage: DEFAULT_EXPLANATION_LANGUAGE
            });
        } else if (!normalizeLanguageCode(currentSettings.explanationLanguage)) {
            await raw.setItem(GLOBAL_SETTINGS_KEY, {
                ...currentSettings,
                explanationLanguage: DEFAULT_EXPLANATION_LANGUAGE
            });
        }

        return {
            workspaces,
            activeWorkspaceId: await raw.getItem(ACTIVE_WORKSPACE_KEY),
            globalSettings: await raw.getItem(GLOBAL_SETTINGS_KEY)
        };
    }

    async function readWorkspaceState(database) {
        const workspaces = normalizeWorkspaceList(await database.getItem(WORKSPACES_KEY));
        const activeWorkspaceId = await database.getItem(ACTIVE_WORKSPACE_KEY);
        const activeWorkspace = getWorkspaceById(workspaces, activeWorkspaceId) || workspaces[0] || null;
        const globalSettings = await database.getItem(GLOBAL_SETTINGS_KEY) || {
            explanationLanguage: DEFAULT_EXPLANATION_LANGUAGE
        };
        return { workspaces, activeWorkspaceId: activeWorkspace?.id || null, activeWorkspace, globalSettings };
    }

    return Object.freeze({
        WORKSPACES_KEY,
        ACTIVE_WORKSPACE_KEY,
        GLOBAL_SETTINGS_KEY,
        DEFAULT_WORKSPACE_ID,
        DEFAULT_EXPLANATION_LANGUAGE,
        WORKSPACE_SCHEMA_VERSION,
        WORKSPACE_KINDS,
        normalizeLanguageCode,
        createDefaultWorkspace,
        createWorkspace,
        normalizeWorkspaceList,
        getWorkspaceById,
        migrateToWorkspaceMetadata,
        readWorkspaceState
    });
});
