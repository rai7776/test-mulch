const test = require('node:test');
const assert = require('node:assert/strict');
const header = require('../reader-header.js');

test('breadcrumb uses the article location, preserves IDs and handles broken/cyclic folder paths', () => {
    const items = [{ id:0, type:'folder', name:'中国語', parentId:null },
        { id:'child', type:'folder', name:'読書', parentId:0 }];
    assert.deepEqual(header.path({ id:5, name:'本', parentId:'child' }, items).map(c => c.label), ['本棚','中国語','読書','本']);
    assert.equal(header.path({ parentId:0 }, items)[1].id, 0);
    assert.equal(header.path({ parentId:'missing' }, items).length, 2);
    items[0].parentId = 'child';
    assert.equal(header.path({ parentId:'child' }, items).length, 4);
});

test('breadcrumb renders safe text and working folder navigation, and hides outside Reader', () => {
    const classes = new Set(); const calls = [];
    const nav = { hidden:true, replaceChildren(list) { this.list = list; } };
    const doc = { getElementById:() => nav,
        querySelector:() => ({ classList:{ add:c => classes.add(c), remove:c => classes.delete(c) } }),
        createElement:tag => ({ tag, children:[], attrs:{}, appendChild(child) { this.children.push(child); },
            setAttribute(k,v) { this.attrs[k] = v; }, addEventListener(event,fn) { this[event] = fn; } }) };
    header.render(doc, { id:3, name:'<img onerror=alert(1)>', parentId:'folder' },
        [{ id:'folder', name:'Folder', type:'folder' }], id => calls.push(id));
    assert.equal(nav.hidden, false);
    assert.ok(classes.has('reader-header'));
    const labels = nav.list.children.map(li => li.children[0]);
    labels[0].click(); labels[1].click();
    assert.deepEqual(calls, [null,'folder']);
    assert.equal(labels[2].textContent, '<img onerror=alert(1)>');
    assert.equal(labels[2].attrs['aria-current'], 'page');
    header.hide(doc);
    assert.equal(nav.hidden, true);
    assert.equal(classes.has('reader-header'), false);
});
