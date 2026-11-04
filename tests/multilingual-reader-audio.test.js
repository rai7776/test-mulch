const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const chinese = require('../chinese-learning.js');

const makeState = language => ({activeWorkspace: {kind:'language', contentLanguage:language}});
function withWindow(state, impl) {
    const before = global.window;
    global.window = {SmartReaderWorkspaceState:state};
    try {return impl(global.window);}
    finally {
        chinese.stopSentenceAudio();
        if (before === undefined) delete global.window;
        else global.window = before;
    }
}

test('Reader speech works for English, Japanese, Korean and Spanish Workspace locales', () => {
    for (const [language,locale] of [['en','en-US'],['ja','ja-JP'],['ko','ko-KR'],['es','es-ES'],['fr','fr-FR']]) {
        withWindow(makeState(language), win => {
            const spoken=[];
            win.speechSynthesis={cancel(){},speak(utterance){spoken.push(utterance);}};
            win.SpeechSynthesisUtterance=class {constructor(text){this.text=text;}};
            chinese.setSpeechRate(1.2);
            assert.equal(chinese.hasReaderSpeech(),true);
            assert.equal(chinese.isChinese(),false);
            assert.equal(chinese.playSentence('Hello. テスト。',null),true);
            assert.equal(spoken[0].lang,locale);
            assert.equal(spoken[0].rate,1.2);
            chinese.stopSentenceAudio();
        });
    }
    chinese.setSpeechRate(0.85);
});

test('general Workspace without content language does not silently use an English voice', () => {
    withWindow({activeWorkspace:{kind:'general'}}, win => {
        win.speechSynthesis={cancel(){},speak(){throw Error('must not speak');}};
        win.SpeechSynthesisUtterance=class {};
        assert.equal(chinese.hasReaderSpeech(), false);
        assert.equal(chinese.playSentence('hello',null),false);
    });
});

function makeDisplay(text) {
    const classes=()=>{const values=new Set();return {
        add:name=>values.add(name),remove:name=>values.delete(name),contains:name=>values.has(name),
        toggle(name,on){if(on)values.add(name);else values.delete(name);}
    };};
    const paragraph={dataset:{}, children:[]};
    const node={
        nodeValue:text,parentElement:{closest:()=>null},
        replaceWith(fragment){paragraph.children=fragment.children;}
    };
    const doc={
        createElement(tag){return {
            tagName:tag,className:'',dataset:{},textContent:'',disabled:false,
            classList:classes(), attributes:{}, setAttribute(name,v){this.attributes[name]=v;},
            addEventListener(name,fn){this[name]=fn;}
        };},
        createTextNode(value){return {nodeValue:value,textContent:value};},
        createDocumentFragment(){return {children:[],appendChild(child){this.children.push(child);}};},
        createTreeWalker(){let used=false;return {currentNode:null,nextNode(){
            if(used)return false;used=true;this.currentNode=node;return true;
        }};}
    };
    const display={
        ownerDocument:doc, classList:classes(),
        querySelectorAll:selector=>selector==='p[data-paragraph-index]'?[paragraph]:[]
    };
    return {display,paragraph};
}

test('English Reader receives sentence buttons and continuous playback without pinyin spans', () => {
    withWindow(makeState('en'), win => {
        const spoken=[];
        win.speechSynthesis={cancel(){},speak(u){spoken.push(u);}};
        win.SpeechSynthesisUtterance=class{constructor(t){this.text=t;}};
        const {display,paragraph}=makeDisplay('Hello world. How are you?');
        chinese.decorateReader(display,{words:[]},true);
        const buttons=paragraph.children.filter(n=>n.tagName==='button');
        assert.equal(buttons.length,2);
        assert.equal(paragraph.children.map(n=>n.textContent).join(''),'Hello world. How are you?');
        assert.ok(!paragraph.children.some(n=>n.className==='chinese-character'));
        assert.equal(display.classList.contains('chinese-reader'),false);
        chinese.decorateReader(display,{words:[]},true);
        assert.equal(paragraph.children.filter(n=>n.tagName==='button').length,2);
        chinese.playAllSentences(display);
        assert.equal(spoken.length,1);
        assert.equal(spoken[0].text,'Hello world.');
        assert.equal(spoken[0].lang,'en-US');
        spoken[0].onend();
        assert.equal(spoken.length,2);
        assert.equal(spoken[1].text,'How are you?');
        chinese.stopSentenceAudio();
        spoken[1].onend();
        assert.equal(spoken.length,2);
    });
});

test('Reader, new article and chapter editor FAB visibility are screen scoped', () => {
    const app=fs.readFileSync(require.resolve('../app.js'),'utf8');
    const css=fs.readFileSync(require.resolve('../chinese-learning.css'),'utf8');
    const input=app.slice(app.indexOf('function showInputArea('),app.indexOf('function editCurrentArticle('));
    const library=app.slice(app.indexOf('function showLibrary('),app.indexOf('function goToFolder('));
    const reader=app.slice(app.indexOf('function openArticle('),app.indexOf('function isQuestionInChapter('));
    const hide=app.slice(app.indexOf('function hideAllSections('),app.indexOf('function lockReaderScrollForModal('));
    assert.ok(input.includes('hideAllSections()'));
    assert.ok(!input.includes("getElementById('add-btn').style.display = ''"));
    assert.ok(!library.includes("getElementById('add-btn').style.display = ''"));
    assert.ok(reader.includes("classList.add('reader-mode-active')"));
    assert.ok(hide.includes("classList.remove('reader-mode-active')"));
    for (const id of ['#add-btn','#fab-toggle','#bulk-add-btn']) {
        assert.ok(css.includes(id));
    }
    assert.match(css,/not\(\.reader-mode-active\)[\s\S]+display:none !important/);
    assert.match(css,/body\.reader-mode-active #bulk-add-btn/);
});

test('all language Workspaces see audio toolbar, but pinyin toggle is Chinese-only', () => {
    const js=fs.readFileSync(require.resolve('../chinese-learning.js'),'utf8');
    const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
    const css=fs.readFileSync(require.resolve('../chinese-learning.css'),'utf8');
    assert.ok(js.includes('if (wrap) wrap.hidden = !hasReaderSpeech()'));
    assert.ok(js.includes('if (displayOptions) displayOptions.hidden = !isChinese(article)'));
    assert.ok(css.includes('.reader-display-options[hidden]'));
    assert.ok(html.includes('id="chinese-selection-audio"'));
    assert.ok(html.includes('id="chinese-speech-rate"'));
});
