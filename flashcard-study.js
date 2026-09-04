(function () {
    'use strict';

    const STUDY_VERSION = 1;
    const LEVEL_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60];
    const DEFAULT_REVIEW_LIMIT = 30;
    const DEFAULT_NEW_LIMIT = 10;
    const scopedGlobalFilter = {
        status: 'all',
        level: 'all',
        seen: 'all',
        wrong: 'all'
    };
    const uiState = {
        reviewLimit: DEFAULT_REVIEW_LIMIT,
        newLimit: DEFAULT_NEW_LIMIT,
        shuffle: true,
        contextEntries: null,
        contextLabel: ''
    };

    let session = null;
    let saveTimer = null;
    let originalGetFilteredGlobalVocabulary = null;
    let originalRenderGlobalVocabulary = null;
    let originalShowLibrary = null;
    let originalRenderList = null;
    let dragState = null;

    function clampInteger(value, min, max, fallback = 0) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(max, Math.max(min, Math.trunc(number)));
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
    }

    function startOfLocalDay(timestamp = Date.now()) {
        const date = new Date(timestamp);
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    }

    function startOfNextLocalDay(timestamp = Date.now()) {
        const date = new Date(timestamp);
        return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime();
    }

    function localDayAfter(days, timestamp = Date.now()) {
        const date = new Date(timestamp);
        return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime();
    }

    function formatShortDate(timestamp) {
        if (!Number.isFinite(Number(timestamp))) return '未予定';
        const value = Number(timestamp);
        const today = startOfLocalDay();
        const tomorrow = startOfNextLocalDay();
        if (value < today) {
            const days = Math.max(1, Math.floor((today - startOfLocalDay(value)) / 86400000));
            return `${days}日超過`;
        }
        if (value < tomorrow) return '今日';
        const dayAfterTomorrow = localDayAfter(2);
        if (value < dayAfterTomorrow) return '明日';
        const date = new Date(value);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    }

    function studyDefaults(word) {
        return {
            version: STUDY_VERSION,
            seenCount: 0,
            knownCount: 0,
            unsureCount: 0,
            wrongCount: 0,
            sessionCount: 0,
            correctStreak: 0,
            level: word?.memorized ? 4 : 0,
            lastResult: null,
            lastStudiedAt: null,
            lastReviewResult: null,
            lastReviewAt: null,
            intervalDays: 0,
            nextReviewAt: null
        };
    }

    function readStudy(word) {
        const base = studyDefaults(word);
        const raw = word && word.study && typeof word.study === 'object' ? word.study : {};
        const merged = { ...base, ...raw };
        merged.seenCount = clampInteger(merged.seenCount, 0, 1000000);
        merged.knownCount = clampInteger(merged.knownCount, 0, 1000000);
        merged.unsureCount = clampInteger(merged.unsureCount, 0, 1000000);
        merged.wrongCount = clampInteger(merged.wrongCount, 0, 1000000);
        merged.sessionCount = clampInteger(merged.sessionCount, 0, 1000000);
        merged.correctStreak = clampInteger(merged.correctStreak, 0, 1000000);
        merged.level = clampInteger(merged.level, 0, 6, word?.memorized ? 4 : 0);
        merged.intervalDays = clampInteger(merged.intervalDays, 0, 3650);
        merged.nextReviewAt = Number.isFinite(Number(merged.nextReviewAt)) ? Number(merged.nextReviewAt) : null;
        merged.lastStudiedAt = Number.isFinite(Number(merged.lastStudiedAt)) ? Number(merged.lastStudiedAt) : null;
        merged.lastReviewAt = Number.isFinite(Number(merged.lastReviewAt)) ? Number(merged.lastReviewAt) : null;
        return merged;
    }

    function ensureStudy(word) {
        const normalized = readStudy(word);
        word.study = { ...(word.study && typeof word.study === 'object' ? word.study : {}), ...normalized, version: STUDY_VERSION };
        return word.study;
    }

    function studyView(word) {
        const study = readStudy(word);
        const hasStudy = !!(word && word.study && typeof word.study === 'object');
        const isNew = !hasStudy && !word?.memorized;
        const today = startOfLocalDay();
        const tomorrow = startOfNextLocalDay();
        const next = study.nextReviewAt;
        const overdue = next !== null && next < today;
        const dueToday = next !== null && next >= today && next < tomorrow;
        const due = next !== null && next < tomorrow;
        const mastered = !!word?.memorized || study.level >= 4;
        const learning = !isNew && !mastered;
        const accuracy = study.seenCount ? study.knownCount / study.seenCount : null;
        const difficult = study.wrongCount >= 2
            || study.lastReviewResult === 'wrong'
            || study.lastResult === 'wrong'
            || (study.seenCount >= 4 && accuracy !== null && accuracy < 0.5);
        return { study, isNew, overdue, dueToday, due, mastered, learning, difficult, accuracy };
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

    function getAllStudyEntries() {
        const entries = [];
        (Array.isArray(window.libraryItems) ? window.libraryItems : (typeof libraryItems !== 'undefined' ? libraryItems : []))
            .filter(item => item && item.type === 'article')
            .forEach(article => {
                (Array.isArray(article.words) ? article.words : []).forEach((word, index) => {
                    if (word) entries.push(makeEntry(article, word, index));
                });
            });
        return entries;
    }

    function dedupeEntries(entries) {
        const seen = new Set();
        return (entries || []).filter(entry => {
            if (!entry?.word || seen.has(entry.key)) return false;
            seen.add(entry.key);
            return true;
        });
    }

    function entriesFromGlobalFiltered() {
        if (typeof getFilteredGlobalVocabulary !== 'function') return [];
        try {
            return dedupeEntries(getFilteredGlobalVocabulary().map(globalEntry => {
                const article = (Array.isArray(libraryItems) ? libraryItems : []).find(item => item && item.type === 'article' && String(item.id) === String(globalEntry.articleId));
                if (!article || !globalEntry.word) return null;
                return makeEntry(article, globalEntry.word, globalEntry.sourceIndex);
            }).filter(Boolean));
        } catch (_) {
            return [];
        }
    }

    function currentRangeEntries() {
        if (typeof currentArticle === 'undefined' || !currentArticle) return [];
        let entries = (Array.isArray(currentArticle.words) ? currentArticle.words : []).map((word, index) => makeEntry(currentArticle, word, index));
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
        return entries;
    }

    function currentRangeLabel() {
        if (typeof currentArticle === 'undefined' || !currentArticle) return 'この範囲';
        const scope = window.SmartReaderChapterScope?.scope || 'chapter';
        if (scope === 'article') return 'この記事全体';
        let chapterId = null;
        try { chapterId = typeof getActiveChapterIdForItem === 'function' ? getActiveChapterIdForItem() : null; } catch (_) {}
        const chapter = (Array.isArray(currentArticle.chapters) ? currentArticle.chapters : []).find(item => String(item?.id) === String(chapterId));
        return chapter ? `この章 · ${chapter.title || '本文'}` : 'この章';
    }

    function summarizeEntries(entries = getAllStudyEntries()) {
        const summary = { total: 0, overdue: 0, dueToday: 0, due: 0, fresh: 0, difficult: 0, learning: 0, mastered: 0 };
        (entries || []).forEach(entry => {
            const view = studyView(entry.word);
            summary.total += 1;
            if (view.overdue) summary.overdue += 1;
            if (view.dueToday) summary.dueToday += 1;
            if (view.due) summary.due += 1;
            if (view.isNew) summary.fresh += 1;
            if (view.difficult) summary.difficult += 1;
            if (view.learning) summary.learning += 1;
            if (view.mastered) summary.mastered += 1;
        });
        return summary;
    }

    function duePriority(entry) {
        const view = studyView(entry.word);
        const study = view.study;
        let score = 0;
        if (view.overdue) {
            const overdueDays = Math.max(1, Math.floor((startOfLocalDay() - startOfLocalDay(study.nextReviewAt)) / 86400000));
            score += 10000 + Math.min(365, overdueDays) * 20;
        } else if (view.dueToday) {
            score += 7000;
        }
        if (study.lastReviewResult === 'wrong' || study.lastResult === 'wrong') score += 2500;
        else if (study.lastReviewResult === 'unsure' || study.lastResult === 'unsure') score += 1500;
        score += (6 - study.level) * 100;
        score += Math.min(100, study.wrongCount * 10);
        return score;
    }

    function sortDue(entries) {
        return [...entries].sort((left, right) => {
            const score = duePriority(right) - duePriority(left);
            if (score !== 0) return score;
            const a = readStudy(left.word).nextReviewAt || 0;
            const b = readStudy(right.word).nextReviewAt || 0;
            return a - b;
        });
    }

    function shuffleEntries(entries) {
        const result = [...entries];
        for (let i = result.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }
        return result;
    }

    function selectTodayEntries() {
        const all = getAllStudyEntries();
        const due = sortDue(all.filter(entry => studyView(entry.word).due)).slice(0, uiState.reviewLimit);
        const dueKeys = new Set(due.map(entry => entry.key));
        const fresh = all.filter(entry => studyView(entry.word).isNew && !dueKeys.has(entry.key)).slice(0, uiState.newLimit);
        return dedupeEntries([...due, ...fresh]);
    }

    function selectPreset(mode) {
        const all = getAllStudyEntries();
        if (mode === 'today') return selectTodayEntries();
        if (mode === 'overdue') return sortDue(all.filter(entry => studyView(entry.word).overdue));
        if (mode === 'due') return sortDue(all.filter(entry => studyView(entry.word).due));
        if (mode === 'difficult') return all.filter(entry => studyView(entry.word).difficult).sort((a, b) => readStudy(b.word).wrongCount - readStudy(a.word).wrongCount);
        if (mode === 'new') return all.filter(entry => studyView(entry.word).isNew).slice(0, Math.max(uiState.newLimit, 1));
        if (mode === 'context') return dedupeEntries(uiState.contextEntries || []);
        return [];
    }

    function cloneStudy(value) {
        if (!value || typeof value !== 'object') return value;
        try { return JSON.parse(JSON.stringify(value)); } catch (_) { return { ...value }; }
    }

    function scheduleSave() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            try {
                const result = typeof saveToDB === 'function' ? saveToDB() : null;
                if (result && typeof result.catch === 'function') result.catch(error => console.error('Study save failed', error));
            } catch (error) {
                console.error('Study save failed', error);
            }
        }, 180);
    }

    function flushSave() {
        clearTimeout(saveTimer);
        saveTimer = null;
        try {
            const result = typeof saveToDB === 'function' ? saveToDB() : null;
            if (result && typeof result.catch === 'function') result.catch(error => console.error('Study save failed', error));
        } catch (error) {
            console.error('Study save failed', error);
        }
    }

    function applyStudyResult(entry, result) {
        const word = entry.word;
        const study = ensureStudy(word);
        const timestamp = Date.now();
        const firstEvaluation = !session.evaluated.has(entry.key);
        const previousLevel = study.level;

        study.seenCount += 1;
        if (result === 'known') study.knownCount += 1;
        if (result === 'unsure') study.unsureCount += 1;
        if (result === 'wrong') study.wrongCount += 1;
        study.lastResult = result;
        study.lastStudiedAt = timestamp;

        let promoted = false;
        let demoted = false;
        if (firstEvaluation) {
            session.evaluated.add(entry.key);
            study.sessionCount += 1;
            study.lastReviewResult = result;
            study.lastReviewAt = timestamp;

            if (result === 'known') {
                study.correctStreak += 1;
                study.level = Math.min(6, study.level + 1);
                study.intervalDays = LEVEL_INTERVAL_DAYS[study.level] || 60;
                study.nextReviewAt = localDayAfter(study.intervalDays, timestamp);
            } else if (result === 'unsure') {
                study.correctStreak = 0;
                study.intervalDays = 1;
                study.nextReviewAt = localDayAfter(1, timestamp);
            } else {
                study.correctStreak = 0;
                study.level = study.level >= 4 ? 3 : Math.max(0, study.level - 1);
                study.intervalDays = 1;
                study.nextReviewAt = localDayAfter(1, timestamp);
            }

            word.memorized = study.level >= 4;
            promoted = study.level > previousLevel;
            demoted = study.level < previousLevel;
        }

        word.study = study;
        return { firstEvaluation, previousLevel, nextLevel: study.level, promoted, demoted };
    }

    function sessionSnapshot(entry) {
        const word = entry.word;
        return {
            entry,
            hadStudy: Object.prototype.hasOwnProperty.call(word, 'study'),
            study: cloneStudy(word.study),
            memorized: !!word.memorized,
            sessionState: {
                queue: [...session.queue],
                nextRound: [...session.nextRound],
                index: session.index,
                round: session.round,
                finished: session.finished,
                stats: { ...session.stats },
                evaluated: [...session.evaluated],
                answeredUnique: [...session.answeredUnique]
            }
        };
    }

    function restoreSnapshot(snapshot) {
        if (!snapshot || !session) return;
        if (snapshot.hadStudy) snapshot.entry.word.study = cloneStudy(snapshot.study);
        else delete snapshot.entry.word.study;
        snapshot.entry.word.memorized = snapshot.memorized;
        session.queue = [...snapshot.sessionState.queue];
        session.nextRound = [...snapshot.sessionState.nextRound];
        session.index = snapshot.sessionState.index;
        session.round = snapshot.sessionState.round;
        session.finished = snapshot.sessionState.finished;
        session.stats = { ...snapshot.sessionState.stats };
        session.evaluated = new Set(snapshot.sessionState.evaluated);
        session.answeredUnique = new Set(snapshot.sessionState.answeredUnique);
        scheduleSave();
    }

    function answerCurrent(result) {
        if (!session || session.finished || !session.queue[session.index]) return;
        const entry = session.queue[session.index];
        session.history.push(sessionSnapshot(entry));
        if (session.history.length > 30) session.history.shift();

        const effect = applyStudyResult(entry, result);
        session.answeredUnique.add(entry.key);
        session.stats.responses += 1;
        session.stats[result] += 1;
        if (effect.promoted) session.stats.promoted += 1;
        if (effect.demoted) session.stats.demoted += 1;

        if (result !== 'known' && !session.nextRound.some(item => item.key === entry.key)) {
            session.nextRound.push(entry);
        }

        session.index += 1;
        if (session.index >= session.queue.length) {
            if (session.nextRound.length) {
                session.round += 1;
                session.queue = uiState.shuffle ? shuffleEntries(session.nextRound) : [...session.nextRound];
                session.nextRound = [];
                session.index = 0;
            } else {
                session.finished = true;
            }
        }

        scheduleSave();
        refreshStudySurfaces();
        renderSession();
    }

    function undoLast() {
        if (!session || !session.history.length) return;
        const snapshot = session.history.pop();
        restoreSnapshot(snapshot);
        renderSession();
        refreshStudySurfaces();
    }

    function closeSession(force = false) {
        if (!session) return;
        if (!force && !session.finished && session.stats.responses > 0) {
            if (!window.confirm('学習を途中で終了しますか？ここまでの結果は保存されます。')) return;
        }
        flushSave();
        session = null;
        const overlay = document.getElementById('study-session-overlay');
        if (overlay) overlay.classList.remove('show');
        document.body.classList.remove('study-session-open');
        refreshStudySurfaces();
    }

    function currentSessionEntry() {
        return session && !session.finished ? session.queue[session.index] || null : null;
    }

    function renderCardContent(entry) {
        const word = entry.word || {};
        const study = readStudy(word);
        const surface = String(word.surfaceText || '').trim();
        const wordText = String(word.word || '').trim() || surface || '—';
        const meaning = String(word.meaning || '').trim() || '意味未登録';
        const memo = String(word.memo || '').trim();
        const context = String(word.context || '').trim();
        const tags = Array.isArray(word.tags) ? word.tags.filter(Boolean) : [];
        const part = String(word.partOfSpeech || '').trim();
        const card = document.getElementById('study-flashcard');
        if (!card) return;
        card.classList.remove('flipped', 'is-committing');
        card.style.transform = '';
        card.style.removeProperty('--study-feedback-alpha');
        card.dataset.direction = '';

        const front = card.querySelector('.study-card-front');
        const back = card.querySelector('.study-card-back');
        if (front) {
            front.innerHTML = `
                <div class="study-card-word">${escapeHtml(wordText)}</div>
                ${surface && surface.toLocaleLowerCase() !== wordText.toLocaleLowerCase() ? `<div class="study-card-surface">${escapeHtml(surface)}</div>` : ''}
                ${(part || tags.length) ? `<div class="study-card-meta">${part ? `<span>${escapeHtml(part)}</span>` : ''}${tags.slice(0, 3).map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
            `;
        }
        if (back) {
            back.innerHTML = `
                <div class="study-card-back-word">${escapeHtml(wordText)}</div>
                <div class="study-card-meaning">${escapeHtml(meaning)}</div>
                ${memo ? `<div class="study-card-memo">${escapeHtml(memo)}</div>` : ''}
                ${context ? `<div class="study-card-context">${escapeHtml(context)}</div>` : ''}
                <div class="study-card-source">${escapeHtml(entry.articleTitle)}${entry.chapterTitle ? ` / ${escapeHtml(entry.chapterTitle)}` : ''}</div>
                <div class="study-card-studyline">Lv.${study.level} · 次回 ${escapeHtml(formatShortDate(study.nextReviewAt))}</div>
            `;
        }
    }

    function renderSessionHeader() {
        const entry = currentSessionEntry();
        const progress = document.getElementById('study-session-progress');
        const round = document.getElementById('study-session-round');
        const undo = document.getElementById('study-session-undo');
        const source = document.getElementById('study-session-source');
        if (progress) progress.textContent = session?.finished ? `${session.initialCount}語` : `${Math.min(session.index + 1, session.queue.length)} / ${session.queue.length}`;
        if (round) round.textContent = `${session?.round || 1}周目`;
        if (undo) undo.disabled = !session?.history.length;
        if (source) source.textContent = entry ? `${entry.articleTitle}${entry.chapterTitle ? ` / ${entry.chapterTitle}` : ''}` : session?.label || '';
    }

    function renderSessionSummary() {
        const stage = document.getElementById('study-session-stage');
        if (!stage || !session) return;
        const dueTomorrow = session.initialEntries.filter(entry => {
            const next = readStudy(entry.word).nextReviewAt;
            const tomorrow = startOfNextLocalDay();
            return next !== null && next >= tomorrow && next < localDayAfter(2);
        }).length;
        stage.innerHTML = `
            <div class="study-session-summary">
                <div class="study-summary-mark">✓</div>
                <h2>今回の学習</h2>
                <div class="study-summary-main"><strong>${session.initialCount}</strong><span>語 · ${session.round}周</span></div>
                <div class="study-summary-judges" aria-label="判定内訳">
                    <div class="study-judge-stat wrong"><span>×</span><strong>${session.stats.wrong}</strong></div>
                    <div class="study-judge-stat unsure"><span>?</span><strong>${session.stats.unsure}</strong></div>
                    <div class="study-judge-stat known"><span>✓</span><strong>${session.stats.known}</strong></div>
                </div>
                <div class="study-summary-grid">
                    <div><span>レベルアップ</span><strong>${session.stats.promoted}</strong></div>
                    <div><span>レベルダウン</span><strong>${session.stats.demoted}</strong></div>
                    <div><span>明日また復習</span><strong>${dueTomorrow}</strong></div>
                    <div><span>回答回数</span><strong>${session.stats.responses}</strong></div>
                </div>
                <div class="study-summary-actions">
                    <button type="button" id="study-summary-undo" class="study-icon-action" ${session.history.length ? '' : 'disabled'} aria-label="直前の判定を戻す">↶</button>
                    <button type="button" id="study-summary-close" class="study-primary-action">終了</button>
                </div>
            </div>
        `;
        stage.querySelector('#study-summary-undo')?.addEventListener('click', undoLast);
        stage.querySelector('#study-summary-close')?.addEventListener('click', () => closeSession(true));
    }

    function renderSession() {
        if (!session) return;
        const overlay = document.getElementById('study-session-overlay');
        const stage = document.getElementById('study-session-stage');
        if (!overlay || !stage) return;
        overlay.classList.add('show');
        document.body.classList.add('study-session-open');
        renderSessionHeader();

        if (session.finished) {
            renderSessionSummary();
            return;
        }

        stage.innerHTML = `
            <div class="study-gesture-field">
                <div class="study-direction-hint hint-wrong" aria-hidden="true">×</div>
                <div class="study-direction-hint hint-unsure" aria-hidden="true">?</div>
                <div class="study-direction-hint hint-known" aria-hidden="true">✓</div>
                <div id="study-flashcard" class="study-flashcard" tabindex="0" role="button" aria-label="カード。タップで表裏を切り替え">
                    <div class="study-card-judge" aria-hidden="true"></div>
                    <div class="study-flashcard-inner">
                        <section class="study-card-face study-card-front"></section>
                        <section class="study-card-face study-card-back"></section>
                    </div>
                </div>
            </div>
            <div class="study-touch-actions" aria-label="スワイプの代替操作">
                <button type="button" class="study-judge-button wrong" data-result="wrong" aria-label="思い出せなかった">×</button>
                <button type="button" class="study-judge-button unsure" data-result="unsure" aria-label="あやふや">?</button>
                <button type="button" class="study-judge-button known" data-result="known" aria-label="思い出せた">✓</button>
            </div>
        `;
        const entry = currentSessionEntry();
        renderCardContent(entry);
        bindCardInteractions();
    }

    function resultDirection(dx, dy) {
        const ax = Math.abs(dx);
        const ay = Math.abs(dy);
        if (ax < 12 && ay < 12) return null;
        if (ax >= ay * 0.9) return dx >= 0 ? 'known' : 'wrong';
        if (dy < 0) return 'unsure';
        return null;
    }

    function resultSymbol(result) {
        return result === 'known' ? '✓' : result === 'wrong' ? '×' : result === 'unsure' ? '?' : '';
    }

    function dragDistanceFor(result, dx, dy) {
        if (result === 'known' || result === 'wrong') return Math.abs(dx);
        if (result === 'unsure') return Math.abs(Math.min(0, dy));
        return 0;
    }

    function resetCardPosition(card) {
        if (!card) return;
        card.classList.remove('is-dragging', 'is-committing');
        card.dataset.direction = '';
        card.style.transform = '';
        card.style.setProperty('--study-feedback-alpha', '0');
        const judge = card.querySelector('.study-card-judge');
        if (judge) judge.textContent = '';
    }

    function commitResult(result) {
        const card = document.getElementById('study-flashcard');
        if (!card || !session || session.finished) return;
        card.classList.add('is-committing');
        card.dataset.direction = result;
        const judge = card.querySelector('.study-card-judge');
        if (judge) judge.textContent = resultSymbol(result);
        card.style.setProperty('--study-feedback-alpha', '1');
        if (result === 'known') card.style.transform = 'translate3d(120vw, 0, 0) rotate(15deg)';
        if (result === 'wrong') card.style.transform = 'translate3d(-120vw, 0, 0) rotate(-15deg)';
        if (result === 'unsure') card.style.transform = 'translate3d(0, -110vh, 0)';
        window.setTimeout(() => answerCurrent(result), 190);
    }

    function bindCardInteractions() {
        const card = document.getElementById('study-flashcard');
        if (!card) return;
        const threshold = Math.max(68, Math.min(120, card.getBoundingClientRect().width * 0.22));

        card.addEventListener('pointerdown', event => {
            if (event.button !== undefined && event.button !== 0) return;
            dragState = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                dx: 0,
                dy: 0,
                moved: false,
                threshold
            };
            card.setPointerCapture?.(event.pointerId);
            card.classList.add('is-dragging');
        });

        card.addEventListener('pointermove', event => {
            if (!dragState || dragState.pointerId !== event.pointerId) return;
            dragState.dx = event.clientX - dragState.startX;
            dragState.dy = Math.min(0, event.clientY - dragState.startY);
            if (Math.abs(dragState.dx) > 7 || Math.abs(dragState.dy) > 7) dragState.moved = true;
            const result = resultDirection(dragState.dx, dragState.dy);
            const distance = dragDistanceFor(result, dragState.dx, dragState.dy);
            const alpha = Math.min(1, distance / dragState.threshold);
            card.dataset.direction = result || '';
            card.style.setProperty('--study-feedback-alpha', String(alpha));
            card.style.transform = `translate3d(${dragState.dx}px, ${dragState.dy}px, 0) rotate(${dragState.dx * 0.035}deg)`;
            const judge = card.querySelector('.study-card-judge');
            if (judge) judge.textContent = resultSymbol(result);
        });

        card.addEventListener('pointerup', event => {
            if (!dragState || dragState.pointerId !== event.pointerId) return;
            const state = dragState;
            dragState = null;
            const result = resultDirection(state.dx, state.dy);
            const distance = dragDistanceFor(result, state.dx, state.dy);
            if (result && distance >= state.threshold) {
                commitResult(result);
                return;
            }
            resetCardPosition(card);
            if (!state.moved) card.classList.toggle('flipped');
        });

        card.addEventListener('pointercancel', () => {
            dragState = null;
            resetCardPosition(card);
        });

        card.addEventListener('keydown', event => {
            if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                card.classList.toggle('flipped');
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                commitResult('wrong');
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                commitResult('known');
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                commitResult('unsure');
            }
        });

        document.querySelectorAll('.study-judge-button').forEach(button => {
            button.addEventListener('click', () => commitResult(button.dataset.result));
        });
    }

    function startSession(entries, label) {
        const selected = dedupeEntries(entries);
        const hubStatus = document.getElementById('study-hub-status');
        if (!selected.length) {
            if (hubStatus) hubStatus.textContent = 'この条件で学習する単語はありません。';
            return;
        }
        const queue = uiState.shuffle ? shuffleEntries(selected) : [...selected];
        session = {
            label: label || '学習',
            initialEntries: [...selected],
            initialCount: selected.length,
            queue,
            nextRound: [],
            index: 0,
            round: 1,
            finished: false,
            evaluated: new Set(),
            answeredUnique: new Set(),
            history: [],
            stats: { responses: 0, known: 0, unsure: 0, wrong: 0, promoted: 0, demoted: 0 }
        };
        closeStudyHub();
        renderSession();
    }

    function updateHubCounts() {
        const all = getAllStudyEntries();
        const summary = summarizeEntries(all);
        const todaySelected = selectTodayEntries();
        const values = {
            'study-hub-overdue-count': summary.overdue,
            'study-hub-due-count': summary.due,
            'study-hub-new-count': summary.fresh,
            'study-hub-difficult-count': summary.difficult,
            'study-hub-today-count': todaySelected.length,
            'study-hub-context-count': uiState.contextEntries ? dedupeEntries(uiState.contextEntries).length : 0
        };
        Object.entries(values).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = String(value);
        });
        const contextButton = document.getElementById('study-hub-context');
        const contextLabel = document.getElementById('study-hub-context-label');
        if (contextButton) contextButton.hidden = !uiState.contextEntries;
        if (contextLabel) contextLabel.textContent = uiState.contextLabel || '現在の範囲';
        const reviewLimit = document.getElementById('study-review-limit');
        const newLimit = document.getElementById('study-new-limit');
        const shuffle = document.getElementById('study-shuffle');
        if (reviewLimit) reviewLimit.value = String(uiState.reviewLimit);
        if (newLimit) newLimit.value = String(uiState.newLimit);
        if (shuffle) shuffle.checked = uiState.shuffle;
    }

    function openStudyHub(contextEntries = null, contextLabel = '') {
        uiState.contextEntries = contextEntries ? dedupeEntries(contextEntries) : null;
        uiState.contextLabel = contextLabel || '';
        const overlay = document.getElementById('study-hub-overlay');
        if (!overlay) return;
        updateHubCounts();
        const status = document.getElementById('study-hub-status');
        if (status) status.textContent = '';
        overlay.classList.add('show');
    }

    function closeStudyHub() {
        document.getElementById('study-hub-overlay')?.classList.remove('show');
    }

    function applyHubSettings() {
        const review = document.getElementById('study-review-limit');
        const fresh = document.getElementById('study-new-limit');
        const shuffle = document.getElementById('study-shuffle');
        uiState.reviewLimit = clampInteger(review?.value, 1, 500, DEFAULT_REVIEW_LIMIT);
        uiState.newLimit = clampInteger(fresh?.value, 0, 200, DEFAULT_NEW_LIMIT);
        uiState.shuffle = !!shuffle?.checked;
        if (review) review.value = String(uiState.reviewLimit);
        if (fresh) fresh.value = String(uiState.newLimit);
        updateHubCounts();
    }

    function startPreset(mode) {
        applyHubSettings();
        const labels = {
            today: '今日の学習', overdue: '期限超過', due: '要復習', difficult: '苦手', new: '新規', context: uiState.contextLabel || '現在の範囲'
        };
        startSession(selectPreset(mode), labels[mode] || '学習');
    }

    function matchesStudyFilter(word) {
        const view = studyView(word);
        const study = view.study;
        const status = scopedGlobalFilter.status;
        if (status === 'due' && !view.due) return false;
        if (status === 'overdue' && !view.overdue) return false;
        if (status === 'new' && !view.isNew) return false;
        if (status === 'learning' && !view.learning) return false;
        if (status === 'mastered' && !view.mastered) return false;
        if (status === 'difficult' && !view.difficult) return false;
        if (status === 'unsure' && !(study.lastResult === 'unsure' || study.lastReviewResult === 'unsure')) return false;

        if (scopedGlobalFilter.level !== 'all' && study.level !== Number(scopedGlobalFilter.level)) return false;
        if (scopedGlobalFilter.seen === '0' && study.seenCount !== 0) return false;
        if (scopedGlobalFilter.seen === '1-2' && !(study.seenCount >= 1 && study.seenCount <= 2)) return false;
        if (scopedGlobalFilter.seen === '3-5' && !(study.seenCount >= 3 && study.seenCount <= 5)) return false;
        if (scopedGlobalFilter.seen === '6+' && study.seenCount < 6) return false;
        if (scopedGlobalFilter.wrong === '0' && study.wrongCount !== 0) return false;
        if (scopedGlobalFilter.wrong === '1' && study.wrongCount !== 1) return false;
        if (scopedGlobalFilter.wrong === '2+' && study.wrongCount < 2) return false;
        if (scopedGlobalFilter.wrong === '3+' && study.wrongCount < 3) return false;
        return true;
    }

    function installGlobalVocabularyFilter() {
        if (typeof getFilteredGlobalVocabulary !== 'function' || originalGetFilteredGlobalVocabulary) return;
        originalGetFilteredGlobalVocabulary = getFilteredGlobalVocabulary;
        const wrapped = function () {
            const entries = originalGetFilteredGlobalVocabulary.apply(this, arguments);
            return (Array.isArray(entries) ? entries : []).filter(entry => matchesStudyFilter(entry.word));
        };
        try { getFilteredGlobalVocabulary = wrapped; } catch (_) {}
        window.getFilteredGlobalVocabulary = wrapped;
    }

    function injectGlobalStudyControls() {
        if (document.getElementById('global-study-controls')) return;
        const controls = document.querySelector('#vocabulary-section .vocabulary-controls');
        if (!controls) return;
        const group = document.createElement('div');
        group.id = 'global-study-controls';
        group.className = 'global-study-controls';
        group.innerHTML = `
            <select id="global-study-status" aria-label="復習状態">
                <option value="all">復習状態: すべて</option>
                <option value="due">要復習</option>
                <option value="overdue">期限超過</option>
                <option value="new">未学習</option>
                <option value="learning">学習中</option>
                <option value="mastered">暗記済み</option>
                <option value="difficult">苦手</option>
                <option value="unsure">前回 ?</option>
            </select>
            <select id="global-study-level" aria-label="暗記レベル">
                <option value="all">Lv: すべて</option>
                ${[0,1,2,3,4,5,6].map(level => `<option value="${level}">Lv.${level}</option>`).join('')}
            </select>
            <select id="global-study-seen" aria-label="学習回数">
                <option value="all">学習回数: すべて</option>
                <option value="0">0回</option>
                <option value="1-2">1–2回</option>
                <option value="3-5">3–5回</option>
                <option value="6+">6回以上</option>
            </select>
            <select id="global-study-wrong" aria-label="赤判定回数">
                <option value="all">×回数: すべて</option>
                <option value="0">0回</option>
                <option value="1">1回</option>
                <option value="2+">2回以上</option>
                <option value="3+">3回以上</option>
            </select>
            <button type="button" id="global-study-filtered" class="study-inline-primary">🎴 絞り込み結果を学習 <span id="global-study-filtered-count">0</span></button>
            <button type="button" id="global-study-today" class="study-inline-secondary">今日 <span id="global-study-due-badge">0</span></button>
        `;
        controls.appendChild(group);

        const bindings = [
            ['global-study-status', 'status'], ['global-study-level', 'level'], ['global-study-seen', 'seen'], ['global-study-wrong', 'wrong']
        ];
        bindings.forEach(([id, key]) => {
            document.getElementById(id)?.addEventListener('change', event => {
                scopedGlobalFilter[key] = event.target.value;
                try { if (typeof renderGlobalVocabulary === 'function') renderGlobalVocabulary(); } catch (_) {}
            });
        });
        document.getElementById('global-study-filtered')?.addEventListener('click', () => {
            const entries = entriesFromGlobalFiltered();
            openStudyHub(entries, '現在の絞り込み結果');
        });
        document.getElementById('global-study-today')?.addEventListener('click', () => openStudyHub());
    }

    function refreshGlobalStudyUi() {
        injectGlobalStudyControls();
        const filtered = entriesFromGlobalFiltered();
        const filteredCount = document.getElementById('global-study-filtered-count');
        if (filteredCount) filteredCount.textContent = String(filtered.length);
        const dueBadge = document.getElementById('global-study-due-badge');
        if (dueBadge) dueBadge.textContent = String(summarizeEntries().due);
    }

    function wrapGlobalRender() {
        if (typeof renderGlobalVocabulary !== 'function' || originalRenderGlobalVocabulary) return;
        originalRenderGlobalVocabulary = renderGlobalVocabulary;
        const wrapped = function () {
            const result = originalRenderGlobalVocabulary.apply(this, arguments);
            window.setTimeout(refreshGlobalStudyUi, 0);
            return result;
        };
        try { renderGlobalVocabulary = wrapped; } catch (_) {}
        window.renderGlobalVocabulary = wrapped;
    }

    function injectLibraryStudyCard() {
        if (document.getElementById('study-today-card')) return;
        const library = document.getElementById('library-section');
        const list = document.getElementById('library-list');
        if (!library || !list) return;
        const card = document.createElement('section');
        card.id = 'study-today-card';
        card.className = 'study-today-card';
        card.innerHTML = `
            <div class="study-today-heading">
                <div>
                    <span class="study-today-eyebrow">FLASHCARDS</span>
                    <h2>今日の学習</h2>
                </div>
                <button type="button" id="study-open-hub" class="study-primary-action">学習を始める</button>
            </div>
            <div class="study-today-stats">
                <div class="overdue"><span>期限超過</span><strong id="study-library-overdue">0</strong></div>
                <div class="due"><span>今日</span><strong id="study-library-due">0</strong></div>
                <div class="new"><span>新規</span><strong id="study-library-new">0</strong></div>
                <div class="total"><span>今日のセット</span><strong id="study-library-set">0</strong></div>
            </div>
            <div id="study-library-message" class="study-library-message"></div>
        `;
        library.insertBefore(card, list);
        document.getElementById('study-open-hub')?.addEventListener('click', () => openStudyHub());
    }

    function refreshLibraryStudyCard() {
        injectLibraryStudyCard();
        const summary = summarizeEntries();
        const selected = selectTodayEntries();
        const mapping = {
            'study-library-overdue': summary.overdue,
            'study-library-due': summary.dueToday,
            'study-library-new': summary.fresh,
            'study-library-set': selected.length
        };
        Object.entries(mapping).forEach(([id, value]) => {
            const element = document.getElementById(id);
            if (element) element.textContent = String(value);
        });
        const button = document.getElementById('study-open-hub');
        if (button) button.disabled = summary.total === 0;
        const message = document.getElementById('study-library-message');
        if (message) {
            if (!summary.total) message.textContent = '単語を登録すると、復習予定をここで管理できます。';
            else if (!summary.due && !summary.fresh) message.textContent = '今日が期限の復習はありません。';
            else if (summary.overdue) message.textContent = `期限を過ぎた ${summary.overdue}語から優先して出題します。`;
            else message.textContent = '復習期限と新規単語から今日のセットを自動で作ります。';
        }
    }

    function injectSidebarStudyControls() {
        if (document.getElementById('sidebar-study-controls')) return;
        const controls = document.getElementById('vocabulary-controls');
        if (!controls) return;
        const row = document.createElement('div');
        row.id = 'sidebar-study-controls';
        row.className = 'sidebar-study-controls';
        row.innerHTML = `
            <button type="button" id="sidebar-study-range" class="study-inline-primary">🎴 <span id="sidebar-study-range-label">この章を学習</span> <span id="sidebar-study-range-count">0</span></button>
            <button type="button" id="sidebar-study-due" class="study-inline-secondary">◷ <span id="sidebar-study-due-count">0</span></button>
        `;
        controls.appendChild(row);
        document.getElementById('sidebar-study-range')?.addEventListener('click', () => {
            const entries = currentRangeEntries();
            openStudyHub(entries, currentRangeLabel());
        });
        document.getElementById('sidebar-study-due')?.addEventListener('click', () => {
            const due = currentRangeEntries().filter(entry => studyView(entry.word).due);
            openStudyHub(due, `${currentRangeLabel()} · 要復習`);
        });
    }

    function refreshSidebarStudyControls() {
        injectSidebarStudyControls();
        const controls = document.getElementById('sidebar-study-controls');
        if (!controls) return;
        const active = typeof currentArticle !== 'undefined' && !!currentArticle;
        controls.hidden = !active;
        if (!active) return;
        const entries = currentRangeEntries();
        const due = entries.filter(entry => studyView(entry.word).due);
        const label = document.getElementById('sidebar-study-range-label');
        const rangeCount = document.getElementById('sidebar-study-range-count');
        const dueCount = document.getElementById('sidebar-study-due-count');
        if (label) label.textContent = window.SmartReaderChapterScope?.scope === 'article' ? 'この記事を学習' : 'この章を学習';
        if (rangeCount) rangeCount.textContent = String(entries.length);
        if (dueCount) dueCount.textContent = String(due.length);
        document.getElementById('sidebar-study-range')?.toggleAttribute('disabled', entries.length === 0);
        document.getElementById('sidebar-study-due')?.toggleAttribute('disabled', due.length === 0);
    }

    function wrapExistingViews() {
        if (typeof showLibrary === 'function' && !originalShowLibrary) {
            originalShowLibrary = showLibrary;
            const wrapped = function () {
                const result = originalShowLibrary.apply(this, arguments);
                window.setTimeout(refreshLibraryStudyCard, 0);
                return result;
            };
            try { showLibrary = wrapped; } catch (_) {}
            window.showLibrary = wrapped;
        }
        if (typeof renderList === 'function' && !originalRenderList) {
            originalRenderList = renderList;
            const wrapped = function () {
                const result = originalRenderList.apply(this, arguments);
                window.setTimeout(refreshSidebarStudyControls, 0);
                return result;
            };
            try { renderList = wrapped; } catch (_) {}
            window.renderList = wrapped;
        }
    }

    function refreshStudySurfaces() {
        refreshLibraryStudyCard();
        refreshGlobalStudyUi();
        refreshSidebarStudyControls();
        if (document.getElementById('study-hub-overlay')?.classList.contains('show')) updateHubCounts();
    }

    function injectStudyOverlays() {
        if (!document.getElementById('study-hub-overlay')) {
            const hub = document.createElement('div');
            hub.id = 'study-hub-overlay';
            hub.className = 'study-overlay';
            hub.innerHTML = `
                <div class="study-hub" role="dialog" aria-modal="true" aria-labelledby="study-hub-title">
                    <div class="study-hub-header">
                        <div><span class="study-today-eyebrow">FLASHCARDS</span><h2 id="study-hub-title">学習する単語</h2></div>
                        <button type="button" id="study-hub-close" class="study-icon-action" aria-label="閉じる">×</button>
                    </div>
                    <div class="study-hub-preset-grid">
                        <button type="button" class="study-preset primary" data-mode="today"><span>今日の学習</span><strong id="study-hub-today-count">0</strong><small>期限超過 → 今日 → 新規</small></button>
                        <button type="button" class="study-preset" data-mode="overdue"><span>期限超過</span><strong id="study-hub-overdue-count">0</strong><small>遅れているカード</small></button>
                        <button type="button" class="study-preset" data-mode="due"><span>要復習</span><strong id="study-hub-due-count">0</strong><small>今日までが期限</small></button>
                        <button type="button" class="study-preset" data-mode="difficult"><span>苦手</span><strong id="study-hub-difficult-count">0</strong><small>×が多いカード</small></button>
                        <button type="button" class="study-preset" data-mode="new"><span>新規</span><strong id="study-hub-new-count">0</strong><small>まだ学習していない</small></button>
                        <button type="button" id="study-hub-context" class="study-preset context" data-mode="context" hidden><span id="study-hub-context-label">現在の範囲</span><strong id="study-hub-context-count">0</strong><small>指定した範囲</small></button>
                    </div>
                    <details class="study-hub-settings">
                        <summary>今日のセット設定</summary>
                        <div class="study-setting-row"><label>復習上限 <input type="number" id="study-review-limit" min="1" max="500" inputmode="numeric"></label><span>語</span></div>
                        <div class="study-setting-row"><label>新規上限 <input type="number" id="study-new-limit" min="0" max="200" inputmode="numeric"></label><span>語</span></div>
                        <label class="study-setting-check"><input type="checkbox" id="study-shuffle"> カード順をシャッフル</label>
                    </details>
                    <div class="study-swipe-guide" aria-label="判定ジェスチャー">
                        <span class="wrong"><b>←</b><i>×</i></span>
                        <span class="unsure"><b>↑</b><i>?</i></span>
                        <span class="known"><b>→</b><i>✓</i></span>
                    </div>
                    <p id="study-hub-status" class="study-hub-status" role="status" aria-live="polite"></p>
                </div>
            `;
            document.body.appendChild(hub);
            hub.querySelector('#study-hub-close')?.addEventListener('click', closeStudyHub);
            hub.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => startPreset(button.dataset.mode)));
            ['study-review-limit', 'study-new-limit', 'study-shuffle'].forEach(id => {
                document.getElementById(id)?.addEventListener('change', applyHubSettings);
            });
            hub.addEventListener('click', event => { if (event.target === hub) closeStudyHub(); });
        }

        if (!document.getElementById('study-session-overlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'study-session-overlay';
            overlay.className = 'study-session-overlay';
            overlay.innerHTML = `
                <div class="study-session-shell" role="dialog" aria-modal="true" aria-label="フラッシュカード学習">
                    <header class="study-session-header">
                        <button type="button" id="study-session-close" class="study-icon-action" aria-label="学習を終了">×</button>
                        <div class="study-session-progress-wrap"><strong id="study-session-progress">1 / 1</strong><span id="study-session-round">1周目</span></div>
                        <button type="button" id="study-session-undo" class="study-icon-action" aria-label="直前の判定を戻す">↶</button>
                    </header>
                    <div id="study-session-stage" class="study-session-stage"></div>
                    <div id="study-session-source" class="study-session-source"></div>
                </div>
            `;
            document.body.appendChild(overlay);
            overlay.querySelector('#study-session-close')?.addEventListener('click', () => closeSession(false));
            overlay.querySelector('#study-session-undo')?.addEventListener('click', undoLast);
        }
    }

    function injectStyles() {
        if (document.getElementById('flashcard-study-style')) return;
        const style = document.createElement('style');
        style.id = 'flashcard-study-style';
        style.textContent = `
            :root{--study-red:#c84a4a;--study-green:#3f9865;--study-gray:#767881;--study-paper:#fffdf9;--study-ink:#3f352d;--study-border:#e4d9ce}
            .study-today-card{margin:14px 0 18px;padding:16px;border:1px solid var(--study-border);border-radius:14px;background:linear-gradient(135deg,#fffdf9,#f8f2eb)}
            .study-today-heading{display:flex;align-items:center;justify-content:space-between;gap:14px}.study-today-heading h2,.study-hub-header h2{margin:2px 0 0;color:var(--study-ink)}
            .study-today-eyebrow{font-size:.68rem;letter-spacing:.12em;font-weight:800;color:#8b7765}.study-today-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:14px}
            .study-today-stats>div{padding:10px;border-radius:10px;background:#fff;border:1px solid #ece3da;min-width:0}.study-today-stats span{display:block;color:#7e7267;font-size:.75rem}.study-today-stats strong{display:block;margin-top:2px;font-size:1.35rem;color:#493f36}
            .study-today-stats .overdue strong{color:var(--study-red)}.study-today-stats .total strong{color:var(--primary,#8d5a2b)}.study-library-message{margin-top:10px;color:#776b60;font-size:.8rem}
            .study-primary-action,.study-inline-primary{border:1px solid var(--primary,#8d5a2b)!important;background:var(--primary,#8d5a2b)!important;color:#fff!important;font-weight:700}.study-primary-action{min-height:42px;padding:8px 16px;border-radius:10px}
            .study-inline-primary,.study-inline-secondary{min-height:36px;padding:6px 10px;border-radius:8px;white-space:nowrap}.study-inline-secondary{border:1px solid #cdbfaf;background:#fff;color:#67594c;font-weight:700}
            .global-study-controls{display:contents}.global-study-controls select{min-width:118px}.global-study-controls button span{display:inline-flex;min-width:20px;justify-content:center;margin-left:4px;padding:1px 6px;border-radius:999px;background:rgba(255,255,255,.22)}
            .sidebar-study-controls{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px;margin:8px 0 2px}.sidebar-study-controls[hidden]{display:none!important}.sidebar-study-controls button:disabled,.study-primary-action:disabled{opacity:.45;cursor:not-allowed}
            .study-overlay{position:fixed;inset:0;z-index:12000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(39,32,27,.45);backdrop-filter:blur(3px)}.study-overlay.show{display:flex}
            .study-hub{width:min(680px,100%);max-height:90vh;overflow:auto;padding:18px;border-radius:18px;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.22)}.study-hub-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
            .study-icon-action{width:42px;height:42px;border-radius:50%;border:1px solid #ded3c9;background:#fff;color:#65594d;font-size:1.25rem;display:inline-flex;align-items:center;justify-content:center}.study-icon-action:disabled{opacity:.35}
            .study-hub-preset-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:16px}.study-preset{display:grid;grid-template-columns:1fr auto;grid-template-areas:'label count' 'hint hint';gap:2px 8px;text-align:left;padding:12px;border:1px solid #e5dbd1;border-radius:12px;background:#fff;color:#51463d}.study-preset.primary{border-color:#cdb59c;background:#fff8f0}.study-preset.context{grid-column:1/-1}.study-preset span{grid-area:label;font-weight:700}.study-preset strong{grid-area:count;font-size:1.35rem}.study-preset small{grid-area:hint;color:#897d71}
            .study-hub-settings{margin-top:12px;padding:9px 11px;border:1px solid #e7ddd3;border-radius:10px;background:#faf7f3}.study-hub-settings summary{cursor:pointer;font-weight:700;color:#6b5c4e}.study-setting-row{display:flex;align-items:center;gap:6px;margin-top:8px}.study-setting-row label{display:flex;align-items:center;gap:7px}.study-setting-row input[type=number]{width:72px;min-height:36px;font-size:16px}.study-setting-check{display:flex;align-items:center;gap:7px;margin-top:9px}
            .study-swipe-guide{display:flex;justify-content:center;gap:30px;margin-top:14px}.study-swipe-guide span{display:flex;align-items:center;gap:7px;font-weight:800}.study-swipe-guide i{width:30px;height:30px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-style:normal}.study-swipe-guide .wrong i{background:var(--study-red)}.study-swipe-guide .unsure i{background:var(--study-gray)}.study-swipe-guide .known i{background:var(--study-green)}.study-hub-status{min-height:1.2em;margin:10px 0 0;color:var(--study-red);font-size:.85rem}
            .study-session-overlay{position:fixed;inset:0;z-index:13000;display:none;background:rgba(245,241,236,.98);overflow:auto}.study-session-overlay.show{display:block}.study-session-open{overflow:hidden}
            .study-session-shell{width:min(760px,100%);min-height:100%;margin:0 auto;padding:14px 18px 24px;display:flex;flex-direction:column}.study-session-header{display:grid;grid-template-columns:48px 1fr 48px;align-items:center;gap:8px}.study-session-progress-wrap{text-align:center}.study-session-progress-wrap strong{display:block;font-size:1.05rem;color:#433a32}.study-session-progress-wrap span{display:block;margin-top:2px;color:#817568;font-size:.78rem}
            .study-session-stage{flex:1;display:flex;align-items:center;justify-content:center;min-height:470px}.study-gesture-field{position:relative;width:min(500px,92vw);padding:52px 0 18px}.study-flashcard{--study-feedback-alpha:0;position:relative;width:100%;height:min(350px,58vw);min-height:285px;max-height:390px;touch-action:none;user-select:none;cursor:grab;transition:transform .22s ease;transform-origin:center center;outline:none}.study-flashcard.is-dragging{cursor:grabbing;transition:none}.study-flashcard.is-committing{transition:transform .19s ease-out}.study-flashcard:focus-visible{outline:3px solid rgba(141,90,43,.25);outline-offset:5px;border-radius:22px}
            .study-flashcard-inner{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .28s ease}.study-flashcard.flipped .study-flashcard-inner{transform:rotateY(180deg)}.study-card-face{position:absolute;inset:0;backface-visibility:hidden;border:1px solid #dfd3c7;border-radius:22px;background:var(--study-paper);box-shadow:0 15px 38px rgba(79,63,50,.14);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px;text-align:center;overflow:auto}.study-card-back{transform:rotateY(180deg)}
            .study-card-judge{position:absolute;z-index:5;top:18px;right:20px;width:62px;height:62px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:2.1rem;font-weight:900;opacity:var(--study-feedback-alpha);pointer-events:none}.study-flashcard[data-direction=wrong] .study-card-judge{background:var(--study-red)}.study-flashcard[data-direction=known] .study-card-judge{background:var(--study-green)}.study-flashcard[data-direction=unsure] .study-card-judge{background:var(--study-gray)}
            .study-flashcard[data-direction=wrong] .study-card-face{border-color:color-mix(in srgb,var(--study-red) 60%,#fff);box-shadow:0 15px 38px rgba(160,55,55,calc(.08 + var(--study-feedback-alpha)*.22))}.study-flashcard[data-direction=known] .study-card-face{border-color:color-mix(in srgb,var(--study-green) 60%,#fff);box-shadow:0 15px 38px rgba(50,130,85,calc(.08 + var(--study-feedback-alpha)*.22))}.study-flashcard[data-direction=unsure] .study-card-face{border-color:color-mix(in srgb,var(--study-gray) 60%,#fff)}
            .study-card-word{font-size:clamp(2rem,7vw,3.5rem);font-weight:800;color:#3f352d;line-height:1.15;overflow-wrap:anywhere}.study-card-surface{margin-top:12px;color:#7d7064;font-size:1rem}.study-card-meta{display:flex;flex-wrap:wrap;justify-content:center;gap:5px;margin-top:16px}.study-card-meta span{padding:3px 8px;border-radius:999px;background:#eee7df;color:#716458;font-size:.72rem}.study-card-back-word{font-size:1.2rem;font-weight:800;color:#6d5d4f}.study-card-meaning{margin-top:18px;font-size:clamp(1.35rem,4vw,2rem);font-weight:750;color:#352e28;line-height:1.45}.study-card-memo{margin-top:16px;color:#6f6257;line-height:1.5}.study-card-context{width:100%;margin-top:17px;padding:12px;border-radius:10px;background:#f5f0ea;color:#65594e;font-size:.88rem;line-height:1.55;text-align:left}.study-card-source{margin-top:14px;color:#95887b;font-size:.74rem}.study-card-studyline{margin-top:5px;color:#8c7c6d;font-size:.72rem}
            .study-direction-hint{position:absolute;z-index:0;width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:1.45rem;font-weight:900;opacity:.78}.hint-wrong{left:-8px;top:50%;background:var(--study-red)}.hint-known{right:-8px;top:50%;background:var(--study-green)}.hint-unsure{left:50%;top:3px;transform:translateX(-50%);background:var(--study-gray)}
            .study-touch-actions{display:flex;justify-content:center;gap:26px;margin-top:14px}.study-judge-button{width:48px;height:48px;border:0;border-radius:50%;color:#fff;font-size:1.45rem;font-weight:900;box-shadow:0 4px 12px rgba(0,0,0,.12)}.study-judge-button.wrong{background:var(--study-red)}.study-judge-button.unsure{background:var(--study-gray)}.study-judge-button.known{background:var(--study-green)}.study-session-source{text-align:center;color:#8a7c70;font-size:.75rem;min-height:1.2em}
            .study-session-summary{width:min(560px,94vw);padding:24px;border:1px solid #e1d7cd;border-radius:20px;background:#fff;text-align:center;box-shadow:0 14px 38px rgba(70,55,44,.12)}.study-summary-mark{width:56px;height:56px;margin:0 auto 8px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--study-green);color:#fff;font-size:1.8rem}.study-session-summary h2{margin:8px 0;color:#433930}.study-summary-main{display:flex;align-items:baseline;justify-content:center;gap:7px}.study-summary-main strong{font-size:2.4rem}.study-summary-main span{color:#7b6e62}.study-summary-judges{display:flex;justify-content:center;gap:18px;margin:18px 0}.study-judge-stat{display:flex;align-items:center;gap:7px}.study-judge-stat span{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900}.study-judge-stat.wrong span{background:var(--study-red)}.study-judge-stat.unsure span{background:var(--study-gray)}.study-judge-stat.known span{background:var(--study-green)}.study-summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;text-align:left}.study-summary-grid>div{display:flex;align-items:center;justify-content:space-between;padding:10px;border-radius:9px;background:#f7f3ef}.study-summary-grid span{color:#75685c;font-size:.82rem}.study-summary-actions{display:flex;align-items:center;justify-content:center;gap:12px;margin-top:18px}
            @media(max-width:700px){.study-today-card{margin:10px 0 14px;padding:12px}.study-today-heading{align-items:flex-start}.study-today-heading h2{font-size:1.2rem}.study-today-stats{grid-template-columns:1fr 1fr}.study-primary-action{padding:8px 11px;font-size:.86rem}.global-study-controls{display:grid;grid-template-columns:1fr 1fr;grid-column:1/-1;gap:6px;width:100%}.global-study-controls select,.global-study-controls button{width:100%;min-width:0;font-size:13px}.global-study-controls button{grid-column:span 1}.sidebar-study-controls{grid-template-columns:1fr auto}.study-overlay{align-items:flex-end;padding:0}.study-hub{width:100%;max-height:92vh;border-radius:18px 18px 0 0;padding:15px}.study-hub-preset-grid{grid-template-columns:1fr 1fr}.study-preset{padding:10px}.study-preset small{font-size:.68rem}.study-swipe-guide{gap:22px}.study-session-shell{padding:10px 12px 18px}.study-session-stage{min-height:420px}.study-gesture-field{width:min(88vw,470px);padding-top:48px}.study-flashcard{height:58vh;max-height:420px;min-height:300px}.study-card-face{padding:22px 18px}.study-touch-actions{gap:30px}.study-judge-button{width:52px;height:52px}.study-summary-grid{grid-template-columns:1fr}.hint-wrong{left:-6px}.hint-known{right:-6px}}
            @media(max-width:390px){.study-hub-preset-grid{grid-template-columns:1fr}.study-preset.context{grid-column:auto}.study-today-heading{flex-direction:column}.study-today-heading .study-primary-action{width:100%}.study-session-stage{min-height:390px}.study-flashcard{min-height:285px;height:56vh}.study-direction-hint{width:40px;height:40px;font-size:1.2rem}}
        `;
        document.head.appendChild(style);
    }

    function bindGlobalKeyboard() {
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                if (document.getElementById('study-hub-overlay')?.classList.contains('show')) closeStudyHub();
                else if (session) closeSession(false);
            }
        });
    }

    function init() {
        injectStyles();
        injectStudyOverlays();
        installGlobalVocabularyFilter();
        wrapGlobalRender();
        wrapExistingViews();
        injectGlobalStudyControls();
        injectLibraryStudyCard();
        injectSidebarStudyControls();
        bindGlobalKeyboard();
        refreshStudySurfaces();

        window.SmartReaderStudy = {
            open: openStudyHub,
            startToday: () => startSession(selectTodayEntries(), '今日の学習'),
            startCurrentRange: () => openStudyHub(currentRangeEntries(), currentRangeLabel()),
            startFiltered: () => openStudyHub(entriesFromGlobalFiltered(), '現在の絞り込み結果'),
            getSummary: () => summarizeEntries(),
            getWordStudy: word => readStudy(word),
            getWordView: word => studyView(word),
            refresh: refreshStudySurfaces
        };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();