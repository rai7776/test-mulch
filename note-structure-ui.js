(function () {
    'use strict';

    function loadScript(src, id) {
        if (document.getElementById(id)) return;
        const script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.onerror = () => console.error(`Failed to load ${src}`);
        document.head.appendChild(script);
    }

    function loadScriptPromise(src, id) {
        const existing = document.getElementById(id);
        if (existing) {
            if (existing.dataset.smartReaderLoaded === 'true') return Promise.resolve(existing);
            return new Promise((resolve, reject) => {
                existing.addEventListener('load', () => resolve(existing), { once: true });
                existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
            });
        }

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.id = id;
            script.src = src;
            script.onload = () => {
                script.dataset.smartReaderLoaded = 'true';
                resolve(script);
            };
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    }

    function loadStyle(href, id) {
        if (document.getElementById(id)) return;
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = href;
        link.onerror = () => console.error(`Failed to load ${href}`);
        document.head.appendChild(link);
    }

    async function runWorkspaceAwareAppInit(previousOnload, event, workspaceState) {
        const active = workspaceState?.activeWorkspace;
        const isNewWorkspace = !!active && !active.migratedFromLegacy;
        if (!isNewWorkspace) {
            const result = previousOnload.call(window, event);
            if (result && typeof result.then === 'function') await result;
            return;
        }

        // app.js normally injects the English tutorial whenever library_items is empty.
        // New non-legacy workspaces should start truly empty instead.
        libraryItems = await db.getItem('library_items') || [];
        const savedSet = await db.getItem('reader_settings');
        if (savedSet) {
            readerSettings = savedSet;
            applySettings();
        }
        showLibrary();
        renderList('words');
        setupEventListeners();
    }

    const workspaceReady = loadScriptPromise(
        'workspace-core.js?v=4',
        'smart-reader-workspace-core-loader'
    );
    const foundationReady = loadScriptPromise(
        'smart-reader-foundation-core.js?v=3',
        'smart-reader-foundation-core-loader'
    );

    // app.js loads libraryItems asynchronously on window.load. Install schema v2
    // before legacy initialization so the old library remains readable while the
    // workspace metadata is created around it.
    const previousOnload = window.onload;
    if (typeof previousOnload === 'function' && !previousOnload.__studyRefreshWrapped) {
        const wrappedOnload = async function (event) {
            let workspaceState = null;
            try {
                await Promise.all([workspaceReady, foundationReady]);
                if (window.SmartReaderFoundation?.install && window.SmartReaderWorkspace && typeof db !== 'undefined') {
                    await window.SmartReaderFoundation.install(db, document, {
                        currentVersion: window.SmartReaderWorkspace.WORKSPACE_SCHEMA_VERSION,
                        migrations: {
                            2: window.SmartReaderWorkspace.migrateToWorkspaceMetadata
                        }
                    });
                    workspaceState = await window.SmartReaderWorkspace.readWorkspaceState(db);
                    window.SmartReaderWorkspaceState = workspaceState;
                }
            } catch (error) {
                // Keep legacy local data accessible even if the new metadata layer fails.
                console.error('Smart Reader workspace/storage foundation failed to initialize', error);
            }

            await runWorkspaceAwareAppInit(previousOnload, event, workspaceState);

            try {
                if (window.SmartReaderWorkspace?.readWorkspaceState && typeof db !== 'undefined') {
                    window.SmartReaderWorkspaceState = await window.SmartReaderWorkspace.readWorkspaceState(db);
                    window.dispatchEvent(new CustomEvent('smartreader:workspace-ready', {
                        detail: window.SmartReaderWorkspaceState
                    }));
                }
            } catch (error) {
                console.warn('Workspace state refresh failed', error);
            }

            try { window.SmartReaderStudy?.refresh?.(); } catch (error) {
                console.warn('Study home refresh after library load failed', error);
            }
        };
        wrappedOnload.__studyRefreshWrapped = true;
        window.onload = wrappedOnload;
    }

    // Library/global navigation polish and application-level controls are loaded last
    // so they can consistently override legacy styles without rewriting app.js.
    loadStyle('library-toolbar-polish.css?v=5', 'library-toolbar-polish-style');
    loadStyle('workspace-ui.css?v=2', 'smart-reader-workspace-ui-style');
    loadStyle('settings-hub.css?v=2', 'smart-reader-settings-hub-style');
    loadStyle('reader-mobile-polish.css?v=2', 'smart-reader-reader-mobile-polish-style');
    loadStyle('article-copy-ui.css?v=3', 'smart-reader-article-copy-ui-style');
    loadStyle('workspace-backup-ui.css?v=1', 'smart-reader-workspace-backup-ui-style');
    loadStyle('workspace-management-ui.css?v=1', 'smart-reader-workspace-management-ui-style');
    loadScript('workspace-ui.js?v=3', 'smart-reader-workspace-ui-loader');
    loadScript('settings-hub.js?v=3', 'smart-reader-settings-hub-loader');
    loadScriptPromise('article-copy-core.js?v=2', 'smart-reader-article-copy-core-loader')
        .then(() => loadScript('article-copy-ui.js?v=3', 'smart-reader-article-copy-ui-loader'))
        .catch(error => console.error('Failed to load article copy feature', error));

    const backupFeatureReady = loadScriptPromise('workspace-backup-core.js?v=1', 'smart-reader-workspace-backup-core-loader');
    backupFeatureReady
        .then(() => loadScript('workspace-backup-ui.js?v=1', 'smart-reader-workspace-backup-ui-loader'))
        .catch(error => console.error('Failed to load workspace backup feature', error));

    Promise.all([
        backupFeatureReady,
        loadScriptPromise('workspace-management-core.js?v=1', 'smart-reader-workspace-management-core-loader')
    ])
        .then(() => loadScript('workspace-management-ui.js?v=2', 'smart-reader-workspace-management-ui-loader'))
        .catch(error => console.error('Failed to load workspace management feature', error));

    loadScriptPromise('speech-language-core.js?v=1', 'smart-reader-speech-language-core-loader')
        .then(() => loadScript('speech-language-adapter.js?v=1', 'smart-reader-speech-language-adapter-loader'))
        .catch(error => console.error('Failed to load multilingual speech support', error));

    loadScriptPromise('bulk-prompt-context-core.js?v=1', 'smart-reader-bulk-prompt-context-core-loader')
        .then(() => loadScript('bulk-prompt-context-adapter.js?v=1', 'smart-reader-bulk-prompt-context-adapter-loader'))
        .catch(error => console.error('Failed to load contextual bulk import prompt support', error));

    // 実データに文構造がある場合は、旧来の固定デモカードを重ねて表示しない。
    const style = document.createElement('style');
    style.id = 'note-structure-sample-v2-style';
    style.textContent = '#panel-content:has(.note-block-card:not(.note-structure-sample-card) > .note-structure-box) #note-structure-sample{display:none!important}';
    document.head.appendChild(style);

    // 元の文構造UIはそのまま保持し、サンプル更新ロジックだけ独立して追加する。
    loadScript('note-structure-ui-core.js?v=1.5', 'note-structure-ui-core-loader');
    // relation data is retained for a future arrow renderer.
    loadScript('note-structure-editor.js?v=4', 'note-structure-editor-loader');
    loadScript('sample-data-v2.js?v=2', 'smart-reader-sample-data-v2-loader');
    loadScript('global-vocab-card-display.js?v=1', 'global-vocab-card-display-loader');
    loadScript('folder-study-range.js?v=1', 'folder-study-range-loader');
    loadScript('flashcard-auto-audio.js?v=1', 'flashcard-auto-audio-loader');
})();