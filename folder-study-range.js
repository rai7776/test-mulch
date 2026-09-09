(function () {
    'use strict';

    const LIMIT_KEY = 'smart-reader-folder-study-limit-v1';
    const DEFAULT_LIMIT = 50;
    const state = {
        active: false,
        rawEntries: [],
        label: '',
        query: '',
        status: 'all',
        tag: 'all',
        partOfSpeech: 'all',
        selectedArticleIds: new Set(),
        chapterKey: 'all',
        limit: loadSavedLimit()
    };

    let originalOpen = null;
    let contextCaptureBound = false;

    function loadSavedLimit() {
        try {
            const value = Number(localStorage.getItem(LIMIT_KEY));
            if (Number.isFinite(value) && value >= 1) return Math.min(5000, Math.trunc(value));
        } catch (_) {}
        return DEFAULT_LIMIT;
    }

    function saveLimit(value) {
        try { localStorage.setItem(LIMIT_KEY, String(value)); } catch (_) {}
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
    }

    function normalizeText(value) {
        return String(value ?? '').trim().toLocaleLowerCase();
    }

    function partLabel(value) {
        const key = normalizeText(value);
        const labels = {
            noun: '名詞', verb: '動詞', adjective: '形容詞', adverb: '副詞',
            phrase: '句・熟語', preposition: '前置詞', conjunction: '接続詞', other: 'その他'
        };
        return labels[key] || String(value || '未設定');
    }

    function uniqueEntries(entries) {
        const seen = new Set();
        return (Array.isArray(entries) ? entries : []).filter(entry => {
            const key = String(entry?.key || `${entry?.articleId ?? ''}::${entry?.sourceIndex ?? ''}`);
            if (!entry?.word || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function articleId(entry) {
        return String(entry?.articleId ?? entry?.article?.id ?? '');
    }

    function chapterKey(entry) {
        const chapter = entry?.chapterId === null || entry?.chapterId === undefined || entry?.chapterId === ''
            ? '__none__'
            : String(entry.chapterId);
        return `${articleId(entry)}::${chapter}`;
    }

    function isFolderContext(entries, label) {
        return Array.isArray(entries)
            && String(label || '').startsWith('このフォルダ · ');
    }

    function resetState(entries, label) {
        state.active = true;
        state.rawEntries = uniqueEntries(entries);
        state.label = String(label || 'このフォルダ');
        state.query = '';
        state.status = 'all';
        state.tag = 'all';
        state.partOfSpeech = 'all';
        state.chapterKey = 'all';
        state.selectedArticleIds = new Set(state.rawEntries.map(articleId).filter(Boolean));
        state.limit = Math.max(1, loadSavedLimit());
    }

    function getArticleOptions() {
        const map = new Map();
        state.rawEntries.forEach(entry => {
            const id = articleId(entry);
            if (!id) return;
            const current = map.get(id) || {
                id,
                title: String(entry?.articleTitle || entry?.article?.name || '無題'),
                count: 0
            };
            current.count += 1;
            map.set(id, current);
        });
        return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title, 'ja'));
    }

    function getChapterOptions() {
        const map = new Map();
        state.rawEntries.forEach(entry => {
            const id = articleId(entry);
            if (!state.selectedArticleIds.has(id)) return;
            const key = chapterKey(entry);
            if (!map.has(key)) {
                const chapterTitle = entry?.chapterId === null || entry?.chapterId === undefined || entry?.chapterId === ''
                    ? '章未設定'
                    : String(entry?.chapterTitle || '章未設定');
                map.set(key, {
                    key,
                    label: `${String(entry?.articleTitle || entry?.article?.name || '無題')} / ${chapterTitle}`
                });
            }
        });
        return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label, 'ja'));
    }

    function getTagOptions() {
        const tags = new Set();
        state.rawEntries.forEach(entry => {
            (Array.isArray(entry?.word?.tags) ? entry.word.tags : []).forEach(tag => {
                const value = String(tag || '').trim();
                if (value) tags.add(value);
            });
        });
        return Array.from(tags).sort((a, b) => a.localeCompare(b, 'ja'));
    }

    function getPartOptions() {
        const parts = new Set();
        state.rawEntries.forEach(entry => {
            const value = String(entry?.word?.partOfSpeech || '').trim();
            if (value) parts.add(value);
        });
        return Array.from(parts).sort((a, b) => partLabel(a).localeCompare(partLabel(b), 'ja'));
    }

    function matchesQuery(word) {
        const query = normalizeText(state.query);
        if (!query) return true;
        return [word?.word, word?.surfaceText, word?.meaning, word?.memo, word?.context]
            .some(value => normalizeText(value).includes(query));
    }

    function filterEntries() {
        return state.rawEntries.filter(entry => {
            const word = entry.word || {};
            const sourceId = articleId(entry);
            if (!state.selectedArticleIds.has(sourceId)) return false;
            if (state.chapterKey !== 'all' && chapterKey(entry) !== state.chapterKey) return false;
            if (state.status === 'memorized' && !word.memorized) return false;
            if (state.status === 'unmemorized' && word.memorized) return false;
            if (state.tag !== 'all' && !(Array.isArray(word.tags) && word.tags.some(tag => String(tag) === state.tag))) return false;
            if (state.partOfSpeech !== 'all' && String(word.partOfSpeech || '') !== state.partOfSpeech) return false;
            if (!matchesQuery(word)) return false;
            return true;
        });
    }

    function normalizeLimit() {
        const input = document.getElementById('folder-study-limit');
        const raw = Number(input?.value ?? state.limit);
        const value = Number.isFinite(raw) ? Math.max(1, Math.min(5000, Math.trunc(raw))) : Math.max(1, state.limit || DEFAULT_LIMIT);
        state.limit = value;
        saveLimit(value);
        if (input && document.activeElement !== input) input.value = String(value);
        return value;
    }

    function shuffledCopy(entries) {
        const copy = [...entries];
        for (let i = copy.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    }

    function studySelectionBucket(entry) {
        const word = entry?.word || {};
        const study = word.study && typeof word.study === 'object' ? word.study : {};
        const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
        const seenCount = number(study.seenCount);
        const knownCount = number(study.knownCount);
        const unsureCount = number(study.unsureCount);
        const wrongCount = number(study.wrongCount);
        const lapseCount = number(study.lapseCount);
        const difficultyScore = Number.isFinite(Number(study.difficultyScore)) ? Number(study.difficultyScore) : 45;
        const level = number(study.level);
        const correctStreak = number(study.correctStreak);
        const lastResult = String(study.lastReviewResult || study.lastResult || '');
        const unstudied = seenCount === 0 && knownCount === 0 && unsureCount === 0 && wrongCount === 0 && !word.memorized;
        if (unstudied) return 'new';

        const stable = !!word.memorized || level >= 4 || correctStreak >= 3;
        const difficult = lastResult === 'wrong'
            || lastResult === 'unsure'
            || difficultyScore >= 65
            || lapseCount >= 1
            || (!stable && (wrongCount >= 1 || unsureCount >= 1));
        return difficult ? 'difficult' : 'known';
    }

    function chooseEntries(entries) {
        const limit = Math.min(normalizeLimit(), entries.length);
        if (entries.length <= limit) return [...entries];

        const buckets = { new: [], difficult: [], known: [] };
        entries.forEach(entry => buckets[studySelectionBucket(entry)].push(entry));
        Object.keys(buckets).forEach(key => { buckets[key] = shuffledCopy(buckets[key]); });

        const targetNew = Math.round(limit * 0.60);
        const targetDifficult = Math.round(limit * 0.30);
        const targetKnown = Math.max(0, limit - targetNew - targetDifficult);
        const selected = [];

        const take = (key, count) => {
            if (count <= 0 || !buckets[key].length) return;
            selected.push(...buckets[key].splice(0, Math.min(count, buckets[key].length)));
        };

        take('new', targetNew);
        take('difficult', targetDifficult);
        take('known', targetKnown);

        let remaining = limit - selected.length;
        ['new', 'difficult', 'known'].forEach(key => {
            if (remaining <= 0) return;
            const count = Math.min(remaining, buckets[key].length);
            take(key, count);
            remaining -= count;
        });

        return selected.slice(0, limit);
    }

    function ensurePanel() {
        const hub = document.querySelector('#study-hub-overlay .study-hub');
        if (!hub) return null;
        let panel = document.getElementById('folder-study-range-settings');
        if (!panel) {
            panel = document.createElement('details');
            panel.id = 'folder-study-range-settings';
            panel.className = 'study-hub-settings folder-study-range-settings';
            panel.open = true;
            panel.innerHTML = `
                <summary>学習範囲</summary>
                <div class="folder-study-range-body">
                    <label class="folder-study-field folder-study-search-field">
                        <span>検索</span>
                        <input type="search" id="folder-study-query" placeholder="単語・意味・メモ・例文">
                    </label>
                    <div class="folder-study-field folder-study-article-field">
                        <span>対象記事</span>
                        <details class="folder-study-picker" id="folder-study-article-picker">
                            <summary><span id="folder-study-article-summary">すべて</span></summary>
                            <div id="folder-study-article-options" class="folder-study-picker-options"></div>
                        </details>
                    </div>
                    <label class="folder-study-field">
                        <span>章</span>
                        <select id="folder-study-chapter"><option value="all">すべて</option></select>
                    </label>
                    <label class="folder-study-field">
                        <span>暗記状態</span>
                        <select id="folder-study-status">
                            <option value="all">すべて</option>
                            <option value="unmemorized">未暗記</option>
                            <option value="memorized">暗記済み</option>
                        </select>
                    </label>
                    <label class="folder-study-field">
                        <span>タグ</span>
                        <select id="folder-study-tag"><option value="all">すべて</option></select>
                    </label>
                    <label class="folder-study-field">
                        <span>品詞</span>
                        <select id="folder-study-pos"><option value="all">すべて</option></select>
                    </label>
                    <div class="folder-study-range-result">
                        <span>条件に一致 <strong id="folder-study-matched-count">0</strong>語</span>
                        <label>今回の出題数 <input type="number" id="folder-study-limit" min="1" max="5000" inputmode="numeric"> 語</label>
                        <small id="folder-study-selected-preview"></small>
                    </div>
                </div>
            `;
            const settings = hub.querySelector('.study-hub-settings');
            if (settings) settings.insertAdjacentElement('beforebegin', panel);
            else hub.querySelector('.study-swipe-guide')?.insertAdjacentElement('beforebegin', panel);
            bindPanelEvents(panel);
        }
        panel.hidden = !state.active;
        return panel;
    }

    function bindPanelEvents(panel) {
        panel.querySelector('#folder-study-query')?.addEventListener('input', event => {
            state.query = event.target.value;
            updatePreview();
        });
        panel.querySelector('#folder-study-status')?.addEventListener('change', event => {
            state.status = event.target.value;
            updatePreview();
        });
        panel.querySelector('#folder-study-tag')?.addEventListener('change', event => {
            state.tag = event.target.value;
            updatePreview();
        });
        panel.querySelector('#folder-study-pos')?.addEventListener('change', event => {
            state.partOfSpeech = event.target.value;
            updatePreview();
        });
        panel.querySelector('#folder-study-chapter')?.addEventListener('change', event => {
            state.chapterKey = event.target.value;
            updatePreview();
        });
        panel.querySelector('#folder-study-limit')?.addEventListener('input', () => updatePreview());
        panel.querySelector('#folder-study-limit')?.addEventListener('change', () => {
            normalizeLimit();
            updatePreview();
        });
        panel.querySelector('#folder-study-article-options')?.addEventListener('change', event => {
            const input = event.target.closest('input[type="checkbox"][data-article-id]');
            if (!input) return;
            const id = input.dataset.articleId;
            if (input.checked) state.selectedArticleIds.add(id);
            else state.selectedArticleIds.delete(id);
            state.chapterKey = 'all';
            renderArticleSummary();
            renderChapterOptions();
            updatePreview();
        });
    }

    function renderArticleOptions() {
        const container = document.getElementById('folder-study-article-options');
        if (!container) return;
        const options = getArticleOptions();
        container.innerHTML = `
            <label class="folder-study-picker-option folder-study-picker-all">
                <input type="checkbox" id="folder-study-all-articles" ${state.selectedArticleIds.size === options.length ? 'checked' : ''}>
                <span>すべての記事</span><small>${state.rawEntries.length}語</small>
            </label>
            ${options.map(item => `
                <label class="folder-study-picker-option">
                    <input type="checkbox" data-article-id="${escapeHtml(item.id)}" ${state.selectedArticleIds.has(item.id) ? 'checked' : ''}>
                    <span>${escapeHtml(item.title)}</span><small>${item.count}語</small>
                </label>
            `).join('')}
        `;
        const all = document.getElementById('folder-study-all-articles');
        all?.addEventListener('change', event => {
            const checked = !!event.target.checked;
            state.selectedArticleIds = new Set(checked ? options.map(item => item.id) : []);
            container.querySelectorAll('input[data-article-id]').forEach(input => { input.checked = checked; });
            state.chapterKey = 'all';
            renderArticleSummary();
            renderChapterOptions();
            updatePreview();
        });
        renderArticleSummary();
    }

    function renderArticleSummary() {
        const summary = document.getElementById('folder-study-article-summary');
        if (!summary) return;
        const total = getArticleOptions().length;
        const selected = state.selectedArticleIds.size;
        summary.textContent = selected === total ? `すべて (${total})` : `${selected} / ${total}記事`;
        const all = document.getElementById('folder-study-all-articles');
        if (all) {
            all.checked = total > 0 && selected === total;
            all.indeterminate = selected > 0 && selected < total;
        }
    }

    function renderChapterOptions() {
        const select = document.getElementById('folder-study-chapter');
        if (!select) return;
        const options = getChapterOptions();
        select.innerHTML = `<option value="all">すべて</option>${options.map(item => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.label)}</option>`).join('')}`;
        select.value = options.some(item => item.key === state.chapterKey) ? state.chapterKey : 'all';
        state.chapterKey = select.value;
        select.disabled = options.length === 0;
    }

    function renderStaticOptions() {
        const tag = document.getElementById('folder-study-tag');
        const pos = document.getElementById('folder-study-pos');
        if (tag) {
            tag.innerHTML = `<option value="all">すべて</option>${getTagOptions().map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
            tag.value = state.tag;
        }
        if (pos) {
            pos.innerHTML = `<option value="all">すべて</option>${getPartOptions().map(value => `<option value="${escapeHtml(value)}">${escapeHtml(partLabel(value))}</option>`).join('')}`;
            pos.value = state.partOfSpeech;
        }
    }

    function renderControls() {
        ensurePanel();
        const query = document.getElementById('folder-study-query');
        const status = document.getElementById('folder-study-status');
        const limit = document.getElementById('folder-study-limit');
        if (query) query.value = state.query;
        if (status) status.value = state.status;
        if (limit) limit.value = String(state.limit);
        renderArticleOptions();
        renderChapterOptions();
        renderStaticOptions();
        updatePreview();
    }

    function updateContextCard(matched, selected) {
        const count = document.getElementById('study-hub-context-count');
        if (count) count.textContent = String(matched);
        const button = document.getElementById('study-hub-context');
        const small = button?.querySelector('small');
        if (small) small.textContent = matched ? `絞り込み結果 · 今回${selected}語` : '条件に一致する単語なし';
    }

    function updatePreview() {
        if (!state.active) return;
        const matched = filterEntries();
        const limit = normalizeLimit();
        const selected = matched.length ? Math.min(limit, matched.length) : 0;
        const matchedNode = document.getElementById('folder-study-matched-count');
        const preview = document.getElementById('folder-study-selected-preview');
        const limitInput = document.getElementById('folder-study-limit');
        if (matchedNode) matchedNode.textContent = String(matched.length);
        if (preview) preview.textContent = matched.length ? `${matched.length}語から${selected}語を出題 · 未学習60% / 苦手30% / その他10%を目安` : 'この条件に一致する単語はありません';
        if (limitInput) limitInput.disabled = matched.length === 0;
        const contextButton = document.getElementById('study-hub-context');
        if (contextButton) contextButton.disabled = matched.length === 0;
        updateContextCard(matched.length, selected);
    }

    function bindContextCapture() {
        if (contextCaptureBound) return;
        const button = document.getElementById('study-hub-context');
        if (!button) return;
        contextCaptureBound = true;
        button.addEventListener('click', event => {
            if (!state.active || !originalOpen) return;
            const matched = filterEntries();
            if (!matched.length) {
                event.preventDefault();
                event.stopImmediatePropagation();
                const status = document.getElementById('study-hub-status');
                if (status) status.textContent = 'この条件で学習する単語はありません。';
                return;
            }
            const selected = chooseEntries(matched);
            originalOpen(selected, state.label);
            updateContextCard(matched.length, selected.length);
        }, true);
    }

    function injectStyles() {
        if (document.getElementById('folder-study-range-style')) return;
        const style = document.createElement('style');
        style.id = 'folder-study-range-style';
        style.textContent = `
            .folder-study-range-settings[hidden]{display:none!important}
            .folder-study-range-body{display:grid;grid-template-columns:1fr 1fr;gap:9px 12px;margin-top:10px}
            .folder-study-field{display:grid;grid-template-columns:86px minmax(0,1fr);align-items:center;gap:8px;min-width:0;color:#51463d}
            .folder-study-field>span{font-size:.82rem;font-weight:700;color:#75685c}
            .folder-study-field input[type=search],.folder-study-field select,.folder-study-picker summary{width:100%;min-width:0;min-height:38px;padding:7px 9px;border:1px solid #ded3c9;border-radius:8px;background:#fff;color:#51463d;font-size:16px;box-sizing:border-box}
            .folder-study-search-field{grid-column:1/-1}
            .folder-study-article-field{grid-column:1/-1;align-items:start}
            .folder-study-picker{position:relative;min-width:0}
            .folder-study-picker>summary{display:flex;align-items:center;justify-content:space-between;cursor:pointer;list-style:none}
            .folder-study-picker>summary::-webkit-details-marker{display:none}
            .folder-study-picker>summary::after{content:'⌄';margin-left:8px;color:#786b60;font-weight:800}
            .folder-study-picker[open]>summary::after{content:'⌃'}
            .folder-study-picker-options{max-height:220px;overflow:auto;margin-top:5px;padding:5px;border:1px solid #e5dbd1;border-radius:9px;background:#fff;box-shadow:0 8px 24px rgba(70,55,44,.08)}
            .folder-study-picker-option{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;padding:8px 7px;border-radius:7px}
            .folder-study-picker-option:hover{background:#faf6f1}
            .folder-study-picker-option input{width:18px;height:18px}
            .folder-study-picker-option span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.86rem}
            .folder-study-picker-option small{color:#8b7e72;font-size:.72rem;white-space:nowrap}
            .folder-study-picker-all{border-bottom:1px solid #eee5dc;margin-bottom:3px;padding-bottom:9px;font-weight:700}
            .folder-study-range-result{grid-column:1/-1;display:flex;align-items:center;flex-wrap:wrap;gap:8px 14px;margin-top:2px;padding:10px;border-radius:9px;background:#fff;border:1px solid #eadfd5;color:#65594d}
            .folder-study-range-result>span{font-size:.86rem}.folder-study-range-result strong{font-size:1.05rem;color:#433930}
            .folder-study-range-result label{display:flex;align-items:center;gap:6px;font-weight:700;font-size:.86rem}
            .folder-study-range-result input[type=number]{width:76px;min-height:36px;padding:5px 7px;border:1px solid #ded3c9;border-radius:8px;background:#fff;font-size:16px}
            .folder-study-range-result small{width:100%;color:#8a7c70;font-size:.75rem}
            #study-hub-context:disabled{opacity:.48;cursor:not-allowed}
            @media(max-width:700px){
                .folder-study-range-body{grid-template-columns:1fr;gap:8px}
                .folder-study-search-field,.folder-study-article-field,.folder-study-range-result{grid-column:auto}
                .folder-study-field{grid-template-columns:78px minmax(0,1fr)}
                .folder-study-picker-options{max-height:190px}
                .folder-study-range-result{align-items:flex-start}
            }
        `;
        document.head.appendChild(style);
    }

    function hidePanelForNonFolder() {
        state.active = false;
        state.rawEntries = [];
        const panel = document.getElementById('folder-study-range-settings');
        if (panel) panel.hidden = true;
        const context = document.getElementById('study-hub-context');
        const small = context?.querySelector('small');
        if (small) small.textContent = '指定した範囲';
    }

    function install() {
        const study = window.SmartReaderStudy;
        if (!study?.open) {
            window.setTimeout(install, 80);
            return;
        }
        if (study.open.__folderStudyRangeWrapped) return;

        originalOpen = study.open.bind(study);
        const wrappedOpen = function (entries, label) {
            if (!isFolderContext(entries, label)) {
                hidePanelForNonFolder();
                return originalOpen(entries, label);
            }
            resetState(entries, label);
            const result = originalOpen(state.rawEntries, state.label);
            injectStyles();
            ensurePanel();
            bindContextCapture();
            renderControls();
            return result;
        };
        wrappedOpen.__folderStudyRangeWrapped = true;
        study.open = wrappedOpen;

        injectStyles();
        ensurePanel();
        bindContextCapture();
        hidePanelForNonFolder();

        window.SmartReaderFolderStudyRange = {
            getState: () => ({
                active: state.active,
                label: state.label,
                matched: state.active ? filterEntries().length : 0,
                limit: state.limit,
                selectedArticles: Array.from(state.selectedArticleIds)
            }),
            refresh: () => state.active && renderControls()
        };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
    else install();
})();
