from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'anchor not found: {label}')
    return text.replace(old, new, 1)

# --- Flashcard session history persistence ---
path = Path('flashcard-study.js')
text = path.read_text()

text = replace_once(text,
"""    const EXAMPLE_MODE_KEY = 'smart-reader-study-example-mode';
    const STUDY_SETTINGS_KEY = 'smart-reader-study-settings-v1';
""",
"""    const EXAMPLE_MODE_KEY = 'smart-reader-study-example-mode';
    const STUDY_SETTINGS_KEY = 'smart-reader-study-settings-v1';
    const STUDY_HISTORY_KEY = 'study_history_v1';
    const STUDY_HISTORY_LIMIT = 500;
""", 'history constants')

text = replace_once(text,
"""    let dragState = null;
    let pendingCommit = null;
""",
"""    let dragState = null;
    let pendingCommit = null;
    let studyHistoryCache = [];
    let studyHistoryLoaded = false;
    let studyHistoryLoadPromise = null;
""", 'history state')

text = replace_once(text,
"""    function escapeHtml(value) {
""",
"""    function studyHistoryStore() {
        try {
            if (typeof db !== 'undefined' && db?.getItem && db?.setItem) return db;
        } catch (_) {}
        try {
            if (window.localforage?.createInstance) return window.localforage.createInstance({ name: 'ProjectA_DB_v3' });
        } catch (_) {}
        return null;
    }

    async function ensureStudyHistoryLoaded() {
        if (studyHistoryLoaded) return studyHistoryCache;
        if (studyHistoryLoadPromise) return studyHistoryLoadPromise;
        studyHistoryLoadPromise = (async () => {
            try {
                const store = studyHistoryStore();
                const raw = store ? await store.getItem(STUDY_HISTORY_KEY) : [];
                studyHistoryCache = Array.isArray(raw) ? raw.filter(item => item && typeof item === 'object').slice(0, STUDY_HISTORY_LIMIT) : [];
            } catch (error) {
                console.error('Study history load failed', error);
                studyHistoryCache = [];
            }
            studyHistoryLoaded = true;
            studyHistoryLoadPromise = null;
            window.dispatchEvent(new CustomEvent('smartreader:study-history-updated'));
            return studyHistoryCache;
        })();
        return studyHistoryLoadPromise;
    }

    async function persistStudyHistory() {
        try {
            const store = studyHistoryStore();
            if (store) await store.setItem(STUDY_HISTORY_KEY, studyHistoryCache.slice(0, STUDY_HISTORY_LIMIT));
        } catch (error) {
            console.error('Study history save failed', error);
        }
    }

    async function recordStudySession(current) {
        if (!current || !current.stats || current.stats.responses <= 0) return;
        await ensureStudyHistoryLoaded();
        const completedAt = Date.now();
        const words = [];
        const initialByKey = new Map((current.initialEntries || []).map(entry => [entry.key, entry]));
        (current.attempts instanceof Map ? Array.from(current.attempts.entries()) : []).forEach(([key, attempt]) => {
            if (!attempt || !attempt.responses) return;
            const entry = initialByKey.get(key);
            if (!entry?.word) return;
            const initial = current.initialStates instanceof Map ? current.initialStates.get(key) : null;
            words.push({
                key,
                articleId: entry.articleId ?? entry.article?.id ?? null,
                articleTitle: String(entry.articleTitle || entry.article?.name || ''),
                chapterId: entry.chapterId ?? null,
                chapterTitle: String(entry.chapterTitle || ''),
                word: String(entry.word.word || entry.word.surfaceText || ''),
                meaning: String(entry.word.meaning || ''),
                responses: Number(attempt.responses) || 0,
                known: Number(attempt.known) || 0,
                unsure: Number(attempt.unsure) || 0,
                wrong: Number(attempt.wrong) || 0,
                firstResult: attempt.firstResult || null,
                finalResult: entry.word.study?.lastResult || attempt.firstResult || null,
                kind: initial?.isNew ? 'new' : 'review'
            });
        });
        const record = {
            id: `${current.startedAt || completedAt}-${completedAt}-${Math.random().toString(36).slice(2, 8)}`,
            startedAt: current.startedAt || completedAt,
            completedAt,
            finished: !!current.finished,
            label: String(current.label || '学習'),
            initialCount: Number(current.initialCount) || 0,
            round: Number(current.round) || 1,
            stats: { ...current.stats },
            newCount: words.filter(item => item.kind === 'new').length,
            reviewCount: words.filter(item => item.kind !== 'new').length,
            uniqueCount: words.length,
            words
        };
        studyHistoryCache.unshift(record);
        studyHistoryCache = studyHistoryCache.slice(0, STUDY_HISTORY_LIMIT);
        await persistStudyHistory();
        window.dispatchEvent(new CustomEvent('smartreader:study-history-updated', { detail: record }));
    }

    function escapeHtml(value) {
""", 'history helpers')

text = replace_once(text,
"""        flushSave();
        session = null;
""",
"""        flushSave();
        void recordStudySession(session);
        session = null;
""", 'record on close')

text = replace_once(text,
"""        session = {
            label: label || '学習',
            initialEntries: [...selected],
            initialCount: selected.length,
""",
"""        session = {
            label: label || '学習',
            startedAt: Date.now(),
            initialEntries: [...selected],
            initialStates: new Map(selected.map(entry => {
                const view = studyView(entry.word);
                return [entry.key, { isNew: view.isNew, due: view.due, difficult: view.difficult, level: view.study.level }];
            })),
            initialCount: selected.length,
""", 'session initial state')

text = replace_once(text,
"""        refreshStudySurfaces();

        window.SmartReaderStudy = {
""",
"""        refreshStudySurfaces();
        void ensureStudyHistoryLoaded();

        window.SmartReaderStudy = {
""", 'load history on init')

text = replace_once(text,
"""            getWordView: word => studyView(word),
            refresh: refreshStudySurfaces
""",
"""            getWordView: word => studyView(word),
            getHistory: () => studyHistoryCache.map(item => ({ ...item, stats: { ...(item.stats || {}) }, words: Array.isArray(item.words) ? item.words.map(word => ({ ...word })) : [] })),
            loadHistory: () => ensureStudyHistoryLoaded(),
            isHistoryLoaded: () => studyHistoryLoaded,
            refresh: refreshStudySurfaces
""", 'history api')
path.write_text(text)

# --- Study Center history + stats UI ---
path = Path('study-center.js')
text = path.read_text()

text = replace_once(text,
"""    function renderPlaceholder(kind) {
        const isHistory = kind === 'history';
        return `
            <section class="study-center-placeholder">
                <div class="study-center-placeholder-icon">${isHistory ? '↺' : '⌁'}</div>
                <h2>${isHistory ? '学習履歴' : '統計'}</h2>
                <p>${isHistory
                    ? 'ここには、日ごとの学習語数・新規/復習の内訳・その日に解いた単語を表示できるようにします。'
                    : 'ここには、正答率・学習量・苦手克服・期限超過・連続学習などをまとめる予定です。'}</p>
                <span>画面の土台だけ先に用意しています</span>
            </section>
        `;
    }
""",
"""    function historySessions() {
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
            const height = Math.max(day.count ? 10 : 2, Math.round((day.count / max) * 68));
            return `<div><strong>${day.count}</strong><span class="bar"><i style="height:${height}px"></i></span><small>${date.getMonth() + 1}/${date.getDate()}</small></div>`;
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
""", 'history and stats renderers')

text = replace_once(text,
"""        else if (activeTab === 'words') content.innerHTML = renderWords(model);
        else content.innerHTML = renderPlaceholder(activeTab);
""",
"""        else if (activeTab === 'words') content.innerHTML = renderWords(model);
        else if (activeTab === 'history') content.innerHTML = renderHistory();
        else if (activeTab === 'stats') content.innerHTML = renderStats(model);
""", 'render history stats')

text = replace_once(text,
"""        section.style.display = 'block';
        render();
""",
"""        section.style.display = 'block';
        render();
        const historyLoad = window.SmartReaderStudy?.loadHistory?.();
        if (historyLoad && typeof historyLoad.then === 'function') {
            historyLoad.then(() => {
                if (section.style.display !== 'none' && (activeTab === 'history' || activeTab === 'stats' || activeTab === 'home')) render();
            });
        }
""", 'load history on show')

text = replace_once(text,
"""        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) updateNavBadge();
        });
""",
"""        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) updateNavBadge();
        });
        window.addEventListener('smartreader:study-history-updated', () => {
            if (document.getElementById(SECTION_ID)?.style.display !== 'none') render();
        });
""", 'history event refresh')
path.write_text(text)

# --- Study Center history/stats CSS ---
path = Path('study-center.css')
css = path.read_text()
addition = """
.study-center-history-day{margin-bottom:22px}.study-center-history-day-heading{display:flex;justify-content:space-between;align-items:end;margin-bottom:8px}.study-center-history-day-heading h3{margin:0}.study-center-history-day-heading span{color:#78828d;font-size:.82rem}.study-center-history-session{border:1px solid #e2e7ee;border-radius:13px;background:#fff;margin:8px 0;overflow:hidden}.study-center-history-session summary{list-style:none;cursor:pointer;padding:13px 14px;display:flex;justify-content:space-between;gap:14px;align-items:center}.study-center-history-session summary::-webkit-details-marker{display:none}.study-center-history-session summary>div{display:flex;flex-direction:column;gap:3px}.study-center-history-session summary span{font-size:.78rem;color:#78828d}.study-center-history-numbers{align-items:flex-end!important}.study-center-history-breakdown{display:flex;flex-wrap:wrap;gap:7px;padding:10px 14px;border-top:1px solid #edf0f4;background:#f8fafc}.study-center-history-breakdown span{padding:4px 8px;border-radius:999px;background:#fff;border:1px solid #e3e8ee;font-size:.76rem}.study-center-history-words{padding:5px 14px 12px}.study-center-history-words>div{display:grid;grid-template-columns:minmax(90px,1fr) minmax(110px,2fr) 28px;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid #f0f2f5}.study-center-history-words>div:last-child{border-bottom:0}.study-center-history-words span{font-size:.82rem;color:#66727d}.study-center-history-words b{text-align:center;font-size:1rem}.study-center-history-words .result-known{color:#27824e}.study-center-history-words .result-wrong{color:#b94747}.study-center-history-words .result-unsure{color:#7d6b55}.study-center-stat-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px}.study-center-stat-grid>div{padding:14px;border:1px solid #e1e6ed;border-radius:13px;background:#fff}.study-center-stat-grid span,.study-center-stat-grid small{display:block;color:#78828d}.study-center-stat-grid strong{display:block;font-size:1.75rem;margin:3px 0;color:#2f3841}.study-center-activity-bars{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px;align-items:end;height:112px}.study-center-activity-bars>div{height:100%;display:grid;grid-template-rows:18px 1fr 18px;gap:3px;text-align:center}.study-center-activity-bars strong,.study-center-activity-bars small{font-size:.7rem;color:#77828d}.study-center-activity-bars .bar{display:flex;align-items:end;justify-content:center;border-radius:8px;background:#f2f4f7;overflow:hidden}.study-center-activity-bars i{display:block;width:70%;border-radius:6px 6px 0 0;background:#8796a8}.study-center-current-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.study-center-current-stats span{padding:10px;border-radius:10px;background:#f7f9fb;color:#687480;font-size:.82rem}.study-center-current-stats b{display:block;margin-top:3px;font-size:1.35rem;color:#303941}@media(max-width:700px){.study-center-history-session summary{align-items:flex-start}.study-center-history-numbers{min-width:72px}.study-center-stat-grid{grid-template-columns:1fr 1fr}.study-center-current-stats{grid-template-columns:1fr 1fr}.study-center-history-words>div{grid-template-columns:minmax(78px,1fr) minmax(90px,1.5fr) 24px}}
"""
if '.study-center-history-day{' not in css:
    css += addition
path.write_text(css)

# Cache versions
path = Path('index.html')
html = path.read_text()
html = html.replace('flashcard-study.js?v=1.5', 'flashcard-study.js?v=1.6', 1)
html = html.replace('study-center.css?v=2', 'study-center.css?v=3', 1)
html = html.replace('study-center.js?v=2', 'study-center.js?v=3', 1)
path.write_text(html)

path = Path('STUDY_CENTER_PLAN.md')
plan = path.read_text()
if '## Phase 3' not in plan:
    plan += """

## Phase 3
- カード学習セッション終了時に `study_history_v1` として履歴を保存する。
- 履歴タブで日別・セッション別・単語別の結果を確認できる。
- 統計タブで7日/30日の学習量、正解率、連続学習、現在の苦手/保留/復習状況を確認できる。
- 履歴はLocalForageに保存するため既存バックアップの全key走査にも含まれる。
"""
path.write_text(plan)
