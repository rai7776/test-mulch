(function () {
    'use strict';

    const QUICK_COUNTS = [10, 30, 50, 100];
    const DEFAULT_COUNT = 30;
    const STUDY_SETTINGS_KEY = 'smart-reader-study-settings-v1';

    let pending = null;
    let capturedContext = null;
    let originalStudyOpen = null;
    let allowNativeContextStart = false;

    function clamp(value, min, max, fallback) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(max, Math.max(min, Math.trunc(number)));
    }

    function getLibraryItems() {
        try {
            if (Array.isArray(window.libraryItems)) return window.libraryItems;
        } catch (_) {}
        try {
            if (typeof libraryItems !== 'undefined' && Array.isArray(libraryItems)) return libraryItems;
        } catch (_) {}
        return [];
    }

    function getCurrentArticle() {
        try {
            if (typeof currentArticle !== 'undefined' && currentArticle) return currentArticle;
        } catch (_) {}
        return window.currentArticle || null;
    }

    function getWordView(word) {
        try { return window.SmartReaderStudy?.getWordView?.(word) || null; } catch (_) { return null; }
    }

    function articleTitle(article) {
        return String(article?.name || article?.title || article?.sourceName || '無題');
    }

    function chapterInfo(article, word) {
        const chapterId = word?.chapterId === undefined || word?.chapterId === null || word?.chapterId === ''
            ? null
            : String(word.chapterId);
        if (chapterId === null) return { id: null, title: '章未設定' };
        const chapters = Array.isArray(article?.chapters) ? article.chapters : [];
        const chapter = chapters.find(item => String(item?.id) === chapterId);
        return { id: chapterId, title: String(chapter?.title || '章未設定') };
    }

    function makeEntry(article, word, sourceIndex) {
        if (!article || !word) return null;
        const chapter = chapterInfo(article, word);
        const wordId = word?.id;
        const key = wordId !== undefined && wordId !== null && String(wordId) !== ''
            ? `${String(article.id)}::id::${String(wordId)}`
            : `${String(article.id)}::index::${String(sourceIndex)}`;
        return {
            key,
            article,
            articleId: article.id,
            articleTitle: articleTitle(article),
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            word,
            sourceIndex
        };
    }

    function dedupe(entries) {
        const seen = new Set();
        return (Array.isArray(entries) ? entries : []).filter(entry => {
            if (!entry?.word || !entry.key || seen.has(entry.key)) return false;
            const view = getWordView(entry.word);
            if (view?.suspended || view?.manualMastered) return false;
            seen.add(entry.key);
            return true;
        });
    }

    function allStudyEntries() {
        const entries = [];
        getLibraryItems()
            .filter(item => item && item.type === 'article')
            .forEach(article => {
                (Array.isArray(article.words) ? article.words : []).forEach((word, index) => {
                    const entry = makeEntry(article, word, index);
                    if (entry) entries.push(entry);
                });
            });
        return dedupe(entries);
    }

    function duePriority(entry) {
        const view = getWordView(entry.word);
        const study = view?.study || {};
        let score = 0;
        if (view?.overdue) {
            const next = Number(study.nextReviewAt) || 0;
            const today = new Date();
            const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
            const due = new Date(next);
            const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
            const overdueDays = Math.max(1, Math.floor((todayStart - dueStart) / 86400000));
            score += 10000 + Math.min(365, overdueDays) * 20;
        } else if (view?.dueToday) {
            score += 7000;
        }
        if (study.lastReviewResult === 'wrong' || study.lastResult === 'wrong') score += 2500;
        else if (study.lastReviewResult === 'unsure' || study.lastResult === 'unsure') score += 1500;
        score += (6 - (Number(study.level) || 0)) * 100;
        score += Math.min(180, (Number(study.wrongCount) || 0) * 10);
        score += (Number(study.difficultyScore) || 0) * 3;
        score += Math.min(600, (Number(study.lapseCount) || 0) * 150);
        return score;
    }

    function sortDue(entries) {
        return [...entries].sort((left, right) => {
            const score = duePriority(right) - duePriority(left);
            if (score !== 0) return score;
            const a = Number(getWordView(left.word)?.study?.nextReviewAt) || 0;
            const b = Number(getWordView(right.word)?.study?.nextReviewAt) || 0;
            return a - b;
        });
    }

    function readNativeStudySettings() {
        let saved = {};
        try {
            const raw = localStorage.getItem(STUDY_SETTINGS_KEY);
            if (raw) saved = JSON.parse(raw) || {};
        } catch (_) {}
        const reviewInput = document.getElementById('study-review-limit');
        const newInput = document.getElementById('study-new-limit');
        const shuffle = document.getElementById('study-shuffle');
        const example = document.getElementById('study-example-mode');
        return {
            reviewLimit: clamp(reviewInput?.value ?? saved.reviewLimit, 1, 500, 30),
            newLimit: clamp(newInput?.value ?? saved.newLimit, 0, 200, 10),
            shuffle: typeof shuffle?.checked === 'boolean' ? shuffle.checked : (typeof saved.shuffle === 'boolean' ? saved.shuffle : true),
            exampleMode: ['back', 'always', 'none'].includes(example?.value)
                ? example.value
                : (['back', 'always', 'none'].includes(saved.exampleMode) ? saved.exampleMode : 'back')
        };
    }

    function buildTodayEntries() {
        const settings = readNativeStudySettings();
        const all = allStudyEntries();
        const due = sortDue(all.filter(entry => getWordView(entry.word)?.due)).slice(0, settings.reviewLimit);
        const dueKeys = new Set(due.map(entry => entry.key));
        const fresh = all
            .filter(entry => getWordView(entry.word)?.isNew && !dueKeys.has(entry.key))
            .slice(0, settings.newLimit);
        return dedupe([...due, ...fresh]);
    }

    function currentRangeEntries() {
        const article = getCurrentArticle();
        if (!article) return [];
        let entries = (Array.isArray(article.words) ? article.words : [])
            .map((word, index) => makeEntry(article, word, index))
            .filter(Boolean);
        const scope = window.SmartReaderChapterScope?.scope || 'chapter';
        if (scope === 'chapter') {
            let chapterId = null;
            try {
                chapterId = typeof getActiveChapterIdForItem === 'function' ? getActiveChapterIdForItem() : null;
            } catch (_) {}
            if (chapterId !== null && chapterId !== undefined) {
                entries = entries.filter(entry => entry.chapterId !== null && String(entry.chapterId) === String(chapterId));
            }
        }
        return dedupe(entries);
    }

    function filteredGlobalEntries() {
        let globalEntries = [];
        try {
            if (typeof getFilteredGlobalVocabulary === 'function') globalEntries = getFilteredGlobalVocabulary() || [];
        } catch (_) {}
        const articles = getLibraryItems();
        return dedupe(globalEntries.map(globalEntry => {
            const article = articles.find(item => item && item.type === 'article' && String(item.id) === String(globalEntry?.articleId));
            if (!article || !globalEntry?.word) return null;
            return makeEntry(article, globalEntry.word, globalEntry.sourceIndex);
        }).filter(Boolean));
    }

    function contextEntries() {
        const label = String(document.getElementById('study-hub-context-label')?.textContent || '').trim();
        if (capturedContext?.entries?.length && (!label || !capturedContext.label || label === capturedContext.label)) {
            return dedupe(capturedContext.entries);
        }
        if (/絞り込み/.test(label)) return filteredGlobalEntries();
        if (/この章|この記事|範囲/.test(label)) return currentRangeEntries();
        if (capturedContext?.entries?.length) return dedupe(capturedContext.entries);
        return [];
    }

    function entriesForMode(mode) {
        const all = allStudyEntries();
        if (mode === 'today') return buildTodayEntries();
        if (mode === 'overdue') return sortDue(all.filter(entry => getWordView(entry.word)?.overdue));
        if (mode === 'due') return sortDue(all.filter(entry => getWordView(entry.word)?.due));
        if (mode === 'difficult') {
            return all.filter(entry => getWordView(entry.word)?.difficult).sort((a, b) => {
                const left = getWordView(a.word);
                const right = getWordView(b.word);
                return ((Number(right?.weaknessScore) || 0) - (Number(left?.weaknessScore) || 0))
                    || ((Number(right?.study?.lapseCount) || 0) - (Number(left?.study?.lapseCount) || 0))
                    || ((Number(right?.study?.wrongCount) || 0) - (Number(left?.study?.wrongCount) || 0));
            });
        }
        if (mode === 'new') return all.filter(entry => getWordView(entry.word)?.isNew);
        if (mode === 'context') return contextEntries();
        return [];
    }

    function modeLabel(mode) {
        const labels = {
            today: '今日の学習',
            overdue: '期限超過',
            due: '要復習',
            difficult: '苦手',
            new: '新規',
            context: String(document.getElementById('study-hub-context-label')?.textContent || '指定した範囲')
        };
        return labels[mode] || '学習';
    }

    function injectStyles() {
        if (document.getElementById('study-preset-settings-style')) return;
        const style = document.createElement('style');
        style.id = 'study-preset-settings-style';
        style.textContent = `
            .study-hub-settings{display:none!important}
            .study-preset-settings-overlay{position:fixed;inset:0;z-index:12600;display:none;align-items:center;justify-content:center;padding:14px;background:rgba(39,32,27,.24);backdrop-filter:blur(2px)}
            .study-preset-settings-overlay.show{display:flex}
            .study-preset-settings-card{box-sizing:border-box;width:min(380px,calc(100vw - 28px));max-height:calc(100dvh - 28px);overflow:auto;padding:14px;border:1px solid #e2d8ce;border-radius:16px;background:#fffdf9;box-shadow:0 18px 52px rgba(55,43,34,.2);color:#4d4239}
            .study-preset-settings-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.study-preset-settings-head h3{margin:2px 0 0;font-size:1.18rem;color:#3f352d}.study-preset-settings-head .study-today-eyebrow{font-size:.62rem}
            .study-preset-settings-close{width:34px;height:34px;flex:0 0 34px;border:1px solid #ded3c9;border-radius:50%;background:#fff;color:#6b5e52;font-size:1.1rem}
            .study-preset-settings-meta{display:flex;align-items:baseline;gap:6px;margin:7px 0 12px;color:#7d7064;font-size:.78rem}.study-preset-settings-meta strong{color:#4b4037;font-size:.92rem}.study-preset-settings-meta b{color:#4b4037;font-size:.98rem}
            .study-preset-settings-section{padding:10px;border:1px solid #e8ded4;border-radius:12px;background:#fff}.study-preset-settings-title{margin-bottom:8px;font-size:.76rem;font-weight:850;color:#6a5d51}
            .study-preset-count-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.study-preset-count{min-height:38px;padding:5px 6px;border:1px solid #ddd2c7;border-radius:9px;background:#fff;color:#5e5146;font-size:.84rem;font-weight:800}.study-preset-count.is-selected{border-color:var(--primary,#8d5a2b);background:#fff4e7;color:#6e431f}.study-preset-count:disabled{opacity:.35}
            .study-preset-custom{display:none;align-items:center;gap:7px;margin-top:8px}.study-preset-custom.show{display:flex}.study-preset-custom input{box-sizing:border-box;width:88px;min-height:38px;padding:5px 8px;border:1px solid #d9cfc5;border-radius:9px;background:#fff;font-size:16px;color:#453b33}.study-preset-custom span{font-size:.8rem;color:#74685d}
            .study-preset-compact-options{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.study-preset-option{display:flex;align-items:center;justify-content:space-between;gap:7px;min-height:42px;padding:7px 9px;border:1px solid #e5dbd1;border-radius:10px;background:#fff}.study-preset-option>span{font-size:.74rem;font-weight:750;color:#6d6054}.study-preset-option select{max-width:92px;min-height:32px;padding:3px 6px;border:1px solid #ded3c9;border-radius:8px;background:#fff;color:#55493f;font-size:.78rem}.study-preset-option input[type=checkbox]{width:18px;height:18px}
            .study-preset-today-breakdown{margin-top:8px;padding:8px 9px;border:1px solid #e9dfd5;border-radius:10px;background:#faf7f3}.study-preset-today-breakdown[hidden]{display:none}.study-preset-today-breakdown summary{cursor:pointer;font-size:.74rem;font-weight:800;color:#6b5d51}.study-preset-today-fields{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:8px}.study-preset-today-fields label{display:flex;align-items:center;justify-content:space-between;gap:6px;font-size:.72rem;color:#6e6257}.study-preset-today-fields input{box-sizing:border-box;width:60px;min-height:34px;padding:4px 6px;border:1px solid #dcd1c7;border-radius:8px;background:#fff;font-size:16px}
            .study-preset-start{width:100%;min-height:43px;margin-top:10px;border:1px solid var(--primary,#8d5a2b);border-radius:11px;background:var(--primary,#8d5a2b);color:#fff;font-size:.92rem;font-weight:850}.study-preset-start:disabled{opacity:.4}
            @media(max-width:390px){.study-preset-settings-card{width:calc(100vw - 22px);padding:12px}.study-preset-count-grid{gap:5px}.study-preset-count{min-height:36px}.study-preset-compact-options{gap:5px}.study-preset-option{padding:6px 7px}}
        `;
        document.head.appendChild(style);
    }

    function injectOverlay() {
        if (document.getElementById('study-preset-settings-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'study-preset-settings-overlay';
        overlay.className = 'study-preset-settings-overlay';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
            <section class="study-preset-settings-card" role="dialog" aria-modal="true" aria-labelledby="study-preset-settings-title">
                <div class="study-preset-settings-head">
                    <div><span class="study-today-eyebrow">FLASHCARDS</span><h3 id="study-preset-settings-title">出題設定</h3></div>
                    <button type="button" class="study-preset-settings-close" aria-label="出題設定を閉じる">×</button>
                </div>
                <div class="study-preset-settings-meta"><strong data-preset-label>学習</strong><span>対象 <b data-preset-available>0</b>語</span></div>
                <div class="study-preset-settings-section">
                    <div class="study-preset-settings-title">出題数</div>
                    <div class="study-preset-count-grid">
                        ${QUICK_COUNTS.map(count => `<button type="button" class="study-preset-count" data-preset-count="${count}">${count}</button>`).join('')}
                        <button type="button" class="study-preset-count" data-preset-count="all">すべて</button>
                        <button type="button" class="study-preset-count" data-preset-count="custom">自由</button>
                    </div>
                    <div class="study-preset-custom" data-preset-custom-row><input type="number" data-preset-custom-input min="1" inputmode="numeric"><span>語</span></div>
                </div>
                <div class="study-preset-compact-options">
                    <label class="study-preset-option"><span>例文</span><select data-preset-example><option value="back">裏面</option><option value="always">常に</option><option value="none">なし</option></select></label>
                    <label class="study-preset-option"><span>シャッフル</span><input type="checkbox" data-preset-shuffle></label>
                </div>
                <details class="study-preset-today-breakdown" data-preset-today hidden>
                    <summary>今日の内訳</summary>
                    <div class="study-preset-today-fields">
                        <label>復習 <input type="number" data-preset-review min="1" max="500" inputmode="numeric"></label>
                        <label>新規 <input type="number" data-preset-new min="0" max="200" inputmode="numeric"></label>
                    </div>
                </details>
                <button type="button" class="study-preset-start" data-preset-start>開始</button>
            </section>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.study-preset-settings-close')?.addEventListener('click', closeSettings);
        overlay.addEventListener('click', event => { if (event.target === overlay) closeSettings(); });
        overlay.querySelectorAll('[data-preset-count]').forEach(button => {
            button.addEventListener('click', () => chooseCount(button.dataset.presetCount));
        });
        overlay.querySelector('[data-preset-custom-input]')?.addEventListener('input', updateStartButton);
        overlay.querySelector('[data-preset-start]')?.addEventListener('click', startConfiguredSession);
        overlay.querySelector('[data-preset-review]')?.addEventListener('change', updateTodayComposition);
        overlay.querySelector('[data-preset-new]')?.addEventListener('change', updateTodayComposition);
    }

    function getOverlay() {
        return document.getElementById('study-preset-settings-overlay');
    }

    function closeSettings() {
        const overlay = getOverlay();
        if (!overlay) return;
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
        pending = null;
    }

    function currentCount() {
        if (!pending) return 0;
        const available = pending.entries.length;
        if (pending.choice === 'all') return available;
        if (pending.choice === 'custom') {
            const input = getOverlay()?.querySelector('[data-preset-custom-input]');
            return clamp(input?.value, 1, available, Math.min(DEFAULT_COUNT, available));
        }
        return clamp(pending.choice, 1, available, Math.min(DEFAULT_COUNT, available));
    }

    function updateStartButton() {
        if (!pending) return;
        const overlay = getOverlay();
        const button = overlay?.querySelector('[data-preset-start]');
        const count = currentCount();
        if (button) {
            button.disabled = count <= 0;
            button.textContent = count > 0 ? `${count}語で開始` : '開始';
        }
    }

    function chooseCount(choice) {
        if (!pending) return;
        const overlay = getOverlay();
        pending.choice = choice;
        overlay?.querySelectorAll('[data-preset-count]').forEach(button => {
            button.classList.toggle('is-selected', button.dataset.presetCount === choice);
        });
        const customRow = overlay?.querySelector('[data-preset-custom-row]');
        customRow?.classList.toggle('show', choice === 'custom');
        if (choice === 'custom') {
            const input = overlay?.querySelector('[data-preset-custom-input]');
            if (input) {
                input.max = String(pending.entries.length);
                if (!Number(input.value)) input.value = String(Math.min(DEFAULT_COUNT, pending.entries.length));
                window.setTimeout(() => input.focus(), 0);
            }
        }
        updateStartButton();
    }

    function refreshAvailableUi() {
        if (!pending) return;
        const overlay = getOverlay();
        const available = pending.entries.length;
        const availableNode = overlay?.querySelector('[data-preset-available]');
        if (availableNode) availableNode.textContent = String(available);
        overlay?.querySelectorAll('[data-preset-count]').forEach(button => {
            const raw = button.dataset.presetCount;
            if (/^\d+$/.test(raw)) button.disabled = Number(raw) > available;
        });
        const custom = overlay?.querySelector('[data-preset-custom-input]');
        if (custom) {
            custom.max = String(Math.max(1, available));
            if (Number(custom.value) > available) custom.value = String(Math.max(1, available));
        }
        if (/^\d+$/.test(String(pending.choice)) && Number(pending.choice) > available) {
            pending.choice = available > 0 ? String(Math.min(DEFAULT_COUNT, available)) : 'all';
        }
        updateStartButton();
    }

    function openSettings(mode, entries) {
        injectOverlay();
        const overlay = getOverlay();
        const settings = readNativeStudySettings();
        const available = entries.length;
        const initialCount = mode === 'today' ? available : Math.min(DEFAULT_COUNT, available);
        pending = {
            mode,
            label: modeLabel(mode),
            entries: dedupe(entries),
            choice: initialCount >= available ? 'all' : String(initialCount)
        };
        const label = overlay.querySelector('[data-preset-label]');
        if (label) label.textContent = pending.label;
        const example = overlay.querySelector('[data-preset-example]');
        const shuffle = overlay.querySelector('[data-preset-shuffle]');
        if (example) example.value = settings.exampleMode;
        if (shuffle) shuffle.checked = settings.shuffle;
        const today = overlay.querySelector('[data-preset-today]');
        if (today) today.hidden = mode !== 'today';
        const review = overlay.querySelector('[data-preset-review]');
        const fresh = overlay.querySelector('[data-preset-new]');
        if (review) review.value = String(settings.reviewLimit);
        if (fresh) fresh.value = String(settings.newLimit);
        const custom = overlay.querySelector('[data-preset-custom-input]');
        if (custom) custom.value = String(Math.min(DEFAULT_COUNT, Math.max(1, available)));
        refreshAvailableUi();
        chooseCount(pending.choice);
        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
    }

    function applyNativeSettingValue(id, value, checked = false) {
        const element = document.getElementById(id);
        if (!element) return;
        if (checked) element.checked = !!value;
        else element.value = String(value);
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function updateTodayComposition() {
        if (!pending || pending.mode !== 'today') return;
        const overlay = getOverlay();
        const review = clamp(overlay?.querySelector('[data-preset-review]')?.value, 1, 500, 30);
        const fresh = clamp(overlay?.querySelector('[data-preset-new]')?.value, 0, 200, 10);
        applyNativeSettingValue('study-review-limit', review);
        applyNativeSettingValue('study-new-limit', fresh);
        pending.entries = buildTodayEntries();
        refreshAvailableUi();
    }

    function applyCompactOptions() {
        const overlay = getOverlay();
        const example = overlay?.querySelector('[data-preset-example]')?.value || 'back';
        const shuffle = !!overlay?.querySelector('[data-preset-shuffle]')?.checked;
        applyNativeSettingValue('study-example-mode', example);
        applyNativeSettingValue('study-shuffle', shuffle, true);
    }

    function startConfiguredSession() {
        if (!pending || !originalStudyOpen) return;
        const count = currentCount();
        if (count <= 0) return;
        applyCompactOptions();
        const selected = pending.entries.slice(0, count);
        const label = pending.label;
        capturedContext = { entries: selected, label };
        const overlay = getOverlay();
        overlay?.classList.remove('show');
        overlay?.setAttribute('aria-hidden', 'true');

        originalStudyOpen(selected, label);
        const contextButton = document.getElementById('study-hub-context');
        if (!contextButton || contextButton.hidden) {
            pending = null;
            return;
        }
        allowNativeContextStart = true;
        try { contextButton.click(); } finally { allowNativeContextStart = false; }
        pending = null;
    }

    function wrapStudyOpen() {
        const api = window.SmartReaderStudy;
        if (!api?.open || api.open.__presetSettingsWrapped) return;
        originalStudyOpen = api.open.bind(api);
        const wrapped = function (entries, label) {
            capturedContext = {
                entries: dedupe(entries),
                label: String(label || '指定した範囲')
            };
            return originalStudyOpen(entries, label);
        };
        wrapped.__presetSettingsWrapped = true;
        api.open = wrapped;
    }

    function interceptPresetClicks() {
        document.addEventListener('click', event => {
            if (allowNativeContextStart || !(event.target instanceof Element)) return;
            const button = event.target.closest('#study-hub-overlay .study-preset[data-mode]');
            if (!button) return;
            const mode = String(button.dataset.mode || '');
            const entries = entriesForMode(mode);
            if (!entries.length) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            openSettings(mode, entries);
        }, true);
    }

    function bindEscape() {
        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !getOverlay()?.classList.contains('show')) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            closeSettings();
        }, true);
    }

    function init() {
        injectStyles();
        injectOverlay();
        wrapStudyOpen();
        interceptPresetClicks();
        bindEscape();
        const observer = new MutationObserver(() => wrapStudyOpen());
        observer.observe(document.documentElement, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
