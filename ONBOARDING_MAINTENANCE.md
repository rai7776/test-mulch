# Smart Reader チュートリアル保守ガイド

このファイルは、今後のUI変更でチュートリアルを更新し忘れないためのチェックリストです。

## 現行フロー（v1）

1. **ウェルカム**: 「読みながら、言葉を自分のものに。」と、本＋単語カードのイラスト。Library / Vocabulary / Study / Problemsの概要を表示。
2. **初回の学習スペース設定**: 既存の必須設定画面を使用（言語・スペース名）。二重の言語設定画面を作らない。
3. **Discover**: 英語なら既存 \`sample-story-001\`、中国語なら \`tour-zh-001\` のカードを強調し、実際に記事を開く。
4. **Reader**: 本文の読み方と追加操作を案内。
5. **追加メニュー**: 既存の＋ボタン→実際の単語入力と保存。ノート・問題は追加フォームの切り替え位置を短く説明（作成は強制しない）。
6. **Library**: 既存の「Libraryに保存」で記事を保存。その後、Libraryの該当記事を強調。
7. **完了**: 次の学習を促す。
8. **Vocabulary / Study / Problems**: メインガイドとは独立し、初めてタブへ移動したときにそれぞれ1回だけ表示。

既存ユーザーにはメインガイドを自動表示しません。設定 > 使い方ガイド から再実行できます。既存ユーザーの再実行では、既存の学習スペース設定を変更せずにDiscoverの操作体験へ進みます。

## ファイル・接続点

| 用途 | ファイル |
| --- | --- |
| ステップの文章・セレクタ・進行状態・初回タブガイド | \`onboarding.js\` |
| イラスト・コーチマーク・アニメーション・iPhone向け表示 | \`onboarding.css\` |
| ロードとReader/追加フォームの \`data-tour-id\` | \`index.html\` |
| Discoverカードの \`data-tour-id\` | \`discover.js\` |
| 追加・保存成功イベント / Library記事カードの \`data-tour-id\` | \`app.js\` |
| 再表示ボタン | \`settings-hub.js\` |
| サンプル記事 | \`discover-data/index.json\` |
| 回帰テスト | \`tests/onboarding.test.js\` |

重要: DOMの見た目（ラベルや位置）ではなく \`data-tour-id\` で強調対象を指定します。座標は \`getBoundingClientRect()\` で毎回計算します。要素のリネーム・削除・DOM差し替え時には \`onboarding.js\` の \`TARGETS\` を必ず確認してください。

## UI変更時の必須チェック

- [ ] Discoverの記事カードが \`data-tour-id="discover-article"\` と \`data-article\` を持つ。
- [ ] Reader本文 \`reader-text\`、＋ \`add-entry\`、単語入力 \`word-input\` が存在する。
- [ ] 追加モーダルの「ノート」「問題」がそれぞれ \`note-type\` / \`question-type\` を維持する。
- [ ] 「Libraryに保存」 \`save-discover\` が保存可能な記事で表示される。
- [ ] Libraryの記事カードに \`library-item\` と \`data-library-item-id\` が付与される。
- [ ] \`smartreader:article-opened\` はReader表示後、\`smartreader:unified-item-saved\` と \`smartreader:discover-saved\` は永続化成功後に発火する。
- [ ] iPhone Safariで、コーチマークの対象位置・モーダル内のスクロール・キーボード表示が崩れない。
- [ ] ガイドをスキップ／途中でリロード／設定から再実行しても、記事・単語・Study履歴を変更しない。
- [ ] Reduced Motion設定で不要な移動・回転演出を省略する。
- [ ] JS/CSS更新時は読み込みURLのバージョンを更新する。

## 状態の保存

- \`smart-reader-onboarding-v1\`: メインガイドの進行状態。初回学習スペース設定が未完了の場合のみ初期状態を作成します。Readerの途中で再読み込みした場合は、データを改変せずにDiscoverのステップから再開します。
- \`smart-reader-tab-hints-v1\`: Vocabulary・Study・Problems各タブの初回説明を閉じたかどうか。メインガイドとは別に記録します。

ローカルストレージへの保存に失敗しても通常の読書操作は妨げないようにしています。端末をまたぐ同期はまだありません。

## デザイン上の留意点

初期ウェルカムの本は、最初に提案した「開いた本＋浮かぶカード」の構図をSVGで近似した暫定版です。形・ベージュとブラウンの色合いを優先し、紙の自然な陰影を追加しています。後日より適切な画像に差し替える場合は \`onboarding.js\` の \`sr-tour-book-scene\` 内だけを変更してください。

## 動作確認

\`npm test\` と \`npm run check:foundation\` を実行します。通常のPRではBrowser smokeを自動で起動せず、必要なときだけ手動確認してください。

メインガイドは本番サイトの \`main\` へマージする前に、特に **新規ユーザーの初回設定からのリロード復帰**、**単語の保存成功**、**Discover記事のLibrary保存** を実際のブラウザで確認してください。