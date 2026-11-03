const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync(require.resolve('../app.js'), 'utf8');
const css = fs.readFileSync(require.resolve('../learning-ui.css'), 'utf8');
function section(name, end) {
    const start = app.indexOf('function ' + name);
    const finish = app.indexOf('function ' + end, start + 1);
    assert.ok(start >= 0 && finish > start, name + ' source must exist');
    return app.slice(start, finish);
}

test('new article and Library navigation never re-enable Reader floating controls', () => {
    for (const [start, end] of [['showInputArea()', 'editCurrentArticle()'], ['showLibrary()', 'goToFolder(']]) {
        const source = section(start, end);
        assert.match(source, /hideAllSections\(\)/);
        assert.doesNotMatch(source, /getElementById\(['"]add-btn['"]\)\.style\.display\s*=\s*['"]['"]/);
        assert.doesNotMatch(source, /getElementById\(['"]fab-toggle['"]\)\.style\.display\s*=\s*['"]['"]/);
    }
});

test('Reader mode is set only while the Reader view is active', () => {
    const reader = section('openArticle(', 'renderArticleText()');
    const hide = section('hideAllSections()', 'lockReaderScrollForModal()');
    const edit = section('editCurrentArticle()', 'saveNewArticle()');
    assert.match(reader, /hideAllSections\(\);\s*document\.body\.classList\.add\('reader-mode-active'\)/);
    assert.match(hide, /document\.body\.classList\.remove\('reader-mode-active'\)/);
    assert.match(edit, /hideAllSections\(\)/);
});

test('CSS suppresses all floating Reader controls on non-Reader views', () => {
    assert.match(css, /body\.learning-ui:not\(\.reader-mode-active\) #add-btn,/);
    assert.match(css, /body\.learning-ui:not\(\.reader-mode-active\) #fab-toggle,/);
    assert.match(css, /body\.learning-ui:not\(\.reader-mode-active\) #bulk-add-btn\s*\{\s*display:\s*none\s*!important/);
});
