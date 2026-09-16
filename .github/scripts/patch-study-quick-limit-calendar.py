from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing target: {label}')
    return text.replace(old, new, 1)

js_path = Path('study-center.js')
js = js_path.read_text()

js = replace_once(
    js,
    """    const DAY_MS = 86400000;\n    let activeTab = 'home';\n    let wordFilter = 'all';\n    let originalHideAllSections = null;\n\n""",
    """    const DAY_MS = 86400000;\n    const SETTINGS_KEY = 'smart-reader-study-center-settings-v1';\n    const DEFAULT_QUICK_REVIEW_LIMIT = 20;\n    let activeTab = 'home';\n    let wordFilter = 'all';\n    let originalHideAllSections = null;\n    let activityCalendarMonth = null;\n    let studyCenterSettings = loadStudyCenterSettings();\n\n    function normalizeQuickReviewLimit(value) {\n        const number = Math.round(Number(value));\n        if (!Number.isFinite(number)) return DEFAULT_QUICK_REVIEW_LIMIT;\n        return Math.max(1, Math.min(999, number));\n    }\n\n    function loadStudyCenterSettings() {\n        try {\n            const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');\n            return { quickReviewLimit: normalizeQuickReviewLimit(raw.quickReviewLimit) };\n        } catch (_) {\n            return { quickReviewLimit: DEFAULT_QUICK_REVIEW_LIMIT };\n        }\n    }\n\n    function saveStudyCenterSettings() {\n        try {\n            localStorage.setItem(SETTINGS_KEY, JSON.stringify(studyCenterSettings));\n        } catch (error) {\n            console.warn('Study Center settings could not be saved', error);\n        }\n    }\n\n    function setQuickReviewLimit(value) {\n        studyCenterSettings = { ...studyCenterSettings, quickReviewLimit: normalizeQuickReviewLimit(value) };\n        saveStudyCenterSettings();\n    }\n\n""",
    'settings state'
)

js = replace_once(
    js,
    """    function renderHome(model) {\n        const dueCount = model.dueNow.length;\n        const urgentCount = model.urgent.length;\n""",
    """    function renderHome(model) {\n        const dueCount = model.dueNow.length;\n        const urgentCount = model.urgent.length;\n        const quickLimit = studyCenterSettings.quickReviewLimit;\n""",
    'home quick limit variable'
)

js = replace_once(
    js,
    """                    <div class=\"study-center-start-actions\">\n                        <button type=\"button\" data-study-limit=\"10\" ${dueCount ? '' : 'disabled'}>10語だけ</button>\n                        <button type=\"button\" data-study-limit=\"20\" ${dueCount ? '' : 'disabled'}>20語</button>\n                        <button type=\"button\" class=\"primary\" data-study-limit=\"all\" ${dueCount ? '' : 'disabled'}>全部 ${dueCount}語</button>\n                    </div>\n""",
    """                    <div class=\"study-center-start-actions\">\n                        <button type=\"button\" data-study-limit=\"10\" ${dueCount ? '' : 'disabled'}>10語だけ</button>\n                        <div class=\"study-center-quick-custom\">\n                            <button type=\"button\" data-study-limit=\"custom\" ${dueCount ? '' : 'disabled'}>${quickLimit}語</button>\n                            <button type=\"button\" class=\"study-center-limit-edit\" data-edit-study-limit aria-label=\"クイック復習の語数を変更\">変更</button>\n                        </div>\n                        <button type=\"button\" class=\"primary\" data-study-limit=\"all\" ${dueCount ? '' : 'disabled'}>全部 ${dueCount}語</button>\n                    </div>\n""",
    'home quick limit controls'
)

calendar_anchor = """    function renderStats(model) {\n"""
calendar_code = r'''    function startOfLocalMonth(timestamp = Date.now()) {
        const date = new Date(Number(timestamp) || Date.now());
        return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
    }

    function shiftLocalMonth(timestamp, delta) {
        const date = new Date(startOfLocalMonth(timestamp));
        return new Date(date.getFullYear(), date.getMonth() + Number(delta || 0), 1).getTime();
    }

    function activityMonthModel(sessions, monthTimestamp) {
        const start = startOfLocalMonth(monthTimestamp);
        const end = shiftLocalMonth(start, 1);
        const date = new Date(start);
        const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        const days = Array.from({ length: daysInMonth }, (_, index) => ({
            day: index + 1,
            words: 0,
            responses: 0,
            sessions: 0
        }));
        (sessions || []).forEach(session => {
            const stamp = Number(session.completedAt || session.startedAt) || 0;
            if (stamp < start || stamp >= end) return;
            const day = new Date(stamp).getDate();
            const item = days[day - 1];
            if (!item) return;
            item.words += Number(session.uniqueCount) || 0;
            item.responses += Number(session.stats?.responses) || 0;
            item.sessions += 1;
        });
        const totalWords = days.reduce((sum, item) => sum + item.words, 0);
        const totalResponses = days.reduce((sum, item) => sum + item.responses, 0);
        const activeDays = days.filter(item => item.sessions > 0).length;
        const maxWords = Math.max(1, ...days.map(item => item.words));
        return { start, end, days, totalWords, totalResponses, activeDays, maxWords };
    }

    function activityMonthLabel(timestamp) {
        return new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' }).format(new Date(startOfLocalMonth(timestamp)));
    }

    function renderActivityCalendar() {
        const overlay = document.getElementById('study-activity-calendar-overlay');
        const body = overlay?.querySelector('[data-activity-calendar-body]');
        if (!overlay || !body) return;
        const sessions = historySessions();
        const currentMonth = startOfLocalMonth();
        if (!Number.isFinite(Number(activityCalendarMonth))) activityCalendarMonth = currentMonth;
        activityCalendarMonth = Math.min(startOfLocalMonth(activityCalendarMonth), currentMonth);
        const model = activityMonthModel(sessions, activityCalendarMonth);
        const firstWeekday = new Date(model.start).getDay();
        const todayKey = localDateKey(Date.now());
        const cells = [];
        for (let index = 0; index < firstWeekday; index += 1) {
            cells.push('<div class="study-center-calendar-day is-empty" aria-hidden="true"></div>');
        }
        model.days.forEach(item => {
            const stamp = new Date(new Date(model.start).getFullYear(), new Date(model.start).getMonth(), item.day).getTime();
            const isToday = localDateKey(stamp) === todayKey;
            const level = item.words ? Math.max(1, Math.min(4, Math.ceil(item.words / model.maxWords * 4))) : 0;
            cells.push(`
                <div class="study-center-calendar-day ${isToday ? 'is-today' : ''}" data-level="${level}" title="${item.words}語・${item.responses}回答・${item.sessions}セッション">
                    <span>${item.day}</span>
                    <strong>${item.words ? `${item.words}語` : '—'}</strong>
                    <small>${item.responses ? `${item.responses}回答` : ''}</small>
                </div>
            `);
        });
        while (cells.length % 7) cells.push('<div class="study-center-calendar-day is-empty" aria-hidden="true"></div>');
        body.innerHTML = `
            <div class="study-center-calendar-head">
                <button type="button" data-activity-month="-1" aria-label="前の月">‹</button>
                <div><strong>${escapeHtml(activityMonthLabel(activityCalendarMonth))}</strong><span>${model.activeDays}日学習・合計 ${model.totalWords}語</span></div>
                <button type="button" data-activity-month="1" aria-label="次の月" ${activityCalendarMonth >= currentMonth ? 'disabled' : ''}>›</button>
            </div>
            <div class="study-center-calendar-weekdays" aria-hidden="true"><span>日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span></div>
            <div class="study-center-calendar-grid">${cells.join('')}</div>
            <div class="study-center-calendar-summary"><span>学習日 <b>${model.activeDays}</b>日</span><span>学習した語 <b>${model.totalWords}</b>語</span><span>回答 <b>${model.totalResponses}</b>回</span></div>
        `;
    }

    function openActivityCalendar() {
        const overlay = document.getElementById('study-activity-calendar-overlay');
        if (!overlay) return;
        activityCalendarMonth = startOfLocalMonth(activityCalendarMonth || Date.now());
        renderActivityCalendar();
        overlay.hidden = false;
        overlay.setAttribute('aria-hidden', 'false');
        document.body.classList.add('study-center-calendar-open');
    }

    function closeActivityCalendar() {
        const overlay = document.getElementById('study-activity-calendar-overlay');
        if (!overlay) return;
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('study-center-calendar-open');
    }

    function injectActivityCalendar() {
        if (document.getElementById('study-activity-calendar-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'study-activity-calendar-overlay';
        overlay.className = 'study-center-calendar-overlay';
        overlay.hidden = true;
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = `
            <section class="study-center-calendar-modal" role="dialog" aria-modal="true" aria-label="学習Activity詳細">
                <div class="study-center-calendar-titlebar"><div><span class="study-center-eyebrow">ACTIVITY</span><h2>学習カレンダー</h2></div><button type="button" data-activity-calendar-close aria-label="閉じる">×</button></div>
                <div data-activity-calendar-body></div>
            </section>
        `;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', event => {
            if (event.target === overlay || event.target.closest('[data-activity-calendar-close]')) {
                closeActivityCalendar();
                return;
            }
            const move = event.target.closest('[data-activity-month]');
            if (move && !move.disabled) {
                activityCalendarMonth = shiftLocalMonth(activityCalendarMonth || Date.now(), Number(move.dataset.activityMonth));
                renderActivityCalendar();
            }
        });
    }

'''
js = replace_once(js, calendar_anchor, calendar_code + calendar_anchor, 'activity calendar functions')

js = replace_once(
    js,
    """                <div class=\"study-center-panel\">\n                    <div class=\"study-center-panel-heading\"><div><span class=\"study-center-eyebrow\">ACTIVITY</span><h3>直近7日間</h3></div></div>\n                    ${renderStudyActivityBars(sessions)}\n                </div>\n""",
    """                <div class=\"study-center-panel\">\n                    <div class=\"study-center-panel-heading\"><div><span class=\"study-center-eyebrow\">ACTIVITY</span><h3>直近7日間</h3></div><button type=\"button\" class=\"study-center-link\" data-open-activity-calendar>詳細</button></div>\n                    ${renderStudyActivityBars(sessions)}\n                </div>\n""",
    'stats activity detail button'
)

js = replace_once(
    js,
    """            const limitButton = event.target.closest('[data-study-limit]');\n            if (limitButton) {\n                const model = reviewModel();\n                const limit = limitButton.dataset.studyLimit === 'all' ? model.dueNow.length : Number(limitButton.dataset.studyLimit);\n                openStudy(model.dueNow.slice(0, limit), `今日の復習 · ${Math.min(limit, model.dueNow.length)}語`);\n                return;\n            }\n\n""",
    """            const editLimit = event.target.closest('[data-edit-study-limit]');\n            if (editLimit) {\n                const current = studyCenterSettings.quickReviewLimit;\n                const next = window.prompt('クイック復習の語数を入力してください（1〜999）', String(current));\n                if (next === null) return;\n                const parsed = Math.round(Number(next));\n                if (!Number.isFinite(parsed) || parsed < 1 || parsed > 999) {\n                    window.alert('1〜999の数字を入力してください。');\n                    return;\n                }\n                setQuickReviewLimit(parsed);\n                render();\n                return;\n            }\n\n            const limitButton = event.target.closest('[data-study-limit]');\n            if (limitButton) {\n                const model = reviewModel();\n                const mode = limitButton.dataset.studyLimit;\n                const limit = mode === 'all'\n                    ? model.dueNow.length\n                    : (mode === 'custom' ? studyCenterSettings.quickReviewLimit : Number(mode));\n                openStudy(model.dueNow.slice(0, limit), `今日の復習 · ${Math.min(limit, model.dueNow.length)}語`);\n                return;\n            }\n\n            if (event.target.closest('[data-open-activity-calendar]')) {\n                openActivityCalendar();\n                return;\n            }\n\n""",
    'quick limit and activity events'
)

js = replace_once(
    js,
    """        document.addEventListener('visibilitychange', () => {\n            if (!document.hidden) updateNavBadge();\n        });\n""",
    """        document.addEventListener('visibilitychange', () => {\n            if (!document.hidden) updateNavBadge();\n        });\n        document.addEventListener('keydown', event => {\n            if (event.key === 'Escape' && !document.getElementById('study-activity-calendar-overlay')?.hidden) closeActivityCalendar();\n        });\n""",
    'calendar escape event'
)

js = replace_once(
    js,
    """        injectSection();\n        injectNavigation();\n        bindEvents();\n""",
    """        injectSection();\n        injectNavigation();\n        injectActivityCalendar();\n        bindEvents();\n""",
    'calendar init'
)

js = replace_once(
    js,
    """            show: showStudyCenter,\n            refresh: render,\n            getReviewModel: reviewModel\n""",
    """            show: showStudyCenter,\n            refresh: render,\n            getReviewModel: reviewModel,\n            openActivityCalendar,\n            getSettings: () => ({ ...studyCenterSettings })\n""",
    'study center exports'
)

js_path.write_text(js)

css_path = Path('study-center.css')
css = css_path.read_text()
css += r'''

.study-center-quick-custom{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:4px}.study-center-quick-custom>button:first-child{width:100%}.study-center-limit-edit{padding:8px 7px!important;font-size:.68rem!important;color:#8a7868!important;background:#f8f4f0!important}.study-center-calendar-open{overflow:hidden}.study-center-calendar-overlay{position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(30,26,22,.42);backdrop-filter:blur(5px)}.study-center-calendar-overlay[hidden]{display:none!important}.study-center-calendar-modal{width:min(560px,100%);max-height:min(86dvh,760px);overflow:auto;padding:20px;border:1px solid #dfd4ca;border-radius:22px;background:#fbf8f5;box-shadow:0 24px 70px rgba(36,29,23,.22);overscroll-behavior:contain}.study-center-calendar-titlebar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}.study-center-calendar-titlebar h2{margin:2px 0 0;font-size:1.35rem}.study-center-calendar-titlebar>button{width:38px;height:38px;border:1px solid #ddd2c8;border-radius:50%;background:#fff;color:#65594f;font-size:1.45rem;line-height:1;cursor:pointer}.study-center-calendar-head{display:grid;grid-template-columns:38px 1fr 38px;gap:10px;align-items:center;margin-bottom:10px}.study-center-calendar-head>button{height:36px;border:1px solid #e1d7ce;border-radius:10px;background:#fff;color:#66594e;font-size:1.4rem;cursor:pointer}.study-center-calendar-head>button:disabled{opacity:.3;cursor:default}.study-center-calendar-head>div{text-align:center}.study-center-calendar-head strong{display:block;font-size:1.05rem}.study-center-calendar-head span{display:block;margin-top:2px;color:#8b7e72;font-size:.72rem}.study-center-calendar-weekdays,.study-center-calendar-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.study-center-calendar-weekdays{margin-bottom:5px;text-align:center;color:#9a8c80;font-size:.68rem;font-weight:800}.study-center-calendar-day{min-height:68px;padding:7px 6px;border:1px solid #ece4dc;border-radius:11px;background:#fff;display:flex;flex-direction:column;align-items:flex-start;gap:3px}.study-center-calendar-day.is-empty{border-color:transparent;background:transparent}.study-center-calendar-day>span{font-size:.72rem;color:#7d7166}.study-center-calendar-day>strong{margin-top:auto;font-size:.82rem;color:#4d433b}.study-center-calendar-day>small{min-height:1em;color:#8c8075;font-size:.58rem}.study-center-calendar-day[data-level="1"]{background:#f3eee9}.study-center-calendar-day[data-level="2"]{background:#e9ded4}.study-center-calendar-day[data-level="3"]{background:#d9c6b5}.study-center-calendar-day[data-level="4"]{background:#b99b82}.study-center-calendar-day[data-level="4"] span,.study-center-calendar-day[data-level="4"] strong,.study-center-calendar-day[data-level="4"] small{color:#fff}.study-center-calendar-day.is-today{outline:2px solid #80654f;outline-offset:1px}.study-center-calendar-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:12px}.study-center-calendar-summary span{padding:9px 8px;border-radius:10px;background:#fff;color:#817469;font-size:.7rem;text-align:center}.study-center-calendar-summary b{display:inline;color:#3f352d;font-size:.9rem}@media(max-width:700px){.study-center-quick-custom{min-width:0}.study-center-limit-edit{padding:7px 5px!important}.study-center-calendar-overlay{align-items:flex-end;padding:10px}.study-center-calendar-modal{width:100%;max-height:88dvh;padding:16px 13px calc(16px + env(safe-area-inset-bottom));border-radius:20px 20px 14px 14px}.study-center-calendar-day{min-height:55px;padding:5px 4px;border-radius:9px}.study-center-calendar-day>span{font-size:.64rem}.study-center-calendar-day>strong{font-size:.69rem}.study-center-calendar-day>small{font-size:.5rem}.study-center-calendar-weekdays,.study-center-calendar-grid{gap:4px}.study-center-calendar-summary span{padding:8px 4px;font-size:.62rem}}@media(max-width:390px){.study-center-start-actions{grid-template-columns:1fr 1.15fr}.study-center-quick-custom{grid-template-columns:minmax(0,1fr) auto}.study-center-start-actions>.primary{grid-column:1/-1}.study-center-calendar-day{min-height:50px}.study-center-calendar-summary{gap:4px}}
'''
css_path.write_text(css)

index_path = Path('index.html')
index = index_path.read_text()
index = replace_once(index, 'study-center.css?v=9', 'study-center.css?v=10', 'study center css cache version')
index = replace_once(index, 'study-center.js?v=10', 'study-center.js?v=11', 'study center js cache version')
index_path.write_text(index)
