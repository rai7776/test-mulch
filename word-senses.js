(function () {
    'use strict';

    const state = {
        rows: [],
        contextSenseId: null,
        loadedKey: null,
        dirty: false,
        pickerOpen: false
    };

    function byId(id) { return document.getElementById(id); }
    function clone(value) {
        if (value == null) return value;
        try { return structuredClone(value); } catch (_) { return JSON.parse(JSON.stringify(value)); }
    }
    function normalizeText(value) { return String(value || '').trim(); }
    function normalizeWord(value) {
        try {
            if (typeof normalizeVocabularyWord === 'function') return normalizeVocabularyWord(value);
        } catch (_) {}
        return normalizeText(value).toLocaleLowerCase();
    }
    function hashString(value) {
        let hash = 2166136261;
        const text = String(value || '');
        for (let i = 0; i < text.length; i += 1) {
            hash ^= text.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }
    function legacySenseId(wordText, meaning) {
        return `legacy-${hashString(`${normalizeWord(wordText)}\u0000${normalizeText(meaning)}`)}`;
    }
    function newSenseId() {
        return `sense-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    function getWordSenses(word) {
        const stored = Array.isArray(word?.senses)
            ? word.senses.filter(sense => sense && normalizeText(sense.meaning)).map(sense => ({
                ...clone(sense),
                id: normalizeText(sense.id) || newSenseId(),
                meaning: normalizeText(sense.meaning)
            }))
            : [];
        if (stored.length) return stored;
        const meaning = normalizeText(word?.meaning);
        if (!meaning) return [];
        return [{ id: legacySenseId(word?.word, meaning), meaning }];
    }

    function getContextSenseId(word, senses) {
        const explicit = normalizeText(word?.contextSenseId);
        if (explicit && senses.some(sense => sense.id === explicit)) return explicit;
        const meaning = normalizeText(word?.meaning);
        const matching = senses.find(sense => sense.meaning === meaning);
        return matching?.id || senses[0]?.id || null;
    }

    function getSenseDisplay(word) {
        const senses = getWordSenses(word);
        const contextSenseId = getContextSenseId(word, senses);
        const context = senses.find(sense => sense.id === contextSenseId) || senses[0] || null;
        const seen = new Set();
        const contextMeaning = normalizeText(context?.meaning);
        if (contextMeaning) seen.add(contextMeaning.toLocaleLowerCase());
        const others = [];
        senses.forEach(sense => {
            if (!sense || sense.id === context?.id) return;
            const meaning = normalizeText(sense.meaning);
            if (!meaning) return;
            const key = meaning.toLocaleLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            others.push({ ...clone(sense), meaning });
        });
        return { senses, contextSenseId: context?.id || contextSenseId || null, context, others };
    }

    function resolveCurrentWord() {
        try {
            if (typeof globalVocabularyEditRef !== 'undefined' && globalVocabularyEditRef) {
                const ref = globalVocabularyEditRef;
                const article = (typeof libraryItems !== 'undefined' ? libraryItems : []).find(item =>
                    item && item.type === 'article' && String(item.id) === String(ref.articleId)
                );
                if (!article || !Array.isArray(article.words)) return null;
                let index = -1;
                if (typeof resolveArticleCollectionIndex === 'function') {
                    index = resolveArticleCollectionIndex(article.words, ref.wordId, ref.sourceIndex);
                }
                if (index < 0) index = Number.isInteger(ref.sourceIndex) ? ref.sourceIndex : -1;
                return index >= 0 && article.words[index] ? { article, index, word: article.words[index] } : null;
            }
            if (typeof currentArticle === 'undefined' || !currentArticle || !Array.isArray(currentArticle.words)) return null;
            const id = typeof editingId === 'undefined' ? null : editingId;
            const sourceIndex = typeof editingSourceIndex === 'undefined' ? null : editingSourceIndex;
            if ((id === null || id === undefined) && (sourceIndex === null || sourceIndex === undefined)) return null;
            let index = -1;
            if (typeof resolveArticleCollectionIndex === 'function') {
                index = resolveArticleCollectionIndex(currentArticle.words, id, sourceIndex);
            }
            return index >= 0 && currentArticle.words[index] ? { article: currentArticle, index, word: currentArticle.words[index] } : null;
        } catch (_) {
            return null;
        }
    }

    function modalKey() {
        const current = resolveCurrentWord();
        if (current) return `word:${String(current.article.id)}:${String(current.word?.id ?? current.index)}`;
        const canonical = normalizeText(byId('input-word-text')?.value);
        return `new:${canonical}`;
    }

    function ensureEditor() {
        if (byId('word-senses-editor')) return byId('word-senses-editor');
        const legacyInput = byId('input-word-meaning');
        if (!legacyInput) return null;
        const legacyLabel = legacyInput.previousElementSibling;
        if (legacyLabel?.tagName === 'LABEL') legacyLabel.classList.add('word-senses-legacy-hidden');
        legacyInput.classList.add('word-senses-legacy-hidden');
        legacyInput.required = false;

        const root = document.createElement('div');
        root.id = 'word-senses-editor';
        root.innerHTML = `
            <div class="word-senses-title">意味</div>
            <div id="word-senses-list" class="word-senses-list"></div>
            <div class="word-senses-actions">
                <button type="button" data-sense-add>＋ 新しい意味</button>
                <button type="button" data-sense-existing>＋ 既存の意味から追加</button>
            </div>
            <div id="word-senses-existing-panel" class="word-senses-existing-panel" hidden>
                <div class="word-senses-existing-head">
                    <strong>登録済みの意味から追加</strong>
                    <button type="button" data-sense-existing-close aria-label="閉じる">×</button>
                </div>
                <div id="word-senses-existing-list"></div>
            </div>
            <div id="word-senses-status" class="word-senses-status" role="status" aria-live="polite"></div>
        `;
        legacyInput.insertAdjacentElement('afterend', root);
        root.querySelector('[data-sense-add]')?.addEventListener('click', () => addNewSense());
        root.querySelector('[data-sense-existing]')?.addEventListener('click', () => toggleExistingPanel(true));
        root.querySelector('[data-sense-existing-close]')?.addEventListener('click', () => toggleExistingPanel(false));
        byId('input-word-text')?.addEventListener('input', () => {
            if (state.pickerOpen) renderExistingCandidates();
        });
        return root;
    }

    function setStatus(message, error = false) {
        const status = byId('word-senses-status');
        if (!status) return;
        status.textContent = message || '';
        status.classList.toggle('is-error', !!error);
    }

    function ensureContext() {
        if (!state.rows.length) {
            state.contextSenseId = null;
            return;
        }
        if (!state.rows.some(row => row.id === state.contextSenseId)) {
            state.contextSenseId = state.rows[0].id;
        }
    }

    function syncLegacyMeaning() {
        ensureContext();
        const context = state.rows.find(row => row.id === state.contextSenseId);
        const input = byId('input-word-meaning');
        if (input) input.value = normalizeText(context?.meaning);
    }

    function renderRows() {
        const list = byId('word-senses-list');
        if (!list) return;
        ensureContext();
        list.replaceChildren();
        if (!state.rows.length) {
            const empty = document.createElement('div');
            empty.className = 'word-senses-empty';
            empty.textContent = '意味を追加してください。';
            list.appendChild(empty);
        }
        state.rows.forEach((row, index) => {
            const card = document.createElement('div');
            card.className = 'word-sense-row';
            const contextButton = document.createElement('button');
            contextButton.type = 'button';
            contextButton.className = 'word-sense-context-toggle';
            contextButton.setAttribute('aria-label', 'この文脈の意味にする');
            contextButton.textContent = row.id === state.contextSenseId ? '●' : '○';
            contextButton.addEventListener('click', () => {
                state.contextSenseId = row.id;
                state.dirty = true;
                syncLegacyMeaning();
                renderRows();
            });

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'word-sense-meaning';
            input.placeholder = '意味を入力';
            input.value = row.meaning || '';
            input.addEventListener('input', () => {
                row.meaning = input.value;
                state.dirty = true;
                syncLegacyMeaning();
                setStatus('');
            });

            const badge = document.createElement('span');
            badge.className = 'word-sense-context-badge';
            badge.textContent = 'この文脈';
            badge.hidden = row.id !== state.contextSenseId;

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'word-sense-remove';
            remove.textContent = '×';
            remove.setAttribute('aria-label', `${index + 1}番目の意味を外す`);
            remove.addEventListener('click', () => {
                const wasContext = row.id === state.contextSenseId;
                state.rows.splice(index, 1);
                if (wasContext) state.contextSenseId = state.rows[0]?.id || null;
                state.dirty = true;
                syncLegacyMeaning();
                renderRows();
                if (state.pickerOpen) renderExistingCandidates();
            });

            card.append(contextButton, input, badge, remove);
            list.appendChild(card);
        });
        syncLegacyMeaning();
    }

    function addNewSense() {
        const row = { id: newSenseId(), meaning: '' };
        state.rows.push(row);
        if (!state.contextSenseId) state.contextSenseId = row.id;
        state.dirty = true;
        renderRows();
        setTimeout(() => {
            const inputs = document.querySelectorAll('#word-senses-list .word-sense-meaning');
            inputs[inputs.length - 1]?.focus();
        }, 0);
    }

    function collectExistingCandidates() {
        const targetWord = normalizeWord(byId('input-word-text')?.value);
        if (!targetWord) return [];
        const currentIds = new Set(state.rows.map(row => row.id));
        const candidates = new Map();
        try {
            (typeof libraryItems !== 'undefined' ? libraryItems : [])
                .filter(article => article && article.type === 'article' && Array.isArray(article.words))
                .forEach(article => {
                    article.words.forEach(word => {
                        if (normalizeWord(word?.word) !== targetWord) return;
                        const senses = getWordSenses(word);
                        senses.forEach(sense => {
                            if (!sense.id || currentIds.has(sense.id)) return;
                            if (!candidates.has(sense.id)) {
                                candidates.set(sense.id, {
                                    id: sense.id,
                                    meaning: sense.meaning,
                                    sourceArticles: new Set()
                                });
                            }
                            candidates.get(sense.id).sourceArticles.add(String(article.name || '無題'));
                        });
                    });
                });
        } catch (_) {}
        return Array.from(candidates.values()).filter(candidate => normalizeText(candidate.meaning));
    }

    function renderExistingCandidates() {
        const container = byId('word-senses-existing-list');
        if (!container) return;
        container.replaceChildren();
        const candidates = collectExistingCandidates();
        if (!candidates.length) {
            const empty = document.createElement('div');
            empty.className = 'word-senses-existing-empty';
            empty.textContent = 'この単語には追加できる登録済みの意味がありません。';
            container.appendChild(empty);
            return;
        }
        candidates.forEach(candidate => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'word-senses-existing-item';
            const plus = document.createElement('span');
            plus.className = 'word-senses-existing-plus';
            plus.textContent = '＋';
            const body = document.createElement('span');
            body.className = 'word-senses-existing-body';
            const meaning = document.createElement('span');
            meaning.className = 'word-senses-existing-meaning';
            meaning.textContent = candidate.meaning;
            const source = document.createElement('small');
            source.textContent = Array.from(candidate.sourceArticles).slice(0, 3).join('・');
            body.append(meaning, source);
            button.append(plus, body);
            button.addEventListener('click', () => {
                const onlyBlank = state.rows.length === 1 && !normalizeText(state.rows[0].meaning);
                if (onlyBlank) {
                    state.rows[0] = { id: candidate.id, meaning: candidate.meaning };
                    state.contextSenseId = candidate.id;
                } else {
                    state.rows.push({ id: candidate.id, meaning: candidate.meaning });
                    if (!state.contextSenseId) state.contextSenseId = candidate.id;
                }
                state.dirty = true;
                renderRows();
                renderExistingCandidates();
            });
            container.appendChild(button);
        });
    }

    function toggleExistingPanel(show) {
        const panel = byId('word-senses-existing-panel');
        if (!panel) return;
        state.pickerOpen = show === undefined ? panel.hidden : !!show;
        panel.hidden = !state.pickerOpen;
        if (state.pickerOpen) renderExistingCandidates();
    }

    function loadFromContext(force = false) {
        ensureEditor();
        const section = byId('form-word-section');
        if (!section || getComputedStyle(section).display === 'none') return;
        const key = modalKey();
        if (!force && state.loadedKey === key && state.dirty) return;
        const current = resolveCurrentWord();
        if (current) {
            const senses = getWordSenses(current.word);
            state.rows = senses.map(sense => ({ ...clone(sense) }));
            state.contextSenseId = getContextSenseId(current.word, senses);
        } else {
            const legacyMeaning = normalizeText(byId('input-word-meaning')?.value);
            const canonical = normalizeText(byId('input-word-text')?.value);
            state.rows = [{ id: newSenseId(), meaning: legacyMeaning }];
            state.contextSenseId = state.rows[0].id;
            if (!canonical && !legacyMeaning) state.rows[0].meaning = '';
        }
        state.loadedKey = key;
        state.dirty = false;
        state.pickerOpen = false;
        toggleExistingPanel(false);
        renderRows();
        setStatus('');
    }

    function validate() {
        const validRows = state.rows.filter(row => normalizeText(row.meaning));
        if (!validRows.length) return { ok: false, message: '意味を1つ以上入力してください。' };
        if (validRows.length !== state.rows.length) return { ok: false, message: '空欄の意味があります。入力するか×で削除してください。' };
        ensureContext();
        if (!state.contextSenseId || !state.rows.some(row => row.id === state.contextSenseId)) {
            return { ok: false, message: '「この文脈」の意味を選んでください。' };
        }
        return { ok: true };
    }

    function buildPayload() {
        ensureContext();
        return {
            senses: state.rows.map(row => ({ ...clone(row), id: normalizeText(row.id) || newSenseId(), meaning: normalizeText(row.meaning) })),
            contextSenseId: state.contextSenseId
        };
    }

    function captureSaveTarget() {
        try {
            if (typeof globalVocabularyEditRef !== 'undefined' && globalVocabularyEditRef) {
                const ref = { ...globalVocabularyEditRef };
                const article = (typeof libraryItems !== 'undefined' ? libraryItems : []).find(item => item && item.type === 'article' && String(item.id) === String(ref.articleId));
                if (!article || !Array.isArray(article.words)) return null;
                let index = typeof resolveArticleCollectionIndex === 'function'
                    ? resolveArticleCollectionIndex(article.words, ref.wordId, ref.sourceIndex)
                    : Number(ref.sourceIndex);
                return { article, index, beforeLength: article.words.length, isNew: false };
            }
            if (typeof currentArticle === 'undefined' || !currentArticle || !Array.isArray(currentArticle.words)) return null;
            const id = typeof editingId === 'undefined' ? null : editingId;
            const sourceIndex = typeof editingSourceIndex === 'undefined' ? null : editingSourceIndex;
            const index = typeof resolveArticleCollectionIndex === 'function'
                ? resolveArticleCollectionIndex(currentArticle.words, id, sourceIndex)
                : -1;
            return { article: currentArticle, index, beforeLength: currentArticle.words.length, isNew: index < 0 };
        } catch (_) {
            return null;
        }
    }

    function enhanceSavedWord(word, payload) {
        if (!word || !payload) return;
        word.senses = payload.senses.map(sense => ({ ...sense }));
        word.contextSenseId = payload.contextSenseId;
        const context = word.senses.find(sense => sense.id === payload.contextSenseId) || word.senses[0];
        if (context) word.meaning = context.meaning;
    }

    function wrapSave() {
        const original = window.handleUnifiedSave;
        if (typeof original !== 'function' || original.__wordSensesWrapped) return;
        const wrapped = async function (event) {
            const section = byId('form-word-section');
            const isWord = section && getComputedStyle(section).display !== 'none';
            if (!isWord) return original.apply(this, arguments);

            const check = validate();
            if (!check.ok) {
                event?.preventDefault?.();
                setStatus(check.message, true);
                byId('word-senses-editor')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                return;
            }
            syncLegacyMeaning();
            const target = captureSaveTarget();
            const payload = buildPayload();
            const result = await original.apply(this, arguments);
            if (target?.article && Array.isArray(target.article.words)) {
                let index = target.index;
                if ((index < 0 || !target.article.words[index]) && target.article.words.length > target.beforeLength) {
                    index = target.article.words.length - 1;
                }
                if (index >= 0 && target.article.words[index]) {
                    enhanceSavedWord(target.article.words[index], payload);
                    try { if (typeof saveToDB === 'function') await saveToDB(); } catch (_) {}
                    try {
                        if (typeof globalVocabularyState !== 'undefined') globalVocabularyState.entries = typeof collectGlobalVocabulary === 'function' ? collectGlobalVocabulary() : globalVocabularyState.entries;
                        if (typeof renderGlobalVocabulary === 'function' && byId('global-vocabulary-section') && getComputedStyle(byId('global-vocabulary-section')).display !== 'none') renderGlobalVocabulary();
                    } catch (_) {}
                }
            }
            state.dirty = false;
            state.loadedKey = null;
            return result;
        };
        wrapped.__wordSensesWrapped = true;
        window.handleUnifiedSave = wrapped;
    }

    function wrapGlobal(name, after) {
        const original = window[name];
        if (typeof original !== 'function' || original.__wordSensesContextWrapped) return;
        const wrapped = function (...args) {
            const result = original.apply(this, args);
            const finish = () => setTimeout(() => after(...args), 0);
            if (result && typeof result.then === 'function') return result.then(value => { finish(); return value; });
            finish();
            return result;
        };
        wrapped.__wordSensesContextWrapped = true;
        window[name] = wrapped;
    }

    function collectGroupSenses(group) {
        const map = new Map();
        (group?.entries || []).forEach(entry => {
            const word = entry.word || {};
            const senses = getWordSenses(word);
            const contextId = getContextSenseId(word, senses);
            senses.forEach(sense => {
                if (!map.has(sense.id)) {
                    map.set(sense.id, { id: sense.id, meaning: sense.meaning, sourceArticles: new Set(), contextArticles: new Set() });
                }
                const item = map.get(sense.id);
                item.sourceArticles.add(String(entry.articleTitle || '無題'));
                if (sense.id === contextId) item.contextArticles.add(String(entry.articleTitle || '無題'));
            });
        });
        return Array.from(map.values());
    }

    function enhanceVocabularyCard(card, entry) {
        if (!card || !entry?.word) return card;
        const display = getSenseDisplay(entry.word);
        if (!display.context) return card;
        const meaning = card.querySelector('.global-vocabulary-summary .meaning-right');
        if (!meaning) return card;

        meaning.replaceChildren();
        const primary = document.createElement('div');
        primary.className = 'global-vocabulary-primary-sense';
        primary.textContent = display.context.meaning;
        meaning.appendChild(primary);

        if (display.others.length) {
            const secondary = document.createElement('div');
            secondary.className = 'global-vocabulary-secondary-senses';
            secondary.setAttribute('aria-label', 'その他の意味');
            display.others.forEach(sense => {
                const row = document.createElement('span');
                row.textContent = sense.meaning;
                secondary.appendChild(row);
            });
            meaning.appendChild(secondary);
        }
        return card;
    }

    function enhanceGroupCard(card, group) {
        if (!card || !group) return card;
        const senses = collectGroupSenses(group);
        const count = card.querySelector('.global-vocabulary-group-count');
        if (count) {
            const memorized = (group.entries || []).filter(entry => entry.memorized).length;
            const label = senses.length <= 1 ? (senses[0]?.meaning || '') : `${senses.length} meanings`;
            count.textContent = `${label} · × ${group.entries.length} · ${memorized}/${group.entries.length} 暗記済み`;
        }
        const entries = card.querySelector('.global-vocabulary-group-entries');
        if (entries && senses.length) {
            const section = document.createElement('div');
            section.className = 'global-vocabulary-senses-summary';
            const title = document.createElement('div');
            title.className = 'global-vocabulary-senses-title';
            title.textContent = '意味';
            section.appendChild(title);
            senses.forEach(sense => {
                const row = document.createElement('div');
                row.className = 'global-vocabulary-sense-item';
                const meaning = document.createElement('div');
                meaning.className = 'global-vocabulary-sense-meaning';
                meaning.textContent = sense.meaning;
                const source = document.createElement('small');
                const sourceText = Array.from(sense.sourceArticles).join('・');
                const contextText = Array.from(sense.contextArticles).join('・');
                source.textContent = contextText
                    ? `${sourceText}　この文脈: ${contextText}`
                    : sourceText;
                row.append(meaning, source);
                section.appendChild(row);
            });
            entries.insertAdjacentElement('beforebegin', section);
        }
        return card;
    }

    function wrapGlobalVocabularyCard() {
        const original = window.createGlobalVocabularyCard;
        if (typeof original !== 'function' || original.__wordSensesWrapped) return;
        const wrapped = function (entry) {
            return enhanceVocabularyCard(original.apply(this, arguments), entry);
        };
        wrapped.__wordSensesWrapped = true;
        window.createGlobalVocabularyCard = wrapped;
    }

    function wrapGlobalGroupCard() {
        const original = window.createGlobalVocabularyGroupCard;
        if (typeof original !== 'function' || original.__wordSensesWrapped) return;
        const wrapped = function (group) {
            return enhanceGroupCard(original.apply(this, arguments), group);
        };
        wrapped.__wordSensesWrapped = true;
        window.createGlobalVocabularyGroupCard = wrapped;
    }

    function installStyles() {
        if (byId('word-senses-style')) return;
        const style = document.createElement('style');
        style.id = 'word-senses-style';
        style.textContent = `
            .word-senses-legacy-hidden { position:absolute!important; width:1px!important; height:1px!important; padding:0!important; margin:-1px!important; overflow:hidden!important; clip:rect(0,0,0,0)!important; white-space:nowrap!important; border:0!important; }
            #word-senses-editor { margin: 4px 0 14px; }
            .word-senses-title { margin: 0 0 8px; font-weight: 700; color: #3f454b; }
            .word-senses-list { display: grid; gap: 8px; }
            .word-sense-row { display:grid; grid-template-columns: 34px minmax(0,1fr) auto 36px; gap:8px; align-items:center; padding:8px 9px; border:1px solid #dfe3e7; border-radius:10px; background:#fff; }
            .word-sense-context-toggle, .word-sense-remove { border:0; background:transparent; min-height:36px; font-size:1.25rem; line-height:1; padding:0; }
            .word-sense-context-toggle { color:#30363b; }
            .word-sense-remove { color:#8a5550; font-size:1.1rem; }
            .word-sense-meaning { min-width:0; width:100%; border:0!important; padding:7px 4px!important; margin:0!important; background:transparent!important; box-shadow:none!important; font-size:1rem; }
            .word-sense-context-badge { white-space:nowrap; padding:4px 7px; border-radius:999px; background:#f3eee8; color:#805a33; font-size:.72rem; font-weight:700; }
            .word-senses-actions { display:flex; flex-wrap:wrap; gap:7px; margin-top:9px; }
            .word-senses-actions button { border:1px solid #d8dde2; background:#fff; color:#47515a; border-radius:9px; padding:8px 10px; font-weight:700; }
            .word-senses-existing-panel { margin-top:10px; padding:10px; border:1px solid #e0e3e6; border-radius:10px; background:#fafafa; }
            .word-senses-existing-head { display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:7px; }
            .word-senses-existing-head button { border:0; background:transparent; font-size:1.1rem; }
            #word-senses-existing-list { display:grid; gap:6px; }
            .word-senses-existing-item { display:grid; grid-template-columns:28px minmax(0,1fr); gap:7px; align-items:center; width:100%; text-align:left; padding:9px; border:1px solid #e1e4e7; border-radius:9px; background:#fff; }
            .word-senses-existing-plus { font-size:1.15rem; font-weight:700; }
            .word-senses-existing-body { display:grid; gap:2px; min-width:0; }
            .word-senses-existing-meaning { font-weight:700; overflow-wrap:anywhere; }
            .word-senses-existing-body small { color:#8a929a; font-size:.7rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
            .word-senses-empty, .word-senses-existing-empty { padding:9px; color:#8a929a; font-size:.78rem; }
            .word-senses-status { min-height:1.1em; margin-top:6px; color:#6d7780; font-size:.72rem; }
            .word-senses-status.is-error { color:#ad3f3f; }
            .global-vocabulary-primary-sense { font-weight:700; line-height:1.35; }
            .global-vocabulary-secondary-senses { display:grid; gap:1px; margin-top:3px; color:#8a929a; font-size:.72rem; font-weight:500; line-height:1.35; }
            .global-vocabulary-secondary-senses span::before { content:'・'; }
            .global-vocabulary-senses-summary { margin:10px 0; padding:10px; border:1px solid #e4e7ea; border-radius:10px; background:#fafafa; }
            .global-vocabulary-senses-title { margin-bottom:6px; font-weight:800; }
            .global-vocabulary-sense-item { padding:7px 4px; border-top:1px solid #eceeef; }
            .global-vocabulary-sense-item:first-of-type { border-top:0; }
            .global-vocabulary-sense-meaning { font-weight:700; }
            .global-vocabulary-sense-item small { display:block; margin-top:2px; color:#8a929a; font-size:.68rem; }
            @media (max-width:600px) {
                .word-sense-row { grid-template-columns:30px minmax(0,1fr) 34px; }
                .word-sense-context-badge { grid-column:2; justify-self:start; margin-top:-5px; }
                .word-sense-remove { grid-column:3; grid-row:1 / span 2; }
                .word-senses-actions { display:grid; grid-template-columns:1fr; }
                .word-senses-actions button { width:100%; text-align:left; }
            }
        `;
        document.head.appendChild(style);
    }

    function init() {
        installStyles();
        ensureEditor();
        wrapSave();
        wrapGlobalVocabularyCard();
        wrapGlobalGroupCard();
        wrapGlobal('showUnifiedModal', () => loadFromContext(true));
        wrapGlobal('switchModalType', () => loadFromContext(false));
        wrapGlobal('openUnifiedModal', () => loadFromContext(true));
        wrapGlobal('editItem', () => loadFromContext(true));
        wrapGlobal('openGlobalVocabularyWordEditor', () => loadFromContext(true));
        const overlay = byId('unified-modal-overlay');
        if (overlay) {
            new MutationObserver(() => {
                const section = byId('form-word-section');
                const visible = section && getComputedStyle(section).display !== 'none' && getComputedStyle(overlay).display !== 'none';
                if (visible) loadFromContext(false);
                else if (getComputedStyle(overlay).display === 'none') {
                    state.loadedKey = null;
                    state.dirty = false;
                    state.pickerOpen = false;
                }
            }).observe(overlay, { attributes:true, attributeFilter:['class','style'] });
        }
    }

    window.SmartReaderWordSenses = {
        getWordSenses,
        getContextSenseId,
        getSenseDisplay,
        collectGroupSenses,
        refresh: () => loadFromContext(true)
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();