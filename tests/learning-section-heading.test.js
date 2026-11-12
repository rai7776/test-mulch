const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('each learning destination uses the shared page heading', () => {
    const index = read('index.html');
    const discover = read('discover.js');
    const study = read('study-center.js');
    assert.match(index, /class="vocabulary-title-row">\s*<div class="learning-section-heading">/);
    assert.match(index, /class="problems-title-row">\s*<div class="learning-section-heading">/);
    assert.match(discover, /<header class="learning-section-heading discover-heading">/);
    assert.match(study, /<div class="learning-section-heading"><span class="study-center-eyebrow">STUDY/);
});

test('shared heading size, eyebrow, secondary text and mobile spacing are defined once', () => {
    const css = read('learning-ui.css');
    assert.match(css, /\.learning-ui \.learning-section-heading > \.study-center-eyebrow/);
    assert.match(css, /\.learning-section-heading > :is\(h1, h2\)/);
    assert.match(css, /\.learning-section-heading > :is\(\.discover-subtitle, \.vocabulary-count, p\)/);
    assert.match(css, /\.learning-ui #discover-section \.discover-inner \{ padding:8px 12px 90px; \}/);
    assert.match(css, /font-size:1\.55rem/);
});
