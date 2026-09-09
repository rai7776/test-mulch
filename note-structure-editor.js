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

    function countOccurrences(source, needle) {
        const text = String(source || '');
        const target = String(needle || '').trim();
        if (!target) return 0;
        let count = 0;
        let from = 0;
        while (from <= text.length - target.length) {
            const found = text.indexOf(target, from);
            if (found < 0) break;
            count += 1;
            from = found + Math.max(1, target.length);
        }
        return count;
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
        textInput.addEventListener('input', () => { row.text = textInput.value; syncOccurrenceControl(); state.dirty = true; updatePreview(); });

        const occurrenceWrap = document.createElement('label');
        occurrenceWrap.className = 'note-structure-editor-occurrence-wrap';
        const occurrenceCaption = document.createElement('span');
        occurrenceCaption.textContent = '出現位置';
        const occurrenceSelect = document.createElement('select');
        occurrenceSelect.className = 'note-structure-editor-occurrence';
        occurrenceSelect.setAttribute('aria-label', '原文中の出現位置');
        occurrenceWrap.append(occurrenceCaption, occurrenceSelect);

        function syncOccurrenceControl() {
            const source = String(document.getElementById('input-note-eng')?.value || '');
            const total = countOccurrences(source, row.text);
            occurrenceSelect.replaceChildren();
            if (total <= 1) {
                row.occurrence = 1;
                occurrenceWrap.hidden = true;
                return;
            }
            occurrenceWrap.hidden = false;
            const current = Math.min(total, Math.max(1, Number(row.occurrence) || 1));
            row.occurrence = current;
            for (let n = 1; n <= total; n += 1) {
                const option = document.createElement('option');
                option.value = String(n);
                option.textContent = `${n}回目 / ${total}`;
                occurrenceSelect.appendChild(option);
            }
            occurrenceSelect.value = String(current);
        }
        occurrenceSelect.addEventListener('change', () => {
            row.occurrence = Math.max(1, Number(occurrenceSelect.value) || 1);
            state.dirty = true;
            updatePreview();
        });
        syncOccurrenceControl();

        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'note-structure-editor-remove'; remove.textContent = '×'; remove.setAttribute('aria-label', `${index + 1}番目の要素を削除`);
        remove.addEventListener('click', () => { state.rows.splice(index, 1); state.dirty = true; renderRows(); });

        top.append(kind, textInput, remove);
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
        options.appendChild(occurrenceWrap);
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

    function extractAiJsonCandidate(raw) {
        const input = String(raw || '').trim();
        const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenced) return fenced[1].trim();
        const first = input.indexOf('{');
        const last = input.lastIndexOf('}');
        if (first >= 0 && last > first) return input.slice(first, last + 1).trim();
        return input;
    }

    function validateImportedStructure(structure, source) {
        if (!structure || typeof structure !== 'object' || Array.isArray(structure)) {
            throw new Error('structure はオブジェクトにしてください。');
        }
        const annotations = structure.annotations;
        const relations = structure.relations == null ? [] : structure.relations;
        if (!Array.isArray(annotations)) throw new Error('structure.annotations は配列にしてください。');
        if (!Array.isArray(relations)) throw new Error('structure.relations は配列にしてください。');
        const ids = new Set();
        const ranges = [];
        annotations.forEach((annotation, index) => {
            if (!annotation || typeof annotation !== 'object' || Array.isArray(annotation)) throw new Error(`annotation #${index + 1} が不正です。`);
            const id = String(annotation.id || '').trim();
            const text = String(annotation.text || '').trim();
            const occurrence = Number(annotation.occurrence == null ? 1 : annotation.occurrence);
            const kind = String(annotation.kind || '');
            if (!id) throw new Error(`annotation #${index + 1}: id が必要です。`);
            if (ids.has(id)) throw new Error(`annotation #${index + 1}: id「${id}」が重複しています。`);
            ids.add(id);
            if (!text) throw new Error(`annotation #${index + 1}: text が必要です。`);
            if (!Number.isInteger(occurrence) || occurrence < 1) throw new Error(`annotation #${index + 1}: occurrence は1以上の整数にしてください。`);
            if (!['core', 'modifier', 'target'].includes(kind)) throw new Error(`annotation #${index + 1}: kind が不正です。`);
            if (kind === 'core' && !String(annotation.label || '').trim()) throw new Error(`annotation #${index + 1}: core には label が必要です。`);
            if (kind === 'modifier' && !['angle', 'square', 'round'].includes(annotation.notation)) throw new Error(`annotation #${index + 1}: modifier の notation が不正です。`);
            const range = findRange(source, text, occurrence);
            if (!range) throw new Error(`annotation #${index + 1}: 原文に「${text}」の${occurrence}回目が見つかりません。`);
            ranges.push({ ...range, index });
        });
        for (let i = 0; i < ranges.length; i += 1) {
            for (let j = i + 1; j < ranges.length; j += 1) {
                const a = ranges[i], b = ranges[j];
                const same = a.start === b.start && a.end === b.end;
                const crossing = a.start < b.start && b.start < a.end && a.end < b.end;
                const reverseCrossing = b.start < a.start && a.start < b.end && b.end < a.end;
                if (same) throw new Error(`annotation #${a.index + 1} と #${b.index + 1} が同じ範囲を重複指定しています。`);
                if (crossing || reverseCrossing) throw new Error(`annotation #${a.index + 1} と #${b.index + 1} の範囲が交差しています。`);
            }
        }
        relations.forEach((relation, index) => {
            if (!relation || typeof relation !== 'object' || Array.isArray(relation)) throw new Error(`relation #${index + 1} が不正です。`);
            if (relation.type !== 'modifies') throw new Error(`relation #${index + 1}: type は modifies にしてください。`);
            if (!ids.has(String(relation.from || ''))) throw new Error(`relation #${index + 1}: from の接続先が見つかりません。`);
            if (!ids.has(String(relation.to || ''))) throw new Error(`relation #${index + 1}: to の接続先が見つかりません。`);
        });
        return {
            ...clone(structure),
            annotations: annotations.map(annotation => ({ ...clone(annotation), occurrence: Math.max(1, Number(annotation.occurrence) || 1) })),
            relations: relations.map(relation => ({ ...clone(relation) }))
        };
    }

    function resolveAiJsonPayload(payload) {
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('JSONオブジェクトを貼り付けてください。');
        let note = null;
        let structure = null;
        if (payload.format !== undefined || payload.version !== undefined || Array.isArray(payload.notes)) {
            if (payload.format !== 'smart-reader-bulk') throw new Error('bulk形式の format は smart-reader-bulk にしてください。');
            if (Number(payload.version) !== 2) throw new Error('この画面では smart-reader-bulk v2 を使用してください。');
            if (!Array.isArray(payload.notes) || payload.notes.length !== 1) throw new Error('この画面への取り込みでは notes を1件だけにしてください。');
            note = payload.notes[0];
            structure = note?.structure;
        } else if (payload.structure !== undefined) {
            note = payload;
            structure = payload.structure;
        } else if (Array.isArray(payload.annotations) || Array.isArray(payload.relations)) {
            structure = payload;
        }
        if (!structure) throw new Error('structure / annotations が見つかりません。');
        const source = note && Object.prototype.hasOwnProperty.call(note, 'originalText')
            ? String(note.originalText || '')
            : String(document.getElementById('input-note-eng')?.value || '');
        if (!source.trim()) throw new Error('原文がありません。note.originalText を含めるか、先に原文を入力してください。');
        return { note, structure: validateImportedStructure(structure, source), source };
    }

    function setAiJsonStatus(message, isError = false) {
        const status = document.getElementById('note-structure-ai-json-status');
        if (!status) return;
        status.textContent = message || '';
        status.classList.toggle('is-error', !!isError);
    }

    function toggleAiJsonPanel(show) {
        const panel = document.getElementById('note-structure-ai-json-panel');
        if (!panel) return;
        const next = show === undefined ? panel.hidden : !!show;
        panel.hidden = !next;
        if (next) {
            setAiJsonStatus('');
            setTimeout(() => document.getElementById('note-structure-ai-json-input')?.focus(), 0);
        }
    }

    function importAiJson() {
        const textarea = document.getElementById('note-structure-ai-json-input');
        try {
            const candidate = extractAiJsonCandidate(textarea?.value || '');
            if (!candidate) throw new Error('AIのJSONを貼り付けてください。');
            let payload;
            try { payload = JSON.parse(candidate); }
            catch (_) { throw new Error('JSONとして読み取れません。AIにはJSONのみを出力させてください。'); }
            const resolved = resolveAiJsonPayload(payload);
            const note = resolved.note;
            if (note && Object.prototype.hasOwnProperty.call(note, 'originalText')) document.getElementById('input-note-eng').value = String(note.originalText || '');
            if (note && Object.prototype.hasOwnProperty.call(note, 'translation')) document.getElementById('input-note-trans').value = String(note.translation || '');
            if (note && Object.prototype.hasOwnProperty.call(note, 'extra')) document.getElementById('input-note-extra').value = String(note.extra || '');
            state.baseStructure = clone(resolved.structure);
            state.rows = resolved.structure.annotations.map(annotation => ({ ...clone(annotation) }));
            state.dirty = true;
            state.nextId = 1;
            const details = editorRoot()?.querySelector('details');
            if (details) details.open = true;
            renderRows();
            setAiJsonStatus(`${state.rows.length}要素を取り込みました。内容を確認して「保存」を押してください。`);
        } catch (error) {
            setAiJsonStatus(error?.message || 'AI JSONを取り込めませんでした。', true);
        }
    }

    function buildAiInstruction() {
        const source = String(document.getElementById('input-note-eng')?.value || '').trim();
        return `次の英文をSmart Reader用に文構造解析してください。回答は説明文やMarkdownを付けず、JSONオブジェクトのみを出力してください。\n\n英文:\n${source || '（ここに英文）'}\n\n形式:\n{\n  "originalText": "英文",\n  "translation": "自然な日本語訳",\n  "structure": {\n    "annotations": [\n      {"id":"a1","text":"対象語句","occurrence":1,"kind":"core","label":"S"},\n      {"id":"a2","text":"修飾範囲","occurrence":1,"kind":"modifier","notation":"square"}\n    ],\n    "relations": []\n  },\n  "extra": "構文・語法・解釈の説明"\n}\n\nルール:\n- text は originalText に実際に存在する連続した文字列をそのまま使う\n- occurrence は同じ文字列が複数ある場合の出現順。通常は1\n- kind=core は label に S/V/O/C/S'/V'/O'/C'/S1/V1/O1/C1/S2/V2/O2/C2 などを指定\n- kind=modifier は notation を square / angle / round から指定\n- 大きな修飾範囲の中にcoreやmodifierを入れ子にしてよい\n- 範囲を部分的に交差させない\n- relations は必要な場合のみ type=modifies、from/to はannotation idを指定\n- 矢印表示は現在使わないため、relationsが不要なら空配列でよい`;
    }

    async function copyAiInstruction() {
        const text = buildAiInstruction();
        try {
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
            else throw new Error('clipboard unavailable');
            setAiJsonStatus('AI用の指示をコピーしました。');
        } catch (_) {
            const helper = document.createElement('textarea');
            helper.value = text;
            helper.style.position = 'fixed';
            helper.style.opacity = '0';
            document.body.appendChild(helper);
            helper.select();
            const ok = document.execCommand('copy');
            helper.remove();
            setAiJsonStatus(ok ? 'AI用の指示をコピーしました。' : 'コピーできませんでした。', !ok);
        }
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
                    <p class="note-structure-editor-help">原文欄で語句を選択してから追加すると自動入力されます。V'・S1などは追加後に変更できます。同じ語句が原文に複数ある場合だけ「出現位置」が表示されます。</p>
                    <div id="note-structure-editor-rows"></div>
                    <div class="note-structure-editor-actions" aria-label="文構造を追加">
                        <button type="button" data-add-core="S">＋S</button>
                        <button type="button" data-add-core="V">＋V</button>
                        <button type="button" data-add-core="O">＋O</button>
                        <button type="button" data-add-core="C">＋C</button>
                        <button type="button" data-add-modifier>＋修飾</button>
                        <button type="button" class="note-structure-ai-json-open" data-ai-json-open>✨ AI JSON</button>
                    </div>
                    <div id="note-structure-ai-json-panel" class="note-structure-ai-json-panel" hidden>
                        <div class="note-structure-ai-json-head"><strong>AIから取り込む</strong><button type="button" data-ai-json-close aria-label="AI JSON欄を閉じる">×</button></div>
                        <p>AIが返したJSONを貼り付けます。現在の文構造を置き換えます。note形式なら原文・訳・解説も反映します。</p>
                        <textarea id="note-structure-ai-json-input" rows="8" placeholder='{"annotations":[...],"relations":[]}'></textarea>
                        <div class="note-structure-ai-json-actions">
                            <button type="button" data-ai-json-prompt>AI用指示をコピー</button>
                            <button type="button" class="note-structure-ai-json-import" data-ai-json-import>取り込む</button>
                        </div>
                        <div id="note-structure-ai-json-status" class="note-structure-ai-json-status" role="status" aria-live="polite"></div>
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
        root.querySelector('[data-ai-json-open]')?.addEventListener('click', () => toggleAiJsonPanel());
        root.querySelector('[data-ai-json-close]')?.addEventListener('click', () => toggleAiJsonPanel(false));
        root.querySelector('[data-ai-json-import]')?.addEventListener('click', importAiJson);
        root.querySelector('[data-ai-json-prompt]')?.addEventListener('click', copyAiInstruction);
        document.getElementById('input-note-eng')?.addEventListener('input', renderRows);
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
            .note-structure-editor-row-top { display: grid; grid-template-columns: minmax(86px, .8fr) minmax(130px, 2fr) 34px; gap: 6px; align-items: center; }
            .note-structure-editor-row input, .note-structure-editor-row select { min-width: 0; width: 100%; box-sizing: border-box; }
            .note-structure-editor-occurrence-wrap { display: flex; align-items: center; gap: 6px; margin-left: auto; white-space: nowrap; color: #67727d; }
            .note-structure-editor-occurrence-wrap[hidden] { display: none !important; }
            .note-structure-editor-occurrence-wrap select { width: auto; min-width: 104px; }
            .note-structure-editor-remove { min-width: 34px; height: 34px; border-radius: 7px; border: 1px solid #e0e4e8; background: #fff; color: #7a3f3f; font-size: 1rem; }
            .note-structure-editor-row-options { display: flex; align-items: center; gap: 7px; margin-top: 7px; font-size: .72rem; color: #717b85; }
            .note-structure-editor-row-options input, .note-structure-editor-row-options select { max-width: 160px; }
            .note-structure-editor-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
            .note-structure-editor-actions button { min-height: 36px; padding: 6px 10px; border: 1px solid #d7dde3; border-radius: 8px; background: #fff; color: #3f4b56; font-weight: 700; }
            .note-structure-ai-json-open { flex-basis: 100%; border-style: dashed !important; }
            .note-structure-ai-json-panel { margin-top: 9px; padding: 10px; border: 1px solid #d9dee4; border-radius: 9px; background: #fff; }
            .note-structure-ai-json-panel[hidden] { display: none !important; }
            .note-structure-ai-json-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 5px; }
            .note-structure-ai-json-head button { border: 0; background: transparent; font-size: 1rem; color: #69737d; padding: 2px 5px; }
            .note-structure-ai-json-panel p { margin: 0 0 8px; font-size: .73rem; line-height: 1.5; color: #6d7781; }
            #note-structure-ai-json-input { width: 100%; min-height: 150px; box-sizing: border-box; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .72rem; line-height: 1.45; }
            .note-structure-ai-json-actions { display: flex; gap: 7px; margin-top: 8px; }
            .note-structure-ai-json-actions button { flex: 1 1 0; min-height: 38px; border: 1px solid #d7dde3; border-radius: 8px; background: #f7f8fa; color: #3f4b56; font-weight: 700; }
            .note-structure-ai-json-actions .note-structure-ai-json-import { background: #4b6075; border-color: #4b6075; color: #fff; }
            .note-structure-ai-json-status { min-height: 1.2em; margin-top: 7px; font-size: .72rem; color: #55705f; }
            .note-structure-ai-json-status.is-error { color: #ad3f3f; }
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
                .note-structure-editor-row-top { grid-template-columns: 92px minmax(0, 1fr) 34px; }
                .note-structure-editor-occurrence-wrap { width: 100%; justify-content: flex-start; margin-left: 0; }
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
        countOccurrences,
        refresh: () => loadFromContext(true)
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
