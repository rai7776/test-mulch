(function () {
    'use strict';

    function isTouchClipboardHost() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent)
            || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
            || window.matchMedia?.('(pointer: coarse)').matches;
    }

    function setFriendlyStatus(message, isError = false) {
        const status = document.getElementById('bulk-import-status');
        if (!status) return;
        status.textContent = message || '';
        status.classList.toggle('is-error', !!isError);
    }

    function pasteArea() {
        return document.getElementById('bulk-import-input');
    }

    function focusPasteArea() {
        const area = pasteArea();
        if (!area) return;
        area.focus({ preventScroll: true });
        area.scrollIntoView({ behavior: 'smooth', block: 'center' });
        try {
            area.setSelectionRange(area.value.length, area.value.length);
        } catch (_) {}
    }

    function legacyCopy(text) {
        const helper = document.createElement('textarea');
        helper.value = text;
        helper.setAttribute('readonly', '');
        helper.setAttribute('aria-hidden', 'true');
        helper.style.position = 'fixed';
        helper.style.top = '0';
        helper.style.left = '-9999px';
        helper.style.width = '1px';
        helper.style.height = '1px';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.focus();
        helper.select();
        try { helper.setSelectionRange(0, helper.value.length); } catch (_) {}
        let copied = false;
        try { copied = document.execCommand('copy'); } catch (_) {}
        helper.remove();
        return copied;
    }

    function ensureManualPromptBox() {
        let details = document.getElementById('bulk-prompt-manual');
        if (details) return details;

        details = document.createElement('details');
        details.id = 'bulk-prompt-manual';
        details.className = 'bulk-prompt-manual';
        details.innerHTML = `
            <summary>コピーできない場合：プロンプトを表示</summary>
            <p>下の欄を長押しして「すべて選択」→「コピー」してください。</p>
            <textarea id="bulk-prompt-manual-text" readonly spellcheck="false"></textarea>
            <button type="button" id="bulk-prompt-select-all" class="btn-sub">全文を選択</button>`;

        const help = document.querySelector('.bulk-import-help');
        if (help) help.insertAdjacentElement('afterend', details);
        else document.querySelector('.bulk-import-actions-top')?.insertAdjacentElement('afterend', details);

        details.querySelector('#bulk-prompt-select-all')?.addEventListener('click', () => {
            const area = details.querySelector('#bulk-prompt-manual-text');
            if (!area) return;
            area.focus();
            area.select();
            try { area.setSelectionRange(0, area.value.length); } catch (_) {}
            setFriendlyStatus('プロンプト全文を選択しました。コピーしてください。');
        });
        return details;
    }

    function showManualPrompt(prompt) {
        const details = ensureManualPromptBox();
        const area = details.querySelector('#bulk-prompt-manual-text');
        if (area) area.value = prompt;
        details.open = true;
        requestAnimationFrame(() => {
            if (!area) return;
            area.focus();
            area.select();
            try { area.setSelectionRange(0, area.value.length); } catch (_) {}
            details.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
    }

    function flashButton(button, text) {
        if (!button) return;
        const original = button.dataset.defaultLabel || button.textContent;
        button.dataset.defaultLabel = original;
        button.textContent = text;
        clearTimeout(button._bulkLabelTimer);
        button._bulkLabelTimer = setTimeout(() => {
            button.textContent = button.dataset.defaultLabel || original;
        }, 1800);
    }

    async function handlePromptCopy(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const button = event.currentTarget;

        if (typeof window.buildSmartReaderBulkAiPrompt !== 'function') {
            setFriendlyStatus('AI用プロンプトを作成できませんでした。ページを再読み込みしてください。', true);
            return;
        }

        const prompt = window.buildSmartReaderBulkAiPrompt();
        let copied = false;

        // iPhone / iPad Safariでは、ユーザー操作中にexecCommandを先に試す方が安定する。
        if (isTouchClipboardHost()) copied = legacyCopy(prompt);

        if (!copied && navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(prompt);
                copied = true;
            } catch (_) {}
        }

        if (!copied) copied = legacyCopy(prompt);

        if (copied) {
            flashButton(button, '✓ コピーしました');
            setFriendlyStatus('AI用プロンプトをコピーしました。ChatGPTなどへ貼り付けてください。');
            const manual = document.getElementById('bulk-prompt-manual');
            if (manual) manual.open = false;
            return;
        }

        showManualPrompt(prompt);
        flashButton(button, 'プロンプトを表示しました');
        setFriendlyStatus('自動コピーが使えないため、プロンプトを表示しました。長押しでコピーしてください。');
    }

    async function handlePasteButton(event) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const area = pasteArea();
        if (!area) return;

        // iOS Safariはclipboard.readTextが拒否されやすいので、エラーを出さず通常の貼り付けへ誘導する。
        if (isTouchClipboardHost()) {
            focusPasteArea();
            setFriendlyStatus('入力欄を長押しして「ペースト」を選んでください。');
            return;
        }

        if (navigator.clipboard?.readText) {
            try {
                const value = await navigator.clipboard.readText();
                if (value) {
                    area.value = value;
                    area.dispatchEvent(new Event('input', { bubbles: true }));
                    setFriendlyStatus('クリップボードから貼り付けました。次に「③ 解析して確認」を押してください。');
                    return;
                }
            } catch (_) {}
        }

        focusPasteArea();
        setFriendlyStatus('自動貼り付けが使えません。入力欄で通常の貼り付けをしてください。');
    }

    function moveDuplicateSetting() {
        const parseRow = document.querySelector('.bulk-import-parse-row');
        const label = parseRow?.querySelector('label');
        if (!parseRow || !label || document.getElementById('bulk-import-duplicate-details')) return;

        const details = document.createElement('details');
        details.id = 'bulk-import-duplicate-details';
        details.className = 'bulk-import-duplicate-details';
        const summary = document.createElement('summary');
        summary.textContent = '重複データの扱い';
        details.appendChild(summary);
        details.appendChild(label);
        parseRow.insertAdjacentElement('afterend', details);
    }

    function improveLabels() {
        const copy = document.getElementById('bulk-import-copy-prompt');
        const paste = document.getElementById('bulk-import-paste');
        const parse = document.getElementById('bulk-import-parse');
        const help = document.querySelector('.bulk-import-help');
        const area = pasteArea();

        if (copy) {
            copy.textContent = '① AI用プロンプトをコピー';
            copy.dataset.defaultLabel = copy.textContent;
        }
        if (paste) paste.textContent = '② 貼り付け欄を開く';
        if (parse) parse.textContent = '③ 解析して確認';
        if (help) {
            help.innerHTML = `
                <strong>使い方</strong>
                <span><b>1</b> プロンプトをコピーしてAIへ貼る</span>
                <span><b>2</b> AIの返答を下の欄へ貼る</span>
                <span><b>3</b> 解析して、追加する項目を確認</span>`;
        }
        if (area) {
            area.placeholder = 'ここを長押し →「ペースト」\n\nChatGPTなどが返した ```json ... ``` をコードブロックごと貼ってOKです。';
            if (!document.getElementById('bulk-import-input-label')) {
                const label = document.createElement('div');
                label.id = 'bulk-import-input-label';
                label.className = 'bulk-import-input-label';
                label.innerHTML = '<span class="bulk-step-badge">2</span><strong>AIの返答をここに貼る</strong>';
                area.insertAdjacentElement('beforebegin', label);
            }
        }
        moveDuplicateSetting();
    }

    function bindClipboardFixes() {
        const copy = document.getElementById('bulk-import-copy-prompt');
        const paste = document.getElementById('bulk-import-paste');
        if (copy && !copy.dataset.mobileClipboardFixed) {
            copy.dataset.mobileClipboardFixed = '1';
            copy.addEventListener('click', handlePromptCopy, true);
        }
        if (paste && !paste.dataset.mobileClipboardFixed) {
            paste.dataset.mobileClipboardFixed = '1';
            paste.addEventListener('click', handlePasteButton, true);
        }
    }

    function injectMobileStyles() {
        if (document.getElementById('bulk-import-mobile-fix-style')) return;
        const style = document.createElement('style');
        style.id = 'bulk-import-mobile-fix-style';
        style.textContent = `
            .bulk-import-help {
                display: grid;
                gap: 5px;
            }
            .bulk-import-help > strong { color: #4f4135; }
            .bulk-import-help > span { display: flex; align-items: center; gap: 7px; }
            .bulk-import-help > span b,
            .bulk-step-badge {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 22px;
                height: 22px;
                flex: 0 0 22px;
                border-radius: 50%;
                background: var(--primary);
                color: #fff;
                font-size: 12px;
            }
            .bulk-import-input-label {
                display: flex;
                align-items: center;
                gap: 8px;
                margin: 12px 0 7px;
                color: #3f352d;
                font-size: .92em;
            }
            .bulk-import-duplicate-details {
                margin-top: 8px;
                padding: 8px 10px;
                border: 1px solid #e6ddd3;
                border-radius: 8px;
                background: #faf8f5;
                color: #666;
                font-size: .86em;
            }
            .bulk-import-duplicate-details summary { cursor: pointer; font-weight: 700; color: #625548; }
            .bulk-import-duplicate-details label { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; }
            .bulk-prompt-manual {
                margin: 8px 0 10px;
                padding: 8px 10px;
                border: 1px solid #e2d6c8;
                border-radius: 8px;
                background: #fffaf4;
            }
            .bulk-prompt-manual summary { cursor: pointer; font-weight: 700; color: #765536; }
            .bulk-prompt-manual p { margin: 7px 0; color: #666; font-size: .82em; }
            #bulk-prompt-manual-text { width: 100%; min-height: 150px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px !important; }
            #bulk-prompt-select-all { margin-top: 6px; }

            @media (max-width: 700px) {
                #bulk-import-overlay.show {
                    align-items: flex-end;
                    padding: 0;
                }
                .bulk-import-modal {
                    width: 100vw !important;
                    max-width: none !important;
                    max-height: 94dvh !important;
                    margin: 0;
                    padding: 14px 14px 12px !important;
                    border-radius: 18px 18px 0 0 !important;
                    overflow-y: auto;
                    overscroll-behavior: contain;
                }
                .bulk-import-heading {
                    position: sticky;
                    top: -14px;
                    z-index: 4;
                    margin: -14px -14px 0;
                    padding: 14px 14px 10px;
                    background: rgba(255,255,255,.98);
                    border-bottom: 1px solid #eee;
                }
                .bulk-import-heading h2 { font-size: 1.55rem; }
                .bulk-import-target-line {
                    margin-top: 2px;
                    font-size: .78em;
                    line-height: 1.35;
                }
                .bulk-import-actions-top {
                    display: grid !important;
                    grid-template-columns: 1fr !important;
                    gap: 8px !important;
                    margin-top: 12px !important;
                }
                .bulk-import-actions-top > button {
                    width: 100%;
                    min-height: 46px;
                    border-radius: 10px !important;
                    font-size: 15px !important;
                    font-weight: 700;
                }
                #bulk-import-copy-prompt {
                    background: var(--primary) !important;
                    color: #fff !important;
                    border: 1px solid var(--primary) !important;
                }
                #bulk-import-paste {
                    background: #fff !important;
                    color: var(--primary) !important;
                    border: 1px solid #cdbca9 !important;
                }
                .bulk-import-help {
                    margin: 10px 0 8px !important;
                    padding: 10px !important;
                    font-size: .78em !important;
                    line-height: 1.35 !important;
                }
                .bulk-import-input {
                    min-height: 185px !important;
                    max-height: none !important;
                    resize: none !important;
                    padding: 12px !important;
                    border: 1.5px solid #cdbca9 !important;
                    border-radius: 10px !important;
                    font-family: -apple-system, BlinkMacSystemFont, sans-serif !important;
                    font-size: 16px !important;
                    line-height: 1.45 !important;
                }
                .bulk-import-parse-row {
                    display: block !important;
                    margin-top: 10px !important;
                }
                #bulk-import-parse {
                    width: 100%;
                    min-height: 48px;
                    border-radius: 10px !important;
                    font-size: 16px !important;
                    font-weight: 700;
                    background: var(--primary) !important;
                    color: #fff !important;
                }
                .bulk-import-status {
                    min-height: 0 !important;
                    margin-top: 9px !important;
                    padding: 0;
                    font-size: .82em !important;
                    line-height: 1.4;
                    word-break: break-word;
                }
                .bulk-import-status:not(:empty) {
                    padding: 8px 10px;
                    border-radius: 8px;
                    background: #f3f6f7;
                }
                .bulk-import-status.is-error:not(:empty) { background: #fff0ed; }
                .bulk-import-summary { margin: 10px 0 4px !important; font-size: .88em !important; }
                .bulk-import-review {
                    max-height: none !important;
                    overflow: visible !important;
                }
                .bulk-import-bottom-actions {
                    position: sticky !important;
                    bottom: -12px !important;
                    z-index: 5;
                    display: grid !important;
                    grid-template-columns: .8fr 1.2fr;
                    gap: 8px !important;
                    margin: 12px -14px -12px !important;
                    padding: 10px 14px max(10px, env(safe-area-inset-bottom)) !important;
                    background: rgba(255,255,255,.98) !important;
                    box-shadow: 0 -6px 18px rgba(0,0,0,.06);
                }
                .bulk-import-bottom-actions button {
                    min-height: 46px;
                    margin: 0 !important;
                    border-radius: 10px !important;
                    font-size: 14px !important;
                }
                #bulk-add-btn {
                    right: 88px !important;
                    bottom: 28px !important;
                    width: 64px !important;
                    height: 40px !important;
                    border-radius: 20px !important;
                    font-size: 13px !important;
                }
            }`;
        document.head.appendChild(style);
    }

    function enhance() {
        improveLabels();
        bindClipboardFixes();
        injectMobileStyles();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => requestAnimationFrame(enhance));
    } else {
        requestAnimationFrame(enhance);
    }
})();
