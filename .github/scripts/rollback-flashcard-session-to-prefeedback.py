from pathlib import Path
import subprocess

BASELINE = 'save/2026-09-14-before-study-feedback'


def slice_between(text, start_marker, end_marker):
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    return text[start:end]


path = Path('flashcard-study.js')
current = path.read_text()
baseline = subprocess.check_output(
    ['git', 'show', f'{BASELINE}:flashcard-study.js'],
    text=True,
)

# Keep the newer iPhone Touch Events implementation, but restore the entire
# card-answer/session pipeline to the last known-good pre-feedback version.
current_bind = slice_between(
    current,
    '    function bindCardInteractions() {',
    '\n    function startSession(entries, label) {',
)

baseline_region = slice_between(
    baseline,
    '    function applyStudyResult(entry, result) {',
    '\n    function updateHubCounts() {',
)
baseline_bind = slice_between(
    baseline_region,
    '    function bindCardInteractions() {',
    '\n    function startSession(entries, label) {',
)
baseline_region = baseline_region.replace(baseline_bind, current_bind, 1)

current_start = current.index('    function applyStudyResult(entry, result) {')
current_end = current.index('\n    function updateHubCounts() {', current_start)
current = current[:current_start] + baseline_region + current[current_end:]

path.write_text(current)

index = Path('index.html')
html = index.read_text()
if 'flashcard-study.js?v=1.10' not in html:
    raise SystemExit('expected flashcard cache version 1.10 not found')
html = html.replace('flashcard-study.js?v=1.10', 'flashcard-study.js?v=1.11', 1)
index.write_text(html)
