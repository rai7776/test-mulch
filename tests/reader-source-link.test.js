const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'learning-ui.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('Reader keeps a one-tap external source link when URL is present', () => {
    assert.match(html, /<a id="display-url" href="#" target="_blank" rel="noopener noreferrer">元記事 ↗<\/a>/);
    assert.match(app, /document\.getElementById\('display-url'\)\.href = currentArticle\.url \|\| '#';/);
    assert.match(app, /document\.getElementById\('display-url'\)\.style\.display = currentArticle\.url \? 'inline-flex' : 'none';/);
    assert.doesNotMatch(css, /\.learning-ui \.reader-header #article-meta #display-url\s*\{\s*display:\s*none\s*!important/);
});

test('Both Library and Discover Reader expose the source link first on narrow screens', () => {
    assert.match(app, /classList\?\.toggle\?\.\('has-source-url', !!currentArticle\.url\)/);
    assert.match(css, /\.learning-ui \.reader-header\.has-source-url #article-meta\s*\{/);
    assert.match(css, /\.learning-ui \.reader-header\.has-source-url #article-meta #display-url\s*\{\s*order:-1/);
    assert.match(html, /learning-ui\.css\?v=7/);
});
