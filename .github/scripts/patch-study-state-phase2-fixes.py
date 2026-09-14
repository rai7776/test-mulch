from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'anchor not found: {label}')
    return text.replace(old, new, 1)

path = Path('flashcard-study.js')
text = path.read_text()
text = replace_once(text,
"""        const hasStudy = !!(word && word.study && typeof word.study === 'object');
        const isNew = !hasStudy && !word?.memorized;
""",
"""        const isNew = study.seenCount === 0
            && study.knownCount === 0
            && study.unsureCount === 0
            && study.wrongCount === 0
            && !word?.memorized;
""", 'new state from counts')
text = replace_once(text,
"""        const wasPreviouslyLearned = previousLevel > 0 || !!word.memorized || study.firstKnownCount > 0;
        const attempt = sessionAttemptState(entry.key);

        if (result === 'wrong' && study.manualMasteredAt) {
""",
"""        const wasPreviouslyLearned = previousLevel > 0 || !!word.memorized || study.firstKnownCount > 0;
        const manualMasteredBeforeAnswer = !!study.manualMasteredAt && !!word.memorized;
        const attempt = sessionAttemptState(entry.key);

        if (result === 'wrong' && study.manualMasteredAt) {
""", 'manual mastery snapshot')
text = replace_once(text,
"""            word.memorized = study.level >= 4;
""",
"""            word.memorized = manualMasteredBeforeAnswer && result !== 'wrong'
                ? true
                : study.level >= 4;
""", 'preserve manual mastery unless wrong')
text = replace_once(text,
"""        if (mode === 'difficult') return all.filter(entry => studyView(entry.word).difficult).sort((a, b) => { const left = readStudy(a.word); const right = readStudy(b.word); return (right.difficultyScore - left.difficultyScore) || (right.lapseCount - left.lapseCount) || (right.wrongCount - left.wrongCount); });
""",
"""        if (mode === 'difficult') return all.filter(entry => studyView(entry.word).difficult).sort((a, b) => {
            const left = studyView(a.word);
            const right = studyView(b.word);
            return (right.weaknessScore - left.weaknessScore)
                || (right.study.lapseCount - left.study.lapseCount)
                || (right.study.wrongCount - left.study.wrongCount);
        });
""", 'difficult sort weakness')
path.write_text(text)

path = Path('study-center.js')
text = path.read_text()
text = replace_once(text,
"""        const next = study.nextReviewAt;
        const isNew = !word?.study && !word?.memorized;
""",
"""        const next = study.nextReviewAt;
        const isNew = study.seenCount === 0
            && study.knownCount === 0
            && study.unsureCount === 0
            && study.wrongCount === 0
            && !word?.memorized;
""", 'center new state from counts')
text = replace_once(text,
"""            const count = entries.filter(entry => {
                const next = wordView(entry.word).study?.nextReviewAt;
                return next !== null && next >= start && next < end;
            }).length;
""",
"""            const count = entries.filter(entry => {
                const view = wordView(entry.word);
                if (view.suspended || view.manualMastered) return false;
                const next = view.study?.nextReviewAt;
                return next !== null && next >= start && next < end;
            }).length;
""", 'schedule exclude inactive')
path.write_text(text)
