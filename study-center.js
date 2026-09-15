(function () {
    'use strict';

    const SECTION_ID = 'study-center-section';
    const NAV_BUTTON_ID = 'study-center-library-button';
    const DAY_MS = 86400000;
    let activeTab = 'home';
    let wordFilter = 'all';
    let originalHideAllSections = null;

    function startOfLocalDay(timestamp = Date.now()) {
        const date = new Date(timestamp);
        return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    }

    function localDayAfter(days, timestamp = Date.now()) {
        const date = new Date(timestamp);
        return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days).getTime();
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, char => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[char]));
    }

    function studyMeaning(word) {
        try {
            const resolved = window.SmartReaderStudy?.getWordMeaning?.(word);
            if (String(resolved || '').trim()) return String(resolved).trim();
        } catch (_) {}
        return String(word?.meaning || '').trim();
    }

    function library() {
        if (Array.isArray(window.libraryItems)) return window.libraryItems;
        try {
            if (typeof libraryItems !== 'undefined' && Array.isArray(libraryItems)) return libraryItems;
        } catch (_) {}
        return [];
    }

    function articleTitle(article) {
        return String(article?.name || article?.title || article?.sourceName || '無題');
    }

    function chapterTitle(article, word) {
        const chapterId = word?.chapterId;
        if (chapterId === undefined || chapterId === null || chapterId === '') return '';
        const chapter = (Array.isArray(article?.chapters) ? article.chapters : [])
            .find(item => String(item?.id) === String(chapterId));
        return String(chapter?.title || '章未設定');
    }

    function entryKey(article, word, sourceIndex) {
        if (word?.id !== undefined && word?.id !== null && String(word.id) !== '') {
            return `${String(article.id)}::id::${String(word.id)}`;
        }
        return `${String(article.id)}::index::${String(sourceIndex)}`;
    }

    function allEntries() {
        const entries = [];
        library().filter(item => item && item.type === 'article').forEach(article => {
            (Array.isArray(article.words) ? article.words : []).forEach((word, sourceIndex) => {
                if (!word) return;
                entries.push({
                    key: entryKey(article, word, sourceIndex),
                    article,
                    articleId: article.id,
                    articleTitle: articleTitle(article),
                    chapterId: word.chapterId ?? null,
                    chapterTitle: chapterTitle(article, word),
                    word,
                    sourceIndex
                });
            });
        });
        return entries;
    }

    function fallbackStudy(word) {
        const raw = word?.study && typeof word.study === 'object' ? word.study : {};
        return {
            seenCount: Number(raw.seenCount) || 0,
            knownCount: Number(raw.knownCount) || 0,
            unsureCount: Number(raw.unsureCount) || 0,
            wrongCount: Number(raw.wrongCount) || 0,
            correctStreak: Number(raw.correctStreak) || 0,
            level: Number(raw.level) || (word?.memorized ? 4 : 0),
            nextReviewAt: Number.isFinite(Number(raw.nextReviewAt)) ? Number(raw.nextReviewAt) : null,
            difficultyScore: Number.isFinite(Number(raw.difficultyScore)) ? Number(raw.difficultyScore) : 45,
            lastResult: raw.lastResult || null,
            lastReviewResult: raw.lastReviewResult || null,
            lapseCount: Number(raw.lapseCount) || 0,
            lastSessionAttempts: Number(raw.lastSessionAttempts) || 0,
            lastSessionWrongCount: Number(raw.lastSessionWrongCount) || 0,
            lastSessionUnsureCount: Number(raw.lastSessionUnsureCount) || 0,
            suspended: !!raw.suspended,
            suspendedAt: Number.isFinite(Number(raw.suspendedAt)) ? Number(raw.suspendedAt) : null,
            manualMasteredAt: Number.isFinite(Number(raw.manualMasteredAt)) ? Number(raw.manualMasteredAt) : null
        };
    }

    function localWeaknessScore(study) {
        const seen = Math.max(0, Number(study?.seenCount) || 0);
        const known = Math.max(0, Number(study?.knownCount) || 0);
        const attempts = Math.max(0, Number(study?.lastSessionAttempts) || 0);
        const accuracy = seen ? known / seen : null;
        let score = (Number(study?.difficultyScore) || 45) * 0.55;
        if (attempts) {
            score += Math.min(25,
                ((Number(study?.lastSessionWrongCount) || 0) / attempts) * 25
                + ((Number(study?.lastSessionUnsureCount) || 0) / attempts) * 12
            );
        }
        const last = String(study?.lastReviewResult || study?.lastResult || '');
        if (last === 'wrong') score += 18;
        else if (last === 'unsure') score += 10;
        else if (last === 'known') score -= 8;
        score += Math.min(18, (Number(study?.lapseCount) || 0) * 6);
        if (accuracy !== null && seen >= 3 && accuracy < 0.7) score += (0.7 - accuracy) * 30;
        score -= Math.min(20, (Number(study?.correctStreak) || 0) * 4);
        return Math.max(0, Math.min(100, Math.round(score)));
    }

    function wordView(word) {
        const apiView = window.SmartReaderStudy?.getWordView?.(word);
        if (apiView) return apiView;
        const study = fallbackStudy(word);
        const today = startOfLocalDay();
        const tomorrow = localDayAfter(1);
        const next = study.nextReviewAt;
        const isNew = study.seenCount === 0
            && study.knownCount === 0
            && study.unsureCount === 0
            && study.wrongCount === 0
            && !word?.memorized;
        const overdue = next !== null && next < today;
        const dueToday = next !== null && next >= today && next < tomorrow;
        const due = next !== null && next < tomorrow;
        const suspended = !!study.suspended;
        const manualMastered = !!study.manualMasteredAt && !!word?.memorized;
        const mastered = manualMastered || !!word?.memorized || study.level >= 4;
        const accuracy = study.seenCount ? study.knownCount / study.seenCount : null;
        const weakScore = localWeaknessScore(study);
        const difficult = !suspended && !manualMastered && weakScore >= 65;
        return { study, isNew, overdue, dueToday, due, mastered, manualMastered, suspended, difficult, weaknessScore: weakScore, accuracy };
    }

    function isUnresolved(view) {
        if (!view?.due || view?.suspended || view?.manualMastered) return false;
        const last = String(view.study?.lastResult || view.study?.lastReviewResult || '');
        return last === 'wrong' || last === 'unsure';
    }

    function daysOverdue(nextReviewAt) {
        if (!Number.isFinite(Number(nextReviewAt))) return 0;
        return Math.max(0, Math.floor((startOfLocalDay() - startOfLocalDay(Number(nextReviewAt))) / DAY_MS));
    }

    function priorityScore(entry) {
        const view = wordView(entry.word);
        let score = 0;
        if (isUnresolved(view)) score += 50000;
        if (view.overdue) score += 30000 + Math.min(365, daysOverdue(view.study.nextReviewAt)) * 100;
        else if (view.dueToday) score += 20000;
        score += (Number(view.weaknessScore ?? view.study?.difficultyScore) || 0) * 10;
        score += Math.min(100, Number(view.study?.wrongCount) || 0) * 3;
        return score;
    }

    function sorted(entries) {
        return [...entries].sort((a, b) => priorityScore(b) - priorityScore(a));
    }

    function reviewModel() {
        const entries = allEntries();
        const today = startOfLocalDay();
        const tomorrow = localDayAfter(1);
        const dayAfterTomorrow = localDayAfter(2);
        const weekEnd = localDayAfter(7);

        const unresolved = [];
        const overdue = [];
        const todayDue = [];
        const tomorrowDue = [];
        const weekDue = [];
        const newWords = [];
        const difficult = [];
        const mastered = [];
        const held = [];

        entries.forEach(entry => {
            const view = wordView(entry.word);
            const next = view.study?.nextReviewAt;
            if (view.suspended) {
                held.push(entry);
                return;
            }
            if (view.mastered) mastered.push(entry);
            if (view.manualMastered) return;
            if (view.isNew) newWords.push(entry);
            if (view.difficult) difficult.push(entry);

            if (isUnresolved(view)) {
                unresolved.push(entry);
            } else if (view.overdue) {
                overdue.push(entry);
            } else if (view.dueToday) {
                todayDue.push(entry);
            } else if (next !== null && next >= tomorrow && next < dayAfterTomorrow) {
                tomorrowDue.push(entry);
            } else if (next !== null && next >= dayAfterTomorrow && next < weekEnd) {
                weekDue.push(entry);
            }
        });

        const dueNow = sorted([...unresolved, ...overdue, ...todayDue]);
        const urgent = sorted([...unresolved, ...overdue]);
        return {
            entries,
            unresolved: sorted(unresolved),
            overdue: sorted(overdue),
            todayDue: sorted(todayDue),
            tomorrowDue: sorted(tomorrowDue),
            weekDue: sorted(weekDue),
            dueNow,
            urgent,
            newWords: sorted(newWords),
            difficult: sorted(difficult),
            mastered: sorted(mastered),
            held: sorted(held),
            today,
            tomorrow
        };
    }

    function formatDate(timestamp) {
        if (!Number.isFinite(Number(timestamp))) return '未予定';
        const date = new Date(Number(timestamp));
        return `${date.getMonth() + 1}/${date.getDate()}`;
    }

    function formatLongDate() {
        return new Intl.DateTimeFormat('ja-JP', {
            month: 'long', day: 'numeric', weekday: 'short'
        }).format(new Date());
    }

    function dueLabel(entry) {
        const view = wordView(entry.word);
        if (view.suspended) return { text: '保留', tone: 'held' };
        if (view.manualMastered) return { text: '手動✓', tone: 'mastered' };
        if (isUnresolved(view)) return { text: '未解決', tone: 'danger' };
        if (view.overdue) {
            const days = daysOverdue(view.study.nextReviewAt);
            return { text: `${Math.max(1, days)}日超過`, tone: 'danger' };
        }
        if (view.dueToday) return { text: '今日まで', tone: 'today' };
        const next = view.study.nextReviewAt;
        if (next !== null && next < localDayAfter(2)) return { text: '明日', tone: 'soon' };
        return { text: formatDate(next), tone: 'future' };
    }

    function weaknessReason(view) {
        const study = view?.study || {};
        const last = String(study.lastReviewResult || study.lastResult || '');
        if (last === 'wrong') return '直近で✕';
        if (last === 'unsure') return '直近で?';
        if ((Number(study.lapseCount) || 0) >= 2) return `忘却 ${Number(study.lapseCount)}回`;
        const attempts = Number(study.lastSessionAttempts) || 0;
        const recentMiss = (Number(study.lastSessionWrongCount) || 0) + (Number(study.lastSessionUnsureCount) || 0);
        if (attempts >= 2 && recentMiss / attempts >= 0.5) return '最近のミスが多い';
        if (view?.accuracy !== null && view?.accuracy !== undefined && Number(view.accuracy) < 0.6) return '正答率が低め';
        if ((Number(study.correctStreak) || 0) >= 3) return `連続✓ ${Number(study.correctStreak)}`;
        return '総合判定';
    }

    function recentResult(view) {
        const last = String(view.study?.lastResult || view.study?.lastReviewResult || '');
        if (last === 'known') return '✓';
        if (last === 'wrong') return '✕';
        if (last === 'unsure') return '?';
        return '—';
    }

    function wordCard(entry) {
        const view = wordView(entry.word);
        const due = dueLabel(entry);
        const difficulty = Math.round(Number(view.weaknessScore ?? view.study?.difficultyScore) || 0);
        const source = `${entry.articleTitle}${entry.chapterTitle ? ` / ${entry.chapterTitle}` : ''}`;
        const held = !!view.suspended;
        const manualMastered = !!view.manualMastered;
        return `
            <article class="study-center-word-card ${held ? 'is-held' : ''} ${manualMastered ? 'is-manual-mastered' : ''}">
                <div class="study-center-word-main">
                    <div class="study-center-word-title-row">
                        <strong>${escapeHtml(entry.word.word || entry.word.surfaceText || '—')}</strong>
                        <span class="study-center-due-badge ${due.tone}">${escapeHtml(due.text)}</span>
                    </div>
                    <div class="study-center-word-meaning">${escapeHtml(studyMeaning(entry.word))}</div>
                    <div class="study-center-word-meta">
                        <span>苦手度 ${difficulty}</span>
                        <span>${escapeHtml(weaknessReason(view))}</span>
                        <span>前回 ${recentResult(view)}</span>
                        <span>✕${Number(view.study?.wrongCount) || 0}</span>
                    </div>
                    <small>${escapeHtml(source)}</small>
                </div>
                <div class="study-center-word-actions">
                    <button type="button" class="study-center-mini-study" data-study-one="${escapeHtml(entry.key)}" ${held ? 'disabled' : ''}>復習</button>
                    <button type="button" class="study-center-hold-action ${held ? 'active' : ''}" data-toggle-hold="${escapeHtml(entry.key)}" aria-pressed="${held}">${held ? '保留解除' : '保留'}</button>
                    <button type="button" class="study-center-master-action ${manualMastered ? 'active' : ''}" data-toggle-mastered="${escapeHtml(entry.key)}" aria-pressed="${manualMastered}" aria-label="手動で暗記済みにする">✓</button>
                </div>
            </article>
        `;
    }

    function emptyState(message) {
        return `<div class="study-center-empty">${escapeHtml(message)}</div>`;
    }

    function scheduleBars(model) {
        const entries = model.entries;
        const days = Array.from({ length: 7 }, (_, index) => {
            const start = localDayAfter(index);
            const end = localDayAfter(index + 1);
            const count = entries.filter(entry => {
                const view = wordView(entry.word);
                if (view.suspended || view.manualMastered) return false;
                const next = view.study?.nextReviewAt;
                return next !== null && next >= start && next < end;
            }).length;
            return { index, count };
        });
        const max = Math.max(1, ...days.map(day => day.count));
        const labels = ['今日', '明日'];
        return `
            <div class="study-center-week-bars" aria-label="今後7日間の復習予定">
                ${days.map(day => {
                    const date = new Date(localDayAfter(day.index));
                    const label = labels[day.index] || `${date.getMonth() + 1}/${date.getDate()}`;
                    const height = Math.max(day.count ? 10 : 2, Math.round((day.count / max) * 62));
                    return `<div class="study-center-week-day"><strong>${day.count}</strong><div class="study-center-week-track"><span style="height:${height}px"></span></div><small>${escapeHtml(label)}</small></div>`;
                }).join('')}
            </div>
        `;
    }

    function renderHome(model) {
        const dueCount = model.dueNow.length;
        const urgentCount = model.urgent.length;
        const headline = urgentCount
            ? `まず ${urgentCount}語を優先して復習`
            : (dueCount ? `今日中に ${dueCount}語を復習` : '今日の復習は完了です');
        const subline = urgentCount
            ? `未解決 ${model.unresolved.length}語・期限超過 ${model.overdue.length}語`
            : (dueCount ? '今日が期限のカードがあります' : `明日は ${model.tomorrowDue.length}語の予定です`);

        return `
            <section class="study-center-home">
                <div class="study-center-hero">
                    <div>
                        <div class="study-center-date">${escapeHtml(formatLongDate())}</div>
                        <h2>${escapeHtml(headline)}</h2>
                        <p>${escapeHtml(subline)}</p>
                    </div>
                    <div class="study-center-hero-count"><strong>${dueCount}</strong><span>今日まで</span></div>
                </div>

                <div class="study-center-metric-grid">
                    <button type="button" data-open-review="unresolved" class="study-center-metric danger"><span>未解決</span><strong>${model.unresolved.length}</strong><small>前回 ✕ / ?</small></button>
                    <button type="button" data-open-review="overdue" class="study-center-metric warning"><span>期限超過</span><strong>${model.overdue.length}</strong><small>予定日を超過</small></button>
                    <button type="button" data-open-review="today" class="study-center-metric today"><span>今日</span><strong>${model.todayDue.length}</strong><small>今日が期限</small></button>
                    <button type="button" data-open-review="tomorrow" class="study-center-metric"><span>明日</span><strong>${model.tomorrowDue.length}</strong><small>次の予定</small></button>
                </div>

                <div class="study-center-panel study-center-start-panel">
                    <div>
                        <span class="study-center-eyebrow">TODAY</span>
                        <h3>今日の復習</h3>
                        <p>${dueCount ? `残り ${dueCount}語。少しだけでも始められます。` : '期限が来ている単語はありません。'}</p>
                    </div>
                    <div class="study-center-start-actions">
                        <button type="button" data-study-limit="10" ${dueCount ? '' : 'disabled'}>10語だけ</button>
                        <button type="button" data-study-limit="20" ${dueCount ? '' : 'disabled'}>20語</button>
                        <button type="button" class="primary" data-study-limit="all" ${dueCount ? '' : 'disabled'}>全部 ${dueCount}語</button>
                    </div>
                </div>

                <div class="study-center-panel">
                    <div class="study-center-panel-heading">
                        <div><span class="study-center-eyebrow">SCHEDULE</span><h3>今後7日間</h3></div>
                        <button type="button" class="study-center-link" data-tab-target="review">詳しく見る</button>
                    </div>
                    ${scheduleBars(model)}
                </div>

                <div class="study-center-panel">
                    <div class="study-center-panel-heading">
                        <div><span class="study-center-eyebrow">WEAK WORDS</span><h3>優先して覚えたい単語</h3></div>
                        <button type="button" class="study-center-link" data-word-filter="difficult">苦手一覧</button>
                    </div>
                    <div class="study-center-compact-list">
                        ${model.difficult.slice(0, 4).map(wordCard).join('') || emptyState('苦手と判定された単語はまだありません。')}
                    </div>
                </div>
            </section>
        `;
    }

    function reviewSection(title, description, entries, mode, actionLabel) {
        return `
            <section class="study-center-review-group" data-review-group="${mode}">
                <div class="study-center-review-heading">
                    <div><h3>${escapeHtml(title)} <span>${entries.length}</span></h3><p>${escapeHtml(description)}</p></div>
                    <button type="button" data-study-group="${mode}" ${entries.length ? '' : 'disabled'}>${escapeHtml(actionLabel)}</button>
                </div>
                <div class="study-center-word-list">
                    ${entries.length ? entries.map(wordCard).join('') : emptyState('この範囲の単語はありません。')}
                </div>
            </section>
        `;
    }

    function renderReview(model) {
        return `
            <section class="study-center-review">
                <div class="study-center-review-summary">
                    <div><span>今すぐ</span><strong>${model.urgent.length}</strong><small>未解決 + 期限超過</small></div>
                    <div><span>今日</span><strong>${model.todayDue.length}</strong><small>今日が期限</small></div>
                    <div><span>明日</span><strong>${model.tomorrowDue.length}</strong><small>明日の予定</small></div>
                    <div><span>今週</span><strong>${model.weekDue.length}</strong><small>2〜6日後</small></div>
                </div>
                ${reviewSection('未解決', '✕・? のあと、まだ正解で解消できていない単語', model.unresolved, 'unresolved', '未解決を復習')}
                ${reviewSection('期限超過', '本来の復習予定日を過ぎている単語', model.overdue, 'overdue', '超過分を復習')}
                ${reviewSection('今日', '今日中に復習したい単語', model.todayDue, 'today', '今日分を復習')}
                ${reviewSection('明日', '明日が復習予定日の単語', model.tomorrowDue, 'tomorrow', '明日分を先取り')}
                ${reviewSection('今週', '2〜6日後に復習予定の単語', model.weekDue, 'week', '今週分を先取り')}
            </section>
        `;
    }

    function wordFilterEntries(model) {
        if (wordFilter === 'difficult') return model.difficult;
        if (wordFilter === 'new') return model.newWords;
        if (wordFilter === 'mastered') return model.mastered;
        if (wordFilter === 'held') return model.held;
        if (wordFilter === 'due') return model.dueNow;
        return sorted(model.entries);
    }

    function renderWords(model) {
        const entries = wordFilterEntries(model);
        const filters = [
            ['all', 'すべて', model.entries.length],
            ['due', '要復習', model.dueNow.length],
            ['difficult', '苦手', model.difficult.length],
            ['new', '未学習', model.newWords.length],
            ['mastered', '暗記済み', model.mastered.length],
            ['held', '保留', model.held.length]
        ];
        return `
            <section class="study-center-words">
                <div class="study-center-filter-row">
                    ${filters.map(([key, label, count]) => `<button type="button" data-word-filter="${key}" class="${wordFilter === key ? 'active' : ''}">${label} <span>${count}</span></button>`).join('')}
                </div>
                <div class="study-center-list-heading"><strong>${entries.length}語</strong><span>学習状態を基準に並べています</span></div>
                <div class="study-center-word-list">
                    ${entries.length ? entries.map(wordCard).join('') : emptyState('この条件の単語はありません。')}
                </div>
            </section>
        `;
    }

    function historySessions() {
        const list = window.SmartReaderStudy?.getHistory?.();
        return Array.isArray(list) ? list : [];
    }

    function localDateKey(timestamp) {
        const date = new Date(Number(timestamp) || Date.now());
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function dateHeading(timestamp) {
        return new Intl.DateTimeFormat('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(Number(timestamp)));
    }

    function timeLabel(timestamp) {
        return new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(new Date(Number(timestamp)));
    }

    function resultMark(result) {
        if (result === 'known') return '✓';
        if (result === 'wrong') return '✕';
        if (result === 'unsure') return '?';
        return '—';
    }

    function sessionAccuracy(session) {
        const stats = session?.stats || {};
        const responses = Number(stats.responses) || 0;
        return responses ? Math.round(((Number(stats.known) || 0) / responses) * 100) : 0;
    }

    function renderHistory() {
        const sessions = historySessions();
        if (!window.SmartReaderStudy?.isHistoryLoaded?.()) {
            return `<section class="study-center-placeholder"><div class="study-center-placeholder-icon">↺</div><h2>学習履歴</h2><p>履歴を読み込んでいます。</p></section>`;
        }
        if (!sessions.length) return `<section class="study-center-placeholder"><div class="study-center-placeholder-icon">↺</div><h2>学習履歴</h2><p>カード学習を終えると、ここに学習した日時と結果が残ります。</p></section>`;

        const groups = new Map();
        sessions.forEach(session => {
            const key = localDateKey(session.completedAt || session.startedAt);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(session);
        });
        return `
            <section class="study-center-history">
                <div class="study-center-list-heading"><strong>${sessions.length}セッション</strong><span>カード学習の終了時に自動保存</span></div>
                ${Array.from(groups.entries()).map(([, daySessions]) => {
                    const stamp = daySessions[0].completedAt || daySessions[0].startedAt;
                    const unique = daySessions.reduce((sum, item) => sum + (Number(item.uniqueCount) || 0), 0);
                    const responses = daySessions.reduce((sum, item) => sum + (Number(item.stats?.responses) || 0), 0);
                    return `
                        <section class="study-center-history-day">
                            <div class="study-center-history-day-heading"><div><h3>${escapeHtml(dateHeading(stamp))}</h3><span>${unique}語・${responses}回答</span></div></div>
                            ${daySessions.map(session => `
                                <details class="study-center-history-session">
                                    <summary>
                                        <div><strong>${escapeHtml(session.label || '学習')}</strong><span>${escapeHtml(timeLabel(session.completedAt || session.startedAt))}${session.finished ? '' : '・途中終了'}</span></div>
                                        <div class="study-center-history-numbers"><span>${Number(session.uniqueCount) || 0}語</span><span>正解 ${sessionAccuracy(session)}%</span></div>
                                    </summary>
                                    <div class="study-center-history-breakdown">
                                        <span>新規 ${Number(session.newCount) || 0}</span><span>復習 ${Number(session.reviewCount) || 0}</span>
                                        <span>✓ ${Number(session.stats?.known) || 0}</span><span>? ${Number(session.stats?.unsure) || 0}</span><span>✕ ${Number(session.stats?.wrong) || 0}</span>
                                        <span>🔥 ${Number(session.stats?.bestStreak) || 0}</span><span>苦手克服 ${Number(session.stats?.weakCleared) || 0}</span>
                                    </div>
                                    <div class="study-center-history-words">
                                        ${(Array.isArray(session.words) ? session.words : []).map(item => `<div><strong>${escapeHtml(item.word || '—')}</strong><span>${escapeHtml(item.meaning || '')}</span><b class="result-${escapeHtml(item.finalResult || '')}">${resultMark(item.finalResult)}</b></div>`).join('') || '<span>単語詳細はありません。</span>'}
                                    </div>
                                </details>
                            `).join('')}
                        </section>
                    `;
                }).join('')}
            </section>
        `;
    }

    function consecutiveStudyDays(sessions) {
        const keys = new Set(sessions.map(item => localDateKey(item.completedAt || item.startedAt)));
        let count = 0;
        let cursor = startOfLocalDay();
        while (keys.has(localDateKey(cursor))) {
            count += 1;
            cursor = localDayAfter(-count);
        }
        return count;
    }

    function renderStudyActivityBars(sessions) {
        const days = Array.from({ length: 7 }, (_, index) => {
            const offset = index - 6;
            const start = localDayAfter(offset);
            const end = localDayAfter(offset + 1);
            const matching = sessions.filter(item => {
                const stamp = Number(item.completedAt || item.startedAt) || 0;
                return stamp >= start && stamp < end;
            });
            const count = matching.reduce((sum, item) => sum + (Number(item.uniqueCount) || 0), 0);
            return { offset, count, start };
        });
        const max = Math.max(1, ...days.map(item => item.count));
        return `<div class="study-center-activity-bars">${days.map(day => {
            const date = new Date(day.start);
            const height = Math.max(day.count ? 14 : 2, Math.round((day.count / max) * 100));
            return `<div><strong>${day.count}</strong><span class="bar"><i style="height:${height}%"></i></span><small>${date.getMonth() + 1}/${date.getDate()}</small></div>`;
        }).join('')}</div>`;
    }

    function renderStats(model) {
        const sessions = historySessions();
        const now = Date.now();
        const last7 = sessions.filter(item => Number(item.completedAt || item.startedAt) >= now - 7 * DAY_MS);
        const last30 = sessions.filter(item => Number(item.completedAt || item.startedAt) >= now - 30 * DAY_MS);
        const responses7 = last7.reduce((sum, item) => sum + (Number(item.stats?.responses) || 0), 0);
        const known7 = last7.reduce((sum, item) => sum + (Number(item.stats?.known) || 0), 0);
        const words7 = last7.reduce((sum, item) => sum + (Number(item.uniqueCount) || 0), 0);
        const words30 = last30.reduce((sum, item) => sum + (Number(item.uniqueCount) || 0), 0);
        const bestAnswerStreak = last30.reduce((best, item) => Math.max(best, Number(item.stats?.bestStreak) || 0), 0);
        const weakCleared30 = last30.reduce((sum, item) => sum + (Number(item.stats?.weakCleared) || 0), 0);
        const streak = consecutiveStudyDays(sessions);
        return `
            <section class="study-center-stats">
                <div class="study-center-stat-grid">
                    <div><span>7日間</span><strong>${words7}</strong><small>学習した語</small></div>
                    <div><span>正解率</span><strong>${responses7 ? Math.round(known7 / responses7 * 100) : 0}%</strong><small>直近7日</small></div>
                    <div><span>30日間</span><strong>${words30}</strong><small>学習した語</small></div>
                    <div><span>連続学習</span><strong>${streak}</strong><small>日</small></div>
                    <div><span>苦手</span><strong>${model.difficult.length}</strong><small>現在</small></div>
                    <div><span>保留</span><strong>${model.held.length}</strong><small>自動出題から除外</small></div>
                    <div><span>最高streak</span><strong>🔥 ${bestAnswerStreak}</strong><small>直近30日</small></div>
                    <div><span>苦手克服</span><strong>${weakCleared30}</strong><small>直近30日</small></div>
                </div>
                <div class="study-center-panel">
                    <div class="study-center-panel-heading"><div><span class="study-center-eyebrow">ACTIVITY</span><h3>直近7日間</h3></div></div>
                    ${renderStudyActivityBars(sessions)}
                </div>
                <div class="study-center-panel">
                    <div class="study-center-panel-heading"><div><span class="study-center-eyebrow">CURRENT</span><h3>今の復習状況</h3></div></div>
                    <div class="study-center-current-stats"><span>未解決 <b>${model.unresolved.length}</b></span><span>期限超過 <b>${model.overdue.length}</b></span><span>今日 <b>${model.todayDue.length}</b></span><span>明日 <b>${model.tomorrowDue.length}</b></span></div>
                </div>
            </section>
        `;
    }

    function render() {
        const section = document.getElementById(SECTION_ID);
        if (!section) return;
        const model = reviewModel();
        section.querySelectorAll('[data-study-tab]').forEach(button => {
            button.classList.toggle('active', button.dataset.studyTab === activeTab);
        });
        const content = section.querySelector('[data-study-content]');
        if (!content) return;
        if (activeTab === 'home') content.innerHTML = renderHome(model);
        else if (activeTab === 'review') content.innerHTML = renderReview(model);
        else if (activeTab === 'words') content.innerHTML = renderWords(model);
        else if (activeTab === 'history') content.innerHTML = renderHistory();
        else if (activeTab === 'stats') content.innerHTML = renderStats(model);
        updateNavBadge(model);
    }

    function groupEntries(mode, model = reviewModel()) {
        if (mode === 'unresolved') return model.unresolved;
        if (mode === 'overdue') return model.overdue;
        if (mode === 'today') return model.todayDue;
        if (mode === 'tomorrow') return model.tomorrowDue;
        if (mode === 'week') return model.weekDue;
        return model.dueNow;
    }

    function persistStudyChanges() {
        try {
            const result = typeof saveToDB === 'function' ? saveToDB() : window.saveToDB?.();
            if (result && typeof result.catch === 'function') result.catch(error => console.error('Study Center save failed', error));
        } catch (error) {
            console.error('Study Center save failed', error);
        }
    }

    function findEntry(key) {
        return reviewModel().entries.find(entry => entry.key === key) || null;
    }

    function toggleHold(entry) {
        if (!entry?.word) return;
        const study = { ...fallbackStudy(entry.word), ...(entry.word.study && typeof entry.word.study === 'object' ? entry.word.study : {}) };
        study.suspended = !study.suspended;
        study.suspendedAt = study.suspended ? Date.now() : null;
        entry.word.study = study;
        persistStudyChanges();
        render();
    }

    function toggleManualMastered(entry) {
        if (!entry?.word) return;
        const study = { ...fallbackStudy(entry.word), ...(entry.word.study && typeof entry.word.study === 'object' ? entry.word.study : {}) };
        const currentlyManual = !!study.manualMasteredAt && !!entry.word.memorized;
        if (currentlyManual) {
            study.manualMasteredAt = null;
            entry.word.memorized = Number(study.level) >= 4;
        } else {
            study.manualMasteredAt = Date.now();
            study.suspended = false;
            study.suspendedAt = null;
            entry.word.memorized = true;
        }
        entry.word.study = study;
        persistStudyChanges();
        render();
    }

    function openStudy(entries, label) {
        const selected = sorted(entries || []);
        if (!selected.length) return;
        if (!window.SmartReaderStudy?.open) {
            alert('カード学習を読み込めませんでした。ページを再読み込みしてください。');
            return;
        }
        window.SmartReaderStudy.open(selected, label);
    }

    function updateNavBadge(model = reviewModel()) {
        const button = document.getElementById(NAV_BUTTON_ID);
        if (!button) return;
        let badge = button.querySelector('.study-center-nav-badge');
        const count = model.urgent.length || model.dueNow.length;
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'study-center-nav-badge';
            button.appendChild(badge);
        }
        badge.textContent = String(count);
        badge.hidden = count === 0;
        badge.classList.toggle('urgent', model.urgent.length > 0);
    }

    function hideStudySection() {
        const section = document.getElementById(SECTION_ID);
        if (section) section.style.display = 'none';
        document.getElementById('main-reader')?.classList.remove('study-center-active');
    }

    function wrapHideAllSections() {
        if (originalHideAllSections) return;
        const existing = typeof window.hideAllSections === 'function' ? window.hideAllSections : null;
        if (!existing) return;
        originalHideAllSections = existing;
        const wrapped = function () {
            const result = originalHideAllSections.apply(this, arguments);
            hideStudySection();
            return result;
        };
        try { hideAllSections = wrapped; } catch (_) {}
        window.hideAllSections = wrapped;
    }

    function showStudyCenter() {
        try { if (typeof flushReadingPositionSave === 'function') flushReadingPositionSave(); } catch (_) {}
        if (typeof window.hideAllSections === 'function') window.hideAllSections();
        const sidePanel = document.getElementById('side-panel');
        sidePanel?.classList.remove('is-open');
        const add = document.getElementById('add-btn');
        const fab = document.getElementById('fab-toggle');
        if (add) add.style.display = 'none';
        if (fab) fab.style.display = 'none';
        const section = document.getElementById(SECTION_ID);
        if (!section) return;
        const main = document.getElementById('main-reader');
        main?.classList.add('study-center-active');
        if (main) main.scrollTop = 0;
        section.style.display = 'block';
        section.scrollTop = 0;
        render();
        const historyLoad = window.SmartReaderStudy?.loadHistory?.();
        if (historyLoad && typeof historyLoad.then === 'function') {
            historyLoad.then(() => {
                if (section.style.display !== 'none' && (activeTab === 'history' || activeTab === 'stats' || activeTab === 'home')) render();
            });
        }
        window.scrollTo?.({ top: 0, behavior: 'instant' });
    }

    function injectSection() {
        if (document.getElementById(SECTION_ID)) return;
        const main = document.getElementById('main-reader');
        if (!main) return;
        const section = document.createElement('section');
        section.id = SECTION_ID;
        section.className = 'study-center-section';
        section.style.display = 'none';
        section.innerHTML = `
            <div class="study-center-shell">
                <header class="study-center-header">
                    <div><span class="study-center-eyebrow">STUDY</span><h1>学習</h1><p>いつ、何を復習するかをここで管理します。</p></div>
                    <button type="button" class="study-center-library-link" data-back-library>Library</button>
                </header>
                <nav class="study-center-tabs" aria-label="学習メニュー">
                    <button type="button" data-study-tab="home" class="active">ホーム</button>
                    <button type="button" data-study-tab="review">復習</button>
                    <button type="button" data-study-tab="words">単語</button>
                    <button type="button" data-study-tab="history">履歴</button>
                    <button type="button" data-study-tab="stats">統計</button>
                </nav>
                <div class="study-center-content" data-study-content></div>
            </div>
        `;
        const firstSection = main.firstElementChild;
        if (firstSection) main.insertBefore(section, firstSection);
        else main.appendChild(section);
    }

    function makeStudyNavButton(id) {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = id;
        button.className = 'btn-sub study-center-entry-button';
        button.textContent = 'Study';
        button.addEventListener('click', showStudyCenter);
        return button;
    }

    function injectNavigation() {
        const libraryActions = document.querySelector('#library-section .library-actions');
        if (libraryActions && !document.getElementById(NAV_BUTTON_ID)) {
            const vocabulary = Array.from(libraryActions.querySelectorAll('button')).find(button => button.textContent.trim() === 'Vocabulary');
            const studyButton = makeStudyNavButton(NAV_BUTTON_ID);
            if (vocabulary?.nextSibling) libraryActions.insertBefore(studyButton, vocabulary.nextSibling);
            else libraryActions.prepend(studyButton);
        }

        const vocabTitle = document.querySelector('#vocabulary-section .vocabulary-title-row');
        if (vocabTitle && !document.getElementById('study-center-vocab-button')) {
            vocabTitle.insertBefore(makeStudyNavButton('study-center-vocab-button'), vocabTitle.firstChild);
        }

        const problemsNav = document.querySelector('#problems-section .problems-navigation');
        if (problemsNav && !document.getElementById('study-center-problems-button')) {
            problemsNav.appendChild(makeStudyNavButton('study-center-problems-button'));
        }
    }

    function bindEvents() {
        const section = document.getElementById(SECTION_ID);
        if (!section) return;
        section.addEventListener('click', event => {
            const tab = event.target.closest('[data-study-tab]');
            if (tab) {
                activeTab = tab.dataset.studyTab;
                render();
                section.scrollTop = 0;
                const main = document.getElementById('main-reader');
                if (main) main.scrollTop = 0;
                return;
            }

            if (event.target.closest('[data-back-library]')) {
                if (typeof window.showLibrary === 'function') window.showLibrary();
                return;
            }

            const limitButton = event.target.closest('[data-study-limit]');
            if (limitButton) {
                const model = reviewModel();
                const limit = limitButton.dataset.studyLimit === 'all' ? model.dueNow.length : Number(limitButton.dataset.studyLimit);
                openStudy(model.dueNow.slice(0, limit), `今日の復習 · ${Math.min(limit, model.dueNow.length)}語`);
                return;
            }

            const groupButton = event.target.closest('[data-study-group]');
            if (groupButton) {
                const mode = groupButton.dataset.studyGroup;
                openStudy(groupEntries(mode), groupButton.textContent.trim());
                return;
            }

            const holdButton = event.target.closest('[data-toggle-hold]');
            if (holdButton) {
                const entry = findEntry(holdButton.dataset.toggleHold);
                if (entry) toggleHold(entry);
                return;
            }

            const masteredButton = event.target.closest('[data-toggle-mastered]');
            if (masteredButton) {
                const entry = findEntry(masteredButton.dataset.toggleMastered);
                if (entry) toggleManualMastered(entry);
                return;
            }

            const oneButton = event.target.closest('[data-study-one]');
            if (oneButton) {
                const model = reviewModel();
                const entry = model.entries.find(item => item.key === oneButton.dataset.studyOne);
                if (entry) openStudy([entry], `${entry.word.word || entry.word.surfaceText || '1語'}を復習`);
                return;
            }

            const openReview = event.target.closest('[data-open-review]');
            if (openReview) {
                activeTab = 'review';
                render();
                const group = section.querySelector(`[data-review-group="${openReview.dataset.openReview}"]`);
                group?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
                return;
            }

            const targetTab = event.target.closest('[data-tab-target]');
            if (targetTab) {
                activeTab = targetTab.dataset.tabTarget;
                render();
                section.scrollTop = 0;
                const main = document.getElementById('main-reader');
                if (main) main.scrollTop = 0;
                return;
            }

            const filter = event.target.closest('[data-word-filter]');
            if (filter) {
                wordFilter = filter.dataset.wordFilter;
                activeTab = 'words';
                render();
            }
        });

        document.addEventListener('click', event => {
            if (event.target.closest('.study-judge-button, #study-session-undo, #study-summary-undo, #study-summary-close')) {
                window.setTimeout(() => {
                    if (document.getElementById(SECTION_ID)?.style.display !== 'none') render();
                    else updateNavBadge();
                }, 260);
            }
        }, true);

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) updateNavBadge();
        });
        window.addEventListener('smartreader:study-history-updated', () => {
            if (document.getElementById(SECTION_ID)?.style.display !== 'none') render();
        });
    }

    function init() {
        wrapHideAllSections();
        injectSection();
        injectNavigation();
        bindEvents();
        updateNavBadge();
        window.showStudyCenter = showStudyCenter;
        window.SmartReaderStudyCenter = {
            show: showStudyCenter,
            refresh: render,
            getReviewModel: reviewModel
        };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
