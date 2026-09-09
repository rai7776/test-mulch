from pathlib import Path

path = Path('flashcard-study.js')
text = path.read_text()

old = """        const timestamp = Date.now();
        const firstEvaluation = !session.evaluated.has(entry.key);
"""
new = """        const timestamp = Date.now();
        const previousNextReviewAt = study.nextReviewAt;
        const wasDueBeforeAnswer = previousNextReviewAt !== null
            && previousNextReviewAt < startOfNextLocalDay(timestamp);
        const firstEvaluation = !session.evaluated.has(entry.key);
"""
if old not in text:
    raise SystemExit('timestamp anchor not found')
text = text.replace(old, new, 1)

old_schedule = "study.nextReviewAt = localDayAfter(1, timestamp);"
if text.count(old_schedule) != 2:
    raise SystemExit(f'expected 2 one-day schedule assignments, found {text.count(old_schedule)}')
text = text.replace(
    old_schedule,
    "study.nextReviewAt = wasDueBeforeAnswer ? previousNextReviewAt : localDayAfter(1, timestamp);",
    2,
)

old_else = """        } else {
            if (result === 'wrong') adjustDifficulty(study, 6);
            else if (result === 'unsure') adjustDifficulty(study, 3);
        }
"""
new_else = """        } else {
            if (result === 'wrong') adjustDifficulty(study, 6);
            else if (result === 'unsure') adjustDifficulty(study, 3);
            else if (result === 'known' && wasDueBeforeAnswer) {
                study.intervalDays = Math.max(1, study.intervalDays || 1);
                study.nextReviewAt = localDayAfter(study.intervalDays, timestamp);
            }
        }
"""
if old_else not in text:
    raise SystemExit('repeat-result block not found')
text = text.replace(old_else, new_else, 1)

path.write_text(text)
