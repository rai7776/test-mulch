from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'anchor not found: {label}')
    return text.replace(old, new, 1)

css_path = Path('study-center.css')
css = css_path.read_text()
marker = '/* Study Center balanced mobile stats v7 */'
if marker in css:
    raise SystemExit('balanced stats v7 already present')

css += r'''

/* Study Center balanced mobile stats v7 */
@media(max-width:700px){
    .study-center-stats .study-center-stat-grid{
        grid-template-columns:repeat(3,minmax(0,1fr));
        gap:6px;
        margin-bottom:8px;
    }
    .study-center-stats .study-center-stat-grid>div{
        min-width:0;
        min-height:62px;
        padding:8px 7px;
        border-radius:10px;
    }
    .study-center-stats .study-center-stat-grid span{
        font-size:.62rem;
        line-height:1.15;
    }
    .study-center-stats .study-center-stat-grid strong{
        margin:3px 0 0;
        font-size:1.15rem;
        line-height:1.05;
    }

    .study-center-stats .study-center-panel{
        margin-top:8px;
        padding:9px 10px;
        border-radius:12px;
    }
    .study-center-stats .study-center-panel h3{
        font-size:.9rem;
        line-height:1.15;
    }
    .study-center-stats .study-center-panel .study-center-eyebrow{
        font-size:.52rem;
    }

    .study-center-stats .study-center-activity-bars{
        height:92px;
        gap:4px;
        margin-top:6px;
    }
    .study-center-stats .study-center-activity-bars>div{
        grid-template-rows:14px minmax(0,1fr) 14px;
        gap:3px;
        min-height:0;
    }
    .study-center-stats .study-center-activity-bars .bar{
        min-height:0;
        height:100%;
        overflow:hidden;
    }
    .study-center-stats .study-center-activity-bars i{
        max-height:100%;
    }
    .study-center-stats .study-center-activity-bars strong,
    .study-center-stats .study-center-activity-bars small{
        font-size:.56rem;
        line-height:1;
    }

    .study-center-stats .study-center-current-stats{
        grid-template-columns:repeat(2,minmax(0,1fr));
        gap:6px;
        margin-top:7px;
    }
    .study-center-stats .study-center-current-stats span{
        min-width:0;
        min-height:48px;
        padding:7px 8px;
        border-radius:9px;
        font-size:.64rem;
        line-height:1.15;
    }
    .study-center-stats .study-center-current-stats b{
        margin-top:3px;
        font-size:1.08rem;
        line-height:1;
    }
}

@media(max-width:340px){
    .study-center-stats .study-center-stat-grid{gap:5px}
    .study-center-stats .study-center-stat-grid>div{padding:7px 6px}
    .study-center-stats .study-center-stat-grid span{font-size:.58rem}
    .study-center-stats .study-center-stat-grid strong{font-size:1.08rem}
    .study-center-stats .study-center-current-stats span{font-size:.6rem}
}
'''
css_path.write_text(css)

js_path = Path('study-center.js')
js = js_path.read_text()
js = replace_once(
    js,
    "            const height = Math.max(day.count ? 10 : 2, Math.round((day.count / max) * 68));\n            return `<div><strong>${day.count}</strong><span class=\"bar\"><i style=\"height:${height}px\"></i></span><small>${date.getMonth() + 1}/${date.getDate()}</small></div>`;",
    "            const height = Math.max(day.count ? 14 : 2, Math.round((day.count / max) * 100));\n            return `<div><strong>${day.count}</strong><span class=\"bar\"><i style=\"height:${height}%\"></i></span><small>${date.getMonth() + 1}/${date.getDate()}</small></div>`;",
    'activity bar percentage sizing'
)
js_path.write_text(js)

index_path = Path('index.html')
html = index_path.read_text()
html = replace_once(html, 'study-center.css?v=6', 'study-center.css?v=7', 'study css cache')
html = replace_once(html, 'study-center.js?v=6', 'study-center.js?v=7', 'study js cache')
index_path.write_text(html)
