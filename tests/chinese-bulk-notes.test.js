const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const chinese = require('../chinese-learning.js');
const targets = require('../learning-targets.js');
const prompts = require('../bulk-prompt-context-core.js');

function workspace(language, run) {
    const previous = global.window;
    global.window = { SmartReaderWorkspaceState: { activeWorkspace: { kind:'language', contentLanguage:language } },
        SmartReaderChinese:chinese, SmartReaderLearningTargets:targets };
    try { return run(); } finally { chinese.stopSentenceAudio(); global.window = previous; }
}
function importer(words = []) {
    const source = fs.readFileSync(require.resolve('../bulk-import.js'), 'utf8');
    const context = vm.createContext({ window, currentArticle:{ words }, document:{ readyState:'loading', addEventListener() {} } });
    vm.runInContext(source.replace('    window.openBulkImport = openBulkImport;',
        '    window.bulkTest = { normalizeWord, parseBulkPayload, createNewItem, updateDuplicate };\n    window.openBulkImport = openBulkImport;'), context);
    return window.bulkTest;
}

test('Chinese bulk JSON/TSV preserve optional readings, English stays unchanged', () => workspace('zh', () => {
    const api = importer();
    const data = api.normalizeWord({ word:'学习', meaning:'学ぶ', pinyin:'xué xí' });
    assert.equal(chinese.reading(data), 'xué xí');
    assert.equal(chinese.reading(api.normalizeWord({ word:'学习', meaning:'学ぶ', annotations:data.annotations })), 'xué xí');
    const item = api.createNewItem('word', data, 'chapter', 1, 12);
    assert.equal(item.chapterId, 'chapter');
    assert.equal(item.study.chinese.pinyin, false);
    assert.equal(item.study.chinese.meaning, false);
    assert.equal(api.normalizeWord({ word:'学习', meaning:'学ぶ' }).annotations, undefined);
    const row = api.parseBulkPayload('学习\t学ぶ\tverb\t\t\t\t学习\txué xí').words[0];
    assert.equal(chinese.reading(api.normalizeWord(row)), 'xué xí');
    const blank = api.parseBulkPayload('学习\t学ぶ\tverb\t\t\t\t学习\t').words[0];
    assert.equal(blank.pinyin, '');
    workspace('en', () => assert.equal(importer().normalizeWord({ word:'learn', meaning:'学ぶ', pinyin:'xué' }).annotations, undefined));
}));

test('bulk duplicate update preserves history and unrelated annotations; omission differs from clearing', () => workspace('zh', () => {
    const old = { id:1, word:'行', meaning:'行く', memorized:true, createdAt:10,
        annotations:[{ id:'pinyin', value:'xíng' }, { id:'custom', value:'keep' }],
        study:{ level:4, nextReviewAt:999, chinese:{ pinyin:true, meaning:true } } };
    const words = [old]; const api = importer(words);
    api.updateDuplicate('word', 0, api.normalizeWord({ word:'行', meaning:'行く', pinyin:'háng' }), null, 20);
    assert.equal(words[0].study.chinese.pinyin, false);
    assert.equal(words[0].study.chinese.meaning, true);
    assert.equal(words[0].study.level, 4);
    assert.equal(words[0].study.nextReviewAt, 999);
    assert.equal(words[0].annotations.find(a => a.id === 'custom').value, 'keep');
    assert.equal(chinese.reading(old), 'xíng');
    api.updateDuplicate('word', 0, api.normalizeWord({ word:'行', meaning:'行く' }), null, 30);
    assert.equal(chinese.reading(words[0]), 'háng');
    api.updateDuplicate('word', 0, api.normalizeWord({ word:'行', meaning:'列', pinyin:'' }), null, 40);
    assert.equal(chinese.reading(words[0]), '');
    assert.equal(words[0].study.chinese.meaning, false);
    assert.equal(words[0].createdAt, 10);
}));

test('Chinese AI prompt requests optional pinyin annotation without changing other language schema', () => {
    const state = language => ({ activeWorkspace:{ kind:'language', contentLanguage:language } });
    const prompt = prompts.contextualizePrompt('対象資料: Test\n【対象英文】\n我学习中文。', state('zh'));
    assert.match(prompt, /拼音は任意/);
    assert.match(prompt, /"id": "pinyin"/);
    assert.doesNotMatch(prompts.contextualizePrompt('English', state('en')), /pinyin/);
});

test('fine-grained audio accepts only a selection wholly inside its original text', () => {
    const inside = {}; const outside = {};
    const source = { contains:node => node === inside };
    const selection = { rangeCount:1, isCollapsed:false, toString:() => ' 图书馆 ',
        getRangeAt:() => ({ startContainer:inside, endContainer:inside }) };
    assert.equal(chinese.selectedSourceText(source, selection), '图书馆');
    selection.getRangeAt = () => ({ startContainer:inside, endContainer:outside });
    assert.equal(chinese.selectedSourceText(source, selection), '');
    assert.equal(chinese.selectedSourceText(source, null), '');
});

test('note decorator preserves original text and structure, toggles readings and plays selected phrase', () => workspace('zh', () => {
    function element() {
        const classes = new Set();
        return { dataset:{}, children:[], handlers:{}, textContent:'',
            classList:{ add:x => classes.add(x), remove:x => classes.delete(x), toggle:(x,on) => on ? classes.add(x) : classes.delete(x), contains:x => classes.has(x) },
            addEventListener(name, fn) { this.handlers[name] = fn; },
            setAttribute(name, value) { this[name] = value; },
            append(...children) { this.children.push(...children); }, appendChild(child) { this.children.push(child); },
            contains(node) { return node === this || this.children.includes(node); } };
    }
    const events = {}; const spoken = [];
    window.speechSynthesis = { cancel() {}, speak:utterance => spoken.push(utterance) };
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text; } };
    window.pinyinPro = { pinyin:chars => Array.from(chars).map(() => 'pīn') };
    const source = element();
    const text = '我去图书馆。';
    const node = { nodeValue:text, parentElement:{ closest:() => null }, replaceWith(fragment) { source.children = fragment.children; } };
    let controls;
    const doc = { defaultView:window, createElement:element, createDocumentFragment:element,
        createTextNode:text => ({ textContent:text }), addEventListener:(name, fn) => { events[name] = fn; },
        querySelectorAll:() => controls ? [controls.children[1]] : [],
        createTreeWalker() { let used = false; return { currentNode:node, nextNode() { if (used) return false; used = true; return true; } }; } };
    source.ownerDocument = doc;
    source.insertAdjacentElement = (_, value) => { controls = value; };
    const card = { ownerDocument:doc, querySelector:selector => selector === '.block-english' ? source : controls };
    chinese.decorateNote(card, { words:[] });
    assert.equal(source.children.map(child => child.textContent).join(''), text);
    const count = source.children.length;
    chinese.decorateNote(card, { words:[] });
    assert.equal(source.children.length, count);
    const toggle = controls.children[0].children[0];
    toggle.checked = false; toggle.handlers.change();
    assert.equal(source.classList.contains('chinese-pinyin-visible'), false);
    const button = controls.children[1];
    window.getSelection = () => ({ rangeCount:1, toString:() => '图书馆', getRangeAt:() => ({ startContainer:source, endContainer:source }) });
    events.selectionchange();
    assert.equal(button.disabled, false);
    button.handlers.pointerdown({ preventDefault() {} });
    window.getSelection = () => null;
    events.selectionchange();
    assert.equal(button.disabled, false);
    button.handlers.click({ stopPropagation() {} });
    assert.equal(spoken[0].text, '图书馆');
    assert.equal(spoken[0].lang, 'zh-CN');
}));
