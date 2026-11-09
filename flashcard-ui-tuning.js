(function () {
    'use strict';

    function injectUiTuningStyles() {
        if (document.getElementById('flashcard-ui-tuning-style')) return;
        const style = document.createElement('style');
        style.id = 'flashcard-ui-tuning-style';
        style.textContent = `
            @media (max-width: 700px) {
                /* Library: keep today's study compact and above the fold. */
                #study-today-card.study-today-card {
                    margin: 8px 0 12px;
                    padding: 9px 10px;
                    border-radius: 12px;
                }
                #study-today-card .study-today-heading {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) auto;
                    align-items: center;
                    gap: 8px;
                }
                #study-today-card .study-today-eyebrow { display: none; }
                #study-today-card .study-today-heading h2 {
                    margin: 0;
                    font-size: 1rem;
                    line-height: 1.2;
                }
                #study-open-hub.study-primary-action {
                    min-height: 34px;
                    padding: 5px 10px;
                    border-radius: 9px;
                    font-size: .76rem;
                }
                #study-today-card .study-today-stats {
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                    gap: 4px;
                    margin-top: 7px;
                }
                #study-today-card .study-today-stats > div {
                    min-width: 0;
                    padding: 5px 5px 4px;
                    border-radius: 8px;
                }
                #study-today-card .study-today-stats span {
                    overflow: hidden;
                    font-size: .56rem;
                    line-height: 1.15;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                #study-today-card .study-today-stats strong {
                    margin-top: 2px;
                    font-size: clamp(.84rem, 4vw, 1.05rem);
                    line-height: 1.05;
                }
                #study-today-card .study-library-message { display: none; }

                /* Reader side panel: controls should use about the top third, not half the sheet. */
                #side-panel .chapter-scope-controls {
                    padding: 5px 8px 4px;
                }
                #side-panel .chapter-scope-topline {
                    flex-direction: row;
                    align-items: center;
                    gap: 6px;
                }
                #side-panel .chapter-scope-label { display: none; }
                #side-panel .chapter-scope-segment {
                    width: 100%;
                    max-width: none;
                    padding: 2px;
                }
                #side-panel .chapter-scope-segment button {
                    min-height: 32px;
                    padding: 3px 6px;
                    font-size: .76rem;
                }
                #side-panel .chapter-scope-grouping {
                    margin-top: 3px;
                    font-size: .72rem;
                }
                #side-panel .chapter-scope-caption { display: none; }
                #side-panel #list-search-controls {
                    padding: 5px 8px 3px;
                }
                #side-panel #list-search-controls > div {
                    margin-bottom: 0 !important;
                    gap: 5px !important;
                }
                #side-panel #list-search {
                    min-height: 34px;
                    padding: 5px 8px;
                    font-size: 16px;
                }
                #side-panel #list-search-controls .btn-export {
                    min-width: 40px;
                    min-height: 34px;
                    padding: 4px 7px;
                }
                #side-panel #article-vocabulary-statistics {
                    margin: 1px 8px 2px;
                    font-size: .68rem;
                    line-height: 1.25;
                }
                #side-panel #vocabulary-controls {
                    padding: 0 8px 5px;
                }
                #side-panel #vocabulary-controls .control-row {
                    margin-top: 2px !important;
                    margin-bottom: 0 !important;
                }
                #side-panel .anki-settings-group {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    min-width: 0;
                }
                #side-panel .anki-toggle {
                    font-size: .72rem;
                    line-height: 1.2;
                }
                #side-panel .mini-select,
                #side-panel #anki-target-select {
                    min-height: 31px;
                    max-width: 128px;
                    padding: 3px 24px 3px 7px;
                    font-size: .72rem;
                }
                #side-panel .sidebar-study-controls {
                    grid-template-columns: minmax(0, 1fr) 54px;
                    gap: 5px;
                    margin: 4px 0 0;
                }
                #side-panel .sidebar-study-controls .study-inline-primary,
                #side-panel .sidebar-study-controls .study-inline-secondary {
                    min-height: 34px;
                    padding: 4px 7px;
                    border-radius: 8px;
                    font-size: .72rem;
                }
                #side-panel #sidebar-study-range-count,
                #side-panel #sidebar-study-due-count {
                    min-width: 0;
                    margin-left: 2px;
                    padding: 0 3px;
                }

                /* Reader word sheet: keep the controls short and let the vocabulary
                   list use the available space. Scope this to the article sheet only. */
                #side-panel:not(.folder-panel-mode) #chapter-scope-controls {
                    padding: 3px 8px 2px;
                }
                #side-panel:not(.folder-panel-mode) .chapter-scope-segment button {
                    min-height: 30px;
                }
                #side-panel:not(.folder-panel-mode) #list-search-controls {
                    padding: 4px 8px 3px;
                }
                #side-panel:not(.folder-panel-mode) #vocabulary-controls {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) auto;
                    align-items: center;
                    column-gap: 5px;
                    row-gap: 2px;
                    min-width: 0;
                    padding: 0 8px 5px;
                }
                #side-panel #vocabulary-controls[hidden] { display: none !important; }
                #side-panel:not(.folder-panel-mode) #article-vocabulary-statistics {
                    grid-column: 1 / -1;
                    margin: 1px 0;
                    padding: 0;
                }
                #side-panel:not(.folder-panel-mode) #vocabulary-controls > .control-row {
                    min-width: 0;
                    padding: 0 !important;
                    margin: 0 !important;
                }
                #side-panel:not(.folder-panel-mode) #vocabulary-controls > .control-row:nth-child(2) {
                    grid-column: 1;
                    grid-row: 2;
                }
                #side-panel:not(.folder-panel-mode) #vocabulary-controls > .control-row:nth-child(3) {
                    grid-column: 2;
                    grid-row: 2;
                }
                #side-panel:not(.folder-panel-mode) #vocabulary-controls .anki-settings-group {
                    flex-wrap: nowrap;
                    gap: 4px;
                }
                #side-panel:not(.folder-panel-mode) #vocabulary-controls .anki-toggle {
                    white-space: nowrap;
                    font-size: .7rem;
                }
                #side-panel:not(.folder-panel-mode) #vocabulary-controls .anki-toggle input[type="checkbox"] {
                    width: 17px;
                    height: 17px;
                    min-width: 17px;
                    margin: 0 3px 0 0;
                }
                #side-panel:not(.folder-panel-mode) #anki-target-select {
                    min-width: 0;
                    max-width: 101px;
                    min-height: 30px;
                    padding: 3px 16px 3px 5px;
                    font-size: .7rem;
                }
                #side-panel:not(.folder-panel-mode) #vocabulary-controls .sidebar-study-controls {
                    grid-column: 1 / -1;
                    width: 100%;
                    min-width: 0;
                    max-width: 100%;
                    box-sizing: border-box;
                    margin: 3px 0 0;
                }
                /* The fallback launcher has ONE button, unlike the two-column
                   native launcher. Do not reserve a phantom second column. */
                #side-panel:not(.folder-panel-mode) #vocabulary-controls .article-study-fallback {
                    grid-template-columns: minmax(0, 1fr) !important;
                }
                #side-panel:not(.folder-panel-mode) .article-study-fallback [data-article-study-open] {
                    grid-column: 1 / -1;
                    width: 100%;
                    max-width: 100%;
                    min-width: 0;
                    box-sizing: border-box;
                    white-space: normal;
                }
                /* Compact two-column text and place Edit/Delete beside the text.
                   The meaning remains fully readable and action targets stay >= 40px. */
                #side-panel:not(.folder-panel-mode) #panel-content .note-card.compact-card {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) auto;
                    align-items: center;
                    column-gap: 6px;
                    row-gap: 2px;
                    min-width: 0;
                    padding: 8px 9px;
                    margin-bottom: 5px;
                    border-radius: 10px;
                }
                #side-panel:not(.folder-panel-mode) #panel-content .note-card.compact-card > .word-row {
                    display: grid;
                    grid-template-columns: minmax(0, 1.05fr) minmax(0, .95fr);
                    align-items: center;
                    gap: 7px;
                    min-width: 0;
                }
                #side-panel:not(.folder-panel-mode) #panel-content .note-card.compact-card .word-left {
                    min-width: 0;
                    overflow: visible;
                    align-items: center;
                    gap: 3px;
                }
                #side-panel:not(.folder-panel-mode) #panel-content .note-card.compact-card .word-left input[type="checkbox"] {
                    flex: 0 0 18px;
                    width: 18px;
                    height: 18px;
                    margin: 0;
                }
                #side-panel:not(.folder-panel-mode) #panel-content .note-card.compact-card .word-left > span:not(.word-text) {
                    flex: 0 0 28px;
                    min-width: 28px;
                    min-height: 40px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                }
                #side-panel:not(.folder-panel-mode) #panel-content .note-card.compact-card .word-text {
                    min-width: 0;
                    font-size: .91rem;
                    line-height: 1.28;
                    overflow-wrap: anywhere;
                }
                #side-panel:not(.folder-panel-mode) #panel-content .note-card.compact-card .meaning-right,
                #side-panel:not(.folder-panel-mode) #panel-content .note-card.compact-card .article-vocabulary-meaning-stack {
                    min-width: 0;
                    text-align: left;
                }
                #side-panel:not(.folder-panel-mode) #panel-content .note-card.compact-card .article-vocabulary-primary-sense {
                    font-size: .86rem;
                    line-height: 1.32;
                }
                #side-panel:not(.folder-panel-mode) #panel-content .note-card.compact-card .article-vocabulary-secondary-senses {
                    gap: 1px;
                    margin-top: 2px;
                    font-size: .73rem;
                    line-height: 1.3;
                }
                #side-panel:not(.folder-panel-mode) #panel-content .note-card.compact-card > .action-group {
                    grid-column: 2;
                    grid-row: 1;
                    display: flex;
                    justify-content: flex-end;
                    align-self: center;
                    gap: 3px;
                    margin: 0;
                }
                #side-panel:not(.folder-panel-mode) #panel-content .note-card.compact-card > .action-group button {
                    min-width: 38px;
                    min-height: 40px;
                    padding: 3px 6px;
                    font-size: .76rem;
                }
                #side-panel:not(.folder-panel-mode) #panel-content .note-card.compact-card > .memo-row,
                #side-panel:not(.folder-panel-mode) #panel-content .note-card.compact-card > .article-vocabulary-memo,
                #side-panel:not(.folder-panel-mode) #panel-content .note-card.compact-card > .chinese-study-controls {
                    grid-column: 1 / -1;
                    margin-top: 2px;
                }
                #side-panel:not(.folder-panel-mode) #panel-content .note-card.compact-card > .memo-row {
                    padding-left: 0;
                }
                #side-panel:not(.folder-panel-mode) #panel-content .note-card.compact-card > .article-vocabulary-memo {
                    margin-left: 0;
                    padding-top: 3px;
                }
                @media (max-width: 355px) {
                    #side-panel:not(.folder-panel-mode) #vocabulary-controls {
                        grid-template-columns: minmax(0, 1fr);
                    }
                    #side-panel:not(.folder-panel-mode) #vocabulary-controls > .control-row:nth-child(3) {
                        grid-column: 1;
                        grid-row: 3;
                    }
                }

                /* Global Vocabulary: denser controls, smaller buttons, study tools stay visible. */
                #vocabulary-section .vocabulary-header {
                    padding-left: 10px;
                    padding-right: 10px;
                }
                #vocabulary-section .vocabulary-title-row {
                    align-items: flex-start;
                    gap: 7px;
                }
                #vocabulary-section #global-vocab-title {
                    margin: 0;
                    font-size: 1.35rem;
                    line-height: 1.15;
                }
                #vocabulary-section #global-vocab-count {
                    font-size: .86rem;
                }
                #vocabulary-section #global-vocab-statistics {
                    margin: 4px 0 6px;
                    font-size: .76rem;
                    line-height: 1.25;
                }
                #vocabulary-section .vocabulary-controls {
                    display: grid !important;
                    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
                    gap: 5px !important;
                    align-items: center;
                }
                #vocabulary-section .vocabulary-controls > input[type='search'] {
                    grid-column: 1 / -1;
                    min-height: 38px !important;
                    padding: 6px 9px !important;
                    font-size: 16px !important;
                }
                #vocabulary-section .vocabulary-controls select {
                    min-width: 0 !important;
                    min-height: 35px !important;
                    padding: 4px 25px 4px 7px !important;
                    font-size: .76rem !important;
                }
                #vocabulary-section .vocabulary-check {
                    min-height: 31px;
                    gap: 4px;
                    font-size: .72rem;
                    line-height: 1.15;
                }
                #vocabulary-section .btn-export {
                    min-height: 32px;
                    padding: 4px 7px;
                    font-size: .68rem;
                    line-height: 1.1;
                }
                #vocabulary-section #global-vocab-source-picker {
                    grid-column: 1 / -1;
                    width: 100%;
                }
                #vocabulary-section #global-vocab-source-picker-button {
                    width: 100%;
                    min-height: 35px;
                    padding: 5px 8px;
                    font-size: .76rem;
                    text-align: left;
                }
                #vocabulary-section #global-study-controls {
                    grid-column: 1 / -1;
                    display: grid !important;
                    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
                    gap: 5px !important;
                    width: 100%;
                }
                #vocabulary-section #global-study-controls select {
                    min-height: 33px !important;
                    font-size: .7rem !important;
                }
                #vocabulary-section #global-study-controls button {
                    min-height: 34px !important;
                    padding: 4px 6px !important;
                    border-radius: 8px !important;
                    font-size: .7rem !important;
                    line-height: 1.15;
                }
                #vocabulary-section #global-study-controls button span {
                    min-width: 0;
                    margin-left: 2px;
                    padding: 0 3px;
                }

                /* Flashcard session: opaque background, centered wider card, quieter judgement hints. */
                .study-session-overlay {
                    background: #f7f3ee !important;
                }
                .study-session-shell {
                    box-sizing: border-box;
                    width: 100%;
                    min-height: 100dvh;
                    height: 100dvh;
                    padding: max(10px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom));
                    overflow: hidden;
                }
                .study-session-header {
                    grid-template-columns: 40px 1fr 40px;
                    gap: 6px;
                    flex: 0 0 auto;
                }
                .study-session-header .study-icon-action {
                    width: 38px;
                    height: 38px;
                    font-size: 1rem;
                }
                .study-session-progress-wrap strong {
                    font-size: 1.02rem;
                    line-height: 1.1;
                }
                .study-session-progress-wrap span {
                    margin-top: 1px;
                    font-size: .7rem;
                }
                .study-session-stage {
                    flex: 1 1 auto;
                    min-height: 0 !important;
                    padding: 2px 0 0;
                    overflow: visible;
                }
                .study-gesture-field {
                    box-sizing: border-box;
                    width: calc(100vw - 36px) !important;
                    max-width: 430px !important;
                    margin: 0 auto;
                    padding: 34px 0 4px !important;
                }
                .study-flashcard {
                    width: 100% !important;
                    height: min(52dvh, 460px) !important;
                    min-height: 335px !important;
                    max-height: 460px !important;
                }
                .study-card-face {
                    padding: 20px 18px !important;
                    border-radius: 20px !important;
                }
                .study-card-word {
                    max-width: 100%;
                    font-size: clamp(1.9rem, 9vw, 3.1rem) !important;
                    line-height: 1.08 !important;
                    overflow-wrap: break-word !important;
                    word-break: normal !important;
                    hyphens: none;
                    text-wrap: balance;
                }
                .study-card-surface {
                    margin-top: 8px;
                    font-size: .86rem;
                }
                .study-card-meta {
                    gap: 4px;
                    margin-top: 10px;
                }
                .study-card-meta span {
                    padding: 2px 6px;
                    font-size: .64rem;
                }
                .study-card-back-word { font-size: 1rem; }
                .study-card-meaning {
                    margin-top: 12px;
                    font-size: clamp(1.18rem, 5.4vw, 1.65rem);
                    line-height: 1.35;
                }
                .study-card-memo { margin-top: 10px; font-size: .78rem; }
                .study-card-context {
                    margin-top: 11px;
                    padding: 9px;
                    font-size: .74rem;
                    line-height: 1.45;
                }
                .study-card-source { margin-top: 9px; font-size: .65rem; }
                .study-card-studyline { margin-top: 3px; font-size: .64rem; }
                .study-card-judge {
                    top: 12px;
                    right: 12px;
                    width: 46px;
                    height: 46px;
                    font-size: 1.55rem;
                }
                .study-direction-hint {
                    width: 34px;
                    height: 34px;
                    font-size: 1rem;
                    opacity: .42;
                }
                .hint-unsure { top: 0; }
                .hint-wrong { left: -9px; }
                .hint-known { right: -9px; }
                .study-touch-actions {
                    gap: 18px;
                    margin-top: 8px;
                }
                .study-judge-button {
                    width: 44px;
                    height: 44px;
                    font-size: 1.15rem;
                    box-shadow: 0 2px 8px rgba(0,0,0,.10);
                }
                .study-session-source {
                    flex: 0 0 auto;
                    min-height: 16px;
                    margin-top: 4px;
                    font-size: .64rem;
                    line-height: 1.2;
                }
                .study-session-summary {
                    width: calc(100vw - 34px);
                    max-width: 520px;
                    padding: 18px;
                    border-radius: 18px;
                }
            }


            /* v2: stack card and judgement controls vertically. */
            @media (max-width: 700px) {
                .study-session-stage {
                    display: flex !important;
                    flex-direction: column !important;
                    align-items: center !important;
                    justify-content: center !important;
                    gap: 10px !important;
                    width: 100% !important;
                    min-width: 0 !important;
                }
                .study-gesture-field {
                    flex: 0 0 auto !important;
                    width: min(calc(100vw - 32px), 520px) !important;
                    max-width: none !important;
                    margin: 0 auto !important;
                    padding: 28px 0 0 !important;
                }
                .study-flashcard {
                    box-sizing: border-box !important;
                    width: 100% !important;
                    min-width: 0 !important;
                    height: clamp(300px, 42dvh, 390px) !important;
                    min-height: 300px !important;
                    max-height: 390px !important;
                }
                .study-touch-actions {
                    flex: 0 0 auto !important;
                    width: 100% !important;
                    display: flex !important;
                    justify-content: center !important;
                    align-items: center !important;
                    gap: clamp(28px, 10vw, 48px) !important;
                    margin: 2px 0 0 !important;
                }
                .study-judge-button {
                    width: 46px !important;
                    height: 46px !important;
                    flex: 0 0 46px !important;
                }
                .study-direction-hint.hint-wrong {
                    left: 8px !important;
                    top: 50% !important;
                    transform: translateY(-50%) !important;
                }
                .study-direction-hint.hint-known {
                    right: 8px !important;
                    top: 50% !important;
                    transform: translateY(-50%) !important;
                }
                .study-direction-hint.hint-unsure {
                    left: 50% !important;
                    top: -8px !important;
                    transform: translateX(-50%) !important;
                }
                .study-card-word {
                    font-size: clamp(2rem, 10vw, 3.15rem) !important;
                    max-width: 92% !important;
                    word-break: keep-all !important;
                    overflow-wrap: normal !important;
                }
                .study-session-source {
                    margin: 2px auto 0 !important;
                    max-width: calc(100vw - 36px) !important;
                }
            }

            @media (max-width: 390px) {
                .study-gesture-field { width: calc(100vw - 24px) !important; }
                .study-flashcard {
                    height: clamp(290px, 40dvh, 350px) !important;
                    min-height: 290px !important;
                    max-height: 350px !important;
                }
            }

            @media (max-width: 390px) {
                #study-today-card .study-today-stats span { font-size: .52rem; }
                #study-today-card .study-today-stats strong { font-size: .9rem; }
                #vocabulary-section .vocabulary-controls select,
                #vocabulary-section #global-vocab-source-picker-button { font-size: .72rem !important; }
                .study-gesture-field { width: calc(100vw - 28px) !important; }
                .study-flashcard {
                    min-height: 320px !important;
                    height: min(50dvh, 430px) !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function init() {
        injectUiTuningStyles();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
