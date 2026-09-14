from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'anchor not found: {label}')
    return text.replace(old, new, 1)

path = Path('flashcard-study.js')
text = path.read_text()

text = replace_once(
    text,
    "        const threshold = Math.max(68, Math.min(120, card.getBoundingClientRect().width * 0.22));",
    "        const threshold = Math.max(52, Math.min(96, card.getBoundingClientRect().width * 0.18));",
    'swipe threshold'
)

text = replace_once(
    text,
    "                threshold,\n                captured: false",
    "                threshold,\n                startedAt: performance.now(),\n                captured: false",
    'drag start timestamp'
)

old_pointerup = """        card.addEventListener('pointerup', event => {
            if (!dragState || dragState.pointerId !== event.pointerId) return;
            const state = dragState;
            dragState = null;

            // Explicitly release pointer capture before committing a swipe.
            // iOS Safari can otherwise swallow the next tap on the header undo button.
            if (state.captured && card.hasPointerCapture?.(event.pointerId)) {
                try { card.releasePointerCapture(event.pointerId); } catch (_) {}
            }
            card.classList.remove('is-dragging');

            const result = resultDirection(state.dx, state.dy);
            const distance = dragDistanceFor(result, state.dx, state.dy);
            if (result && distance >= state.threshold) {
                event.preventDefault();
                commitResult(result);
                return;
            }
            resetCardPosition(card);
            if (!state.moved && !hasActiveTextSelection()) card.classList.toggle('flipped');
        });
"""

new_pointerup = """        card.addEventListener('pointerup', event => {
            if (!dragState || dragState.pointerId !== event.pointerId) return;
            const state = dragState;
            dragState = null;

            // Safari can coalesce the final pointermove of a quick flick. Use the
            // pointerup coordinates as the authoritative final drag position.
            if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
                state.dx = event.clientX - state.startX;
                state.dy = Math.min(0, event.clientY - state.startY);
            }
            if (Math.abs(state.dx) > 7 || Math.abs(state.dy) > 7) state.moved = true;

            // Explicitly release pointer capture before committing a swipe.
            // iOS Safari can otherwise swallow the next tap on the header undo button.
            if (state.captured && card.hasPointerCapture?.(event.pointerId)) {
                try { card.releasePointerCapture(event.pointerId); } catch (_) {}
            }
            card.classList.remove('is-dragging');

            const result = resultDirection(state.dx, state.dy);
            const distance = dragDistanceFor(result, state.dx, state.dy);
            const elapsed = Math.max(1, performance.now() - (state.startedAt || performance.now()));
            const velocity = distance / elapsed;
            const isQuickFlick = distance >= 34 && velocity >= 0.28;
            if (result && (distance >= state.threshold || isQuickFlick)) {
                commitResult(result);
                return;
            }
            resetCardPosition(card);
            if (!state.moved && !hasActiveTextSelection()) card.classList.toggle('flipped');
        });
"""
text = replace_once(text, old_pointerup, new_pointerup, 'pointerup swipe handling')

old_lost = """        card.addEventListener('lostpointercapture', event => {
            if (dragState?.pointerId !== event.pointerId) return;
            dragState = null;
            card.classList.remove('is-dragging');
        });
"""
new_lost = """        card.addEventListener('lostpointercapture', event => {
            if (dragState?.pointerId !== event.pointerId) return;
            // Do not discard the gesture here. iOS Safari may drop pointer capture
            // before pointerup during a fast swipe; pointerup/pointercancel owns cleanup.
            dragState.captured = false;
        });
"""
text = replace_once(text, old_lost, new_lost, 'lost pointer capture handling')
path.write_text(text)

index = Path('index.html')
html = index.read_text()
html = replace_once(html, 'flashcard-study.js?v=1.7', 'flashcard-study.js?v=1.8', 'flashcard cache version')
index.write_text(html)
