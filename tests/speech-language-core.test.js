const test = require('node:test');
const assert = require('node:assert/strict');
const speech = require('../speech-language-core.js');

test('maps supported base language codes to speech locales', () => {
  assert.equal(speech.resolveSpeechLocale('en'), 'en-US');
  assert.equal(speech.resolveSpeechLocale('ja'), 'ja-JP');
  assert.equal(speech.resolveSpeechLocale('zh'), 'zh-CN');
  assert.equal(speech.resolveSpeechLocale('es'), 'es-ES');
  assert.equal(speech.resolveSpeechLocale('ko'), 'ko-KR');
});

test('preserves explicit regional language tags and handles Chinese variants', () => {
  assert.equal(speech.resolveSpeechLocale('en-GB'), 'en-GB');
  assert.equal(speech.resolveSpeechLocale('zh_Hant'), 'zh-TW');
  assert.equal(speech.resolveSpeechLocale('zh-HK'), 'zh-HK');
  assert.equal(speech.resolveSpeechLocale('zh-Hans'), 'zh-CN');
});

test('uses only language workspaces as speech language sources', () => {
  assert.equal(speech.speechLocaleFromState({
    activeWorkspace: { kind: 'language', contentLanguage: 'ja' }
  }), 'ja-JP');
  assert.equal(speech.speechLocaleFromState({
    activeWorkspace: { kind: 'general', contentLanguage: '' }
  }), '');
});

test('only replaces the legacy English default or an empty language', () => {
  assert.equal(speech.shouldApplyWorkspaceLanguage('en-US'), true);
  assert.equal(speech.shouldApplyWorkspaceLanguage(''), true);
  assert.equal(speech.shouldApplyWorkspaceLanguage('ja-JP'), false);
  assert.equal(speech.shouldApplyWorkspaceLanguage('en-GB'), false);
});
