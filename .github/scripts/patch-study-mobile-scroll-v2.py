from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'anchor not found: {label}')
    return text.replace(old, new, 1)

css_path = Path('study-center.css')
css = css_path.read_text()
marker = '/* Study Center mobile scroll v5 */'
if marker in css:
    raise SystemExit('mobile scroll v5 already present')
css += r'''

/* Study Center mobile scroll v5 */
#main-reader.study-center-active{
    overflow-y:auto;
    overflow-x:hidden;
    -webkit-overflow-scrolling:touch;
    overscroll-behavior-y:contain;
    touch-action:pan-y;
}
#main-reader.study-center-active > .study-center-section{
    flex:0 0 auto;
    width:100%;
    min-height:100%;
    max-height:none;
    height:auto;
    overflow:visible;
}

@media(max-width:700px){
    #main-reader.study-center-active{min-width:0;width:100%}
    .study-center-section,
    .study-center-shell,
    .study-center-content,
    .study-center-words,
    .study-center-word-list,
    .study-center-word-card,
    .study-center-word-main{min-width:0;max-width:100%;width:100%}
    .study-center-section,.study-center-content,.study-center-words{overflow-x:hidden}
    .study-center-word-card{display:block!important}
    .study-center-word-actions{
        display:grid!important;
        grid-template-columns:minmax(0,1fr) minmax(0,1fr) 38px;
        width:100%!important;
        max-width:100%;
        margin-top:8px;
        gap:5px;
    }
    .study-center-word-actions button{
        width:100%!important;
        min-width:0!important;
        max-width:100%;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
    }
    .study-center-word-actions .study-center-master-action{width:38px!important;min-width:38px!important}
    .study-center-word-main small{max-width:100%}
    .study-center-tabs{width:auto;max-width:none;overflow:hidden}
    .study-center-tabs button{min-width:0!important}
}
'''
css_path.write_text(css)

js_path = Path('study-center.js')
js = js_path.read_text()
js = replace_once(
    js,
    "    function hideStudySection() {\n        const section = document.getElementById(SECTION_ID);\n        if (section) section.style.display = 'none';\n    }",
    "    function hideStudySection() {\n        const section = document.getElementById(SECTION_ID);\n        if (section) section.style.display = 'none';\n        document.getElementById('main-reader')?.classList.remove('study-center-active');\n    }",
    'hide study class cleanup'
)
js = replace_once(
    js,
    "        const section = document.getElementById(SECTION_ID);\n        if (!section) return;\n        section.style.display = 'block';\n        section.scrollTop = 0;\n        render();",
    "        const section = document.getElementById(SECTION_ID);\n        if (!section) return;\n        const main = document.getElementById('main-reader');\n        main?.classList.add('study-center-active');\n        if (main) main.scrollTop = 0;\n        section.style.display = 'block';\n        section.scrollTop = 0;\n        render();",
    'show study main scroller'
)
js = replace_once(
    js,
    "                activeTab = tab.dataset.studyTab;\n                render();\n                section.scrollTop = 0;\n                return;",
    "                activeTab = tab.dataset.studyTab;\n                render();\n                section.scrollTop = 0;\n                const main = document.getElementById('main-reader');\n                if (main) main.scrollTop = 0;\n                return;",
    'tab main scroll reset'
)
js = replace_once(
    js,
    "                activeTab = targetTab.dataset.tabTarget;\n                render();\n                section.scrollTop = 0;\n                return;",
    "                activeTab = targetTab.dataset.tabTarget;\n                render();\n                section.scrollTop = 0;\n                const main = document.getElementById('main-reader');\n                if (main) main.scrollTop = 0;\n                return;",
    'target tab main scroll reset'
)
js_path.write_text(js)

index_path = Path('index.html')
html = index_path.read_text()
html = replace_once(html, 'study-center.css?v=4', 'study-center.css?v=5', 'study css cache')
html = replace_once(html, 'study-center.js?v=5', 'study-center.js?v=6', 'study js cache')
index_path.write_text(html)
