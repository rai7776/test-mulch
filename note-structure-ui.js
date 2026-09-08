(function () {
    'use strict';

    function loadScript(src, id, onload) {
        if (document.getElementById(id)) {
            if (typeof onload === 'function') onload();
            return;
        }
        const script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.onload = () => { if (typeof onload === 'function') onload(); };
        script.onerror = () => console.error(`Failed to load ${src}`);
        document.head.appendChild(script);
    }

    loadScript('note-structure-ui-core.js?v=1.1', 'note-structure-ui-core-loader', () => {
        loadScript('sample-data-v2.js?v=2', 'smart-reader-sample-data-v2-loader');
    });
})();
