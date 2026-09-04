from pathlib import Path

bulk = Path('bulk-import.js')
text = bulk.read_text(encoding='utf-8')

old = """    const BULK_FORMAT = 'smart-reader-bulk';
    const BULK_VERSION = 1;
    const WORD_POS = new Set(['', 'noun', 'verb', 'adjective', 'adverb', 'phrase', 'preposition', 'conjunction', 'other']);
    const QUESTION_TYPES = new Set(['blank', 'choice', 'vocabulary', 'grammar', 'translation', 'reading', 'free', 'sorting', 'true/false', 'other']);
"""
new = """    const BULK_FORMAT = 'smart-reader-bulk';
    const BULK_VERSION = 2;
    const SUPPORTED_BULK_VERSIONS = new Set([1, 2]);
    const WORD_POS = new Set(['', 'noun', 'verb', 'adjective', 'adverb', 'phrase', 'preposition', 'conjunction', 'other']);
    const QUESTION_TYPES = new Set(['blank', 'choice', 'vocabulary', 'grammar', 'translation', 'reading', 'free', 'sorting', 'true/false', 'other']);
    const STRUCTURE_KINDS = new Set(['core', 'modifier', 'target']);
    const STRUCTURE_NOTATIONS = new Set(['angle', 'square', 'round']);
    const STRUCTURE_RELATION_TYPES = new Set(['modifies']);
"""
assert old in text, 'bulk constants marker not found'
text = text.replace(old, new, 1)

old = """        if (!payload || typeof payload !== 'object') throw new Error('JSONオブジェクトが必要です。');
        if (payload.data && typeof payload.data === 'object' && !payload.words && !payload.notes && !payload.questions) payload = payload.data;
        return payload;
    }
"""
new = """        if (!payload || typeof payload !== 'object') throw new Error('JSONオブジェクトが必要です。');
        if (payload.data && typeof payload.data === 'object' && !payload.words && !payload.notes && !payload.questions) payload = payload.data;
        if (payload.format !== undefined && text(payload.format) !== BULK_FORMAT) {
            throw new Error(`format は ${BULK_FORMAT} にしてください。`);
        }
        if (payload.version !== undefined) {
            const version = Number(payload.version);
            if (!Number.isInteger(version) || !SUPPORTED_BULK_VERSIONS.has(version)) {
                throw new Error(`Bulk Import version ${payload.version} には対応していません。対応: 1 / 2`);
            }
        }
        return payload;
    }
"""
assert old in text, 'parse payload marker not found'
text = text.replace(old, new, 1)

old = """    function normalizeNote(raw) {
        const originalText = text(raw?.originalText);
        const translation = text(raw?.translation);
        if (!originalText || !translation) return null;
        return {
            originalText,
            translation,
            extra: text(raw?.extra)
        };
    }
"""
new = """    function normalizeStructure(raw) {
        if (raw === undefined || raw === null) return null;
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            throw new Error('note.structure はオブジェクトにしてください。');
        }

        const annotationSource = raw.annotations === undefined ? [] : raw.annotations;
        const relationSource = raw.relations === undefined ? [] : raw.relations;
        if (!Array.isArray(annotationSource)) throw new Error('structure.annotations は配列にしてください。');
        if (!Array.isArray(relationSource)) throw new Error('structure.relations は配列にしてください。');

        const ids = new Set();
        const annotations = annotationSource.map((annotation, index) => {
            if (!annotation || typeof annotation !== 'object' || Array.isArray(annotation)) {
                throw new Error(`structure.annotations[${index}] が不正です。`);
            }
            const id = text(annotation.id);
            const annotationText = text(annotation.text);
            const kind = text(annotation.kind);
            if (!id) throw new Error(`structure.annotations[${index}].id は必須です。`);
            if (ids.has(id)) throw new Error(`structure annotation id「${id}」が重複しています。`);
            if (!annotationText) throw new Error(`structure.annotations[${index}].text は必須です。`);
            if (!STRUCTURE_KINDS.has(kind)) {
                throw new Error(`structure.annotations[${index}].kind は core / modifier / target のいずれかにしてください。`);
            }

            let occurrence = 1;
            if (annotation.occurrence !== undefined && annotation.occurrence !== null && annotation.occurrence !== '') {
                occurrence = Number(annotation.occurrence);
                if (!Number.isInteger(occurrence) || occurrence < 1) {
                    throw new Error(`structure.annotations[${index}].occurrence は1以上の整数にしてください。`);
                }
            }

            const normalized = { id, text: annotationText, occurrence, kind };
            if (kind === 'core') {
                const label = text(annotation.label);
                if (!label) throw new Error(`structure.annotations[${index}].label は core では必須です。`);
                normalized.label = label;
            }
            if (kind === 'modifier') {
                const notation = text(annotation.notation);
                if (!STRUCTURE_NOTATIONS.has(notation)) {
                    throw new Error(`structure.annotations[${index}].notation は angle / square / round のいずれかにしてください。`);
                }
                normalized.notation = notation;
            }
            ids.add(id);
            return normalized;
        });

        const relations = relationSource.map((relation, index) => {
            if (!relation || typeof relation !== 'object' || Array.isArray(relation)) {
                throw new Error(`structure.relations[${index}] が不正です。`);
            }
            const from = text(relation.from);
            const to = text(relation.to);
            const type = text(relation.type);
            if (!from || !to) throw new Error(`structure.relations[${index}] の from / to は必須です。`);
            if (!ids.has(from)) throw new Error(`structure.relations[${index}].from「${from}」に対応するannotationがありません。`);
            if (!ids.has(to)) throw new Error(`structure.relations[${index}].to「${to}」に対応するannotationがありません。`);
            if (!STRUCTURE_RELATION_TYPES.has(type)) {
                throw new Error(`structure.relations[${index}].type は modifies にしてください。`);
            }
            return { from, to, type };
        });

        return { annotations, relations };
    }

    function normalizeNote(raw) {
        const originalText = text(raw?.originalText);
        const translation = text(raw?.translation);
        if (!originalText || !translation) return null;
        const note = {
            originalText,
            translation,
            extra: text(raw?.extra)
        };
        const structure = normalizeStructure(raw?.structure);
        if (structure) note.structure = structure;
        return note;
    }
"""
assert old in text, 'normalizeNote marker not found'
text = text.replace(old, new, 1)

old = """        if (item.type === 'word') return [item.data.surfaceText, item.data.partOfSpeech, item.data.tags.map(t => `#${t}`).join(' ')].filter(Boolean).join(' · ');
        if (item.type === 'note') return item.data.translation;
        return [item.data.answer, item.data.questionType, item.data.difficulty ? `難易度${item.data.difficulty}` : ''].filter(Boolean).join(' · ');
"""
new = """        if (item.type === 'word') return [item.data.surfaceText, item.data.partOfSpeech, item.data.tags.map(t => `#${t}`).join(' ')].filter(Boolean).join(' · ');
        if (item.type === 'note') return [
            item.data.translation,
            item.data.structure ? `文構造 ${item.data.structure.annotations.length} annotation` : ''
        ].filter(Boolean).join(' · ');
        return [item.data.answer, item.data.questionType, item.data.difficulty ? `難易度${item.data.difficulty}` : ''].filter(Boolean).join(' · ');
"""
assert old in text, 'itemSubtitle marker not found'
text = text.replace(old, new, 1)

text = text.replace('Smart Reader Bulk Import v1', 'Smart Reader Bulk Import v2')

old = """- originalText は該当する英文\\n- translation は自然な日本語訳\\n- extra は構文・語法の解説\\n\\n【問題 questions】"""
new = """- originalText は該当する英文\\n- translation は自然な日本語訳\\n- extra は構文・語法の解説\\n- 文構造を付ける場合は structure.annotations / structure.relations を使用する\\n- annotation.kind は core / modifier / target\\n- modifier.notation は angle / square / round\\n- relation.type は modifies\\n\\n【問題 questions】"""
assert old in text, 'prompt note instructions marker not found'
text = text.replace(old, new, 1)

old = """                {
                    originalText: 'Given that food is wasted along the chain, ...',
                    translation: '食料が流通過程で廃棄されていることを考えると、…',
                    extra: 'given that = ～を考慮すると。along the chain は「流通・供給の過程に沿って」。'
                }
"""
new = """                {
                    originalText: 'The book that I bought yesterday was surprisingly expensive.',
                    translation: '私が昨日買ったその本は驚くほど高かった。',
                    structure: {
                        annotations: [
                            { id: 'a1', text: 'The book', occurrence: 1, kind: 'core', label: 'S' },
                            { id: 'a2', text: 'that I bought yesterday', occurrence: 1, kind: 'modifier', notation: 'square' },
                            { id: 'a3', text: 'bought', occurrence: 1, kind: 'core', label: \"V'\" },
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
                    },
                    extra: 'that I bought yesterday は The book を修飾する関係詞節。'
                }
"""
assert old in text, 'prompt sample note marker not found'
text = text.replace(old, new, 1)

bulk.write_text(text, encoding='utf-8')

index = Path('index.html')
html = index.read_text(encoding='utf-8')
old = '<script src="bulk-import.js?v=1.0"></script>'
new = '<script src="bulk-import.js?v=2.0"></script>'
assert old in html, 'bulk-import script version marker not found'
html = html.replace(old, new, 1)
index.write_text(html, encoding='utf-8')
