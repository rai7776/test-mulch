(function () {
    'use strict';

    const IGNORED_HTML_TAGS = new Set([
        'script', 'style', 'noscript', 'template', 'iframe', 'object', 'embed', 'canvas'
    ]);
    const HTML_BLOCK_LEAF_TAGS = new Set([
        'address', 'blockquote', 'dd', 'dt', 'figcaption', 'figure', 'li',
        'p', 'pre', 'td', 'th'
    ]);
    const EPUB_TEXT_MEDIA_TYPES = new Set([
        'application/xhtml+xml', 'text/html', 'application/xml'
    ]);
    const CHAPTER_NUMBER_WORDS = [
        'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
        'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
        'seventeen', 'eighteen', 'nineteen', 'twenty'
    ];

    class SmartReaderImportError extends Error {
        constructor(code, message) {
            super(message);
            this.name = 'SmartReaderImportError';
            this.code = code;
        }
    }

    function stripExtension(name) {
        return String(name || '').replace(/\.[^/.]+$/, '') || '無題';
    }

    function normalizeInlineText(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function normalizePlainText(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\r\n?/g, '\n')
            .split('\n')
            .map(line => line.replace(/[ \t]+/g, ' ').trim())
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function normalizeImportedContent(value, sourceType) {
        if (String(sourceType || '').toLowerCase() !== 'txt') {
            return normalizePlainText(value);
        }
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\r\n?/g, '\n')
            .split('\n')
            .map(line => line.replace(/[ \t]+$/g, ''))
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function getHtmlNodeText(node) {
        if (!node) return '';
        if (node.nodeType === Node.TEXT_NODE) {
            return String(node.nodeValue || '').replace(/\s+/g, ' ');
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return '';
        const tagName = String(node.tagName || '').toLowerCase();
        if (IGNORED_HTML_TAGS.has(tagName)) return '';
        if (tagName === 'br') return '\n';
        return Array.from(node.childNodes || []).map(getHtmlNodeText).join('');
    }

    function normalizeHtmlBlockText(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .split('\n')
            .map(line => line.replace(/[ \t]+/g, ' ').trim())
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function hasMeaningfulText(value) {
        const text = normalizePlainText(value);
        return /[A-Za-z0-9\u3040-\u30ff\u3400-\u9fff]/.test(text) && text.length >= 20;
    }

    function mergeChapterContent(chapter, addition) {
        if (!chapter) return;
        const current = normalizePlainText(chapter.content);
        const extra = normalizePlainText(addition);
        if (!extra) return;
        chapter.content = normalizePlainText([current, extra].filter(Boolean).join('\n\n'));
    }

    function getResidualChapterTitle(blocks, fallback = 'Front Matter') {
        const list = Array.isArray(blocks) ? blocks : [];
        const residualText = normalizeInlineText(list.map(block => block?.text || '').join(' '));
        if (/full\s+license/i.test(residualText)) return 'Project Gutenberg License';
        const heading = list
            .find(block => block.type === 'heading' && normalizeInlineText(block.text));
        return normalizeInlineText(heading?.text) || fallback;
    }

    function isLikelyEpubContinuation(blocks) {
        const text = normalizeInlineText((Array.isArray(blocks) ? blocks : [])
            .map(block => block?.text || '')
            .join(' '));
        if (!text) return false;
        if ((Array.isArray(blocks) ? blocks : []).some(block => block.type === 'heading')) {
            return false;
        }
        return !/(?:start:\s*full\s+license|end\s+of\s+the\s+project\s+gutenberg\s+ebook|project\s+gutenberg(?:™|\u2122)?\s+license|full\s+license)/i.test(text);
    }

    function stableHash(value) {
        let hash = 2166136261;
        const text = String(value || '');
        for (let index = 0; index < text.length; index += 1) {
            hash ^= text.charCodeAt(index);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function normalizeStableKey(value) {
        return String(value || '')
            .normalize('NFKC')
            .trim()
            .replace(/\s+/g, ' ')
            .toLowerCase();
    }

    function generateStableChapterId(options = {}) {
        const sourceType = normalizeStableKey(options.sourceType || 'text') || 'text';
        const sourceKey = normalizeStableKey(options.sourceKey || '');
        const title = normalizeStableKey(options.title || '');
        const index = Number.isFinite(Number(options.index)) ? Number(options.index) : 0;
        const seed = [sourceType, sourceKey, index, title].join('|');
        return sourceType + '-chapter-' + stableHash(seed);
    }

    function makeChapterDraft(options = {}) {
        const title = normalizeInlineText(options.title) || '本文';
        const sourceType = options.sourceType || 'text';
        const content = normalizeImportedContent(options.content, sourceType);
        const sourceKey = options.sourceKey || options.sourceName || 'document';
        const index = Number.isFinite(Number(options.index)) ? Number(options.index) : 0;
        const chapter = {
            id: generateStableChapterId({ sourceType, sourceKey, index, title }),
            title,
            content,
            order: Number.isFinite(Number(options.order)) ? Number(options.order) : index
        };
        if (options.sourceHref) chapter.sourceHref = String(options.sourceHref);
        if (options.fragment !== undefined && options.fragment !== null) {
            chapter.fragment = String(options.fragment);
        }
        if (options.rangeKey) chapter.rangeKey = String(options.rangeKey);
        return chapter;
    }

    function getChapterIdentity(chapter) {
        if (!chapter || typeof chapter !== 'object') return null;
        const id = normalizeStableKey(chapter.id);
        const sourceHref = normalizeStableKey(chapter.sourceHref);
        const fragment = normalizeStableKey(chapter.fragment);
        const target = sourceHref && fragment ? sourceHref + '#' + fragment : '';
        const rangeKey = normalizeStableKey(chapter.rangeKey);
        return { id, target, rangeKey };
    }

    function normalizeImportedDocument(options = {}) {
        const sourceType = options.sourceType || 'text';
        const sourceName = options.sourceName || 'document';
        const rawChapters = Array.isArray(options.chapters) ? options.chapters : [];
        const seenIds = new Set();
        const seenTargets = new Set();
        const seenRanges = new Set();
        const uniqueRawChapters = rawChapters
            .filter(chapter => chapter && typeof chapter === 'object')
            .filter(chapter => {
                const identity = getChapterIdentity(chapter);
                if (!identity) return false;
                if (identity.id && seenIds.has(identity.id)) return false;
                if (identity.target && seenTargets.has(identity.target)) return false;
                if (identity.rangeKey && seenRanges.has(identity.rangeKey)) return false;
                if (identity.id) seenIds.add(identity.id);
                if (identity.target) seenTargets.add(identity.target);
                if (identity.rangeKey) seenRanges.add(identity.rangeKey);
                return true;
            });
        const chapters = uniqueRawChapters
            .map((chapter, index) => makeChapterDraft({
                sourceType,
                sourceKey: chapter.sourceKey || sourceName,
                index,
                order: chapter.order,
                title: chapter.title,
                content: chapter.content,
                sourceHref: chapter.sourceHref,
                fragment: chapter.fragment,
                rangeKey: chapter.rangeKey
            }))
            .sort((a, b) => a.order - b.order)
            .map((chapter, index) => ({ ...chapter, order: index }));

        if (!chapters.length) {
            chapters.push(makeChapterDraft({
                sourceType,
                sourceKey: sourceName,
                index: 0,
                order: 0,
                title: '本文',
                content: ''
            }));
        }

        return {
            title: normalizeInlineText(options.title) || stripExtension(sourceName),
            sourceType,
            sourceName,
            chapters,
            warnings: Array.isArray(options.warnings) ? options.warnings.filter(Boolean) : []
        };
    }

    function makeTextReader() {
        return function readFileText(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = event => resolve(String(event.target.result || ''));
                reader.onerror = () => reject(new SmartReaderImportError(
                    'FILE_READ_FAILED',
                    'ファイルを読み込めませんでした。'
                ));
                reader.readAsText(file, 'UTF-8');
            });
        };
    }

    const readFileText = makeTextReader();

    function isChapterHeadingLine(value) {
        const text = normalizeInlineText(value);
        if (!text || text.length > 120) return false;
        const numberPattern = '(?:\\d+|[ivxlcdm]+|' + CHAPTER_NUMBER_WORDS.join('|') + ')';
        const numbered = new RegExp(
            '^(?:chapter|part)\\s+' + numberPattern + '(?:\\s*[-:.)]\\s*[^\\s].*)?$',
            'i'
        );
        const named = /^(?:introduction|preface|prologue|epilogue|conclusion)(?:\s*[-:]\s*[^\s].*)?$/i;
        return numbered.test(text) || named.test(text);
    }

    function normalizeTxtLines(text) {
        return String(text || '').replace(/\r\n?/g, '\n').split('\n');
    }

    function isTxtListLine(line) {
        return /^\s*(?:[-*+•]\s+|\d+[.)]\s+|[A-Za-z][.)]\s+)/.test(line);
    }

    function isTxtTableLine(line) {
        return /\t/.test(line)
            || /\|/.test(line)
            || /\S\s{2,}\S\s{2,}\S/.test(line);
    }

    function isTxtAsciiLine(line) {
        return /^[\s|+*=/_\\-]{4,}$/.test(line.trim());
    }

    function isTxtStructuredBlock(lines) {
        const nonEmpty = lines.filter(line => line.trim());
        if (!nonEmpty.length) return false;
        if (nonEmpty.some(line => /^\s{2,}\S/.test(line)
            || isTxtListLine(line)
            || isTxtTableLine(line)
            || isTxtAsciiLine(line))) {
            return true;
        }
        return nonEmpty.length >= 4 && nonEmpty.every(line => line.trim().length <= 32);
    }

    function reflowTxtLines(lines) {
        const paragraphs = [];
        let current = [];
        const flush = () => {
            if (!current.length) return;
            if (isTxtStructuredBlock(current)) {
                paragraphs.push(current
                    .map(line => line.replace(/[ \t]+$/g, ''))
                    .join('\n'));
            } else {
                paragraphs.push(current.map(normalizeInlineText).filter(Boolean).join(' '));
            }
            current = [];
        };

        (Array.isArray(lines) ? lines : []).forEach(line => {
            if (!String(line).trim()) {
                flush();
            } else {
                current.push(String(line));
            }
        });
        flush();
        return paragraphs
            .filter(Boolean)
            .join('\n\n')
            .replace(/\r\n?/g, '\n')
            .split('\n')
            .map(line => line.replace(/[ \t]+$/g, ''))
            .join('\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function splitTextIntoChapters(text, options = {}) {
        const lines = normalizeTxtLines(text);
        const headings = [];
        lines.forEach((line, index) => {
            const title = normalizeInlineText(line);
            if (isChapterHeadingLine(title)) headings.push({ index, title });
        });

        const sourceType = options.sourceType || 'txt';
        const sourceName = options.sourceName || 'document.txt';
        const chapters = [];
        if (!headings.length) {
            chapters.push({
                title: '本文',
                content: reflowTxtLines(lines),
                sourceKey: sourceName,
                order: 0
            });
            return chapters;
        }

        const prelude = reflowTxtLines(lines.slice(0, headings[0].index));
        if (prelude) {
            chapters.push({
                title: '本文',
                content: prelude,
                sourceKey: sourceName + '|prelude',
                order: chapters.length
            });
        }

        headings.forEach((heading, headingIndex) => {
            const nextIndex = headings[headingIndex + 1]?.index ?? lines.length;
            chapters.push({
                title: heading.title,
                content: reflowTxtLines(lines.slice(heading.index + 1, nextIndex)),
                sourceKey: sourceName + '|heading-' + heading.index,
                order: chapters.length
            });
        });

        return chapters;
    }

    async function parseTxtImport(file) {
        const text = await readFileText(file);
        if (!normalizePlainText(text)) {
            throw new SmartReaderImportError('TXT_NO_TEXT', 'TXTファイルに本文がありません。');
        }
        const sourceName = file.name || 'document.txt';
        return normalizeImportedDocument({
            title: stripExtension(sourceName),
            sourceType: 'txt',
            sourceName,
            chapters: splitTextIntoChapters(text, { sourceType: 'txt', sourceName })
        });
    }

    function removeUnsafeHtmlNodes(document) {
        Array.from(document.querySelectorAll('*')).forEach(element => {
            const tagName = String(element.tagName || '').toLowerCase();
            if (IGNORED_HTML_TAGS.has(tagName)) {
                element.remove();
                return;
            }
            Array.from(element.attributes || []).forEach(attribute => {
                if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
            });
        });
    }

    function chooseHtmlContentRoot(document) {
        const body = document.body || document.documentElement;
        if (!body) return document.documentElement;
        const bodyLength = normalizePlainText(body.textContent).length;
        const findCandidate = selector => Array.from(document.querySelectorAll(selector))
            .map(element => ({
                element,
                length: normalizePlainText(element.textContent).length
            }))
            .filter(candidate => candidate.length > 0)
            .sort((a, b) => b.length - a.length)[0];

        const articleCandidate = findCandidate('article');
        const mainCandidate = findCandidate('main');
        const isUsable = candidate => candidate
            && (bodyLength <= 300 || candidate.length >= Math.max(80, bodyLength * 0.2));
        if (isUsable(articleCandidate)) return articleCandidate.element;
        if (isUsable(mainCandidate)) return mainCandidate.element;
        return body;
    }

    function extractHtmlBlocks(root) {
        const blocks = [];

        function appendText(type, text, level, element) {
            const normalized = normalizeHtmlBlockText(text);
            if (!normalized) return;
            const block = level
                ? { type, level, text: normalized }
                : { type, text: normalized };
            if (element) block.element = element;
            blocks.push(block);
        }

        function walkContainer(container) {
            let directText = '';
            const flushDirectText = () => {
                if (directText) appendText('paragraph', directText, undefined, container);
                directText = '';
            };

            Array.from(container.childNodes || []).forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    directText += getHtmlNodeText(node);
                    return;
                }
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                const element = node;
                const tagName = String(element.tagName || '').toLowerCase();
                if (IGNORED_HTML_TAGS.has(tagName)) return;
                if (/^h[1-6]$/.test(tagName)) {
                    flushDirectText();
                    appendText('heading', getHtmlNodeText(element), Number(tagName.substring(1)), element);
                    return;
                }
                if (HTML_BLOCK_LEAF_TAGS.has(tagName)) {
                    flushDirectText();
                    appendText('paragraph', getHtmlNodeText(element), undefined, element);
                    return;
                }
                if (tagName === 'br') {
                    directText += getHtmlNodeText(element);
                    return;
                }

                const hasBlockChild = Array.from(element.children || []).some(child => {
                    const childTag = String(child.tagName || '').toLowerCase();
                    return /^h[1-6]$/.test(childTag)
                        || HTML_BLOCK_LEAF_TAGS.has(childTag)
                        || ['div', 'section', 'article', 'main', 'header', 'footer', 'ul', 'ol'].includes(childTag);
                });
                if (hasBlockChild) {
                    flushDirectText();
                    walkContainer(element);
                } else {
                    directText += getHtmlNodeText(element);
                }
            });
            flushDirectText();
        }

        walkContainer(root);
        return blocks;
    }

    function extractHtmlDocumentParts(html) {
        const document = new DOMParser().parseFromString(String(html || ''), 'text/html');
        removeUnsafeHtmlNodes(document);
        const root = chooseHtmlContentRoot(document);
        const blocks = extractHtmlBlocks(root);
        const headingTitle = blocks.find(block => block.type === 'heading' && block.level <= 2)?.text || '';
        const plainText = normalizePlainText(blocks.map(block => block.text).join('\n\n'));
        return {
            document,
            root,
            blocks,
            headingTitle,
            documentTitle: normalizeInlineText(document.title),
            plainText
        };
    }

    function splitHtmlBlocksIntoChapters(parts, options = {}) {
        const blocks = Array.isArray(parts.blocks) ? parts.blocks : [];
        const strongHeadings = blocks.filter(block => block.type === 'heading' && block.level <= 2);
        const h3Headings = blocks.filter(block => block.type === 'heading' && block.level === 3);
        const headingLevels = strongHeadings.length ? new Set([1, 2]) : (h3Headings.length >= 2 ? new Set([3]) : new Set());
        const sourceType = options.sourceType || 'html';
        const sourceKey = options.sourceKey || options.sourceName || 'document.html';
        const chapters = [];
        let current = null;
        let prelude = [];

        const pushCurrent = () => {
            if (!current) return;
            chapters.push({
                title: current.title,
                content: current.parts.join('\n\n'),
                sourceKey: current.sourceKey,
                order: chapters.length
            });
            current = null;
        };

        blocks.forEach((block, index) => {
            const isSelectedHeading = block.type === 'heading' && headingLevels.has(block.level);
            if (isSelectedHeading) {
                if (current) {
                    pushCurrent();
                } else if (prelude.length) {
                    chapters.push({
                        title: '本文',
                        content: prelude.join('\n\n'),
                        sourceKey: sourceKey + '|prelude',
                        order: chapters.length
                    });
                    prelude = [];
                }
                current = {
                    title: block.text,
                    parts: [],
                    sourceKey: sourceKey + '|heading-' + index
                };
                return;
            }
            if (current) current.parts.push(block.text);
            else prelude.push(block.text);
        });
        pushCurrent();

        if (!chapters.length) {
            chapters.push({
                title: '本文',
                content: parts.plainText,
                sourceKey,
                order: 0
            });
        }
        return chapters;
    }

    async function parseHtmlImport(file) {
        const html = await readFileText(file);
        const parts = extractHtmlDocumentParts(html);
        if (!parts.plainText) {
            throw new SmartReaderImportError('HTML_NO_TEXT', 'HTML本文から読み取れるテキストがありません。');
        }
        const sourceName = file.name || 'document.html';
        return normalizeImportedDocument({
            title: parts.headingTitle || parts.documentTitle || stripExtension(sourceName),
            sourceType: 'html',
            sourceName,
            chapters: splitHtmlBlocksIntoChapters(parts, {
                sourceType: 'html',
                sourceName,
                sourceKey: sourceName
            })
        });
    }

    function pdfItemsToLines(items, pageNumber) {
        const positionedItems = (Array.isArray(items) ? items : [])
            .map(item => {
                const transform = Array.isArray(item.transform) ? item.transform : [];
                const fontSize = Math.max(
                    1,
                    Math.abs(Number(item.height) || 0),
                    Math.hypot(Number(transform[0]) || 0, Number(transform[1]) || 0)
                );
                return {
                    text: String(item.str || ''),
                    x: Number(transform[4]) || 0,
                    y: Number(transform[5]) || 0,
                    width: Math.abs(Number(item.width) || 0),
                    fontSize,
                    page: pageNumber
                };
            })
            .filter(item => item.text.trim());

        positionedItems.sort((a, b) => {
            if (Math.abs(a.y - b.y) > 2) return b.y - a.y;
            return a.x - b.x;
        });

        const lines = [];
        positionedItems.forEach(item => {
            const tolerance = Math.max(2, item.fontSize * 0.35);
            let line = lines[lines.length - 1];
            if (!line || Math.abs(line.y - item.y) > tolerance) {
                line = { page: pageNumber, y: item.y, x: item.x, fontSize: item.fontSize, items: [] };
                lines.push(line);
            }
            line.items.push(item);
            line.x = Math.min(line.x, item.x);
            line.fontSize = Math.max(line.fontSize, item.fontSize);
        });

        return lines.map(line => {
            line.items.sort((a, b) => a.x - b.x);
            let text = '';
            let previous = null;
            line.items.forEach(item => {
                const itemText = item.text.trim();
                if (!itemText) return;
                if (previous) {
                    const gap = item.x - (previous.x + previous.width);
                    const startsWithPunctuation = /^[,.;:!?%)\]}]/.test(itemText);
                    const previousEndsWithPunctuation = /[(\[{\/-]$/.test(previous.text);
                    if (gap > Math.max(1, line.fontSize * 0.15)
                        && !startsWithPunctuation
                        && !previousEndsWithPunctuation) {
                        text += ' ';
                    }
                }
                text += itemText;
                previous = item;
            });
            return {
                page: line.page,
                y: line.y,
                x: line.x,
                fontSize: line.fontSize,
                text: normalizeInlineText(text)
            };
        }).filter(line => line.text);
    }

    function shouldStartPdfParagraph(previousLine, line) {
        if (!previousLine || previousLine.page !== line.page) return false;
        const fontSize = Math.max(previousLine.fontSize, line.fontSize, 1);
        const verticalGap = Math.abs(previousLine.y - line.y);
        if (verticalGap > fontSize * 1.45) return true;
        const indentChange = line.x - previousLine.x;
        return indentChange > Math.max(12, fontSize * 1.5) && /^[A-Z]/.test(line.text);
    }

    function joinPdfLines(previousText, nextText) {
        if (/[A-Za-z]-$/.test(previousText) && /^[a-z]/.test(nextText)) {
            return previousText.slice(0, -1) + nextText;
        }
        return (previousText + ' ' + nextText).trim();
    }

    function pdfLinesToChapters(lines, sourceName) {
        const chapterDrafts = [];
        let currentChapter = null;
        let paragraph = '';
        let previousLine = null;

        const ensureChapter = line => {
            if (!currentChapter) {
                currentChapter = {
                    title: '本文',
                    sourceKey: sourceName + '|page-' + (line?.page || 1),
                    parts: []
                };
            }
        };
        const flushParagraph = () => {
            const text = normalizePlainText(paragraph);
            if (text && currentChapter) currentChapter.parts.push(text);
            paragraph = '';
        };
        const flushChapter = () => {
            flushParagraph();
            if (!currentChapter) return;
            const content = normalizePlainText(currentChapter.parts.join('\n\n'));
            if (content || currentChapter.title !== '本文') {
                chapterDrafts.push({
                    title: currentChapter.title,
                    content,
                    sourceKey: currentChapter.sourceKey,
                    order: chapterDrafts.length
                });
            }
            currentChapter = null;
        };

        (Array.isArray(lines) ? lines : []).forEach(line => {
            if (isChapterHeadingLine(line.text)) {
                flushChapter();
                currentChapter = {
                    title: line.text,
                    sourceKey: sourceName + '|page-' + line.page,
                    parts: []
                };
                previousLine = line;
                return;
            }

            ensureChapter(line);
            if (!paragraph) {
                paragraph = line.text;
            } else if (shouldStartPdfParagraph(previousLine, line)) {
                flushParagraph();
                paragraph = line.text;
            } else {
                paragraph = joinPdfLines(paragraph, line.text);
            }
            previousLine = line;
        });
        flushChapter();

        if (!chapterDrafts.length) {
            chapterDrafts.push({
                title: '本文',
                content: '',
                sourceKey: sourceName,
                order: 0
            });
        }
        return chapterDrafts;
    }

    async function parsePdfImport(file) {
        if (typeof pdfjsLib === 'undefined') {
            throw new SmartReaderImportError('PDF_ENGINE_UNAVAILABLE', 'PDF読み込みエンジンを利用できません。');
        }
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const lines = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
            const page = await pdf.getPage(pageNumber);
            const textContent = await page.getTextContent();
            lines.push(...pdfItemsToLines(textContent.items, pageNumber));
        }

        const allText = normalizePlainText(lines.map(line => line.text).join('\n'));
        if (allText.length < 20) {
            throw new SmartReaderImportError(
                'PDF_NO_TEXT',
                'PDFから読み取れる本文がありません。画像PDFは今回の対象外です。'
            );
        }

        let metadataTitle = '';
        try {
            const metadata = await pdf.getMetadata();
            const xmpTitle = typeof metadata?.metadata?.get === 'function'
                ? metadata.metadata.get('dc:title')
                : '';
            metadataTitle = normalizeInlineText(metadata?.info?.Title || xmpTitle || '');
        } catch (error) {
            console.warn('PDF metadata could not be read', error);
        }
        const sourceName = file.name || 'document.pdf';
        return normalizeImportedDocument({
            title: metadataTitle || stripExtension(sourceName),
            sourceType: 'pdf',
            sourceName,
            chapters: pdfLinesToChapters(lines, sourceName)
        });
    }

    function normalizeEpubPath(path) {
        let value = String(path || '').replace(/\\/g, '/');
        try {
            value = decodeURIComponent(value);
        } catch (error) {
            // URLエンコードされていないEPUBもそのまま扱う。
        }
        value = value.replace(/^\/+/, '');
        const parts = [];
        value.split('/').forEach(part => {
            if (!part || part === '.') return;
            if (part === '..') parts.pop();
            else parts.push(part);
        });
        return parts.join('/');
    }

    function resolveEpubPath(basePath, href) {
        const cleanHref = String(href || '').split('#')[0];
        const baseParts = normalizeEpubPath(basePath).split('/');
        baseParts.pop();
        return normalizeEpubPath(baseParts.concat(cleanHref.split('/')).join('/'));
    }

    function resolveEpubTarget(basePath, href) {
        const value = String(href || '');
        const hashIndex = value.indexOf('#');
        const pathPart = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
        let fragment = hashIndex >= 0 ? value.slice(hashIndex + 1) : '';
        try {
            fragment = decodeURIComponent(fragment);
        } catch (error) {
            // URLエンコードされていないfragmentもそのまま扱う。
        }
        return {
            path: resolveEpubPath(basePath, pathPart),
            fragment
        };
    }

    function findZipEndOfCentralDirectory(view) {
        const signature = 0x06054b50;
        const minimum = 22;
        const start = Math.max(0, view.byteLength - 0x10000 - minimum);
        for (let offset = view.byteLength - minimum; offset >= start; offset -= 1) {
            if (view.getUint32(offset, true) === signature) return offset;
        }
        throw new SmartReaderImportError('EPUB_ZIP_INVALID', 'EPUBのZIP構造を読み取れません。');
    }

    function decodeZipName(bytes) {
        try {
            return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        } catch (error) {
            return String.fromCharCode(...bytes);
        }
    }

    function parseZipArchive(arrayBuffer) {
        const view = new DataView(arrayBuffer);
        const endOffset = findZipEndOfCentralDirectory(view);
        const entryCount = view.getUint16(endOffset + 10, true);
        const centralDirectoryOffset = view.getUint32(endOffset + 16, true);
        const entries = new Map();
        let offset = centralDirectoryOffset;

        for (let index = 0; index < entryCount; index += 1) {
            if (view.getUint32(offset, true) !== 0x02014b50) {
                throw new SmartReaderImportError('EPUB_ZIP_INVALID', 'EPUBの目録を読み取れません。');
            }
            const flags = view.getUint16(offset + 8, true);
            const compression = view.getUint16(offset + 10, true);
            const compressedSize = view.getUint32(offset + 20, true);
            const uncompressedSize = view.getUint32(offset + 24, true);
            const nameLength = view.getUint16(offset + 28, true);
            const extraLength = view.getUint16(offset + 30, true);
            const commentLength = view.getUint16(offset + 32, true);
            const localHeaderOffset = view.getUint32(offset + 42, true);
            const nameBytes = new Uint8Array(arrayBuffer, offset + 46, nameLength);
            const name = normalizeEpubPath(decodeZipName(nameBytes));
            entries.set(name, {
                name,
                flags,
                compression,
                compressedSize,
                uncompressedSize,
                localHeaderOffset,
                arrayBuffer
            });
            offset += 46 + nameLength + extraLength + commentLength;
        }
        return entries;
    }

    async function inflateZipBytes(bytes) {
        if (typeof DecompressionStream !== 'function') {
            throw new SmartReaderImportError(
                'EPUB_COMPRESSION_UNSUPPORTED',
                'このブラウザはEPUBの圧縮展開に対応していません。'
            );
        }
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Uint8Array(await new Response(stream).arrayBuffer());
    }

    async function readZipEntry(entry) {
        const view = new DataView(entry.arrayBuffer);
        const localOffset = entry.localHeaderOffset;
        if (view.getUint32(localOffset, true) !== 0x04034b50) {
            throw new SmartReaderImportError('EPUB_ZIP_INVALID', 'EPUBの本文データを読み取れません。');
        }
        const nameLength = view.getUint16(localOffset + 26, true);
        const extraLength = view.getUint16(localOffset + 28, true);
        const dataOffset = localOffset + 30 + nameLength + extraLength;
        const bytes = new Uint8Array(entry.arrayBuffer, dataOffset, entry.compressedSize);
        if (entry.compression === 0) return new Uint8Array(bytes);
        if (entry.compression === 8) return inflateZipBytes(bytes);
        throw new SmartReaderImportError(
            'EPUB_COMPRESSION_UNSUPPORTED',
            'EPUBで未対応の圧縮方式が使われています。'
        );
    }

    async function readZipText(entries, path) {
        const normalizedPath = normalizeEpubPath(path);
        const entry = entries.get(normalizedPath);
        if (!entry) return '';
        const bytes = await readZipEntry(entry);
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }

    function parseXml(xml, code, message) {
        const document = new DOMParser().parseFromString(String(xml || ''), 'application/xml');
        if (document.querySelector('parsererror')) {
            throw new SmartReaderImportError(code, message);
        }
        return document;
    }

    function firstXmlElementText(document, localNames) {
        for (const name of localNames) {
            const elements = document.getElementsByTagName(name);
            if (elements.length && normalizeInlineText(elements[0].textContent)) {
                return normalizeInlineText(elements[0].textContent);
            }
        }
        return '';
    }

    function extractEpubNavigationEntries(navText, navPath) {
        if (!navText) return [];
        const document = new DOMParser().parseFromString(navText, 'text/html');
        const nav = Array.from(document.querySelectorAll('nav')).find(element => {
            const type = (element.getAttribute('epub:type') || element.getAttribute('type') || '').toLowerCase();
            return type.split(/\s+/).includes('toc');
        }) || document.querySelector('nav');
        const entries = [];
        if (!nav) return entries;
        nav.querySelectorAll('a[href]').forEach(link => {
            const title = normalizeInlineText(link.textContent);
            const href = link.getAttribute('href');
            const target = resolveEpubTarget(navPath, href);
            if (title && target.path) {
                entries.push({
                    path: target.path,
                    fragment: target.fragment,
                    title,
                    order: entries.length
                });
            }
        });
        return entries;
    }

    function extractNcxNavigationEntries(ncxText, ncxPath) {
        if (!ncxText) return [];
        const document = parseXml(ncxText, 'EPUB_NCX_INVALID', 'EPUBのNCX目次を読み取れません。');
        const entries = [];
        Array.from(document.getElementsByTagName('navPoint')).forEach(point => {
            const label = point.getElementsByTagName('text')[0]?.textContent;
            const content = point.getElementsByTagName('content')[0]?.getAttribute('src');
            const title = normalizeInlineText(label);
            const target = resolveEpubTarget(ncxPath, content || '');
            if (title && target.path) {
                entries.push({
                    path: target.path,
                    fragment: target.fragment,
                    title,
                    order: entries.length
                });
            }
        });
        return entries;
    }

    function compareDomOrder(first, second) {
        if (!first || !second || first === second) return 0;
        const position = first.compareDocumentPosition(second);
        if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
        if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
        return null;
    }

    function findBlockIndexForFragment(parts, fragment, blockList) {
        if (!fragment || !parts) return -1;
        const root = parts.root?.contains(fragment)
            ? parts.root
            : parts.document?.documentElement;
        if (!root || !root.contains(fragment)) return -1;
        const blocks = Array.isArray(blockList)
            ? blockList
            : (Array.isArray(parts.blocks) ? parts.blocks : []);
        let firstFollowingIndex = -1;
        for (let index = 0; index < blocks.length; index += 1) {
            const element = blocks[index].element;
            if (!element) continue;
            if (element === fragment || element.contains(fragment) || fragment.contains(element)) {
                return index;
            }
            if (firstFollowingIndex < 0 && compareDomOrder(fragment, element) === -1) {
                firstFollowingIndex = index;
            }
        }
        return firstFollowingIndex;
    }

    function makeFragmentAwareBlocks(parts, fragments) {
        const blocks = Array.isArray(parts?.blocks) ? parts.blocks.slice() : [];
        (Array.isArray(fragments) ? fragments : []).forEach(fragment => {
            if (!fragment) return;
            const represented = blocks.some(block => {
                const element = block?.element;
                return element && (element === fragment
                    || element.contains(fragment)
                    || fragment.contains(element));
            });
            if (!represented) {
                blocks.push({
                    type: 'fragment-marker',
                    text: '',
                    element: fragment
                });
            }
        });
        return blocks.sort((first, second) => {
            const result = compareDomOrder(first.element, second.element);
            return result === null ? 0 : result;
        });
    }

    function blocksToHtmlChapterText(blocks) {
        return normalizePlainText((Array.isArray(blocks) ? blocks : [])
            .map(block => block.text)
            .filter(Boolean)
            .join('\n\n'));
    }

    function splitHtmlByNavigationFragments(parts, entries, options = {}) {
        if (!Array.isArray(entries) || entries.length === 0) return null;
        if (entries.some(entry => !entry.fragment)) return null;

        const fragments = entries.map(entry => parts.document?.getElementById(entry.fragment));
        if (fragments.some(fragment => !fragment)) return null;
        const blocks = makeFragmentAwareBlocks(parts, fragments);
        const starts = entries.map((entry, entryIndex) => ({
            entry,
            index: findBlockIndexForFragment(
                parts,
                fragments[entryIndex],
                blocks
            )
        }));
        if (starts.some(start => start.index < 0)) return null;
        for (let index = 1; index < starts.length; index += 1) {
            if (starts[index].index <= starts[index - 1].index) return null;
        }

        const sourceName = options.sourceName || 'document.epub';
        const chapters = [];
        const firstIndex = starts[0].index;
        const preludeBlocks = blocks.slice(0, firstIndex);
        const prelude = blocksToHtmlChapterText(preludeBlocks);
        if (hasMeaningfulText(prelude)) {
            if (options.mergePreludeInto && isLikelyEpubContinuation(preludeBlocks)) {
                mergeChapterContent(options.mergePreludeInto, prelude);
            } else {
                chapters.push({
                    title: '本文',
                    content: prelude,
                    sourceKey: sourceName + '|' + entries[0].path + '|prelude',
                    sourceHref: entries[0].path,
                    fragment: '',
                    rangeKey: entries[0].path + '|blocks-0-' + firstIndex,
                    order: chapters.length
                });
                chapters[chapters.length - 1].title = getResidualChapterTitle(preludeBlocks);
            }
        }

        starts.forEach((start, index) => {
            const nextIndex = starts[index + 1]?.index ?? blocks.length;
            let contentStart = start.index;
            const firstBlock = blocks[start.index];
            if (firstBlock?.type === 'heading'
                && normalizeInlineText(firstBlock.text) === normalizeInlineText(start.entry.title)) {
                contentStart += 1;
            }
            const content = blocksToHtmlChapterText(blocks.slice(contentStart, nextIndex));
            if (!normalizePlainText(content)) return;
            chapters.push({
                title: start.entry.title,
                content,
                sourceKey: start.entry.path + '#' + start.entry.fragment + '|order-' + start.entry.order,
                sourceHref: start.entry.path,
                fragment: start.entry.fragment,
                rangeKey: start.entry.path + '|blocks-' + contentStart + '-' + nextIndex,
                order: chapters.length
            });
        });
        return chapters;
    }

    async function parseEpubImport(file) {
        const archive = parseZipArchive(await file.arrayBuffer());
        const containerText = await readZipText(archive, 'META-INF/container.xml');
        if (!containerText) {
            throw new SmartReaderImportError('EPUB_CONTAINER_MISSING', 'EPUBのcontainer.xmlが見つかりません。');
        }
        const container = parseXml(
            containerText,
            'EPUB_CONTAINER_INVALID',
            'EPUBのcontainer.xmlを読み取れません。'
        );
        const rootfile = container.getElementsByTagName('rootfile')[0];
        const opfPath = normalizeEpubPath(rootfile?.getAttribute('full-path') || '');
        if (!opfPath) {
            throw new SmartReaderImportError('EPUB_OPF_MISSING', 'EPUBの書籍情報ファイルが見つかりません。');
        }
        const opfText = await readZipText(archive, opfPath);
        const opf = parseXml(opfText, 'EPUB_OPF_INVALID', 'EPUBの書籍情報を読み取れません。');
        const sourceName = file.name || 'document.epub';
        const metadataTitle = firstXmlElementText(opf, ['dc:title', 'title']);

        const manifest = new Map();
        Array.from(opf.getElementsByTagName('item')).forEach(item => {
            const id = item.getAttribute('id');
            const href = item.getAttribute('href');
            if (!id || !href) return;
            manifest.set(id, {
                id,
                href: resolveEpubPath(opfPath, href),
                mediaType: item.getAttribute('media-type') || '',
                properties: item.getAttribute('properties') || ''
            });
        });

        const spine = opf.getElementsByTagName('spine')[0];
        const spineItems = Array.from(spine?.getElementsByTagName('itemref') || [])
            .map(itemref => manifest.get(itemref.getAttribute('idref')))
            .filter(Boolean);
        const orderedItems = spineItems.length
            ? spineItems
            : Array.from(manifest.values()).filter(item => EPUB_TEXT_MEDIA_TYPES.has(item.mediaType)
                || /\.(?:xhtml?|html?)$/i.test(item.href));

        let navigationEntries = [];
        const navItem = Array.from(manifest.values()).find(item => /\bnav\b/i.test(item.properties));
        if (navItem) {
            navigationEntries = extractEpubNavigationEntries(
                await readZipText(archive, navItem.href),
                navItem.href
            );
        }
        if (!navigationEntries.length) {
            const tocId = spine?.getAttribute('toc');
            const ncxItem = manifest.get(tocId)
                || Array.from(manifest.values()).find(item => item.mediaType === 'application/x-dtbncx+xml');
            if (ncxItem) {
                navigationEntries = extractNcxNavigationEntries(
                    await readZipText(archive, ncxItem.href),
                    ncxItem.href
                );
            }
        }

        const warnings = [];
        if (!navigationEntries.length) {
            warnings.push('EPUBの目次が見つからないため、本文の見出しまたはspine順を使用しました。');
        }

        const chapters = [];
        let contentTitleFallback = '';
        for (const item of orderedItems) {
            if (!EPUB_TEXT_MEDIA_TYPES.has(item.mediaType) && !/\.(?:xhtml?|html?)$/i.test(item.href)) {
                continue;
            }
            const source = await readZipText(archive, item.href);
            if (!source) continue;
            const parts = extractHtmlDocumentParts(source);
            if (!parts.plainText) continue;
            if (!contentTitleFallback) {
                contentTitleFallback = parts.headingTitle || parts.documentTitle;
            }
            const itemNavigationEntries = navigationEntries.filter(entry => entry.path === item.href);
            const mergePreludeInto = chapters.length ? chapters[chapters.length - 1] : null;
            const fragmentChapters = splitHtmlByNavigationFragments(parts, itemNavigationEntries, {
                sourceName,
                mergePreludeInto
            });
            if (fragmentChapters) {
                fragmentChapters.forEach(chapter => {
                    chapters.push({
                        ...chapter,
                        order: chapters.length
                    });
                });
                continue;
            }

            if (itemNavigationEntries.length === 1 && !itemNavigationEntries[0].fragment) {
                chapters.push({
                    title: itemNavigationEntries[0].title,
                    content: parts.plainText,
                    sourceKey: item.href + '|toc',
                    sourceHref: item.href,
                    fragment: '',
                    rangeKey: item.href + '|full',
                    order: chapters.length
                });
                continue;
            }

            if (!itemNavigationEntries.length) {
                if (chapters.length && isLikelyEpubContinuation(parts.blocks)) {
                    mergeChapterContent(chapters[chapters.length - 1], parts.plainText);
                    continue;
                }
                if (hasMeaningfulText(parts.plainText)) {
                    chapters.push({
                        title: getResidualChapterTitle(parts.blocks),
                        content: parts.plainText,
                        sourceKey: item.href + '|front-matter',
                        sourceHref: item.href,
                        fragment: '',
                        rangeKey: item.href + '|full',
                        order: chapters.length
                    });
                }
                continue;
            }

            if (itemNavigationEntries.length > 1) {
                warnings.push('EPUBのfragment順を確認できないため、' + item.href + 'は見出し分割へ戻しました。');
            }
            const fallbackChapters = splitHtmlBlocksIntoChapters(parts, {
                sourceType: 'epub',
                sourceName,
                sourceKey: item.href
            });
            fallbackChapters.forEach((chapter, fallbackIndex) => {
                const content = normalizePlainText(chapter.content);
                if (!content) return;
                if (fallbackIndex === 0
                    && chapters.length
                    && String(chapter.sourceKey || '').endsWith('|prelude')) {
                    mergeChapterContent(chapters[chapters.length - 1], content);
                    return;
                }
                chapters.push({
                    ...chapter,
                    content,
                    sourceHref: item.href,
                    rangeKey: item.href + '|fallback-' + fallbackIndex,
                    order: chapters.length
                });
            });
        }

        if (!chapters.length) {
            throw new SmartReaderImportError('EPUB_NO_TEXT', 'EPUBから読み取れる本文がありません。');
        }

        return normalizeImportedDocument({
            title: metadataTitle || contentTitleFallback || stripExtension(sourceName),
            sourceType: 'epub',
            sourceName,
            chapters,
            warnings
        });
    }

    async function parseImportedFile(file) {
        const name = String(file?.name || '').toLowerCase();
        const type = String(file?.type || '').toLowerCase();
        if (name.endsWith('.epub') || type === 'application/epub+zip') return parseEpubImport(file);
        if (name.endsWith('.pdf') || type === 'application/pdf') return parsePdfImport(file);
        if (name.endsWith('.html') || name.endsWith('.htm') || type === 'text/html') return parseHtmlImport(file);
        if (name.endsWith('.txt') || type.startsWith('text/')) return parseTxtImport(file);
        throw new SmartReaderImportError(
            'FILE_TYPE_UNSUPPORTED',
            '対応していないファイル形式です。EPUB / PDF / HTML / TXTを選択してください。'
        );
    }

    window.SmartReaderImporters = {
        SmartReaderImportError,
        generateStableChapterId,
        getHtmlNodeText,
        normalizeImportedDocument,
        normalizeHtmlBlockText,
        normalizePlainText,
        parseImportedFile,
        parseTxtImport,
        parseHtmlImport,
        parsePdfImport,
        parseEpubImport,
        pdfItemsToLines,
        pdfLinesToChapters
    };
})();
