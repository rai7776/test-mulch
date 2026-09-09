(function () {
    'use strict';

    const state = {
        rows: [],
        baseStructure: null,
        dirty: false,
        loadedKey: null,
        nextId: 1
    };

    function clone(value) {
        if (value == null) return value;
        try { return structuredClone(value); } catch (_) { return JSON.parse(JSON.stringify(value)); }
    }

    function noteSection() {
        return document.getElementById('form-note-section');
    }

    function editorRoot() {
        return document.getElementById('note-structure-editor');
    }

    function currentNote() {
        try {
            if (typeof currentArticle === 'undefined' || !currentArticle || !Array.isArray(currentArticle.notes)) return null;
            const id = typeof editingId === 'undefined' ? null : editingId;
            const sourceIndex = typeof editingSourceIndex === 'undefined' ? null : editingSourceIndex;
            if (typeof resolveArticleCollectionIndex === 'function') {
                const index = resolveArticleCollectionIndex(currentArticle.notes, id, sourceIndex);
                return index >= 0 ? currentArticle.notes[index] : null;
            }
            if (id !== null && id !== undefined) {
                return currentArticle.notes.find(note => note && String(note.id) === String(id)) || null;
            }
        } catch (_) {}
        return null;
    }

    function modalKey() {
        const note = currentNote();
        if (note?.id !== undefined && note?.id !== null) return `note:${note.id}`;
        const id = typeof editingId === 'undefined' ? null : editingId;
        const sourceIndex = typeof editingSourceIndex === 'undefined' ? null : editingSourceIndex;
        return `new:${String(id)}:${String(sourceIndex)}`;
    }

    function uniqueId() {
        const used = new Set(state.rows.map(row => String(row.id || '')));
        while (used.has(`u${state.nextId}`)) state.nextId += 1;
        return `u${state.nextId++}`;
    }

    function selectionFromOriginal() {
        const input = document.getElementById('input-note-eng');
        if (!input) return { text: '', occurrence: 1 };
        const source = String(input.value || '');
        const start = Number(input.selectionStart || 0);
        const end = Number(input.selectionEnd || 0);
        const raw = start !== end ? source.slice(start, end) : '';
        const text = raw.trim();
        if (!text) return { text: '', occurrence: 1 };
        const offset = raw.indexOf(text);
        const actualStart = Math.max(0, start + Math.max(0, offset));
        let occurrence = 0;
        let from = 0;
        while (from <= actualStart) {
            const found = source.indexOf(text, from);
            if (found < 0 || found > actualStart) break;
            occurrence += 1;
            if (found === actualStart) break;
            from = found + Math.max(1, text.length);
        }
        return { text, occurrence: Math.max(1, occurrence) };
    }

    function addCore(label) {
        const selected = selectionFromOriginal();
        state.rows.push({ id: uniqueId(), text: selected.text, occurrence: selected.occurrence, kind: 'core', label });
        state.dirty = true;
        const details = editorRoot()?.querySelector('details');
        if (details) details.open = true;
        renderRows();
    }

    function addModifier() {
        const selected = selectionFromOriginal();
        state.rows.push({ id: uniqueId(), text: selected.text, occurrence: selected.occurrence, kind: 'modifier', notation: 'square' });
        state.dirty = true;
        const details = editorRoot()?.querySelector('details');
        if (details) details.open = true;
        renderRows();
    }

    function addTarget() {
        const selected = selectionFromOriginal();
        state.rows.push({ id: uniqueId(), text: selected.text, occurrence: selected.occurrence, kind: 'target' });
        state.dirty = true;
        renderRows();
    }

    function findRange(source, needle, occurrence) {
        if (window.SmartReaderNoteStructureUI?.findOccurrenceRange) {
            return window.SmartReaderNoteStructureUI.findOccurrenceRange(source, needle, occurrence);
        }
        const target = String(needle || '');
        const count = Number(occurrence) > 0 ? Number(occurrence) : 1;
        if (!target) return null;
        let from = 0;
        let index = -1;
        for (let i = 0; i < count; i += 1) {
            index = String(source || '').indexOf(target, from);
            if (index < 0) return null;
            from = index + Math.max(1, target.length);
        }
        return { start: index, end: index + target.length };
    }

    function validate(showStatus = true) {
        const source = String(document.getElementById('input-note-eng')?.value || '');
        const errors = [];
        const ranges = [];
        const ids = new Set();
        state.rows.forEach((row, index) => {
            const label = `#${index + 1}`;
            const id = String(row.id || '');
            if (!id || ids.has(id)) errors.push(`${label}: IDが重複しています`);
            ids.add(id);
            const text = String(row.text || '').trim();
            const occurrence = Number(row.occurrence);
            if (!text) errors.push(`${label}: 対象語句を入力してください`);
            if (!Number.isInteger(occurrence) || occurrence < 1) errors.push(`${label}: 出現回数は1以上にしてください`);
            if (row.kind === 'core' && !String(row.label || '').trim()) errors.push(`${label}: S/V/O/Cなどのラベルを入力してください`);
            if (row.kind === 'modifier' && !['angle', 'square', 'round'].includes(row.notation)) errors.push(`${label}: 括弧種類を選んでください`);
            if (text && Number.isInteger(occurrence) && occurrence > 0) {
                const range = findRange(source, text, occurrence);
                if (!range) errors.push(`${label}: 原文内に「${text}」の${occurrence}回目が見つかりません`);
                else ranges.push({ ...range, index });
            }
        });
        for (let i = 0; i < ranges.length; i += 1) {
            for (let j = i + 1; j < ranges.length; j += 1) {
                const a = ranges[i], b = ranges[j];
                const same = a.start === b.start && a.end === b.end;
                const crossing = a.start < b.start && b.start < a.end && a.end < b.end;
                const reverseCrossing = b.start < a.start && a.start < b.end && b.end < a.end;
                if (same) errors.push(`#${a.index + 1} と #${b.index + 1}: 同じ範囲が重複しています`);
                else if (crossing || reverseCrossing) errors.push(`#${a.index + 1} と #${b.index + 1}: 範囲が交差しています`);
            }
        }
        if (showStatus) {
            const status = document.getElementById('note-structure-editor-status');
            if (status) {
                status.textContent = errors.length ? errors[0] : (state.rows.length ? `${state.rows.length}要素を登録します` : '文構造なし');
                status.classList.toggle('is-error', errors.length > 0);
            }
        }
        return { ok: errors.length === 0, errors };
    }

    function buildStructure() {
        if (!state.rows.length) return null;
        const ids = new Set(state.rows.map(row => String(row.id)));
        const annotations = state.rows.map(row => {
            const annotation = { ...row, occurrence: Math.max(1, Number(row.occurrence) || 1) };
            annotation.text = String(annotation.text || '').trim();
            annotation.kind = ['core', 'modifier', 'target'].includes(annotation.kind) ? annotation.kind : 'target';
            if (annotation.kind === 'core') {
                annotation.label = String(annotation.label || '').trim();
                delete annotation.notation;
            } else if (annotation.kind === 'modifier') {
                annotation.notation = ['angle', 'square', 'round'].includes(annotation.notation) ? annotation.notation : 'square';
                delete annotation.label;
            } else {
                delete annotation.label;
                delete annotation.notation;
            }
            return annotation;
        });
        const base = clone(state.baseStructure) || {};
        const relations = Array.isArray(base.relations)
            ? base.relations.filter(rel => rel && ids.has(String(rel.from)) && ids.has(String(rel.to))).map(rel => ({ ...rel }))
            : [];
        return { ...base, annotations, relations };
    }

    function updatePreview() {
        const preview = document.getElementById('note-structure-editor-preview');
        if (!preview) return;
        preview.replaceChildren();
        const source = String(document.getElementById('input-note-eng')?.value || '');
        if (!source || !state.rows.length) {
            preview.textContent = '要素を追加するとここにプレビューが表示されます。';
            preview.classList.add('is-empty');
            validate();
            return;
        }
        const result = validate();
        if (!result.ok) {
            preview.textContent = '原文と文構造の指定を確認してください。';
            preview.classList.add('is-empty');
            return;
        }
        preview.classList.remove('is-empty');
        const structure = buildStructure();
        const sentence = window.SmartReaderNoteStructureUI?.buildStructureSentence?.(source, structure);
        if (sentence) preview.appendChild(sentence);
        else preview.textContent = source;
    }

    function renderRow(row, index) {
        const card = document.createElement('div');
        card.className = 'note-structure-editor-row';
        card.dataset.annotationId = String(row.id || '');

        const top = document.createElement('div');
        top.className = 'note-structure-editor-row-top';

        const kind = document.createElement('select');
        kind.className = 'note-structure-editor-kind';
        kind.setAttribute('aria-label', '文構造の種類');
        [['core', 'S/V/O/C'], ['modifier', '修飾'], ['target', '接続点']].forEach(([value, text]) => {
            const option = document.createElement('option'); option.value = value; option.textContent = text; kind.appendChild(option);
        });
        kind.value = row.kind || 'core';
        kind.addEventListener('change', () => {
            row.kind = kind.value;
            if (row.kind === 'core' && !row.label) row.label = 'S';
            if (row.kind === 'modifier' && !row.notation) row.notation = 'square';
            state.dirty = true;
            renderRows();
        });

        const textInput = document.createElement('input');
        textInput.type = 'text';
        textInput.className = 'note-structure-editor-text';
        textInput.placeholder = '原文中の語句';
        textInput.value = row.text || '';
        textInput.addEventListener('input', () => { row.text = textInput.value; state.dirty = true; updatePreview(); });

        const occurrence = document.createElement('input');
        occurrence.type = 'number'; occurrence.min = '1'; occurrence.step = '1';
        occurrence.className = 'note-structure-editor-occurrence';
        occurrence.title = '原文内で何回目に現れる語句か';
        occurrence.value = String(row.occurrence || 1);
        occurrence.addEventListener('input', () => { row.occurrence = Math.max(1, Number(occurrence.value) || 1); state.dirty = true; updatePreview(); });

        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'note-structure-editor-remove'; remove.textContent = '×'; remove.setAttribute('aria-label', `${index + 1}番目の要素を削除`);
        remove.addEventListener('click', () => { state.rows.splice(index, 1); state.dirty = true; renderRows(); });

        top.append(kind, textInput, occurrence, remove);
        card.appendChild(top);

        const options = document.createElement('div');
        options.className = 'note-structure-editor-row-options';
        if (row.kind === 'core') {
            const label = document.createElement('input');
            label.type = 'text'; label.className = 'note-structure-editor-label'; label.placeholder = 'S / V / O / C / V\'';
            label.setAttribute('list', 'note-structure-label-options');
            label.value = row.label || '';
            label.addEventListener('input', () => { row.label = label.value; state.dirty = true; updatePreview(); });
            const caption = document.createElement('span'); caption.textContent = 'ラベル';
            options.append(caption, label);
        } else if (row.kind === 'modifier') {
            const notation = document.createElement('select');
            notation.className = 'note-structure-editor-notation';
            [['square', '[ ]'], ['angle', '《 》'], ['round', '( )']].forEach(([value, text]) => {
                const option = document.createElement('option'); option.value = value; option.textContent = text; notation.appendChild(option);
            });
            notation.value = row.notation || 'square';
            notation.addEventListener('change', () => { row.notation = notation.value; state.dirty = true; updatePreview(); });
            const caption = document.createElement('span'); caption.textContent = '囲み';
            options.append(caption, notation);
        } else {
            const note = document.createElement('span'); note.textContent = '将来の矢印用接続点。現在は表示されません。'; options.appendChild(note);
        }
        card.appendChild(options);
        return card;
    }

    function renderRows() {
        const list = document.getElementById('note-structure-editor-rows');
        if (!list) return;
        list.replaceChildren();
        if (!state.rows.length) {
            const empty = document.createElement('div');
            empty.className = 'note-structure-editor-empty';
            empty.textContent = 'まだ文構造は設定されていません。原文の語句を選択して下のボタンから追加できます。';
            list.appendChild(empty);
        } else {
            state.rows.forEach((row, index) => list.appendChild(renderRow(row, index)));
        }
        const count = document.getElementById('note-structure-editor-count');
        if (count) count.textContent = state.rows.length ? `${state.rows.length}要素` : '未設定';
        updatePreview();
    }

    function installEditor() {
        if (editorRoot()) return;
        const section = noteSection();
        if (!section) return;
        const extra = document.getElementById('input-note-extra');
        if (!extra) return;
        const labels = Array.from(section.querySelectorAll('label'));
        const extraLabel = labels.find(label => label.textContent.includes('解説・解釈')) || extra;

        const root = document.createElement('div');
        root.id = 'note-structure-editor';
        root.innerHTML = `
            <details>
                <summary><span>文構造（任意）</span><small id="note-structure-editor-count">未設定</small></summary>
                <div class="note-structure-editor-body">
                    <p class="note-structure-editor-help">原文欄で語句を選択してから追加すると自動入力されます。V'・S1などは追加後に変更できます。</p>
                    <div id="note-structure-editor-rows"></div>
                    <div class="note-structure-editor-actions" aria-label="文構造を追加">
                        <button type="button" data-add-core="S">＋S</button>
                        <button type="button" data-add-core="V">＋V</button>
                        <button type="button" data-add-core="O">＋O</button>
                        <button type="button" data-add-core="C">＋C</button>
                        <button type="button" data-add-modifier>＋修飾</button>
                    </div>
                    <div class="note-structure-editor-preview-wrap">
                        <div class="note-structure-editor-preview-title">プレビュー</div>
                        <div id="note-structure-editor-preview" class="note-structure-editor-preview is-empty"></div>
                    </div>
                    <div id="note-structure-editor-status" class="note-structure-editor-status" role="status" aria-live="polite"></div>
                </div>
            </details>
            <datalist id="note-structure-label-options">
                <option value="S"><option value="V"><option value="O"><option value="C"><option value="M">
                <option value="S'"><option value="V'"><option value="O'"><option value="C'">
                <option value="S1"><option value="V1"><option value="O1"><option value="C1">
                <option value="S2"><option value="V2"><option value="O2"><option value="C2">
            </datalist>`;
        section.insertBefore(root, extraLabel);
        root.querySelectorAll('[data-add-core]').forEach(button => button.addEventListener('click', () => addCore(button.dataset.addCore)));
        root.querySelector('[data-add-modifier]')?.addEventListener('click', addModifier);
        document.getElementById('input-note-eng')?.addEventListener('input', updatePreview);
    }

    function loadFromContext(force = false) {
        installEditor();
        const section = noteSection();
        if (!section || getComputedStyle(section).display === 'none') return;
        const key = modalKey();
        if (!force && state.loadedKey === key) return;
        const note = currentNote();
        state.baseStructure = note?.structure ? clone(note.structure) : null;
        state.rows = Array.isArray(state.baseStructure?.annotations) ? state.baseStructure.annotations.map(annotation => ({ ...clone(annotation) })) : [];
        state.dirty = false;
        state.loadedKey = key;
        state.nextId = 1;
        const details = editorRoot()?.querySelector('details');
        if (details) details.open = state.rows.length > 0;
        renderRows();
    }

    function resetContext() {
        state.rows = [];
        state.baseStructure = null;
        state.dirty = false;
        state.loadedKey = null;
        state.nextId = 1;
        renderRows();
    }

    function installStyles() {
        if (document.getElementById('note-structure-editor-style')) return;
        const style = document.createElement('style');
        style.id = 'note-structure-editor-style';
        style.textContent = `
            #note-structure-editor { margin: 10px 0 12px; }
            #note-structure-editor details { border: 1px solid #dfe3e8; border-radius: 9px; background: #fafbfc; overflow: hidden; }
            #note-structure-editor summary { cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 11px; font-weight: 700; color: #404a55; user-select: none; }
            #note-structure-editor summary small { font-size: .72rem; color: #7b8590; font-weight: 600; }
            .note-structure-editor-body { border-top: 1px solid #e7eaee; padding: 11px; }
            .note-structure-editor-help { margin: 0 0 10px; font-size: .76rem; line-height: 1.55; color: #6b7580; }
            .note-structure-editor-row { border: 1px solid #e1e5e9; border-radius: 8px; padding: 8px; margin-bottom: 8px; background: #fff; }
            .note-structure-editor-row-top { display: grid; grid-template-columns: minmax(86px, .8fr) minmax(130px, 2fr) 58px 34px; gap: 6px; align-items: center; }
            .note-structure-editor-row input, .note-structure-editor-row select { min-width: 0; width: 100%; box-sizing: border-box; }
            .note-structure-editor-occurrence { text-align: center; }
            .note-structure-editor-remove { min-width: 34px; height: 34px; border-radius: 7px; border: 1px solid #e0e4e8; background: #fff; color: #7a3f3f; font-size: 1rem; }
            .note-structure-editor-row-options { display: flex; align-items: center; gap: 7px; margin-top: 7px; font-size: .72rem; color: #717b85; }
            .note-structure-editor-row-options input, .note-structure-editor-row-options select { max-width: 160px; }
            .note-structure-editor-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
            .note-structure-editor-actions button { min-height: 36px; padding: 6px 10px; border: 1px solid #d7dde3; border-radius: 8px; background: #fff; color: #3f4b56; font-weight: 700; }
            .note-structure-editor-target-add { opacity: .72; }
            .note-structure-editor-empty { padding: 11px; border: 1px dashed #d4dae0; border-radius: 8px; font-size: .76rem; line-height: 1.5; color: #7b858f; }
            .note-structure-editor-preview-wrap { margin-top: 11px; border-top: 1px solid #e7eaee; padding-top: 9px; }
            .note-structure-editor-preview-title { font-size: .72rem; font-weight: 700; color: #66717c; margin-bottom: 5px; }
            .note-structure-editor-preview { min-height: 38px; padding: 8px 9px; border-radius: 8px; background: #fff; border: 1px solid #e5e8eb; overflow-x: auto; }
            .note-structure-editor-preview .note-structure-sentence { font-size: .88rem; }
            .note-structure-editor-preview.is-empty { display: flex; align-items: center; font-size: .72rem; color: #9199a1; }
            .note-structure-editor-status { min-height: 1.2em; margin-top: 7px; font-size: .72rem; color: #66717c; }
            .note-structure-editor-status.is-error { color: #ad3f3f; }
            @media (max-width: 600px) {
                .note-structure-editor-row-top { grid-template-columns: 92px minmax(0, 1fr) 54px 34px; }
                .note-structure-editor-actions button { flex: 1 1 56px; }
                .note-structure-editor-target-add { flex-basis: 100% !important; }
            }
        `;
        document.head.appendChild(style);
    }

    function wrapGlobal(name, after, before) {
        const original = window[name];
        if (typeof original !== 'function' || original.__noteStructureEditorWrapped) return;
        const wrapped = function (...args) {
            if (before) before(...args);
            const result = original.apply(this, args);
            const finish = () => after && after(...args);
            if (result && typeof result.then === 'function') return result.then(value => { finish(); return value; });
            setTimeout(finish, 0);
            return result;
        };
        wrapped.__noteStructureEditorWrapped = true;
        window[name] = wrapped;
    }

    function wrapSave() {
        const original = window.handleUnifiedSave;
        if (typeof original !== 'function' || original.__noteStructureEditorWrapped) return;
        const wrapped = async function (event) {
            const section = noteSection();
            const isNote = section && getComputedStyle(section).display !== 'none';
            if (!isNote) return original.apply(this, arguments);

            const check = validate(true);
            if (!check.ok) {
                event?.preventDefault?.();
                const details = editorRoot()?.querySelector('details');
                if (details) details.open = true;
                document.getElementById('note-structure-editor-status')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                return;
            }

            let articleRef = null;
            let editIndex = -1;
            let beforeLength = 0;
            try {
                articleRef = typeof currentArticle !== 'undefined' ? currentArticle : null;
                if (articleRef && Array.isArray(articleRef.notes)) {
                    beforeLength = articleRef.notes.length;
                    const id = typeof editingId === 'undefined' ? null : editingId;
                    const sourceIndex = typeof editingSourceIndex === 'undefined' ? null : editingSourceIndex;
                    editIndex = typeof resolveArticleCollectionIndex === 'function'
                        ? resolveArticleCollectionIndex(articleRef.notes, id, sourceIndex)
                        : -1;
                }
            } catch (_) {}

            const pendingStructure = state.dirty ? buildStructure() : null;
            const wasDirty = state.dirty;
            const result = await original.apply(this, arguments);

            if (wasDirty && articleRef && Array.isArray(articleRef.notes)) {
                let targetIndex = editIndex;
                if (targetIndex < 0 && articleRef.notes.length > beforeLength) targetIndex = articleRef.notes.length - 1;
                if (targetIndex >= 0 && articleRef.notes[targetIndex]) {
                    if (pendingStructure) articleRef.notes[targetIndex].structure = pendingStructure;
                    else delete articleRef.notes[targetIndex].structure;
                    if (typeof saveToDB === 'function') await saveToDB();
                    try {
                        if (typeof currentTab !== 'undefined' && currentTab === 'notes' && typeof renderList === 'function') {
                            renderList('notes', document.getElementById('list-search')?.value || '');
                        }
                    } catch (_) {}
                    window.SmartReaderNoteStructureUI?.refresh?.();
                }
            }
            resetContext();
            return result;
        };
        wrapped.__noteStructureEditorWrapped = true;
        window.handleUnifiedSave = wrapped;
    }

    function init() {
        installStyles();
        installEditor();
        wrapGlobal('showUnifiedModal', () => loadFromContext(true));
        wrapGlobal('switchModalType', () => loadFromContext(false));
        wrapGlobal('openUnifiedModal', () => loadFromContext(true));
        wrapGlobal('closeModal', resetContext);
        wrapSave();

        const overlay = document.getElementById('unified-modal-overlay');
        if (overlay) {
            new MutationObserver(() => {
                const section = noteSection();
                const visible = section && getComputedStyle(section).display !== 'none' && getComputedStyle(overlay).display !== 'none';
                if (visible) loadFromContext(false);
                else if (getComputedStyle(overlay).display === 'none') resetContext();
            }).observe(overlay, { attributes: true, attributeFilter: ['class', 'style'] });
        }
        document.addEventListener('click', event => {
            if (event.target?.closest?.('#unified-modal-overlay')) setTimeout(() => loadFromContext(false), 0);
        });
    }

    window.SmartReaderNoteStructureEditor = {
        validate,
        buildStructure,
        refresh: () => loadFromContext(true)
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
