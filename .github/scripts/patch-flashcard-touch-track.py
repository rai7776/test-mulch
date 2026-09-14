from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'anchor not found: {label}')
    return text.replace(old, new, 1)

path = Path('flashcard-study.js')
text = path.read_text()

start = text.index('    function bindCardInteractions() {')
end = text.index('\n    function startSession(entries, label) {', start)

new_function = r'''    function bindCardInteractions() {
        const card = document.getElementById('study-flashcard');
        if (!card) return;
        const threshold = Math.max(44, Math.min(84, card.getBoundingClientRect().width * 0.15));

        card.querySelector('.study-card-copy')?.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            copyCurrentCard(event.currentTarget);
        });
        card.querySelector('.study-card-speak')?.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            speakCurrentWord();
        });

        function makeDragState(clientX, clientY, extra = {}) {
            return {
                startX: clientX,
                startY: clientY,
                dx: 0,
                dy: 0,
                moved: false,
                axis: null,
                threshold,
                startedAt: performance.now(),
                captured: false,
                ...extra
            };
        }

        function updateDragPosition(state, clientX, clientY) {
            if (!state) return;
            let dx = clientX - state.startX;
            let dy = clientY - state.startY;
            const ax = Math.abs(dx);
            const ay = Math.abs(dy);

            if (!state.axis && (ax > 7 || ay > 7)) {
                state.axis = ax >= ay * 0.8 ? 'x' : 'y';
            }
            if (state.axis === 'x') dy = 0;
            if (state.axis === 'y') dx *= 0.18;

            state.dx = dx;
            state.dy = Math.min(0, dy);
            if (Math.abs(state.dx) > 7 || Math.abs(state.dy) > 7) state.moved = true;

            const result = resultDirection(state.dx, state.dy);
            const distance = dragDistanceFor(result, state.dx, state.dy);
            const alpha = Math.min(1, distance / state.threshold);
            card.dataset.direction = result || '';
            card.style.setProperty('--study-feedback-alpha', String(alpha));
            card.style.transform = `translate3d(${state.dx}px, ${state.dy}px, 0) rotate(${state.dx * 0.035}deg)`;
            const judge = card.querySelector('.study-card-judge');
            if (judge) judge.textContent = resultSymbol(result);
        }

        function finishDrag(state, clientX, clientY) {
            if (!state) return;
            if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
                updateDragPosition(state, clientX, clientY);
            }
            card.classList.remove('is-dragging');

            const result = resultDirection(state.dx, state.dy);
            const distance = dragDistanceFor(result, state.dx, state.dy);
            const elapsed = Math.max(1, performance.now() - (state.startedAt || performance.now()));
            const velocity = distance / elapsed;
            const isQuickFlick = distance >= 30 && velocity >= 0.22;
            if (result && (distance >= state.threshold || isQuickFlick)) {
                commitResult(result);
                return;
            }
            resetCardPosition(card);
            if (!state.moved && !hasActiveTextSelection()) card.classList.toggle('flipped');
        }

        // iOS Safari can interrupt Pointer Events while a touch is moving across a
        // transformed card. Track fingers with Touch Events directly so the card stays
        // attached to the finger instead of feeling like it catches or snaps back.
        card.addEventListener('touchstart', event => {
            if (isCardControlTarget(event.target) || event.touches.length !== 1 || pendingCommit) return;
            const touch = event.touches[0];
            dragState = makeDragState(touch.clientX, touch.clientY, {
                input: 'touch',
                touchId: touch.identifier
            });
            card.classList.add('is-dragging');
        }, { passive: true });

        card.addEventListener('touchmove', event => {
            if (!dragState || dragState.input !== 'touch') return;
            if (hasActiveTextSelection()) {
                dragState = null;
                resetCardPosition(card);
                return;
            }
            const touch = Array.from(event.touches).find(item => item.identifier === dragState.touchId);
            if (!touch) return;
            updateDragPosition(dragState, touch.clientX, touch.clientY);
            if (dragState.moved) event.preventDefault();
        }, { passive: false });

        card.addEventListener('touchend', event => {
            if (!dragState || dragState.input !== 'touch') return;
            const state = dragState;
            const touch = Array.from(event.changedTouches).find(item => item.identifier === state.touchId);
            dragState = null;
            if (state.moved) event.preventDefault();
            finishDrag(state, touch?.clientX, touch?.clientY);
        }, { passive: false });

        card.addEventListener('touchcancel', () => {
            if (dragState?.input !== 'touch') return;
            dragState = null;
            resetCardPosition(card);
        }, { passive: true });

        card.addEventListener('pointerdown', event => {
            if (event.pointerType === 'touch') return;
            if (isCardControlTarget(event.target)) return;
            if (event.button !== undefined && event.button !== 0) return;
            dragState = makeDragState(event.clientX, event.clientY, {
                input: 'pointer',
                pointerId: event.pointerId
            });
            card.setPointerCapture?.(event.pointerId);
            dragState.captured = true;
            card.classList.add('is-dragging');
        });

        card.addEventListener('pointermove', event => {
            if (!dragState || dragState.input !== 'pointer' || dragState.pointerId !== event.pointerId) return;
            updateDragPosition(dragState, event.clientX, event.clientY);
        });

        card.addEventListener('pointerup', event => {
            if (!dragState || dragState.input !== 'pointer' || dragState.pointerId !== event.pointerId) return;
            const state = dragState;
            dragState = null;
            if (state.captured && card.hasPointerCapture?.(event.pointerId)) {
                try { card.releasePointerCapture(event.pointerId); } catch (_) {}
            }
            finishDrag(state, event.clientX, event.clientY);
        });

        card.addEventListener('pointercancel', event => {
            if (!dragState || dragState.input !== 'pointer' || dragState.pointerId !== event.pointerId) return;
            if (dragState.captured && card.hasPointerCapture?.(event.pointerId)) {
                try { card.releasePointerCapture(event.pointerId); } catch (_) {}
            }
            dragState = null;
            resetCardPosition(card);
        });

        card.addEventListener('lostpointercapture', event => {
            if (dragState?.input !== 'pointer' || dragState.pointerId !== event.pointerId) return;
            dragState.captured = false;
        });

        card.addEventListener('keydown', event => {
            if (isCardControlTarget(event.target)) return;
            if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                if (!hasActiveTextSelection()) card.classList.toggle('flipped');
            } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                commitResult('wrong');
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                commitResult('known');
            } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                commitResult('unsure');
            }
        });

        document.querySelectorAll('.study-judge-button').forEach(button => {
            button.addEventListener('click', () => commitResult(button.dataset.result));
        });
    }
'''

text = text[:start] + new_function + text[end:]
text = replace_once(
    text,
    '.study-session-overlay{position:fixed;inset:0;z-index:13000;display:none;background:rgba(245,241,236,.98);overflow:auto}',
    '.study-session-overlay{position:fixed;inset:0;z-index:13000;display:none;background:rgba(245,241,236,.98);overflow:auto;overscroll-behavior:none}',
    'overlay overscroll'
)
path.write_text(text)

index = Path('index.html')
html = index.read_text()
html = replace_once(html, 'flashcard-study.js?v=1.8', 'flashcard-study.js?v=1.9', 'flashcard cache version')
index.write_text(html)
