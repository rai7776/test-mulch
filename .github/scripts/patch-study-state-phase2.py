from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'anchor not found: {label}')
    return text.replace(old, new, 1)

# --- flashcard study engine ---
path = Path('flashcard-study.js')
text = path.read_text()

text = replace_once(text,
"""            lastSessionFirstResult: null,
            lastSessionCompletedAt: null
""",
"""            lastSessionFirstResult: null,
            lastSessionCompletedAt: null,
            suspended: false,
            suspendedAt: null,
            manualMasteredAt: null
""", 'study defaults')

text = replace_once(text,
"""        merged.lastReviewAt = optionalTimestamp(merged.lastReviewAt);
        merged.lastSessionCompletedAt = optionalTimestamp(merged.lastSessionCompletedAt);
        return merged;
""",
"""        merged.lastReviewAt = optionalTimestamp(merged.lastReviewAt);
        merged.lastSessionCompletedAt = optionalTimestamp(merged.lastSessionCompletedAt);
        merged.suspended = !!merged.suspended;
        merged.suspendedAt = optionalTimestamp(merged.suspendedAt);
        merged.manualMasteredAt = optionalTimestamp(merged.manualMasteredAt);
        return merged;
""", 'study normalization')

text = replace_once(text,
"""    function adaptiveIntervalDays(level, difficultyScore) {
""",
"""    function weaknessScore(study) {
        const seen = Math.max(0, Number(study?.seenCount) || 0);
        const known = Math.max(0, Number(study?.knownCount) || 0);
        const attempts = Math.max(0, Number(study?.lastSessionAttempts) || 0);
        const recentWrong = Math.max(0, Number(study?.lastSessionWrongCount) || 0);
        const recentUnsure = Math.max(0, Number(study?.lastSessionUnsureCount) || 0);
        const accuracy = seen ? known / seen : null;
        let score = (Number(study?.difficultyScore) || DEFAULT_DIFFICULTY) * 0.55;

        if (attempts) {
            score += Math.min(25, (recentWrong / attempts) * 25 + (recentUnsure / attempts) * 12);
        }
        const last = String(study?.lastReviewResult || study?.lastResult || '');
        if (last === 'wrong') score += 18;
        else if (last === 'unsure') score += 10;
        else if (last === 'known') score -= 8;

        score += Math.min(18, (Number(study?.lapseCount) || 0) * 6);
        if (accuracy !== null && seen >= 3 && accuracy < 0.7) score += (0.7 - accuracy) * 30;
        score -= Math.min(20, (Number(study?.correctStreak) || 0) * 4);
        return clampInteger(Math.round(score), 0, 100, DEFAULT_DIFFICULTY);
    }

    function adaptiveIntervalDays(level, difficultyScore) {
""", 'weakness score helper')

old_view = """        const due = next !== null && next < tomorrow;
        const mastered = !!word?.memorized || study.level >= 4;
        const learning = !isNew && !mastered;
        const accuracy = study.seenCount ? study.knownCount / study.seenCount : null;
        const difficult = study.difficultyScore >= 65
            || study.lapseCount >= 2
            || study.wrongCount >= 4
            || study.lastReviewResult === 'wrong'
            || (study.seenCount >= 4 && accuracy !== null && accuracy < 0.5);
        return { study, isNew, overdue, dueToday, due, mastered, learning, difficult, accuracy };
"""
new_view = """        const due = next !== null && next < tomorrow;
        const suspended = !!study.suspended;
        const manualMastered = !!study.manualMasteredAt && !!word?.memorized;
        const mastered = manualMastered || !!word?.memorized || study.level >= 4;
        const learning = !suspended && !isNew && !mastered;
        const accuracy = study.seenCount ? study.knownCount / study.seenCount : null;
        const weakScore = weaknessScore(study);
        const difficult = !suspended && !manualMastered && weakScore >= 65;
        return { study, isNew, overdue, dueToday, due, mastered, manualMastered, suspended, learning, difficult, weaknessScore: weakScore, accuracy };
"""
text = replace_once(text, old_view, new_view, 'study view')

text = replace_once(text,
"""            if (!entry?.word || seen.has(entry.key)) return false;
""",
"""            if (!entry?.word || studyView(entry.word).suspended || seen.has(entry.key)) return false;
""", 'dedupe suspended')

text = replace_once(text,
"""        (entries || []).forEach(entry => {
            const view = studyView(entry.word);
            summary.total += 1;
""",
"""        (entries || []).forEach(entry => {
            const view = studyView(entry.word);
            if (view.suspended || view.manualMastered) return;
            summary.total += 1;
""", 'summary suspended')

text = replace_once(text,
"""    function selectTodayEntries() {
        const all = getAllStudyEntries();
""",
"""    function selectTodayEntries() {
        const all = getAllStudyEntries().filter(entry => {
            const view = studyView(entry.word);
            return !view.suspended && !view.manualMastered;
        });
""", 'today active entries')

text = replace_once(text,
"""    function selectPreset(mode) {
        const all = getAllStudyEntries();
""",
"""    function selectPreset(mode) {
        const all = getAllStudyEntries().filter(entry => {
            const view = studyView(entry.word);
            return !view.suspended && !view.manualMastered;
        });
""", 'preset active entries')

text = replace_once(text,
"""        const attempt = sessionAttemptState(entry.key);

        attempt.responses += 1;
""",
"""        const attempt = sessionAttemptState(entry.key);

        if (result === 'wrong' && study.manualMasteredAt) {
            study.manualMasteredAt = null;
            word.memorized = false;
        }

        attempt.responses += 1;
""", 'manual mastery failure')

path.write_text(text)

# --- Study Center UI/state ---
path = Path('study-center.js')
text = path.read_text()

text = replace_once(text,
"""            lastReviewResult: raw.lastReviewResult || null,
            lapseCount: Number(raw.lapseCount) || 0
""",
"""            lastReviewResult: raw.lastReviewResult || null,
            lapseCount: Number(raw.lapseCount) || 0,
            lastSessionAttempts: Number(raw.lastSessionAttempts) || 0,
            lastSessionWrongCount: Number(raw.lastSessionWrongCount) || 0,
            lastSessionUnsureCount: Number(raw.lastSessionUnsureCount) || 0,
            suspended: !!raw.suspended,
            suspendedAt: Number.isFinite(Number(raw.suspendedAt)) ? Number(raw.suspendedAt) : null,
            manualMasteredAt: Number.isFinite(Number(raw.manualMasteredAt)) ? Number(raw.manualMasteredAt) : null
""", 'center fallback study')

old_fallback_view = """        const due = next !== null && next < tomorrow;
        const mastered = !!word?.memorized || study.level >= 4;
        const difficult = study.difficultyScore >= 65 || study.lapseCount >= 2 || study.wrongCount >= 4;
        return { study, isNew, overdue, dueToday, due, mastered, difficult };
"""
new_fallback_view = """        const due = next !== null && next < tomorrow;
        const suspended = !!study.suspended;
        const manualMastered = !!study.manualMasteredAt && !!word?.memorized;
        const mastered = manualMastered || !!word?.memorized || study.level >= 4;
        const accuracy = study.seenCount ? study.knownCount / study.seenCount : null;
        const weakScore = localWeaknessScore(study);
        const difficult = !suspended && !manualMastered && weakScore >= 65;
        return { study, isNew, overdue, dueToday, due, mastered, manualMastered, suspended, difficult, weaknessScore: weakScore, accuracy };
"""
text = replace_once(text, old_fallback_view, new_fallback_view, 'center fallback view')

text = replace_once(text,
"""    function wordView(word) {
""",
"""    function localWeaknessScore(study) {
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
""", 'center weakness helper')

text = replace_once(text,
"""    function isUnresolved(view) {
        if (!view?.due) return false;
""",
"""    function isUnresolved(view) {
        if (!view?.due || view?.suspended || view?.manualMastered) return false;
""", 'unresolved guards')

text = replace_once(text,
"""        score += (Number(view.study?.difficultyScore) || 0) * 10;
""",
"""        score += (Number(view.weaknessScore ?? view.study?.difficultyScore) || 0) * 10;
""", 'priority weakness')

text = replace_once(text,
"""        const mastered = [];

        entries.forEach(entry => {
            const view = wordView(entry.word);
            const next = view.study?.nextReviewAt;
            if (view.isNew) newWords.push(entry);
            if (view.difficult) difficult.push(entry);
            if (view.mastered) mastered.push(entry);

            if (isUnresolved(view)) {
""",
"""        const mastered = [];
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
""", 'review held/manual split')

text = replace_once(text,
"""            mastered: sorted(mastered),
            today,
""",
"""            mastered: sorted(mastered),
            held: sorted(held),
            today,
""", 'review held return')

text = replace_once(text,
"""    function dueLabel(entry) {
        const view = wordView(entry.word);
        if (isUnresolved(view)) return { text: '未解決', tone: 'danger' };
""",
"""    function dueLabel(entry) {
        const view = wordView(entry.word);
        if (view.suspended) return { text: '保留', tone: 'held' };
        if (view.manualMastered) return { text: '手動✓', tone: 'mastered' };
        if (isUnresolved(view)) return { text: '未解決', tone: 'danger' };
""", 'due held/manual labels')

text = replace_once(text,
"""    function recentResult(view) {
""",
"""    function weaknessReason(view) {
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
""", 'weakness reason')

old_card = """    function wordCard(entry) {
        const view = wordView(entry.word);
        const due = dueLabel(entry);
        const difficulty = Math.round(Number(view.study?.difficultyScore) || 0);
        const source = `${entry.articleTitle}${entry.chapterTitle ? ` / ${entry.chapterTitle}` : ''}`;
        return `
            <article class="study-center-word-card">
                <div class="study-center-word-main">
                    <div class="study-center-word-title-row">
                        <strong>${escapeHtml(entry.word.word || entry.word.surfaceText || '—')}</strong>
                        <span class="study-center-due-badge ${due.tone}">${escapeHtml(due.text)}</span>
                    </div>
                    <div class="study-center-word-meaning">${escapeHtml(entry.word.meaning || '')}</div>
                    <div class="study-center-word-meta">
                        <span>苦手度 ${difficulty}</span>
                        <span>前回 ${recentResult(view)}</span>
                        <span>✕${Number(view.study?.wrongCount) || 0}</span>
                    </div>
                    <small>${escapeHtml(source)}</small>
                </div>
                <button type="button" class="study-center-mini-study" data-study-one="${escapeHtml(entry.key)}">復習</button>
            </article>
        `;
    }
"""
new_card = """    function wordCard(entry) {
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
                    <div class="study-center-word-meaning">${escapeHtml(entry.word.meaning || '')}</div>
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
"""
text = replace_once(text, old_card, new_card, 'word card controls')

text = replace_once(text,
"""        if (wordFilter === 'mastered') return model.mastered;
        if (wordFilter === 'due') return model.dueNow;
""",
"""        if (wordFilter === 'mastered') return model.mastered;
        if (wordFilter === 'held') return model.held;
        if (wordFilter === 'due') return model.dueNow;
""", 'held filter entries')

text = replace_once(text,
"""            ['mastered', '暗記済み', model.mastered.length]
        ];
""",
"""            ['mastered', '暗記済み', model.mastered.length],
            ['held', '保留', model.held.length]
        ];
""", 'held filter button')

text = text.replace("""                    <button type=\"button\" disabled title=\"保留機能は次の段階で追加します\">保留 <span>—</span></button>\n""", "", 1)

text = replace_once(text,
"""    function openStudy(entries, label) {
""",
"""    function persistStudyChanges() {
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
""", 'state mutation helpers')

text = replace_once(text,
"""            const oneButton = event.target.closest('[data-study-one]');
""",
"""            const holdButton = event.target.closest('[data-toggle-hold]');
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
""", 'center action events')

path.write_text(text)

# --- folder study: do not offer held words; use central difficult definition ---
path = Path('folder-study-range.js')
text = path.read_text()
text = replace_once(text,
"""            const word = entry.word || {};
            const sourceId = articleId(entry);
""",
"""            const word = entry.word || {};
            if (word.study && typeof word.study === 'object' && word.study.suspended) return false;
            const sourceId = articleId(entry);
""", 'folder held exclusion')

text = replace_once(text,
"""        const stable = !!word.memorized || level >= 4 || correctStreak >= 3;
        const difficult = lastResult === 'wrong'
            || lastResult === 'unsure'
            || difficultyScore >= 65
            || lapseCount >= 1
            || (!stable && (wrongCount >= 1 || unsureCount >= 1));
        return difficult ? 'difficult' : 'known';
""",
"""        const centralView = window.SmartReaderStudy?.getWordView?.(word);
        if (centralView) return centralView.difficult ? 'difficult' : 'known';

        const stable = !!word.memorized || level >= 4 || correctStreak >= 3;
        const difficult = lastResult === 'wrong'
            || lastResult === 'unsure'
            || difficultyScore >= 65
            || lapseCount >= 1
            || (!stable && (wrongCount >= 1 || unsureCount >= 1));
        return difficult ? 'difficult' : 'known';
""", 'folder central difficulty')
path.write_text(text)

# --- CSS additions ---
path = Path('study-center.css')
css = path.read_text()
addition = """

.study-center-word-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}.study-center-hold-action,.study-center-master-action{border:1px solid #d8dee8;background:#fff;border-radius:10px;min-height:36px;padding:7px 10px;font-weight:700;color:#52606d}.study-center-hold-action.active{background:#f5f1e8;border-color:#c8ae7b;color:#7a5a20}.study-center-master-action{min-width:40px;font-size:17px}.study-center-master-action.active{background:#eaf7ef;border-color:#8bc9a0;color:#287a46}.study-center-word-card.is-held{opacity:.68;background:#faf8f4}.study-center-word-card.is-manual-mastered{background:#f7fbf8}.study-center-due-badge.held{background:#f1ece2;color:#775f36}.study-center-due-badge.mastered{background:#eaf7ef;color:#287a46}.study-center-word-meta span:nth-child(2){font-weight:700}@media(max-width:700px){.study-center-word-card{align-items:flex-start}.study-center-word-actions{flex-direction:column;gap:6px}.study-center-word-actions button{width:76px}.study-center-word-meta{gap:5px 9px}}
"""
if '.study-center-word-actions{' not in css:
    css += addition
path.write_text(css)

# --- cache versions ---
path = Path('index.html')
html = path.read_text()
html = html.replace('flashcard-study.js?v=1.4', 'flashcard-study.js?v=1.5', 1)
html = html.replace('study-center.css?v=1', 'study-center.css?v=2', 1)
html = html.replace('study-center.js?v=1', 'study-center.js?v=2', 1)
path.write_text(html)

# --- project plan update ---
path = Path('STUDY_CENTER_PLAN.md')
plan = path.read_text()
if '## Phase 2' not in plan:
    plan += """

## Phase 2
- 苦手度は累計だけでなく、直近セッション・前回判定・忘却・連続正解を重く見る。
- 保留は学習履歴を消さず、自動出題・復習予定から除外する。
- 手動✓は明示的な暗記済み扱い。明示的にカード学習して✕した場合は手動暗記済みを解除する。
- フォルダ学習の「苦手」判定も共通の学習エンジンを参照する。
"""
path.write_text(plan)
