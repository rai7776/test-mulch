from pathlib import Path

path = Path('word-senses.js')
text = path.read_text()

old = """        card.classList.add('global-vocabulary-sense-rich');
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
"""

new = """        card.querySelector(':scope > .global-vocabulary-card-memo-preview')?.remove();

        // Keep the normal one-line Global Vocabulary card when there is only one meaning.
        // Only switch to the taller stacked layout when secondary meanings actually exist.
        if (!display.others.length) {
            card.classList.remove('global-vocabulary-sense-rich');
            meaning.classList.remove('global-vocabulary-meaning-stack');
            meaning.textContent = display.context.meaning;
            return card;
        }

        card.classList.add('global-vocabulary-sense-rich');
        meaning.classList.add('global-vocabulary-meaning-stack');
        meaning.replaceChildren();

        const primary = document.createElement('div');
        primary.className = 'global-vocabulary-primary-sense';
        primary.textContent = display.context.meaning;
        meaning.appendChild(primary);

        const secondary = document.createElement('div');
        secondary.className = 'global-vocabulary-secondary-senses';
        secondary.setAttribute('aria-label', 'その他の意味');
        display.others.forEach(sense => {
            const row = document.createElement('span');
            row.textContent = sense.meaning;
            secondary.appendChild(row);
        });
        meaning.appendChild(secondary);
        return card;
"""

if old not in text:
    raise SystemExit('Global Vocabulary enhancement block not found')
text = text.replace(old, new, 1)

text = text.replace("""            .global-vocabulary-card-memo-preview { margin:12px 0 2px 54px; padding-top:10px; border-top:1px solid #edf0f2; }
            .global-vocabulary-card-memo-label { margin-bottom:4px; color:#30363b; font-size:.78rem; font-weight:800; }
            .global-vocabulary-card-memo-text { color:#535b62; font-size:.88rem; line-height:1.5; white-space:pre-wrap; overflow-wrap:anywhere; }
""", "", 1)
text = text.replace("                .global-vocabulary-card-memo-preview { margin-left:43px; }\n", "", 1)
path.write_text(text)

index_path = Path('index.html')
index = index_path.read_text()
if 'word-senses.js?v=7' not in index:
    raise SystemExit('expected word-senses cache version not found')
index_path.write_text(index.replace('word-senses.js?v=7', 'word-senses.js?v=8', 1))
