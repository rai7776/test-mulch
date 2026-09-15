from pathlib import Path

path = Path('word-senses.js')
text = path.read_text()

old = '''    function renderRows() {
        const list = byId('word-senses-list');
        if (!list) return;
        ensureContext();
        list.replaceChildren();
        if (!state.rows.length) {
            const empty = document.createElement('div');
            empty.className = 'word-senses-empty';
            empty.textContent = '意味を追加してください。';
            list.appendChild(empty);
        }
        state.rows.forEach((row, index) => {
            const card = document.createElement('div');
            card.className = 'word-sense-row';
            const contextButton = document.createElement('button');
            contextButton.type = 'button';
            contextButton.className = 'word-sense-context-toggle';
            contextButton.setAttribute('aria-label', 'この文脈の意味にする');
            contextButton.textContent = row.id === state.contextSenseId ? '●' : '○';
            contextButton.addEventListener('click', () => {
                state.contextSenseId = row.id;
                state.dirty = true;
                syncLegacyMeaning();
                renderRows();
            });

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'word-sense-meaning';
            input.placeholder = '意味を入力';
            input.value = row.meaning || '';
            input.addEventListener('input', () => {
                row.meaning = input.value;
                state.dirty = true;
                syncLegacyMeaning();
                setStatus('');
            });

            const badge = document.createElement('span');
            badge.className = 'word-sense-context-badge';
            badge.textContent = 'この文脈';
            badge.hidden = row.id !== state.contextSenseId;

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'word-sense-remove';
            remove.textContent = '×';
            remove.setAttribute('aria-label', `${index + 1}番目の意味を外す`);
            remove.addEventListener('click', () => {
                const wasContext = row.id === state.contextSenseId;
                state.rows.splice(index, 1);
                if (wasContext) state.contextSenseId = state.rows[0]?.id || null;
                state.dirty = true;
                syncLegacyMeaning();
                renderRows();
                if (state.pickerOpen) renderExistingCandidates();
            });

            card.append(contextButton, input, badge, remove);
            list.appendChild(card);
        });
        syncLegacyMeaning();
    }
'''

new = '''    function renderRows() {
        const list = byId('word-senses-list');
        if (!list) return;
        ensureContext();
        list.replaceChildren();
        if (!state.rows.length) {
            const empty = document.createElement('div');
            empty.className = 'word-senses-empty';
            empty.textContent = '意味を追加してください。';
            list.appendChild(empty);
            syncLegacyMeaning();
            return;
        }

        const orderedRows = state.rows
            .map((row, sourceIndex) => ({ row, sourceIndex }))
            .sort((left, right) => {
                const leftContext = left.row.id === state.contextSenseId ? 0 : 1;
                const rightContext = right.row.id === state.contextSenseId ? 0 : 1;
                return leftContext - rightContext || left.sourceIndex - right.sourceIndex;
            });
        let secondaryHeadingAdded = false;

        orderedRows.forEach(({ row, sourceIndex }, visualIndex) => {
            const isContext = row.id === state.contextSenseId;
            if (isContext) {
                const heading = document.createElement('div');
                heading.className = 'word-senses-section-label word-senses-context-label';
                heading.textContent = '文脈の意味';
                list.appendChild(heading);
            } else if (!secondaryHeadingAdded) {
                const heading = document.createElement('div');
                heading.className = 'word-senses-section-label word-senses-other-label';
                heading.textContent = 'その他の意味';
                list.appendChild(heading);
                secondaryHeadingAdded = true;
            }

            const card = document.createElement('div');
            card.className = `word-sense-row ${isContext ? 'is-context' : 'is-secondary'}`;
            const contextButton = document.createElement('button');
            contextButton.type = 'button';
            contextButton.className = 'word-sense-context-toggle';
            contextButton.setAttribute('aria-label', isContext ? '現在の文脈の意味' : 'この文脈の意味にする');
            contextButton.textContent = isContext ? '●' : '○';
            contextButton.addEventListener('click', () => {
                state.contextSenseId = row.id;
                state.dirty = true;
                syncLegacyMeaning();
                renderRows();
            });

            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'word-sense-meaning';
            input.placeholder = isContext ? 'この文脈での意味' : 'その他の意味';
            input.value = row.meaning || '';
            input.addEventListener('input', () => {
                row.meaning = input.value;
                state.dirty = true;
                syncLegacyMeaning();
                setStatus('');
            });

            const badge = document.createElement('span');
            badge.className = 'word-sense-context-badge';
            badge.textContent = 'この文脈';
            badge.hidden = !isContext;

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'word-sense-remove';
            remove.textContent = '×';
            remove.setAttribute('aria-label', `${visualIndex + 1}番目の意味を外す`);
            remove.addEventListener('click', () => {
                const wasContext = row.id === state.contextSenseId;
                state.rows.splice(sourceIndex, 1);
                if (wasContext) state.contextSenseId = state.rows[0]?.id || null;
                state.dirty = true;
                syncLegacyMeaning();
                renderRows();
                if (state.pickerOpen) renderExistingCandidates();
            });

            card.append(contextButton, input, badge, remove);
            list.appendChild(card);
        });
        syncLegacyMeaning();
    }
'''

if old not in text:
    raise SystemExit('renderRows target not found')
text = text.replace(old, new, 1)

text = text.replace(
"            .word-senses-list { display: grid; gap: 8px; }\n            .word-sense-row { display:grid; grid-template-columns: 34px minmax(0,1fr) auto 36px; gap:8px; align-items:center; padding:8px 9px; border:1px solid #dfe3e7; border-radius:10px; background:#fff; }\n",
"            .word-senses-list { display: grid; gap: 7px; }\n            .word-senses-section-label { margin:3px 2px 0; color:#7c858d; font-size:.72rem; font-weight:800; letter-spacing:.02em; }\n            .word-senses-other-label { margin-top:7px; color:#939ba2; }\n            .word-sense-row { display:grid; grid-template-columns: 34px minmax(0,1fr) auto 36px; gap:8px; align-items:center; padding:8px 9px; border:1px solid #dfe3e7; border-radius:10px; background:#fff; }\n            .word-sense-row.is-context { border-color:#d8cabd; background:#fffdf9; box-shadow:0 2px 8px rgba(84,66,48,.05); }\n            .word-sense-row.is-secondary { padding-top:6px; padding-bottom:6px; border-color:#e7eaed; background:#fafbfc; }\n",
1)
text = text.replace(
"            .word-sense-meaning { min-width:0; width:100%; border:0!important; padding:7px 4px!important; margin:0!important; background:transparent!important; box-shadow:none!important; font-size:1rem; }\n",
"            .word-sense-meaning { min-width:0; width:100%; border:0!important; padding:7px 4px!important; margin:0!important; background:transparent!important; box-shadow:none!important; font-size:1rem; }\n            .word-sense-row.is-context .word-sense-meaning { font-size:1.04rem; font-weight:700; color:#343a40; }\n            .word-sense-row.is-secondary .word-sense-meaning { padding-top:5px!important; padding-bottom:5px!important; color:#727b83; font-size:.88rem; font-weight:500; }\n            .word-sense-row.is-secondary .word-sense-context-toggle { color:#9ba2a8; font-size:1.05rem; }\n",
1)

index_path = Path('index.html')
index = index_path.read_text()
if 'word-senses.js?v=2' not in index:
    raise SystemExit('word-senses cache target not found')
index = index.replace('word-senses.js?v=2', 'word-senses.js?v=3', 1)

path.write_text(text)
index_path.write_text(index)
