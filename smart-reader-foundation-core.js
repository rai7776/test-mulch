(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SmartReaderFoundation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const DB_NAME = 'ProjectA_DB_v3';
    const SCHEMA_VERSION_KEY = 'smart_reader_schema_version';
    const CURRENT_SCHEMA_VERSION = 1;
    const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);

    function normalizeSchemaVersion(value) {
        if (value === null || value === undefined || value === '') return 0;
        const numeric = Number(value);
        return Number.isInteger(numeric) && numeric >= 0 ? numeric : 0;
    }

    function sanitizeExternalUrl(value, baseUrl) {
        const raw = String(value ?? '').trim();
        if (!raw) return null;
        try {
            const url = new URL(raw, baseUrl || 'https://smart-reader.invalid/');
            if (!ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol)) return null;
            return url.href;
        } catch (_) {
            return null;
        }
    }

    async function migrateSchema(raw, options = {}) {
        const currentVersion = Number.isInteger(options.currentVersion)
            ? options.currentVersion
            : CURRENT_SCHEMA_VERSION;
        const migrations = options.migrations || {};
        let version = normalizeSchemaVersion(await raw.getItem(SCHEMA_VERSION_KEY));

        if (version > currentVersion) {
            throw new Error(`Smart Reader data schema ${version} is newer than this app supports (${currentVersion}).`);
        }

        // Version 1 is the baseline for the existing ProjectA_DB_v3 data shape.
        // No user data is rewritten here; we only mark the schema so future
        // migrations can be explicit and reversible.
        while (version < currentVersion) {
            const nextVersion = version + 1;
            const migration = migrations[nextVersion];
            if (typeof migration === 'function') {
                await migration(raw, version, nextVersion);
            }
            await raw.setItem(SCHEMA_VERSION_KEY, nextVersion);
            version = nextVersion;
        }
        return version;
    }

    function bindRawDatabase(database) {
        if (!database || typeof database.getItem !== 'function' || typeof database.setItem !== 'function') {
            throw new TypeError('A LocalForage-compatible database instance is required.');
        }
        const bind = name => typeof database[name] === 'function' ? database[name].bind(database) : null;
        return {
            getItem: bind('getItem'),
            setItem: bind('setItem'),
            removeItem: bind('removeItem'),
            clear: bind('clear'),
            keys: bind('keys'),
            iterate: bind('iterate'),
            length: bind('length'),
            key: bind('key')
        };
    }

    function installStorageFoundation(database, options = {}) {
        if (database && database.__smartReaderStorageFoundation) {
            return database.__smartReaderStorageFoundation;
        }

        const raw = bindRawDatabase(database);
        let readyPromise = null;
        const ensureSchema = () => {
            if (!readyPromise) readyPromise = migrateSchema(raw, options);
            return readyPromise;
        };

        const wrap = (name, operation) => {
            if (!raw[name]) return;
            database[name] = operation;
        };

        wrap('getItem', async (key, ...args) => {
            await ensureSchema();
            return raw.getItem(key, ...args);
        });
        wrap('setItem', async (key, value, ...args) => {
            await ensureSchema();
            return raw.setItem(key, value, ...args);
        });
        wrap('removeItem', async (key, ...args) => {
            await ensureSchema();
            if (key === SCHEMA_VERSION_KEY) return undefined;
            return raw.removeItem(key, ...args);
        });
        wrap('keys', async (...args) => {
            await ensureSchema();
            return raw.keys(...args);
        });
        wrap('iterate', async (...args) => {
            await ensureSchema();
            return raw.iterate(...args);
        });
        wrap('length', async (...args) => {
            await ensureSchema();
            return raw.length(...args);
        });
        wrap('key', async (...args) => {
            await ensureSchema();
            return raw.key(...args);
        });
        wrap('clear', async (...args) => {
            await ensureSchema();
            const result = await raw.clear(...args);
            await raw.setItem(SCHEMA_VERSION_KEY, options.currentVersion || CURRENT_SCHEMA_VERSION);
            return result;
        });

        const facade = Object.freeze({
            dbName: DB_NAME,
            schemaVersionKey: SCHEMA_VERSION_KEY,
            currentSchemaVersion: options.currentVersion || CURRENT_SCHEMA_VERSION,
            ensureSchema,
            raw
        });
        Object.defineProperty(database, '__smartReaderStorageFoundation', {
            configurable: false,
            enumerable: false,
            writable: false,
            value: facade
        });
        return facade;
    }

    function applyAccessibilityBaseline(documentRef) {
        if (!documentRef) return;
        const viewport = documentRef.querySelector?.('meta[name="viewport"]');
        if (viewport) viewport.setAttribute('content', 'width=device-width, initial-scale=1.0');
    }

    function applyBackupCopyBaseline(documentRef) {
        const warning = documentRef?.querySelector?.('.backup-restore-warning');
        if (!warning) return;
        warning.textContent = '現在のSmart Readerデータを、バックアップファイルの内容で置き換えます。復元前のデータも自動でバックアップファイルとして保存されます。';
    }

    function protectExternalSourceLink(documentRef) {
        const link = documentRef?.getElementById?.('display-url');
        if (!link) return null;
        link.setAttribute('rel', 'noopener noreferrer');

        const sanitize = () => {
            const href = link.getAttribute('href');
            if (!href || href === '#') return;
            const safe = sanitizeExternalUrl(href, documentRef.baseURI);
            if (!safe) {
                link.removeAttribute('href');
                link.style.display = 'none';
                link.dataset.smartReaderUnsafeUrl = 'true';
                return;
            }
            link.setAttribute('href', safe);
            delete link.dataset.smartReaderUnsafeUrl;
        };

        sanitize();
        const Observer = documentRef.defaultView?.MutationObserver || (typeof MutationObserver !== 'undefined' ? MutationObserver : null);
        if (!Observer) return null;
        const observer = new Observer(records => {
            if (records.some(record => record.type === 'attributes' && record.attributeName === 'href')) sanitize();
        });
        observer.observe(link, { attributes: true, attributeFilter: ['href'] });
        return observer;
    }

    async function install(database, documentRef) {
        const storage = installStorageFoundation(database);
        await storage.ensureSchema();
        if (documentRef) {
            applyAccessibilityBaseline(documentRef);
            applyBackupCopyBaseline(documentRef);
            protectExternalSourceLink(documentRef);
        }
        return storage;
    }

    return Object.freeze({
        DB_NAME,
        SCHEMA_VERSION_KEY,
        CURRENT_SCHEMA_VERSION,
        normalizeSchemaVersion,
        sanitizeExternalUrl,
        migrateSchema,
        installStorageFoundation,
        applyAccessibilityBaseline,
        applyBackupCopyBaseline,
        protectExternalSourceLink,
        install
    });
});
