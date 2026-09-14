from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'anchor not found: {label}')
    return text.replace(old, new, 1)

path = Path('flashcard-study.js')
text = path.read_text()
text = replace_once(
    text,
    "        effect.progressAdvanced = result === 'known' && attempt.known === 1;",
    "        const progressAttempt = session.attempts.get(entry.key);\n        effect.progressAdvanced = result === 'known' && (progressAttempt?.known || 0) === 1;",
    'undefined attempt reference'
)
path.write_text(text)

index = Path('index.html')
html = index.read_text()
html = replace_once(html, 'flashcard-study.js?v=1.9', 'flashcard-study.js?v=1.10', 'flashcard cache version')
index.write_text(html)
