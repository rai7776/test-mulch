from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'anchor not found: {label}')
    return text.replace(old, new, 1)


# --- flashcard-study.js ---
path = Path('flashcard-study.js')
text = path.read_text()

text = replace_once(text,
"""    let dragState = null;
    let pendingCommit = null;
""",
"""    let dragState = null;
    let pendingCommit = null;
    let feedbackTimer = null;
""", 'feedback timer state')

text = replace_once(text,
"""        const manualMasteredBeforeAnswer = !!study.manualMasteredAt && !!word.memorized;
        const attempt = sessionAttemptState(entry.key);
""",
"""        const manualMasteredBeforeAnswer = !!study.manualMasteredAt && !!word.memorized;
        const previousWeakness = weaknessScore(study);
        const wasDifficult = previousWeakness >= 65;
        const attempt = sessionAttemptState(entry.key);
""", 'previous weakness')

text = replace_once(text,
"""        word.study = study;
        return { firstEvaluation, previousLevel, nextLevel: study.level, promoted, demoted, lapse };
""",
"""        word.study = study;
        const nextWeakness = weaknessScore(study);
        const weaknessImprovement = Math.max(0, previousWeakness - nextWeakness);
        const difficultCleared = wasDifficult && nextWeakness < 65;
        return {
            firstEvaluation,
            previousLevel,
            nextLevel: study.level,
            promoted,
            demoted,
            lapse,
            previousWeakness,
            nextWeakness,
            weaknessImprovement,
            difficultCleared
        };
""", 'result feedback effect')

text = replace_once(text,
"""                stats: { ...session.stats },
                evaluated: [...session.evaluated],
                answeredUnique: [...session.answeredUnique],
                attempts: Array.from(session.attempts.entries()).map(([key, value]) => [key, { ...value }])
""",
"""                stats: { ...session.stats },
                evaluated: [...session.evaluated],
                answeredUnique: [...session.answeredUnique],
                weakImprovedKeys: [...session.weakImprovedKeys],
                weakClearedKeys: [...session.weakClearedKeys],
                attempts: Array.from(session.attempts.entries()).map(([key, value]) => [key, { ...value }])
""", 'snapshot feedback sets')

text = replace_once(text,
"""        session.stats = { ...snapshot.sessionState.stats };
        session.evaluated = new Set(snapshot.sessionState.evaluated);
        session.answeredUnique = new Set(snapshot.sessionState.answeredUnique);
        session.attempts = new Map((snapshot.sessionState.attempts || []).map(([key, value]) => [key, { ...value }]));
""",
"""        session.stats = { ...snapshot.sessionState.stats };
        session.evaluated = new Set(snapshot.sessionState.evaluated);
        session.answeredUnique = new Set(snapshot.sessionState.answeredUnique);
        session.weakImprovedKeys = new Set(snapshot.sessionState.weakImprovedKeys || []);
        session.weakClearedKeys = new Set(snapshot.sessionState.weakClearedKeys || []);
        session.attempts = new Map((snapshot.sessionState.attempts || []).map(([key, value]) => [key, { ...value }]));
""", 'restore feedback sets')

old_answer_stats = """        session.answeredUnique.add(entry.key);
        session.stats.responses += 1;
        session.stats[result] += 1;
        if (effect.promoted) session.stats.promoted += 1;
        if (effect.demoted) session.stats.demoted += 1;
        if (effect.lapse) session.stats.lapses += 1;
"""
new_answer_stats = """        session.answeredUnique.add(entry.key);
        session.stats.responses += 1;
        session.stats[result] += 1;
        if (result === 'known') {
            session.stats.currentStreak += 1;
            session.stats.bestStreak = Math.max(session.stats.bestStreak, session.stats.currentStreak);
        } else {
            session.stats.currentStreak = 0;
        }
        if (effect.promoted) session.stats.promoted += 1;
        if (effect.demoted) session.stats.demoted += 1;
        if (effect.lapse) session.stats.lapses += 1;
        if (result === 'known' && effect.weaknessImprovement >= 5 && !session.weakImprovedKeys.has(entry.key)) {
            session.weakImprovedKeys.add(entry.key);
            session.stats.weakImproved += 1;
        }
        if (result === 'known' && effect.difficultCleared && !session.weakClearedKeys.has(entry.key)) {
            session.weakClearedKeys.add(entry.key);
            session.stats.weakCleared += 1;
        }
        effect.streak = session.stats.currentStreak;
        effect.bestStreak = session.stats.bestStreak;
        effect.progressCount = session.answeredUnique.size;
"""
text = replace_once(text, old_answer_stats, new_answer_stats, 'session streak stats')

text = replace_once(text,
"""        if (!deferRender) {
            refreshStudySurfaces();
            renderSession();
        }
    }

    function undoLast() {
""",
"""        if (!deferRender) {
            refreshStudySurfaces();
            renderSession();
        }
        return effect;
    }

    function hideAnswerFeedback() {
        clearTimeout(feedbackTimer);
        feedbackTimer = null;
        const feedback = document.getElementById('study-answer-feedback');
        if (!feedback) return;
        feedback.classList.remove('show', 'known', 'unsure', 'wrong', 'special');
        feedback.innerHTML = '';
    }

    function showAnswerFeedback(result, effect = {}) {
        const feedback = document.getElementById('study-answer-feedback');
        if (!feedback || !session) return;
        clearTimeout(feedbackTimer);

        let title = result === 'known' ? '✓ Nice!' : result === 'unsure' ? '? もう一度' : '× もう一度';
        let detail = result === 'known' ? '' : '次の周でもう一度確認';
        let special = false;

        if (result === 'known' && effect.difficultCleared) {
            title = '✨ 苦手克服';
            detail = `苦手度 ${effect.previousWeakness} → ${effect.nextWeakness}`;
            special = true;
        } else if (result === 'known' && effect.weaknessImprovement >= 5) {
            title = '✓ 苦手度ダウン';
            detail = `${effect.previousWeakness} → ${effect.nextWeakness}`;
            special = true;
        } else if (result === 'known' && effect.streak >= 3) {
            title = `🔥 ${effect.streak} streak`;
            detail = effect.streak >= 10 ? '10連続正解！' : '連続正解';
            special = effect.streak >= 5;
        } else if (result === 'known' && effect.promoted) {
            title = '↑ Level up';
            detail = `Lv.${effect.previousLevel} → Lv.${effect.nextLevel}`;
            special = true;
        }

        if (effect.progressCount && effect.progressCount % 10 === 0) {
            detail = `${detail ? `${detail} · ` : ''}${effect.progressCount}語達成`;
            special = true;
        }

        feedback.className = `study-answer-feedback show ${result}${special ? ' special' : ''}`;
        feedback.innerHTML = `<strong>${escapeHtml(title)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ''}`;
        feedbackTimer = window.setTimeout(hideAnswerFeedback, special ? 950 : 620);
    }

    function undoLast() {
""", 'feedback functions')

text = replace_once(text,
"""    function undoLast() {
        if (!session) return;

        if (pendingCommit) {
""",
"""    function undoLast() {
        if (!session) return;
        hideAnswerFeedback();

        if (pendingCommit) {
""", 'hide feedback on undo')

text = replace_once(text,
"""    function closeSession(force = false) {
        if (!session) return;
""",
"""    function closeSession(force = false) {
        if (!session) return;
        hideAnswerFeedback();
""", 'hide feedback on close')

text = replace_once(text,
"""                <div class=\"study-card-studyline study-card-selectable\">Lv.${study.level} · 苦手度 ${escapeHtml(difficultyLabel(study.difficultyScore))} · ×${study.wrongCount} · 忘却${study.lapseCount} · 次回 ${escapeHtml(formatShortDate(study.nextReviewAt))}</div>
""",
"""                <div class=\"study-card-studyline study-card-selectable\">Lv.${study.level} · 苦手度 ${weaknessScore(study)} · ×${study.wrongCount} · 忘却${study.lapseCount} · 次回 ${escapeHtml(formatShortDate(study.nextReviewAt))}</div>
""", 'card weakness display')

text = replace_once(text,
"""        const undo = document.getElementById('study-session-undo');
        const source = document.getElementById('study-session-source');
        if (progress) progress.textContent = session?.finished ? `${session.initialCount}語` : `${Math.min(session.index + 1, session.queue.length)} / ${session.queue.length}`;
        if (round) round.textContent = `${session?.round || 1}周目`;
        if (undo) undo.disabled = !(session?.history.length || pendingCommit);
        if (source) source.textContent = entry ? `${entry.articleTitle}${entry.chapterTitle ? ` / ${entry.chapterTitle}` : ''}` : session?.label || '';
""",
"""        const undo = document.getElementById('study-session-undo');
        const source = document.getElementById('study-session-source');
        const streak = document.getElementById('study-session-streak');
        const fill = document.getElementById('study-session-progress-fill');
        if (progress) progress.textContent = session?.finished ? `${session.initialCount}語` : `${Math.min(session.index + 1, session.queue.length)} / ${session.queue.length}`;
        if (round) round.textContent = `${session?.round || 1}周目`;
        if (streak) {
            const current = Number(session?.stats?.currentStreak) || 0;
            streak.textContent = `🔥 ${current}`;
            streak.hidden = current < 2;
        }
        if (fill) {
            const completed = session?.initialCount ? Math.min(session.initialCount, session.answeredUnique.size) : 0;
            fill.style.width = `${session?.initialCount ? Math.round(completed / session.initialCount * 100) : 0}%`;
        }
        if (undo) undo.disabled = !(session?.history.length || pendingCommit);
        if (source) source.textContent = entry ? `${entry.articleTitle}${entry.chapterTitle ? ` / ${entry.chapterTitle}` : ''}` : session?.label || '';
""", 'session header streak progress')

text = replace_once(text,
"""                    <div><span>回答回数</span><strong>${session.stats.responses}</strong></div>
""",
"""                    <div><span>回答回数</span><strong>${session.stats.responses}</strong></div>
                    <div><span>最高連続正解</span><strong>🔥 ${session.stats.bestStreak}</strong></div>
                    <div><span>苦手改善</span><strong>${session.stats.weakImproved}</strong></div>
                    <div><span>苦手克服</span><strong>${session.stats.weakCleared}</strong></div>
""", 'summary feedback stats')

text = replace_once(text,
"""        answerCurrent(result, { deferRender: true });

        const timerId = window.setTimeout(() => {
""",
"""        const effect = answerCurrent(result, { deferRender: true });
        showAnswerFeedback(result, effect);
        renderSessionHeader();

        const timerId = window.setTimeout(() => {
""", 'commit feedback')

text = replace_once(text,
"""            attempts: new Map(),
            history: [],
            stats: { responses: 0, known: 0, unsure: 0, wrong: 0, promoted: 0, demoted: 0, lapses: 0 }
""",
"""            attempts: new Map(),
            history: [],
            weakImprovedKeys: new Set(),
            weakClearedKeys: new Set(),
            stats: {
                responses: 0,
                known: 0,
                unsure: 0,
                wrong: 0,
                promoted: 0,
                demoted: 0,
                lapses: 0,
                currentStreak: 0,
                bestStreak: 0,
                weakImproved: 0,
                weakCleared: 0
            }
""", 'session feedback init')

text = replace_once(text,
"""                        <div class=\"study-session-progress-wrap\"><strong id=\"study-session-progress\">1 / 1</strong><span id=\"study-session-round\">1周目</span></div>
                        <button type=\"button\" id=\"study-session-undo\" class=\"study-icon-action\" aria-label=\"直前の判定を戻す\">↶</button>
                    </header>
                    <div id=\"study-session-stage\" class=\"study-session-stage\"></div>
""",
"""                        <div class=\"study-session-progress-wrap\"><strong id=\"study-session-progress\">1 / 1</strong><span id=\"study-session-round\">1周目</span><span id=\"study-session-streak\" class=\"study-session-streak\" hidden></span></div>
                        <button type=\"button\" id=\"study-session-undo\" class=\"study-icon-action\" aria-label=\"直前の判定を戻す\">↶</button>
                    </header>
                    <div class=\"study-session-progress-bar\" aria-hidden=\"true\"><span id=\"study-session-progress-fill\"></span></div>
                    <div id=\"study-answer-feedback\" class=\"study-answer-feedback\" aria-live=\"polite\"></div>
                    <div id=\"study-session-stage\" class=\"study-session-stage\"></div>
""", 'session feedback markup')

text = replace_once(text,
"""            .study-session-shell{width:min(760px,100%);min-height:100%;margin:0 auto;padding:14px 18px 24px;display:flex;flex-direction:column}.study-session-header{display:grid;grid-template-columns:48px 1fr 48px;align-items:center;gap:8px}.study-session-progress-wrap{text-align:center}.study-session-progress-wrap strong{display:block;font-size:1.05rem;color:#433a32}.study-session-progress-wrap span{display:block;margin-top:2px;color:#817568;font-size:.78rem}
""",
"""            .study-session-shell{position:relative;width:min(760px,100%);min-height:100%;margin:0 auto;padding:14px 18px 24px;display:flex;flex-direction:column}.study-session-header{display:grid;grid-template-columns:48px 1fr 48px;align-items:center;gap:8px}.study-session-progress-wrap{text-align:center}.study-session-progress-wrap strong{display:block;font-size:1.05rem;color:#433a32}.study-session-progress-wrap>span{display:inline-block;margin:2px 3px 0;color:#817568;font-size:.78rem}.study-session-streak{padding:2px 7px;border-radius:999px;background:#fff0d5;color:#9b5b08!important;font-weight:850}.study-session-streak[hidden]{display:none!important}.study-session-progress-bar{height:5px;margin:9px 54px 0;border-radius:999px;background:#e9e1d9;overflow:hidden}.study-session-progress-bar span{display:block;width:0;height:100%;border-radius:inherit;background:var(--study-green);transition:width .28s ease}.study-answer-feedback{position:absolute;z-index:20;top:78px;left:50%;transform:translate(-50%,-8px) scale(.94);display:flex;flex-direction:column;align-items:center;gap:2px;min-width:150px;max-width:82%;padding:9px 15px;border:1px solid #dfd5cb;border-radius:14px;background:rgba(255,253,249,.96);box-shadow:0 8px 24px rgba(67,57,48,.13);opacity:0;pointer-events:none}.study-answer-feedback.show{animation:study-feedback-pop .2s ease-out forwards}.study-answer-feedback strong{font-size:1rem;color:#433930}.study-answer-feedback span{font-size:.72rem;color:#76695e}.study-answer-feedback.known{border-color:#b9d9c5}.study-answer-feedback.unsure{border-color:#d4d5da}.study-answer-feedback.wrong{border-color:#e6bbbb}.study-answer-feedback.special{box-shadow:0 10px 28px rgba(150,100,30,.2)}@keyframes study-feedback-pop{from{opacity:0;transform:translate(-50%,-8px) scale(.94)}to{opacity:1;transform:translate(-50%,0) scale(1)}}
""", 'feedback styles')

text = replace_once(text,
"""            @media(max-width:390px){.study-hub-preset-grid{grid-template-columns:1fr}.study-preset.context{grid-column:auto}.study-today-heading{flex-direction:column}.study-today-heading .study-primary-action{width:100%}.study-session-stage{min-height:390px}.study-flashcard{min-height:285px;height:56vh}.study-direction-hint{width:40px;height:40px;font-size:1.2rem}}
""",
"""            @media(max-width:390px){.study-hub-preset-grid{grid-template-columns:1fr}.study-preset.context{grid-column:auto}.study-today-heading{flex-direction:column}.study-today-heading .study-primary-action{width:100%}.study-session-stage{min-height:390px}.study-flashcard{min-height:285px;height:56vh}.study-direction-hint{width:40px;height:40px;font-size:1.2rem}.study-session-progress-bar{margin-left:50px;margin-right:50px}.study-answer-feedback{top:72px}}
            @media(prefers-reduced-motion:reduce){.study-answer-feedback.show{animation:none;opacity:1;transform:translate(-50%,0) scale(1)}.study-session-progress-bar span{transition:none}}
""", 'feedback reduced motion')

path.write_text(text)

# --- Study Center stats/history ---
path = Path('study-center.js')
text = path.read_text()

text = replace_once(text,
"""                                        <span>✓ ${Number(session.stats?.known) || 0}</span><span>? ${Number(session.stats?.unsure) || 0}</span><span>✕ ${Number(session.stats?.wrong) || 0}</span>
""",
"""                                        <span>✓ ${Number(session.stats?.known) || 0}</span><span>? ${Number(session.stats?.unsure) || 0}</span><span>✕ ${Number(session.stats?.wrong) || 0}</span>
                                        <span>🔥 ${Number(session.stats?.bestStreak) || 0}</span><span>苦手克服 ${Number(session.stats?.weakCleared) || 0}</span>
""", 'history streak details')

text = replace_once(text,
"""        const words30 = last30.reduce((sum, item) => sum + (Number(item.uniqueCount) || 0), 0);
        const streak = consecutiveStudyDays(sessions);
""",
"""        const words30 = last30.reduce((sum, item) => sum + (Number(item.uniqueCount) || 0), 0);
        const bestAnswerStreak = last30.reduce((best, item) => Math.max(best, Number(item.stats?.bestStreak) || 0), 0);
        const weakCleared30 = last30.reduce((sum, item) => sum + (Number(item.stats?.weakCleared) || 0), 0);
        const streak = consecutiveStudyDays(sessions);
""", 'stats achievement data')

text = replace_once(text,
"""                    <div><span>保留</span><strong>${model.held.length}</strong><small>自動出題から除外</small></div>
""",
"""                    <div><span>保留</span><strong>${model.held.length}</strong><small>自動出題から除外</small></div>
                    <div><span>最高streak</span><strong>🔥 ${bestAnswerStreak}</strong><small>直近30日</small></div>
                    <div><span>苦手克服</span><strong>${weakCleared30}</strong><small>直近30日</small></div>
""", 'stats achievement cards')

path.write_text(text)

# --- index cache versions ---
path = Path('index.html')
text = path.read_text()
text = text.replace('flashcard-study.js?v=1.6', 'flashcard-study.js?v=1.7')
text = text.replace('study-center.js?v=3', 'study-center.js?v=4')
path.write_text(text)

# --- plan ---
path = Path('STUDY_CENTER_PLAN.md')
text = path.read_text().rstrip() + """

## Phase 4
- カード中に連続正解streakと学習進捗バーを表示する。
- 正解時に `Nice!`、streak、Level up、苦手度ダウン、苦手克服を短いフィードバックとして表示する。
- 10語ごとに達成フィードバックを追加する。
- セッション終了画面・履歴・統計に最高streakと苦手改善/克服を反映する。
- `prefers-reduced-motion` を尊重し、過剰なアニメーションを避ける。
""" + "\n"
path.write_text(text)
