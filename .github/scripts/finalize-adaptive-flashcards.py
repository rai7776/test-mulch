from pathlib import Path
p = Path('flashcard-study.js')
s = p.read_text(encoding='utf-8')
old = "const wasPreviouslyLearned = previousSessionCount > 0 || previousLevel > 0 || !!word.memorized;"
new = "const wasPreviouslyLearned = previousLevel > 0 || !!word.memorized || study.firstKnownCount > 0;"
assert old in s, 'lapse eligibility marker missing'
s = s.replace(old, new, 1)
p.write_text(s, encoding='utf-8')
