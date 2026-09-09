(function () {
    'use strict';

    const FALLBACK_ID = 'article-study-fallback';
    let syncTimer = null;
    let delayedSyncTimer = null;

    function isFolderPanelMode() {
        return document.getElementById('side-panel')?.classList.contains('folder-panel-mode') || false;
    }

    function nativeLauncherVisible() {
        const native = document.getElementById('sidebar-study-controls');
        if (!native || isFolderPanelMode()) return false;
        try {
            return getComputedStyle(native).display !== 'none' && !native.hidden;
        } catch (_) {
            return !native.hidden;
        }
    }

    function rangeLabel() {
        return window.SmartReaderChapterScope?.scope === 'article'
            ? '🎴 この記事をカード出題'
            : '🎴 この章をカード出題';
    }

    function removeFallback() {
        const fallback = document.getElementById(FALLBACK_ID);
        if (fallback) fallback.remove();
    }

    function ensureFallbackLauncher() {
        const controls = document.getElementById('vocabulary-controls');
        if (!controls) return;

        if (nativeLauncherVisible() || isFolderPanelMode()) {
            removeFallback();
            return;
        }

        let row = document.getElementById(FALLBACK_ID);
        if (!row) {
            row = document.createElement('div');
            row.id = FALLBACK_ID;
            row.className = 'sidebar-study-controls article-study-fallback';
            row.innerHTML = '<button type="button" class="study-inline-primary" data-article-study-open></button>';
            controls.appendChild(row);

            row.querySelector('[data-article-study-open]')?.addEventListener('click', () => {
                const study = window.SmartReaderStudy;
                if (study?.startCurrentRange) {
                    study.startCurrentRange();
                    return;
                }
                console.error('SmartReaderStudy.startCurrentRange is unavailable');
            });
        }

        const button = row.querySelector('[data-article-study-open]');
        if (button) {
            const label = rangeLabel();
            if (button.textContent !== label) button.textContent = label;

            const shouldDisable = !window.SmartReaderStudy?.startCurrentRange;
            if (button.disabled !== shouldDisable) button.disabled = shouldDisable;
        }
    }

    function syncSoon() {
        if (syncTimer === null) {
            syncTimer = window.setTimeout(() => {
                syncTimer = null;
                ensureFallbackLauncher();
            }, 0);
        }

        if (delayedSyncTimer !== null) window.clearTimeout(delayedSyncTimer);
        delayedSyncTimer = window.setTimeout(() => {
            delayedSyncTimer = null;
            ensureFallbackLauncher();
        }, 80);
    }

    function init() {
        ensureFallbackLauncher();
        syncSoon();

        const panel = document.getElementById('side-panel');
        if (panel && typeof MutationObserver !== 'undefined') {
            const observer = new MutationObserver(syncSoon);
            observer.observe(panel, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class', 'hidden', 'style']
            });
        }

        document.addEventListener('click', event => {
            if (event.target.closest('#side-panel, #article-meta')) syncSoon();
        }, true);
        document.addEventListener('change', event => {
            if (event.target.closest('#side-panel')) syncSoon();
        }, true);
        window.addEventListener('resize', syncSoon);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
