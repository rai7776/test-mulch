from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'anchor not found: {label}')
    return text.replace(old, new, 1)

# Ensure the new vocabulary senses module from main is loaded.
index_path = Path('index.html')
html = index_path.read_text()
if 'word-senses.js?v=1' not in html:
    html = replace_once(
        html,
        '    <script src="note-structure-ui.js?v=2.2"></script>\n',
        '    <script src="note-structure-ui.js?v=2.2"></script>\n    <script src="word-senses.js?v=1"></script>\n',
        'word-senses script include'
    )
html = html.replace('flashcard-study.js?v=1.11', 'flashcard-study.js?v=1.12')
html = html.replace('study-center.js?v=7', 'study-center.js?v=8')
index_path.write_text(html)

# Make flashcard rendering/history resolve the active context sense first,
# while retaining full backward compatibility with the legacy `meaning` field.
flash_path = Path('flashcard-study.js')
flash = flash_path.read_text()
helper = '''    function resolveStudyMeaning(word) {
        const legacy = String(word?.meaning || '').trim();
        try {
            const api = window.SmartReaderWordSenses;
            if (api?.getWordSenses && api?.getContextSenseId) {
                const senses = api.getWordSenses(word);
                const contextId = api.getContextSenseId(word, senses);
                const context = Array.isArray(senses)
                    ? (senses.find(sense => String(sense?.id || '') === String(contextId || '')) || senses[0])
                    : null;
                const value = String(context?.meaning || '').trim();
                if (value) return value;
            }
        } catch (_) {}

        const senses = Array.isArray(word?.senses) ? word.senses : [];
        if (senses.length) {
            const contextId = String(word?.contextSenseId || '');
            const context = senses.find(sense => String(sense?.id || '') === contextId)
                || senses.find(sense => String(sense?.meaning || '').trim())
                || null;
            const value = String(context?.meaning || '').trim();
            if (value) return value;
        }
        return legacy;
    }

'''
if 'function resolveStudyMeaning(word)' not in flash:
    flash = replace_once(flash, '    async function recordStudySession(current) {', helper + '    async function recordStudySession(current) {', 'flashcard meaning helper')
flash = flash.replace("                meaning: String(entry.word.meaning || ''),", "                meaning: resolveStudyMeaning(entry.word),")
flash = flash.replace("        const meaning = String(word.meaning || '').trim() || '意味未登録';", "        const meaning = resolveStudyMeaning(word) || '意味未登録';")
flash = replace_once(
    flash,
    '            getWordView: word => studyView(word),\n',
    '            getWordView: word => studyView(word),\n            getWordMeaning: word => resolveStudyMeaning(word),\n',
    'SmartReaderStudy meaning export'
) if 'getWordMeaning: word => resolveStudyMeaning(word)' not in flash else flash
flash_path.write_text(flash)

# Study Center uses the same resolver exposed by the flashcard engine.
study_path = Path('study-center.js')
study = study_path.read_text()
center_helper = '''    function studyMeaning(word) {
        try {
            const resolved = window.SmartReaderStudy?.getWordMeaning?.(word);
            if (String(resolved || '').trim()) return String(resolved).trim();
        } catch (_) {}
        return String(word?.meaning || '').trim();
    }

'''
if 'function studyMeaning(word)' not in study:
    study = replace_once(study, '    function library() {', center_helper + '    function library() {', 'Study Center meaning helper')
study = study.replace("                    <div class=\"study-center-word-meaning\">${escapeHtml(entry.word.meaning || '')}</div>", "                    <div class=\"study-center-word-meaning\">${escapeHtml(studyMeaning(entry.word))}</div>")
study_path.write_text(study)
