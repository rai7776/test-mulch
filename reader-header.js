(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SmartReaderReaderHeader = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function path(article, items) {
        const folders = new Map((Array.isArray(items) ? items : [])
            .filter(item => item?.type === 'folder').map(item => [String(item.id), item]));
        const ancestors = [];
        const seen = new Set();
        let parent = article?.parentId;
        while (parent !== null && parent !== undefined && parent !== '') {
            const key = String(parent);
            if (seen.has(key)) break;
            seen.add(key);
            const folder = folders.get(key);
            if (!folder) break;
            ancestors.unshift({ id:folder.id, label:String(folder.name || '無題のフォルダ') });
            parent = folder.parentId;
        }
        return [{ id:null, label:'本棚' }, ...ancestors,
            { id:article?.id, label:String(article?.name || '無題'), current:true }];
    }

    function hide(doc) {
        doc.querySelector('.app-header')?.classList.remove('reader-header');
        const nav = doc.getElementById('reader-breadcrumbs');
        if (nav) nav.hidden = true;
    }

    function render(doc, article, items, navigate) {
        const nav = doc.getElementById('reader-breadcrumbs');
        if (!nav || !article) return;
        const list = doc.createElement('ol');
        path(article, items).forEach(crumb => {
            const item = doc.createElement('li');
            const label = doc.createElement(crumb.current ? 'span' : 'button');
            label.textContent = crumb.label;
            label.title = crumb.label;
            if (crumb.current) label.setAttribute('aria-current', 'page');
            else {
                label.type = 'button';
                label.addEventListener('click', () => navigate(crumb.id));
            }
            item.appendChild(label);
            list.appendChild(item);
        });
        nav.replaceChildren(list);
        nav.hidden = false;
        doc.querySelector('.app-header')?.classList.add('reader-header');
    }

    return Object.freeze({ path, render, hide });
});
