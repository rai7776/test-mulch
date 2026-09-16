from pathlib import Path


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing target: {label}')
    return text.replace(old, new, 1)

path = Path('word-senses.js')
text = path.read_text()

old = '''            const label = document.createElement('strong');\n            label.className = 'article-vocabulary-memo-label';\n            label.textContent = 'メモ';\n            const body = document.createElement('span');\n            body.className = 'article-vocabulary-memo-text';\n            appendHighlightedText(body, memoText, filter);\n            memo.append(label, body);\n'''
new = '''            const body = document.createElement('span');\n            body.className = 'article-vocabulary-memo-text';\n            appendHighlightedText(body, memoText, filter);\n            memo.append(body);\n'''
text = replace_once(text, old, new, 'remove memo heading')

text = replace_once(
    text,
    ".article-vocabulary-memo { display:grid; gap:4px; margin:12px 0 0 42px; padding:10px 0 0; border-top:1px solid #eceff1; }",
    ".article-vocabulary-memo { display:block; margin:7px 0 0 42px; padding:6px 0 0; border-top:1px solid #eceff1; }",
    'compact memo spacing'
)
text = text.replace("            .article-vocabulary-memo-label { color:#30363b; font-size:.76rem; font-weight:850; }\n", '', 1)
text = replace_once(
    text,
    ".article-vocabulary-memo { margin-left:38px; padding-top:8px; }",
    ".article-vocabulary-memo { margin-top:6px; margin-left:38px; padding-top:5px; }",
    'compact mobile memo spacing'
)
path.write_text(text)

index_path = Path('index.html')
index = index_path.read_text()
index = replace_once(index, 'word-senses.js?v=6', 'word-senses.js?v=7', 'word senses cache version')
index_path.write_text(index)
