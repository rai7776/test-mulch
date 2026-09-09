from pathlib import Path

arrows = Path('note-structure-arrows.js')
s = arrows.read_text(encoding='utf-8')
start = s.index('    function relationGeometry(')
end = s.index('    function createSvg(', start)
new_fn = '''    function relationGeometry(pair, bodyRect, body, lane) {
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

'''
s = s[:start] + new_fn + s[end:]
old_layer = '.note-structure-relation-layer { position: absolute; left: 0; top: 0; z-index: 0; pointer-events: none; overflow: visible; }'
new_layer = '.note-structure-relation-layer { position: absolute; left: 0; top: 0; z-index: 2; pointer-events: none; overflow: visible; }'
assert s.count(old_layer) == 1, f'arrow layer marker count={s.count(old_layer)}'
s = s.replace(old_layer, new_layer, 1)
arrows.write_text(s, encoding='utf-8')

wrapper = Path('note-structure-ui.js')
w = wrapper.read_text(encoding='utf-8')
old_arrow = "loadScript('note-structure-arrows.js?v=2', 'note-structure-arrows-loader');"
new_arrow = "loadScript('note-structure-arrows.js?v=3', 'note-structure-arrows-loader');"
assert w.count(old_arrow) == 1, 'arrow cache marker missing'
wrapper.write_text(w.replace(old_arrow, new_arrow, 1), encoding='utf-8')

index = Path('index.html')
h = index.read_text(encoding='utf-8')
old_outer = '<script src="note-structure-ui.js?v=1.6"></script>'
new_outer = '<script src="note-structure-ui.js?v=1.7"></script>'
assert h.count(old_outer) == 1, 'outer cache marker missing'
index.write_text(h.replace(old_outer, new_outer, 1), encoding='utf-8')
