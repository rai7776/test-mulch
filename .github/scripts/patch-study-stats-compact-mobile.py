from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'anchor not found: {label}')
    return text.replace(old, new, 1)

css_path = Path('study-center.css')
css = css_path.read_text()
marker = '/* Study Center compact mobile stats v6 */'
if marker in css:
    raise SystemExit('compact stats v6 already present')

css += r'''

/* Study Center compact mobile stats v6 */
@media(max-width:700px){
    .study-center-stats .study-center-stat-grid{
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:5px;
        margin-bottom:6px;
    }
    .study-center-stats .study-center-stat-grid>div{
        min-width:0;
        min-height:56px;
        padding:6px 5px;
        border-radius:9px;
    }
    .study-center-stats .study-center-stat-grid span{
        min-width:0;
        font-size:.56rem;
        line-height:1.12;
        overflow-wrap:anywhere;
    }
    .study-center-stats .study-center-stat-grid strong{
        margin:2px 0 0;
        font-size:1.05rem;
        line-height:1.05;
        white-space:nowrap;
    }
    .study-center-stats .study-center-stat-grid small{display:none}

    .study-center-stats .study-center-panel{
        margin-top:6px;
        padding:8px 9px;
        border-radius:12px;
    }
    .study-center-stats .study-center-panel-heading{gap:6px}
    .study-center-stats .study-center-panel h3{
        margin:1px 0 0;
        font-size:.84rem;
        line-height:1.15;
    }
    .study-center-stats .study-center-panel .study-center-eyebrow{
        font-size:.5rem;
        line-height:1.1;
    }

    .study-center-stats .study-center-activity-bars{
        height:62px;
        gap:3px;
        margin-top:5px;
    }
    .study-center-stats .study-center-activity-bars>div{
        grid-template-rows:12px 1fr 12px;
        gap:2px;
    }
    .study-center-stats .study-center-activity-bars strong,
    .study-center-stats .study-center-activity-bars small{
        font-size:.53rem;
        line-height:1;
    }
    .study-center-stats .study-center-activity-bars .bar{border-radius:6px}

    .study-center-stats .study-center-current-stats{
        grid-template-columns:repeat(4,minmax(0,1fr));
        gap:5px;
        margin-top:6px;
    }
    .study-center-stats .study-center-current-stats span{
        min-width:0;
        padding:6px 5px;
        border-radius:8px;
        font-size:.57rem;
        line-height:1.1;
        overflow-wrap:anywhere;
    }
    .study-center-stats .study-center-current-stats b{
        margin-top:2px;
        font-size:.98rem;
        line-height:1;
    }
}

@media(max-width:340px){
    .study-center-stats .study-center-stat-grid,
    .study-center-stats .study-center-current-stats{gap:4px}
    .study-center-stats .study-center-stat-grid>div{padding-left:4px;padding-right:4px}
    .study-center-stats .study-center-stat-grid span{font-size:.52rem}
    .study-center-stats .study-center-stat-grid strong{font-size:.98rem}
    .study-center-stats .study-center-current-stats span{font-size:.53rem;padding-left:4px;padding-right:4px}
}
'''
css_path.write_text(css)

index_path = Path('index.html')
html = index_path.read_text()
html = replace_once(html, 'study-center.css?v=5', 'study-center.css?v=6', 'study css cache')
index_path.write_text(html)
