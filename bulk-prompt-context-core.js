(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SmartReaderBulkPromptContext = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const LANGUAGE_NAMES = Object.freeze({
        en: '英語',
        ja: '日本語',
        zh: '中国語',
        es: 'スペイン語',
        ko: '韓国語',
        fr: 'フランス語',
        de: 'ドイツ語',
        pt: 'ポルトガル語',
        it: 'イタリア語'
    });

    function baseLanguageCode(value) {
        return String(value || '').trim().toLowerCase().split(/[-_]/)[0];
    }

    function languageName(value) {
        const code = baseLanguageCode(value);
        return LANGUAGE_NAMES[code] || String(value || '').trim() || '指定言語';
    }

    function parseLegacyPrompt(prompt) {
        const source = String(prompt || '');
        const articleTitle = source.match(/^対象資料:\s*(.+)$/m)?.[1]?.trim() || '無題';
        const chapterTitle = source.match(/^対象章:\s*(.+)$/m)?.[1]?.trim() || '本文';
        const marker = source.match(/【対象(?:英文|本文)】\s*\n([\s\S]*)$/);
        const sourceText = marker ? marker[1] : '';
        return { articleTitle, chapterTitle, sourceText };
    }

    function shouldKeepLegacyEnglishPrompt(state) {
        const active = state?.activeWorkspace;
        const explanation = state?.globalSettings?.explanationLanguage || 'ja';
        return active?.kind === 'language'
            && baseLanguageCode(active.contentLanguage) === 'en'
            && baseLanguageCode(explanation) === 'ja';
    }

    function buildSchemaSample(kind) {
        const wordHint = kind === 'general' ? '<重要語句・用語・概念>' : '<学習対象言語の基本形>';
        const surfaceHint = kind === 'general' ? '<本文中の表記>' : '<本文中の実際の形>';
        const meaningHint = kind === 'general' ? '<要点・定義・意味>' : '<この文脈での意味>';
        const translationHint = kind === 'general' ? '<内容の要約・言い換え>' : '<自然な訳>';
        return {
            format: 'smart-reader-bulk',
            version: 2,
            words: [{
                word: wordHint,
                surfaceText: surfaceHint,
                meaning: meaningHint,
                partOfSpeech: 'other',
                tags: ['重要'],
                memo: '',
                context: '<本文中の該当箇所>'
            }],
            notes: [{
                originalText: '<該当する原文・本文>',
                translation: translationHint,
                extra: '<補足解説>'
            }],
            questions: [{
                selectedText: '<本文中の根拠>',
                question: '<復習問題>',
                answer: '<答え>',
                explanation: '<解説>',
                memo: '',
                questionType: 'other',
                tags: ['重要'],
                difficulty: 3,
                needsReview: true
            }]
        };
    }

    function languagePrompt(parts, state) {
        const active = state.activeWorkspace;
        const targetName = languageName(active.contentLanguage);
        const explanationName = languageName(state?.globalSettings?.explanationLanguage || 'ja');
        const sample = buildSchemaSample('language');
        return `あなたはSmart Readerに登録する語学学習データを作成します。\n\n学習対象言語: ${targetName}\n解説・意味・翻訳に使う言語: ${explanationName}\n対象資料: ${parts.articleTitle}\n対象章: ${parts.chapterTitle}\n\n以下の${targetName}の文章から、学習価値の高いデータを作ってください。\n\n【単語 words】\n- 本文理解や語学学習に重要な単語、熟語、句を選ぶ\n- word は辞書形・基本形を優先する\n- surfaceText は本文中の実際の形\n- meaning はこの文脈での意味を${explanationName}で書く\n- partOfSpeech は noun / verb / adjective / adverb / phrase / preposition / conjunction / other のいずれか。該当しにくい言語では other でよい\n- tags は必要なものだけ\n- context は本文中の該当文をなるべくそのまま入れる\n\n【ノート notes】\n- 見落としやすい文法、語法、構造、修飾関係、読み違えやすい箇所を登録する\n- originalText は該当する原文\n- translation は自然な${explanationName}訳\n- extra は${explanationName}で解説する\n- 文構造が有用な場合だけ structure.annotations / structure.relations を使用してよい\n- annotation.kind は core / modifier / target\n- modifier.notation は angle / square / round\n- relation.type は modifies\n\n【問題 questions】\n- 語彙、文法、翻訳、内容理解など復習価値の高い問題を作る\n- 問題文・答え・解説は原則${explanationName}で書く\n- questionType は blank / choice / vocabulary / grammar / translation / reading / free / sorting / true/false / other のいずれか\n- difficulty は 1～5\n- selectedText は本文の根拠となる原文を入れる\n- answer と explanation を必ず付ける\n\n【重要】\n- サンプル内の山括弧の文字は説明用なので、そのまま出力しない\n- id / articleId / chapterId / createdAt / updatedAt は絶対に出力しない\n- JSON以外の説明は不要\n- 該当項目がない配列は [] にする\n- 必ず Smart Reader Bulk Import v2 形式で出力する\n\n出力形式サンプル:\n\`\`\`json\n${JSON.stringify(sample, null, 2)}\n\`\`\`\n\n【対象本文】\n${parts.sourceText}`;
    }

    function generalPrompt(parts, state) {
        const explanationName = languageName(state?.globalSettings?.explanationLanguage || 'ja');
        const sample = buildSchemaSample('general');
        return `あなたはSmart Readerに登録する一般学習・資格学習データを作成します。\n\n解説に使う言語: ${explanationName}\n対象資料: ${parts.articleTitle}\n対象章: ${parts.chapterTitle}\n\n以下の本文から、復習価値の高いデータを作ってください。\n\n【重要語句 words】\n- 試験・理解に重要な用語、概念、固有名詞、重要表現を選ぶ\n- word は登録見出しとして最も自然な基本形にする\n- surfaceText は本文中の実際の表記\n- meaning は定義・要点・意味を${explanationName}で簡潔に書く\n- partOfSpeech は言語学的な品詞が不要なら other にする\n- context は本文中の該当箇所をなるべくそのまま入れる\n\n【ノート notes】\n- 因果関係、比較、定義、例外、暗記上の注意、誤解しやすい箇所を登録する\n- originalText は根拠となる本文\n- translation は${explanationName}での要約・言い換えを入れる\n- extra は追加解説や覚え方を書く\n- 語学向けの文構造情報は、明確に役立つ場合だけ使用する\n\n【問題 questions】\n- 用語確認、穴埋め、正誤、並べ替え、内容理解など復習価値の高い問題を作る\n- questionType は blank / choice / vocabulary / grammar / translation / reading / free / sorting / true/false / other のいずれか\n- difficulty は 1～5\n- selectedText は本文の根拠となる箇所を入れる\n- answer と explanation を必ず付ける\n\n【重要】\n- サンプル内の山括弧の文字は説明用なので、そのまま出力しない\n- id / articleId / chapterId / createdAt / updatedAt は絶対に出力しない\n- JSON以外の説明は不要\n- 該当項目がない配列は [] にする\n- 必ず Smart Reader Bulk Import v2 形式で出力する\n\n出力形式サンプル:\n\`\`\`json\n${JSON.stringify(sample, null, 2)}\n\`\`\`\n\n【対象本文】\n${parts.sourceText}`;
    }

    function contextualizePrompt(originalPrompt, state) {
        if (!state?.activeWorkspace) return String(originalPrompt || '');
        if (shouldKeepLegacyEnglishPrompt(state)) return String(originalPrompt || '');
        const parts = parseLegacyPrompt(originalPrompt);
        return state.activeWorkspace.kind === 'general'
            ? generalPrompt(parts, state)
            : languagePrompt(parts, state);
    }

    return Object.freeze({
        LANGUAGE_NAMES,
        baseLanguageCode,
        languageName,
        parseLegacyPrompt,
        shouldKeepLegacyEnglishPrompt,
        buildSchemaSample,
        contextualizePrompt
    });
});
