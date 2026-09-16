(function () {
    'use strict';

    let foundationPromise = Promise.resolve(null);
    try {
        if (window.SmartReaderFoundation?.install && typeof db !== 'undefined') {
            foundationPromise = window.SmartReaderFoundation.install(db, document);
        }
    } catch (error) {
        foundationPromise = Promise.reject(error);
    }

    let workspaceApi = null;
    let workspacePromise = Promise.resolve(null);
    try {
        if (window.SmartReaderWorkspace?.install && typeof db !== 'undefined') {
            workspaceApi = window.SmartReaderWorkspace.install(db, window.localStorage);
            workspacePromise = workspaceApi.ready;
        }
    } catch (error) {
        workspacePromise = Promise.reject(error);
    }

    const ready = Promise.all([foundationPromise, workspacePromise]).then(([, state]) => {
        window.dispatchEvent(new CustomEvent('smartreader:workspace-ready', { detail: state || {} }));
        return { workspace: workspaceApi, state };
    });
    window.SmartReaderBootstrapReady = ready;

    const previousOnload = window.onload;
    if (typeof previousOnload === 'function' && !previousOnload.__smartReaderBootstrapWrapped) {
        const wrappedOnload = async function (event) {
            try {
                await ready;
            } catch (error) {
                console.error('Smart Reader storage/workspace initialization failed', error);
                const message = document.createElement('div');
                message.setAttribute('role', 'alert');
                message.style.cssText = 'margin:16px;padding:12px;border:1px solid #d33;border-radius:8px;background:#fff5f5;color:#8a1f1f;';
                message.textContent = '保存データの準備中に問題が発生したため、安全のため起動を停止しました。データは削除されていません。';
                document.body.prepend(message);
                return;
            }
            return previousOnload.call(this, event);
        };
        wrappedOnload.__smartReaderBootstrapWrapped = true;
        window.onload = wrappedOnload;
    }
})();
