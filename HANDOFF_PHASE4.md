# Smart Reader 引き継ぎメモ

## 現在の状態

- リポジトリ: `C:\AI\kanon\eiugo\smart-reader`
- 現在のブランチ: `revamp-ver1`
- HEAD: `3429fde syuusei`
- `main`、`origin/main`、`codex/phase-4`、`origin/codex/phase-4` と同じcommit
- 作業ツリーはclean。未コミット変更なし
- Phase 4までの実装をmain系へ統合済み。再mergeは不要

## 主な実装済み機能

- Phase 1: 読書位置保存・復元、Word Count、Reader検索改善、しおり移動バグ修正
- Phase 2A: `article.chapters`互換レイヤー、chapter navigation、chapter単位描画
- Phase 2B: EPUB / PDF / HTML / TXT importer、EPUB fragment分割、TXT reflow
- Phase 2C: Import Review / Book Editor、chapter追加・削除・分割・結合・並び替え・検索
- Phase 3/4: Global Vocabulary、legacy word対応、検索・filter・sort・CSV、本文navigation
- Reader検索: 入力中は自動ジャンプせず、矢印・Enterのみ明示移動。chapter/article変更後もquery保持
- Reader status: chapter単位と書籍全体のword count・文字数・進捗
- モバイルUI: Book Editor圧縮、chapter一覧スクロール、操作メニュー、Vocabulary panel縮小・拡大
- Backup / Restore: LocalForage全keyのJSON backup、preview、復元前自動backup、validation、rollback

## データ構造・互換性

- LocalForage instance: `ProjectA_DB_v3`
- 主なkey: `library_items`, `reader_settings`
- legacy articleは`article.content`を仮想chapter `legacy-main`として扱う
- `article.chapters`, `chapterId`, `readingPositions`, `context`, `anchor`, `createdAt`, `id`はoptional
- Global Vocabularyは専用コピーを作らず、元の`article.words`を直接参照・更新
- legacy wordにIDがない場合は、aggregation時の`sourceIndex`をfallbackとして使用
- IDありwordは`articleId + wordId`を優先
- sort/filter後の表示indexはデータ識別に使わない
- Book Editorのword/note編集は未知fieldを保持
- chapterIdのないlegacy word/note/bookmarkが存在する保存済みbookでは、chapter分割・結合・削除をguardで禁止
- readingPositionだけの場合はchapter構造変更を禁止しない

## Backup / Restoreの注意

- 新形式:

```json
{
  "format": "smart-reader-backup",
  "backupVersion": 1,
  "exportedAt": "...",
  "data": {
    "library_items": [],
    "reader_settings": {}
  }
}
```

- 旧形式backupも復元可能
- 通常復元ではbackupにないLocalForage keyを削除しない
- 復元前データは`smart-reader-pre-restore-*.json`として自動保存
- 復元失敗時は復元前snapshotへ戻す。`library_items`は最後に書き込む

## 主なファイル

- `app.js`: Reader、chapter、Vocabulary、Book Editor、backup/restoreの中心
- `importers.js`: EPUB / PDF / HTML / TXT parser
- `index.html`: Library、Reader、Global Vocabulary、Editor、backup UI
- `style.css`: PC/mobile UI

## 直近のデータ安全性修正

- IDなしlegacy word/noteの編集・暗記・削除が1件だけ対象になるよう修正
- Global Vocabularyのarticle間取り違えを防止
- Book Editor保存時のwords/notes/bookmarks保持を確認
- backup restoreで対象外LocalForage keyを保持
- restore失敗時のrollbackを確認

## 確認済みテスト

- legacy articleの仮想chapter、Reader、検索、記事別Vocabulary、note、bookmark
- legacy wordのIDなし編集・暗記・単件削除
- Global Vocabularyのsort/filter後のarticle識別、編集、削除、entries再構築
- Book Editor保存時の未知field・words/notes/bookmarks保持
- backup schema、validation、対象外key保持、rollback
- JavaScript syntax、`git diff --check`、conflict marker確認

## 次に確認するとよいこと

実装上の大きな未対応事項はありません。実機で次だけ確認してください。

1. 実データをbackupして、同じbackupをpreview付きで復元
2. legacy word（IDなし）を記事別Vocabularyで検索後に編集・削除
3. Global Vocabularyで異なるarticleの同名wordを編集・削除
4. 復元時に復元前backupがダウンロードされること

次の作業を始める前に、現在のclean状態を基準にしてください。mainへの再mergeや履歴のresetは不要です。
