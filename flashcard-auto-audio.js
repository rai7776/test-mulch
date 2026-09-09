(function () {
    'use strict';

    let lastCard = null;

    function isStudySessionVisible() {
        const overlay = document.getElementById('study-session-overlay');
        return !!overlay?.classList.contains('show');
    }

    function getCurrentCardWord(card) {
        return String(card?.querySelector('.study-card-word')?.textContent || '').trim();
    }

    function speak(text) {
        if (!text || !('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
        try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'en-US';
            utterance.rate = 0.9;
            window.speechSynthesis.speak(utterance);
        } catch (_) {}
    }

    function speakIfNewCard() {
        const card = document.getElementById('study-flashcard');
        if (!card || !isStudySessionVisible()) {
            lastCard = null;
            return;
        }
        if (card === lastCard) return;

        const text = getCurrentCardWord(card);
        if (!text) return;

        lastCard = card;
        speak(text);
    }

    const observer = new MutationObserver(() => {
        speakIfNewCard();
    });

    function init() {
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class']
        });
        speakIfNewCard();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
