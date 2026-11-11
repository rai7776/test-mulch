# Discover → Reader 統合（2026-11-12）

## 仕様

- Discoverの記事カードをタップすると、独自の簡易プレビューを経由せず、既存のReaderで本文を開く。
- 本文表示・テキスト選択・単語/ノート/問題登録・音声・文字数・しおり・読書位置・検索は既存のReader処理を共有する。
- 戻り先のパンくずは `Discover`。Reader上部に「Libraryに保存」「共有」と、記事にURLがある場合は「元記事 ↗」を表示する。
- **閲覧だけではLibraryに追加しない**。明示的に「Libraryに保存」を押した場合だけLibraryへ記事と学習データのコピーを作る。
- 既にLibraryへ保存したDiscover記事は、そのLibrary記事をReaderで開き、二重登録しない。

## データ保存

- Discoverのカタログ（タイトル・本文など）の共有データ: `discover-data/index.json`
- 保存先（各端末のLocalForage）: `discover_reader_items_v1:<activeWorkspaceId>`
- Readerでは `discover:<catalogId>` を内部IDとして使う。異なるWorkspaceの学習データは分離される。
- 各ローカル記事には、登録した単語・メモ・問題・しおり・読書位置が保存される。閲覧履歴はLibraryの「前回の続き」を上書きしない。
- 別保存領域の学習データはGlobal Vocabulary / ProblemsだけでなくStudy CenterやFlashcardからも利用できる。
- Library保存時は記事と学習データを移し、別領域の同一記事キャッシュを削除する。起動時にも古い重複キャッシュを整理する。
- バックアップは既存のLocalForageキー収集によりDiscover学習データを含む。

## カタログへの登録条件

`id` は記事の更新後も一意かつ安定、`title`・`content` は文字列。記事の出典リンクは `sourceUrl`（互換として `url` も可）、`sourceName` に出典名、`language` に言語コードを指定する。
本文の再掲載許諾・出典表示などの条件は、**取得処理側で別途検証**する。本文の無断転載をこの画面改修が許可するものではない。

## 実機確認（特にiPhone）

1. Discover一覧から記事をタップ → 直接Readerで開く。Reader検索・文字数・設定が見える。
2. 本文を長押しして単語登録 → Readerを閉じて再度Discoverから開く → 登録した単語が残る。
3. しおりを登録し、スクロール位置を変更して戻る → 再度開いたとき復元される。
4. Libraryに勝手に記事カードが増えない。Global VocabularyからDiscoverで登録した単語に移動できる。
5. 元記事URLがある場合だけリンクが出る。出典がないサンプルで空リンクは出ない。
6. 「Libraryに保存」 → 記事がLibraryに追加され、単語としおりを引き継ぐ。Discoverから開き直しても二重保存されない。
7. Library記事側では従来の編集・本棚への戻り・前回の続きが維持されている。
8. Readerのパンくず・追加操作の横スクロールがスマホ幅でも破綻しない。
