/* Vocabulary highlights use paragraph text offsets instead of matching HTML markup.
 * This handles registered terms split by note/problem spans, and optional surfaceText
 * aliases, without changing saved word data or reader anchors. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SmartReaderVocabularyHighlights = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const HAN = /^\p{Script=Han}$/u;
    const SPECIAL = new Set(Array.from('\\.^$*+?()[]{}|'));

    function isEligible(value, isChinese) {
        const chars = Array.from(String(value || '').trim());
        return chars.length >= 2 || (isChinese && chars.length === 1 && HAN.test(chars[0]));
    }

    function escapeRegExp(value) {
        return Array.from(String(value)).map(char => SPECIAL.has(char) ? '\\' + char : char).join('');
    }

    function wordCandidates(word, options) {
        const surface = String(options.getSurfaceText ? options.getSurfaceText(word) :
            word?.surfaceText || word?.anchor?.selectedText || word?.word || '').trim();
        const canonical = String(word?.word || '').trim();
        const candidates = [];
        if (isEligible(surface, options.isChinese)) candidates.push(surface);
        // Imported/edited words sometimes have a stale or different surfaceText.
        // The canonical word can still occur verbatim in a Chinese article.
        if (options.isChinese && canonical !== surface && isEligible(canonical, true)) candidates.push(canonical);
        return candidates;
    }

    function findMatches(text, words, chapterId, options = {}) {
        const source = String(text || '');
        const candidates = [];
        (Array.isArray(words) ? words : []).forEach((word, wordIndex) => {
            if (!word || (word.chapterId !== undefined && word.chapterId !== null
                && word.chapterId !== '' && String(word.chapterId) !== String(chapterId))) return;
            wordCandidates(word, options).forEach((term, priority) => {
                const regex = new RegExp(escapeRegExp(term), 'giu');
                for (const match of source.matchAll(regex)) {
                    candidates.push({
                        start: match.index, end: match.index + match[0].length,
                        wordIndex, priority
                    });
                }
            });
        });
        // Prefer longer vocabulary entries; do not nest highlights for overlapping terms.
        candidates.sort((a, b) => (b.end - b.start) - (a.end - a.start)
            || a.priority - b.priority || a.wordIndex - b.wordIndex || a.start - b.start);
        const selected = [];
        candidates.forEach(candidate => {
            if (!selected.some(existing => candidate.start < existing.end && existing.start < candidate.end)) {
                selected.push(candidate);
            }
        });
        return selected.sort((a, b) => a.start - b.start);
    }

    function paragraphParts(paragraph, doc) {
        const walker = doc.createTreeWalker(paragraph, 4);
        const parts = [];
        let offset = 0;
        while (walker.nextNode()) {
            const node = walker.currentNode;
            if (!node.nodeValue || node.parentElement?.closest?.('button, script, style')) continue;
            const start = offset;
            offset += node.nodeValue.length;
            parts.push({
                node, start, end: offset,
                scope: node.parentElement?.closest?.('.question-marker, .problem-highlight') || null
            });
        }
        return { parts, text: parts.map(part => part.node.nodeValue).join('') };
    }

    function groupParts(parts, match) {
        const groups = [];
        for (const part of parts) {
            const start = Math.max(match.start, part.start);
            const end = Math.min(match.end, part.end);
            if (start >= end) continue;
            let group = groups[groups.length - 1];
            // Never extract the question marker's play/open button into a word span.
            if (!group || group.scope !== part.scope) {
                group = { scope: part.scope, first: { node: part.node, offset: start - part.start } };
                groups.push(group);
            }
            group.last = { node: part.node, offset: end - part.start };
        }
        return groups;
    }

    function wrapGroup(doc, group, wordIndex, word, options) {
        const range = doc.createRange();
        range.setStart(group.first.node, group.first.offset);
        range.setEnd(group.last.node, group.last.offset);
        const fragment = range.extractContents();
        const span = doc.createElement('span');
        span.className = 'word-highlight';
        span.dataset.wordIndex = String(wordIndex);
        span.dataset.type = 'word';
        const hasId = options.hasWordId
            ? options.hasWordId(word?.id)
            : word?.id !== undefined && word?.id !== null && word?.id !== '';
        if (hasId) span.dataset.jumpId = String(word.id);
        span.appendChild(fragment);
        range.insertNode(span);
    }

    function apply(display, words, chapterId, options = {}) {
        if (!display || !display.ownerDocument?.createRange) return 0;
        const doc = display.ownerDocument;
        let highlighted = 0;
        display.querySelectorAll('p[data-paragraph-index]').forEach(paragraph => {
            const { parts, text } = paragraphParts(paragraph, doc);
            const matches = findMatches(text, words, chapterId, options);
            // Process right-to-left so earlier text-node offsets remain stable.
            for (let i = matches.length - 1; i >= 0; i--) {
                const match = matches[i];
                const groups = groupParts(parts, match);
                for (let j = groups.length - 1; j >= 0; j--) {
                    wrapGroup(doc, groups[j], match.wordIndex, words[match.wordIndex], options);
                }
                if (groups.length) highlighted++;
            }
        });
        return highlighted;
    }

    return Object.freeze({ isEligible, findMatches, apply });
});
