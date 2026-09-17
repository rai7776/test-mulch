# Smart Reader 最新引き継ぎ補足

> `HANDOFF.md` と `AGENTS.md` を先に読み、その後このファイルを読むこと。ここには 2026-09-17 の後半で行った最新変更だけをまとめる。

## 現在の main / CI

- Repository: `rai7776/test-mulch`
- main HEAD: `452b59e51b3c5083db661b0bacaf3cf0544ce6ef`
- Smart Reader tests: success
- Browser smoke: success
- GitHub Pages: main 更新で再デプロイされる。次セッション開始時に最新デプロイ状態も再確認すること。

## 直近で修正した重要バグ

### 1. 起動直後に画面が固まる問題

`workspace-management-ui.js` の MutationObserver が、自分自身のDOM更新を再検知してループしていた。Observer側では既存セクションを不要に再描画しない形へ修正済み。

### 2. 記事を開くと固まる問題

記事の「元記事URL」を安全化する MutationObserver が、同じ `href` を何度も `setAttribute` して自己再帰していた。値が実際に変わるときだけ書き換えるよう修正済み。

Browser smoke には、ページ描画後に数秒待ってフリーズを拾う検査と、source-link observer の回帰検査がある。

## モバイル記事画面

記事画面上部はスマホ幅で崩れていたため整理済み。

- 操作群を2段目へ分離
- 横スクロール可能にして縦潰れを防止
- 「この資料の単語」は記事ヘッダーから削除
- 「別スペースへコピー」も記事ヘッダーから削除

現在、記事画面上部の主要操作は `編集 / Problems / 統計 / 元記事` を中心にしている。

## Library の移動 / 削除 / コピー

ユーザー要望により、記事・フォルダの操作は Library カード上で `移動 / 削除 / コピー` の3つを独立表示する。

### 移動

- 現在のWorkspace内のフォルダ移動

### コピー

- 現在のWorkspace内でも複製可能
- 別Workspaceにもコピー可能
- コピー先Workspaceとフォルダを選択可能
- フォルダコピー時は子フォルダ・記事を再帰的に複製
- 元データは残す

記事コピーは学習内容を複製するが、学習済み状態・回答履歴・読書位置等は原則リセットする既存方針を維持。

## Library カードUI

直近で以下を整理済み。

- `移動 / 削除 / コピー` をすべて横書き
- 3ボタンを同じ幅・高さ・角丸へ統一
- 移動 = 青系
- 削除 = 赤系
- コピー = 緑系
- Study画面に近いフォントサイズ・太さ・角丸へ寄せた
- モバイルでも文字が縦に割れないようにしている

関連キャッシュバージョンも更新済み。

## 外観テーマ

ダークモードは一旦無効化した。

理由: 背景だけ黒くなり、Library上部やカードなど一部が白いままで未完成だったため。

現在の仕様:

- Smart Readerは常にライト表示
- iPhone / OS がダークモードでも追従しない
- 設定Hubの外観欄は `ライト（現在固定）` のdisabled select
- `document.documentElement.style.colorScheme = 'light'`
- 以前保存していた theme 設定値自体は消さずに保持し、将来ダークテーマを完成させたとき再利用可能にする

主な実装: `settings-hub.js`

## 実機確認済み

ユーザーの iPhone Safari で以下は概ね確認済み。

- 起動
- Library表示
- 既存データ保持
- Vocabulary / Study
- 設定Hub
- Workspace切替と往復
- Safariを閉じて開き直した後のデータ保持

途中で見つかったフリーズ2件は上記の通り修正済み。

## 次にやること

次セッションでは、まず `HANDOFF.md` / `AGENTS.md` / `HANDOFF_LATEST.md` を読み、main HEAD と CI / Pages の最新状態を再確認する。

その後は大規模基盤追加より、ユーザーとスクショを見ながら UI 整理を続けるのが自然。

候補:

- LibraryカードとツールバーのモバイルUI微調整
- Reader上部UIの余白・ボタンサイズの微調整
- 設定Hubの見た目整理
- Workspace switcherの配置整理
- 旧Reader設定UIの整理
- i18n / language profile の次フェーズ

## 開発速度を落とさないための運用

次チャットでは以下を推奨。

- 1回の依頼で変更目的を1つに絞る
- 小さいCSS/UI変更では全リポジトリ探索を繰り返さず、関連ファイルだけ確認する
- 小変更で毎回長時間の設計調査をしない
- feature branchで実装 → syntax/unit test → browser smoke → main反映、を基本の短いループにする
- CI待ちは必要最小限にし、同じrunを何度もポーリングしすぎない
- スクショで確認できるUI修正は、まず最小差分を入れて実機で確認してから次へ進む
