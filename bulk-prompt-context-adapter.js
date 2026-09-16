(function () {
    'use strict';

    function install() {
        const core = window.SmartReaderBulkPromptContext;
        const current = window.buildSmartReaderBulkAiPrompt;
        if (!core || typeof current !== 'function') return false;
        if (current.__smartReaderContextualPrompt === true) return true;

        const original = current;
        const wrapped = function () {
            const prompt = original();
            return core.contextualizePrompt(prompt, window.SmartReaderWorkspaceState || null);
        };
        wrapped.__smartReaderContextualPrompt = true;
        wrapped.__smartReaderOriginalPrompt = original;
        window.buildSmartReaderBulkAiPrompt = wrapped;
        return true;
    }

    if (!install()) {
        window.addEventListener('load', install, { once: true });
    }
    window.addEventListener('smartreader:workspace-ready', install);
})();
