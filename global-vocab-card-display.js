(function () {
    'use strict';

    if (document.getElementById('global-vocab-card-display-style')) return;

    const style = document.createElement('style');
    style.id = 'global-vocab-card-display-style';
    style.textContent = `
        @media (max-width: 700px) {
            #global-vocabulary-list .global-vocabulary-card-metadata {
                display: none !important;
            }
        }
    `;
    document.head.appendChild(style);
})();
