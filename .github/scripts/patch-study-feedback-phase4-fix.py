from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'anchor not found: {label}')
    return text.replace(old, new, 1)

path = Path('flashcard-study.js')
text = path.read_text()

text = replace_once(text,
"""        effect.streak = session.stats.currentStreak;
        effect.bestStreak = session.stats.bestStreak;
        effect.progressCount = session.answeredUnique.size;
""",
"""        effect.streak = session.stats.currentStreak;
        effect.bestStreak = session.stats.bestStreak;
        effect.progressAdvanced = result === 'known' && attempt.known === 1;
        effect.progressCount = session.initialEntries.filter(item => (session.attempts.get(item.key)?.known || 0) > 0).length;
""", 'resolved progress effect')

text = replace_once(text,
"""        if (effect.progressCount && effect.progressCount % 10 === 0) {
""",
"""        if (effect.progressAdvanced && effect.progressCount && effect.progressCount % 10 === 0) {
""", 'milestone only once')

text = replace_once(text,
"""        if (fill) {
            const completed = session?.initialCount ? Math.min(session.initialCount, session.answeredUnique.size) : 0;
            fill.style.width = `${session?.initialCount ? Math.round(completed / session.initialCount * 100) : 0}%`;
        }
""",
"""        if (fill) {
            const completed = session?.initialCount
                ? session.initialEntries.filter(item => (session.attempts.get(item.key)?.known || 0) > 0).length
                : 0;
            fill.style.width = `${session?.initialCount ? Math.round(completed / session.initialCount * 100) : 0}%`;
        }
""", 'resolved progress bar')

path.write_text(text)
