/* Shared main navigation: single source of truth for all five screens. */
(function () {
    'use strict';
    const TABS = Object.freeze([
        { id: 'library', label: 'Library' },
        { id: 'discover', label: 'Discover' },
        { id: 'vocabulary', label: 'Vocabulary' },
        { id: 'study', label: 'Study' },
        { id: 'problems', label: 'Problems' }
    ]);
    const actions = {
        library: () => window.goToFolder?.(null),
        discover: () => window.showDiscover?.(),
        vocabulary: () => window.showGlobalVocabulary?.(),
        study: () => window.showStudyCenter?.(),
        problems: () => window.showGlobalProblems?.()
    };
    function render(nav) {
        const active = nav.dataset.activeTab;
        if (!TABS.some(tab => tab.id === active)) return;
        const library = active === 'library';
        const previousScroll = nav.scrollLeft;
        nav.replaceChildren(...TABS.map(tab => {
            const selected = tab.id === active;
            const item = document.createElement(selected ? 'span' : 'button');
            item.textContent = tab.label;
            if (library) item.className = 'library-primary-tab' + (selected ? ' is-active' : '');
            if (selected) item.setAttribute('aria-current', 'page');
            else {
                item.type = 'button';
                item.dataset.mainTabTarget = tab.id;
                if (tab.id === 'study' && library) {
                    item.id = 'study-center-library-button';
                    item.classList.add('study-center-entry-button');
                }
            }
            return item;
        }));
        nav.scrollLeft = previousScroll;
    }
    function mount(root = document) {
        if (root.matches?.('nav[data-main-nav]')) render(root);
        root.querySelectorAll?.('nav[data-main-nav]').forEach(render);
    }
    document.addEventListener('click', event => {
        const button = event.target.closest?.('button[data-main-tab-target]');
        if (!button) return;
        const nav = button.closest('nav[data-main-nav]');
        if (!nav) return;
        const action = actions[button.dataset.mainTabTarget];
        if (action) action();
    });
    window.SmartReaderMainNavigation = Object.freeze({ tabs: TABS, mount });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount());
    else mount();
})();
