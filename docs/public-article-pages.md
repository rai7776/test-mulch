# Smart Reader Originals — 検索可能な公開教材ページ

## 目的
Discoverで閲覧できるオリジナル教材を、ログインやJavaScriptの実行なしで読める静的HTMLとして公開する。
公開教材の個別URLは `/articles/<id>/`。記事全文、教材解説、読解問題の解答をHTMLへ直接含め、ページからReaderへ遷移できる。

## 仕組み
- 一次データ: `discover-data/index.json`
- テンプレート・レンダリング: `public-pages-core.js`
- 生成スクリプト: `scripts/generate-public-pages.js`
- 公開ページ: `articles/index.html`、`articles/<id>/index.html`
- CSS: `articles/public-articles.css`
- マニフェスト: `articles/.generated-pages.json`（生成物の削除対象管理）
- GitHub Actions: `.github/workflows/publish-public-pages.yml`

公開対象は **`original: true` かつ `publicPage: true`** の記事だけ。150語未満の教材、本文欠落、危険なID、重複IDなどは生成時にエラーにする。
外部記事や許諾未確認の作品を誤って公開・検索対象にしないため、既存のVOA記事とサンプル記事は含めない。
`original` は制作元の事実を保証する自動判定ではなく、編集者が確かめて付与する手動フラグ。

## 記事登録例

```json
{
  "id": "original-my-english-story-2026",
  "publicPage": true,
  "original": true,
  "type": "Stories",
  "title": "A New English Story",
  "content": "Full original content with paragraphs separated by blank lines...",
  "language": "en",
  "publishedAt": "2026-11-12",
  "difficulty": "初級",
  "minutes": 5,
  "sourceName": "Smart Reader Originals",
  "descriptions": {
    "ja": "内容を説明する日本語の概要",
    "en": "Short English description"
  },
  "readingGuide": [
    {"heading": "Important expression", "explanation": "日本語の解説", "example": "Example sentence"}
  ],
  "checkQuestions": [
    {"prompt": "Question in English?", "answer": "Correct answer.", "explanation": "日本語での解説"}
  ]
}
```

`readingGuide`、`checkQuestions` は公開HTML向けの説明素材。Readerの単語・問題データと混同しない。

## 公開URLとSEO設定

静的ファイルは、Vercel・Cloudflare Pagesなどのルート公開なら
`https://<実際の公開ドメイン>/articles/original-reading-habit-2026/`、
GitHub Pagesのプロジェクトサイトなら
`https://<owner>.github.io/<repository>/articles/original-reading-habit-2026/`
としてアクセスできる（そのホストで対象リポジトリが実際に公開・デプロイされていることが前提）。

検索結果向けにはタイトル、本文、説明、構造化データ、内部リンクを静的HTMLへ出力。
**正式な公開ドメインが未確認のためcanonicalやsitemapのURLを推測では設定しない。**
正式URLが分かったら、GitHubリポジトリの Variables に
`SMART_READER_SITE_URL`（例: `https://reader.example.com`、GitHub Pagesならパス込み）
を設定し、Actionsの **Publish static public reading pages** を一度手動実行する。
`SITE_URL` 設定時は canonical、`sitemap.xml`、robots.txtのSitemap行が自動生成される。
ルート以外に公開する場合、robots.txtの配置はホスト仕様に依存する（GitHub Pagesのproject pathではルートのrobots.txtにならない）。

**注意:** 公開ページができても検索結果への掲載は保証されない。実際の公開URLをSearch Consoleで確認すること。AdSense審査への合格も保証されない。

## 作業と検証

```sh
npm run build               # JSONから記事ページ生成
npm run check:public        # 生成結果とコミット済みHTMLの一致を確認
npm test                    # HTML・セキュリティ・Readerリンクのテスト
```

GitHub Actionsは、mainのJSONまたは生成コード変更を検知してHTMLを更新コミットする。公開ページ生成はnpm外部パッケージ不要。
記事の追加・更新時には、**同じ記事IDを維持**すること。IDを変えると公開URLとReader上の学習データが別の資料として扱われる。
`publicPage` を外した教材は次回の生成時に旧ページがマニフェストから削除される。

## UIと操作

- 公開ページの「Readerで学習する」は相対URLで `../../index.html#discover/<id>` に遷移し、同じホストのReaderを開く。
- Discover上の「公開教材」リンクから公開記事一覧へ移動できる。
- 公開記事はJavaScriptオフでも読める。学習データの保存はReader内（既存方式）で行う。
- 本文・解説はすべてHTMLエスケープし、不正なHTMLを埋め込めないようにする。
