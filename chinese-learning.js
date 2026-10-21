/* Chinese reading and vocabulary adapter. Non-Chinese articles retain legacy data/behavior. */
(function (root, factory) {
    const profile = typeof module === 'object' && module.exports ? require('./language-profile.js') : root.SmartReaderLanguageProfile;
    const api = factory(profile);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) {
        root.SmartReaderChinese=api;
        root.addEventListener?.('pagehide',api.stopSentenceAudio);
        root.addEventListener?.('smartreader:workspace-ready',api.stopSentenceAudio);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (profiles) {
    'use strict';

    const PINYIN = 'pinyin';
    let activeSpeech = null;

    function splitSentences(text) { return profiles.sentences(text); }

    function characterReadings(text, engine) {
        const api = engine || (typeof window !== 'undefined' ? window.pinyinPro : null);
        const readings = new Map();
        if (!api?.pinyin) return readings;
        // Generate whole Han runs to retain phrase context across highlight spans.
        for (const match of String(text).matchAll(/\p{Script=Han}+/gu)) {
            try {
                const values = api.pinyin(match[0], { toneType: 'symbol', type: 'array' });
                const chars = Array.from(match[0]);
                if (!Array.isArray(values) || values.length !== chars.length) continue;
                let offset = match.index;
                chars.forEach((char, index) => { readings.set(offset, String(values[index])); offset += char.length; });
            } catch (_) { /* Text and audio remain usable without the generator. */ }
        }
        return readings;
    }

    let sequenceToken = 0;
    let speechRate = 0.85;
    const sentenceRecords = new WeakMap();
    const buttonRecords = new WeakMap();
    function setSpeechRate(value) {
        const rate = Number(value);
        if ([0.7,0.85,1,1.2].includes(rate)) speechRate = rate;
        return speechRate;
    }
    function clearSpeech(speech) {
        speech?.button?.setAttribute('aria-pressed','false');
        speech?.parts?.forEach(part => part.classList.remove('is-speaking'));
    }
    function stopSentenceAudio() {
        sequenceToken++;
        if (!activeSpeech) return;
        const previous = activeSpeech; activeSpeech = null;
        clearSpeech(previous); previous.synthesis.cancel();
    }
    function audioStatus(message) {
        if (typeof document === 'undefined') return;
        const node = document.getElementById('chinese-audio-status');
        if (node) node.textContent = message;
    }
    function speakSentence(text, button, onEnd) {
        const synthesis = typeof window !== 'undefined' ? window.speechSynthesis : null;
        if (!isChinese() || !synthesis || !window.SpeechSynthesisUtterance || !String(text).trim()) {
            audioStatus('この端末では中国語の読み上げを利用できません。'); return false;
        }
        const utterance = new window.SpeechSynthesisUtterance(String(text).trim());
        utterance.lang = profiles.active().locale; utterance.rate = speechRate;
        const speech = { synthesis, button, utterance, parts:buttonRecords.get(button)?.parts || [] };
        activeSpeech = speech; button?.setAttribute('aria-pressed','true');
        speech.parts.forEach(part => part.classList.add('is-speaking'));
        utterance.onend = () => {
            if (activeSpeech !== speech) return;
            clearSpeech(speech); activeSpeech = null;
            if (onEnd) onEnd();
        };
        utterance.onerror = () => {
            if (activeSpeech !== speech) return;
            clearSpeech(speech); activeSpeech = null; sequenceToken++;
            audioStatus('読み上げできませんでした。中国語音声の設定をご確認ください。');
        };
        try { synthesis.speak(utterance); return true; }
        catch (_) { utterance.onerror(); return false; }
    }
    function playSentence(text, button) {
        const sameButton = !!activeSpeech && activeSpeech.button === button;
        stopSentenceAudio(); if (sameButton) return true;
        if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
        audioStatus(''); return speakSentence(text,button);
    }
    function playAllSentences(display) {
        stopSentenceAudio();
        const records = sentenceRecords.get(display) || [];
        const token = sequenceToken; let index = 0;
        const next = () => {
            if (token !== sequenceToken || index >= records.length) return;
            const record = records[index++];
            record.parts[0]?.scrollIntoView?.({ block:'nearest', behavior:'smooth' });
            speakSentence(record.text,record.button,next);
        };
        audioStatus('');
        if (typeof window !== 'undefined') window.speechSynthesis?.cancel();
        next();
    }
    function beforeSpeech(utterance) {
        if (activeSpeech && activeSpeech.utterance !== utterance) stopSentenceAudio();
    }

    function language(article, state) { return profiles.active(state).language; }
    function isChinese(article,state) { return profiles.active(state).id === 'zh'; }

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
        const state = learning(previousWord || word);
        const previousReading = reading(previousWord || word);
        const previous = previousWord?.annotations || word.annotations;
        const annotations = (Array.isArray(previous) ? previous : []).filter(item => item && item.id !== PINYIN).map(item => ({...item}));
        const input = String(value || '').trim();
        if (input) annotations.push({ id:PINYIN, category:'reading', system:PINYIN, value:input, learnable:true, display:'ruby' });
        word.annotations = annotations;
        if (previousReading !== input) state.pinyin = false;
        word.study = { ...(word.study || {}), chinese:state };
        normalizeLearning(word, article);
        return word;
    }

    function learning(word) {
        const legacy = !!word?.memorized;
        const state = word?.study?.chinese;
        const old = word?.study;
        return {
            pinyin: typeof state?.pinyin === 'boolean' ? state.pinyin : typeof old?.annotations?.pinyin === 'boolean' ? old.annotations.pinyin : legacy && !!reading(word),
            meaning: typeof state?.meaning === 'boolean' ? state.meaning : typeof old?.meaning === 'boolean' ? old.meaning : legacy
        };
    }
    function normalizeLearning(word, article) {
        if (!word || !isChinese(article)) return word;
        const state = learning(word);
        if (!word.study || typeof word.study !== 'object' || Array.isArray(word.study)) word.study = {};
        word.study.chinese = state;
        word.memorized = !!reading(word) && state.pinyin && state.meaning;
        return word;
    }

    function setLearning(word, target, learned, article) {
        if (!word || !isChinese(article) || (target !== 'pinyin' && target !== 'meaning')) return;
        if (target === 'pinyin' && !reading(word)) return;
        const state = learning(word);
        state[target] = !!learned;
        if (!word.study || typeof word.study !== 'object' || Array.isArray(word.study)) word.study = {};
        word.study.chinese = state;
        word.memorized = !!reading(word) && !!state.meaning && !!state.pinyin;
    }
    function setAllLearning(word, learned, article) {
        if (!word || !isChinese(article)) {
            if (word) word.memorized = !!learned;
            return;
        }
        if (!word.study || typeof word.study !== 'object' || Array.isArray(word.study)) word.study = {};
        word.study.chinese = { pinyin: !!learned && !!reading(word), meaning: !!learned };
        normalizeLearning(word, article);
    }
    function mirrorMastery(word, article) {
        if (word && isChinese(article)) setAllLearning(word, !!word.memorized, article);
    }
    function countWords(text, article,state) { return profiles.wordSegments(text,state).length; }

    function groupKey(word, article, state) {
        return language(article, state) + '::' + String(word?.word || '').trim().toLocaleLowerCase() + '::'
            + (isChinese(article, state) ? reading(word).toLocaleLowerCase() : '');
    }

    function syncMaskOptions(select) {
        if (!select) return;
        const chinese = isChinese();
        if (select.dataset.languageProfile === String(chinese)) return;
        const value = select.value;
        select.replaceChildren();
        const options = chinese
            ? [['learning','拼音と意味を隠す'],['reading','拼音を隠す'],['meaning','意味を隠す'],['word','単語を隠す']]
            : [['both','両方隠す'],['word','単語を隠す'],['meaning','意味を隠す']];
        options.forEach(([id,label]) => {
            const option = select.ownerDocument.createElement('option');
            option.value=id; option.textContent=label; select.appendChild(option);
        });
        select.value=options.some(([id])=>id===value)?value:options[0][0];
        select.dataset.languageProfile=String(chinese);
    }

    // UI entry points; no DOM work during module load.
    function generationHint(text, value) {
        if (typeof document === 'undefined') return;
        const hint=document.querySelector('#chinese-word-field small');
        if(hint)hint.textContent=/\p{Script=Han}/u.test(text) && !value
            ? '拼音を自動生成できませんでした。手動で入力できます。'
            : '声調を含めて手動で編集できます。';
    }
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
        generationHint(text,input.value);
    }
    function wordTextChanged() {
        if (typeof document === 'undefined') return;
        const input = document.getElementById('input-word-pinyin');
        if (!input || document.getElementById('chinese-word-field')?.hidden) return;
        if (input.value.trim() && input.value !== (input.dataset.generated || '')) return;
        input.value = generate(document.getElementById('input-word-text')?.value || '');
        input.dataset.generated = input.value;
        generationHint(document.getElementById('input-word-text')?.value || '',input.value);
    }
    function regenerate() {
        if (typeof document === 'undefined') return;
        const input = document.getElementById('input-word-pinyin');
        if (!input) return;
        input.value = generate(document.getElementById('input-word-text')?.value || '');
        input.dataset.generated = input.value;
        generationHint(document.getElementById('input-word-text')?.value || '',input.value);
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
        if (!enabled) return;
        const doc = display.ownerDocument;
        const records = [];
        display.querySelectorAll('p[data-paragraph-index]').forEach(paragraph => {
            if (paragraph.dataset.chineseDecorated) { records.push(...(sentenceRecords.get(paragraph) || [])); return; }
            const walker = doc.createTreeWalker(paragraph, 4);
            const nodes = [];
            while (walker.nextNode()) {
                if (!walker.currentNode.parentElement.closest('button, .chinese-character')) nodes.push(walker.currentNode);
            }
            const text = nodes.map(node => node.nodeValue).join('');
            const readings = characterReadings(text);
            const wordRanges=new Map();
            let sourceOffset=0;
            nodes.forEach(node=>{
                const element=node.parentElement.closest('.word-highlight[data-word-index]');
                if(element){
                    const range=wordRanges.get(element) || {start:sourceOffset,text:''};
                    range.text+=node.nodeValue; wordRanges.set(element,range);
                }
                sourceOffset+=node.nodeValue.length;
            });
            wordRanges.forEach((range,element)=>{
                const value=reading(article?.words?.[Number(element.dataset.wordIndex)]);
                if(!value)return;
                const syllables=value.split(/\s+/).filter(Boolean);
                const chars=Array.from(range.text);
                if(syllables.length===chars.length){
                    let index=range.start;
                    chars.forEach((char,i)=>{readings.set(index,syllables[i]);index+=char.length;});
                }else{
                    element.dataset.manualPinyin=value;
                    element.classList.add('chinese-manual-reading');
                }
            });
            const sentences = splitSentences(text).map(sentence => ({...sentence,parts:[]}));
            sentenceRecords.set(paragraph,sentences); records.push(...sentences);
            const endings = new Map(sentences.map(sentence => [sentence.end,sentence]));
            let sentenceIndex = 0;
            let offset = 0;
            nodes.forEach(node => {
                const fragment = doc.createDocumentFragment();
                const wordElement = node.parentElement.closest('.word-highlight[data-word-index]');
                const word = article?.words?.[Number(wordElement?.dataset.wordIndex)];
                const manual = reading(word).split(/\s+/).filter(Boolean);
                const chars = Array.from(node.nodeValue);
                const override = wordElement && wordElement.textContent === node.nodeValue
                    && manual.length === chars.length;
                chars.forEach((char, index) => {
                    const pinyin = override ? manual[index] : readings.get(offset);
                    if (pinyin && /\p{Script=Han}/u.test(char)) {
                        const span = doc.createElement('span');
                        span.className = 'chinese-character';
                        span.dataset.pinyin = pinyin;
                        span.textContent = char;
                        while (sentences[sentenceIndex] && offset >= sentences[sentenceIndex].end) sentenceIndex++;
                        sentences[sentenceIndex]?.parts.push(span);
                        fragment.appendChild(span);
                    } else fragment.appendChild(doc.createTextNode(char));
                    offset += char.length;
                    if (endings.has(offset)) {
                        const record = endings.get(offset);
                        const sentence = record.text;
                        const button = doc.createElement('button');
                        button.type = 'button';
                        button.className = 'chinese-sentence-audio';
                        button.setAttribute('aria-label', 'この文を再生: ' + sentence.trim());
                        button.setAttribute('aria-pressed', 'false');
                        button.title = 'この文を再生／停止';
                        record.button = button; buttonRecords.set(button,record);
                        button.disabled = !window.speechSynthesis || !window.SpeechSynthesisUtterance;
                        button.addEventListener('click', event => {
                            event.stopPropagation();
                            playSentence(sentence, button);
                        });
                        fragment.appendChild(button);
                    }
                });
                node.replaceWith(fragment);
            });
            paragraph.dataset.chineseDecorated = 'true';
        });
        sentenceRecords.set(display,records);
    }
    function attachStudyControls(card, word, article, onChange) {
        if (!card || !isChinese(article) || typeof document === 'undefined') return;
        const value = reading(word);
        normalizeLearning(word,article);
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
        language, isChinese, reading, generate, applyReading, learning, normalizeLearning,
        setLearning, setAllLearning, mirrorMastery, countWords, groupKey,
        syncEditor, wordTextChanged, regenerate, syncReaderControls,
        decorateReader, attachStudyControls, syncMaskOptions, splitSentences, characterReadings,
        playSentence, stopSentenceAudio, playAllSentences, setSpeechRate, beforeSpeech
    });
});
