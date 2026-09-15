from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing target: {label}')
    return text.replace(old, new, 1)

# Global Vocabulary card: make the context sense dominant, place the other senses
# directly underneath, and surface the memo as its own block like the reference UI.
path = Path('word-senses.js')
text = path.read_text()
old = '''    function enhanceVocabularyCard(card, entry) {
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
'''
new = '''    function enhanceVocabularyCard(card, entry) {
        if (!card || !entry?.word) return card;
        const display = getSenseDisplay(entry.word);
        if (!display.context) return card;
        const summary = card.querySelector('.global-vocabulary-summary');
        const meaning = summary?.querySelector('.meaning-right');
        if (!summary || !meaning) return card;

        card.classList.add('global-vocabulary-sense-rich');
        meaning.classList.add('global-vocabulary-meaning-stack');
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

        card.querySelector(':scope > .global-vocabulary-card-memo-preview')?.remove();
        const memoText = normalizeText(entry.word?.memo || entry.memo);
        if (memoText) {
            const memo = document.createElement('div');
            memo.className = 'global-vocabulary-card-memo-preview';
            const label = document.createElement('div');
            label.className = 'global-vocabulary-card-memo-label';
            label.textContent = 'メモ';
            const body = document.createElement('div');
            body.className = 'global-vocabulary-card-memo-text';
            body.textContent = memoText;
            memo.append(label, body);
            summary.insertAdjacentElement('afterend', memo);
        }
        return card;
    }
'''
text = replace_once(text, old, new, 'enhanceVocabularyCard')

style_old = '''            .global-vocabulary-primary-sense { font-weight:700; line-height:1.35; }
            .global-vocabulary-secondary-senses { display:grid; gap:1px; margin-top:3px; color:#8a929a; font-size:.72rem; font-weight:500; line-height:1.35; }
            .global-vocabulary-secondary-senses span::before { content:'・'; }
'''
style_new = '''            .global-vocabulary-sense-rich .global-vocabulary-summary { align-items:flex-start; min-height:48px; }
            .global-vocabulary-sense-rich .word-left { align-items:flex-start; padding-top:1px; }
            .global-vocabulary-meaning-stack { display:grid; align-content:start; gap:2px; min-width:0; padding-top:1px; text-align:left; }
            .global-vocabulary-primary-sense { color:var(--primary,#8d5a2b); font-size:1.02rem; font-weight:800; line-height:1.35; overflow-wrap:anywhere; }
            .global-vocabulary-secondary-senses { display:grid; gap:1px; margin-top:4px; color:#555f68; font-size:.86rem; font-weight:600; line-height:1.4; }
            .global-vocabulary-secondary-senses span { display:block; overflow-wrap:anywhere; }
            .global-vocabulary-secondary-senses span::before { content:'・'; margin-right:2px; }
            .global-vocabulary-card-memo-preview { margin:12px 0 2px 54px; padding-top:10px; border-top:1px solid #edf0f2; }
            .global-vocabulary-card-memo-label { margin-bottom:4px; color:#30363b; font-size:.78rem; font-weight:800; }
            .global-vocabulary-card-memo-text { color:#535b62; font-size:.88rem; line-height:1.5; white-space:pre-wrap; overflow-wrap:anywhere; }
'''
text = replace_once(text, style_old, style_new, 'global vocabulary rich sense styles')
mobile_old = '''                .word-senses-actions { display:grid; grid-template-columns:1fr; }
                .word-senses-actions button { width:100%; text-align:left; }
'''
mobile_new = '''                .word-senses-actions { display:grid; grid-template-columns:1fr; }
                .word-senses-actions button { width:100%; text-align:left; }
                .global-vocabulary-sense-rich .global-vocabulary-summary { gap:10px; }
                .global-vocabulary-sense-rich .word-left { min-width:40%; }
                .global-vocabulary-meaning-stack { min-width:42%; }
                .global-vocabulary-primary-sense { font-size:.98rem; }
                .global-vocabulary-secondary-senses { font-size:.8rem; }
                .global-vocabulary-card-memo-preview { margin-left:43px; }
'''
text = replace_once(text, mobile_old, mobile_new, 'global vocabulary mobile rich sense styles')
path.write_text(text)

# Study Center: use the same sense hierarchy rather than only the context meaning.
path = Path('study-center.js')
text = path.read_text()
old = '''    function studyMeaning(word) {
        try {
            const resolved = window.SmartReaderStudy?.getWordMeaning?.(word);
            if (String(resolved || '').trim()) return String(resolved).trim();
        } catch (_) {}
        return String(word?.meaning || '').trim();
    }
'''
new = '''    function studySenseDisplay(word) {
        const legacy = String(word?.meaning || '').trim();
        try {
            const display = window.SmartReaderWordSenses?.getSenseDisplay?.(word);
            if (display?.context) {
                return {
                    meaning: String(display.context.meaning || legacy).trim(),
                    otherMeanings: Array.isArray(display.others)
                        ? display.others.map(sense => String(sense?.meaning || '').trim()).filter(Boolean)
                        : []
                };
            }
        } catch (_) {}

        const senses = Array.isArray(word?.senses)
            ? word.senses.filter(sense => sense && String(sense.meaning || '').trim())
            : [];
        const contextId = String(word?.contextSenseId || '');
        const context = senses.find(sense => String(sense?.id || '') === contextId)
            || senses.find(sense => String(sense?.meaning || '').trim() === legacy)
            || senses[0]
            || null;
        const meaning = String(context?.meaning || legacy).trim();
        const seen = new Set(meaning ? [meaning.toLocaleLowerCase()] : []);
        const otherMeanings = [];
        senses.forEach(sense => {
            if (!sense || String(sense?.id || '') === String(context?.id || '')) return;
            const value = String(sense.meaning || '').trim();
            const key = value.toLocaleLowerCase();
            if (!value || seen.has(key)) return;
            seen.add(key);
            otherMeanings.push(value);
        });
        return { meaning, otherMeanings };
    }

    function studyMeaning(word) {
        return studySenseDisplay(word).meaning;
    }
'''
text = replace_once(text, old, new, 'studySenseDisplay helper')

old = '''    function wordCard(entry) {
        const view = wordView(entry.word);
        const due = dueLabel(entry);
        const difficulty = Math.round(Number(view.weaknessScore ?? view.study?.difficultyScore) || 0);
        const source = `${entry.articleTitle}${entry.chapterTitle ? ` / ${entry.chapterTitle}` : ''}`;
        const held = !!view.suspended;
        const manualMastered = !!view.manualMastered;
        return `
            <article class="study-center-word-card ${held ? 'is-held' : ''} ${manualMastered ? 'is-manual-mastered' : ''}">
                <div class="study-center-word-main">
                    <div class="study-center-word-title-row">
                        <strong>${escapeHtml(entry.word.word || entry.word.surfaceText || '—')}</strong>
                        <span class="study-center-due-badge ${due.tone}">${escapeHtml(due.text)}</span>
                    </div>
                    <div class="study-center-word-meaning">${escapeHtml(studyMeaning(entry.word))}</div>
                    <div class="study-center-word-meta">
                        <span>苦手度 ${difficulty}</span>
                        <span>${escapeHtml(weaknessReason(view))}</span>
                        <span>前回 ${recentResult(view)}</span>
                        <span>✕${Number(view.study?.wrongCount) || 0}</span>
                    </div>
                    <small>${escapeHtml(source)}</small>
                </div>
                <div class="study-center-word-actions">
                    <button type="button" class="study-center-mini-study" data-study-one="${escapeHtml(entry.key)}" ${held ? 'disabled' : ''}>復習</button>
                    <button type="button" class="study-center-hold-action ${held ? 'active' : ''}" data-toggle-hold="${escapeHtml(entry.key)}" aria-pressed="${held}">${held ? '保留解除' : '保留'}</button>
                    <button type="button" class="study-center-master-action ${manualMastered ? 'active' : ''}" data-toggle-mastered="${escapeHtml(entry.key)}" aria-pressed="${manualMastered}" aria-label="手動で暗記済みにする">✓</button>
                </div>
            </article>
        `;
    }
'''
new = '''    function wordCard(entry) {
        const view = wordView(entry.word);
        const due = dueLabel(entry);
        const difficulty = Math.round(Number(view.weaknessScore ?? view.study?.difficultyScore) || 0);
        const source = `${entry.articleTitle}${entry.chapterTitle ? ` / ${entry.chapterTitle}` : ''}`;
        const held = !!view.suspended;
        const manualMastered = !!view.manualMastered;
        const senses = studySenseDisplay(entry.word);
        return `
            <article class="study-center-word-card ${held ? 'is-held' : ''} ${manualMastered ? 'is-manual-mastered' : ''}">
                <div class="study-center-word-main">
                    <div class="study-center-word-title-row">
                        <strong>${escapeHtml(entry.word.word || entry.word.surfaceText || '—')}</strong>
                        <span class="study-center-due-badge ${due.tone}">${escapeHtml(due.text)}</span>
                    </div>
                    <div class="study-center-word-meaning">${escapeHtml(senses.meaning)}</div>
                    ${senses.otherMeanings.length ? `<div class="study-center-word-other-meanings" aria-label="その他の意味">${senses.otherMeanings.map(item => `<span>${escapeHtml(item)}</span>`).join('')}</div>` : ''}
                    <div class="study-center-word-meta">
                        <span>苦手度 ${difficulty}</span>
                        <span>${escapeHtml(weaknessReason(view))}</span>
                        <span>前回 ${recentResult(view)}</span>
                        <span>✕${Number(view.study?.wrongCount) || 0}</span>
                    </div>
                    <small>${escapeHtml(source)}</small>
                </div>
                <div class="study-center-word-actions">
                    <button type="button" class="study-center-mini-study" data-study-one="${escapeHtml(entry.key)}" ${held ? 'disabled' : ''}>復習</button>
                    <button type="button" class="study-center-hold-action ${held ? 'active' : ''}" data-toggle-hold="${escapeHtml(entry.key)}" aria-pressed="${held}">${held ? '保留解除' : '保留'}</button>
                    <button type="button" class="study-center-master-action ${manualMastered ? 'active' : ''}" data-toggle-mastered="${escapeHtml(entry.key)}" aria-pressed="${manualMastered}" aria-label="手動で暗記済みにする">✓</button>
                </div>
            </article>
        `;
    }
'''
text = replace_once(text, old, new, 'Study Center wordCard')
path.write_text(text)

path = Path('study-center.css')
css = path.read_text()
css += '''\n.study-center-word-other-meanings{display:grid;gap:1px;margin-top:3px;color:#87909a;font-size:.78rem;font-weight:600;line-height:1.4}.study-center-word-other-meanings span{display:block;overflow-wrap:anywhere}.study-center-word-other-meanings span::before{content:'・';margin-right:2px}@media(max-width:700px){.study-center-word-other-meanings{font-size:.74rem}}\n'''
path.write_text(css)

path = Path('index.html')
index = path.read_text()
for old, new, label in [
    ('study-center.css?v=7', 'study-center.css?v=8', 'study center css cache'),
    ('study-center.js?v=8', 'study-center.js?v=9', 'study center js cache'),
    ('word-senses.js?v=3', 'word-senses.js?v=4', 'word senses cache'),
]:
    if old not in index:
        raise SystemExit(f'missing target: {label}')
    index = index.replace(old, new, 1)
path.write_text(index)
