from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing target: {label}')
    return text.replace(old, new, 1)

# --- Word modal layout -----------------------------------------------------
path = Path('word-senses.js')
text = path.read_text()

anchor = '''    function setStatus(message, error = false) {
'''
modal_layout = '''    function fieldLabel(input) {
        if (!input) return null;
        const explicit = document.querySelector(`label[for="${input.id}"]`);
        if (explicit) return explicit;
        const previous = input.previousElementSibling;
        return previous?.tagName === 'LABEL' ? previous : null;
    }

    function moveField(container, inputId, className = '') {
        const input = byId(inputId);
        if (!input || !container) return null;
        const field = document.createElement('div');
        field.className = `word-modal-field ${className}`.trim();
        const label = fieldLabel(input);
        if (label) field.appendChild(label);
        field.appendChild(input);
        container.appendChild(field);
        return field;
    }

    function ensureModalLayout() {
        const section = byId('form-word-section');
        const editor = ensureEditor();
        if (!section || !editor) return;
        if (section.querySelector('.word-modal-hero')) return;

        section.classList.add('word-modal-rich');

        const hero = document.createElement('div');
        hero.className = 'word-modal-hero';

        const wordPane = document.createElement('section');
        wordPane.className = 'word-modal-word-pane';
        const wordEyebrow = document.createElement('div');
        wordEyebrow.className = 'word-modal-eyebrow';
        wordEyebrow.textContent = 'WORD';
        wordPane.appendChild(wordEyebrow);
        moveField(wordPane, 'input-word-text', 'word-modal-word-field');

        const meaningPane = document.createElement('section');
        meaningPane.className = 'word-modal-meaning-pane';
        const meaningEyebrow = document.createElement('div');
        meaningEyebrow.className = 'word-modal-eyebrow';
        meaningEyebrow.textContent = 'MEANING';
        meaningPane.append(meaningEyebrow, editor);

        hero.append(wordPane, meaningPane);
        section.insertBefore(hero, section.firstChild);

        const memoBlock = document.createElement('section');
        memoBlock.className = 'word-modal-memo-block';
        moveField(memoBlock, 'input-word-memo', 'word-modal-memo-field');
        hero.insertAdjacentElement('afterend', memoBlock);

        const metadata = document.createElement('section');
        metadata.className = 'word-modal-meta-grid';
        moveField(metadata, 'input-word-surface-text');
        moveField(metadata, 'input-word-part-of-speech');
        moveField(metadata, 'input-word-tags');
        moveField(metadata, 'input-word-context', 'word-modal-context-field');
        memoBlock.insertAdjacentElement('afterend', metadata);
    }

'''
text = replace_once(text, anchor, modal_layout + anchor, 'modal layout functions')

text = replace_once(
    text,
    '''    function loadFromContext(force = false) {\n        ensureEditor();\n''',
    '''    function loadFromContext(force = false) {\n        ensureEditor();\n        ensureModalLayout();\n''',
    'loadFromContext modal layout hook'
)

style_anchor = '''            #word-senses-editor { margin: 4px 0 14px; }\n'''
style_block = '''            #word-senses-editor { margin: 4px 0 14px; }\n            #form-word-section.word-modal-rich { display:block; }\n            .word-modal-hero { display:grid; grid-template-columns:minmax(180px,.78fr) minmax(300px,1.35fr); gap:24px; align-items:start; padding:10px 0 18px; border-bottom:1px solid #e9ecef; }\n            .word-modal-eyebrow { margin-bottom:7px; color:#9a7b60; font-size:.66rem; font-weight:850; letter-spacing:.16em; }\n            .word-modal-field { min-width:0; }\n            .word-modal-field>label { display:block; margin:0 0 5px; color:#687078; font-size:.72rem; font-weight:750; }\n            .word-modal-word-field>label { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }\n            .word-modal-word-field #input-word-text { width:100%; margin:0!important; padding:4px 2px 8px!important; border:0!important; border-bottom:2px solid #e0e3e6!important; border-radius:0!important; background:transparent!important; box-shadow:none!important; color:#25292d; font-size:clamp(1.6rem,4.5vw,2.25rem)!important; font-weight:850; line-height:1.15; }\n            .word-modal-word-field #input-word-text:focus { border-bottom-color:var(--primary,#8d5a2b)!important; outline:none; }\n            .word-modal-meaning-pane #word-senses-editor { margin:0; }\n            .word-modal-meaning-pane .word-senses-title { display:none; }\n            .word-modal-meaning-pane .word-senses-list { gap:4px; }\n            .word-modal-meaning-pane .word-senses-section-label { margin:0 0 1px; font-size:.67rem; letter-spacing:.04em; }\n            .word-modal-meaning-pane .word-senses-other-label { margin-top:7px; }\n            .word-modal-meaning-pane .word-sense-row { grid-template-columns:28px minmax(0,1fr) auto 30px; gap:5px; padding:2px 0; border:0; border-radius:0; background:transparent; box-shadow:none; }\n            .word-modal-meaning-pane .word-sense-row.is-context { background:transparent; }\n            .word-modal-meaning-pane .word-sense-row.is-secondary { padding:1px 0; background:transparent; }\n            .word-modal-meaning-pane .word-sense-context-toggle { min-height:30px; color:#6d7278; font-size:1.05rem; }\n            .word-modal-meaning-pane .word-sense-row.is-context .word-sense-context-toggle { color:var(--primary,#8d5a2b); }\n            .word-modal-meaning-pane .word-sense-remove { min-height:30px; font-size:.95rem; }\n            .word-modal-meaning-pane .word-sense-context-badge { padding:2px 6px; font-size:.62rem; }\n            .word-modal-meaning-pane .word-sense-meaning { padding:3px 2px!important; border:0!important; background:transparent!important; box-shadow:none!important; }\n            .word-modal-meaning-pane .word-sense-row.is-context .word-sense-meaning { color:var(--primary,#8d5a2b); font-size:1.2rem; font-weight:850; line-height:1.35; }\n            .word-modal-meaning-pane .word-sense-row.is-secondary .word-sense-meaning { color:#2f3439; font-size:.93rem; font-weight:650; line-height:1.4; }\n            .word-modal-meaning-pane .word-sense-row.is-secondary .word-sense-meaning::placeholder { color:#a2a8ae; }\n            .word-modal-meaning-pane .word-senses-actions { margin-top:8px; }\n            .word-modal-meaning-pane .word-senses-actions button { padding:6px 8px; border:0; background:transparent; color:#65707a; font-size:.76rem; text-align:left; }\n            .word-modal-memo-block { padding:15px 0 13px; border-bottom:1px solid #eceff1; }\n            .word-modal-memo-field>label { margin-bottom:6px; color:#25292d; font-size:.92rem; font-weight:850; }\n            .word-modal-memo-field #input-word-memo { width:100%; min-height:72px; margin:0!important; padding:10px 12px!important; border:1px solid #e4e7ea!important; border-radius:10px!important; background:#fafbfc!important; color:#2f3439; font-size:.92rem; line-height:1.55; resize:vertical; }\n            .word-modal-meta-grid { display:grid; grid-template-columns:1.15fr .85fr 1fr; gap:10px 12px; padding-top:13px; }\n            .word-modal-meta-grid input, .word-modal-meta-grid select, .word-modal-meta-grid textarea { width:100%; margin:0!important; box-sizing:border-box; }\n            .word-modal-meta-grid input, .word-modal-meta-grid select { min-height:38px; }\n            .word-modal-context-field { grid-column:1/-1; }\n            .word-modal-context-field textarea { min-height:78px; }\n'''
text = replace_once(text, style_anchor, style_block, 'word modal styles')

mobile_anchor = '''                .word-senses-actions { display:grid; grid-template-columns:1fr; }\n                .word-senses-actions button { width:100%; text-align:left; }\n'''
mobile_block = '''                .word-senses-actions { display:grid; grid-template-columns:1fr; }\n                .word-senses-actions button { width:100%; text-align:left; }\n                .word-modal-hero { grid-template-columns:1fr; gap:14px; padding-top:4px; }\n                .word-modal-word-field #input-word-text { font-size:1.7rem!important; }\n                .word-modal-meaning-pane .word-sense-row { grid-template-columns:26px minmax(0,1fr) 30px; }\n                .word-modal-meaning-pane .word-sense-context-badge { grid-column:2; justify-self:start; margin-top:-2px; }\n                .word-modal-meaning-pane .word-sense-remove { grid-column:3; grid-row:1 / span 2; }\n                .word-modal-meaning-pane .word-sense-row.is-context .word-sense-meaning { font-size:1.08rem; }\n                .word-modal-meaning-pane .word-sense-row.is-secondary .word-sense-meaning { font-size:.88rem; }\n                .word-modal-memo-block { padding-top:12px; }\n                .word-modal-meta-grid { grid-template-columns:1fr 1fr; }\n                .word-modal-context-field { grid-column:1/-1; }\n'''
text = replace_once(text, mobile_anchor, mobile_block, 'word modal mobile styles')

text = replace_once(
    text,
    '''        ensureEditor();\n        wrapSave();\n''',
    '''        ensureEditor();\n        ensureModalLayout();\n        wrapSave();\n''',
    'init modal layout hook'
)
path.write_text(text)

# --- Study history: keep secondary meanings as part of Study too ----------
path = Path('flashcard-study.js')
text = path.read_text()
old = '''            const initial = current.initialStates instanceof Map ? current.initialStates.get(key) : null;\n            words.push({\n                key,\n                articleId: entry.articleId ?? entry.article?.id ?? null,\n                articleTitle: String(entry.articleTitle || entry.article?.name || ''),\n                chapterId: entry.chapterId ?? null,\n                chapterTitle: String(entry.chapterTitle || ''),\n                word: String(entry.word.word || entry.word.surfaceText || ''),\n                meaning: resolveStudyMeaning(entry.word),\n'''
new = '''            const initial = current.initialStates instanceof Map ? current.initialStates.get(key) : null;\n            const senseDisplay = resolveStudySenseDisplay(entry.word);\n            words.push({\n                key,\n                articleId: entry.articleId ?? entry.article?.id ?? null,\n                articleTitle: String(entry.articleTitle || entry.article?.name || ''),\n                chapterId: entry.chapterId ?? null,\n                chapterTitle: String(entry.chapterTitle || ''),\n                word: String(entry.word.word || entry.word.surfaceText || ''),\n                meaning: senseDisplay.meaning,\n                otherMeanings: [...senseDisplay.otherMeanings],\n'''
text = replace_once(text, old, new, 'Study history sense snapshot')
path.write_text(text)

path = Path('study-center.js')
text = path.read_text()
old = '''                                        ${(Array.isArray(session.words) ? session.words : []).map(item => `<div><strong>${escapeHtml(item.word || '—')}</strong><span>${escapeHtml(item.meaning || '')}</span><b class="result-${escapeHtml(item.finalResult || '')}">${resultMark(item.finalResult)}</b></div>`).join('') || '<span>単語詳細はありません。</span>'}\n'''
new = '''                                        ${(Array.isArray(session.words) ? session.words : []).map(item => `<div><strong>${escapeHtml(item.word || '—')}</strong><span class="study-center-history-meaning-stack"><em>${escapeHtml(item.meaning || '')}</em>${Array.isArray(item.otherMeanings) && item.otherMeanings.length ? `<small>${item.otherMeanings.map(value => `・${escapeHtml(value)}`).join('<br>')}</small>` : ''}</span><b class="result-${escapeHtml(item.finalResult || '')}">${resultMark(item.finalResult)}</b></div>`).join('') || '<span>単語詳細はありません。</span>'}\n'''
text = replace_once(text, old, new, 'Study history multi meanings')
path.write_text(text)

path = Path('study-center.css')
css = path.read_text()
css += '''\n.study-center-history-meaning-stack{display:grid;gap:2px;min-width:0}.study-center-history-meaning-stack em{font-style:normal;color:#4a545d}.study-center-history-meaning-stack small{color:#8a949d;font-size:.72rem;line-height:1.35}\n'''
path.write_text(css)

path = Path('index.html')
index = path.read_text()
for old, new, label in [
    ('flashcard-study.js?v=1.13', 'flashcard-study.js?v=1.14', 'flashcard cache'),
    ('study-center.css?v=8', 'study-center.css?v=9', 'study center css cache'),
    ('study-center.js?v=9', 'study-center.js?v=10', 'study center js cache'),
    ('word-senses.js?v=4', 'word-senses.js?v=5', 'word senses cache'),
]:
    if old not in index:
        raise SystemExit(f'missing target: {label}')
    index = index.replace(old, new, 1)
path.write_text(index)
