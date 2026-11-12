/* Smart Reader onboarding. Keep selectors and copy here so future UI changes are easy to audit. */
(function () {
    'use strict';

    const STORAGE_KEY = 'smart-reader-onboarding-v1';
    const HINTS_KEY = 'smart-reader-tab-hints-v1';
    const SAMPLES = Object.freeze({ en: 'sample-story-001', zh: 'tour-zh-001' });
    const TARGETS = Object.freeze({
        discover: id => '[data-tour-id="discover-article"][data-article="' + id + '"]',
        reader: '[data-tour-id="reader-text"]',
        add: '[data-tour-id="add-entry"]',
        word: '[data-tour-id="word-input"]',
        note: '[data-tour-id="note-type"]',
        question: '[data-tour-id="question-type"]',
        save: '[data-tour-id="save-discover"]',
        library: '#library-list [data-tour-id="library-item"]',
        vocabulary: '#vocabulary-section .learning-section-heading',
        study: '#study-center-section .learning-section-heading',
        problems: '#problems-section .learning-section-heading'
    });
    const HINT_COPY = Object.freeze({
        vocabulary: ['単語帳へようこそ', '記事から登録した単語を、ここでまとめて確認できます。検索や絞り込みも使えます。'],
        study: ['復習を始めましょう', '保存した単語をカードなどで復習できます。自分のペースで繰り返しましょう。'],
        problems: ['問題で理解度を確認', '記事から登録した問題を探し、解いて、理解を深められます。']
    });
    let state = null;
    let activeCoach = null;
    let currentTarget = null;
    let activeHint = null;
    let raf = 0;
    let updating = false;

    function read(key, fallback) {
        try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
        catch (_) { return fallback; }
    }
    function write(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
    }
    function setPhase(phase, extra) {
        state = Object.assign({}, state || {}, extra || {}, { phase });
        write(STORAGE_KEY, state);
        renderPhase();
    }
    function clearPresentation() {
        document.body.classList.remove('sr-tour-welcome-active', 'sr-tour-setup-active');
        document.querySelector('#sr-tour-welcome')?.remove();
        document.querySelector('#sr-tour-completion')?.remove();
        removeCoach();
    }
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }
    function action(label, handler, variant) {
        const node = el('button', 'sr-tour-button' + (variant ? ' sr-tour-button--' + variant : ''), label);
        node.type = 'button';
        node.addEventListener('click', handler);
        return node;
    }
    function setupPending() {
        return window.SmartReaderWorkspaceState?.activeWorkspace?.setupPending === true;
    }
    function activeLanguage() {
        const code = String(window.SmartReaderWorkspaceState?.activeWorkspace?.contentLanguage || 'en');
        return code.startsWith('zh') ? 'zh' : 'en';
    }
    function sampleId() { return SAMPLES[state?.sampleLanguage || activeLanguage()] || SAMPLES.en; }
    function targetVisible(target) {
        return !!target && target.isConnected && target.getClientRects().length > 0;
    }
    function ensureLayer() {
        let layer = document.getElementById('sr-tour-coach');
        if (!layer) {
            layer = el('div', 'sr-tour-layer');
            layer.id = 'sr-tour-coach';
            const spot = el('div', 'sr-tour-spotlight');
            const panel = el('section', 'sr-tour-coach-card');
            panel.setAttribute('role', 'status');
            panel.setAttribute('aria-live', 'polite');
            layer.append(spot, panel);
            document.body.appendChild(layer);
        }
        return layer;
    }
    function removeCoach() {
        document.getElementById('sr-tour-coach')?.remove();
        currentTarget = null;
        activeCoach = null;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
    }
    function positionCoach() {
        if (!activeCoach) return;
        const layer = document.getElementById('sr-tour-coach');
        if (!layer) return;
        let target = document.querySelector(activeCoach.selector);
        if (activeCoach.find) target = activeCoach.find();
        const panel = layer.querySelector('.sr-tour-coach-card');
        const spot = layer.querySelector('.sr-tour-spotlight');
        const width = Math.min(window.innerWidth - 24, 350);
        panel.style.width = width + 'px';
        if (!targetVisible(target)) {
            spot.hidden = true;
            panel.style.left = Math.max(12, (window.innerWidth - width) / 2) + 'px';
            panel.style.top = Math.max(16, window.innerHeight - panel.offsetHeight - 26) + 'px';
            return;
        }
        currentTarget = target;
        const rect = target.getBoundingClientRect();
        const pad = 5;
        const left = Math.max(5, rect.left - pad);
        const right = Math.min(window.innerWidth - 5, rect.right + pad);
        const top = Math.max(5, rect.top - pad);
        const bottom = Math.min(window.innerHeight - 5, rect.bottom + pad);
        spot.hidden = false;
        Object.assign(spot.style, { left: left + 'px', top: top + 'px', width: Math.max(0, right - left) + 'px', height: Math.max(0, bottom - top) + 'px' });
        const x = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
        let y = rect.bottom + 18;
        const panelHeight = panel.offsetHeight;
        if (y + panelHeight > window.innerHeight - 16) y = rect.top - panelHeight - 18;
        if (y < 12 || y + panelHeight > window.innerHeight - 12) y = Math.max(12, window.innerHeight - panelHeight - 18);
        panel.style.left = x + 'px';
        panel.style.top = y + 'px';
    }
    function queuePosition() {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(positionCoach);
    }
    function coach(config) {
        removeCoach();
        activeCoach = config;
        const layer = ensureLayer();
        const panel = layer.querySelector('.sr-tour-coach-card');
        panel.replaceChildren();
        panel.appendChild(el('small', 'sr-tour-step', config.step || 'SMART READER GUIDE'));
        panel.appendChild(el('h3', '', config.title));
        panel.appendChild(el('p', '', config.description));
        const footer = el('div', 'sr-tour-coach-actions');
        if (config.onSkip) footer.appendChild(action('スキップ', config.onSkip, 'quiet'));
        if (config.onNext) footer.appendChild(action(config.nextText || '次へ', config.onNext));
        else footer.appendChild(el('span', 'sr-tour-waiting', '強調した場所を操作してください'));
        panel.appendChild(footer);
        const target = config.find ? config.find() : document.querySelector(config.selector);
        if (targetVisible(target)) {
            const bounds = target.getBoundingClientRect();
            if (bounds.top < 8 || bounds.bottom > window.innerHeight - 8) {
                target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            }
        }
        queuePosition();
        setTimeout(queuePosition, 150);
    }
    function welcome() {
        clearPresentation();
        document.body.classList.add('sr-tour-welcome-active');
        const layer = el('div', 'sr-tour-welcome');
        layer.id = 'sr-tour-welcome';
        const card = el('section', 'sr-tour-welcome-card');
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        card.setAttribute('aria-labelledby', 'sr-tour-welcome-title');
        const header = el('header', 'sr-tour-welcome-header');
        header.append(el('span', '', 'SMART READER'), action('スキップ', finishWithoutTour, 'quiet'));
        const visual = el('div', 'sr-tour-book-scene');
        visual.setAttribute('aria-hidden', 'true');
        visual.innerHTML = '<svg viewBox="0 0 340 230" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="sr-cover" x1="69" y1="62" x2="276" y2="194" gradientUnits="userSpaceOnUse"><stop stop-color="#A58A72"/><stop offset="1" stop-color="#79614E"/></linearGradient><linearGradient id="sr-paper" x1="83" y1="69" x2="184" y2="181" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFDF9"/><stop offset="1" stop-color="#E8DDCD"/></linearGradient><filter id="sr-shadow" x="20" y="30" width="310" height="190"><feGaussianBlur stdDeviation="11"/></filter></defs><ellipse cx="171" cy="190" rx="119" ry="18" fill="#6E5848" opacity=".13" filter="url(#sr-shadow)"/><path d="M36 159C78 129 120 127 171 160C218 127 264 130 307 159L300 190C256 161 212 158 171 185C122 158 76 163 44 189Z" fill="url(#sr-cover)"/><path d="M48 67C91 56 135 65 170 91V173C126 144 84 142 48 153V67Z" fill="url(#sr-paper)" stroke="#D9CBBB" stroke-width="2"/><path d="M170 91C208 66 258 57 292 67V153C251 140 207 145 170 173V91Z" fill="#FFF9EF" stroke="#D9CBBB" stroke-width="2"/><path d="M169 91V173" stroke="#CEBFAA" stroke-width="3"/><path d="M59 81C100 73 132 84 159 102M59 94C100 86 132 95 159 112M181 103C211 87 251 76 281 82M181 114C212 99 249 90 281 94" stroke="#DBCFC0" stroke-width="1.7" stroke-linecap="round"/><path d="M58 142C97 132 134 143 168 165M172 165C209 142 253 133 282 143" stroke="#DED1C2" stroke-width="1.6"/><rect x="185" y="20" width="98" height="49" rx="12" fill="#FFFEFC" stroke="#E7D9C9"/><rect x="197" y="33" width="58" height="5" rx="2.5" fill="#B59D83"/><rect x="197" y="44" width="73" height="5" rx="2.5" fill="#E6DACE"/><rect x="197" y="55" width="44" height="4" rx="2" fill="#E6DACE"/><rect x="84" y="16" width="72" height="39" rx="10" fill="#F5EDE2" stroke="#E6D9C7"/><rect x="95" y="28" width="48" height="5" rx="2.5" fill="#9B806A"/><rect x="95" y="39" width="34" height="4" rx="2" fill="#D9C7B5"/></svg>';
        const dots = el('div', 'sr-tour-progress');
        dots.append(el('span', 'is-current'), el('span'));
        const heading = el('h2', '', '読みながら、言葉を自分のものに。');
        heading.id = 'sr-tour-welcome-title';
        const subtitle = el('p', 'sr-tour-welcome-subtitle', '文章を読みながら気になる単語を単語帳に追加。あとから復習して、少しずつ身につけましょう。');
        const features = el('div', 'sr-tour-features');
        [['Library', '記事・資料を保存'], ['Vocabulary', '単語を整理'], ['Study', '復習して定着'], ['Problems', '問題で理解度を確認']].forEach(row => {
            const item = el('div', 'sr-tour-feature');
            item.append(el('strong', '', row[0]), el('span', '', row[1]));
            features.appendChild(item);
        });
        const buttons = el('div', 'sr-tour-welcome-actions');
        buttons.appendChild(action(setupPending() ? 'はじめる' : '実際に使ってみる', () => {
            layer.remove();
            document.body.classList.remove('sr-tour-welcome-active');
            if (setupPending()) setPhase('setup');
            else beginDiscover();
        }));
        const note = el('small', 'sr-tour-time', '操作ガイドはいつでもスキップできます');
        card.append(header, visual, dots, heading, subtitle, features, buttons, note);
        layer.appendChild(card);
        document.body.appendChild(layer);
        card.querySelector('.sr-tour-welcome-actions button')?.focus();
    }
    function decorateSetup() {
        clearPresentation();
        document.body.classList.add('sr-tour-setup-active');
        const card = document.querySelector('#smart-reader-workspace-create-overlay .workspace-create-card');
        if (card && !card.querySelector('#sr-tour-setup-heading')) {
            const label = el('p', 'sr-tour-setup-heading', 'STEP 02 · 学習する言語を選択');
            label.id = 'sr-tour-setup-heading';
            card.prepend(label);
        }
    }
    function beginDiscover() {
        clearPresentation();
        state = Object.assign({}, state || {}, { phase: 'discover', sampleLanguage: activeLanguage() });
        write(STORAGE_KEY, state);
        window.showDiscover?.();
        renderPhase();
    }
    function savedArticleCard() {
        const cards = Array.from(document.querySelectorAll('#library-list [data-tour-id="library-item"]'));
        return cards.find(card => card.dataset.libraryItemId === String(state?.articleId)) || cards.find(card => card.querySelector('h3')?.textContent?.trim() === state?.articleName) || cards[0] || document.querySelector('#library-list');
    }
    function renderPhase() {
        if (updating) return;
        updating = true;
        try {
            removeCoach();
            if (!state || state.phase === 'done' || state.phase === 'skipped') return;
            if (state.phase === 'welcome') { welcome(); return; }
            if (state.phase === 'setup') {
                if (setupPending()) decorateSetup(); else beginDiscover();
                return;
            }
            if (state.phase === 'discover') {
                coach({
                    selector: TARGETS.discover(sampleId()), step: 'STEP 03 · DISCOVER',
                    title: 'まずは記事を開いてみましょう',
                    description: 'サンプル記事をタップすると、読む画面が開きます。',
                    onSkip: () => setPhase('done')
                });
            } else if (state.phase === 'reader') {
                coach({
                    selector: TARGETS.reader, step: 'STEP 04 · READER',
                    title: '文章を読みながら学べます',
                    description: '本文中の気になる単語や表現を確認できます。次は、単語帳に登録してみましょう。',
                    nextText: '追加方法を見る', onNext: () => setPhase('add'),
                    onSkip: () => setPhase('save')
                });
            } else if (state.phase === 'add') {
                coach({
                    selector: TARGETS.add, step: 'STEP 05 · 追加',
                    title: '「＋」から単語を追加',
                    description: 'このボタンから、単語・ノート・問題を登録できます。タップしてみましょう。',
                    onSkip: () => setPhase('save')
                });
            } else if (state.phase === 'word') {
                coach({
                    selector: TARGETS.word, step: 'STEP 05 · 単語',
                    title: '単語と意味を登録しましょう',
                    description: '単語・フレーズと意味を入力して「保存」を押してください。実際の単語帳に登録されます。',
                    onSkip: () => { window.closeModal?.(); setPhase('save'); }
                });
            } else if (state.phase === 'extras') {
                coach({
                    selector: TARGETS.add, step: 'STEP 05 · ノートと問題',
                    title: 'ノートや問題もここから',
                    description: '単語を保存できました。もう一度「＋」を押すと、ノートや問題の追加も選べます。',
                    onSkip: () => setPhase('save')
                });
            } else if (state.phase === 'note') {
                coach({
                    selector: TARGETS.note, step: 'STEP 05 · ノート',
                    title: '文法や気づきをノートに',
                    description: '「ノート」を選ぶと、原文・訳・解説を残せます。ここでは説明だけでも大丈夫です。',
                    nextText: '問題について見る', onNext: () => setPhase('question'),
                    onSkip: () => { window.closeModal?.(); setPhase('save'); }
                });
            } else if (state.phase === 'question') {
                coach({
                    selector: TARGETS.question, step: 'STEP 05 · 問題',
                    title: '自分で問題を作れます',
                    description: '「問題」を選ぶと、設問・答え・解説を登録できます。必要になったときに試してみましょう。',
                    nextText: '記事の保存へ', onNext: () => { window.closeModal?.(); setPhase('save'); },
                    onSkip: () => { window.closeModal?.(); setPhase('save'); }
                });
            } else if (state.phase === 'save') {
                const button = document.querySelector(TARGETS.save);
                if (targetVisible(button)) {
                    coach({
                        selector: TARGETS.save, step: 'STEP 06 · LIBRARY',
                        title: '記事をLibraryに保存しましょう',
                        description: '「Libraryに保存」を押すと、後から記事を読み返せます。',
                        onSkip: () => showLibraryGuide()
                    });
                } else {
                    coach({
                        selector: '#reader-breadcrumbs', step: 'STEP 06 · LIBRARY',
                        title: 'Libraryで管理しましょう',
                        description: 'この記事はすでにLibraryに保存されているようです。',
                        nextText: 'Libraryを見る', onNext: showLibraryGuide
                    });
                }
            } else if (state.phase === 'saved') {
                coach({
                    selector: '#reader-breadcrumbs', step: 'STEP 06 · 保存完了',
                    title: '記事を保存しました！',
                    description: 'Libraryに移動して、保存した記事を確認してみましょう。',
                    nextText: 'Libraryで確認', onNext: showLibraryGuide
                });
            } else if (state.phase === 'library') {
                coach({
                    selector: TARGETS.library, find: savedArticleCard, step: 'STEP 07 · 完了',
                    title: 'ここがあなたのLibraryです',
                    description: '保存した記事や自分で追加した資料が並びます。いつでもここから読み直せます。',
                    nextText: 'チュートリアルを完了', onNext: finishTour
                });
            }
        } finally { updating = false; }
    }
    function showLibraryGuide() {
        state = Object.assign({}, state || {}, { phase: 'library' });
        write(STORAGE_KEY, state);
        window.goToFolder?.(null);
        renderPhase();
    }
    function finishWithoutTour() {
        clearPresentation();
        state = Object.assign({}, state || {}, { phase: 'skipped' });
        write(STORAGE_KEY, state);
    }
    function finishTour() {
        clearPresentation();
        state = Object.assign({}, state || {}, { phase: 'done' });
        write(STORAGE_KEY, state);
        const overlay = el('div', 'sr-tour-completion');
        overlay.id = 'sr-tour-completion';
        const card = el('section', 'sr-tour-completion-card');
        card.setAttribute('role', 'dialog');
        card.setAttribute('aria-modal', 'true');
        card.append(el('div', 'sr-tour-success-icon', '✓'), el('h2', '', '使い方の案内が完了しました！'),
            el('p', '', '読む・単語を登録する・記事を保存する流れを確認しました。これからも、自分のペースで学びましょう。'),
            action('学習を続ける', () => overlay.remove()));
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        card.querySelector('button')?.focus();
    }
    function restart() {
        clearPresentation();
        state = { phase: 'welcome' };
        write(STORAGE_KEY, state);
        welcome();
    }
    function showTabHint(tab) {
        if (!HINT_COPY[tab] || activeHint || !state || !['done', 'skipped'].includes(state.phase)) return;
        const hints = read(HINTS_KEY, {});
        if (hints[tab]) return;
        const section = document.getElementById(tab === 'study' ? 'study-center-section' : tab + '-section');
        if (!section || section.style.display === 'none') return;
        activeHint = tab;
        coach({
            selector: TARGETS[tab], step: 'はじめての ' + tab.toUpperCase(),
            title: HINT_COPY[tab][0], description: HINT_COPY[tab][1],
            nextText: 'わかりました',
            onNext: () => {
                write(HINTS_KEY, Object.assign({}, read(HINTS_KEY, {}), { [tab]: true }));
                activeHint = null;
                removeCoach();
            },
            onSkip: () => {
                write(HINTS_KEY, Object.assign({}, read(HINTS_KEY, {}), { [tab]: true }));
                activeHint = null;
                removeCoach();
            }
        });
    }
    function onClick(event) {
        const add = event.target.closest?.(TARGETS.add);
        if (add && state?.phase === 'add') setTimeout(() => setPhase('word'), 50);
        else if (add && state?.phase === 'extras') setTimeout(() => setPhase('note'), 50);
        const tab = event.target.closest?.('[data-main-tab-target]')?.dataset?.mainTabTarget;
        if (tab && HINT_COPY[tab]) {
            if (activeHint) { removeCoach(); activeHint = null; }
            setTimeout(() => showTabHint(tab), 150);
        } else if (tab && activeHint) {
            removeCoach();
            activeHint = null;
        }
    }
    function init() {
        state = read(STORAGE_KEY, null);
        if (!state && setupPending()) {
            state = { phase: 'welcome' };
            write(STORAGE_KEY, state);
        }
        if (!state) return; // Existing users must not receive a forced onboarding.
        const main = document.getElementById('main-reader');
        if (main) new MutationObserver(queuePosition).observe(main, {
            childList: true, subtree: true, attributes: true, attributeFilter: ['style']
        });
        new MutationObserver(() => {
            if (state?.phase === 'setup' && document.getElementById('smart-reader-workspace-create-overlay')) decorateSetup();
        }).observe(document.body, { childList: true });
        if (state.phase === 'setup' && !setupPending()) {
            beginDiscover();
        } else if (state.phase === 'welcome' || state.phase === 'setup') {
            renderPhase();
        } else if (!['done', 'skipped'].includes(state.phase)) {
            // Resume after refresh. Only navigate when actually continuing an unfinished tour.
            if (state.phase === 'discover') window.showDiscover?.();
            else if (state.phase === 'library') window.goToFolder?.(null);
            else {
                // Reader and modal state are not reliably restorable across reloads.
                // Return to Discover without mutating learning data.
                state.phase = 'discover';
                write(STORAGE_KEY, state);
                window.showDiscover?.();
            }
            renderPhase();
        }
    }
    window.addEventListener('smartreader:article-opened', event => {
        const detail = event.detail || {};
        if (state?.phase === 'discover' && detail.discoverId) {
            setPhase('reader', { articleName: detail.name });
        }
    });
    window.addEventListener('smartreader:unified-item-saved', event => {
        if (state?.phase === 'word' && event.detail?.type === 'word') {
            setTimeout(() => setPhase('extras'), 40);
        }
    });
    window.addEventListener('smartreader:discover-saved', event => {
        if (['save', 'saved'].includes(state?.phase)) {
            setPhase('saved', { articleName: event.detail?.name || state.articleName, articleId: event.detail?.id });
        }
    });
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && state && !['done', 'skipped'].includes(state.phase)) finishWithoutTour();
        else if (event.key === 'Escape' && activeHint) { removeCoach(); activeHint = null; }
    });
    window.addEventListener('resize', queuePosition, { passive: true });
    window.addEventListener('scroll', queuePosition, true);
    window.addEventListener('orientationchange', queuePosition);
    window.SmartReaderOnboarding = Object.freeze({ restart, getState: () => state ? Object.assign({}, state) : null, targets: TARGETS });
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => Promise.resolve(window.SmartReaderAppReady).then(init), { once: true });
    } else {
        Promise.resolve(window.SmartReaderAppReady).then(init);
    }
})();