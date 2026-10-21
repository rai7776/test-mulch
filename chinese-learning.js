/* Chinese reading and vocabulary adapter. Non-Chinese articles retain legacy data/behavior. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SmartReaderChinese = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const PINYIN = 'pinyin';

    function language(article, state) {
        const workspace = state || (typeof window !== 'undefined' ? window.SmartReaderWorkspaceState : null);
        return String(article?.language || workspace?.activeWorkspace?.contentLanguage || 'en').toLowerCase();
    }
    function isChinese(article, state) {
        return /^zh(?:-|$)/.test(language(article, state));
    }
    function reading(word) {
        return String((Array.isArray(word?.annotations) ? word.annotations : [])
            .find(item => item?.id === PINYIN)?.value || '').trim();
    }
    function generate(text, engine) {
        const pinyin = engine || (typeof window !== 'undefined' ? window.pinyinPro : null);
        if (!pinyin || typeof pinyin.pinyin !== 'function' || !String(text || '').trim()) return '';
        try {
            return String(pinyin.pinyin(String(text).trim(), { toneType: 'symbol', type: 'string' }) || '').trim();
        } catch (error) {
            if (typeof console !== 'undefined') console.warn('Pinyin generation failed', error);
            return '';
        }
    }
    function applyReading(word, previousWord, article, value) {
        if (!word || !isChinese(article)) return word;
        const previous = previousWord && Array.isArray(previousWord.annotations) ? previousWord.annotations : word.annotations;
        const annotations = (Array.isArray(previous) ? previous : [])
            .filter(item => item && item.id !== PINYIN).map(item => ({ ...item }));
        const input = String(value || '').trim();
        if (input) annotations.push({ id: PINYIN, category: 'reading', system: PINYIN, value: input, learnable: true, display: 'ruby' });
        word.annotations = annotations;
        if (word.study?.chinese) {
            const learned = learning(word);
            word.memorized = !!learned.meaning && (!input || !!learned.pinyin);
        }
        return word;
    }
    function learning(word) {
        const legacy = !!word?.memorized;
        const state = word?.study?.chinese;
        return {
            pinyin: typeof state?.pinyin === 'boolean' ? state.pinyin : legacy,
            meaning: typeof state?.meaning === 'boolean' ? state.meaning : legacy
        };
    }
    function setLearning(word, target, learned, article) {
        if (!word || !isChinese(article) || (target !== 'pinyin' && target !== 'meaning')) return;
        if (target === 'pinyin' && !reading(word)) return;
        const state = learning(word);
        state[target] = !!learned;
        if (!word.study || typeof word.study !== 'object' || Array.isArray(word.study)) word.study = {};
        word.study.chinese = state;
        word.memorized = !!state.meaning && (!reading(word) || !!state.pinyin);
    }
    function setAllLearning(word, learned, article) {
        if (!word || !isChinese(article)) {
            if (word) word.memorized = !!learned;
            return;
        }
        if (!word.study || typeof word.study !== 'object' || Array.isArray(word.study)) word.study = {};
        word.study.chinese = { pinyin: !!learned, meaning: !!learned };
        word.memorized = !!learned;
    }
    function mirrorMastery(word, article) {
        if (word && isChinese(article)) setAllLearning(word, !!word.memorized, article);
    }
    function countWords(text, article, state) {
        const value = String(text || '');
        if (!isChinese(article, state)) {
            return (value.match(/[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+(?:['’][A-Za-z]+)*)*/g) || []).length;
        }
        if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
            const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
            return [...segmenter.segment(value)].filter(part => part.isWordLike).length;
        }
        return (value.match(/[\p{Script=Han}]/gu) || []).length;
    }
    function groupKey(word, article, state) {
        return language(article, state) + '::' + String(word?.word || '').trim().toLocaleLowerCase() + '::'
            + (isChinese(article, state) ? reading(word).toLocaleLowerCase() : '');
    }

    // UI entry points; no DOM work during module load.
    function syncEditor(article, word) {
        if (typeof document === 'undefined') return;
        const box = document.getElementById('chinese-word-field');
        const input = document.getElementById('input-word-pinyin');
        if (!box || !input) return;
        const active = isChinese(article);
        box.hidden = !active;
        if (!active) { input.value = ''; input.dataset.generated = ''; return; }
        const text = document.getElementById('input-word-text')?.value || '';
        const saved = reading(word);
        const automatic = !saved ? generate(text) : '';
        input.value = saved || automatic;
        input.dataset.generated = automatic;
    }
    function wordTextChanged() {
        if (typeof document === 'undefined') return;
        const input = document.getElementById('input-word-pinyin');
        if (!input || document.getElementById('chinese-word-field')?.hidden) return;
        if (input.value.trim() && input.value !== (input.dataset.generated || '')) return;
        input.value = generate(document.getElementById('input-word-text')?.value || '');
        input.dataset.generated = input.value;
    }
    function regenerate() {
        if (typeof document === 'undefined') return;
        const input = document.getElementById('input-word-pinyin');
        if (!input) return;
        input.value = generate(document.getElementById('input-word-text')?.value || '');
        input.dataset.generated = input.value;
    }
    function syncReaderControls(article, visible) {
        if (typeof document === 'undefined') return;
        const wrap = document.getElementById('chinese-reader-options');
        const toggle = document.getElementById('chinese-reader-pinyin-visible');
        const select = document.getElementById('reader-article-language');
        if (select) select.value = isChinese(article) ? 'zh' : 'en';
        if (wrap) wrap.hidden = !isChinese(article);
        if (toggle) toggle.checked = visible !== false;
    }
    function decorateReader(display, article, visible) {
        if (!display) return;
        const enabled = isChinese(article);
        display.classList.toggle('chinese-pinyin-visible', enabled && visible !== false);
        const words = Array.isArray(article?.words) ? article.words : [];
        display.querySelectorAll('.word-highlight[data-word-index]').forEach(element => {
            const index = Number(element.dataset.wordIndex);
            const value = enabled && Number.isInteger(index) ? reading(words[index]) : '';
            if (value) element.dataset.pinyin = value;
            else element.removeAttribute('data-pinyin');
        });
    }
    function attachStudyControls(card, word, article, onChange) {
        if (!card || !isChinese(article) || typeof document === 'undefined') return;
        const value = reading(word);
        const status = learning(word);
        const controls = document.createElement('div');
        controls.className = 'chinese-study-controls';
        if (value) {
            const pronunciation = document.createElement('span');
            pronunciation.className = 'chinese-pinyin-label';
            pronunciation.textContent = '拼音: ' + value;
            controls.appendChild(pronunciation);
        }
        [['pinyin', '拼音', !!value], ['meaning', '意味', true]].forEach(([target, label, available]) => {
            if (!available) return;
            const wrapper = document.createElement('label');
            wrapper.className = 'chinese-study-check';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.checked = !!status[target];
            input.addEventListener('click', event => event.stopPropagation());
            input.addEventListener('change', event => {
                event.stopPropagation();
                if (typeof onChange === 'function') onChange(target, input.checked);
            });
            wrapper.append(input, document.createTextNode(label + ' 習得済み'));
            controls.appendChild(wrapper);
        });
        card.appendChild(controls);
    }

    return Object.freeze({
        language, isChinese, reading, generate, applyReading, learning,
        setLearning, setAllLearning, mirrorMastery, countWords, groupKey,
        syncEditor, wordTextChanged, regenerate, syncReaderControls,
        decorateReader, attachStudyControls
    });
});
