# メインタブ追加・変更ガイド（2026-11-11）

Smart Reader のメインタブは **Library / Discover / Vocabulary / Study / Problems** の5つです。
この文書は Discover 追加時に実機で発生した回帰不具合と、次のタブ追加時の作業手順を記録します。

## 2026-11-11 に発生した不具合と原因

1. **Problems が2行目へ折り返された**: 旧4タブ前提のレイアウトが残り、5タブを1行に固定できていなかった。
2. **タブが詰まって表示された**: 折り返し防止のために flex に切り替えた際、従来のボタン余白・最小幅が失われた。
3. **Vocabulary / Problems で Discover と選択タブの両方に下線が出た**: Discover を動的追加する処理が、別画面でも `aria-current="page"` を付けたままにしていた。
4. **Study に Discover が2つ出た**: Study のナビゲーションには Discover を直接追加したのに、Discover 側の汎用 DOM 挿入処理がさらに1つ追加していた。

**解決策**: メインタブを実行時に追加する処理を削除し、各画面の既存ナビゲーションに1つずつ明示的に定義した。5タブ共通のスクロールレイアウトは `learning-ui.css` で管理する。

## 現行の構成（次のタブ追加時に必ず確認）

| 画面 | ナビゲーション定義 | アクティブ状態 |
| --- | --- | --- |
| Library | `index.html` の `#library-section .library-primary-tabs` | Library の `span[aria-current="page"]` |
| Discover | `discover.js` の一覧 `render()` と記事プレビュー `openArticle()` | Discover の `span[aria-current="page"]` |
| Vocabulary | `index.html` の `#vocabulary-section .learning-section-tabs` | Vocabulary の `span[aria-current="page"]` |
| Study | `study-center.js` の `injectSection()` | Study の `span[aria-current="page"]` |
| Problems | `index.html` の `#problems-section .learning-section-tabs` | Problems の `span[aria-current="page"]` |

画面の切り替えは `goToFolder(null)`、`showDiscover()`、`showGlobalVocabulary()`、`showStudyCenter()`、`showGlobalProblems()` を使用する。
`hideAllSections()` の対象にも新しい画面のIDを追加する。Study は独自の `hideAllSections` ラッパーがあるため、画面切り替え時に Study が残らないことも確認する。

## 新しいメインタブを追加する手順

1. 既存の**全5画面のナビゲーション**に新タブを **1つだけ**追加する。Discover は一覧と記事プレビューの両方を更新する。
2. 新画面にも同じ並びのメインタブを表示し、**その画面だけ** `aria-current="page"` を設定する。既存画面ではそのタブはクリック可能な `button` にする。
3. 新画面の表示関数は、既存の `hideAllSections()` を使って他画面を閉じてから表示する。画面IDを非表示対象に追加する。
4. `learning-ui.css` の共通ナビゲーション指定を使い、**横一列、折り返しなし、横スクロールあり**を維持する。既存のフォント・左右余白・タブの最小幅を不用意に変更しない。
5. **ナビゲーションの動的追加（`querySelectorAll(...).forEach(...append/after...)` など）を行わない。** 追加先が増えた際の重複と状態不整合の原因になる。
6. JS/CSSの変更後、`index.html` の参照バージョンを必要に応じて更新し、キャッシュされた旧コードとの混在を防ぐ。
7. 下記の確認項目を実機幅で検証する。

## 必須の回帰確認

- 画面幅 320 / 375 / 390 / 430px と PC で、メインタブが **1行のみ**である。
- 横にスワイプして右端のタブまで到達でき、ページ全体が横にはみ出さない。
- **Library → Discover → Vocabulary → Study → Problems → Library** と連続して切り替えられる。
- 各画面に表示されるタブは重複なし、順番も同じ。
- **選択中の1タブだけ**下線と `aria-current="page"` があり、前画面の下線が残らない。
- Study を複数回開き直しても Discover 等のタブが増殖しない。
- Discover の一覧・記事プレビュー・フィルター開閉後も、タブ数と選択状態が変わらない。
- 既存の Library / Vocabulary / Study / Problems のコンテンツや操作に影響がない。

## 今後の改善余地

現状は画面ごとにタブのマークアップが分散しているため、次の大規模UI改修時には **単一のナビゲーション定義から各画面を描画する方式**へ段階的に統合することを推奨する。ただし、その際もアクティブ状態は画面IDから一意に決め、同じナビゲーションへの二重挿入を禁止する。既存のUIと切り替え動作を壊さないよう、別PRで実施する。
