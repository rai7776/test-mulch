(function () {
    'use strict';

    const BULK_FORMAT = 'smart-reader-bulk';
    const BULK_VERSION = 1;
    const WORD_POS = new Set(['', 'noun', 'verb', 'adjective', 'adverb', 'phrase', 'preposition', 'conjunction', 'other']);
    const QUESTION_TYPES = new Set(['blank', 'choice', 'vocabulary', 'grammar', 'translation', 'reading', 'free', 'sorting', 'true/false', 'other']);

    const state = {
        items: [],
        parsedAt: 0,
        status: '',
        error: false
    };

    function text(value) {
        return String(value ?? '').trim();
    }

    function uniqStrings(value) {
        const source = Array.isArray(value) ? value : String(value ?? '').split(',');
        return [...new Set(source.map(item => String(item ?? '').trim()).filter(Boolean))];
    }

    function activeChapterId() {
        try {
            if (typeof getActiveChapterIdForItem === 'function') return getActiveChapterIdForItem();
        } catch (_) {}
        return currentChapterId ?? null;
    }

    function activeChapter() {
        if (!currentArticle) return null;
        try {
            const chapters = typeof getArticleChapters === 'function' ? getArticleChapters(currentArticle) : [];
            if (!chapters.length) return null;
            const id = activeChapterId();
            return chapters.find(chapter => String(chapter.id) === String(id)) || chapters[0];
        } catch (_) {
            return null;
        }
    }

    function targetLabel() {
        if (!currentArticle) return '記事が開かれていません';
        const chapter = activeChapter();
        return chapter
            ? `${currentArticle.name || '無題'} / ${chapter.title || '本文'}`
            : (currentArticle.name || '無題');
    }

    function getPromptSourceText() {
        const chapter = activeChapter();
        if (chapter && typeof chapter.content === 'string') return chapter.content;
        return String(currentArticle?.content || '');
    }

    function buildAiPrompt() {
        const sourceText = getPromptSourceText();
        const articleTitle = currentArticle?.name || '無題';
        const chapter = activeChapter();
        const chapterTitle = chapter?.title || '本文';
        const sample = {
            format: BULK_FORMAT,
            version: BULK_VERSION,
            words: [
                {
                    word: 'derive',
                    surfaceText: 'derived',
                    meaning: '～を引き出す、～に由来する',
                    partOfSpeech: 'verb',
                    tags: ['重要', '語法'],
                    memo: 'derive A from B / be derived from B',
                    context: 'The word is derived from Latin.'
                }
            ],
            notes: [
                {
                    originalText: 'Given that food is wasted along the chain, ...',
                    translation: '食料が流通過程で廃棄されていることを考えると、…',
                    extra: 'given that = ～を考慮すると。along the chain は「流通・供給の過程に沿って」。'
                }
            ],
            questions: [
                {
                    selectedText: 'The word is derived from Latin.',
                    question: 'be derived from ～ の意味は？',
                    answer: '～に由来する',
                    explanation: 'derive A from B の受動態。',
                    memo: '',
                    questionType: 'grammar',
                    tags: ['語法'],
                    difficulty: 3,
                    needsReview: true
                }
            ]
        };

        return `あなたは英語学習用のSmart Readerに登録するデータを作成します。\n\n対象資料: ${articleTitle}\n対象章: ${chapterTitle}\n\n以下の英文から、学習価値の高いデータを作ってください。\n\n【単語 words】\n- 難関大学受験・英文読解で重要な単語、熟語、句を選ぶ\n- word は辞書形・基本形\n- surfaceText は本文中の実際の形\n- meaning はこの文脈での意味を優先\n- partOfSpeech は noun / verb / adjective / adverb / phrase / preposition / conjunction / other のいずれか\n- tags は必要なものだけ\n- context は本文中の該当文をなるべくそのまま入れる\n\n【ノート notes】\n- 見落としやすい構文、語法、修飾関係、読み違えやすい箇所を登録\n- originalText は該当する英文\n- translation は自然な日本語訳\n- extra は構文・語法の解説\n\n【問題 questions】\n- 語彙、文法、和訳、内容理解など復習価値の高い問題を作る\n- questionType は blank / choice / vocabulary / grammar / translation / reading / free / sorting / true/false / other のいずれか\n- difficulty は 1～5\n- selectedText は本文の根拠となる英文を入れる\n- answer と explanation を必ず付ける\n\n【重要】\n- id / articleId / chapterId / createdAt / updatedAt は絶対に出力しない\n- JSON以外の説明は不要\n- 該当項目がない配列は [] にする\n- 必ず次の Smart Reader Bulk Import v1 形式で出力する\n\n出力サンプル:\n\`\`\`json\n${JSON.stringify(sample, null, 2)}\n\`\`\`\n\n【対象英文】\n${sourceText}`;
    }

    function extractJsonCandidate(raw) {
        const input = String(raw || '').trim();
        if (!input) throw new Error('貼り付け内容が空です。');

        const fenced = input.match(/```(?:json)?\s*([\s\S]*?)```/i);
        if (fenced) return fenced[1].trim();

        const first = input.indexOf('{');
        const last = input.lastIndexOf('}');
        if (first >= 0 && last > first) return input.slice(first, last + 1);
        return input;
    }

    function parseTsvWords(raw) {
        const rows = String(raw || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
        if (!rows.length || !rows.some(line => line.includes('\t'))) return null;
        const words = rows.map(line => {
            const cols = line.split('\t');
            return {
                word: text(cols[0]),
                meaning: text(cols[1]),
                partOfSpeech: text(cols[2]),
                tags: uniqStrings(cols[3]),
                memo: text(cols[4]),
                context: text(cols[5]),
                surfaceText: text(cols[6]) || text(cols[0])
            };
        }).filter(item => item.word && item.meaning);
        return words.length ? { format: BULK_FORMAT, version: BULK_VERSION, words, notes: [], questions: [] } : null;
    }

    function parseBulkPayload(raw) {
        let payload;
        try {
            payload = JSON.parse(extractJsonCandidate(raw));
        } catch (jsonError) {
            const tsv = parseTsvWords(raw);
            if (tsv) return tsv;
            throw new Error('JSONとして解析できませんでした。AIの出力をコードブロックごと貼っても大丈夫です。');
        }

        if (Array.isArray(payload)) {
            throw new Error('トップレベルは配列ではなく Smart Reader Bulk Import のJSONオブジェクトにしてください。');
        }
        if (!payload || typeof payload !== 'object') throw new Error('JSONオブジェクトが必要です。');
        if (payload.data && typeof payload.data === 'object' && !payload.words && !payload.notes && !payload.questions) payload = payload.data;
        return payload;
    }

    function normalizeWord(raw) {
        const word = text(raw?.word);
        const meaning = text(raw?.meaning);
        if (!word || !meaning) return null;
        const partOfSpeech = text(raw?.partOfSpeech);
        return {
            word,
            surfaceText: text(raw?.surfaceText) || word,
            meaning,
            partOfSpeech: WORD_POS.has(partOfSpeech) ? partOfSpeech : '',
            tags: uniqStrings(raw?.tags),
            memo: text(raw?.memo),
            context: text(raw?.context)
        };
    }

    function normalizeNote(raw) {
        const originalText = text(raw?.originalText);
        const translation = text(raw?.translation);
        if (!originalText || !translation) return null;
        return {
            originalText,
            translation,
            extra: text(raw?.extra)
        };
    }

    function normalizeQuestion(raw) {
        const question = text(raw?.question);
        const answer = text(raw?.answer);
        if (!question || !answer) return null;
        const questionType = text(raw?.questionType);
        const difficulty = Number(raw?.difficulty);
        return {
            selectedText: text(raw?.selectedText),
            question,
            answer,
            explanation: text(raw?.explanation),
            memo: text(raw?.memo),
            questionType: QUESTION_TYPES.has(questionType) ? questionType : 'other',
            tags: uniqStrings(raw?.tags),
            difficulty: Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5 ? difficulty : null,
            needsReview: raw?.needsReview === true
        };
    }

    function sameChapter(item, chapterId) {
        if (chapterId === null || chapterId === undefined || chapterId === '') {
            return item?.chapterId === null || item?.chapterId === undefined || item?.chapterId === '';
        }
        return String(item?.chapterId) === String(chapterId);
    }

    function findDuplicate(type, data, chapterId) {
        if (!currentArticle) return -1;
        const list = type === 'word' ? currentArticle.words : type === 'note' ? currentArticle.notes : currentArticle.questions;
        if (!Array.isArray(list)) return -1;
        return list.findIndex(item => {
            if (!item || !sameChapter(item, chapterId)) return false;
            if (type === 'word') return text(item.word).toLowerCase() === data.word.toLowerCase();
            if (type === 'note') return text(item.originalText) === data.originalText;
            return text(item.question) === data.question;
        });
    }

    function buildReviewItems(payload) {
        const chapterId = activeChapterId();
        const items = [];
        const invalid = { words: 0, notes: 0, questions: 0 };

        (Array.isArray(payload.words) ? payload.words : []).forEach((raw, sourceIndex) => {
            const data = normalizeWord(raw);
            if (!data) { invalid.words += 1; return; }
            items.push({ type: 'word', sourceIndex, data, selected: true, duplicateIndex: findDuplicate('word', data, chapterId) });
        });
        (Array.isArray(payload.notes) ? payload.notes : []).forEach((raw, sourceIndex) => {
            const data = normalizeNote(raw);
            if (!data) { invalid.notes += 1; return; }
            items.push({ type: 'note', sourceIndex, data, selected: true, duplicateIndex: findDuplicate('note', data, chapterId) });
        });
        (Array.isArray(payload.questions) ? payload.questions : []).forEach((raw, sourceIndex) => {
            const data = normalizeQuestion(raw);
            if (!data) { invalid.questions += 1; return; }
            items.push({ type: 'question', sourceIndex, data, selected: true, duplicateIndex: findDuplicate('question', data, chapterId) });
        });

        return { items, invalid };
    }

    function modal() {
        return document.getElementById('bulk-import-overlay');
    }

    function setStatus(message, isError = false) {
        state.status = message || '';
        state.error = !!isError;
        const el = document.getElementById('bulk-import-status');
        if (!el) return;
        el.textContent = state.status;
        el.classList.toggle('is-error', state.error);
    }

    function typeLabel(type) {
        return type === 'word' ? '単語' : type === 'note' ? 'ノート' : '問題';
    }

    function itemTitle(item) {
        if (item.type === 'word') return `${item.data.word} — ${item.data.meaning}`;
        if (item.type === 'note') return item.data.originalText;
        return item.data.question;
    }

    function itemSubtitle(item) {
        if (item.type === 'word') return [item.data.surfaceText, item.data.partOfSpeech, item.data.tags.map(t => `#${t}`).join(' ')].filter(Boolean).join(' · ');
        if (item.type === 'note') return item.data.translation;
        return [item.data.answer, item.data.questionType, item.data.difficulty ? `難易度${item.data.difficulty}` : ''].filter(Boolean).join(' · ');
    }

    function renderReview() {
        const container = document.getElementById('bulk-import-review');
        const summary = document.getElementById('bulk-import-summary');
        const saveButton = document.getElementById('bulk-import-save');
        if (!container || !summary || !saveButton) return;

        const counts = { word: 0, note: 0, question: 0, duplicate: 0 };
        state.items.forEach(item => {
            counts[item.type] += 1;
            if (item.duplicateIndex >= 0) counts.duplicate += 1;
        });
        summary.textContent = `単語 ${counts.word}件 / ノート ${counts.note}件 / 問題 ${counts.question}件${counts.duplicate ? ` / 重複候補 ${counts.duplicate}件` : ''}`;
        container.innerHTML = '';

        state.items.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'bulk-import-row';
            row.innerHTML = `
                <label class="bulk-import-row-main">
                    <input type="checkbox" data-bulk-check="${index}" ${item.selected ? 'checked' : ''}>
                    <span class="bulk-import-kind">${typeLabel(item.type)}</span>
                    <span class="bulk-import-row-text">
                        <strong></strong>
                        <small></small>
                    </span>
                    ${item.duplicateIndex >= 0 ? '<span class="bulk-import-duplicate">重複</span>' : ''}
                </label>
                <details class="bulk-import-json-details">
                    <summary>内容を編集</summary>
                    <textarea data-bulk-edit="${index}" spellcheck="false"></textarea>
                    <button type="button" data-bulk-apply="${index}">編集を反映</button>
                </details>`;
            row.querySelector('strong').textContent = itemTitle(item);
            row.querySelector('small').textContent = itemSubtitle(item);
            row.querySelector('textarea').value = JSON.stringify(item.data, null, 2);
            container.appendChild(row);
        });

        container.querySelectorAll('[data-bulk-check]').forEach(input => {
            input.addEventListener('change', () => {
                const index = Number(input.dataset.bulkCheck);
                if (state.items[index]) state.items[index].selected = input.checked;
                updateSaveButton();
            });
        });
        container.querySelectorAll('[data-bulk-apply]').forEach(button => {
            button.addEventListener('click', () => applyItemEdit(Number(button.dataset.bulkApply)));
        });
        updateSaveButton();
    }

    function applyItemEdit(index) {
        const item = state.items[index];
        const area = document.querySelector(`[data-bulk-edit="${index}"]`);
        if (!item || !area) return;
        try {
            const raw = JSON.parse(area.value);
            const data = item.type === 'word' ? normalizeWord(raw) : item.type === 'note' ? normalizeNote(raw) : normalizeQuestion(raw);
            if (!data) throw new Error('必須項目が不足しています。');
            item.data = data;
            item.duplicateIndex = findDuplicate(item.type, data, activeChapterId());
            setStatus('編集内容を反映しました。');
            renderReview();
        } catch (error) {
            setStatus(`編集内容を反映できません: ${error.message}`, true);
        }
    }

    function updateSaveButton() {
        const button = document.getElementById('bulk-import-save');
        if (!button) return;
        const count = state.items.filter(item => item.selected).length;
        button.disabled = count === 0;
        button.textContent = count ? `選択した${count}件を追加` : '追加する項目を選択';
    }

    function parseFromTextarea() {
        if (!currentArticle) {
            setStatus('先に登録先の記事を開いてください。', true);
            return;
        }
        const textarea = document.getElementById('bulk-import-input');
        try {
            const payload = parseBulkPayload(textarea?.value || '');
            const { items, invalid } = buildReviewItems(payload);
            state.items = items;
            state.parsedAt = Date.now();
            const invalidCount = invalid.words + invalid.notes + invalid.questions;
            if (!items.length) throw new Error('追加できる単語・ノート・問題が見つかりませんでした。');
            setStatus(invalidCount ? `${items.length}件を解析しました。必須項目不足で${invalidCount}件を除外しました。` : `${items.length}件を解析しました。内容を確認してください。`);
            renderReview();
        } catch (error) {
            state.items = [];
            renderReview();
            setStatus(error.message || '解析に失敗しました。', true);
        }
    }

    async function pasteClipboard() {
        const textarea = document.getElementById('bulk-import-input');
        try {
            if (!navigator.clipboard?.readText) throw new Error('このブラウザではクリップボード読み取りを利用できません。');
            textarea.value = await navigator.clipboard.readText();
            setStatus('クリップボードから貼り付けました。');
        } catch (error) {
            setStatus(`${error.message} テキスト欄へ通常の貼り付けをしてください。`, true);
        }
    }

    async function copyPrompt() {
        if (!currentArticle) {
            setStatus('先に記事を開いてください。', true);
            return;
        }
        try {
            const prompt = buildAiPrompt();
            if (!navigator.clipboard?.writeText) throw new Error('クリップボードへコピーできません。');
            await navigator.clipboard.writeText(prompt);
            setStatus('AI用プロンプトをコピーしました。出力サンプルJSONも含まれています。');
        } catch (error) {
            setStatus(error.message || 'コピーに失敗しました。', true);
        }
    }

    function createNewItem(type, data, chapterId, id, now) {
        if (type === 'word') {
            const item = { id, memorized: false, createdAt: now, updatedAt: now, ...data };
            if (chapterId) item.chapterId = chapterId;
            return item;
        }
        if (type === 'note') {
            const item = { id, createdAt: now, updatedAt: now, ...data };
            if (chapterId) item.chapterId = chapterId;
            return item;
        }
        const item = { id, attempts: [], createdAt: now, updatedAt: now, ...data };
        if (chapterId) item.chapterId = chapterId;
        return item;
    }

    function updateDuplicate(type, index, data, chapterId, now) {
        const list = type === 'word' ? currentArticle.words : type === 'note' ? currentArticle.notes : currentArticle.questions;
        const old = list[index];
        if (!old) return false;
        const preserved = { ...old, ...data, updatedAt: now };
        if (chapterId) preserved.chapterId = old.chapterId || chapterId;
        if (type === 'word') {
            preserved.id = old.id;
            preserved.memorized = !!old.memorized;
            if (old.createdAt !== undefined) preserved.createdAt = old.createdAt;
        }
        if (type === 'question') {
            preserved.id = old.id;
            preserved.attempts = Array.isArray(old.attempts) ? old.attempts : [];
            if (old.createdAt !== undefined) preserved.createdAt = old.createdAt;
        }
        list[index] = preserved;
        return true;
    }

    async function saveSelected() {
        if (!currentArticle) {
            setStatus('登録先の記事がありません。', true);
            return;
        }
        const selectedItems = state.items.filter(item => item.selected);
        if (!selectedItems.length) return;
        const policy = document.getElementById('bulk-import-duplicate-policy')?.value || 'skip';
        const chapterId = activeChapterId();
        const now = Date.now();
        let sequence = 0;
        let added = 0;
        let updated = 0;
        let skipped = 0;
        const readingPosition = typeof rememberReadingPosition === 'function' ? rememberReadingPosition() : null;

        try {
            ensureArticleCollections(currentArticle);
            selectedItems.forEach(item => {
                item.duplicateIndex = findDuplicate(item.type, item.data, chapterId);
                if (item.duplicateIndex >= 0 && policy === 'skip') {
                    skipped += 1;
                    return;
                }
                if (item.duplicateIndex >= 0 && policy === 'update') {
                    if (updateDuplicate(item.type, item.duplicateIndex, item.data, chapterId, now)) updated += 1;
                    return;
                }
                const id = now * 100 + (++sequence);
                const newItem = createNewItem(item.type, item.data, chapterId, id, now);
                if (item.type === 'word') currentArticle.words.push(newItem);
                else if (item.type === 'note') currentArticle.notes.push(newItem);
                else currentArticle.questions.push(newItem);
                added += 1;
            });

            await saveToDB();
            if (typeof rerenderReaderAtPosition === 'function') rerenderReaderAtPosition(readingPosition);
            if (typeof renderList === 'function') renderList(currentTab, document.getElementById('list-search')?.value || '');
            closeBulkImport();
            setTimeout(() => {
                const message = `一括追加完了: 新規 ${added}件${updated ? ` / 更新 ${updated}件` : ''}${skipped ? ` / 重複スキップ ${skipped}件` : ''}`;
                if (typeof alert === 'function') alert(message);
            }, 0);
        } catch (error) {
            console.error(error);
            setStatus(`保存に失敗しました: ${error.message || error}`, true);
        }
    }

    function openBulkImport() {
        if (!currentArticle) {
            alert('一括追加する記事を先に開いてください。');
            return;
        }
        state.items = [];
        const target = document.getElementById('bulk-import-target');
        const input = document.getElementById('bulk-import-input');
        if (target) target.textContent = targetLabel();
        if (input) input.value = '';
        setStatus('AIの出力を貼り付けるか、「AI用プロンプトをコピー」を使ってください。');
        renderReview();
        modal()?.classList.add('show');
        if (typeof lockReaderScrollForModal === 'function') lockReaderScrollForModal();
    }

    function closeBulkImport() {
        modal()?.classList.remove('show');
        state.items = [];
        if (typeof unlockReaderScrollForModal === 'function') unlockReaderScrollForModal();
    }

    function createBulkModal() {
        if (document.getElementById('bulk-import-overlay')) return;
        const overlay = document.createElement('div');
        overlay.id = 'bulk-import-overlay';
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
            <div class="modal-content bulk-import-modal" role="dialog" aria-modal="true" aria-labelledby="bulk-import-title">
                <div class="bulk-import-heading">
                    <div>
                        <h2 id="bulk-import-title">一括追加</h2>
                        <div class="bulk-import-target-line">追加先: <strong id="bulk-import-target"></strong></div>
                    </div>
                    <button type="button" class="bulk-import-close" aria-label="閉じる">×</button>
                </div>
                <div class="bulk-import-actions-top">
                    <button type="button" id="bulk-import-copy-prompt" class="start-btn">AI用プロンプトをコピー</button>
                    <button type="button" id="bulk-import-paste" class="btn-sub">クリップボードから貼付</button>
                </div>
                <p class="bulk-import-help">プロンプトには、現在の章の本文と「Smart Reader Bulk Import v1」の出力サンプルJSONが含まれます。AIの返答は <code>JSONコードブロック</code> ごと貼り付けてOKです。</p>
                <textarea id="bulk-import-input" class="bulk-import-input" spellcheck="false" placeholder="AIのJSON出力をここに貼り付け…\n\n単語だけなら TSV も可:\nderive\t～に由来する\tverb\t重要,語法"></textarea>
                <div class="bulk-import-parse-row">
                    <button type="button" id="bulk-import-parse" class="start-btn">解析して確認</button>
                    <label>重複時
                        <select id="bulk-import-duplicate-policy">
                            <option value="skip">スキップ</option>
                            <option value="update">既存を更新</option>
                            <option value="keep">両方保存</option>
                        </select>
                    </label>
                </div>
                <div id="bulk-import-status" class="bulk-import-status" role="status" aria-live="polite"></div>
                <div id="bulk-import-summary" class="bulk-import-summary"></div>
                <div id="bulk-import-review" class="bulk-import-review"></div>
                <div class="modal-actions bulk-import-bottom-actions">
                    <button type="button" id="bulk-import-cancel" class="btn-cancel">キャンセル</button>
                    <button type="button" id="bulk-import-save" class="btn-save" disabled>追加する項目を選択</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);

        overlay.querySelector('.bulk-import-close').addEventListener('click', closeBulkImport);
        document.getElementById('bulk-import-cancel').addEventListener('click', closeBulkImport);
        document.getElementById('bulk-import-copy-prompt').addEventListener('click', copyPrompt);
        document.getElementById('bulk-import-paste').addEventListener('click', pasteClipboard);
        document.getElementById('bulk-import-parse').addEventListener('click', parseFromTextarea);
        document.getElementById('bulk-import-save').addEventListener('click', saveSelected);
        overlay.addEventListener('click', event => {
            if (event.target === overlay) closeBulkImport();
        });
    }

    function createBulkButton() {
        if (document.getElementById('bulk-add-btn')) return;
        const addBtn = document.getElementById('add-btn');
        if (!addBtn) return;
        const button = document.createElement('button');
        button.id = 'bulk-add-btn';
        button.className = 'fab-btn';
        button.type = 'button';
        button.textContent = '一括';
        button.title = '単語・ノート・問題を一括追加';
        button.addEventListener('click', openBulkImport);
        addBtn.insertAdjacentElement('beforebegin', button);

        const syncVisibility = () => {
            const visible = getComputedStyle(addBtn).display !== 'none' && !!currentArticle;
            button.style.display = visible ? '' : 'none';
        };
        new MutationObserver(syncVisibility).observe(addBtn, { attributes: true, attributeFilter: ['style', 'class'] });
        setInterval(syncVisibility, 1000);
        syncVisibility();
    }

    function injectStyle() {
        if (document.getElementById('bulk-import-style')) return;
        const style = document.createElement('style');
        style.id = 'bulk-import-style';
        style.textContent = `
            #bulk-add-btn { bottom: 158px; width: 55px; height: 38px; border-radius: 19px; background: #4f7e88; font-size: 13px; font-weight: 700; }
            .bulk-import-modal { width: min(96vw, 780px); max-width: 780px; max-height: 92vh; padding: 16px; }
            .bulk-import-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
            .bulk-import-heading h2 { margin: 0 0 4px; }
            .bulk-import-target-line { color: #666; font-size: .85em; }
            .bulk-import-close { border: 0; background: transparent; font-size: 28px; line-height: 1; cursor: pointer; color: #666; }
            .bulk-import-actions-top, .bulk-import-parse-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
            .bulk-import-parse-row { justify-content: space-between; }
            .bulk-import-parse-row label { display: flex; align-items: center; gap: 6px; color: #666; font-size: .88em; }
            .bulk-import-help { margin: 10px 0; padding: 9px 10px; border-radius: 8px; background: #f8f3ec; color: #66584a; font-size: .82em; line-height: 1.5; }
            .bulk-import-input { width: 100%; min-height: 180px; max-height: 34vh; resize: vertical; padding: 10px; border: 1px solid #d8c9b8; border-radius: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; line-height: 1.45; background: #fff; }
            .bulk-import-status { min-height: 1.4em; margin-top: 10px; color: #52606d; font-size: .88em; }
            .bulk-import-status.is-error { color: #b42318; }
            .bulk-import-summary { margin-top: 8px; font-weight: 700; font-size: .9em; }
            .bulk-import-review { display: grid; gap: 8px; margin-top: 8px; max-height: 35vh; overflow: auto; }
            .bulk-import-row { border: 1px solid #e4dbd1; border-radius: 9px; background: #fff; overflow: hidden; }
            .bulk-import-row-main { display: flex; align-items: center; gap: 8px; padding: 9px 10px; cursor: pointer; }
            .bulk-import-row-main input { flex: 0 0 auto; }
            .bulk-import-kind { flex: 0 0 auto; padding: 2px 7px; border-radius: 999px; background: #eee7de; color: #684b32; font-size: .75em; font-weight: 700; }
            .bulk-import-row-text { min-width: 0; display: grid; gap: 2px; flex: 1; }
            .bulk-import-row-text strong, .bulk-import-row-text small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            .bulk-import-row-text small { color: #777; }
            .bulk-import-duplicate { flex: 0 0 auto; color: #9a6700; background: #fff4ce; border-radius: 999px; padding: 2px 7px; font-size: .72em; }
            .bulk-import-json-details { border-top: 1px solid #eee; padding: 7px 10px; background: #fafafa; }
            .bulk-import-json-details summary { cursor: pointer; color: #666; font-size: .8em; }
            .bulk-import-json-details textarea { width: 100%; min-height: 120px; margin-top: 6px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 13px !important; }
            .bulk-import-json-details button { margin-top: 5px; padding: 5px 9px; border: 1px solid #ccc; border-radius: 6px; background: #fff; cursor: pointer; }
            .bulk-import-bottom-actions { position: sticky; bottom: -16px; margin: 12px -16px -16px; padding: 10px 16px max(10px, env(safe-area-inset-bottom)); background: rgba(255,255,255,.96); border-top: 1px solid #eee; }
            @media (max-width: 700px) {
                #bulk-add-btn { right: 82px; bottom: 30px; width: 56px; height: 36px; }
                .bulk-import-modal { width: 96vw; max-height: 94vh; padding: 12px; }
                .bulk-import-actions-top > button { flex: 1; }
                .bulk-import-input { min-height: 145px; max-height: 28vh; }
                .bulk-import-review { max-height: 34vh; }
                .bulk-import-row-text strong, .bulk-import-row-text small { white-space: normal; }
                .bulk-import-bottom-actions { bottom: -12px; margin: 10px -12px -12px; padding-left: 12px; padding-right: 12px; }
            }`;
        document.head.appendChild(style);
    }

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal()?.classList.contains('show')) closeBulkImport();
    });

    function initBulkImport() {
        injectStyle();
        createBulkModal();
        createBulkButton();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBulkImport);
    else initBulkImport();

    window.openBulkImport = openBulkImport;
    window.buildSmartReaderBulkAiPrompt = buildAiPrompt;
})();