/* Overlay sentence controls without adding any nodes inside the Reader paragraphs.
 * The paragraph controls remain as a safe fallback if range geometry is unavailable. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SmartReaderSentenceOverlay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const states = new WeakMap();
    const BUTTON_HEIGHT = 28;
    const MIN_WIDTH = 230;

    function textParts(paragraph) {
        const parts = [];
        const walker = paragraph.ownerDocument.createTreeWalker(paragraph, 4);
        let offset = 0;
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (!node.nodeValue || node.parentElement?.closest?.('button, .reader-sentence-controls')) continue;
            const start = offset;
            offset += node.nodeValue.length;
            parts.push({ node, start, end: offset });
        }
        return parts;
    }

    function lastCharacterRect(doc, parts, sentence) {
        const trailing = String(sentence.text || '').match(/\s*$/u)?.[0].length || 0;
        const end = sentence.end - trailing;
        if (end <= sentence.start) return null;
        const position = end - 1; // Sentence offsets use UTF-16, as do DOM text ranges.
        const part = parts.find(item => position >= item.start && position < item.end);
        if (!part) return null;
        const from = position - part.start;
        const range = doc.createRange();
        range.setStart(part.node, from);
        range.setEnd(part.node, from + 1);
        const rects = Array.from(range.getClientRects?.() || []);
        return rects.find(rect => rect.width > 0 && rect.height > 0) || null;
    }

    function clearMenu(state) {
        if (state.dismissMenu) {
            state.doc.removeEventListener('pointerdown', state.dismissMenu, true);
            state.dismissMenu = null;
        }
        state.menu?.remove();
        state.menu = null;
        if (state.menuMarker) state.menuMarker.setAttribute('aria-expanded', 'false');
        state.menuMarker = null;
    }

    function showMenu(state, marker, entries, top) {
        if (state.menuMarker === marker) { clearMenu(state); return; }
        clearMenu(state);
        const menu = state.doc.createElement('div');
        menu.className = 'reader-sentence-overlay-menu';
        menu.setAttribute('role', 'group');
        menu.setAttribute('aria-label', '再生する文を選ぶ');
        const viewportY = top - state.display.scrollTop;
        const availableBelow = state.display.clientHeight - viewportY;
        const estimatedHeight = Math.min(entries.length, 5) * 36 + 12;
        menu.style.top = Math.max(0, Math.round(availableBelow < estimatedHeight + 30
            ? top - estimatedHeight - 6 : top + BUTTON_HEIGHT + 6)) + 'px';
        menu.style.right = '44px';
        entries.forEach(({ record }, index) => {
            const option = state.doc.createElement('button');
            option.type = 'button';
            option.className = 'reader-sentence-overlay-option';
            option.dataset.preview = String(index + 1) + '. ' + record.text.trim().slice(0, 38);
            option.setAttribute('aria-label', '文' + (index + 1) + 'を再生: ' + record.text.trim());
            option.addEventListener('click', event => {
                event.stopPropagation();
                clearMenu(state);
                state.play(record);
            });
            menu.appendChild(option);
        });
        marker.setAttribute('aria-expanded', 'true');
        state.overlay.appendChild(menu);
        state.menu = menu;
        state.menuMarker = marker;
        const dismiss = event => {
            if (!menu.contains(event.target) && event.target !== marker) clearMenu(state);
        };
        state.dismissMenu = dismiss;
        state.doc.addEventListener('pointerdown', dismiss, true);
    }

    function readerSelectionActive(state) {
        const selection = state.doc.getSelection?.();
        if (!selection || selection.isCollapsed || !selection.rangeCount) return false;
        try {
            return state.display.contains(selection.getRangeAt(0).commonAncestorContainer);
        } catch (_) {
            return false;
        }
    }

    function render(state) {
        const { display, doc, overlay } = state;
        // Safari's selection handles are sensitive even to unrelated DOM writes.
        // Defer layout changes until native text selection has ended.
        if (readerSelectionActive(state)) {
            state.pendingWhileSelecting = true;
            return display.classList.contains('reader-sentence-overlay-ready');
        }
        state.pendingWhileSelecting = false;
        clearMenu(state);
        if (!display.classList.contains('sentence-audio-visible') ||
            !state.records.length || !doc.createRange || display.clientWidth < MIN_WIDTH) {
            display.classList.remove('reader-sentence-overlay-ready');
            overlay.replaceChildren();
            return false;
        }
        // Reserve a right gutter *before* taking measurements. Only the text layout
        // changes; no original text node or selection range is reconstructed.
        display.classList.add('reader-sentence-overlay-ready');
        const frame = display.getBoundingClientRect();
        const positions = [];
        const cache = new Map();
        try {
            for (const record of state.records) {
                const paragraph = record.paragraph;
                if (!paragraph || !display.contains(paragraph)) throw Error('Detached speech paragraph');
                let parts = cache.get(paragraph);
                if (!parts) { parts = textParts(paragraph); cache.set(paragraph, parts); }
                const rect = lastCharacterRect(doc, parts, record);
                if (!rect) throw Error('Sentence geometry unavailable');
                const top = rect.top - frame.top + display.scrollTop - display.clientTop
                    + (rect.height - BUTTON_HEIGHT) / 2;
                if (!Number.isFinite(top)) throw Error('Invalid sentence position');
                positions.push({ record, top });
            }
        } catch (_) {
            // If Safari cannot locate a sentence end, retain paragraph controls.
            display.classList.remove('reader-sentence-overlay-ready');
            overlay.replaceChildren();
            return false;
        }
        positions.sort((a, b) => a.top - b.top);
        // Multiple sentence endings on the same visual line share one gutter
        // button with a short chooser instead of overlapping touch targets.
        const groups = [];
        positions.forEach(entry => {
            let group = groups[groups.length - 1];
            if (!group || entry.top - group.lastTop >= 32) {
                group = { top: entry.top, lastTop: entry.top, entries: [] };
                groups.push(group);
            }
            group.entries.push(entry);
            group.lastTop = entry.top;
        });
        const fragment = doc.createDocumentFragment();
        groups.forEach(group => {
            const count = group.entries.length;
            const marker = doc.createElement('button');
            marker.type = 'button';
            marker.className = 'reader-sentence-overlay-trigger';
            marker.dataset.count = String(count);
            marker.style.top = Math.max(0, Math.round(group.top)) + 'px';
            marker.style.right = '8px';
            marker.setAttribute('aria-label', count === 1
                ? 'この文を再生: ' + group.entries[0].record.text.trim()
                : 'この位置の' + count + '文から再生する文を選ぶ');
            marker.title = count === 1 ? 'この文を再生／停止' : count + '文から選んで再生';
            if (count > 1) marker.setAttribute('aria-expanded', 'false');
            marker.addEventListener('click', event => {
                event.stopPropagation();
                if (count === 1) state.play(group.entries[0].record);
                else showMenu(state, marker, group.entries, group.top);
            });
            group.entries.forEach(entry => { entry.record.overlayButton = marker; });
            fragment.appendChild(marker);
        });
        overlay.replaceChildren(fragment);
        return true;
    }

    function detach(state) {
        clearMenu(state);
        if (state.frame) state.view?.cancelAnimationFrame?.(state.frame);
        state.view?.removeEventListener?.('resize', state.schedule);
        state.view?.visualViewport?.removeEventListener?.('resize', state.schedule);
        state.doc.removeEventListener('selectionchange', state.onSelectionChange);
        state.observer?.disconnect();
        state.display.removeEventListener('scroll', state.closeOnScroll);
        state.overlay.remove();
        state.display.classList.remove('reader-sentence-overlay-ready');
    }

    function attach(display, records, play) {
        if (!display) return;
        const previous = states.get(display);
        if (previous) detach(previous);
        const doc = display.ownerDocument;
        if (!doc?.createRange || !doc.createTreeWalker || !doc.createElement) {
            states.delete(display);
            return;
        }
        const overlay = doc.createElement('div');
        overlay.className = 'reader-sentence-overlay';
        overlay.setAttribute('role', 'group');
        overlay.setAttribute('aria-label', '文ごとの音声再生');
        display.appendChild(overlay);
        const view = doc.defaultView;
        const state = {
            display, records: (records || []).filter(record => record.paragraph), play,
            doc, view, overlay, frame: 0, observer: null, menu: null, menuMarker: null, dismissMenu: null
        };
        state.closeOnScroll = () => clearMenu(state);
        state.schedule = () => {
            if (states.get(display) !== state || state.frame) return;
            if (!view?.requestAnimationFrame) { render(state); return; }
            state.frame = view.requestAnimationFrame(() => {
                state.frame = 0;
                if (states.get(display) === state) render(state);
            });
        };
        state.onSelectionChange = () => {
            if (state.pendingWhileSelecting && !readerSelectionActive(state)) state.schedule();
        };
        states.set(display, state);
        doc.addEventListener('selectionchange', state.onSelectionChange);
        view?.addEventListener?.('resize', state.schedule);
        view?.visualViewport?.addEventListener?.('resize', state.schedule);
        display.addEventListener('scroll', state.closeOnScroll, { passive: true });
        if (view?.ResizeObserver) {
            state.observer = new view.ResizeObserver(state.schedule);
            state.observer.observe(display);
            const paragraphs = [...new Set(state.records.map(record => record.paragraph))];
            if (paragraphs.length <= 250) paragraphs.forEach(paragraph => state.observer.observe(paragraph));
        }
        doc.fonts?.ready?.then?.(() => {
            if (states.get(display) === state) state.schedule();
        });
        render(state);
    }

    function refresh(display) {
        const state = display && states.get(display);
        if (state) return render(state);
        return false;
    }

    return Object.freeze({ attach, refresh });
});