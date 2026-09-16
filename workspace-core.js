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
    const ACTIVE_LIBRARY_KEY = 'library_items';
    const ACTIVE_STUDY_HISTORY_KEY = 'study_history_v1';
    const WORKSPACE_LOCAL_SETTING_KEYS = Object.freeze([
        'smart-reader-study-settings-v1',
        'smart-reader-study-example-mode',
        'smart-reader-study-center-settings-v1',
        'smart-reader-folder-study-limit-v1'
    ]);

    function normalizeLanguageCode(value, fallback = '') {
        const text = String(value ?? '').trim();
        if (!text) return fallback;
        return text;
    }

    function dedicatedLibraryKey(id) {
        return `workspace:${id}:library_items`;
    }

    function dedicatedStudyHistoryKey(id) {
        return `workspace:${id}:study_history_v1`;
    }

    function dedicatedLocalSettingKey(id, key) {
        return `smart-reader-workspace:${id}:local:${key}`;
    }

    function createDefaultWorkspace(now = Date.now()) {
        return {
            id: DEFAULT_WORKSPACE_ID,
            name: '英語',
            kind: 'language',
            contentLanguage: 'en',
            explanationLanguageOverride: null,
            libraryKey: ACTIVE_LIBRARY_KEY,
            studyHistoryKey: ACTIVE_STUDY_HISTORY_KEY,
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
            libraryKey: input.libraryKey || dedicatedLibraryKey(id),
            studyHistoryKey: input.studyHistoryKey || dedicatedStudyHistoryKey(id),
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

    function captureActiveLocalSettings(localStore) {
        if (!localStore || typeof localStore.getItem !== 'function') return null;
        const snapshot = {};
        for (const key of WORKSPACE_LOCAL_SETTING_KEYS) {
            snapshot[key] = localStore.getItem(key);
        }
        return snapshot;
    }

    function readArchivedLocalSettings(localStore, workspaceId) {
        if (!localStore || typeof localStore.getItem !== 'function') return null;
        const snapshot = {};
        for (const key of WORKSPACE_LOCAL_SETTING_KEYS) {
            snapshot[key] = localStore.getItem(dedicatedLocalSettingKey(workspaceId, key));
        }
        return snapshot;
    }

    function applyActiveLocalSettings(localStore, snapshot) {
        if (!localStore || !snapshot) return;
        for (const key of WORKSPACE_LOCAL_SETTING_KEYS) {
            const value = snapshot[key];
            if (value === null || value === undefined) {
                if (typeof localStore.removeItem === 'function') localStore.removeItem(key);
            } else {
                localStore.setItem(key, value);
            }
        }
    }

    function archiveActiveLocalSettings(localStore, workspaceId, snapshot) {
        if (!localStore || !snapshot) return;
        for (const key of WORKSPACE_LOCAL_SETTING_KEYS) {
            const archiveKey = dedicatedLocalSettingKey(workspaceId, key);
            const value = snapshot[key];
            if (value === null || value === undefined) {
                if (typeof localStore.removeItem === 'function') localStore.removeItem(archiveKey);
            } else {
                localStore.setItem(archiveKey, value);
            }
        }
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

    async function ensureWorkspaceMetadata(database) {
        const workspaces = normalizeWorkspaceList(await database.getItem(WORKSPACES_KEY));
        const settings = await database.getItem(GLOBAL_SETTINGS_KEY);
        const activeId = await database.getItem(ACTIVE_WORKSPACE_KEY);
        const needsRepair = workspaces.length === 0
            || !getWorkspaceById(workspaces, activeId)
            || !settings
            || typeof settings !== 'object'
            || Array.isArray(settings)
            || !normalizeLanguageCode(settings.explanationLanguage);
        if (needsRepair) {
            await migrateToWorkspaceMetadata(database, WORKSPACE_SCHEMA_VERSION, WORKSPACE_SCHEMA_VERSION);
        }
    }

    async function readWorkspaceState(database) {
        await ensureWorkspaceMetadata(database);
        const workspaces = normalizeWorkspaceList(await database.getItem(WORKSPACES_KEY));
        const activeWorkspaceId = await database.getItem(ACTIVE_WORKSPACE_KEY);
        const activeWorkspace = getWorkspaceById(workspaces, activeWorkspaceId) || workspaces[0] || null;
        const globalSettings = await database.getItem(GLOBAL_SETTINGS_KEY) || {
            explanationLanguage: DEFAULT_EXPLANATION_LANGUAGE
        };
        return { workspaces, activeWorkspaceId: activeWorkspace?.id || null, activeWorkspace, globalSettings };
    }

    async function addWorkspace(database, input, now = Date.now()) {
        const state = await readWorkspaceState(database);
        const workspace = createWorkspace(input, now);
        if (getWorkspaceById(state.workspaces, workspace.id)) {
            throw new Error('A workspace with this id already exists.');
        }
        await database.setItem(workspace.libraryKey, []);
        await database.setItem(workspace.studyHistoryKey, []);
        const workspaces = [...state.workspaces, workspace];
        await database.setItem(WORKSPACES_KEY, workspaces);
        return workspace;
    }

    async function switchWorkspace(database, targetId, localStore = null) {
        if (!database || typeof database.getItem !== 'function' || typeof database.setItem !== 'function') {
            throw new TypeError('A LocalForage-compatible database instance is required.');
        }
        const state = await readWorkspaceState(database);
        const current = state.activeWorkspace;
        const target = getWorkspaceById(state.workspaces, targetId);
        if (!target) throw new Error('Workspace not found.');
        if (!current || current.id === target.id) return state;

        const originalWorkspaces = state.workspaces.map(item => ({ ...item }));
        const originalActiveId = state.activeWorkspaceId;
        const currentLibrary = await database.getItem(ACTIVE_LIBRARY_KEY) || [];
        const currentHistory = await database.getItem(ACTIVE_STUDY_HISTORY_KEY) || [];
        const currentLocalSettings = captureActiveLocalSettings(localStore);
        const targetLocalSettings = readArchivedLocalSettings(localStore, target.id);
        const targetLibrarySourceKey = target.libraryKey === ACTIVE_LIBRARY_KEY
            ? dedicatedLibraryKey(target.id)
            : target.libraryKey;
        const targetHistorySourceKey = target.studyHistoryKey === ACTIVE_STUDY_HISTORY_KEY
            ? dedicatedStudyHistoryKey(target.id)
            : target.studyHistoryKey;
        const targetLibrary = await database.getItem(targetLibrarySourceKey) || [];
        const targetHistory = await database.getItem(targetHistorySourceKey) || [];
        const currentLibraryArchiveKey = dedicatedLibraryKey(current.id);
        const currentHistoryArchiveKey = dedicatedStudyHistoryKey(current.id);

        try {
            // Persist the workspace we are leaving before replacing the active aliases.
            await database.setItem(currentLibraryArchiveKey, currentLibrary);
            await database.setItem(currentHistoryArchiveKey, currentHistory);
            archiveActiveLocalSettings(localStore, current.id, currentLocalSettings);

            // The legacy app continues to use these active aliases.
            await database.setItem(ACTIVE_LIBRARY_KEY, targetLibrary);
            await database.setItem(ACTIVE_STUDY_HISTORY_KEY, targetHistory);
            applyActiveLocalSettings(localStore, targetLocalSettings);

            const updatedWorkspaces = state.workspaces.map(item => {
                if (item.id === current.id) {
                    return {
                        ...item,
                        libraryKey: currentLibraryArchiveKey,
                        studyHistoryKey: currentHistoryArchiveKey
                    };
                }
                if (item.id === target.id) {
                    return {
                        ...item,
                        libraryKey: ACTIVE_LIBRARY_KEY,
                        studyHistoryKey: ACTIVE_STUDY_HISTORY_KEY
                    };
                }
                return item;
            });
            await database.setItem(WORKSPACES_KEY, updatedWorkspaces);
            await database.setItem(ACTIVE_WORKSPACE_KEY, target.id);

            // Keep target archive copies as a safety snapshot. They are overwritten
            // with the latest active data when that workspace is left again.
            return readWorkspaceState(database);
        } catch (error) {
            // Roll back the visible aliases/settings and metadata. Archive copies may remain safely.
            try { await database.setItem(ACTIVE_LIBRARY_KEY, currentLibrary); } catch (_) {}
            try { await database.setItem(ACTIVE_STUDY_HISTORY_KEY, currentHistory); } catch (_) {}
            try { applyActiveLocalSettings(localStore, currentLocalSettings); } catch (_) {}
            try { await database.setItem(WORKSPACES_KEY, originalWorkspaces); } catch (_) {}
            try { await database.setItem(ACTIVE_WORKSPACE_KEY, originalActiveId); } catch (_) {}
            throw error;
        }
    }

    async function updateGlobalSettings(database, patch = {}) {
        const state = await readWorkspaceState(database);
        const next = {
            ...state.globalSettings,
            ...patch
        };
        if (!normalizeLanguageCode(next.explanationLanguage)) {
            next.explanationLanguage = DEFAULT_EXPLANATION_LANGUAGE;
        }
        await database.setItem(GLOBAL_SETTINGS_KEY, next);
        return next;
    }

    return Object.freeze({
        WORKSPACES_KEY,
        ACTIVE_WORKSPACE_KEY,
        GLOBAL_SETTINGS_KEY,
        DEFAULT_WORKSPACE_ID,
        DEFAULT_EXPLANATION_LANGUAGE,
        WORKSPACE_SCHEMA_VERSION,
        WORKSPACE_KINDS,
        ACTIVE_LIBRARY_KEY,
        ACTIVE_STUDY_HISTORY_KEY,
        WORKSPACE_LOCAL_SETTING_KEYS,
        normalizeLanguageCode,
        dedicatedLibraryKey,
        dedicatedStudyHistoryKey,
        dedicatedLocalSettingKey,
        createDefaultWorkspace,
        createWorkspace,
        normalizeWorkspaceList,
        getWorkspaceById,
        captureActiveLocalSettings,
        readArchivedLocalSettings,
        applyActiveLocalSettings,
        archiveActiveLocalSettings,
        migrateToWorkspaceMetadata,
        ensureWorkspaceMetadata,
        readWorkspaceState,
        addWorkspace,
        switchWorkspace,
        updateGlobalSettings
    });
});
