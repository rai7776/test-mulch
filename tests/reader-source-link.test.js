const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'learning-ui.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('Reader source link is a compact accessible icon immediately left of Edit', () => {
    const actions = html.split('<div id="article-meta"')[1].split('</div>')[0];
    assert.ok(actions.indexOf('id="display-url"') >= 0);
    assert.ok(actions.indexOf('id="display-url"') < actions.indexOf('id="reader-edit-article"'));
    assert.match(actions, /aria-label="元記事を開く"/);
    assert.match(actions, /<svg[^>]+aria-hidden="true"|<svg aria-hidden="true"/);
    assert.match(actions, /<path d="/);
    assert.match(app, /document\.getElementById\('display-url'\)\.href = currentArticle\.url \|\| '#';/);
    assert.match(app, /document\.getElementById\('display-url'\)\.style\.display = currentArticle\.url \? 'inline-flex' : 'none';/);
});

test('Library and saved Discover Reader keep the original single-row Edit layout', () => {
    assert.match(css, /\.learning-ui \.reader-header #article-meta\s*\{\s*grid-column:2;\s*grid-row:1;/);
    assert.match(css, /\.learning-ui \.reader-header #article-meta #display-url\s*\{[\s\S]*?width:34px;[\s\S]*?border-radius:50%;/);
    assert.doesNotMatch(css, /\.learning-ui \.reader-header\.has-source-url #article-meta\s*\{[^}]*grid-row:2/);
    assert.match(css, /\.learning-ui \.reader-header\.has-discover-actions #article-meta\s*\{\s*grid-column:1 \/ -1;\s*grid-row:2/);
    assert.match(app, /classList\?\.toggle\?\.\('has-discover-actions', readingFromDiscover && !!currentArticle\.isDiscoverArticle\)/);
    assert.match(html, /learning-ui\.css\?v=8/);
});
