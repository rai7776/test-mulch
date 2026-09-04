(function () {
    'use strict';

    const SAMPLE_NOTE = {
        originalText: 'The book that I bought yesterday was surprisingly expensive.',
        translation: '私が昨日買ったその本は驚くほど高かった。',
        structure: {
            annotations: [
                { id: 'a1', text: 'The book', occurrence: 1, kind: 'core', label: 'S' },
                { id: 'a2', text: 'that I bought yesterday', occurrence: 1, kind: 'modifier', notation: 'square' },
                { id: 'a3', text: 'bought', occurrence: 1, kind: 'core', label: "V'" },
                { id: 'a4', text: 'yesterday', occurrence: 1, kind: 'modifier', notation: 'angle' },
                { id: 'a5', text: 'was', occurrence: 1, kind: 'core', label: 'V' },
                { id: 'a6', text: 'expensive', occurrence: 1, kind: 'core', label: 'C' },
                { id: 'a7', text: 'surprisingly', occurrence: 1, kind: 'modifier', notation: 'angle' }
            ],
            relations: [
                { from: 'a2', to: 'a1', type: 'modifies' },
                { from: 'a4', to: 'a3', type: 'modifies' },
                { from: 'a7', to: 'a6', type: 'modifies' }
            ]
        },
        extra: 'that I bought yesterday は The book を修飾する関係詞節。'
    };

    let syncQueued = false;

    function activeNotesTab() {
        return !!document.querySelector('#panel-tabs .tab-btn.active[data-tab="notes"]');
    }

    function findOccurrenceRange(source, needle, occurrence) {
        const text = String(source || '');
        const target = String(needle || '');
        const count = Number.isInteger(Number(occurrence)) && Number(occurrence) > 0 ? Number(occurrence) : 1;
        if (!target) return null;
        let from = 0;
        let index = -1;
        for (let i = 0; i < count; i += 1) {
            index = text.indexOf(target, from);
            if (index < 0) return null;
            from = index + Math.max(1, target.length);
        }
        return { start: index, end: index + target.length };
    }

    function resolveAnnotations(originalText, structure) {
        const annotations = Array.isArray(structure?.annotations) ? structure.annotations : [];
        const resolved = [];
        annotations.forEach(annotation => {
            const range = findOccurrenceRange(originalText, annotation?.text, annotation?.occurrence);
            if (!range) return;
            resolved.push({ ...annotation, ...range, children: [] });
        });
        resolved.sort((a, b) => (a.start - b.start) || (b.end - a.end));

        const roots = [];
        const stack = [];
        resolved.forEach(item => {
            while (stack.length && item.start >= stack[stack.length - 1].end) stack.pop();
            const parent = stack[stack.length - 1];
            if (parent && item.start < parent.end) {
                if (item.end <= parent.end) parent.children.push(item);
                else return; // crossing ranges are intentionally not rendered in v1 UI
            } else {
                roots.push(item);
            }
            stack.push(item);
        });
        return roots;
    }

    function annotationElement(annotation) {
        const span = document.createElement('span');
        span.className = `syntax-annotation syntax-${annotation.kind || 'target'}`;
        span.dataset.annotationId = String(annotation.id || '');
        if (annotation.kind === 'modifier' && annotation.notation) {
            span.classList.add(`notation-${annotation.notation}`);
        }
        return span;
    }

    function appendRange(container, originalText, start, end, children) {
        let cursor = start;
        (children || []).forEach(child => {
            if (child.start > cursor) container.appendChild(document.createTextNode(originalText.slice(cursor, child.start)));
            const wrapper = annotationElement(child);
            if (child.kind === 'core') {
                const textSpan = document.createElement('span');
                textSpan.className = 'syntax-core-text';
                appendRange(textSpan, originalText, child.start, child.end, child.children);
                wrapper.appendChild(textSpan);
                const label = document.createElement('span');
                label.className = 'syntax-core-label';
                label.textContent = String(child.label || '');
                wrapper.appendChild(label);
            } else {
                appendRange(wrapper, originalText, child.start, child.end, child.children);
            }
            container.appendChild(wrapper);
            cursor = Math.max(cursor, child.end);
        });
        if (cursor < end) container.appendChild(document.createTextNode(originalText.slice(cursor, end)));
    }

    function buildStructureSentence(originalText, structure) {
        const sentence = document.createElement('div');
        sentence.className = 'note-structure-sentence';
        const roots = resolveAnnotations(originalText, structure);
        appendRange(sentence, String(originalText || ''), 0, String(originalText || '').length, roots);
        return sentence;
    }

    function buildStructureBox(note, isSample = false) {
        const details = document.createElement('details');
        details.className = 'note-structure-box';
        details.open = true;

        const summary = document.createElement('summary');
        const title = document.createElement('span');
        title.textContent = '文構造';
        summary.appendChild(title);
        if (isSample) {
            const badge = document.createElement('span');
            badge.className = 'note-structure-demo-badge';
            badge.textContent = 'SAMPLE';
            summary.appendChild(badge);
        }
        details.appendChild(summary);

        const body = document.createElement('div');
        body.className = 'note-structure-body';
        body.appendChild(buildStructureSentence(note.originalText, note.structure));
        details.appendChild(body);
        return details;
    }

    function collectStructuredNotes(root) {
        const notes = [];
        const seen = new WeakSet();
        function visit(value) {
            if (!value || typeof value !== 'object') return;
            if (seen.has(value)) return;
            seen.add(value);
            if (Array.isArray(value)) {
                value.forEach(visit);
                return;
            }
            if (Array.isArray(value.notes)) {
                value.notes.forEach(note => {
                    if (note && note.structure && Array.isArray(note.structure.annotations)) notes.push(note);
                });
            }
            Object.values(value).forEach(visit);
        }
        visit(root);
        return notes;
    }

    function findNoteForCard(card, notes) {
        const rawId = String(card.id || '').replace(/^note-card-/, '');
        if (rawId && rawId !== 'undefined' && rawId !== 'null') {
            const byId = notes.find(note => note?.id !== undefined && String(note.id) === rawId);
            if (byId) return byId;
        }
        const original = card.querySelector('.block-english')?.textContent?.trim();
        if (!original) return null;
        return notes.find(note => String(note?.originalText || '').trim() === original) || null;
    }

    function injectRealStructures(panelContent) {
        const notes = collectStructuredNotes(typeof libraryItems !== 'undefined' ? libraryItems : []);
        if (!notes.length) return;
        panelContent.querySelectorAll('.note-block-card').forEach(card => {
            if (card.dataset.structureSample === 'true' || card.querySelector(':scope > .note-structure-box')) return;
            const note = findNoteForCard(card, notes);
            if (!note?.structure) return;
            const box = buildStructureBox(note, false);
            const extra = card.querySelector(':scope > .block-extra');
            const footer = card.querySelector(':scope > .note-footer');
            card.insertBefore(box, extra || footer || null);
        });
    }

    function buildSampleCard() {
        const wrapper = document.createElement('details');
        wrapper.id = 'note-structure-sample';
        wrapper.className = 'note-structure-sample';
        wrapper.open = true;

        const summary = document.createElement('summary');
        summary.innerHTML = '<span>文構造サンプル</span><small>保存データではありません</small>';
        wrapper.appendChild(summary);

        const card = document.createElement('div');
        card.className = 'note-block-card note-structure-sample-card';
        card.dataset.structureSample = 'true';

        const english = document.createElement('div');
        english.className = 'block-english';
        english.textContent = SAMPLE_NOTE.originalText;
        card.appendChild(english);

        const divider = document.createElement('hr');
        divider.className = 'note-divider';
        card.appendChild(divider);

        const translation = document.createElement('div');
        translation.className = 'block-memo';
        translation.textContent = SAMPLE_NOTE.translation;
        card.appendChild(translation);
        card.appendChild(buildStructureBox(SAMPLE_NOTE, true));

        const extra = document.createElement('div');
        extra.className = 'block-extra';
        extra.textContent = `💡 ${SAMPLE_NOTE.extra}`;
        card.appendChild(extra);
        wrapper.appendChild(card);
        return wrapper;
    }

    function syncSample(panelContent) {
        const searchValue = String(document.getElementById('list-search')?.value || '').trim();
        let sample = document.getElementById('note-structure-sample');
        if (!activeNotesTab() || searchValue) {
            sample?.remove();
            return;
        }
        if (!sample) {
            sample = buildSampleCard();
            panelContent.insertBefore(sample, panelContent.firstChild);
        }
    }

    function sync() {
        syncQueued = false;
        const panelContent = document.getElementById('panel-content');
        if (!panelContent) return;
        if (!activeNotesTab()) {
            document.getElementById('note-structure-sample')?.remove();
            return;
        }
        injectRealStructures(panelContent);
        syncSample(panelContent);
    }

    function queueSync() {
        if (syncQueued) return;
        syncQueued = true;
        const run = () => sync();
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
        else setTimeout(run, 0);
    }

    function injectStyle() {
        if (document.getElementById('note-structure-ui-style')) return;
        const style = document.createElement('style');
        style.id = 'note-structure-ui-style';
        style.textContent = `
            .note-structure-box { margin: 10px 0 8px; border: 1px solid #dfe3e8; border-radius: 8px; background: #fbfcfd; overflow: hidden; }
            .note-structure-box > summary { cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 10px; font-size: .82rem; font-weight: 700; color: #3f4a56; user-select: none; }
            .note-structure-box > summary::-webkit-details-marker { display: none; }
            .note-structure-box > summary::before { content: '▸'; font-size: .72rem; margin-right: 4px; transition: transform .15s ease; }
            .note-structure-box[open] > summary::before { transform: rotate(90deg); }
            .note-structure-box > summary > span:first-child { margin-right: auto; }
            .note-structure-body { border-top: 1px solid #e8ebef; padding: 13px 11px 12px; overflow-x: auto; }
            .note-structure-sentence { min-width: min-content; font-size: .98rem; line-height: 2.15; color: #20252b; white-space: pre-wrap; overflow-wrap: anywhere; }
            .syntax-annotation { position: relative; }
            .syntax-core { display: inline-flex; flex-direction: column; align-items: center; vertical-align: middle; line-height: 1.15; margin: 0 1px; }
            .syntax-core-text { display: inline; }
            .syntax-core-label { margin-top: 3px; font-size: .66rem; line-height: 1; font-weight: 800; color: #59636e; letter-spacing: .03em; }
            .syntax-modifier { display: inline; position: relative; padding: 0 .08em; }
            .syntax-modifier::before, .syntax-modifier::after { font-weight: 700; color: #69737e; }
            .syntax-modifier.notation-angle::before { content: '《'; }
            .syntax-modifier.notation-angle::after { content: '》'; }
            .syntax-modifier.notation-square::before { content: '['; }
            .syntax-modifier.notation-square::after { content: ']'; }
            .syntax-modifier.notation-round::before { content: '('; }
            .syntax-modifier.notation-round::after { content: ')'; }
            .syntax-target { display: inline; }
            .note-structure-demo-badge { font-size: .62rem; padding: 2px 6px; border-radius: 999px; background: #edf1f5; color: #69737e; letter-spacing: .06em; }
            .note-structure-sample { margin: 0 0 12px; border: 1px dashed #c9d0d8; border-radius: 10px; background: #f7f9fb; }
            .note-structure-sample > summary { cursor: pointer; display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 9px 11px; font-weight: 700; color: #48525d; }
            .note-structure-sample > summary small { font-size: .67rem; font-weight: 500; color: #88919a; }
            .note-structure-sample-card { margin: 0 8px 8px; box-shadow: none; }
            @media (max-width: 600px) {
                .note-structure-body { padding: 12px 9px; }
                .note-structure-sentence { font-size: .94rem; line-height: 2.25; }
                .syntax-core-label { font-size: .62rem; }
            }
        `;
        document.head.appendChild(style);
    }

    function init() {
        injectStyle();
        const panelContent = document.getElementById('panel-content');
        const tabs = document.getElementById('panel-tabs');
        const search = document.getElementById('list-search');
        if (panelContent) new MutationObserver(queueSync).observe(panelContent, { childList: true, subtree: true });
        if (tabs) new MutationObserver(queueSync).observe(tabs, { attributes: true, subtree: true, attributeFilter: ['class'] });
        search?.addEventListener('input', queueSync);
        document.addEventListener('click', event => {
            if (event.target?.closest?.('[data-tab="notes"], #fab-toggle, #panel-expand-btn')) queueSync();
        });
        queueSync();
    }

    window.SmartReaderNoteStructureUI = {
        sample: SAMPLE_NOTE,
        findOccurrenceRange,
        resolveAnnotations,
        buildStructureSentence,
        refresh: queueSync
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
