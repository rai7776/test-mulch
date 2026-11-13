# Smart Reader チュートリアル保守ガイド

この文書は、Smart Readerの既存UIが変わったときに、チュートリアルの案内が古くならないようにするためのチェックリストです。

## 現行フロー（v2）

### ウォークスルー：6ページの概要

1. **Smart Readerの概要**：「読みながら、言葉を自分のものに。」本＋単語カードの暫定SVGを維持
2. **Library**：記事・ファイル・フォルダ・章で教材を管理
3. **Discover**：新しい記事を探す
4. **Vocabulary**：単語を整理・確認
5. **Study**：カードなどで復習
6. **Problems**：問題で理解度を確認

2〜6ページの画面は既存UIの構造に寄せた縮小プレビューで、**実際のスクリーンショットではありません**。将来デザインが更新されたらプレビューも更新します。

### 実操作：Library → Reader → Discover

1. 初回のみ既存の学習スペース作成画面（言語とスペース名）を使います。
2. ワークスペース設定完了後は**Libraryから開始**します。ガイドを開始した際だけ、2章構成のサンプル記事をLibraryに追加します（既存データは保持し、同じサンプルは二重追加しない）。
3. Libraryのサンプル記事をタップします。
4. Readerの**章切り替え**を紹介します。操作体験は任意です。
5. **本文で単語を選択**します。iPhoneは長押し、PCはドラッグ。選択できたら＋ボタンの説明に進みます（スキップ可能）。
6. 既存の＋から単語を追加し、**単語と意味を入力して実際に保存**します。
7. 同じ追加メニューの**ノート・問題**を軽く紹介します。保存は強制しません。
8. Libraryへ戻り、ファイルとフォルダの追加を短く紹介します。
9. **Discover**タブを強調し、「Discoverで文章を探し、教材を増やしましょう」と案内してから完了します。

Vocabulary・Study・Problemsについては、メインガイドとは独立した初回タブ訪問時の説明を維持します。既存ユーザーにメインガイドを強制表示しません。「設定 > 使い方ガイド」からいつでも再開できます。

## 画面変更時のチェックリスト

- [ ] 6ページのウォークスルーが**実際の画面デザイン**と整合していること
- [ ] メインナビゲーションのLibrary/Discover/Vocabulary/Study/Problemsの名称や並びが変わったら、ガイド本文とプレビューを確認
- [ ] Library記事カードの `data-tour-id="library-item"` と `data-library-item-id` が残っている
- [ ] Readerの章ボタン `#chapter-title-btn` が存在し、2章以上の教材で表示される
- [ ] 章切り替えが保存されたあと `smartreader:chapter-changed` を発火し、ガイドが自動的に「単語を選択」に進む（左右矢印・章一覧どちらでも）
- [ ] 章・文字選択を案内中は右下の `#add-btn` と `#fab-toggle` を一時的に隠し、追加ステップ以降は正常に再表示する
- [ ] Reader本文 `#text-display` 内のテキスト選択がiPhone/PCで可能である
- [ ] ＋ボタン `data-tour-id="add-entry"` と単語・ノート・問題の既存フォームが使える
- [ ] 単語を保存すると `smartreader:unified-item-saved` が**保存成功後**に発火する
- [ ] ReaderのLibraryへ戻るボタン `#back-to-library` で実際にLibraryへ移る
- [ ] Discoverタブ `data-main-tab-target="discover"`、Discover検索 `#discover-search` が使える
- [ ] コーチマークはスクロールに遅れて追従せず、外れた対象にスポットライトを描画しない
- [ ] 単語・意味の入力欄を説明カードが覆わない。モーダルのガイドは通常のレイアウト内に表示
- [ ] 新規ワークスペース作成後、**Libraryが開いたままでガイドが始まる**
- [ ] 途中でリロード・ガイドをスキップ・設定から再実行しても通常の学習データを失わない
- [ ] iPhone Safariの長押し選択ハンドル、ソフトウェアキーボード、縦横変更時の位置を確認
- [ ] `prefers-reduced-motion` が有効でも操作できる
- [ ] JS/CSS更新時は `index.html` のバージョン番号を更新

## 進行状態と教材

- `smart-reader-onboarding-v2`：6ページ表示位置とメイン実操作の進行状態。以前のv1の進行状態を引き継がず、安全に切り替えます。
- `smart-reader-tab-hints-v1`：Vocabulary・Study・Problemsの初回説明を閉じたかどうか。
- `tourSampleKey = smart-reader-library-tour-v2`：英語・中国語に対応する、2章構成の説明用記事。**チュートリアル開始時のみ**作成し、Libraryの通常記事として保存されます。

リロード時、編集フォーム・選択範囲は無理に復元せずLibraryのサンプル記事から案内し直します。学習履歴はリセットしません。

## コードの接続先

| 用途 | ファイル |
| --- | --- |
| スライドとコーチマーク、文言・順序・進行状態 | `onboarding.js` |
| ウォークスルーの見た目、スポットライト、モーダル内説明 | `onboarding.css` |
| Reader・入力フォームの操作対象、ロード順 | `index.html` |
| Libraryサンプル生成と保存成功イベント、記事カードの識別 | `app.js` |
| DiscoverカードUI | `discover.js` |
| ガイド再表示 | `settings-hub.js` |
| 自動検証 | `tests/onboarding.test.js` |

DOM構造やボタン位置に依存しないよう、可能な範囲で `data-tour-id` を使います。既存の固定IDが変わった場合は、`onboarding.js` の `TARGETS` を更新します。

## 確認と公開

`npm test` と `npm run check:foundation` を実行します。通常のPRではBrowser smokeを頻繁に実行しません。

公開前の実機確認では、**6ページの切り替え → 新規ワークスペース設定 → Libraryのサンプル記事 → 章 → 文字選択 → ＋ → 意味入力 → 保存 → Libraryへ戻る → Discover** をひと続きで確認してください。マージ前に最終UI確認を行います。
