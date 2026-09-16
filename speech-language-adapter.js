(function () {
    'use strict';

    function install() {
        const synthesis = window.speechSynthesis;
        const api = window.SmartReaderSpeechLanguage;
        if (!synthesis || typeof synthesis.speak !== 'function' || !api) return false;
        if (synthesis.speak.__smartReaderLanguageAware) return true;

        const originalSpeak = synthesis.speak.bind(synthesis);
        const wrappedSpeak = function (utterance) {
            try {
                const locale = api.speechLocaleFromState(window.SmartReaderWorkspaceState);
                if (locale && utterance && api.shouldApplyWorkspaceLanguage(utterance.lang)) {
                    utterance.lang = locale;
                }
            } catch (error) {
                console.warn('Smart Reader speech language selection failed', error);
            }
            return originalSpeak(utterance);
        };
        wrappedSpeak.__smartReaderLanguageAware = true;
        wrappedSpeak.__smartReaderOriginal = originalSpeak;

        try {
            synthesis.speak = wrappedSpeak;
            return synthesis.speak === wrappedSpeak;
        } catch (error) {
            console.warn('Smart Reader could not install speech language adapter', error);
            return false;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', install, { once: true });
    } else {
        install();
    }
    window.addEventListener('smartreader:workspace-ready', install);

    window.SmartReaderSpeechLanguageAdapter = Object.freeze({ install });
})();
