/* Definitions, mastery and SRS history are deliberately separate. */
(function (root, factory) {
    const profile = typeof module === 'object' && module.exports ? require('./language-profile.js') : root.SmartReaderLanguageProfile;
    const api = factory(profile);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SmartReaderLearningTargets = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (profiles) {
    'use strict';
    const MEANING = 'meaning';
    const PINYIN = 'reading:pinyin';
    const hasValue = value => value !== undefined && value !== null && String(value).trim() !== '';
    const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

    function definitions(word, state) {
        const result = [{ id: MEANING, label: '意味', value: word?.meaning, enabled: true, countsTowardMastery: true }];
        for (const annotation of profiles.active(state).annotations) {
            const saved = (Array.isArray(word?.annotations) ? word.annotations : []).find(item => item?.id === annotation.id);
            if (saved && hasValue(saved.value)) result.push({ id: 'reading:' + annotation.id, label: annotation.label,
                value: saved.value, enabled: saved.learnable !== false, countsTowardMastery: true });
        }
        // Only explicit definitions count; context, examples and memo never become targets.
        const seen = new Set(result.map(item => item.id));
        for (const item of Array.isArray(word?.learningTargets) ? word.learningTargets : []) {
            if (!item || typeof item.id !== 'string' || !item.id.startsWith('custom:') || seen.has(item.id)) continue;
            seen.add(item.id);
            result.push({ id: item.id, label: String(item.label || '追加項目'), value: item.value,
                enabled: item.enabled !== false, countsTowardMastery: item.countsTowardMastery !== false });
        }
        return result;
    }
    function readState(word, id) {
        const stored = object(word?.study?.learningTargets)[id];
        if (typeof stored?.learned === 'boolean') return stored.learned;
        const chinese = word?.study?.chinese;
        if (id === MEANING) return typeof chinese?.meaning === 'boolean' ? chinese.meaning
            : typeof word?.study?.meaning === 'boolean' ? word.study.meaning : !!word?.memorized;
        if (id === PINYIN) return typeof chinese?.pinyin === 'boolean' ? chinese.pinyin
            : typeof word?.study?.annotations?.pinyin === 'boolean' ? word.study.annotations.pinyin : !!word?.memorized;
        return false;
    }
    function targets(word, state) {
        return definitions(word, state).filter(item => item.enabled && hasValue(item.value))
            .map(item => ({ ...item, learned: readState(word, item.id) }));
    }
    function summary(word, state) {
        const participating = targets(word, state).filter(item => item.countsTowardMastery);
        const learnedCount = participating.filter(item => item.learned).length;
        return { total: participating.length, learnedCount,
            all: participating.length > 0 && learnedCount === participating.length,
            partial: learnedCount > 0 && learnedCount < participating.length };
    }
    function managed(word, state) {
        return profiles.active(state).id === 'zh' || (Array.isArray(word?.learningTargets) && word.learningTargets.length > 0);
    }
    function normalize(word, state) {
        if (!word || !managed(word, state)) return word;
        const study = object(word.study);
        const states = { ...object(study.learningTargets) };
        for (const definition of definitions(word, state)) {
            states[definition.id] = { ...object(states[definition.id]), learned: readState(word, definition.id) };
        }
        word.study = { ...study, learningTargets: states };
        if (profiles.active(state).id === 'zh') {
            word.study.chinese = { ...object(study.chinese), meaning: readState(word, MEANING), pinyin: readState(word, PINYIN) };
        }
        word.memorized = summary(word, state).all;
        return word;
    }
    function set(word, id, learned, state) {
        if (!word || !definitions(word, state).some(item => item.id === id)) return word;
        if (!managed(word,state)) { if(id===MEANING)word.memorized=!!learned; return word; }
        normalize(word, state);
        word.study = object(word.study);
        word.study.learningTargets = { ...object(word.study.learningTargets),
            [id]: { ...object(word.study.learningTargets?.[id]), learned: !!learned } };
        return normalize(word, state);
    }
    function setAll(word, learned, state) {
        if (!word) return word;
        if (!managed(word, state)) { word.memorized = !!learned; return word; }
        normalize(word, state);
        for (const target of targets(word, state)) {
            if (target.countsTowardMastery) word.study.learningTargets[target.id] = {
                ...object(word.study.learningTargets[target.id]), learned: !!learned };
        }
        return normalize(word, state);
    }
    // Value changes invalidate only that target, retaining its review metadata/history.
    function changed(word, id, state) {
        if (!word) return;
        word.study = { ...object(word.study) };
        word.study.learningTargets = { ...object(word.study.learningTargets),
            [id]: { ...object(word.study.learningTargets?.[id]), learned: false } };
        normalize(word, state);
    }
    function syncCheckbox(input, word, state) {
        if (!input) return;
        const status = managed(word, state) ? summary(word, state) : { all: !!word?.memorized, partial: false };
        input.checked = status.all;
        input.indeterminate = status.partial;
        input.setAttribute('aria-checked', status.partial ? 'mixed' : String(status.all));
        input.title = status.partial ? '一部習得（クリックですべて習得）' : status.all ? 'すべて習得済み' : 'すべて未習得';
    }
    return Object.freeze({ MEANING, PINYIN, definitions, targets, readState, summary, managed, normalize, set, setAll, changed, syncCheckbox });
});
