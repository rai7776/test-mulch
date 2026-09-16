(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SmartReaderWorkspace = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const WORKSPACE_SCHEMA_VERSION = 1;
    const WORKSPACES_KEY = 'smart_reader_workspaces_v1';
    const ACTIVE_WORKSPACE_KEY = 'smart_reader_active_workspace_id_v1';
    const GLOBAL_SETTINGS_KEY = 'smart_reader_global_settings_v1';
    const MIGRATION_KEY = 'smart_reader_workspace_migration_v1';
    const ACTIVE_WORKSPACE_LOCAL_KEY = 'smart-reader-active-workspace-id-v1';
    const WORKSPACE_PREFIX = 'smart_reader_workspace:';
    const DEFAULT_WORKSPACE_ID = 'ws-english';
    const DEFAULT_EXPLANATION_LANGUAGE = 'ja';

    const SCOPED_DB_KEYS = new Set(['library_items', 'study_history_v1']);
    const SCOPED_LOCAL_STORAGE_KEYS = new Set([
        'smart-reader-study-settings-v1',
        'smart-reader-study-example-mode',
        'smart-reader-study-center-settings-v1',
        'smart-reader-folder-study-limit-v1'
    ]);
    const INTERNAL_DB_KEYS = new Set([
        WORKSPACES_KEY,
        ACTIVE_WORKSPACE_KEY,
        GLOBAL_SETTINGS_KEY,
        MIGRATION_KEY,
        'smart_reader_schema_version'
    ]);

    function clone(value) {
        if (value === undefined) return undefined;
        if (value === null) return null;
        try {
            if (typeof structuredClone === 'function') return structuredClone(value);
        } catch (_) {}
        return JSON.parse(JSON.stringify(value));
    }
    function nowIso() { return new Date().toISOString(); }
    function safeWorkspaceId(value) {
        const text = String(value || '').trim();
        if (!text) return '';
        return /^[A-Za-z0-9_-]{1,80}$/.test(text) ? text : '';
    }
    function newWorkspaceId() {
        return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }
    function normalizeLanguage(value, fallback = '') {
        const text = String(value || '').trim();
        if (!text) return fallback;
        return /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(text) ? text : fallback;
    }
    function normalizeWorkspace(record, fallback = {}) {
        const createdAt = String(record?.createdAt || fallback.createdAt || nowIso());
        const id = safeWorkspaceId(record?.id) || safeWorkspaceId(fallback.id) || newWorkspaceId();
        const kind = record?.kind === 'general' ? 'general' : 'language';
        return {
            id,
            name: String(record?.name || fallback.name || '学習スペース').trim() || '学習スペース',
            kind,
            contentLanguage: kind === 'language'
                ? normalizeLanguage(record?.contentLanguage, normalizeLanguage(fallback.contentLanguage, 'en'))
                : null,
            explanationLanguageOverride: normalizeLanguage(record?.explanationLanguageOverride, '') || null,
            createdAt,
            updatedAt: String(record?.updatedAt || fallback.updatedAt || createdAt)
        };
    }
    function defaultWorkspace() {
        return normalizeWorkspace({
            id: DEFAULT_WORKSPACE_ID,
            name: '英語',
            kind: 'language',
            contentLanguage: 'en'
        });
    }
    function normalizeWorkspaceList(value) {
        const source = Array.isArray(value) ? value : [];
        const ids = new Set();
        const result = [];
        source.forEach(item => {
            const normalized = normalizeWorkspace(item);
            if (ids.has(normalized.id)) return;
            ids.add(normalized.id);
            result.push(normalized);
        });
        return result;
    }
    function normalizeGlobalSettings(value) {
        return {
            explanationLanguage: normalizeLanguage(value?.explanationLanguage, DEFAULT_EXPLANATION_LANGUAGE),
            uiLocale: normalizeLanguage(value?.uiLocale, 'ja')
        };
    }
    function workspaceDbKey(workspaceId, logicalKey) {
        const id = safeWorkspaceId(workspaceId);
        if (!id) throw new Error('Invalid workspace id.');
        return `${WORKSPACE_PREFIX}${id}:db:${String(logicalKey)}`;
    }
    function workspaceLocalKey(workspaceId, logicalKey) {
        const id = safeWorkspaceId(workspaceId);
        if (!id) throw new Error('Invalid workspace id.');
        return `${WORKSPACE_PREFIX}${id}:local:${String(logicalKey)}`;
    }
    function isWorkspacePhysicalKey(key) {
        return String(key || '').startsWith(WORKSPACE_PREFIX);
    }
    function bindRawDatabase(database) {
        const foundationRaw = database?.__smartReaderStorageFoundation?.raw;
        if (foundationRaw?.getItem && foundationRaw?.setItem) return foundationRaw;
        if (!database || typeof database.getItem !== 'function' || typeof database.setItem !== 'function') {
            throw new TypeError('A LocalForage-compatible database instance is required.');
        }
        const bind = name => typeof database[name] === 'function' ? database[name].bind(database) : null;
        return {
            getItem: bind('getItem'), setItem: bind('setItem'), removeItem: bind('removeItem'),
            clear: bind('clear'), keys: bind('keys'), iterate: bind('iterate'),
            length: bind('length'), key: bind('key')
        };
    }
    function bindRawStorage(storage) {
        if (!storage?.getItem || !storage?.setItem || !storage?.removeItem) return null;
        return {
            getItem: storage.getItem.bind(storage),
            setItem: storage.setItem.bind(storage),
            removeItem: storage.removeItem.bind(storage)
        };
    }
    function readMirroredActiveId(rawStorage) {
        try { return safeWorkspaceId(rawStorage?.getItem?.(ACTIVE_WORKSPACE_LOCAL_KEY)); }
        catch (_) { return ''; }
    }
    function writeMirroredActiveId(rawStorage, workspaceId) {
        try { rawStorage?.setItem?.(ACTIVE_WORKSPACE_LOCAL_KEY, workspaceId); } catch (_) {}
    }
    function copyLegacyLocalStorage(rawStorage, workspaceId) {
        if (!rawStorage) return;
        SCOPED_LOCAL_STORAGE_KEYS.forEach(key => {
            try {
                const targetKey = workspaceLocalKey(workspaceId, key);
                if (rawStorage.getItem(targetKey) !== null) return;
                const legacyValue = rawStorage.getItem(key);
                if (legacyValue !== null) rawStorage.setItem(targetKey, legacyValue);
            } catch (_) {}
        });
    }

    async function ensureWorkspaceState(raw, rawStorage, preferredActiveId) {
        let workspaces = normalizeWorkspaceList(await raw.getItem(WORKSPACES_KEY));
        const migration = await raw.getItem(MIGRATION_KEY);
        const needsLegacyCopy = !migration || Number(migration.version) < WORKSPACE_SCHEMA_VERSION;
        if (!workspaces.length) workspaces = [defaultWorkspace()];

        const storedActiveId = safeWorkspaceId(await raw.getItem(ACTIVE_WORKSPACE_KEY));
        let activeId = safeWorkspaceId(preferredActiveId)
            || storedActiveId
            || readMirroredActiveId(rawStorage)
            || workspaces[0].id;
        if (!workspaces.some(item => item.id === activeId)) activeId = workspaces[0].id;

        const migrationTargetId = workspaces.some(item => item.id === DEFAULT_WORKSPACE_ID)
            ? DEFAULT_WORKSPACE_ID
            : activeId;

        if (needsLegacyCopy) {
            for (const logicalKey of SCOPED_DB_KEYS) {
                const targetKey = workspaceDbKey(migrationTargetId, logicalKey);
                const existingTarget = await raw.getItem(targetKey);
                if (existingTarget !== null && existingTarget !== undefined) continue;
                const legacyValue = await raw.getItem(logicalKey);
                if (legacyValue !== null && legacyValue !== undefined) {
                    await raw.setItem(targetKey, clone(legacyValue));
                }
            }
            copyLegacyLocalStorage(rawStorage, migrationTargetId);
        }

        const globalSettings = normalizeGlobalSettings(await raw.getItem(GLOBAL_SETTINGS_KEY));
        await raw.setItem(WORKSPACES_KEY, workspaces);
        await raw.setItem(ACTIVE_WORKSPACE_KEY, activeId);
        await raw.setItem(GLOBAL_SETTINGS_KEY, globalSettings);
        await raw.setItem(MIGRATION_KEY, {
            version: WORKSPACE_SCHEMA_VERSION,
            migratedAt: String(migration?.migratedAt || nowIso()),
            legacyCopied: !!needsLegacyCopy
        });
        writeMirroredActiveId(rawStorage, activeId);
        return { workspaces, activeId, globalSettings, legacyCopied: !!needsLegacyCopy };
    }

    function installLocalStorageScoping(storage, rawStorage, getActiveId) {
        if (!storage || !rawStorage || storage.__smartReaderWorkspaceScoped) return;
        const mapKey = key => SCOPED_LOCAL_STORAGE_KEYS.has(String(key))
            ? workspaceLocalKey(getActiveId() || DEFAULT_WORKSPACE_ID, key)
            : String(key);
        try {
            storage.getItem = key => rawStorage.getItem(mapKey(key));
            storage.setItem = (key, value) => rawStorage.setItem(mapKey(key), value);
            storage.removeItem = key => rawStorage.removeItem(mapKey(key));
            Object.defineProperty(storage, '__smartReaderWorkspaceScoped', {
                configurable: false,
                enumerable: false,
                value: Object.freeze({ original: rawStorage, mapKey })
            });
        } catch (_) {
            // Database data remains isolated even if a browser refuses Storage method overrides.
        }
    }

    function install(database, storage) {
        if (database?.__smartReaderWorkspace) return database.__smartReaderWorkspace;
        const raw = bindRawDatabase(database);
        const rawStorage = bindRawStorage(storage);
        let activeId = readMirroredActiveId(rawStorage);
        let workspaceCache = [];
        let globalSettingsCache = normalizeGlobalSettings(null);

        const ready = ensureWorkspaceState(raw, rawStorage, activeId).then(state => {
            activeId = state.activeId;
            workspaceCache = state.workspaces;
            globalSettingsCache = state.globalSettings;
            return state;
        });

        installLocalStorageScoping(storage, rawStorage, () => activeId);

        const mapDbKey = key => SCOPED_DB_KEYS.has(String(key))
            ? workspaceDbKey(activeId || DEFAULT_WORKSPACE_ID, key)
            : String(key);

        database.getItem = async key => {
            await ready;
            return raw.getItem(mapDbKey(key));
        };
        database.setItem = async (key, value) => {
            await ready;
            return raw.setItem(mapDbKey(key), value);
        };
        database.removeItem = async key => {
            await ready;
            const text = String(key);
            if (INTERNAL_DB_KEYS.has(text)) return undefined;
            return raw.removeItem(mapDbKey(text));
        };
        database.keys = async () => {
            await ready;
            const rawKeys = await raw.keys();
            const visible = [];
            rawKeys.forEach(key => {
                const text = String(key);
                if (INTERNAL_DB_KEYS.has(text) || isWorkspacePhysicalKey(text) || SCOPED_DB_KEYS.has(text)) return;
                visible.push(text);
            });
            for (const logicalKey of SCOPED_DB_KEYS) {
                const value = await raw.getItem(workspaceDbKey(activeId, logicalKey));
                if (value !== null && value !== undefined) visible.push(logicalKey);
            }
            return [...new Set(visible)];
        };
        database.iterate = async iterator => {
            const keys = await database.keys();
            let index = 1;
            for (const key of keys) {
                const result = iterator(await database.getItem(key), key, index++);
                if (result !== undefined) return result;
            }
            return undefined;
        };
        database.length = async () => (await database.keys()).length;
        database.key = async index => (await database.keys())[index] ?? null;
        database.clear = async () => {
            await ready;
            const keys = await database.keys();
            for (const key of keys) await database.removeItem(key);
        };

        async function persistWorkspaces(next) {
            workspaceCache = normalizeWorkspaceList(next);
            await raw.setItem(WORKSPACES_KEY, workspaceCache);
            return clone(workspaceCache);
        }
        async function listWorkspaces() {
            await ready;
            return clone(workspaceCache);
        }
        async function getActiveWorkspace() {
            await ready;
            return clone(workspaceCache.find(item => item.id === activeId) || null);
        }
        async function createWorkspace(input = {}) {
            await ready;
            const record = normalizeWorkspace({
                ...input,
                id: safeWorkspaceId(input.id) || newWorkspaceId(),
                createdAt: nowIso(),
                updatedAt: nowIso()
            });
            if (workspaceCache.some(item => item.id === record.id)) throw new Error('Workspace id already exists.');
            await persistWorkspaces([...workspaceCache, record]);
            await raw.setItem(workspaceDbKey(record.id, 'library_items'), []);
            return clone(record);
        }
        async function updateWorkspace(workspaceId, patch = {}) {
            await ready;
            const id = safeWorkspaceId(workspaceId);
            const index = workspaceCache.findIndex(item => item.id === id);
            if (index < 0) throw new Error('Workspace not found.');
            const current = workspaceCache[index];
            const next = normalizeWorkspace({
                ...current,
                ...patch,
                id: current.id,
                createdAt: current.createdAt,
                updatedAt: nowIso()
            });
            const list = workspaceCache.slice();
            list[index] = next;
            await persistWorkspaces(list);
            return clone(next);
        }
        async function switchWorkspace(workspaceId) {
            await ready;
            const id = safeWorkspaceId(workspaceId);
            if (!workspaceCache.some(item => item.id === id)) throw new Error('Workspace not found.');
            activeId = id;
            await raw.setItem(ACTIVE_WORKSPACE_KEY, id);
            writeMirroredActiveId(rawStorage, id);
            return clone(workspaceCache.find(item => item.id === id));
        }
        async function deleteWorkspace(workspaceId) {
            await ready;
            const id = safeWorkspaceId(workspaceId);
            if (!workspaceCache.some(item => item.id === id)) return false;
            if (workspaceCache.length <= 1) throw new Error('The last workspace cannot be deleted.');
            for (const logicalKey of SCOPED_DB_KEYS) await raw.removeItem(workspaceDbKey(id, logicalKey));
            if (rawStorage) {
                SCOPED_LOCAL_STORAGE_KEYS.forEach(key => {
                    try { rawStorage.removeItem(workspaceLocalKey(id, key)); } catch (_) {}
                });
            }
            const next = workspaceCache.filter(item => item.id !== id);
            await persistWorkspaces(next);
            if (activeId === id) await switchWorkspace(next[0].id);
            return true;
        }
        async function getGlobalSettings() {
            await ready;
            return clone(globalSettingsCache);
        }
        async function updateGlobalSettings(patch = {}) {
            await ready;
            globalSettingsCache = normalizeGlobalSettings({ ...globalSettingsCache, ...patch });
            await raw.setItem(GLOBAL_SETTINGS_KEY, globalSettingsCache);
            return clone(globalSettingsCache);
        }
        async function exportWorkspace(workspaceId = activeId) {
            await ready;
            const id = safeWorkspaceId(workspaceId);
            const workspace = workspaceCache.find(item => item.id === id);
            if (!workspace) throw new Error('Workspace not found.');
            const data = {};
            for (const logicalKey of SCOPED_DB_KEYS) {
                const value = await raw.getItem(workspaceDbKey(id, logicalKey));
                if (value !== null && value !== undefined) data[logicalKey] = clone(value);
            }
            const localSettings = {};
            if (rawStorage) {
                SCOPED_LOCAL_STORAGE_KEYS.forEach(key => {
                    const value = rawStorage.getItem(workspaceLocalKey(id, key));
                    if (value !== null) localSettings[key] = value;
                });
            }
            return {
                format: 'smart-reader-workspace',
                version: 1,
                exportedAt: nowIso(),
                workspace: clone(workspace),
                data,
                localSettings
            };
        }
        async function exportAll() {
            await ready;
            const workspaces = [];
            for (const item of workspaceCache) workspaces.push(await exportWorkspace(item.id));
            return {
                format: 'smart-reader-all-workspaces',
                version: 1,
                exportedAt: nowIso(),
                activeWorkspaceId: activeId,
                globalSettings: clone(globalSettingsCache),
                workspaces
            };
        }

        const api = Object.freeze({
            ready, raw, rawStorage, mapDbKey, listWorkspaces, getActiveWorkspace,
            createWorkspace, updateWorkspace, switchWorkspace, deleteWorkspace,
            getGlobalSettings, updateGlobalSettings, exportWorkspace, exportAll,
            getActiveWorkspaceId: () => activeId
        });
        Object.defineProperty(database, '__smartReaderWorkspace', {
            configurable: false,
            enumerable: false,
            value: api
        });
        return api;
    }

    return Object.freeze({
        WORKSPACE_SCHEMA_VERSION, WORKSPACES_KEY, ACTIVE_WORKSPACE_KEY, GLOBAL_SETTINGS_KEY,
        MIGRATION_KEY, ACTIVE_WORKSPACE_LOCAL_KEY, WORKSPACE_PREFIX, DEFAULT_WORKSPACE_ID,
        DEFAULT_EXPLANATION_LANGUAGE, SCOPED_DB_KEYS, SCOPED_LOCAL_STORAGE_KEYS,
        safeWorkspaceId, normalizeLanguage, normalizeWorkspace, normalizeWorkspaceList,
        normalizeGlobalSettings, defaultWorkspace, workspaceDbKey, workspaceLocalKey,
        ensureWorkspaceState, install
    });
});
