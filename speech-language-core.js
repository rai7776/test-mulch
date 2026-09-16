(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SmartReaderSpeechLanguage = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const DEFAULT_LOCALES = Object.freeze({
        en: 'en-US',
        ja: 'ja-JP',
        zh: 'zh-CN',
        es: 'es-ES',
        ko: 'ko-KR',
        fr: 'fr-FR',
        de: 'de-DE',
        pt: 'pt-BR',
        it: 'it-IT'
    });

    function normalizeLanguageTag(value) {
        return String(value || '').trim().replace(/_/g, '-');
    }

    function resolveSpeechLocale(value) {
        const tag = normalizeLanguageTag(value);
        if (!tag) return '';
        const lower = tag.toLowerCase();
        if (lower === 'zh-hant' || lower.startsWith('zh-hant-') || lower === 'zh-tw') return 'zh-TW';
        if (lower === 'zh-hk') return 'zh-HK';
        if (lower === 'zh-hans' || lower.startsWith('zh-hans-') || lower === 'zh-cn') return 'zh-CN';
        if (lower.includes('-')) return tag;
        return DEFAULT_LOCALES[lower] || tag;
    }

    function shouldApplyWorkspaceLanguage(currentLanguage) {
        const normalized = normalizeLanguageTag(currentLanguage).toLowerCase();
        return !normalized || normalized === 'en-us';
    }

    function contentLanguageFromState(state) {
        const workspace = state?.activeWorkspace;
        if (!workspace || workspace.kind !== 'language') return '';
        return normalizeLanguageTag(workspace.contentLanguage);
    }

    function speechLocaleFromState(state) {
        return resolveSpeechLocale(contentLanguageFromState(state));
    }

    return Object.freeze({
        DEFAULT_LOCALES,
        normalizeLanguageTag,
        resolveSpeechLocale,
        shouldApplyWorkspaceLanguage,
        contentLanguageFromState,
        speechLocaleFromState
    });
});
