/* A small, optional sample for Mandarin-learning Workspaces.
   Do not seed on page loads: otherwise deleting one's last article would recreate it. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SmartReaderWorkspaceSamples = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const SAMPLE_KEY = 'chinese-mandarin-intro-v1';
    const INITIALIZED_SUFFIX = ':mandarin-sample-initialized-v1';
    const LEGACY_ARCHIVE_SUFFIX = ':legacy-english-samples-backup-v1';

    function initializedKey(workspace) {
        return 'workspace:' + String(workspace.id) + INITIALIZED_SUFFIX;
    }

    function legacyArchiveKey(workspace) {
        return 'workspace:' + String(workspace.id) + LEGACY_ARCHIVE_SUFFIX;
    }

    function isChineseWorkspace(workspace) {
        return workspace?.kind === 'language'
            && /^zh(?:-|$)/i.test(String(workspace.contentLanguage || ''));
    }

    function createChineseSample(workspace, now = Date.now()) {
        if (!isChineseWorkspace(workspace)) return [];
        const base = Math.floor(Number.isFinite(now) ? now : Date.now()) * 1000;
        const folderId = base + 1;
        const articleId = base + 2;
        const passage = [
            '今天下午，我第一次去学校附近的图书馆。图书馆很安静，里面有很多中文书。',
            '我想学习中文，所以找了一本有趣的故事书。我每天读一点儿，还会练习说中文。',
            '刚开始的时候，我觉得有些词很难。可是慢慢地，我发现学习语言也可以很快乐。'
        ].join('\n\n');
        const vocabulary = [
            ['图书馆', 'tú shū guǎn', '図書館'],
            ['安静', 'ān jìng', '静かである'],
            ['学习', 'xué xí', '学ぶ・勉強する'],
            ['有趣', 'yǒu qù', '面白い'],
            ['练习', 'liàn xí', '練習する'],
            ['发现', 'fā xiàn', '気づく・発見する'],
            ['语言', 'yǔ yán', '言語'],
            ['快乐', 'kuài lè', '楽しい']
        ];
        const words = vocabulary.map(([word, pinyin, meaning], index) => ({
            id: base + 100 + index,
            word,
            surfaceText: word,
            meaning,
            memorized: false,
            annotations: [{
                id: 'pinyin',
                category: 'reading',
                system: 'pinyin',
                value: pinyin,
                learnable: true,
                display: 'ruby'
            }],
            createdAt: Math.floor(base / 1000)
        }));

        return [
            { id: folderId, type: 'folder', name: '📗 中文サンプル', parentId: null, sampleKey: SAMPLE_KEY },
            {
                id: articleId,
                type: 'article',
                parentId: folderId,
                name: '第一次去图书馆（初めて図書館へ）',
                content: passage,
                words,
                notes: [
                    {
                        id: base + 201,
                        originalText: '我想学习中文，所以找了一本有趣的故事书。',
                        translation: '私は中国語を勉強したいので、面白い物語の本を一冊探しました。',
                        extra: '「想＋動詞」は「～したい」。「所以」は「だから・そのため」を表します。'
                    },
                    {
                        id: base + 202,
                        originalText: '我每天读一点儿，还会练习说中文。',
                        translation: '私は毎日少しずつ読み、さらに中国語を話す練習もします。',
                        extra: '「每天」は「毎日」。「一点儿」は「少し」を意味します。'
                    }
                ],
                questions: [],
                bookmarks: [],
                sampleKey: SAMPLE_KEY
            }
        ];
    }

    function hasChineseSample(items) {
        return Array.isArray(items) && items.some(item => item?.sampleKey === SAMPLE_KEY);
    }

    async function seedNewChineseWorkspace(database, workspace, { initialSetup = false } = {}) {
        if (!isChineseWorkspace(workspace)) return false;
        if (!database || typeof database.getItem !== 'function' || typeof database.setItem !== 'function') {
            throw new TypeError('Workspace sample seeding needs a storage adapter.');
        }
        const key = initialSetup ? 'library_items' : workspace.libraryKey;
        if (!key) throw new Error('Missing Workspace library key');
        const existing = await database.getItem(key);
        // Only new, empty Workspace libraries are seeded. Existing data is never replaced.
        if (existing !== null && (!Array.isArray(existing) || existing.length > 0)) return false;
        await database.setItem(key, createChineseSample(workspace));
        await database.setItem(initializedKey(workspace), true);
        return true;
    }

    // Recognize only the known, unmodified stock article text, never arbitrary English
    // articles or a user's content. Extra learning data on a stock article is retained
    // in the full backup before the item is hidden from this Workspace.
    function isStockArticle(item, stockItems) {
        if (!item || item.type !== 'article' || !Array.isArray(stockItems)) return false;
        const original = stockItems.find(sample =>
            sample?.type === 'article' && String(sample.id) === String(item.id));
        return !!original
            && item.name === original.name
            && item.content === original.content
            && String(item.parentId) === String(original.parentId);
    }

    function isStockFolder(item, stockItems) {
        if (!item || item.type !== 'folder' || !Array.isArray(stockItems)) return false;
        return stockItems.some(original => original?.type === 'folder'
            && String(original.id) === String(item.id)
            && original.name === item.name
            && String(original.parentId) === String(item.parentId));
    }

    function stripLegacyEnglishSamples(items, stockItems) {
        const original = Array.isArray(items) ? items : [];
        const removedArticles = original.filter(item => isStockArticle(item, stockItems));
        const remaining = original.filter(item => !removedArticles.includes(item));
        const removedFolders = remaining.filter(item => isStockFolder(item, stockItems)
            && !remaining.some(child => String(child.parentId) === String(item.id)));
        return {
            kept: remaining.filter(item => !removedFolders.includes(item)),
            removed: [...removedArticles, ...removedFolders]
        };
    }

    // One-time repair for Workspaces created before sample auto-seeding existed.
    // Only the active Chinese Workspace is repaired; other Workspaces are untouched.
    // The marker prevents deleted Chinese samples from reappearing on every launch.
    async function repairActiveChineseWorkspace(database, workspace, stockItems = []) {
        if (!isChineseWorkspace(workspace) || workspace.setupPending) return null;
        if (!database || typeof database.getItem !== 'function' || typeof database.setItem !== 'function') {
            throw new TypeError('Chinese Workspace repair needs a storage adapter.');
        }
        const stored = await database.getItem('library_items');
        if (stored !== null && !Array.isArray(stored)) return null;
        const original = Array.isArray(stored) ? stored : [];
        const { kept, removed } = stripLegacyEnglishSamples(original, stockItems);
        const wasInitialized = await database.getItem(initializedKey(workspace)) === true;
        // Existing Chinese Workspaces created before this feature also receive
        // one Mandarin example, even if they already contain user articles.
        const shouldSeed = !wasInitialized && !hasChineseSample(kept);
        const next = shouldSeed ? [...kept, ...createChineseSample(workspace)] : kept;

        if (removed.length > 0) {
            // Archive the entire previous library, including user annotations and notes.
            // Never overwrite an earlier repair backup.
            if (await database.getItem(legacyArchiveKey(workspace)) === null) {
                await database.setItem(legacyArchiveKey(workspace), original);
            }
        }
        if (removed.length > 0 || shouldSeed) {
            await database.setItem('library_items', next);
        }
        if (!wasInitialized) await database.setItem(initializedKey(workspace), true);
        return next;
    }

    return Object.freeze({
        SAMPLE_KEY, isChineseWorkspace, createChineseSample, hasChineseSample,
        seedNewChineseWorkspace, stripLegacyEnglishSamples, repairActiveChineseWorkspace,
        initializedKey, legacyArchiveKey
    });
});
