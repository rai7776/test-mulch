/* Workspace is the sole source of the learning language. */
(function (root, factory) {
    const speech = typeof module === 'object' && module.exports ? require('./speech-language-core.js') : root.SmartReaderSpeechLanguage;
    const api = factory(speech);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SmartReaderLanguageProfile = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (speech) {
    'use strict';
    const pinyin = Object.freeze({ id:'pinyin', label:'拼音', category:'reading', system:'pinyin', display:'ruby', learnable:true });
    const profiles = Object.freeze({
        en: { id:'en', label:'英語', locale:'en-US', wordUnit:'words', annotations:[] },
        zh: { id:'zh', label:'中国語', locale:'zh-CN', wordUnit:'語', annotations:[pinyin] }
    });
    function active(state) {
        const current = state === undefined && typeof window !== 'undefined' ? window.SmartReaderWorkspaceState : state;
        const workspace = current?.activeWorkspace;
        if (!workspace || workspace.kind !== 'language') return { id:'', language:'', label:'一般学習', locale:'', wordUnit:'語', annotations:[] };
        const language = speech.normalizeLanguageTag(workspace.contentLanguage).toLowerCase();
        const base = language.split('-')[0];
        return { ...(profiles[base] || { id:base, label:language, wordUnit:'語', annotations:[] }),
            language, locale:speech.resolveSpeechLocale(language) };
    }
    function wordSegments(text, state) {
        const value = String(text || '');
        const profile = active(state);
        if (profile.id === 'en') return [...value.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+(?:['’][A-Za-z]+)*)*/g)]
            .map(match => ({ text:match[0], index:match.index }));
        if (profile.locale && typeof Intl !== 'undefined' && Intl.Segmenter) {
            return [...new Intl.Segmenter(profile.locale, { granularity:'word' }).segment(value)]
                .filter(part => part.isWordLike).map(part => ({ text:part.segment, index:part.index }));
        }
        const pattern = profile.id === 'zh' ? /\p{Script=Han}|[A-Za-z0-9]+/gu : /[\p{L}\p{M}\p{N}]+/gu;
        return [...value.matchAll(pattern)].map(match => ({ text:match[0], index:match.index }));
    }
    function sentences(text, state) {
        const value = String(text || '');
        const profile = active(state);
        const parts = [];
        for (const line of value.matchAll(/[^\n]+(?:\n+|$)|\n+/g)) {
            const chunks = profile.locale && typeof Intl !== 'undefined' && Intl.Segmenter
                ? [...new Intl.Segmenter(profile.locale, { granularity:'sentence' }).segment(line[0])]
                    .map(part => ({ text:part.segment, start:line.index + part.index }))
                : [...line[0].matchAll(/[^.!?。！？]+[.!?。！？]+[”’」』】）)]*\s*|[^.!?。！？]+$|[.!?。！？]+/gu)]
                    .map(part => ({ text:part[0], start:line.index + part.index }));
            parts.push(...chunks);
        }
        return parts.filter(part => part.text.trim()).map(part => ({ ...part, end:part.start + part.text.length }));
    }
    function wholeWord(text, index, length, state) {
        const profile = active(state);
        if (profile.id === 'en') return !/[A-Za-z]/.test(text[index-1] || '') && !/[A-Za-z]/.test(text[index+length] || '');
        if (profile.id === 'zh' && !(typeof Intl !== 'undefined' && Intl.Segmenter)) return /\p{Script=Han}/u.test(text.slice(index,index+length));
        return wordSegments(text,state).some(part => part.index === index && part.text.length === length);
    }
    return Object.freeze({ profiles, active, wordSegments, sentences, wholeWord });
});
