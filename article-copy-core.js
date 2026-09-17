(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SmartReaderArticleCopy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function deepClone(value) {
        if (typeof structuredClone === 'function') return structuredClone(value);
        return JSON.parse(JSON.stringify(value));
    }

    function createIdFactory(now = Date.now()) {
        let sequence = 0;
        return prefix => `${prefix}-${Number(now).toString(36)}-${(++sequence).toString(36)}`;
    }

    function updateChapterReferences(value, chapterMap) {
        if (!value || typeof value !== 'object') return value;
        if (Array.isArray(value)) {
            value.forEach(item => updateChapterReferences(item, chapterMap));
            return value;
        }
        for (const [key, child] of Object.entries(value)) {
            if ((key === 'chapterId' || key === 'chapterID') && child !== null && child !== undefined) {
                const mapped = chapterMap.get(String(child));
                if (mapped !== undefined) value[key] = mapped;
            } else if (child && typeof child === 'object') {
                updateChapterReferences(child, chapterMap);
            }
        }
        return value;
    }

    function resetWordLearningState(word) {
        if (!word || typeof word !== 'object') return word;
        delete word.study;
        word.memorized = false;
        delete word.lastReviewedAt;
        delete word.nextReviewAt;
        delete word.reviewDueAt;
        return word;
    }

    function resetQuestionLearningState(question) {
        if (!question || typeof question !== 'object') return question;
        question.attempts = [];
        question.needsReview = false;
        delete question.lastAnsweredAt;
        delete question.lastResult;
        return question;
    }

    function hasOwn(object, key) {
        return Object.prototype.hasOwnProperty.call(object || {}, key);
    }

    function sameId(left, right) {
        if (left === null || left === undefined || right === null || right === undefined) {
            return left === right;
        }
        return String(left) === String(right);
    }

    function cloneArticleForWorkspace(sourceArticle, options = {}) {
        if (!sourceArticle || typeof sourceArticle !== 'object' || sourceArticle.type !== 'article') {
            throw new TypeError('An article is required.');
        }
        const now = Number.isFinite(options.now) ? options.now : Date.now();
        const idFactory = typeof options.idFactory === 'function' ? options.idFactory : createIdFactory(now);
        const copy = deepClone(sourceArticle);
        const sourceArticleId = sourceArticle.id;

        copy.id = idFactory('article');
        copy.parentId = hasOwn(options, 'parentId') ? options.parentId : null;
        copy.createdAt = now;
        copy.updatedAt = now;
        copy.copiedFrom = {
            articleId: sourceArticleId,
            copiedAt: now
        };
        delete copy.readingPosition;
        delete copy.readingPositions;
        delete copy.lastReadAt;
        delete copy.lastOpenedAt;

        const chapterMap = new Map();
        if (Array.isArray(copy.chapters)) {
            copy.chapters = copy.chapters.map(chapter => {
                if (!chapter || typeof chapter !== 'object') return chapter;
                const oldId = chapter.id;
                const next = { ...chapter, id: idFactory('chapter') };
                if (oldId !== null && oldId !== undefined) chapterMap.set(String(oldId), next.id);
                delete next.readingPosition;
                delete next.readingPositions;
                return next;
            });
        }

        const cloneEntityList = (list, prefix, transform) => Array.isArray(list)
            ? list.map(item => {
                if (!item || typeof item !== 'object') return item;
                const next = { ...item, id: idFactory(prefix) };
                updateChapterReferences(next, chapterMap);
                return transform ? transform(next) : next;
            })
            : [];

        copy.words = cloneEntityList(copy.words, 'word', resetWordLearningState);
        copy.notes = cloneEntityList(copy.notes, 'note');
        copy.bookmarks = cloneEntityList(copy.bookmarks, 'bookmark');
        copy.questions = cloneEntityList(copy.questions, 'question', resetQuestionLearningState);

        updateChapterReferences(copy, chapterMap);
        return copy;
    }

    function clonePlainLibraryItem(sourceItem, parentId, now, idFactory) {
        const copy = deepClone(sourceItem);
        const prefix = sourceItem?.type === 'folder' ? 'folder' : (sourceItem?.type || 'item');
        copy.id = idFactory(prefix);
        copy.parentId = parentId;
        copy.createdAt = now;
        copy.updatedAt = now;
        copy.copiedFrom = {
            itemId: sourceItem?.id,
            copiedAt: now
        };
        delete copy.readingPosition;
        delete copy.readingPositions;
        delete copy.lastReadAt;
        delete copy.lastOpenedAt;
        return copy;
    }

    function cloneLibraryItemTree(sourceLibrary, sourceItemId, options = {}) {
        if (!Array.isArray(sourceLibrary)) throw new TypeError('A library array is required.');
        const source = sourceLibrary.find(item => sameId(item?.id, sourceItemId));
        if (!source) throw new Error('Source library item not found.');

        const now = Number.isFinite(options.now) ? options.now : Date.now();
        const idFactory = typeof options.idFactory === 'function' ? options.idFactory : createIdFactory(now);
        const rootParentId = hasOwn(options, 'parentId') ? options.parentId : null;
        const copies = [];

        function cloneNode(item, parentId) {
            const copy = item?.type === 'article'
                ? cloneArticleForWorkspace(item, { now, idFactory, parentId })
                : clonePlainLibraryItem(item, parentId, now, idFactory);
            copies.push(copy);

            if (item?.type === 'folder') {
                sourceLibrary
                    .filter(child => sameId(child?.parentId, item.id))
                    .forEach(child => cloneNode(child, copy.id));
            }
            return copy;
        }

        const rootItem = cloneNode(source, rootParentId);
        return { rootItem, items: copies };
    }

    function resolveWorkspaceLibraryKey(workspace, activeWorkspaceId) {
        if (!workspace) return null;
        if (workspace.id === activeWorkspaceId) return 'library_items';
        return workspace.libraryKey || `workspace:${workspace.id}:library_items`;
    }

    async function readCopyTarget(database, workspaceApi, targetWorkspaceId, options = {}) {
        if (!database || typeof database.getItem !== 'function' || typeof database.setItem !== 'function') {
            throw new TypeError('A LocalForage-compatible database instance is required.');
        }
        if (!workspaceApi || typeof workspaceApi.readWorkspaceState !== 'function') {
            throw new TypeError('Workspace API is required.');
        }
        const state = await workspaceApi.readWorkspaceState(database);
        const target = (state.workspaces || []).find(item => item.id === targetWorkspaceId);
        if (!target) throw new Error('Target workspace not found.');
        if (target.id === state.activeWorkspaceId && options.allowCurrent !== true) {
            throw new Error('Copying to the current workspace is not allowed.');
        }
        const libraryKey = resolveWorkspaceLibraryKey(target, state.activeWorkspaceId);
        const existing = target.id === state.activeWorkspaceId && Array.isArray(options.activeLibrary)
            ? options.activeLibrary
            : await database.getItem(libraryKey);
        return {
            state,
            target,
            libraryKey,
            targetLibrary: Array.isArray(existing) ? existing.slice() : []
        };
    }

    async function copyArticleToWorkspace(database, workspaceApi, sourceArticle, targetWorkspaceId, options = {}) {
        const targetInfo = await readCopyTarget(database, workspaceApi, targetWorkspaceId, options);
        const copy = cloneArticleForWorkspace(sourceArticle, {
            ...options,
            parentId: hasOwn(options, 'targetParentId') ? options.targetParentId : null
        });
        targetInfo.targetLibrary.push(copy);
        await database.setItem(targetInfo.libraryKey, targetInfo.targetLibrary);
        return {
            article: copy,
            workspace: targetInfo.target,
            libraryKey: targetInfo.libraryKey,
            library: targetInfo.targetLibrary
        };
    }

    async function copyLibraryItemToWorkspace(database, workspaceApi, sourceLibrary, sourceItemId, targetWorkspaceId, options = {}) {
        const targetInfo = await readCopyTarget(database, workspaceApi, targetWorkspaceId, options);
        const cloned = cloneLibraryItemTree(sourceLibrary, sourceItemId, {
            ...options,
            parentId: hasOwn(options, 'targetParentId') ? options.targetParentId : null
        });
        targetInfo.targetLibrary.push(...cloned.items);
        await database.setItem(targetInfo.libraryKey, targetInfo.targetLibrary);
        return {
            ...cloned,
            workspace: targetInfo.target,
            libraryKey: targetInfo.libraryKey,
            library: targetInfo.targetLibrary
        };
    }

    return Object.freeze({
        deepClone,
        createIdFactory,
        updateChapterReferences,
        resetWordLearningState,
        resetQuestionLearningState,
        cloneArticleForWorkspace,
        cloneLibraryItemTree,
        resolveWorkspaceLibraryKey,
        copyArticleToWorkspace,
        copyLibraryItemToWorkspace
    });
});
