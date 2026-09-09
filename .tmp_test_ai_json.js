const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const domValues = {
  'input-note-eng': { value: 'The book that I bought yesterday was surprisingly expensive.' }
};

global.window = {};
global.document = {
  readyState: 'loading',
  addEventListener() {},
  getElementById(id) { return domValues[id] || null; }
};
global.navigator = {};

let source = fs.readFileSync('note-structure-editor.js', 'utf8');
const exportMarker = "        countOccurrences,\n        refresh: () => loadFromContext(true)";
assert(source.includes(exportMarker), 'export marker missing');
source = source.replace(exportMarker, "        countOccurrences,\n        extractAiJsonCandidate,\n        validateImportedStructure,\n        resolveAiJsonPayload,\n        refresh: () => loadFromContext(true)");
vm.runInThisContext(source, { filename: 'note-structure-editor.js' });

const api = window.SmartReaderNoteStructureEditor;
assert(api, 'editor API missing');

const structure = {
  annotations: [
    { id: 'a1', text: 'The book', occurrence: 1, kind: 'core', label: 'S' },
    { id: 'a2', text: 'that I bought yesterday', occurrence: 1, kind: 'modifier', notation: 'square' },
    { id: 'a3', text: 'bought', occurrence: 1, kind: 'core', label: "V'" },
    { id: 'a4', text: 'yesterday', occurrence: 1, kind: 'modifier', notation: 'angle' },
    { id: 'a5', text: 'was', occurrence: 1, kind: 'core', label: 'V' },
    { id: 'a6', text: 'surprisingly', occurrence: 1, kind: 'modifier', notation: 'angle' },
    { id: 'a7', text: 'expensive', occurrence: 1, kind: 'core', label: 'C' }
  ],
  relations: [
    { from: 'a2', to: 'a1', type: 'modifies' },
    { from: 'a4', to: 'a3', type: 'modifies' },
    { from: 'a6', to: 'a7', type: 'modifies' }
  ]
};

const structureOnly = api.resolveAiJsonPayload(structure);
assert.equal(structureOnly.structure.annotations.length, 7);
assert.equal(structureOnly.note, null);

const notePayload = {
  originalText: domValues['input-note-eng'].value,
  translation: '私が昨日買ったその本は驚くほど高かった。',
  structure,
  extra: 'that I bought yesterday は The book を修飾する。'
};
const noteResult = api.resolveAiJsonPayload(notePayload);
assert.equal(noteResult.note.translation, notePayload.translation);
assert.equal(noteResult.structure.relations.length, 3);

const bulkPayload = {
  format: 'smart-reader-bulk',
  version: 2,
  words: [],
  notes: [notePayload]
};
const bulkResult = api.resolveAiJsonPayload(bulkPayload);
assert.equal(bulkResult.note.originalText, notePayload.originalText);
assert.equal(bulkResult.structure.annotations[0].label, 'S');

const fenced = '```json\n' + JSON.stringify(notePayload) + '\n```';
assert.deepEqual(JSON.parse(api.extractAiJsonCandidate(fenced)).structure.annotations.length, 7);

assert.throws(() => api.resolveAiJsonPayload({ ...bulkPayload, notes: [notePayload, notePayload] }), /notes を1件/);
assert.throws(() => api.resolveAiJsonPayload({ ...structure, relations: [{ from: 'missing', to: 'a1', type: 'modifies' }] }), /from の接続先/);
assert.throws(() => api.resolveAiJsonPayload({ annotations: [{ id: 'x', text: 'NOT IN SOURCE', occurrence: 1, kind: 'core', label: 'S' }], relations: [] }), /見つかりません/);

console.log('AI JSON parser tests passed');
