(function () {
    'use strict';

    const MOBILE_MAX = 700;
    const expandedSourceFolders = new Set();
    let sourceMenuHome = null;
    let currentSheet = null;

    function isMobile() {
        return window.matchMedia(`(max-width: ${MOBILE_MAX}px)`).matches;
    }

    function qs(selector, root = document) {
        return root.querySelector(selector);
    }

    function qsa(selector, root = document) {
        return Array.from(root.querySelectorAll(selector));
    }

    function dispatchChange(element) {
        if (!element) return;
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function optionText(select) {
        if (!select) return 'すべて';
        const option = select.options?.[select.selectedIndex];
        let text = String(option?.textContent || '').trim();
        if (!text) return 'すべて';
        text = text.replace(/^復習状態\s*:\s*/i, '')
            .replace(/^Lv\s*:\s*/i, '')
            .replace(/^学習回数\s*:\s*/i, '')
            .replace(/^×回数\s*:\s*/i, '');
        if (/^すべて/.test(text) || /すべて$/.test(text)) return 'すべて';
        return text;
    }

    function getFilteredCount() {
        try {
            if (typeof getFilteredGlobalVocabulary === 'function') {
                const entries = getFilteredGlobalVocabulary();
                if (Array.isArray(entries)) return entries.length;
            }
        } catch (_) {}
        const badge = qs('#global-study-filtered-count');
        const value = Number(badge?.textContent);
        return Number.isFinite(value) ? value : 0;
    }

    function sourceSummary() {
        const button = qs('#global-vocab-source-picker-button');
        const raw = String(button?.textContent || '出典: すべて').trim();
        const value = raw.replace(/^出典\s*:\s*/, '').trim();
        return value || 'すべて';
    }

    function filterDescriptors() {
        return [
            { key: 'tag', label: 'タグ', selector: '#global-vocab-tag' },
            { key: 'pos', label: '品詞', selector: '#global-vocab-part-of-speech' },
            { key: 'review', label: '復習', selector: '#global-study-status' },
            { key: 'level', label: 'Lv', selector: '#global-study-level' },
            { key: 'seen', label: '学習', selector: '#global-study-seen' },
            { key: 'wrong', label: '×回数', selector: '#global-study-wrong' }
        ];
    }

    function activeFilters() {
        const filters = [];
        const source = sourceSummary();
        if (source !== 'すべて') {
            filters.push({
                key: 'source',
                text: /件の記事$/.test(source) ? source.replace('の記事', '') : source,
                reset: () => {
                    try { updateGlobalVocabulary('sourceId', 'all'); } catch (_) {}
                    scheduleRefresh();
                }
            });
        }

        filterDescriptors().forEach(desc => {
            const select = qs(desc.selector);
            if (!select || String(select.value) === 'all' || String(select.value) === '') return;
            let text = optionText(select);
            if (desc.key === 'level' && !/^Lv\./.test(text)) text = `Lv.${text}`;
            if (desc.key === 'wrong' && !/^×/.test(text)) text = `×${text}`;
            filters.push({
                key: desc.key,
                text,
                reset: () => {
                    select.value = 'all';
                    dispatchChange(select);
                    scheduleRefresh();
                }
            });
        });

        const exact = qs('#global-vocab-exact');
        if (exact?.checked) {
            filters.push({
                key: 'exact',
                text: '完全一致',
                reset: () => {
                    exact.checked = false;
                    dispatchChange(exact);
                    scheduleRefresh();
                }
            });
        }

        // Legacy memorized filter remains supported even though the new mobile UI
        // uses the richer review-state filter as the primary study filter.
        const legacyStatus = qs('#global-vocab-status');
        if (legacyStatus && legacyStatus.value !== 'all') {
            filters.push({
                key: 'legacy-status',
                text: optionText(legacyStatus),
                reset: () => {
                    legacyStatus.value = 'all';
                    dispatchChange(legacyStatus);
                    scheduleRefresh();
                }
            });
        }
        return filters;
    }

    function ensureMobileUi() {
        if (qs('#gv-mobile-ui')) return;
        const section = qs('#vocabulary-section');
        const header = qs('#vocabulary-section .vocabulary-header');
        const list = qs('#global-vocabulary-list');
        if (!section || !header || !list) return;

        const ui = document.createElement('div');
        ui.id = 'gv-mobile-ui';
        ui.innerHTML = `
            <div class="gv-mobile-search-wrap">
                <span class="gv-mobile-search-icon" aria-hidden="true">⌕</span>
                <input id="gv-mobile-search" type="search" autocomplete="off" placeholder="単語・意味・本文を検索">
            </div>
            <div class="gv-mobile-toolbar">
                <button type="button" id="gv-mobile-filter-button" class="gv-mobile-tool-button">
                    <span>絞り込み</span><span id="gv-mobile-filter-count" class="gv-mobile-tool-count">0</span>
                </button>
                <button type="button" id="gv-mobile-view-button" class="gv-mobile-tool-button">表示</button>
                <button type="button" id="gv-mobile-more-button" class="gv-mobile-more-button" aria-label="その他">…</button>
            </div>
            <div id="gv-mobile-chips" class="gv-mobile-chips" aria-label="有効な絞り込み"></div>
        `;
        const stats = qs('#global-vocab-statistics', header);
        if (stats?.nextSibling) header.insertBefore(ui, stats.nextSibling);
        else header.appendChild(ui);

        const studyBar = document.createElement('div');
        studyBar.id = 'gv-mobile-study-bar';
        studyBar.innerHTML = `
            <button type="button" id="gv-mobile-study-button">
                <span aria-hidden="true">🎴</span>
                <span><strong id="gv-mobile-study-count">0</strong>語を学習する</span>
            </button>
        `;
        section.appendChild(studyBar);

        const overlay = document.createElement('div');
        overlay.id = 'gv-mobile-sheet-overlay';
        overlay.hidden = true;
        overlay.innerHTML = `
            <section id="gv-mobile-sheet" role="dialog" aria-modal="true" aria-labelledby="gv-mobile-sheet-title">
                <header class="gv-mobile-sheet-header">
                    <button type="button" id="gv-mobile-sheet-back" class="gv-mobile-sheet-icon" aria-label="戻る" hidden>‹</button>
                    <h3 id="gv-mobile-sheet-title"></h3>
                    <button type="button" id="gv-mobile-sheet-close" class="gv-mobile-sheet-icon" aria-label="閉じる">×</button>
                </header>
                <div id="gv-mobile-sheet-body" class="gv-mobile-sheet-body"></div>
            </section>
        `;
        document.body.appendChild(overlay);

        qs('#gv-mobile-search')?.addEventListener('input', event => {
            const original = qs('#global-vocab-search');
            if (original) original.value = event.target.value;
            try { updateGlobalVocabulary('query', event.target.value); }
            catch (_) { original?.dispatchEvent(new Event('input', { bubbles: true })); }
            scheduleRefresh();
        });
        qs('#gv-mobile-filter-button')?.addEventListener('click', () => openSheet('filter'));
        qs('#gv-mobile-view-button')?.addEventListener('click', () => openSheet('view'));
        qs('#gv-mobile-more-button')?.addEventListener('click', () => openSheet('more'));
        qs('#gv-mobile-study-button')?.addEventListener('click', () => qs('#global-study-filtered')?.click());
        qs('#gv-mobile-sheet-close')?.addEventListener('click', closeSheet);
        qs('#gv-mobile-sheet-back')?.addEventListener('click', () => openSheet('filter'));
        overlay.addEventListener('click', event => {
            if (event.target === overlay) closeSheet();
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && currentSheet) closeSheet();
        });
    }

    function createSelectCell(desc) {
        const original = qs(desc.selector);
        const cell = document.createElement('label');
        cell.className = 'gv-filter-cell';
        cell.dataset.filterKey = desc.key;
        cell.innerHTML = `
            <span class="gv-filter-label">${desc.label}</span>
            <span class="gv-filter-value">${optionText(original)}</span>
            <span class="gv-filter-chevron" aria-hidden="true">›</span>
        `;
        if (!original) {
            cell.classList.add('is-disabled');
            return cell;
        }
        const proxy = document.createElement('select');
        proxy.className = 'gv-filter-native-select';
        proxy.setAttribute('aria-label', desc.label);
        proxy.innerHTML = original.innerHTML;
        proxy.value = original.value;
        proxy.addEventListener('change', () => {
            original.value = proxy.value;
            dispatchChange(original);
            scheduleRefresh();
            window.setTimeout(() => {
                if (currentSheet === 'filter') renderFilterSheet();
            }, 0);
        });
        cell.appendChild(proxy);
        return cell;
    }

    function createToggleRow(label, checked, onChange) {
        const row = document.createElement('label');
        row.className = 'gv-toggle-row';
        row.innerHTML = `
            <span>${label}</span>
            <span class="gv-switch"><input type="checkbox" ${checked ? 'checked' : ''}><i></i></span>
        `;
        const input = qs('input', row);
        input?.addEventListener('change', () => onChange(!!input.checked));
        return row;
    }

    function renderFilterSheet() {
        const body = qs('#gv-mobile-sheet-body');
        if (!body) return;
        body.innerHTML = '';

        const sourceButton = document.createElement('button');
        sourceButton.type = 'button';
        sourceButton.className = 'gv-filter-source-row';
        sourceButton.innerHTML = `
            <span class="gv-filter-label">出典</span>
            <span class="gv-filter-value">${sourceSummary()}</span>
            <span class="gv-filter-chevron" aria-hidden="true">›</span>
        `;
        sourceButton.addEventListener('click', openSourceSheet);
        body.appendChild(sourceButton);

        const grid = document.createElement('div');
        grid.className = 'gv-filter-grid';
        filterDescriptors().forEach(desc => grid.appendChild(createSelectCell(desc)));
        body.appendChild(grid);

        const exact = qs('#global-vocab-exact');
        body.appendChild(createToggleRow('完全一致', !!exact?.checked, checked => {
            if (!exact) return;
            exact.checked = checked;
            dispatchChange(exact);
            scheduleRefresh();
            window.setTimeout(() => { if (currentSheet === 'filter') renderFilterSheet(); }, 0);
        }));

        const footer = document.createElement('div');
        footer.className = 'gv-sheet-footer';
        footer.innerHTML = `
            <button type="button" class="gv-secondary-action" id="gv-filter-reset">すべて解除</button>
            <button type="button" class="gv-primary-action" id="gv-filter-apply"><strong>${getFilteredCount()}</strong>語を表示</button>
        `;
        body.appendChild(footer);
        qs('#gv-filter-reset', body)?.addEventListener('click', resetFilters);
        qs('#gv-filter-apply', body)?.addEventListener('click', closeSheet);
    }

    function renderViewSheet() {
        const body = qs('#gv-mobile-sheet-body');
        if (!body) return;
        body.innerHTML = '';

        const sort = createSelectCell({ key: 'sort', label: '並び順', selector: '#global-vocab-sort' });
        sort.classList.add('gv-filter-cell-wide');
        body.appendChild(sort);

        const anki = qs('#global-vocab-anki');
        body.appendChild(createToggleRow('暗記モード', !!anki?.checked, checked => {
            if (!anki) return;
            anki.checked = checked;
            dispatchChange(anki);
            scheduleRefresh();
            window.setTimeout(() => { if (currentSheet === 'view') renderViewSheet(); }, 0);
        }));

        const target = createSelectCell({ key: 'anki-target', label: '隠す対象', selector: '#global-vocab-anki-target' });
        target.classList.add('gv-filter-cell-wide');
        if (!anki?.checked) target.classList.add('is-muted');
        body.appendChild(target);

        const grouped = qs('#global-vocab-grouped');
        body.appendChild(createToggleRow('重複をまとめる', !!grouped?.checked, checked => {
            if (!grouped) return;
            grouped.checked = checked;
            dispatchChange(grouped);
            scheduleRefresh();
        }));
    }

    function renderMoreSheet() {
        const body = qs('#gv-mobile-sheet-body');
        if (!body) return;
        body.innerHTML = `
            <div class="gv-more-section">
                <span class="gv-more-label">データ</span>
                <button type="button" id="gv-mobile-csv" class="gv-more-row">
                    <span>CSVで出力</span><span aria-hidden="true">›</span>
                </button>
            </div>
        `;
        qs('#gv-mobile-csv', body)?.addEventListener('click', () => {
            closeSheet();
            try { exportGlobalVocabularyCSV(); } catch (_) { qs('#vocabulary-section .btn-export')?.click(); }
        });
    }

    function openSheet(type) {
        if (!isMobile()) return;
        ensureMobileUi();
        if (type !== 'source') releaseSourceMenu();
        currentSheet = type;
        const overlay = qs('#gv-mobile-sheet-overlay');
        const title = qs('#gv-mobile-sheet-title');
        const back = qs('#gv-mobile-sheet-back');
        if (!overlay || !title || !back) return;
        overlay.hidden = false;
        document.body.classList.add('gv-mobile-sheet-open');
        back.hidden = true;

        if (type === 'filter') {
            title.textContent = '絞り込み';
            renderFilterSheet();
        } else if (type === 'view') {
            title.textContent = '表示';
            renderViewSheet();
        } else if (type === 'more') {
            title.textContent = 'その他';
            renderMoreSheet();
        }
    }

    function closeSheet() {
        releaseSourceMenu();
        currentSheet = null;
        const overlay = qs('#gv-mobile-sheet-overlay');
        if (overlay) overlay.hidden = true;
        document.body.classList.remove('gv-mobile-sheet-open');
        scheduleRefresh();
    }

    function resetFilters() {
        try { updateGlobalVocabulary('sourceId', 'all'); } catch (_) {}
        filterDescriptors().forEach(desc => {
            const select = qs(desc.selector);
            if (!select) return;
            select.value = 'all';
            dispatchChange(select);
        });
        const legacy = qs('#global-vocab-status');
        if (legacy) {
            legacy.value = 'all';
            dispatchChange(legacy);
        }
        const exact = qs('#global-vocab-exact');
        if (exact) {
            exact.checked = false;
            dispatchChange(exact);
        }
        scheduleRefresh();
        window.setTimeout(() => { if (currentSheet === 'filter') renderFilterSheet(); }, 0);
    }

    function sourceRows() {
        return qsa('#global-vocab-source-picker-menu .global-vocab-source-row');
    }

    function rowDepth(row) {
        const raw = row.style.getPropertyValue('--source-depth');
        const value = Number(raw);
        return Number.isFinite(value) ? value : 0;
    }

    function decorateSourceTree() {
        const menu = qs('#global-vocab-source-picker-menu');
        if (!menu) return;
        const rows = sourceRows();
        const folderAtDepth = [];

        rows.forEach((row, index) => {
            const depth = rowDepth(row);
            folderAtDepth.length = depth;
            const name = String(qs('.global-vocab-source-name', row)?.textContent || '').trim();
            const parentKey = depth > 0 ? String(folderAtDepth[depth - 1] || '') : '';
            const key = `${parentKey}/${name}#${index}`;
            const visible = depth === 0 || folderAtDepth.slice(0, depth).every(folderKey => expandedSourceFolders.has(folderKey));
            row.style.display = visible ? '' : 'none';

            qsa('.gv-source-count, .gv-source-expand', row).forEach(node => node.remove());

            if (!row.classList.contains('global-vocab-source-folder')) return;
            row.classList.add('gv-collapsible-folder');
            row.dataset.gvFolderKey = key;
            folderAtDepth[depth] = key;

            let selected = 0;
            let total = 0;
            for (let nextIndex = index + 1; nextIndex < rows.length; nextIndex += 1) {
                const next = rows[nextIndex];
                const nextDepth = rowDepth(next);
                if (nextDepth <= depth) break;
                if (next.classList.contains('global-vocab-source-article')) {
                    total += 1;
                    if (qs('input[type="checkbox"]', next)?.checked) selected += 1;
                }
            }

            const count = document.createElement('span');
            count.className = 'gv-source-count';
            count.textContent = `${selected}/${total}`;
            const expand = document.createElement('button');
            expand.type = 'button';
            expand.className = 'gv-source-expand';
            const isExpanded = expandedSourceFolders.has(key);
            expand.textContent = isExpanded ? '⌄' : '›';
            expand.setAttribute('aria-label', isExpanded ? 'フォルダを閉じる' : 'フォルダを開く');
            expand.setAttribute('aria-expanded', String(isExpanded));
            row.append(count, expand);

            if (!row.dataset.gvExpansionBound) {
                row.dataset.gvExpansionBound = '1';
                row.addEventListener('click', event => {
                    const checkbox = qs('input[type="checkbox"]', row);
                    if (event.target === checkbox) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const folderKey = row.dataset.gvFolderKey;
                    if (!folderKey) return;
                    if (expandedSourceFolders.has(folderKey)) expandedSourceFolders.delete(folderKey);
                    else expandedSourceFolders.add(folderKey);
                    decorateSourceTree();
                }, true);
            }
        });
    }

    function openSourceSheet() {
        if (!isMobile()) return;
        ensureMobileUi();
        // Ensure the source picker has been materialized by the existing feature.
        if (!qs('#global-vocab-source-picker-menu')) {
            try { renderGlobalVocabulary(); } catch (_) {}
        }
        const menu = qs('#global-vocab-source-picker-menu');
        const picker = qs('#global-vocab-source-picker');
        const overlay = qs('#gv-mobile-sheet-overlay');
        const body = qs('#gv-mobile-sheet-body');
        const title = qs('#gv-mobile-sheet-title');
        const back = qs('#gv-mobile-sheet-back');
        if (!menu || !picker || !overlay || !body || !title || !back) return;

        currentSheet = 'source';
        title.textContent = '出典';
        back.hidden = false;
        body.innerHTML = '';
        sourceMenuHome = picker;
        menu.hidden = false;
        menu.classList.add('gv-mobile-source-menu');
        body.appendChild(menu);
        qs('#global-vocab-source-picker-button')?.setAttribute('aria-expanded', 'true');
        overlay.hidden = false;
        document.body.classList.add('gv-mobile-sheet-open');
        expandedSourceFolders.clear();
        decorateSourceTree();

        if (!qs('#gv-source-done', body)) {
            const done = document.createElement('button');
            done.type = 'button';
            done.id = 'gv-source-done';
            done.className = 'gv-primary-action gv-source-done';
            done.textContent = '完了';
            done.addEventListener('click', () => openSheet('filter'));
            body.appendChild(done);
        }
    }

    function releaseSourceMenu() {
        const menu = qs('#global-vocab-source-picker-menu');
        if (!menu || !menu.classList.contains('gv-mobile-source-menu')) return;
        const picker = sourceMenuHome || qs('#global-vocab-source-picker');
        menu.classList.remove('gv-mobile-source-menu');
        menu.hidden = true;
        if (picker) picker.appendChild(menu);
        qs('#global-vocab-source-picker-button')?.setAttribute('aria-expanded', 'false');
        sourceMenuHome = null;
    }

    function refreshMobileUi() {
        ensureMobileUi();
        if (!isMobile()) return;

        const originalSearch = qs('#global-vocab-search');
        const mobileSearch = qs('#gv-mobile-search');
        if (mobileSearch && document.activeElement !== mobileSearch) {
            mobileSearch.value = originalSearch?.value || '';
        }

        const filters = activeFilters();
        const count = qs('#gv-mobile-filter-count');
        if (count) {
            count.textContent = String(filters.length);
            count.hidden = filters.length === 0;
        }

        const chips = qs('#gv-mobile-chips');
        if (chips) {
            chips.innerHTML = '';
            filters.forEach(filter => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'gv-mobile-chip';
                button.innerHTML = `<span>${filter.text}</span><span aria-hidden="true">×</span>`;
                button.addEventListener('click', filter.reset);
                chips.appendChild(button);
            });
            chips.hidden = filters.length === 0;
        }

        const filteredCount = getFilteredCount();
        const studyCount = qs('#gv-mobile-study-count');
        const studyButton = qs('#gv-mobile-study-button');
        if (studyCount) studyCount.textContent = String(filteredCount);
        if (studyButton) studyButton.disabled = filteredCount === 0;

        if (currentSheet === 'filter') renderFilterSheet();
        else if (currentSheet === 'view') renderViewSheet();
        else if (currentSheet === 'source') decorateSourceTree();
    }

    let refreshQueued = false;
    function scheduleRefresh() {
        if (refreshQueued) return;
        refreshQueued = true;
        window.setTimeout(() => {
            refreshQueued = false;
            refreshMobileUi();
        }, 0);
    }

    function installRenderHook() {
        const current = window.renderGlobalVocabulary || (typeof renderGlobalVocabulary === 'function' ? renderGlobalVocabulary : null);
        if (!current || current.__gvMobileUiWrapped) return;
        const wrapped = function () {
            const result = current.apply(this, arguments);
            scheduleRefresh();
            return result;
        };
        wrapped.__gvMobileUiWrapped = true;
        try { renderGlobalVocabulary = wrapped; } catch (_) {}
        window.renderGlobalVocabulary = wrapped;
    }

    function injectStyles() {
        if (qs('#gv-mobile-ui-style')) return;
        const style = document.createElement('style');
        style.id = 'gv-mobile-ui-style';
        style.textContent = `
            #gv-mobile-ui, #gv-mobile-study-bar, #gv-mobile-sheet-overlay { display: none; }

            @media (max-width: 700px) {
                body.gv-mobile-sheet-open { overflow: hidden !important; }
                #vocabulary-section .vocabulary-controls { display: none !important; }
                #gv-mobile-ui { display: block; margin-top: 8px; }
                .gv-mobile-search-wrap {
                    position: relative; display: flex; align-items: center; width: 100%;
                    min-height: 44px; border: 1px solid #d8d2ca; border-radius: 11px; background: #fff;
                }
                .gv-mobile-search-icon {
                    flex: 0 0 auto; padding-left: 12px; color: #766f67; font-size: 1rem;
                }
                #gv-mobile-search {
                    width: 100%; min-width: 0; min-height: 42px; padding: 7px 12px 7px 8px;
                    border: 0; outline: 0; background: transparent; font-size: 16px; color: inherit;
                }
                .gv-mobile-toolbar {
                    display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, .82fr) 42px;
                    gap: 7px; margin-top: 8px;
                }
                .gv-mobile-tool-button, .gv-mobile-more-button {
                    height: 42px; min-width: 0; border: 1px solid #d8c9b8; border-radius: 10px;
                    background: #fff; color: #443d37; font: inherit; font-size: .82rem; font-weight: 700;
                }
                .gv-mobile-tool-button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
                .gv-mobile-more-button { font-size: 1.35rem; line-height: 1; }
                .gv-mobile-tool-count {
                    min-width: 20px; height: 20px; padding: 0 5px; border-radius: 999px;
                    display: inline-flex; align-items: center; justify-content: center;
                    background: #91612f; color: #fff; font-size: .68rem;
                }
                .gv-mobile-tool-count[hidden] { display: none !important; }
                .gv-mobile-chips {
                    display: flex; gap: 6px; width: 100%; margin-top: 7px; overflow-x: auto;
                    padding: 0 0 2px; scrollbar-width: none;
                }
                .gv-mobile-chips::-webkit-scrollbar { display: none; }
                .gv-mobile-chips[hidden] { display: none !important; }
                .gv-mobile-chip {
                    flex: 0 0 auto; min-height: 30px; padding: 4px 8px; border: 0; border-radius: 999px;
                    display: inline-flex; align-items: center; gap: 6px; background: #eee9e2;
                    color: #514941; font-size: .72rem; font-weight: 650;
                }
                #gv-mobile-study-bar {
                    display: block; position: fixed; z-index: 55; left: 14px; right: 14px;
                    bottom: calc(10px + env(safe-area-inset-bottom)); pointer-events: none;
                }
                #gv-mobile-study-button {
                    pointer-events: auto; width: 100%; min-height: 50px; padding: 9px 14px;
                    border: 0; border-radius: 14px; background: #91612f; color: #fff;
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                    box-shadow: 0 7px 24px rgba(61, 44, 27, .18); font: inherit; font-size: .94rem; font-weight: 800;
                }
                #gv-mobile-study-button:disabled { opacity: .45; }
                #global-vocabulary-list { padding-bottom: calc(82px + env(safe-area-inset-bottom)) !important; }

                #gv-mobile-sheet-overlay {
                    display: flex; position: fixed; z-index: 180; inset: 0; align-items: flex-end;
                    background: rgba(35, 31, 27, .28); backdrop-filter: blur(2px);
                }
                #gv-mobile-sheet-overlay[hidden] { display: none !important; }
                #gv-mobile-sheet {
                    width: 100%; max-height: 84dvh; overflow: hidden; border-radius: 20px 20px 0 0;
                    background: #fbf9f6; box-shadow: 0 -10px 35px rgba(0, 0, 0, .16);
                    display: flex; flex-direction: column;
                }
                .gv-mobile-sheet-header {
                    flex: 0 0 auto; min-height: 52px; display: grid; grid-template-columns: 42px 1fr 42px;
                    align-items: center; border-bottom: 1px solid #e4ddd4; background: #fbf9f6;
                }
                .gv-mobile-sheet-header h3 { margin: 0; text-align: center; font-size: 1rem; }
                .gv-mobile-sheet-icon {
                    width: 36px; height: 36px; margin: 0 auto; border: 0; border-radius: 50%;
                    background: transparent; color: #5e554c; font-size: 1.45rem;
                }
                .gv-mobile-sheet-body {
                    min-height: 0; overflow-y: auto; padding: 12px 14px calc(14px + env(safe-area-inset-bottom));
                }
                .gv-filter-source-row, .gv-filter-cell {
                    box-sizing: border-box; position: relative; min-width: 0; height: 50px;
                    border: 1px solid #ded6cc; border-radius: 11px; background: #fff; color: #443d37;
                    display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center;
                    column-gap: 8px; padding: 0 11px; text-align: left;
                }
                .gv-filter-source-row { width: 100%; font: inherit; margin-bottom: 8px; }
                .gv-filter-grid {
                    display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px;
                }
                .gv-filter-label {
                    flex: 0 0 auto; color: #786e64; font-size: .69rem; font-weight: 700; white-space: nowrap;
                }
                .gv-filter-value {
                    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
                    text-align: right; color: #332f2b; font-size: .78rem; font-weight: 750;
                }
                .gv-filter-chevron { color: #9a8f84; font-size: 1.15rem; line-height: 1; }
                .gv-filter-native-select {
                    position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0;
                    appearance: none; -webkit-appearance: none; cursor: pointer;
                }
                .gv-filter-cell-wide { width: 100%; margin-bottom: 8px; }
                .gv-filter-cell.is-muted { opacity: .5; }
                .gv-toggle-row {
                    box-sizing: border-box; width: 100%; min-height: 50px; margin-top: 8px; padding: 0 11px;
                    border: 1px solid #ded6cc; border-radius: 11px; background: #fff;
                    display: flex; align-items: center; justify-content: space-between; gap: 12px;
                    color: #443d37; font-size: .78rem; font-weight: 750;
                }
                .gv-switch { position: relative; width: 42px; height: 24px; flex: 0 0 42px; }
                .gv-switch input { position: absolute; inset: 0; opacity: 0; }
                .gv-switch i {
                    position: absolute; inset: 0; border-radius: 999px; background: #d6d0c9; transition: .16s ease;
                }
                .gv-switch i::after {
                    content: ''; position: absolute; width: 20px; height: 20px; left: 2px; top: 2px;
                    border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.18); transition: .16s ease;
                }
                .gv-switch input:checked + i { background: #91612f; }
                .gv-switch input:checked + i::after { transform: translateX(18px); }
                .gv-sheet-footer {
                    position: sticky; bottom: -14px; display: grid; grid-template-columns: .82fr 1.18fr;
                    gap: 8px; margin: 12px -14px -14px; padding: 10px 14px calc(10px + env(safe-area-inset-bottom));
                    border-top: 1px solid #e4ddd4; background: rgba(251, 249, 246, .96);
                    backdrop-filter: blur(10px);
                }
                .gv-secondary-action, .gv-primary-action {
                    min-height: 44px; border-radius: 11px; font: inherit; font-size: .82rem; font-weight: 800;
                }
                .gv-secondary-action { border: 1px solid #d8c9b8; background: #fff; color: #5c5148; }
                .gv-primary-action { border: 0; background: #91612f; color: #fff; }
                .gv-more-section { display: flex; flex-direction: column; gap: 6px; }
                .gv-more-label { padding: 2px 4px; color: #8b8075; font-size: .68rem; font-weight: 700; }
                .gv-more-row {
                    width: 100%; min-height: 50px; padding: 0 12px; border: 1px solid #ded6cc; border-radius: 11px;
                    background: #fff; display: flex; align-items: center; justify-content: space-between;
                    color: #443d37; font: inherit; font-size: .82rem; font-weight: 750;
                }

                #global-vocab-source-picker-menu.gv-mobile-source-menu {
                    position: static !important; inset: auto !important; width: 100% !important; max-width: none !important;
                    max-height: none !important; overflow: visible !important; padding: 0 !important; border: 0 !important;
                    border-radius: 0 !important; background: transparent !important; box-shadow: none !important;
                }
                .gv-mobile-source-menu .global-vocab-source-toolbar {
                    top: 0 !important; padding: 0 0 9px !important; background: #fbf9f6 !important;
                }
                .gv-mobile-source-menu .global-vocab-source-toolbar button {
                    min-height: 40px; border-radius: 10px; background: #fff; font-size: .78rem; font-weight: 750;
                }
                .gv-mobile-source-menu .global-vocab-source-tree { gap: 3px; }
                .gv-mobile-source-menu .global-vocab-source-row {
                    min-height: 44px; padding-top: 5px; padding-bottom: 5px; background: #fff;
                    border: 1px solid #e4ddd4; border-radius: 10px;
                }
                .gv-mobile-source-menu .global-vocab-source-row input { width: 20px; height: 20px; }
                .gv-mobile-source-menu .global-vocab-source-name { min-width: 0; font-size: .82rem; }
                .gv-mobile-source-menu .gv-collapsible-folder {
                    display: grid; grid-template-columns: 22px minmax(0, 1fr) auto 28px; align-items: center;
                }
                .gv-source-count {
                    color: #8a7f74; font-size: .68rem; font-weight: 700; white-space: nowrap;
                }
                .gv-source-expand {
                    width: 28px; height: 28px; padding: 0; border: 0; border-radius: 50%; background: transparent;
                    color: #6f655b; font-size: 1.2rem; line-height: 1;
                }
                .gv-source-done { width: 100%; margin-top: 10px; }
            }
        `;
        document.head.appendChild(style);
    }

    function init() {
        injectStyles();
        ensureMobileUi();
        installRenderHook();
        scheduleRefresh();
        window.addEventListener('resize', scheduleRefresh, { passive: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})();
