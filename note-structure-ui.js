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

    const workspaceReady = loadScriptPromise(
        'workspace-core.js?v=1',
        'smart-reader-workspace-core-loader'
    );
    const foundationReady = loadScriptPromise(
        'smart-reader-foundation-core.js?v=2',
        'smart-reader-foundation-core-loader'
    );

    // app.js loads libraryItems asynchronously on window.load. Install schema v2
    // before legacy initialization so the old library remains readable while the
    // workspace metadata is created around it.
    const previousOnload = window.onload;
    if (typeof previousOnload === 'function' && !previousOnload.__studyRefreshWrapped) {
        const wrappedOnload = async function (event) {
            try {
                await Promise.all([workspaceReady, foundationReady]);
                if (window.SmartReaderFoundation?.install && window.SmartReaderWorkspace && typeof db !== 'undefined') {
                    await window.SmartReaderFoundation.install(db, document, {
                        currentVersion: window.SmartReaderWorkspace.WORKSPACE_SCHEMA_VERSION,
                        migrations: {
                            2: window.SmartReaderWorkspace.migrateToWorkspaceMetadata
                        }
                    });
                }
            } catch (error) {
                // Keep legacy local data accessible even if the new metadata layer fails.
                console.error('Smart Reader workspace/storage foundation failed to initialize', error);
            }

            const result = previousOnload.call(this, event);
            if (result && typeof result.then === 'function') await result;

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

    // Library/global navigation polish is loaded last so it can consistently override legacy styles.
    loadStyle('library-toolbar-polish.css?v=2', 'library-toolbar-polish-style');

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
