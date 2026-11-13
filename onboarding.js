/* Smart Reader onboarding. Keep selectors and copy here so future UI changes are easy to audit. */
(function () {
    'use strict';

    const STORAGE_KEY = 'smart-reader-onboarding-v2';
    const HINTS_KEY = 'smart-reader-tab-hints-v1';
    const TARGETS = Object.freeze({
        libraryArticle: '[data-tour-id="library-item"]',
        chapter: '#chapter-title-btn',
        readerSentence: '#text-display p',
        add: '[data-tour-id="add-entry"]',
        word: '[data-tour-id="word-input"]',
        note: '[data-tour-id="note-type"]',
        question: '[data-tour-id="question-type"]',
        libraryBack: '#reader-breadcrumbs ol > li:first-child button',
        addMaterial: '#library-section .library-actions .start-btn',
        discoverTab: '#library-section [data-main-tab-target="discover"]',
        discoverSearch: '#discover-search',
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
    let selectionTimer = null;

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
        document.body.classList.remove('sr-tour-welcome-active', 'sr-tour-setup-active', 'sr-tour-reader-focus', 'sr-tour-return-library');
        document.querySelector('#sr-tour-welcome')?.remove();
        document.querySelector('#sr-tour-completion')?.remove();
        removeCoach();
        clearInlineGuide();
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
    function clearInlineGuide() {
        document.querySelectorAll('.sr-tour-inline-guide').forEach(element => element.remove());
    }
    function inlineGuide(title, description, options = {}) {
        removeCoach();
        clearInlineGuide();
        const form = document.querySelector('#unified-modal-overlay.show form');
        if (!form) return;
        const section = el('section', 'sr-tour-inline-guide');
        section.setAttribute('aria-label', '使い方ガイド');
        section.append(el('strong', '', title), el('p', '', description));
        const footer = el('div', 'sr-tour-inline-actions');
        if (options.next) footer.appendChild(action(options.nextText || '次へ', options.next));
        if (options.skip) footer.appendChild(action('スキップ', options.skip, 'quiet'));
        section.appendChild(footer);
        form.prepend(section);
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
        if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) {
            spot.hidden = true;
            panel.style.left = Math.max(12, (window.innerWidth - width) / 2) + 'px';
            panel.style.top = Math.max(12, window.innerHeight - panel.offsetHeight - 18) + 'px';
            return;
        }
        const pad = 5;
        const left = Math.max(5, rect.left - pad);
        const right = Math.min(window.innerWidth - 5, rect.right + pad);
        const top = Math.max(5, rect.top - pad);
        const bottom = Math.min(window.innerHeight - 5, rect.bottom + pad);
        spot.hidden = false;
        Object.assign(spot.style, { left: left + 'px', top: top + 'px', width: Math.max(0, right - left) + 'px', height: Math.max(0, bottom - top) + 'px' });
        const x = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2));
        if (activeCoach.placement === 'bottom') {
            panel.style.left = x + 'px';
            panel.style.top = Math.max(12, window.innerHeight - panel.offsetHeight - 18) + 'px';
            return;
        }
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
        // Never auto-scroll a highlighted target. Sliding the page while the
        // spotlight follows it was disorienting on iPhone Safari.
        queuePosition();
        setTimeout(queuePosition, 150);
    }

    const INTRO_PAGES = Object.freeze([
        { title: '読みながら、言葉を自分のものに。', description: '文章の中で気になる単語を単語帳に追加し、あとから復習できます。', kind: 'overview', badge: 'SMART READER' },
        { title: 'Library', description: '記事・書籍を自分の本棚で管理。ファイルやフォルダを追加し、章ごとに読み進められます。', kind: 'library', badge: '読む・整理する' },
        { title: 'Discover', description: '興味のある文章を探して、学習する記事を増やしましょう。', kind: 'discover', badge: '文章を探す' },
        { title: 'Vocabulary', description: '読書中に保存した単語をまとめて管理。意味を確認し、覚えた言葉を整理できます。', kind: 'vocabulary', badge: '単語帳' },
        { title: 'Study', description: '保存した単語をカードで復習。読むだけでは終わらない学習へ。', kind: 'study', badge: '復習する' },
        { title: 'Problems', description: '自分で作成した問題を解いて、文章の理解度を確かめられます。', kind: 'problems', badge: '理解を確かめる' }
    ]);
    function introPreview(kind) {
        const frame = el('div', 'sr-tour-preview sr-tour-preview--' + kind);
        frame.setAttribute('aria-hidden', 'true');
        if (kind === 'overview') {
            const visual = el('div', 'sr-tour-book-scene');
            visual.innerHTML = '<svg viewBox="0 0 340 230" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="sr-cover" x1="69" y1="62" x2="276" y2="194" gradientUnits="userSpaceOnUse"><stop stop-color="#A58A72"/><stop offset="1" stop-color="#79614E"/></linearGradient><linearGradient id="sr-paper" x1="83" y1="69" x2="184" y2="181" gradientUnits="userSpaceOnUse"><stop stop-color="#FFFDF9"/><stop offset="1" stop-color="#E8DDCD"/></linearGradient><filter id="sr-shadow" x="20" y="30" width="310" height="190"><feGaussianBlur stdDeviation="11"/></filter></defs><ellipse cx="171" cy="190" rx="119" ry="18" fill="#6E5848" opacity=".13" filter="url(#sr-shadow)"/><path d="M36 159C78 129 120 127 171 160C218 127 264 130 307 159L300 190C256 161 212 158 171 185C122 158 76 163 44 189Z" fill="url(#sr-cover)"/><path d="M48 67C91 56 135 65 170 91V173C126 144 84 142 48 153V67Z" fill="url(#sr-paper)" stroke="#D9CBBB" stroke-width="2"/><path d="M170 91C208 66 258 57 292 67V153C251 140 207 145 170 173V91Z" fill="#FFF9EF" stroke="#D9CBBB" stroke-width="2"/><path d="M169 91V173" stroke="#CEBFAA" stroke-width="3"/><path d="M59 81C100 73 132 84 159 102M59 94C100 86 132 95 159 112M181 103C211 87 251 76 281 82M181 114C212 99 249 90 281 94" stroke="#DBCFC0" stroke-width="1.7" stroke-linecap="round"/><path d="M58 142C97 132 134 143 168 165M172 165C209 142 253 133 282 143" stroke="#DED1C2" stroke-width="1.6"/><rect x="185" y="20" width="98" height="49" rx="12" fill="#FFFEFC" stroke="#E7D9C9"/><rect x="197" y="33" width="58" height="5" rx="2.5" fill="#B59D83"/><rect x="197" y="44" width="73" height="5" rx="2.5" fill="#E6DACE"/><rect x="197" y="55" width="44" height="4" rx="2" fill="#E6DACE"/><rect x="84" y="16" width="72" height="39" rx="10" fill="#F5EDE2" stroke="#E6D9C7"/><rect x="95" y="28" width="48" height="5" rx="2.5" fill="#9B806A"/><rect x="95" y="39" width="34" height="4" rx="2" fill="#D9C7B5"/></svg>';
            frame.appendChild(visual);
            return frame;
        }
        // Compact static compositions match the actual tab labels and UI
        // patterns, without mounting a second live copy of the application.
        const mock = {
            library: '<div class="sr-tour-mini-tabs"><b>Library</b><span>Discover</span><span>Vocabulary</span></div><div class="sr-tour-mini-actions"><span>＋ フォルダ作成</span><strong>＋ 記事・ファイル追加</strong></div><div class="sr-tour-mini-row"><span>📖</span><div><b>Smart Readerの使い方</b><small>Chapter 1 / Chapter 2</small></div></div>',
            discover: '<div class="sr-tour-mini-tabs"><span>Library</span><b>Discover</b><span>Study</span></div><div class="sr-tour-mini-search">⌕　記事を検索...</div><div class="sr-tour-mini-row"><span>▤</span><div><b>The Secret of the Old Library</b><small>Stories · 初級</small></div></div><div class="sr-tour-mini-row"><span>▤</span><div><b>Exploring Our Changing Planet</b><small>News · 中級</small></div></div>',
            vocabulary: '<div class="sr-tour-mini-tabs"><span>Library</span><b>Vocabulary</b><span>Study</span></div><div class="sr-tour-mini-search">⌕　単語を検索...</div><div class="sr-tour-mini-row"><span>Aa</span><div><b>habit</b><small>習慣 · 未暗記</small></div></div><div class="sr-tour-mini-row"><span>Ab</span><div><b>discover</b><small>発見する · 未暗記</small></div></div>',
            study: '<div class="sr-tour-mini-tabs"><span>Vocabulary</span><b>Study</b><span>Problems</span></div><div class="sr-tour-mini-study"><small>復習カード 1 / 5</small><b>habit</b><span>タップして意味を確認</span></div>',
            problems: '<div class="sr-tour-mini-tabs"><span>Study</span><b>Problems</b><span>Library</span></div><div class="sr-tour-mini-problem"><small>QUESTION</small><b>habit の意味は？</b><div>① 習慣</div><div>② 発明</div><div>③ 理由</div></div>'
        };
        frame.innerHTML = mock[kind] || '';
        return frame;
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
        const slide = Math.min(INTRO_PAGES.length - 1, Math.max(0, Number(state?.slide) || 0));
        const page = INTRO_PAGES[slide];
        const header = el('header', 'sr-tour-welcome-header');
        header.append(el('span', '', 'SMART READER'), action('スキップ', finishWithoutTour, 'quiet'));
        const progress = el('div', 'sr-tour-progress');
        progress.setAttribute('aria-label', (slide + 1) + ' / ' + INTRO_PAGES.length);
        INTRO_PAGES.forEach((_, i) => {
            const dot = el('span', i === slide ? 'is-current' : '');
            progress.appendChild(dot);
        });
        const heading = el('h2', '', page.title);
        heading.id = 'sr-tour-welcome-title';
        const badge = el('small', 'sr-tour-page-badge', page.badge);
        const subtitle = el('p', 'sr-tour-welcome-subtitle', page.description);
        const buttons = el('div', 'sr-tour-welcome-actions');
        if (slide > 0) buttons.appendChild(action('戻る', () => setPhase('welcome', { slide: slide - 1 }), 'quiet'));
        const last = slide === INTRO_PAGES.length - 1;
        buttons.appendChild(action(last ? (setupPending() ? '学習スペースを設定' : 'Libraryで始める') : '次へ', () => {
            if (!last) setPhase('welcome', { slide: slide + 1 });
            else if (setupPending()) setPhase('setup');
            else void beginLibrary();
        }));
        card.append(header, introPreview(page.kind), progress, badge, heading, subtitle, buttons,
            el('small', 'sr-tour-time', '全6ページ · あとから設定で見直せます'));
        layer.appendChild(card);
        document.body.appendChild(layer);
        card.querySelector('.sr-tour-welcome-actions button:last-child')?.focus();
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
    async function beginLibrary() {
        clearPresentation();
        state = Object.assign({}, state || {}, { phase: 'library-article', sampleLanguage: activeLanguage() });
        write(STORAGE_KEY, state);
        let sample = null;
        try { sample = await window.SmartReaderOnboardingEnsureSample?.(); }
        catch (error) { console.warn('Tutorial sample could not be prepared', error); }
        if (!state || ['done', 'skipped', 'welcome'].includes(state.phase)) return;
        if (sample) {
            state.articleId = String(sample.id);
            state.articleName = sample.name;
            write(STORAGE_KEY, state);
        }
        window.goToFolder?.(null);
        renderPhase();
    }
    function tourArticleCard() {
        const cards = Array.from(document.querySelectorAll('#library-list [data-tour-id="library-item"]'));
        return cards.find(card => card.dataset.libraryItemId === String(state?.articleId)) || null;
    }
    function renderPhase() {
        if (updating) return;
        updating = true;
        try {
            removeCoach();
            clearInlineGuide();
            // Hide unrelated floating add/list controls until the guide reaches them.
            // Do not change their app-managed inline display styles.
            document.body.classList.toggle('sr-tour-reader-focus', ['chapter', 'select'].includes(state?.phase));
            document.body.classList.toggle('sr-tour-return-library', state?.phase === 'return-library');
            if (!state || ['done', 'skipped'].includes(state.phase)) return;
            if (state.phase === 'welcome') { welcome(); return; }
            if (state.phase === 'setup') {
                if (setupPending()) decorateSetup();
                else void beginLibrary();
                return;
            }
            if (state.phase === 'library-article') {
                const card = tourArticleCard();
                coach({
                    selector: TARGETS.libraryArticle, find: tourArticleCard,
                    step: 'LIBRARY · 01', title: 'Libraryで記事を開きましょう',
                    description: card ? '用意したサンプル記事をタップして、本文を開いてみましょう。' :
                        'Libraryには記事を保存できます。サンプルが見当たらなければDiscoverから記事を探せます。',
                    nextText: 'Discoverへ進む', onNext: () => setPhase('discover-tab'),
                    onSkip: () => setPhase('discover-tab')
                });
            } else if (state.phase === 'chapter') {
                const chapter = document.querySelector(TARGETS.chapter);
                if (!targetVisible(chapter)) { setTimeout(() => setPhase('select'), 0); return; }
                coach({
                    selector: TARGETS.chapter, placement: 'bottom', step: 'READER · 02',
                    title: '章を切り替えられます',
                    description: '章タイトルから別の章を選ぶか、左右の矢印で章を切り替えてください。切り替えが完了すると自動で次へ進みます。',
                    onSkip: () => setPhase('select')
                });
            } else if (state.phase === 'select') {
                coach({
                    selector: TARGETS.readerSentence, placement: 'bottom', step: 'READER · 03',
                    title: 'まず、本文の単語を選択',
                    description: 'iPhoneでは単語を長押しして選択範囲を調整します。PCではドラッグして選択してください。選択できると次へ進みます。',
                    onSkip: () => setPhase('add')
                });
            } else if (state.phase === 'add') {
                coach({
                    selector: TARGETS.add, step: 'READER · 04',
                    title: '選択した単語を追加しましょう',
                    description: '選択した状態で「＋」ボタンをタップしてください。単語・ノート・問題の追加画面が開きます。',
                    onSkip: () => setPhase('return-library')
                });
            } else if (state.phase === 'word') {
                inlineGuide('単語と意味を入力', '選択した単語が入力されているか確認し、意味を入力して保存してください。本文での表現や例文も残せます。', {
                    skip: () => { window.closeModal?.(); setPhase('extras'); }
                });
            } else if (state.phase === 'extras') {
                coach({
                    selector: TARGETS.add, step: 'READER · 05',
                    title: 'ノートや問題も追加できます',
                    description: '先ほどの「＋」をもう一度タップしましょう。ノート・問題の登録方法を短くご紹介します。',
                    onSkip: () => setPhase('return-library')
                });
            } else if (state.phase === 'note') {
                window.switchModalType?.('note');
                inlineGuide('ノート：文法や解説を残す', '「対象の原文」「訳・意味」「解説・解釈」を記録できます。ここでは保存せず、画面の使い方だけ確認します。', {
                    nextText: '問題も確認', next: () => setPhase('question'),
                    skip: () => { window.closeModal?.(); setPhase('return-library'); }
                });
            } else if (state.phase === 'question') {
                window.switchModalType?.('question');
                inlineGuide('問題：理解度を確かめる', '「問題」「回答」「解説」を入力して、自分用の確認問題を作れます。必要になったときに使ってみましょう。', {
                    nextText: 'Libraryへ戻る', next: () => { window.closeModal?.(); setPhase('return-library'); },
                    skip: () => { window.closeModal?.(); setPhase('return-library'); }
                });
            } else if (state.phase === 'return-library') {
                // Handle an already completed navigation (including a cached screen).
                if (document.getElementById('library-section')?.style.display === 'block') {
                    setTimeout(() => { if (state?.phase === 'return-library') setPhase('library-tools'); }, 0);
                    return;
                }
                coach({
                    selector: TARGETS.libraryBack, step: 'LIBRARY · 06',
                    title: 'Libraryに戻りましょう',
                    description: '画面左上のパンくずリストにある「本棚」をタップしてください。戻ると自動で次の案内へ進みます。',
                    onSkip: () => {
                        window.goToFolder?.(null);
                        if (state?.phase === 'return-library') setPhase('library-tools');
                    }
                });
            } else if (state.phase === 'library-tools') {
                coach({
                    selector: TARGETS.addMaterial, step: 'LIBRARY · 07',
                    title: 'Libraryに資料を増やせます',
                    description: '「＋ 記事・ファイル追加」から資料を取り込み、「＋ フォルダ作成」で整理できます。今は操作しなくても大丈夫です。',
                    nextText: 'Discoverへ', onNext: () => setPhase('discover-tab'),
                    onSkip: () => setPhase('discover-tab')
                });
            } else if (state.phase === 'discover-tab') {
                coach({
                    selector: TARGETS.discoverTab, step: 'DISCOVER · 08',
                    title: 'Discoverで文章を探しましょう',
                    description: 'Libraryの基本操作を確認できました。続けて「Discover」タブをタップして、文章を増やしてみましょう。',
                    onSkip: () => { window.showDiscover?.(); setPhase('discover-guide'); }
                });
            } else if (state.phase === 'discover-guide') {
                coach({
                    selector: TARGETS.discoverSearch, step: 'DISCOVER · 09',
                    title: 'ここから新しい文章を見つけましょう',
                    description: '記事を検索したり、カテゴリから探したりできます。気になった記事はReaderで読み、Libraryにも保存できます。',
                    nextText: 'ガイドを完了', onNext: finishTour
                });
            }
        } finally { updating = false; }
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
            el('p', '', 'Libraryの基本操作と単語登録を体験しました。Discoverから新しい文章を見つけて、読書と復習を続けましょう。'),
            action('学習を続ける', () => overlay.remove()));
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        card.querySelector('button')?.focus();
    }
    function restart() {
        clearPresentation();
        state = { phase: 'welcome', slide: 0 };
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
        if (add && state?.phase === 'add') setTimeout(() => setPhase('word'), 80);
        else if (add && state?.phase === 'extras') setTimeout(() => setPhase('note'), 80);
        const tab = event.target.closest?.('[data-main-tab-target]')?.dataset?.mainTabTarget;
        if (tab === 'discover' && state?.phase === 'discover-tab') {
            setTimeout(() => setPhase('discover-guide'), 80);
        }
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
            state = { phase: 'welcome', slide: 0 };
            write(STORAGE_KEY, state);
        }
        if (!state) return; // Existing users must not receive a forced onboarding.
        const main = document.getElementById('main-reader');
        if (main && typeof MutationObserver !== 'undefined') {
            new MutationObserver(queuePosition).observe(main, {
                childList: true, subtree: true, attributes: true, attributeFilter: ['style']
            });
        }
        if (typeof MutationObserver !== 'undefined') new MutationObserver(() => {
            if (state?.phase !== 'setup') return;
            const card = document.querySelector('#smart-reader-workspace-create-overlay .workspace-create-card');
            if (card && !card.querySelector('#sr-tour-setup-heading')) decorateSetup();
        }).observe(document.body, { childList: true });
        if (state.phase === 'setup' && !setupPending()) void beginLibrary();
        else if (state.phase === 'welcome' || state.phase === 'setup') renderPhase();
        else if (!['done', 'skipped'].includes(state.phase)) void beginLibrary();
    }
    window.addEventListener('smartreader:article-opened', event => {
        const detail = event.detail || {};
        if (state?.phase === 'library-article'
            && (!state.articleId || String(detail.id) === String(state.articleId))) {
            setPhase('chapter', { articleName: detail.name, articleId: String(detail.id) });
        }
    });
    window.addEventListener('smartreader:library-shown', () => {
        if (state?.phase === 'return-library') setPhase('library-tools');
    });
    window.addEventListener('smartreader:chapter-changed', event => {
        if (state?.phase !== 'chapter') return;
        if (state.articleId && String(event.detail?.articleId) !== String(state.articleId)) return;
        setPhase('select');
    });
    document.addEventListener('selectionchange', () => {
        if (state?.phase !== 'select') return;
        if (selectionTimer) clearTimeout(selectionTimer);
        // Allow iPhone selection handles to settle before switching the spotlight.
        selectionTimer = setTimeout(() => {
            if (state?.phase !== 'select') return;
            const selection = window.getSelection?.();
            if (!selection || !selection.rangeCount || !selection.toString().trim()) return;
            const root = document.getElementById('text-display');
            if (!root?.contains(selection.getRangeAt(0).commonAncestorContainer)) return;
            setPhase('add', { capturedText: selection.toString().trim().slice(0, 100) });
        }, 350);
    });
    window.addEventListener('smartreader:unified-item-saved', event => {
        if (state?.phase === 'word' && event.detail?.type === 'word') {
            setTimeout(() => setPhase('extras'), 60);
        }
    });
    window.addEventListener('smartreader:discover-saved', () => {
        // Saved Discover articles remain usable as normal Library articles.
    });
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && state && !['done', 'skipped'].includes(state.phase)) finishWithoutTour();
        else if (event.key === 'Escape' && activeHint) { removeCoach(); activeHint = null; }
    });
    window.addEventListener('resize', queuePosition, { passive: true });
    window.addEventListener('scroll', queuePosition, true);
    window.addEventListener('orientationchange', queuePosition);
    window.SmartReaderOnboarding = Object.freeze({ restart, getState: () => state ? Object.assign({}, state) : null, targets: TARGETS, pages: INTRO_PAGES });
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => Promise.resolve(window.SmartReaderAppReady).then(init), { once: true });
    } else {
        Promise.resolve(window.SmartReaderAppReady).then(init);
    }
})();