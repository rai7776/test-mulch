from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'anchor not found: {label}')
    return text.replace(old, new, 1)

css_path = Path('study-center.css')
css = css_path.read_text()
marker = '/* Study Center mobile layout v4 */'
if marker in css:
    raise SystemExit('mobile layout v4 already present')

mobile_css = r'''

/* Study Center mobile layout v4 */
.study-center-section{
    flex:1 1 auto;
    min-height:0;
    max-height:100%;
    overflow-y:auto;
    overflow-x:hidden;
    -webkit-overflow-scrolling:touch;
    overscroll-behavior-y:contain;
}
.study-center-shell,.study-center-content{min-width:0;max-width:100%}

@media(max-width:700px){
    .study-center-section{
        height:100%;
        padding:0;
        -webkit-text-size-adjust:100%;
    }
    .study-center-shell{
        width:100%;
        padding:10px 10px calc(24px + env(safe-area-inset-bottom));
    }
    .study-center-header{
        align-items:center;
        gap:8px;
        margin-bottom:7px;
        padding:0 2px;
    }
    .study-center-header .study-center-eyebrow{font-size:.58rem}
    .study-center-header h1{margin:0;font-size:1.22rem;line-height:1.2}
    .study-center-header p{display:none}
    .study-center-library-link{padding:6px 2px;font-size:.76rem}

    .study-center-tabs{
        top:0;
        margin:0 -10px 10px;
        padding:4px 8px;
        gap:2px;
        overflow-x:hidden;
    }
    .study-center-tabs button{
        flex:1 1 0;
        min-width:0;
        padding:7px 3px;
        border-radius:8px;
        font-size:.74rem;
        line-height:1.1;
        white-space:nowrap;
    }
    .study-center-content,
    .study-center-home,
    .study-center-review,
    .study-center-words,
    .study-center-history,
    .study-center-stats{
        min-width:0;
        max-width:100%;
    }
    .study-center-content{gap:10px}

    .study-center-hero{
        gap:10px;
        padding:12px;
        border-radius:14px;
        align-items:center;
    }
    .study-center-date{font-size:.68rem}
    .study-center-hero h2{margin:4px 0 3px;font-size:1.08rem;line-height:1.25}
    .study-center-hero p{font-size:.72rem;line-height:1.35}
    .study-center-hero-count{min-width:68px;padding:9px 6px;border-radius:12px}
    .study-center-hero-count strong{font-size:1.55rem;line-height:1}
    .study-center-hero-count span{margin-top:4px;font-size:.62rem}

    .study-center-metric-grid{
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:5px;
        margin-top:7px;
    }
    .study-center-metric{min-width:0;padding:8px 6px;border-radius:11px}
    .study-center-metric span{font-size:.62rem;white-space:nowrap}
    .study-center-metric strong{margin:2px 0 0;font-size:1.25rem;line-height:1.1}
    .study-center-metric small{display:none}

    .study-center-panel{margin-top:7px;padding:12px;border-radius:14px}
    .study-center-panel h3,.study-center-review-heading h3{font-size:.98rem}
    .study-center-panel-heading{gap:8px}
    .study-center-start-panel{gap:9px;align-items:stretch;flex-direction:column}
    .study-center-start-panel p{font-size:.72rem;line-height:1.35}
    .study-center-start-actions{
        display:grid;
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:5px;
    }
    .study-center-start-actions button{min-width:0;padding:8px 3px;font-size:.72rem}

    .study-center-week-bars{gap:3px;min-height:92px;margin-top:10px}
    .study-center-week-day{grid-template-rows:auto 50px auto;gap:3px}
    .study-center-week-track{height:50px}
    .study-center-week-day small,.study-center-week-day strong{font-size:.58rem}

    .study-center-compact-list,.study-center-word-list{gap:6px;margin-top:9px}
    .study-center-word-card{
        display:block;
        width:100%;
        max-width:100%;
        padding:10px;
        border-radius:12px;
    }
    .study-center-word-title-row{gap:5px}
    .study-center-word-title-row strong{font-size:.95rem}
    .study-center-word-meaning{font-size:.86rem}
    .study-center-word-meta{gap:4px;margin-top:5px}
    .study-center-word-meta span{padding:2px 6px;font-size:.61rem}
    .study-center-word-main small{margin-top:5px;font-size:.67rem}
    .study-center-word-actions{
        width:100%;
        margin-top:8px;
        display:flex;
        flex-direction:row;
        gap:5px;
    }
    .study-center-word-actions button{
        width:auto;
        min-width:0;
        min-height:32px;
        padding:5px 7px;
        font-size:.7rem;
        flex:1 1 0;
    }
    .study-center-word-actions .study-center-master-action{flex:0 0 38px;min-width:38px}

    .study-center-filter-row{gap:5px;margin:0 -2px;padding:0 2px 4px}
    .study-center-filter-row button{padding:7px 9px;font-size:.72rem}
    .study-center-list-heading{margin:9px 2px 2px;font-size:.8rem}

    .study-center-review-summary{
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:5px;
    }
    .study-center-review-summary>div{min-width:0;padding:8px 6px;border-radius:11px}
    .study-center-review-summary span{font-size:.61rem;white-space:nowrap}
    .study-center-review-summary strong{margin:2px 0;font-size:1.22rem;line-height:1.1}
    .study-center-review-summary small{display:none}
    .study-center-review{gap:10px}
    .study-center-review-group{padding:10px;border-radius:14px;scroll-margin-top:48px}
    .study-center-review-heading{
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        gap:8px;
        align-items:start;
    }
    .study-center-review-heading p{font-size:.72rem;line-height:1.35}
    .study-center-review-heading button{
        max-width:112px;
        padding:7px 8px;
        font-size:.7rem;
        line-height:1.2;
        white-space:normal;
        text-align:center;
    }
    .study-center-empty{padding:14px;font-size:.78rem}

    .study-center-history-day{margin-bottom:14px}
    .study-center-history-session{margin:6px 0;border-radius:11px}
    .study-center-history-session summary{
        display:grid;
        grid-template-columns:minmax(0,1fr) auto;
        gap:8px;
        align-items:start;
        padding:10px;
    }
    .study-center-history-numbers{min-width:62px}
    .study-center-history-breakdown{gap:5px;padding:8px 10px}
    .study-center-history-breakdown span{padding:3px 6px;font-size:.68rem}
    .study-center-history-words{padding:4px 10px 9px}
    .study-center-history-words>div{
        grid-template-columns:minmax(0,.9fr) minmax(0,1.3fr) 22px;
        gap:5px;
        padding:6px 0;
    }
    .study-center-history-words span{font-size:.72rem;overflow-wrap:anywhere}

    .study-center-stat-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin-bottom:9px}
    .study-center-stat-grid>div{padding:10px;border-radius:11px}
    .study-center-stat-grid strong{font-size:1.35rem}
    .study-center-activity-bars{gap:3px;height:92px}
    .study-center-current-stats{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
    .study-center-current-stats span{padding:8px;font-size:.72rem}
    .study-center-current-stats b{font-size:1.1rem}
}

@media(max-width:340px){
    .study-center-shell{padding-left:8px;padding-right:8px}
    .study-center-tabs{margin-left:-8px;margin-right:-8px;padding-left:6px;padding-right:6px}
    .study-center-tabs button{font-size:.69rem;padding-left:2px;padding-right:2px}
    .study-center-hero{padding:10px}
    .study-center-hero h2{font-size:1rem}
    .study-center-hero-count{min-width:62px}
    .study-center-metric{padding-left:4px;padding-right:4px}
    .study-center-metric span{font-size:.58rem}
    .study-center-start-actions button{font-size:.68rem}
}
'''
css_path.write_text(css + mobile_css)

js_path = Path('study-center.js')
js = js_path.read_text()
js = replace_once(
    js,
    "        section.style.display = 'block';\n        render();",
    "        section.style.display = 'block';\n        section.scrollTop = 0;\n        render();",
    'show section scroll reset'
)
js = replace_once(
    js,
    "                activeTab = tab.dataset.studyTab;\n                render();\n                return;",
    "                activeTab = tab.dataset.studyTab;\n                render();\n                section.scrollTop = 0;\n                return;",
    'tab scroll reset'
)
js = replace_once(
    js,
    "                activeTab = targetTab.dataset.tabTarget;\n                render();\n                return;",
    "                activeTab = targetTab.dataset.tabTarget;\n                render();\n                section.scrollTop = 0;\n                return;",
    'target tab scroll reset'
)
js_path.write_text(js)

index_path = Path('index.html')
html = index_path.read_text()
html = replace_once(html, 'study-center.css?v=3', 'study-center.css?v=4', 'study css cache')
html = replace_once(html, 'study-center.js?v=4', 'study-center.js?v=5', 'study js cache')
index_path.write_text(html)
