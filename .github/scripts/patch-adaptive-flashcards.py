from pathlib import Path
import re

p = Path('flashcard-study.js')
s = p.read_text(encoding='utf-8')

s = s.replace("const STUDY_VERSION = 1;", "const STUDY_VERSION = 2;", 1)
s = s.replace("const DEFAULT_NEW_LIMIT = 10;", "const DEFAULT_NEW_LIMIT = 10;\n    const DEFAULT_DIFFICULTY = 45;\n    const EXAMPLE_MODE_KEY = 'smart-reader-study-example-mode';", 1)

old = """        shuffle: true,
        contextEntries: null,"""
new = """        shuffle: true,
        exampleMode: (() => {
            try {
                const value = localStorage.getItem(EXAMPLE_MODE_KEY);
                return ['back', 'always', 'none'].includes(value) ? value : 'back';
            } catch (_) {
                return 'back';
            }
        })(),
        contextEntries: null,"""
assert old in s, 'uiState marker missing'
s = s.replace(old, new, 1)

old = """            intervalDays: 0,
            nextReviewAt: null"""
new = """            intervalDays: 0,
            nextReviewAt: null,
            difficultyScore: DEFAULT_DIFFICULTY,
            lapseCount: 0,
            firstResponseCount: 0,
            firstKnownCount: 0,
            lastSessionAttempts: 0,
            lastSessionWrongCount: 0,
            lastSessionUnsureCount: 0,
            lastSessionFirstResult: null,
            lastSessionCompletedAt: null"""
assert old in s, 'study defaults marker missing'
s = s.replace(old, new, 1)

old = """        merged.intervalDays = clampInteger(merged.intervalDays, 0, 3650);
        const optionalTimestamp = value => value === null || value === undefined || value === ''"""
new = """        merged.intervalDays = clampInteger(merged.intervalDays, 0, 3650);
        merged.lapseCount = clampInteger(merged.lapseCount, 0, 1000000);
        merged.firstResponseCount = clampInteger(merged.firstResponseCount, 0, 1000000);
        merged.firstKnownCount = clampInteger(merged.firstKnownCount, 0, 1000000);
        merged.lastSessionAttempts = clampInteger(merged.lastSessionAttempts, 0, 1000000);
        merged.lastSessionWrongCount = clampInteger(merged.lastSessionWrongCount, 0, 1000000);
        merged.lastSessionUnsureCount = clampInteger(merged.lastSessionUnsureCount, 0, 1000000);
        if (Object.prototype.hasOwnProperty.call(raw, 'difficultyScore')) {
            merged.difficultyScore = clampInteger(raw.difficultyScore, 0, 100, DEFAULT_DIFFICULTY);
        } else {
            const historical = DEFAULT_DIFFICULTY
                + Math.min(32, merged.wrongCount * 4 + merged.unsureCount * 2)
                - Math.min(15, merged.correctStreak * 3);
            merged.difficultyScore = clampInteger(historical, 0, 100, DEFAULT_DIFFICULTY);
        }
        const optionalTimestamp = value => value === null || value === undefined || value === ''"""
assert old in s, 'readStudy numeric marker missing'
s = s.replace(old, new, 1)

old = """        merged.lastReviewAt = optionalTimestamp(merged.lastReviewAt);
        return merged;
    }"""
new = """        merged.lastReviewAt = optionalTimestamp(merged.lastReviewAt);
        merged.lastSessionCompletedAt = optionalTimestamp(merged.lastSessionCompletedAt);
        return merged;
    }

    function difficultyLabel(score) {
        const value = clampInteger(score, 0, 100, DEFAULT_DIFFICULTY);
        if (value <= 25) return '低';
        if (value <= 50) return '普通';
        if (value <= 75) return '高';
        return '非常に高';
    }

    function adjustDifficulty(study, delta) {
        study.difficultyScore = clampInteger((study.difficultyScore ?? DEFAULT_DIFFICULTY) + delta, 0, 100, DEFAULT_DIFFICULTY);
        return study.difficultyScore;
    }

    function adaptiveIntervalDays(level, difficultyScore) {
        const base = LEVEL_INTERVAL_DAYS[level] || 60;
        if (base <= 1) return Math.max(1, base);
        const factor = Math.min(1.35, Math.max(0.55, 1.45 - clampInteger(difficultyScore, 0, 100, DEFAULT_DIFFICULTY) * 0.009));
        return Math.max(1, Math.round(base * factor));
    }

    function sessionAttemptState(entryKey) {
        if (!session) return { responses: 0, wrong: 0, unsure: 0, known: 0, firstResult: null };
        let attempt = session.attempts.get(entryKey);
        if (!attempt) {
            attempt = { responses: 0, wrong: 0, unsure: 0, known: 0, firstResult: null };
            session.attempts.set(entryKey, attempt);
        }
        return attempt;
    }"""
assert old in s, 'readStudy tail marker missing'
s = s.replace(old, new, 1)

s = s.replace("if (!Number.isFinite(Number(timestamp))) return '未予定';", "if (timestamp === null || timestamp === undefined || timestamp === '' || !Number.isFinite(Number(timestamp))) return '未予定';", 1)

old = """        const difficult = study.wrongCount >= 2
            || study.lastReviewResult === 'wrong'
            || study.lastResult === 'wrong'
            || (study.seenCount >= 4 && accuracy !== null && accuracy < 0.5);"""
new = """        const difficult = study.difficultyScore >= 65
            || study.lapseCount >= 2
            || study.wrongCount >= 4
            || study.lastReviewResult === 'wrong'
            || (study.seenCount >= 4 && accuracy !== null && accuracy < 0.5);"""
assert old in s, 'difficult marker missing'
s = s.replace(old, new, 1)

assert "score += Math.min(100, study.wrongCount * 10);" in s, 'due priority marker missing'
s = s.replace("score += Math.min(100, study.wrongCount * 10);", "score += Math.min(180, study.wrongCount * 10);\n        score += study.difficultyScore * 3;\n        score += Math.min(600, study.lapseCount * 150);", 1)

old = "if (mode === 'difficult') return all.filter(entry => studyView(entry.word).difficult).sort((a, b) => readStudy(b.word).wrongCount - readStudy(a.word).wrongCount);"
new = "if (mode === 'difficult') return all.filter(entry => studyView(entry.word).difficult).sort((a, b) => { const left = readStudy(a.word); const right = readStudy(b.word); return (right.difficultyScore - left.difficultyScore) || (right.lapseCount - left.lapseCount) || (right.wrongCount - left.wrongCount); });"
assert old in s, 'difficult sort marker missing'
s = s.replace(old, new, 1)

pattern = re.compile(r"    function applyStudyResult\(entry, result\) \{.*?\n    \}\n\n    function sessionSnapshot", re.S)
replacement = '''    function applyStudyResult(entry, result) {
        const word = entry.word;
        const study = ensureStudy(word);
        const timestamp = Date.now();
        const firstEvaluation = !session.evaluated.has(entry.key);
        const previousLevel = study.level;
        const previousSessionCount = study.sessionCount;
        const wasPreviouslyLearned = previousSessionCount > 0 || previousLevel > 0 || !!word.memorized;
        const attempt = sessionAttemptState(entry.key);

        attempt.responses += 1;
        attempt[result] += 1;
        if (!attempt.firstResult) attempt.firstResult = result;

        study.seenCount += 1;
        if (result === 'known') study.knownCount += 1;
        if (result === 'unsure') study.unsureCount += 1;
        if (result === 'wrong') study.wrongCount += 1;
        study.lastResult = result;
        study.lastStudiedAt = timestamp;

        let promoted = false;
        let demoted = false;
        let lapse = false;
        if (firstEvaluation) {
            session.evaluated.add(entry.key);
            study.sessionCount += 1;
            study.firstResponseCount += 1;
            study.lastReviewResult = result;
            study.lastReviewAt = timestamp;
            study.lastSessionFirstResult = result;

            if (result === 'known') {
                study.firstKnownCount += 1;
                study.correctStreak += 1;
                const firstEverKnown = previousSessionCount === 0 && previousLevel === 0 && !word.memorized;
                study.level = firstEverKnown ? 2 : Math.min(6, study.level + 1);
                adjustDifficulty(study, firstEverKnown ? -18 : -9);
                study.intervalDays = adaptiveIntervalDays(study.level, study.difficultyScore);
                study.nextReviewAt = localDayAfter(study.intervalDays, timestamp);
            } else if (result === 'unsure') {
                study.correctStreak = 0;
                adjustDifficulty(study, 8);
                study.intervalDays = 1;
                study.nextReviewAt = localDayAfter(1, timestamp);
            } else {
                study.correctStreak = 0;
                lapse = wasPreviouslyLearned;
                if (lapse) {
                    study.lapseCount += 1;
                    adjustDifficulty(study, 10);
                }
                adjustDifficulty(study, 15);
                study.level = study.level >= 4 ? 3 : Math.max(0, study.level - 1);
                study.intervalDays = 1;
                study.nextReviewAt = localDayAfter(1, timestamp);
            }

            word.memorized = study.level >= 4;
            promoted = study.level > previousLevel;
            demoted = study.level < previousLevel;
        } else {
            if (result === 'wrong') adjustDifficulty(study, 6);
            else if (result === 'unsure') adjustDifficulty(study, 3);
        }

        study.lastSessionAttempts = attempt.responses;
        study.lastSessionWrongCount = attempt.wrong;
        study.lastSessionUnsureCount = attempt.unsure;
        if (result === 'known') study.lastSessionCompletedAt = timestamp;

        word.study = study;
        return { firstEvaluation, previousLevel, nextLevel: study.level, promoted, demoted, lapse };
    }

    function sessionSnapshot'''
s, count = pattern.subn(replacement, s, count=1)
assert count == 1, 'applyStudyResult block missing'

old = """                stats: { ...session.stats },
                evaluated: [...session.evaluated],
                answeredUnique: [...session.answeredUnique]"""
new = """                stats: { ...session.stats },
                evaluated: [...session.evaluated],
                answeredUnique: [...session.answeredUnique],
                attempts: Array.from(session.attempts.entries()).map(([key, value]) => [key, { ...value }])"""
assert old in s, 'snapshot marker missing'
s = s.replace(old, new, 1)

old = """        session.evaluated = new Set(snapshot.sessionState.evaluated);
        session.answeredUnique = new Set(snapshot.sessionState.answeredUnique);"""
new = """        session.evaluated = new Set(snapshot.sessionState.evaluated);
        session.answeredUnique = new Set(snapshot.sessionState.answeredUnique);
        session.attempts = new Map((snapshot.sessionState.attempts || []).map(([key, value]) => [key, { ...value }]));"""
assert old in s, 'restore marker missing'
s = s.replace(old, new, 1)

assert "if (effect.demoted) session.stats.demoted += 1;" in s, 'effect stats marker missing'
s = s.replace("if (effect.demoted) session.stats.demoted += 1;", "if (effect.demoted) session.stats.demoted += 1;\n        if (effect.lapse) session.stats.lapses += 1;", 1)

old = """        const context = String(word.context || '').trim();
        const tags = Array.isArray(word.tags) ? word.tags.filter(Boolean) : [];"""
new = """        const context = String(word.context || '').trim();
        const showContextFront = !!context && uiState.exampleMode === 'always';
        const showContextBack = !!context && uiState.exampleMode !== 'none';
        const tags = Array.isArray(word.tags) ? word.tags.filter(Boolean) : [];"""
assert old in s, 'card context marker missing'
s = s.replace(old, new, 1)

old = """                ${(part || tags.length) ? `<div class=\"study-card-meta\">${part ? `<span>${escapeHtml(part)}</span>` : ''}${tags.slice(0, 3).map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
            `;"""
new = """                ${(part || tags.length) ? `<div class=\"study-card-meta\">${part ? `<span>${escapeHtml(part)}</span>` : ''}${tags.slice(0, 3).map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
                ${showContextFront ? `<div class=\"study-card-context study-card-context-front\">${escapeHtml(context)}</div>` : ''}
            `;"""
assert old in s, 'front card marker missing'
s = s.replace(old, new, 1)

old = """                ${context ? `<div class=\"study-card-context\">${escapeHtml(context)}</div>` : ''}
                <div class=\"study-card-source\">${escapeHtml(entry.articleTitle)}${entry.chapterTitle ? ` / ${escapeHtml(entry.chapterTitle)}` : ''}</div>
                <div class=\"study-card-studyline\">Lv.${study.level} · 次回 ${escapeHtml(formatShortDate(study.nextReviewAt))}</div>"""
new = """                ${showContextBack ? `<div class=\"study-card-context\">${escapeHtml(context)}</div>` : ''}
                <div class=\"study-card-source\">${escapeHtml(entry.articleTitle)}${entry.chapterTitle ? ` / ${escapeHtml(entry.chapterTitle)}` : ''}</div>
                <div class=\"study-card-studyline\">Lv.${study.level} · 苦手度 ${escapeHtml(difficultyLabel(study.difficultyScore))} · ×${study.wrongCount} · 忘却${study.lapseCount} · 次回 ${escapeHtml(formatShortDate(study.nextReviewAt))}</div>"""
assert old in s, 'back card marker missing'
s = s.replace(old, new, 1)

old = """            evaluated: new Set(),
            answeredUnique: new Set(),
            history: [],
            stats: { responses: 0, known: 0, unsure: 0, wrong: 0, promoted: 0, demoted: 0 }"""
new = """            evaluated: new Set(),
            answeredUnique: new Set(),
            attempts: new Map(),
            history: [],
            stats: { responses: 0, known: 0, unsure: 0, wrong: 0, promoted: 0, demoted: 0, lapses: 0 }"""
assert old in s, 'session init marker missing'
s = s.replace(old, new, 1)

old = """        const shuffle = document.getElementById('study-shuffle');
        if (reviewLimit) reviewLimit.value = String(uiState.reviewLimit);
        if (newLimit) newLimit.value = String(uiState.newLimit);
        if (shuffle) shuffle.checked = uiState.shuffle;"""
new = """        const shuffle = document.getElementById('study-shuffle');
        const exampleMode = document.getElementById('study-example-mode');
        if (reviewLimit) reviewLimit.value = String(uiState.reviewLimit);
        if (newLimit) newLimit.value = String(uiState.newLimit);
        if (shuffle) shuffle.checked = uiState.shuffle;
        if (exampleMode) exampleMode.value = uiState.exampleMode;"""
assert old in s, 'hub count settings marker missing'
s = s.replace(old, new, 1)

old = """        const shuffle = document.getElementById('study-shuffle');
        uiState.reviewLimit = clampInteger(review?.value, 1, 500, DEFAULT_REVIEW_LIMIT);
        uiState.newLimit = clampInteger(fresh?.value, 0, 200, DEFAULT_NEW_LIMIT);
        uiState.shuffle = !!shuffle?.checked;"""
new = """        const shuffle = document.getElementById('study-shuffle');
        const exampleMode = document.getElementById('study-example-mode');
        uiState.reviewLimit = clampInteger(review?.value, 1, 500, DEFAULT_REVIEW_LIMIT);
        uiState.newLimit = clampInteger(fresh?.value, 0, 200, DEFAULT_NEW_LIMIT);
        uiState.shuffle = !!shuffle?.checked;
        uiState.exampleMode = ['back', 'always', 'none'].includes(exampleMode?.value) ? exampleMode.value : 'back';
        try { localStorage.setItem(EXAMPLE_MODE_KEY, uiState.exampleMode); } catch (_) {}"""
assert old in s, 'apply settings marker missing'
s = s.replace(old, new, 1)

old = """                        <div class=\"study-setting-row\"><label>新規上限 <input type=\"number\" id=\"study-new-limit\" min=\"0\" max=\"200\" inputmode=\"numeric\"></label><span>語</span></div>
                        <label class=\"study-setting-check\"><input type=\"checkbox\" id=\"study-shuffle\"> カード順をシャッフル</label>"""
new = """                        <div class=\"study-setting-row\"><label>新規上限 <input type=\"number\" id=\"study-new-limit\" min=\"0\" max=\"200\" inputmode=\"numeric\"></label><span>語</span></div>
                        <div class=\"study-setting-row\"><label>例文表示 <select id=\"study-example-mode\"><option value=\"back\">裏面</option><option value=\"always\">常に表示</option><option value=\"none\">表示しない</option></select></label></div>
                        <label class=\"study-setting-check\"><input type=\"checkbox\" id=\"study-shuffle\"> カード順をシャッフル</label>"""
assert old in s, 'hub HTML settings marker missing'
s = s.replace(old, new, 1)

assert "['study-review-limit', 'study-new-limit', 'study-shuffle'].forEach" in s, 'settings binding marker missing'
s = s.replace("['study-review-limit', 'study-new-limit', 'study-shuffle'].forEach", "['study-review-limit', 'study-new-limit', 'study-shuffle', 'study-example-mode'].forEach", 1)

old = """                    <div><span>レベルダウン</span><strong>${session.stats.demoted}</strong></div>
                    <div><span>明日また復習</span><strong>${dueTomorrow}</strong></div>"""
new = """                    <div><span>レベルダウン</span><strong>${session.stats.demoted}</strong></div>
                    <div><span>忘却</span><strong>${session.stats.lapses}</strong></div>
                    <div><span>明日また復習</span><strong>${dueTomorrow}</strong></div>"""
assert old in s, 'summary marker missing'
s = s.replace(old, new, 1)

old = ".study-setting-row input[type=number]{width:72px;min-height:36px;font-size:16px}"
new = ".study-setting-row input[type=number]{width:72px;min-height:36px;font-size:16px}.study-setting-row select{min-height:36px;padding:5px 8px;border:1px solid #ded3c9;border-radius:8px;background:#fff;color:#5f5348;font-size:16px}"
assert old in s, 'settings css marker missing'
s = s.replace(old, new, 1)

old = ".study-card-context{width:100%;margin-top:17px;padding:12px;border-radius:10px;background:#f5f0ea;color:#65594e;font-size:.88rem;line-height:1.55;text-align:left}.study-card-source{"
new = ".study-card-context{width:100%;margin-top:17px;padding:12px;border-radius:10px;background:#f5f0ea;color:#65594e;font-size:.88rem;line-height:1.55;text-align:left}.study-card-context-front{margin-top:14px;max-height:38%;overflow:auto;font-size:.82rem}.study-card-source{"
assert old in s, 'context css marker missing'
s = s.replace(old, new, 1)

old = ".study-card-studyline{margin-top:5px;color:#8c7c6d;font-size:.72rem}"
new = ".study-card-studyline{max-width:100%;margin-top:5px;color:#8c7c6d;font-size:.72rem;line-height:1.45;text-align:center}"
assert old in s, 'studyline css marker missing'
s = s.replace(old, new, 1)

p.write_text(s, encoding='utf-8')

index = Path('index.html')
html = index.read_text(encoding='utf-8')
old = '<script src="flashcard-study.js?v=1.0"></script>'
new = '<script src="flashcard-study.js?v=1.1"></script>'
assert old in html, 'flashcard script version marker missing'
html = html.replace(old, new, 1)
index.write_text(html, encoding='utf-8')
