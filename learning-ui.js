(function(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SmartReaderLearningUI = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    'use strict';
    function recentKey(state) {
        const id = state?.activeWorkspaceId ?? state?.activeWorkspace?.id;
        return id === undefined || id === null ? null : 'smartreader_recent_article:' + String(id);
    }
    function remember(storage, state, article) {
        const key = recentKey(state);
        if (!key || article?.id === undefined || article?.id === null) return;
        try { storage.setItem(key, JSON.stringify({ articleId:article.id })); } catch (_) {}
    }
    function recent(storage, state, items) {
        const key = recentKey(state);
        if (!key) return null;
        try {
            const saved = JSON.parse(storage.getItem(key) || 'null');
            if (saved?.articleId === undefined || saved?.articleId === null) return null;
            return items.find(item => item?.type === 'article' && String(item.id) === String(saved?.articleId)) || null;
        } catch (_) { return null; }
    }
    function renderLibrary(doc, items, folderId, navigate, open, storage, state) {
        const section = doc.getElementById('library-section');
        const folder = items.find(item => item.type === 'folder' && String(item.id) === String(folderId));
        if (section) section.classList.toggle('in-folder', !!folder);
        const nav = doc.getElementById('breadcrumbs');
        if (nav) {
            nav.replaceChildren();
            nav.style.display = '';
            const path = folder ? globalThis.SmartReaderReaderHeader.path(folder, items) : [{label:'本棚',current:true}];
            const list = doc.createElement('ol');
            path.forEach(crumb => {
                const li = doc.createElement('li');
                const label = doc.createElement(crumb.current ? 'span' : 'button');
                label.textContent = crumb.label;
                label.title = crumb.label;
                if (crumb.current) label.setAttribute('aria-current','page');
                else { label.type = 'button'; label.onclick = () => navigate(crumb.id); }
                li.appendChild(label); list.appendChild(li);
            });
            nav.appendChild(list);
        }
        const card = doc.getElementById('recent-article');
        if (!card) return;
        const article = recent(storage, state, items);
        card.hidden = !article || !!folder;
        card.replaceChildren();
        if (article) {
            const copy = doc.createElement('div');
            const hint = doc.createElement('small'); hint.textContent = '前回の続き';
            const title = doc.createElement('strong'); title.textContent = article.name || '無題';
            const button = doc.createElement('button'); button.type = 'button'; button.textContent = '続きを読む →';
            button.onclick = () => open(article.id);
            copy.append(hint,title); card.append(copy,button);
        }
    }
    return Object.freeze({ recentKey, remember, recent, renderLibrary });
});
