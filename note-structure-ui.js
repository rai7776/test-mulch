(function () {
    'use strict';

    function loadScript(src, id) {
        if (document.getElementById(id)) return;
        const script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.onerror = () => console.error(`Failed to load ${src}`);
        document.head.appendChild(script);
    }

    // 実データに文構造がある場合は、旧来の固定デモカードを重ねて表示しない。
    const style = document.createElement('style');
    style.id = 'note-structure-sample-v2-style';
    style.textContent = '#panel-content:has(.note-block-card:not(.note-structure-sample-card) > .note-structure-box) #note-structure-sample{display:none!important}';
    document.head.appendChild(style);

    // 元の文構造UIはそのまま保持し、サンプル更新ロジックだけ独立して追加する。
    loadScript('note-structure-ui-core.js?v=1.5', 'note-structure-ui-core-loader');
    // relation data is retained for a future arrow renderer.
    loadScript('note-structure-editor.js?v=4', 'note-structure-editor-loader');
    loadScript('sample-data-v2.js?v=2', 'smart-reader-sample-data-v2-loader');
    loadScript('global-vocab-card-display.js?v=1', 'global-vocab-card-display-loader');
})();
