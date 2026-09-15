from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f"missing target: {label}")
    return text.replace(old, new, 1)


# --- word-senses.js: shared display model + Global Vocabulary decoration ---
path = Path('word-senses.js')
text = path.read_text()

old = """    function getContextSenseId(word, senses) {
        const explicit = normalizeText(word?.contextSenseId);
        if (explicit && senses.some(sense => sense.id === explicit)) return explicit;
        const meaning = normalizeText(word?.meaning);
        const matching = senses.find(sense => sense.meaning === meaning);
        return matching?.id || senses[0]?.id || null;
    }

    function resolveCurrentWord() {
"""
new = """    function getContextSenseId(word, senses) {
        const explicit = normalizeText(word?.contextSenseId);
        if (explicit && senses.some(sense => sense.id === explicit)) return explicit;
        const meaning = normalizeText(word?.meaning);
        const matching = senses.find(sense => sense.meaning === meaning);
        return matching?.id || senses[0]?.id || null;
    }

    function getSenseDisplay(word) {
        const senses = getWordSenses(word);
        const contextSenseId = getContextSenseId(word, senses);
        const context = senses.find(sense => sense.id === contextSenseId) || senses[0] || null;
        const seen = new Set();
        const contextMeaning = normalizeText(context?.meaning);
        if (contextMeaning) seen.add(contextMeaning.toLocaleLowerCase());
        const others = [];
        senses.forEach(sense => {
            if (!sense || sense.id === context?.id) return;
            const meaning = normalizeText(sense.meaning);
            if (!meaning) return;
            const key = meaning.toLocaleLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            others.push({ ...clone(sense), meaning });
        });
        return { senses, contextSenseId: context?.id || contextSenseId || null, context, others };
    }

    function resolveCurrentWord() {
"""
text = replace_once(text, old, new, 'word sense display helper')

old = """    function enhanceGroupCard(card, group) {
"""
new = """    function enhanceVocabularyCard(card, entry) {
        if (!card || !entry?.word) return card;
        const display = getSenseDisplay(entry.word);
        if (!display.context) return card;
        const meaning = card.querySelector('.global-vocabulary-summary .meaning-right');
        if (!meaning) return card;

        meaning.replaceChildren();
        const primary = document.createElement('div');
        primary.className = 'global-vocabulary-primary-sense';
        primary.textContent = display.context.meaning;
        meaning.appendChild(primary);

        if (display.others.length) {
            const secondary = document.createElement('div');
            secondary.className = 'global-vocabulary-secondary-senses';
            secondary.setAttribute('aria-label', 'その他の意味');
            display.others.forEach(sense => {
                const row = document.createElement('span');
                row.textContent = sense.meaning;
                secondary.appendChild(row);
            });
            meaning.appendChild(secondary);
        }
        return card;
    }

    function enhanceGroupCard(card, group) {
"""
text = replace_once(text, old, new, 'global vocabulary sense display')

old = """    function wrapGlobalGroupCard() {
        const original = window.createGlobalVocabularyGroupCard;
"""
new = """    function wrapGlobalVocabularyCard() {
        const original = window.createGlobalVocabularyCard;
        if (typeof original !== 'function' || original.__wordSensesWrapped) return;
        const wrapped = function (entry) {
            return enhanceVocabularyCard(original.apply(this, arguments), entry);
        };
        wrapped.__wordSensesWrapped = true;
        window.createGlobalVocabularyCard = wrapped;
    }

    function wrapGlobalGroupCard() {
        const original = window.createGlobalVocabularyGroupCard;
"""
text = replace_once(text, old, new, 'global vocabulary card wrapper')

old = """            .global-vocabulary-senses-summary { margin:10px 0; padding:10px; border:1px solid #e4e7ea; border-radius:10px; background:#fafafa; }
"""
new = """            .global-vocabulary-primary-sense { font-weight:700; line-height:1.35; }
            .global-vocabulary-secondary-senses { display:grid; gap:1px; margin-top:3px; color:#8a929a; font-size:.72rem; font-weight:500; line-height:1.35; }
            .global-vocabulary-secondary-senses span::before { content:'・'; }
            .global-vocabulary-senses-summary { margin:10px 0; padding:10px; border:1px solid #e4e7ea; border-radius:10px; background:#fafafa; }
"""
text = replace_once(text, old, new, 'global vocabulary sense styles')

old = """        wrapSave();
        wrapGlobalGroupCard();
"""
new = """        wrapSave();
        wrapGlobalVocabularyCard();
        wrapGlobalGroupCard();
"""
text = replace_once(text, old, new, 'install global vocabulary card wrapper')

old = """        getWordSenses,
        getContextSenseId,
        collectGroupSenses,
"""
new = """        getWordSenses,
        getContextSenseId,
        getSenseDisplay,
        collectGroupSenses,
"""
text = replace_once(text, old, new, 'export sense display helper')

path.write_text(text)


# --- flashcard-study.js: show context sense large, other senses smaller underneath ---
path = Path('flashcard-study.js')
text = path.read_text()

old = """    function resolveStudyMeaning(word) {
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
"""
new = """    function resolveStudySenseDisplay(word) {
        const legacy = String(word?.meaning || '').trim();
        let senses = [];
        let contextId = null;
        try {
            const api = window.SmartReaderWordSenses;
            if (api?.getSenseDisplay) {
                const display = api.getSenseDisplay(word);
                const meaning = String(display?.context?.meaning || legacy).trim();
                const otherMeanings = Array.isArray(display?.others)
                    ? display.others.map(sense => String(sense?.meaning || '').trim()).filter(Boolean)
                    : [];
                return { meaning, otherMeanings, contextSenseId: display?.contextSenseId || null };
            }
            if (api?.getWordSenses && api?.getContextSenseId) {
                senses = api.getWordSenses(word);
                contextId = api.getContextSenseId(word, senses);
            }
        } catch (_) {}

        if (!Array.isArray(senses) || !senses.length) {
            senses = Array.isArray(word?.senses)
                ? word.senses.filter(sense => sense && String(sense.meaning || '').trim())
                : [];
            contextId = String(word?.contextSenseId || '');
        }

        const context = senses.find(sense => String(sense?.id || '') === String(contextId || ''))
            || senses[0]
            || null;
        const meaning = String(context?.meaning || legacy).trim();
        const seen = new Set(meaning ? [meaning.toLocaleLowerCase()] : []);
        const otherMeanings = [];
        senses.forEach(sense => {
            if (!sense || sense === context || String(sense?.id || '') === String(context?.id || '')) return;
            const value = String(sense.meaning || '').trim();
            if (!value) return;
            const key = value.toLocaleLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            otherMeanings.push(value);
        });
        return { meaning, otherMeanings, contextSenseId: context?.id || contextId || null };
    }

    function resolveStudyMeaning(word) {
        return resolveStudySenseDisplay(word).meaning;
    }
"""
text = replace_once(text, old, new, 'flashcard sense display helper')

old = """        const wordText = String(word.word || '').trim() || surface || '—';
        const meaning = resolveStudyMeaning(word) || '意味未登録';
        const memo = String(word.memo || '').trim();
"""
new = """        const wordText = String(word.word || '').trim() || surface || '—';
        const senseDisplay = resolveStudySenseDisplay(word);
        const meaning = senseDisplay.meaning || '意味未登録';
        const otherMeanings = senseDisplay.otherMeanings;
        const memo = String(word.memo || '').trim();
"""
text = replace_once(text, old, new, 'flashcard render sense data')

old = """                <div class=\"study-card-back-word study-card-selectable\">${escapeHtml(wordText)}</div>
                <div class=\"study-card-meaning study-card-selectable\">${escapeHtml(meaning)}</div>
                ${memo ? `<div class=\"study-card-memo study-card-selectable\">${escapeHtml(memo)}</div>` : ''}
"""
new = """                <div class=\"study-card-back-word study-card-selectable\">${escapeHtml(wordText)}</div>
                <div class=\"study-card-meaning study-card-selectable\">${escapeHtml(meaning)}</div>
                ${otherMeanings.length ? `<div class=\"study-card-other-meanings study-card-selectable\" aria-label=\"その他の意味\">${otherMeanings.map(item => `<div>${escapeHtml(item)}</div>`).join('')}</div>` : ''}
                ${memo ? `<div class=\"study-card-memo study-card-selectable\">${escapeHtml(memo)}</div>` : ''}
"""
text = replace_once(text, old, new, 'flashcard secondary meanings markup')

old = ".study-card-back-word{font-size:1.2rem;font-weight:800;color:#6d5d4f}.study-card-meaning{margin-top:18px;font-size:clamp(1.35rem,4vw,2rem);font-weight:750;color:#352e28;line-height:1.45}.study-card-memo{margin-top:16px;color:#6f6257;line-height:1.5}"
new = ".study-card-back-word{font-size:1.2rem;font-weight:800;color:#6d5d4f}.study-card-meaning{margin-top:18px;font-size:clamp(1.35rem,4vw,2rem);font-weight:750;color:#352e28;line-height:1.45}.study-card-other-meanings{display:grid;gap:2px;margin-top:7px;color:#8b7f74;font-size:clamp(.8rem,2.5vw,.95rem);font-weight:500;line-height:1.4}.study-card-other-meanings>div::before{content:'・'}.study-card-memo{margin-top:16px;color:#6f6257;line-height:1.5}"
text = replace_once(text, old, new, 'flashcard secondary meanings styles')

path.write_text(text)


# --- cache bust versions ---
path = Path('index.html')
text = path.read_text()
text = replace_once(text, 'flashcard-study.js?v=1.12', 'flashcard-study.js?v=1.13', 'flashcard cache version')
text = replace_once(text, 'word-senses.js?v=1', 'word-senses.js?v=2', 'word senses cache version')
path.write_text(text)
