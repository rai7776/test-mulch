# Smart Reader 開発引き継ぎ

> このファイルが最新の引き継ぎ情報です。`HANDOFF_PHASE4.md` は過去フェーズの履歴として残しています。

## AI / 開発者向け

新しいチャットや新しい開発セッションでは、まずこの `HANDOFF.md` と `AGENTS.md` を読み、`main` の最新HEADとCI状態を確認してから作業を始めること。

古いチャットの記憶より、リポジトリの現在状態を優先すること。保存データへ影響する変更では既存データ保護を最優先し、`AGENTS.md` のセーブポイント・branch運用ルールに従うこと。`main` をforce resetしない。

## 2026-09-17 時点の現在地

- Repository: `rai7776/test-mulch`
- Default branch: `main`
- この引き継ぎ作成直前の main: `3be3d122a8ef3deb1575608ca97751cceb1c8d4c`
- LocalForage: `1.10.0` に固定済み
- 通常のSmart Reader CI: success
- 実Chromeを使うbrowser smoke CI: success
- GitHub Pagesはmain更新時に再デプロイされる

mainのHEADはこのファイル追加commitで進むため、新しいセッションでは必ず改めて最新HEADを確認すること。

## プロダクト方針

Smart Readerは「英語専用Reader」から、以下を扱える学習アプリへ拡張中。

- 英語 → 日本語
- 日本語 → 英語
- 中国語 → 英語
- 日本語 → 中国語 / スペイン語など
- 古文・現代文
- ITパスポート / 基本情報などの資格・一般学習

中心コンセプトは「資料を読む → 重要な語・知識・解説を保存 → Studyで復習」。

Library-firstを維持し、StudyはLibraryを補助する位置づけ。全面的なReact等への書き換えは行わず、既存コードを保ちながらモジュールを追加して段階的に整理する。

## Workspaceの決定済み仕様

複数の独立した「学習スペース」を持つ。

Workspaceごとに分離するもの:

- Library / Folder
- Vocabulary
- Problems
- Study状態
- Study履歴・統計
- Study設定
- Search
- bookmarks / notes / article data
- 読書位置

全体共通にするもの:

- UI / 画面設定
- 文字サイズ・行間
- ダークモード
- 解説言語
- 将来のアカウント / Cloud設定

Workspaceは内部的に最低限2種類:

- `language`: 語学
- `general`: 一般学習・資格など

語学Workspaceは `contentLanguage` を持つ。解説言語は `smart_reader_global_settings_v1` の全体設定として持つ。将来のため `explanationLanguageOverride` の余地は残しているが、現UIではWorkspaceごとの上書きは出さない。

### 既存ユーザー

既存 `library_items` / `study_history_v1` がある場合、自動で1つのWorkspaceへ移行する。

- name: `英語`
- kind: `language`
- contentLanguage: `en`

既存データ本体を消したり一括変換せず、互換性を優先する。

### 完全な新規ユーザー

自動で英語データを作らず、初回セットアップで以下を選ぶ。

- Workspace名
- 種類: 語学 / 一般学習
- 語学の場合は学習対象言語

## Workspace関連の実装済み

- schemaVersion / migration基盤
- Workspace metadata schema v2
- 既存データ → `英語` Workspaceへの安全な移行
- 完全新規DBのfirst-run setup
- Workspace作成
- Workspace切替
- Workspace名変更
- Workspace削除
  - 使用中Workspaceは削除不可
  - 削除前にWorkspace backupを自動生成
  - metadata更新を先に行い、教材データを早まって消さない安全順序
- Library / Study履歴 / Study設定のWorkspace分離
- Workspace切替失敗時のrollbackテスト

主なWorkspace key:

```text
smart_reader_workspaces_v1
smart_reader_active_workspace_id
smart_reader_global_settings_v1
workspace:<workspaceId>:library_items
workspace:<workspaceId>:study_history_v1
smart-reader-workspace:<workspaceId>:local:<setting-key>
```

現在開いているWorkspaceについては互換性維持のため `library_items` / `study_history_v1` をactive slotとして使用し、切替時に専用keyへ退避・復元する方式。

## 設定Hub

全般設定を1画面へまとめる方向で実装済み。

対象:

- アカウント（現時点では状態表示 / 将来用）
- バックアップ
- 文字サイズ
- 行間
- ライト / ダーク
- 解説言語
- Workspace一覧・管理

Reader内にあった旧設定UIは互換性のためコードを残しつつ、基本的に全般設定へ集約する方向。

## 記事コピー

記事は必ず1つのWorkspaceに所属させる。複数Workspace共有参照は作らない。

別Workspaceで使う場合は「記事をコピー」。

コピーする:

- 記事本文 / chapters
- words
- notes
- problems
- bookmarks
- 文構造など未知の追加fieldもdeep cloneで保持
- 記事設定

コピーしない / リセットする:

- `word.study` など学習状態
- 暗記済み状態
- 問題の回答履歴 / attempts
- 読書位置
- Study履歴

実装は `article-copy-core.js` / `article-copy-ui.js` 等。

## Backup / Restore

### 全体backup

従来のLocalForage全体backupを維持。旧backup互換性を壊さないこと。

### Workspace backup

追加済み。Workspace単位で以下を保存する。

- Library / article data
- Study履歴
- Workspace固有Study設定
- Workspace metadata

復元時は既存Workspaceを上書きするより、安全側として新しいWorkspaceとして復元する設計。

削除前backupにも利用する。

古いbackupにWorkspace metadataが存在しない場合でも、復元後にmetadataを自己修復できるようにしている。

## 多言語化の基盤

UI言語と学習対象言語は別概念。

想定:

```text
UI locale: ja / en ...
Workspace contentLanguage: en / ja / zh / es ...
Global explanationLanguage: ja / en / zh ...
```

例:

```text
日本人が英語学習
contentLanguage = en
explanationLanguage = ja

英語話者が日本語学習
contentLanguage = ja
explanationLanguage = en

中国語→英語
contentLanguage = zh
explanationLanguage = en
```

### TTS

従来の `en-US` 固定をWorkspace連動へ変更済み。

例:

- en → en-US
- ja → ja-JP
- zh → zh-CN
- es → es-ES

Reader / Flashcard / auto audioを互換レイヤー経由で切り替える。

### AI一括登録

Workspaceの `contentLanguage` と全体 `explanationLanguage` に応じてプロンプトを切り替える実装済み。

- 英語 → 日本語は既存の調整済み英語専用プロンプトを維持
- その他言語ペアは多言語プロンプトを生成
- `general` Workspaceでは `words` を「重要語句・用語・概念」として扱う

互換性のためJSON schemaの `words / notes / questions` 等はまだ変更しない。

## まだ英語専用の部分

完全な多言語UIにはしていない。

残っている例:

- 一部の「英文」「和訳」「単語」等の固定UIラベル
- 英語向けS/V/O/C文構造
- 英語文法を前提にした一部AI指示
- 品詞選択肢の英語寄りschema

これらは「言語別UI / language profile」フェーズでまとめて対応する。今すぐ内部 `word` field等を全面renameしない。

## セキュリティ / 公開前基盤

実装済み:

- 外部URLは原則 `http:` / `https:` のみ許可
- `javascript:` / `data:` 等を拒否
- 外部リンクへ `noopener noreferrer`
- viewportの `user-scalable=no` / `maximum-scale=1` を削除
- LocalForageを `1.10.0` に固定
- schemaVersion / migration
- backup互換性チェック
- Workspace切替失敗時rollback
- restore失敗時rollbackのテスト
- XSS再発防止の静的チェックを追加
- Node標準テスト基盤
- GitHub Actions CI
- 実Chromeで静的サイトを描画するbrowser smoke workflow

Chrome DevTools Protocolを使ったCIはGitHub runnerでremote-debugging portが安定しなかったため廃止。現在は実Chrome `--dump-dom` ベースで、ページJS実行・動的UI生成・依存固定・viewport等を確認する方式。

## CI / テスト

`.github/workflows/test.yml`

- JS syntax check
- 自動テスト
- Workspace migration / switching
- first-run setup
- article copy
- backup / restore
- 多言語prompt / TTS関連
- release hardening失敗系

`.github/workflows/browser-smoke.yml`

- ローカルstatic server起動
- GitHub runner上の実Chromeでページ描画
- レンダリング済みDOMを検証

2026-09-17、この引き継ぎ作成直前に両方successを確認済み。

## 現在の主なファイル

既存中心:

- `index.html`
- `app.js`
- `style.css`
- `importers.js`
- `flashcard-study.js`
- `study-center.js`

追加された基盤・Workspace系:

- `smart-reader-foundation-core.js`
- `workspace-core.js`
- Workspace UI / settings関連モジュール
- `article-copy-core.js`
- `article-copy-ui.js`
- Workspace backup関連モジュール
- Workspace management関連モジュール
- multi-language speech adapter
- `bulk-prompt-context-core.js`
- `bulk-prompt-context-adapter.js`

テスト:

- `tests/`
- `.github/workflows/test.yml`
- `.github/workflows/browser-smoke.yml`

## 商用化 / 料金の方向性（まだ実装しない）

コア学習量は強く制限しない方針。

Free候補:

- core learning unlimited
- local storage
- manual backup
- 広告
- Workspace数は将来 2前後を候補。ただしβ中は制限を実装せず利用実態を見る

Plus候補:

- Workspace unlimited
- 広告なし
- Cloud Backup
- cross-device sync
- backup history
- advanced convenience / statistics

単語数・記事数を有料制限するより、Workspace数・Cloud・同期・利便機能を収益化する。

## 後回しと決めているもの

- Workspaceごとの完全な言語別専用UI
- `word` → 汎用 `term` などデータschemaの全面改名
- Cloud Sync
- Account / login
- billing / payment
- 広告実装
- PlusのWorkspace数制限
- AI APIのアプリ内直接統合
- React等への全面rewrite
- 全言語の文構造解析

## 次にやることの候補

現時点でWorkspace / storage / release-hardeningの大きな基盤はかなり揃った。

次のセッションでは、まずmain / GitHub Pages / CIの最新状態を確認してから、以下を優先度順に検討する。

1. 実機での回帰確認
   - 既存ユーザーデータを持つブラウザで起動
   - 自動で「英語」Workspaceへ移行されること
   - Workspace作成 / 切替 / 往復でデータが混ざらないこと
   - 全体backup / Workspace backup / restore
   - Safari / mobile
2. UI整理
   - Workspace switcherの配置・使いやすさ
   - 設定Hubのアプリらしい整理
   - 旧Reader設定UIの整理
3. i18n foundation
   - hardcoded日本語UIをtranslation keyへ分離
   - `ja` / `en` UIから開始
4. 英語UIで海外向けbeta準備
5. 言語別profile
   - Japanese / Chinese / Spanish等
   - 品詞・TTS・表示名・文法機能の切替
6. Closed / public beta
7. その後Account / Cloud Backup / Sync

## 注意事項

- 既存ユーザーのデータを最優先で守る。
- migrationでは旧dataを消さない。
- backup/restore互換性を壊さない。
- Workspace切替はactive slot方式なので、保存順序とrollbackに注意する。
- 大きい変更前には `AGENTS.md` に従ってsavepointを残す。
- Git tag APIが使えない接続環境では、過去に `save/...` branchを代替で作ったことがある。ただし本来のルールはtag優先。
- PRは必須ではない。小〜中規模変更は feature branch → CI → fast-forward可能確認 → forceなしでmain反映でもよい。
- `HANDOFF_PHASE4.md` は古いフェーズの記録であり、この `HANDOFF.md` を現在の正本とする。
