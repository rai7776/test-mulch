const test = require('node:test');
const assert = require('node:assert/strict');
const context = require('../bulk-prompt-context-core.js');

const legacyPrompt = `あなたは英語学習用のSmart Readerに登録するデータを作成します。\n\n対象資料: Sample Article\n対象章: Chapter 1\n\n以下の英文から、学習価値の高いデータを作ってください。\n\n【対象英文】\nThis is a sample sentence.`;

function state(kind, contentLanguage, explanationLanguage = 'ja') {
  return {
    activeWorkspace: { kind, contentLanguage },
    globalSettings: { explanationLanguage }
  };
}

test('keeps the proven legacy prompt for English to Japanese study', () => {
  assert.equal(context.contextualizePrompt(legacyPrompt, state('language', 'en', 'ja')), legacyPrompt);
});

test('builds a Chinese target / English explanation language prompt', () => {
  const result = context.contextualizePrompt(legacyPrompt, state('language', 'zh', 'en'));
  assert.match(result, /学習対象言語: 中国語/);
  assert.match(result, /解説・意味・翻訳に使う言語: 英語/);
  assert.match(result, /meaning はこの文脈での意味を英語で書く/);
  assert.match(result, /対象資料: Sample Article/);
  assert.match(result, /This is a sample sentence\./);
  assert.doesNotMatch(result, /以下の英文から/);
});

test('builds a Japanese target / Chinese explanation language prompt', () => {
  const result = context.contextualizePrompt(legacyPrompt, state('language', 'ja', 'zh'));
  assert.match(result, /学習対象言語: 日本語/);
  assert.match(result, /解説・意味・翻訳に使う言語: 中国語/);
  assert.match(result, /translation は自然な中国語訳/);
});

test('builds a general-study prompt without requiring linguistic parts of speech', () => {
  const result = context.contextualizePrompt(legacyPrompt, state('general', '', 'ja'));
  assert.match(result, /一般学習・資格学習データ/);
  assert.match(result, /重要語句・用語・概念/);
  assert.match(result, /partOfSpeech は言語学的な品詞が不要なら other/);
  assert.match(result, /translation は日本語での要約・言い換え/);
});

test('parses article, chapter, and source text from the legacy prompt', () => {
  assert.deepEqual(context.parseLegacyPrompt(legacyPrompt), {
    articleTitle: 'Sample Article',
    chapterTitle: 'Chapter 1',
    sourceText: 'This is a sample sentence.'
  });
});
