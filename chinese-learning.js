/* Chinese reading and vocabulary adapter. Non-Chinese articles retain legacy data/behavior. */
(function (root, factory) {
    const profile = typeof module === 'object' && module.exports ? require('./language-profile.js') : root.SmartReaderLanguageProfile;
    const targets = typeof module === 'object' && module.exports ? require('./learning-targets.js') : root.SmartReaderLearningTargets;
    const api = factory(profile,targets);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) {
        root.SmartReaderChinese=api;
        root.addEventListener?.('pagehide',api.stopSentenceAudio);
        root.addEventListener?.('smartreader:workspace-ready',api.stopSentenceAudio);
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (profiles,targets) {
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
        const previousReading=reading(previousWord || word);
        targets.normalize(word);
        const previous=previousWord?.annotations || word.annotations;
        const annotations=(Array.isArray(previous)?previous:[]).filter(item=>item && item.id!==PINYIN).map(item=>({...item}));
        const input=String(value || '').trim();
        if(input)annotations.push({ id:PINYIN,category:'reading',system:PINYIN,value:input,learnable:true,display:'ruby' });
        word.annotations=annotations;
        if(input && previousReading!==input)targets.changed(word,targets.PINYIN);
        else targets.normalize(word);
        return word;
    }
    function learning(word) {
        return { pinyin:!!reading(word) && targets.readState(word,targets.PINYIN), meaning:targets.readState(word,targets.MEANING) };
    }
    function normalizeLearning(word) { return targets.normalize(word); }
    function setLearning(word,target,learned) {
        if(!word || !targets.managed(word))return;
        if(target==='__all')return targets.setAll(word,learned);
        return targets.set(word,target==='pinyin'?targets.PINYIN:target,learned);
    }
    function setAllLearning(word,learned) { return targets.setAll(word,learned); }
    function mirrorMastery(word) {
        if(word && targets.managed(word))targets.setAll(word,!!word.memorized);
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
    function generationHint(text, value, attempted=true) {
        if (typeof document === 'undefined') return;
        const hint=document.querySelector('#chinese-word-field small');
        if(hint)hint.textContent=attempted && /\p{Script=Han}/u.test(text) && !value
            ? '拼音を自動生成できませんでした。手動で入力できます。'
            : '拼音は任意です。空欄のまま保存できます。';
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
        const automatic = !word && !saved ? generate(text) : '';
        input.value = saved || automatic;
        input.dataset.generated = automatic;
        input.dataset.userEdited = word && !saved ? "true" : "false";
        generationHint(text,input.value,!word);
    }
    function wordTextChanged() {
        if (typeof document === 'undefined') return;
        const input = document.getElementById('input-word-pinyin');
        if (!input || document.getElementById('chinese-word-field')?.hidden) return;
        if (input.dataset.userEdited === 'true' || (input.value.trim() && input.value !== (input.dataset.generated || ''))) return;
        input.value = generate(document.getElementById('input-word-text')?.value || '');
        input.dataset.generated = input.value;
        generationHint(document.getElementById('input-word-text')?.value || '',input.value);
    }
    function readingEdited() {
        const input=typeof document!=='undefined'?document.getElementById('input-word-pinyin'):null;
        if(input){ input.dataset.userEdited='true'; generationHint('',input.value,false); }
    }
    function regenerate() {
        if (typeof document === 'undefined') return;
        const input = document.getElementById('input-word-pinyin');
        if (!input) return;
        input.dataset.userEdited='false';
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
        display.classList.toggle('chinese-reader', enabled);
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
                if (Array.from(range.text).length <= 8) element.classList.add('chinese-word-unit');
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
    function attachStudyControls(card,word,article,onChange) {
        if(!card || !targets.managed(word) || typeof document==='undefined')return;
        targets.normalize(word);
        const controls=document.createElement('div');
        controls.className='chinese-study-controls';
        const value=isChinese(article)?reading(word):'';
        if(value){
            const pronunciation=document.createElement('span');
            pronunciation.className='chinese-pinyin-label';
            pronunciation.textContent='拼音: '+value;
            controls.appendChild(pronunciation);
        }
        const status=document.createElement('span');
        status.className='learning-target-summary';
        const summary=targets.summary(word);
        status.textContent=summary.all?'すべて習得済み':summary.partial?'一部習得':'未習得';
        controls.appendChild(status);
        if(!card.querySelector('.word-left input[type="checkbox"]')){
            const label=document.createElement('label');
            label.className='chinese-study-check';
            const all=document.createElement('input');all.type='checkbox';
            targets.syncCheckbox(all,word);
            label.addEventListener('click',event=>event.stopPropagation());
            all.addEventListener('change',()=>{
                if(typeof onChange==='function')onChange('__all',all.checked);
            });
            label.append(all,document.createTextNode('全体習得'));
            controls.appendChild(label);
        }
        targets.targets(word).forEach(target=>{
            const wrapper=document.createElement('label');
            wrapper.className='chinese-study-check';
            const input=document.createElement('input');
            input.type='checkbox';input.checked=target.learned;
            wrapper.addEventListener('click',event=>event.stopPropagation());
            input.addEventListener('change',event=>{
                event.stopPropagation();
                if(typeof onChange==='function')onChange(target.id===targets.PINYIN?'pinyin':target.id,input.checked);
            });
            wrapper.append(input,document.createTextNode(target.label+' 習得済み'));
            controls.appendChild(wrapper);
        });
        card.appendChild(controls);
    }

    return Object.freeze({
        language, isChinese, reading, generate, applyReading, learning, normalizeLearning,
        setLearning, setAllLearning, mirrorMastery, countWords, groupKey,
        syncEditor, wordTextChanged, readingEdited, regenerate, syncReaderControls,
        decorateReader, attachStudyControls, syncMaskOptions, splitSentences, characterReadings,
        playSentence, stopSentenceAudio, playAllSentences, setSpeechRate, beforeSpeech
    });
});
