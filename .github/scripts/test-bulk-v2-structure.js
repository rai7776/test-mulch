const fs = require('fs');
const vm = require('vm');

let source = fs.readFileSync('bulk-import.js', 'utf8');
source = source.replace(
  '    window.openBulkImport = openBulkImport;',
  '    window.__bulkV2Test = { normalizeStructure, normalizeNote, parseBulkPayload, createNewItem };\n    window.openBulkImport = openBulkImport;'
);

const sandbox = {
  console,
  window: {},
  navigator: {},
  document: {
    readyState: 'loading',
    addEventListener() {},
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    body: { appendChild() {} }
  },
  MutationObserver: function () { this.observe = function () {}; },
  getComputedStyle() { return { display: 'none' }; },
  setInterval() { return 0; },
  clearInterval() {},
  setTimeout() { return 0; },
  clearTimeout() {},
  alert() {},
  currentArticle: null,
  currentChapterId: null
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox);

const { normalizeNote, parseBulkPayload, createNewItem } = sandbox.window.__bulkV2Test;
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function expectThrow(fn, fragment) {
  let error = null;
  try { fn(); } catch (e) { error = e; }
  assert(error, `Expected error containing: ${fragment}`);
  assert(String(error.message).includes(fragment), `Unexpected error: ${error.message}`);
}

const v1 = parseBulkPayload(JSON.stringify({
  format: 'smart-reader-bulk', version: 1, words: [],
  notes: [{ originalText: 'A.', translation: 'A訳', extra: 'x' }], questions: []
}));
assert(v1.version === 1, 'v1 payload should remain accepted');
const legacy = normalizeNote(v1.notes[0]);
assert(!Object.prototype.hasOwnProperty.call(legacy, 'structure'), 'legacy note must stay structure-free');

const structure = {
  annotations: [
    { id: 'a1', text: 'The book', occurrence: 1, kind: 'core', label: 'S' },
    { id: 'a2', text: 'that I bought yesterday', occurrence: 1, kind: 'modifier', notation: 'square' },
    { id: 'a3', text: 'bought', occurrence: 1, kind: 'core', label: "V'" },
    { id: 'a4', text: 'yesterday', occurrence: 1, kind: 'modifier', notation: 'angle' },
    { id: 'a5', text: 'was', occurrence: 1, kind: 'core', label: 'V' },
    { id: 'a6', text: 'expensive', occurrence: 1, kind: 'core', label: 'C' },
    { id: 'a7', text: 'surprisingly', occurrence: 1, kind: 'modifier', notation: 'angle' }
  ],
  relations: [
    { from: 'a2', to: 'a1', type: 'modifies' },
    { from: 'a4', to: 'a3', type: 'modifies' },
    { from: 'a7', to: 'a6', type: 'modifies' }
  ]
};
const v2 = parseBulkPayload(JSON.stringify({
  format: 'smart-reader-bulk', version: 2, words: [],
  notes: [{
    originalText: 'The book that I bought yesterday was surprisingly expensive.',
    translation: '私が昨日買ったその本は驚くほど高かった。',
    structure,
    extra: '解説'
  }], questions: []
}));
const note = normalizeNote(v2.notes[0]);
assert(note.structure.annotations.length === 7, 'v2 annotations were not retained');
assert(note.structure.relations.length === 3, 'v2 relations were not retained');
assert(note.structure.annotations[3].notation === 'angle', 'modifier notation lost');
assert(note.structure.annotations[2].label === "V'", 'core label lost');
const stored = createNewItem('note', note, 'chapter-2', 123, 456);
assert(stored.structure.annotations[0].id === 'a1', 'structure lost when creating stored note');
assert(stored.chapterId === 'chapter-2', 'chapter assignment changed');

const targetNote = normalizeNote({
  originalText: 'I bought it yesterday.', translation: '私は昨日それを買った。',
  structure: {
    annotations: [
      { id: 't1', text: 'bought', kind: 'target' },
      { id: 'm1', text: 'yesterday', kind: 'modifier', notation: 'angle' }
    ],
    relations: [{ from: 'm1', to: 't1', type: 'modifies' }]
  }
});
assert(targetNote.structure.annotations[0].occurrence === 1, 'target occurrence default should be 1');

expectThrow(() => normalizeNote({
  originalText: 'x', translation: 'x', structure: {
    annotations: [
      { id: 'a1', text: 'x', kind: 'core', label: 'S' },
      { id: 'a1', text: 'y', kind: 'target' }
    ], relations: []
  }
}), '重複');

expectThrow(() => normalizeNote({
  originalText: 'x', translation: 'x', structure: {
    annotations: [{ id: 'a1', text: 'x', kind: 'modifier', notation: 'angle' }],
    relations: [{ from: 'a1', to: 'missing', type: 'modifies' }]
  }
}), '対応するannotationがありません');

expectThrow(() => parseBulkPayload(JSON.stringify({
  format: 'smart-reader-bulk', version: 3, words: [], notes: [], questions: []
})), '対応していません');

expectThrow(() => parseBulkPayload(JSON.stringify({
  format: 'wrong-format', version: 2, words: [], notes: [], questions: []
})), 'format');

console.log('bulk v2 structure tests passed');
