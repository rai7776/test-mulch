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

    function visualElement(element) {
        if (!element) return null;
        if (element.classList?.contains('syntax-core')) {
            return element.querySelector(':scope > .syntax-core-text') || element;
        }
        return element;
    }

    function clientRects(element) {
        const visual = visualElement(element);
        if (!visual) return [];
        const rects = Array.from(visual.getClientRects?.() || []);
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

    function localX(value, bodyRect, body) {
        return value - bodyRect.left + body.scrollLeft;
    }

    function localY(value, bodyRect, body) {
        return value - bodyRect.top + body.scrollTop;
    }

    function relationGeometry(pair, bodyRect, body, lane) {
        const fromCenter = rectCenter(pair.fromRect);
        const toCenter = rectCenter(pair.toRect);
        const lineThreshold = Math.max(pair.fromRect.height, pair.toRect.height) * 0.72;
        const sameLine = Math.abs(fromCenter.y - toCenter.y) <= lineThreshold;

        if (sameLine) {
            const targetIsRight = toCenter.x > fromCenter.x;
            const sourceX = targetIsRight ? pair.fromRect.right + 1.5 : pair.fromRect.left - 1.5;
            const targetX = targetIsRight ? pair.toRect.left - 1.5 : pair.toRect.right + 1.5;
            const sourceY = pair.fromRect.top - 1.5;
            const targetY = pair.toRect.top - 1.5;
            const laneLift = 7 + lane * 4;
            const routeYClient = Math.min(sourceY, targetY) - laneLift;

            const sx = localX(sourceX, bodyRect, body);
            const tx = localX(targetX, bodyRect, body);
            const sy = localY(sourceY, bodyRect, body);
            const ty = localY(targetY, bodyRect, body);
            const routeY = Math.max(3, localY(routeYClient, bodyRect, body));

            return {
                path: `M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${sx.toFixed(1)} ${routeY.toFixed(1)} L ${tx.toFixed(1)} ${routeY.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}`,
                sameLine: true
            };
        }

        const targetBelow = toCenter.y > fromCenter.y;
        const sourceY = targetBelow ? pair.fromRect.bottom + 2 : pair.fromRect.top - 2;
        const targetY = targetBelow ? pair.toRect.top - 2 : pair.toRect.bottom + 2;
        const sx = localX(fromCenter.x, bodyRect, body);
        const tx = localX(toCenter.x, bodyRect, body);
        const sy = localY(sourceY, bodyRect, body);
        const ty = localY(targetY, bodyRect, body);

        const leftCorridor = Math.min(pair.fromRect.left, pair.toRect.left) - 10 - lane * 5;
        const rightCorridor = Math.max(pair.fromRect.right, pair.toRect.right) + 10 + lane * 5;
        const leftCost = Math.abs(fromCenter.x - leftCorridor) + Math.abs(toCenter.x - leftCorridor);
        const rightCost = Math.abs(fromCenter.x - rightCorridor) + Math.abs(toCenter.x - rightCorridor);
        const routeX = localX(leftCost <= rightCost ? leftCorridor : rightCorridor, bodyRect, body);

        return {
            path: `M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${routeX.toFixed(1)} ${sy.toFixed(1)} L ${routeX.toFixed(1)} ${ty.toFixed(1)} L ${tx.toFixed(1)} ${ty.toFixed(1)}`,
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
        marker.setAttribute('markerWidth', '4');
        marker.setAttribute('markerHeight', '4');
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

    function isArrowLayerNode(node) {
        if (!node) return false;
        if (node.nodeType === 1) {
            if (node.classList?.contains('note-structure-relation-layer')) return true;
            return !!node.closest?.('.note-structure-relation-layer');
        }
        return !!node.parentElement?.closest?.('.note-structure-relation-layer');
    }

    function hasMeaningfulMutation(records) {
        return records.some(record => {
            if (record.type === 'attributes') return !isArrowLayerNode(record.target);
            const nodes = [...record.addedNodes, ...record.removedNodes];
            return nodes.some(node => !isArrowLayerNode(node));
        });
    }

    function injectStyle() {
        if (document.getElementById('note-structure-arrows-style')) return;
        const style = document.createElement('style');
        style.id = 'note-structure-arrows-style';
        style.textContent = `
            .note-structure-body { position: relative; }
            .note-structure-sentence { position: relative; z-index: 1; }
            .note-structure-relation-layer { position: absolute; left: 0; top: 0; z-index: 2; pointer-events: none; overflow: visible; }
            .note-structure-relation-path { fill: none; stroke: #7a8591; stroke-width: 1; stroke-linecap: round; stroke-linejoin: round; opacity: .64; vector-effect: non-scaling-stroke; }
            .note-structure-arrowhead { fill: #7a8591; opacity: .76; }
            @media (max-width: 600px) {
                .note-structure-relation-path { stroke-width: .95; }
            }
        `;
        document.head.appendChild(style);
    }

    function init() {
        injectStyle();

        const panel = document.getElementById('panel-content');
        if (panel) {
            new MutationObserver(records => {
                if (hasMeaningfulMutation(records)) queueDraw();
            }).observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'class', 'style'] });
        }

        if (typeof ResizeObserver === 'function') {
            const resizeObserver = new ResizeObserver(queueDraw);
            const observeSentences = () => {
                document.querySelectorAll('.note-structure-body, .note-structure-sentence').forEach(node => resizeObserver.observe(node));
            };
            observeSentences();
            if (panel) {
                new MutationObserver(records => {
                    if (hasMeaningfulMutation(records)) observeSentences();
                }).observe(panel, { childList: true, subtree: true });
            }
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
        closestRectPair,
        hasMeaningfulMutation
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
