from pathlib import Path
import subprocess


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing target: {label}')
    return text.replace(old, new, 1)

# Restore the word-senses module to the state before the mistaken edit-modal redesign.
baseline = subprocess.check_output(
    ['git', 'show', 'save/2026-09-16-before-word-modal-rich-layout:word-senses.js'],
    text=True,
)
text = baseline

# Add an enhancer for the vocabulary cards inside the article side panel
# (the panel with 単語 / ノート / 問題 / 設定).
anchor = '''    function wrapGlobalVocabularyCard() {\n'''
addition = r'''    function appendHighlightedText(target, value, filter) {
        const text = String(value || '');
        const query = String(filter || '').trim();
        if (!query) {
            target.textContent = text;
            return;
        }
        const lower = text.toLocaleLowerCase();
        const needle = query.toLocaleLowerCase();
        let cursor = 0;
        let index = lower.indexOf(needle, cursor);
        while (index >= 0) {
            if (index > cursor) target.appendChild(document.createTextNode(text.slice(cursor, index)));
            const mark = document.createElement('span');
            mark.className = 'text-highlight';
            mark.textContent = text.slice(index, index + query.length);
            target.appendChild(mark);
            cursor = index + query.length;
            index = lower.indexOf(needle, cursor);
        }
        if (cursor < text.length) target.appendChild(document.createTextNode(text.slice(cursor)));
    }

    function enhanceArticleVocabularyCard(card, word, filter = '') {
        if (!card || !word) return;
        const meaning = card.querySelector('.meaning-right');
        if (!meaning) return;
        const display = getSenseDisplay(word);
        const contextMeaning = normalizeText(display.context?.meaning || word.meaning);
        if (!contextMeaning) return;

        card.classList.add('article-vocabulary-sense-rich');
        meaning.classList.add('article-vocabulary-meaning-stack');
        meaning.replaceChildren();

        const primary = document.createElement('div');
        primary.className = 'article-vocabulary-primary-sense';
        appendHighlightedText(primary, contextMeaning, filter);
        meaning.appendChild(primary);

        if (display.others.length) {
            const secondary = document.createElement('div');
            secondary.className = 'article-vocabulary-secondary-senses';
            secondary.setAttribute('aria-label', 'その他の意味');
            display.others.forEach(sense => {
                const row = document.createElement('span');
                appendHighlightedText(row, sense.meaning, filter);
                secondary.appendChild(row);
            });
            meaning.appendChild(secondary);
        }

        const memo = card.querySelector('.memo-row');
        if (memo) {
            const memoText = normalizeText(word.memo);
            memo.classList.add('article-vocabulary-memo');
            memo.replaceChildren();
            const label = document.createElement('strong');
            label.className = 'article-vocabulary-memo-label';
            label.textContent = 'メモ';
            const body = document.createElement('span');
            body.className = 'article-vocabulary-memo-text';
            appendHighlightedText(body, memoText, filter);
            memo.append(label, body);
        }
    }

    function enhanceArticleVocabularyList(filter = '') {
        const panel = byId('panel-content');
        if (!panel) return;
        let article = null;
        try {
            article = typeof currentArticle !== 'undefined' ? currentArticle : null;
        } catch (_) {}
        if (!article || !Array.isArray(article.words)) return;

        article.words.forEach((word, sourceIndex) => {
            const hasId = word?.id !== undefined && word?.id !== null && String(word.id) !== '';
            const cardId = hasId ? `word-card-${String(word.id)}` : `word-card-index-${sourceIndex}`;
            const card = byId(cardId);
            if (!card || !panel.contains(card)) return;
            enhanceArticleVocabularyCard(card, word, filter);
        });
    }

    function wrapArticleVocabularyList() {
        let original = null;
        try {
            original = typeof renderList === 'function' ? renderList : window.renderList;
        } catch (_) {
            original = window.renderList;
        }
        if (typeof original !== 'function' || original.__wordSensesSidePanelWrapped) return;
        const wrapped = function (type, filter = '') {
            const result = original.apply(this, arguments);
            if (type === 'words') enhanceArticleVocabularyList(filter);
            return result;
        };
        wrapped.__wordSensesSidePanelWrapped = true;
        try { renderList = wrapped; } catch (_) {}
        window.renderList = wrapped;
    }

'''
text = replace_once(text, anchor, addition + anchor, 'article vocabulary enhancer anchor')

style_anchor = '''            .global-vocabulary-sense-rich .global-vocabulary-summary { align-items:flex-start; min-height:48px; }\n'''
side_styles = '''            .article-vocabulary-sense-rich { padding:16px 16px 12px; }\n            .article-vocabulary-sense-rich .word-row { display:grid; grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr); gap:18px; align-items:start; }\n            .article-vocabulary-sense-rich .word-left { min-width:0; align-items:flex-start; }\n            .article-vocabulary-sense-rich .word-text { font-size:1.06rem; font-weight:800; line-height:1.3; overflow-wrap:anywhere; }\n            .article-vocabulary-meaning-stack { min-width:0; display:grid; align-content:start; gap:3px; text-align:left; }\n            .article-vocabulary-primary-sense { color:var(--primary,#8d5a2b); font-size:1.04rem; font-weight:850; line-height:1.4; overflow-wrap:anywhere; }\n            .article-vocabulary-secondary-senses { display:grid; gap:2px; margin-top:3px; color:#444b52; font-size:.84rem; font-weight:600; line-height:1.45; }\n            .article-vocabulary-secondary-senses span { display:block; overflow-wrap:anywhere; }\n            .article-vocabulary-secondary-senses span::before { content:'・'; margin-right:3px; }\n            .article-vocabulary-memo { display:grid; gap:4px; margin:12px 0 0 42px; padding:10px 0 0; border-top:1px solid #eceff1; }\n            .article-vocabulary-memo-label { color:#30363b; font-size:.76rem; font-weight:850; }\n            .article-vocabulary-memo-text { color:#626a72; font-size:.84rem; line-height:1.5; white-space:pre-wrap; overflow-wrap:anywhere; }\n            .article-vocabulary-sense-rich .action-group { margin-top:8px; }\n''' + style_anchor
text = replace_once(text, style_anchor, side_styles, 'article vocabulary styles')

mobile_anchor = '''                .global-vocabulary-sense-rich .global-vocabulary-summary { gap:10px; }\n'''
mobile_styles = '''                .article-vocabulary-sense-rich { padding:13px 12px 10px; }\n                .article-vocabulary-sense-rich .word-row { grid-template-columns:minmax(0,.95fr) minmax(0,1.05fr); gap:10px; }\n                .article-vocabulary-sense-rich .word-text { font-size:1rem; }\n                .article-vocabulary-primary-sense { font-size:.98rem; }\n                .article-vocabulary-secondary-senses { font-size:.78rem; }\n                .article-vocabulary-memo { margin-left:38px; padding-top:8px; }\n                .article-vocabulary-memo-text { font-size:.8rem; }\n''' + mobile_anchor
text = replace_once(text, mobile_anchor, mobile_styles, 'article vocabulary mobile styles')

init_anchor = '''        wrapGlobalVocabularyCard();\n        wrapGlobalGroupCard();\n'''
init_new = '''        wrapGlobalVocabularyCard();\n        wrapGlobalGroupCard();\n        wrapArticleVocabularyList();\n'''
text = replace_once(text, init_anchor, init_new, 'article vocabulary render wrapper')
Path('word-senses.js').write_text(text)

# Make side-panel search include every registered meaning, not only the context meaning.
app_path = Path('app.js')
app = app_path.read_text()
filter_old = """            if (type === 'words') return `${item.word || ''} ${item.meaning || ''} ${item.memo || ''}`.toLowerCase().includes(q);\n"""
filter_new = """            if (type === 'words') {\n                const otherSenseText = Array.isArray(item.senses) ? item.senses.map(sense => sense?.meaning || '').join(' ') : '';\n                return `${item.word || ''} ${item.meaning || ''} ${otherSenseText} ${item.memo || ''}`.toLowerCase().includes(q);\n            }\n"""
app = replace_once(app, filter_old, filter_new, 'side panel multi-meaning search')
app_path.write_text(app)

# Bump browser cache versions for the two changed scripts.
index_path = Path('index.html')
index = index_path.read_text()
index = replace_once(index, 'app.js?v=4.0', 'app.js?v=4.1', 'app cache version')
index = replace_once(index, 'word-senses.js?v=5', 'word-senses.js?v=6', 'word senses cache version')
index_path.write_text(index)
