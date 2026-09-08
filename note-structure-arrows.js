(function () {
    'use strict';

    const SVG_NS = 'http://www.w3.org/2000/svg';
    let redrawQueued = false;
    let markerSequence = 0;

    function annotationById(sentence, id) {
        const target = String(id || '');
        return Array.from(sentence.querySelectorAll('.syntax-annotation'))
            .find(node => String(node.dataset.annotationId || '') === target) || null;
    }

    function clientRects(element) {
        if (!element) return [];
        const rects = Array.from(element.getClientRects?.() || []);
        return rects.filter(rect => rect.width > 0 && rect.height > 0);
    }

    function rectCenter(rect) {
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }

    function closestRectPair(fromElement, toElement) {
        const fromRects = clientRects(fromElement);
        const toRects = clientRects(toElement);
        if (!fromRects.length || !toRects.length) return null;

        let best = null;
        let bestDistance = Infinity;
        fromRects.forEach(fromRect => {
            const fromCenter = rectCenter(fromRect);
            toRects.forEach(toRect => {
                const toCenter = rectCenter(toRect);
                const dx = toCenter.x - fromCenter.x;
                const dy = toCenter.y - fromCenter.y;
                const distance = Math.hypot(dx, dy);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = { fromRect, toRect };
                }
            });
        });
        return best;
    }

    function toContentPoint(rect, bodyRect, body, edge) {
        const centerX = rect.left + rect.width / 2 - bodyRect.left + body.scrollLeft;
        let y;
        if (edge === 'top') y = rect.top - bodyRect.top + body.scrollTop;
        else if (edge === 'bottom') y = rect.bottom - bodyRect.top + body.scrollTop;
        else y = rect.top + rect.height / 2 - bodyRect.top + body.scrollTop;
        return { x: centerX, y };
    }

    function relationGeometry(pair, bodyRect, body, lane) {
        const fromCenter = rectCenter(pair.fromRect);
        const toCenter = rectCenter(pair.toRect);
        const lineThreshold = Math.max(pair.fromRect.height, pair.toRect.height) * 0.8;
        const sameLine = Math.abs(fromCenter.y - toCenter.y) <= lineThreshold;

        if (sameLine) {
            const from = toContentPoint(pair.fromRect, bodyRect, body, 'top');
            const to = toContentPoint(pair.toRect, bodyRect, body, 'top');
            const routeY = Math.max(4, Math.min(from.y, to.y) - 7 - lane * 3);
            return {
                path: `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} C ${from.x.toFixed(1)} ${routeY.toFixed(1)}, ${to.x.toFixed(1)} ${routeY.toFixed(1)}, ${to.x.toFixed(1)} ${to.y.toFixed(1)}`,
                sameLine: true
            };
        }

        const targetBelow = toCenter.y > fromCenter.y;
        const from = toContentPoint(pair.fromRect, bodyRect, body, targetBelow ? 'bottom' : 'top');
        const to = toContentPoint(pair.toRect, bodyRect, body, targetBelow ? 'top' : 'bottom');
        const midY = (from.y + to.y) / 2;
        const bend = lane * 3;
        return {
            path: `M ${from.x.toFixed(1)} ${from.y.toFixed(1)} C ${from.x.toFixed(1)} ${(midY + bend).toFixed(1)}, ${to.x.toFixed(1)} ${(midY - bend).toFixed(1)}, ${to.x.toFixed(1)} ${to.y.toFixed(1)}`,
            sameLine: false
        };
    }

    function createSvg(body) {
        const existing = body.querySelector(':scope > .note-structure-relation-layer');
        existing?.remove();

        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.classList.add('note-structure-relation-layer');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');

        const width = Math.max(body.scrollWidth, body.clientWidth, 1);
        const height = Math.max(body.scrollHeight, body.clientHeight, 1);
        svg.setAttribute('width', String(width));
        svg.setAttribute('height', String(height));
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

        const defs = document.createElementNS(SVG_NS, 'defs');
        const marker = document.createElementNS(SVG_NS, 'marker');
        const markerId = `syntax-arrowhead-${++markerSequence}`;
        marker.setAttribute('id', markerId);
        marker.setAttribute('viewBox', '0 0 8 8');
        marker.setAttribute('refX', '7');
        marker.setAttribute('refY', '4');
        marker.setAttribute('markerWidth', '5');
        marker.setAttribute('markerHeight', '5');
        marker.setAttribute('orient', 'auto-start-reverse');
        const markerPath = document.createElementNS(SVG_NS, 'path');
        markerPath.setAttribute('d', 'M 0 0 L 8 4 L 0 8 z');
        markerPath.setAttribute('class', 'note-structure-arrowhead');
        marker.appendChild(markerPath);
        defs.appendChild(marker);
        svg.appendChild(defs);
        body.insertBefore(svg, body.firstChild);
        return { svg, markerId };
    }

    function drawSentence(sentence) {
        const structure = sentence?._smartReaderStructure;
        const relations = Array.isArray(structure?.relations)
            ? structure.relations.filter(relation => relation?.type === 'modifies')
            : [];
        const body = sentence?.closest('.note-structure-body');
        if (!body) return;

        body.querySelector(':scope > .note-structure-relation-layer')?.remove();
        if (!relations.length || sentence.offsetParent === null) return;

        const bodyRect = body.getBoundingClientRect();
        if (!bodyRect.width || !bodyRect.height) return;

        const drawable = [];
        relations.forEach((relation, index) => {
            const fromElement = annotationById(sentence, relation.from);
            const toElement = annotationById(sentence, relation.to);
            const pair = closestRectPair(fromElement, toElement);
            if (!pair) return;
            drawable.push({ relation, pair, lane: index % 3 });
        });
        if (!drawable.length) return;

        const { svg, markerId } = createSvg(body);
        drawable.forEach(item => {
            const geometry = relationGeometry(item.pair, bodyRect, body, item.lane);
            const path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('d', geometry.path);
            path.setAttribute('class', `note-structure-relation-path ${geometry.sameLine ? 'is-same-line' : 'is-cross-line'}`);
            path.setAttribute('marker-end', `url(#${markerId})`);
            path.dataset.from = String(item.relation.from || '');
            path.dataset.to = String(item.relation.to || '');
            svg.appendChild(path);
        });
    }

    function drawAll() {
        redrawQueued = false;
        document.querySelectorAll('.note-structure-sentence').forEach(drawSentence);
    }

    function queueDraw() {
        if (redrawQueued) return;
        redrawQueued = true;
        const run = () => drawAll();
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
        else setTimeout(run, 0);
    }

    function injectStyle() {
        if (document.getElementById('note-structure-arrows-style')) return;
        const style = document.createElement('style');
        style.id = 'note-structure-arrows-style';
        style.textContent = `
            .note-structure-body { position: relative; }
            .note-structure-sentence { position: relative; z-index: 1; }
            .note-structure-relation-layer { position: absolute; left: 0; top: 0; z-index: 2; pointer-events: none; overflow: visible; }
            .note-structure-relation-path { fill: none; stroke: #7a8591; stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; opacity: .78; vector-effect: non-scaling-stroke; }
            .note-structure-arrowhead { fill: #7a8591; opacity: .9; }
            @media (max-width: 600px) {
                .note-structure-relation-path { stroke-width: 1.15; }
            }
        `;
        document.head.appendChild(style);
    }

    function init() {
        injectStyle();

        const panel = document.getElementById('panel-content');
        if (panel) {
            new MutationObserver(queueDraw).observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'class', 'style'] });
        }

        if (typeof ResizeObserver === 'function') {
            const resizeObserver = new ResizeObserver(queueDraw);
            const observeSentences = () => {
                document.querySelectorAll('.note-structure-body, .note-structure-sentence').forEach(node => resizeObserver.observe(node));
            };
            observeSentences();
            if (panel) new MutationObserver(observeSentences).observe(panel, { childList: true, subtree: true });
        }

        window.addEventListener('resize', queueDraw, { passive: true });
        window.addEventListener('orientationchange', queueDraw, { passive: true });
        document.addEventListener('click', event => {
            if (event.target?.closest?.('.note-structure-box > summary, #panel-expand-btn, #fab-toggle, [data-tab="notes"]')) {
                setTimeout(queueDraw, 0);
            }
        });

        if (document.fonts?.ready) document.fonts.ready.then(queueDraw).catch(() => {});
        queueDraw();
    }

    window.SmartReaderNoteStructureArrows = {
        redraw: queueDraw,
        relationGeometry,
        closestRectPair
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
