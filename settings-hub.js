(function () {
    'use strict';

    const BUTTON_ID = 'smart-reader-settings-button';
    const OVERLAY_ID = 'smart-reader-settings-overlay';
    const LANGUAGE_OPTIONS = [
        ['ja', '日本語'], ['en', 'English'], ['zh', '中文'], ['es', 'Español'],
        ['ko', '한국어'], ['fr', 'Français'], ['de', 'Deutsch'], ['pt', 'Português'], ['it', 'Italiano']
    ];

    function database() {
        try { return typeof db !== 'undefined' ? db : null; } catch (_) { return null; }
    }

    function workspaceApi() { return window.SmartReaderWorkspace || null; }
    function workspaceState() { return window.SmartReaderWorkspaceState || null; }

    function selectOption(value, label) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
    }

    function button(text, className, handler) {
        const element = document.createElement('button');
        element.type = 'button';
        element.textContent = text;
        if (className) element.className = className;
        if (handler) element.addEventListener('click', handler);
        return element;
    }

    function section(title, description) {
        const element = document.createElement('section');
        element.className = 'settings-hub-section';
        const heading = document.createElement('h3');
        heading.textContent = title;
        element.appendChild(heading);
        if (description) {
            const paragraph = document.createElement('p');
            paragraph.className = 'settings-hub-section-description';
            paragraph.textContent = description;
            element.appendChild(paragraph);
        }
        return element;
    }

    function field(labelText, control, valueElement) {
        const row = document.createElement('label');
        row.className = 'settings-hub-field';
        const header = document.createElement('span');
        header.className = 'settings-hub-field-label';
        header.textContent = labelText;
        if (valueElement) header.appendChild(valueElement);
        row.append(header, control);
        return row;
    }

    function currentReaderSetting(name, fallback) {
        try {
            if (typeof readerSettings !== 'undefined' && readerSettings && readerSettings[name] !== undefined) {
                return Number(readerSettings[name]);
            }
        } catch (_) {}
        return fallback;
    }

    function applyReaderSetting(type, value) {
        try {
            if (typeof updateSetting === 'function') {
                updateSetting(type, value);
                return true;
            }
        } catch (error) {
            console.warn('Reader setting update failed', error);
        }
        return false;
    }

    function getConfiguredTheme() {
        const value = String(workspaceState()?.globalSettings?.theme || 'system');
        return ['system', 'light', 'dark'].includes(value) ? value : 'system';
    }

    function resolveTheme(theme) {
        if (theme === 'light' || theme === 'dark') return theme;
        try { return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
        catch (_) { return 'light'; }
    }

    function applyTheme(theme) {
        const resolved = resolveTheme(theme);
        document.documentElement.dataset.smartReaderTheme = resolved;
        document.documentElement.dataset.smartReaderThemeMode = theme;
        document.documentElement.style.colorScheme = resolved;
    }

    async function saveGlobalSettings(patch) {
        const api = workspaceApi();
        const dbRef = database();
        if (!api?.updateGlobalSettings || !dbRef) throw new Error('Global settings are unavailable.');
        const next = await api.updateGlobalSettings(dbRef, patch);
        if (window.SmartReaderWorkspaceState) {
            window.SmartReaderWorkspaceState = {
                ...window.SmartReaderWorkspaceState,
                globalSettings: next
            };
        }
        return next;
    }

    function ensureButton() {
        if (document.getElementById(BUTTON_ID)) return;
        const header = document.querySelector('.app-header');
        if (!header) return;
        const element = button('⚙', 'settings-hub-open-button', openSettings);
        element.id = BUTTON_ID;
        element.title = '設定';
        element.setAttribute('aria-label', 'Smart Readerの設定');
        header.appendChild(element);
    }

    function createDisplaySection() {
        const block = section('画面設定', 'すべての学習スペースで共通です。');

        const fontValue = document.createElement('strong');
        const fontInput = document.createElement('input');
        fontInput.type = 'range';
        fontInput.min = '14';
        fontInput.max = '30';
        fontInput.step = '1';
        fontInput.value = String(currentReaderSetting('fontSize', 18));
        fontValue.textContent = ` ${fontInput.value}px`;
        fontInput.addEventListener('input', () => {
            fontValue.textContent = ` ${fontInput.value}px`;
            applyReaderSetting('font', fontInput.value);
        });
        block.appendChild(field('文字サイズ', fontInput, fontValue));

        const lineValue = document.createElement('strong');
        const lineInput = document.createElement('input');
        lineInput.type = 'range';
        lineInput.min = '1.2';
        lineInput.max = '2.5';
        lineInput.step = '0.1';
        lineInput.value = String(currentReaderSetting('lineHeight', 1.8));
        lineValue.textContent = ` ${lineInput.value}`;
        lineInput.addEventListener('input', () => {
            lineValue.textContent = ` ${lineInput.value}`;
            applyReaderSetting('line', lineInput.value);
        });
        block.appendChild(field('行間', lineInput, lineValue));

        const themeSelect = document.createElement('select');
        themeSelect.append(
            selectOption('system', '端末の設定に合わせる'),
            selectOption('light', 'ライト'),
            selectOption('dark', 'ダーク')
        );
        themeSelect.value = getConfiguredTheme();
        themeSelect.addEventListener('change', async () => {
            const previous = getConfiguredTheme();
            applyTheme(themeSelect.value);
            try { await saveGlobalSettings({ theme: themeSelect.value }); }
            catch (error) {
                console.error('Theme setting save failed', error);
                themeSelect.value = previous;
                applyTheme(previous);
            }
        });
        block.appendChild(field('外観', themeSelect));
        return block;
    }

    function createLanguageSection() {
        const block = section('言語', '単語の意味や解説を表示・生成するときの基本言語です。');
        const select = document.createElement('select');
        LANGUAGE_OPTIONS.forEach(([value, label]) => select.appendChild(selectOption(value, label)));
        select.value = String(workspaceState()?.globalSettings?.explanationLanguage || 'ja');
        select.addEventListener('change', async () => {
            const previous = String(workspaceState()?.globalSettings?.explanationLanguage || 'ja');
            try { await saveGlobalSettings({ explanationLanguage: select.value }); }
            catch (error) {
                console.error('Explanation language save failed', error);
                select.value = previous;
            }
        });
        block.appendChild(field('解説言語', select));
        return block;
    }

    function workspaceKindLabel(item) {
        if (item?.kind === 'general') return '一般学習・資格';
        const language = LANGUAGE_OPTIONS.find(([value]) => value === item?.contentLanguage)?.[1] || item?.contentLanguage || '語学';
        return `語学 · ${language}`;
    }

    function createWorkspaceSection() {
        const block = section('学習スペース', '教材・単語・Study履歴はスペースごとに分かれています。');
        const list = document.createElement('div');
        list.className = 'settings-hub-workspace-list';
        const state = workspaceState();
        (state?.workspaces || []).forEach(item => {
            const row = document.createElement('div');
            row.className = 'settings-hub-workspace-row';
            const text = document.createElement('div');
            const name = document.createElement('strong');
            name.textContent = item.name || 'スペース';
            const meta = document.createElement('span');
            meta.textContent = workspaceKindLabel(item);
            text.append(name, meta);
            row.appendChild(text);
            if (item.id === state?.activeWorkspaceId) {
                const badge = document.createElement('span');
                badge.className = 'settings-hub-active-badge';
                badge.textContent = '使用中';
                row.appendChild(badge);
            }
            list.appendChild(row);
        });
        block.appendChild(list);
        const createButton = button('＋ 新しい学習スペース', 'btn-sub', () => {
            closeSettings();
            document.querySelector('.workspace-add-button')?.click();
        });
        block.appendChild(createButton);
        return block;
    }

    function createBackupSection() {
        const block = section('バックアップ', '教材・単語・学習履歴などをバックアップファイルとして保存・復元します。');
        const actions = document.createElement('div');
        actions.className = 'settings-hub-actions';
        actions.append(
            button('バックアップを保存', 'btn-sub', () => {
                try { if (typeof exportSmartReaderBackup === 'function') void exportSmartReaderBackup(); }
                catch (error) { console.error('Backup export failed', error); }
            }),
            button('バックアップから復元', 'btn-sub', () => {
                closeSettings();
                try { if (typeof openSmartReaderRestore === 'function') openSmartReaderRestore(); }
                catch (error) { console.error('Backup restore open failed', error); }
            })
        );
        block.appendChild(actions);
        return block;
    }

    function createAccountSection() {
        const block = section('アカウント', '現在はこの端末・ブラウザ内に保存されています。');
        const row = document.createElement('div');
        row.className = 'settings-hub-account-row';
        const status = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = '端末内モード';
        const detail = document.createElement('span');
        detail.textContent = 'アカウント・Cloud同期は今後追加予定';
        status.append(title, detail);
        row.appendChild(status);
        block.appendChild(row);
        return block;
    }

    function ensureOverlay() {
        let overlay = document.getElementById(OVERLAY_ID);
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.className = 'settings-hub-overlay';
        overlay.hidden = true;

        const panel = document.createElement('section');
        panel.className = 'settings-hub-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'settings-hub-title');

        const header = document.createElement('header');
        header.className = 'settings-hub-header';
        const heading = document.createElement('h2');
        heading.id = 'settings-hub-title';
        heading.textContent = '設定';
        const close = button('×', 'settings-hub-close-button', closeSettings);
        close.setAttribute('aria-label', '設定を閉じる');
        header.append(heading, close);

        const body = document.createElement('div');
        body.className = 'settings-hub-body';
        body.dataset.settingsHubBody = '';
        panel.append(header, body);
        overlay.appendChild(panel);
        overlay.addEventListener('click', event => { if (event.target === overlay) closeSettings(); });
        document.body.appendChild(overlay);
        return overlay;
    }

    function renderSettings() {
        const overlay = ensureOverlay();
        const body = overlay.querySelector('[data-settings-hub-body]');
        if (!body) return;
        body.replaceChildren(
            createAccountSection(),
            createBackupSection(),
            createDisplaySection(),
            createLanguageSection(),
            createWorkspaceSection()
        );
    }

    function openSettings() {
        renderSettings();
        const overlay = ensureOverlay();
        overlay.hidden = false;
        document.body.classList.add('settings-hub-open');
        overlay.querySelector('.settings-hub-close-button')?.focus();
    }

    function closeSettings() {
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay) overlay.hidden = true;
        document.body.classList.remove('settings-hub-open');
    }

    function refreshFromWorkspace(event) {
        if (event?.detail) window.SmartReaderWorkspaceState = event.detail;
        applyTheme(getConfiguredTheme());
        ensureButton();
        if (!document.getElementById(OVERLAY_ID)?.hidden) renderSettings();
    }

    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener?.('change', () => {
        if (getConfiguredTheme() === 'system') applyTheme('system');
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !document.getElementById(OVERLAY_ID)?.hidden) closeSettings();
    });
    window.addEventListener('smartreader:workspace-ready', refreshFromWorkspace);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            ensureOverlay();
            ensureButton();
            applyTheme(getConfiguredTheme());
        }, { once: true });
    } else {
        ensureOverlay();
        ensureButton();
        applyTheme(getConfiguredTheme());
    }

    window.SmartReaderSettingsHub = Object.freeze({ open: openSettings, close: closeSettings, applyTheme });
})();
