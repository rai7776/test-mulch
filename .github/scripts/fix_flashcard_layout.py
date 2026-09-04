from pathlib import Path

p = Path('flashcard-ui-tuning.js')
s = p.read_text()
marker = "            @media (max-width: 390px) {"
css = r'''
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
'''
if css.strip() not in s:
    if marker not in s:
        raise SystemExit('CSS insertion marker not found')
    s = s.replace(marker, css + '\n' + marker, 1)
    p.write_text(s)

idx = Path('index.html')
html = idx.read_text().replace('flashcard-ui-tuning.js?v=1.0', 'flashcard-ui-tuning.js?v=1.1')
idx.write_text(html)
