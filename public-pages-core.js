/* Generated public pages use an explicit publish flag; unreviewed and third-party texts stay private to Discover. */
function buildPublicPages(catalog, options = {}) {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  const text = value => String(value ?? "").trim();
  const siteUrl = text(options.siteUrl).replace(/\/+$/, "");
  if (siteUrl && (!/^https:\/\/[^/?#]+(?:\/[a-zA-Z0-9._~-]+)*$/.test(siteUrl) || siteUrl.includes(".."))) throw new Error("SITE_URL must be a public HTTPS origin with optional path prefix, without a trailing slash.");
  const articleList = Array.isArray(catalog?.articles) ? catalog.articles : [];
  const published = articleList.filter(a => a && a.publicPage === true && a.original === true);
  const byId = new Set();
  for(const a of published) {
    if (typeof a.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(a.id)) throw new Error("Invalid public article id: " + String(a.id));
    if (byId.has(a.id)) throw new Error("Duplicate public article id: " + a.id);
    byId.add(a.id);
    if (!text(a.title) || !text(a.content) || !text(a.descriptions?.ja || a.descriptions?.en)) throw new Error("Incomplete public article: " + a.id);
    if (text(a.content).split(/\s+/u).length < 150) throw new Error("Public article must have substantial original content: " + a.id);
    if (a.publishedAt && !/^\d{4}-\d{2}-\d{2}$/.test(a.publishedAt)) throw new Error("Invalid publish date: " + a.id);
  }
  published.sort((a,b) => String(b.publishedAt||"").localeCompare(String(a.publishedAt||"")) || a.id.localeCompare(b.id));
  const files = new Map();
  const sourceCss = `:root{color-scheme:light;--bg:#fdfaf5;--surface:#fffdfa;--ink:#302c29;--muted:#746b62;--line:#e7ded2;--accent:#765337}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Yu Gothic",system-ui,sans-serif;line-height:1.75}a{color:var(--accent)}a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid #947052;outline-offset:3px}.site-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px max(20px,calc((100vw - 900px)/2));border-bottom:1px solid var(--line);background:var(--surface)}.brand{text-decoration:none;font-weight:750;color:#56412d;white-space:nowrap}.site-nav{display:flex;gap:16px;align-items:center}.site-nav a{font-size:13px;text-decoration:none;white-space:nowrap}.shell{max-width:760px;margin:0 auto;padding:28px 20px 72px}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.075em;color:#916f4d;text-transform:uppercase}.page-title{font-size:clamp(27px,5vw,40px);line-height:1.28;letter-spacing:-.02em;margin:12px 0 14px}.lead{font-size:15px;color:var(--muted);line-height:1.85;margin:0 0 22px}.meta{display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:12px;color:var(--muted);margin:12px 0 24px}.pill{border:1px solid var(--line);background:white;border-radius:999px;padding:3px 9px}.reader-cta{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 20px;border-radius:10px;background:#755437;color:#fff;text-decoration:none;font-weight:700;font-size:14px}.reader-cta:hover{background:#5c3c24}.hint{margin:9px 0 0;font-size:12px;color:var(--muted)}.lesson-article{background:#fff;padding:28px 32px;border:1px solid var(--line);border-radius:16px;margin:30px 0}.lesson-article p{font-family:Georgia,"Times New Roman",serif;font-size:18px;line-height:1.95;margin:0 0 1.25em}.lesson-article p:last-child{margin-bottom:0}.section-title{font-size:21px;margin:38px 0 12px}.notes{display:grid;gap:12px}.note{background:#fff;border:1px solid var(--line);padding:16px 20px;border-radius:12px}.note h3{font-size:15px;margin:0 0 8px}.note p{margin:4px 0;color:#4b4540;font-size:14px}.note .example{border-left:3px solid #d3baa1;margin:10px 0 0;padding-left:12px;font-size:14px;color:#55483d}.question{background:#fff;border:1px solid var(--line);padding:14px 18px;border-radius:12px;margin:10px 0}.question p{margin:0 0 8px;font-weight:600;font-size:14px}.question summary{cursor:pointer;color:var(--accent);font-size:13px}.question .answer{font-size:14px;margin-top:10px}.more-links{margin-top:44px;padding-top:20px;border-top:1px solid var(--line)}.cards{display:grid;gap:14px}.card{display:block;background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px 22px;text-decoration:none;color:var(--ink)}.card:hover{border-color:#beab98;background:#fffdfa}.card h2{font-size:19px;line-height:1.4;margin:7px 0}.card p{font-size:14px;color:var(--muted);margin:0}.card small{font-size:12px;color:#826c55}.site-footer{border-top:1px solid var(--line);padding:24px 20px;text-align:center;font-size:12px;color:var(--muted)}.site-footer a{margin:0 8px}@media(max-width:540px){.site-header{padding:10px 14px}.site-nav{gap:10px}.site-nav a{font-size:12px}.shell{padding:24px 16px 56px}.lesson-article{padding:19px 17px;border-radius:12px}.lesson-article p{font-size:17px;line-height:1.85}}`;
  files.set("articles/public-articles.css", sourceCss+"\n");
  const canonical = suffix => siteUrl ? `<link rel="canonical" href="${esc(siteUrl + suffix)}">` : "";
  const ogUrl = suffix => siteUrl ? `<meta property="og:url" content="${esc(siteUrl + suffix)}">` : "";
  const frame=(title,desc,html,articleUrl,language="ja",schema=null)=>`<!doctype html>
<html lang="${esc(language)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | Smart Reader</title>
<meta name="description" content="${esc(desc)}">
<meta name="robots" content="index,follow">
${canonical(articleUrl)}
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
${ogUrl(articleUrl)}
<link rel="stylesheet" href="${articleUrl==="/articles/"?"public-articles.css":"../public-articles.css"}">
${schema ? `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>` : ""}
</head>
<body>${html}</body>
</html>
`;
  const header=(fromDetail)=>`<header class="site-header"><a class="brand" href="${fromDetail?"../../index.html":"../index.html"}">Smart Reader</a><nav class="site-nav" aria-label="サイトナビゲーション"><a href="${fromDetail?"../":"./"}">公開教材</a><a href="${fromDetail?"../../index.html":"../index.html"}">学習アプリを開く</a></nav></header>`;
  const footer=`<footer class="site-footer">© Smart Reader Originals · <a href="https://github.com/rai7776/test-mulch">プロジェクト</a></footer>`;
  const cards=published.map(a=>`<a class="card" href="${esc(a.id)}/"><small>${esc(a.difficulty||"")} · ${esc((a.genres||[]).join(" / "))} · ${esc(String(a.minutes||""))}分</small><h2 lang="${esc(a.language||"en")}">${esc(a.title)}</h2><p>${esc(a.descriptions?.ja||a.descriptions?.en||"")}</p></a>`).join("\n");
  const indexHtml=`${header(false)}<main class="shell"><div class="eyebrow">Smart Reader Originals</div><h1 class="page-title">無料の英語リーディング教材</h1><p class="lead">アプリ登録なしで、オリジナル英文と学習解説を読めます。単語登録・読み上げ・しおりを使いたい場合は、教材からReaderを開いてください。</p><div class="cards">${cards||"<p>公開中の教材はありません。</p>"}</div></main>${footer}`;
  files.set("articles/index.html",frame("無料の英語リーディング教材一覧","オリジナル英文・読解解説を無料で公開。Readerでは単語登録やしおりなどの学習機能も使えます。",indexHtml,"/articles/"));
  for(const a of published){
    const urlSuffix="/articles/"+a.id+"/";
    const detailHeader=header(true);
    const paragraphHtml=text(a.content).split(/\n\s*\n/u).filter(Boolean).map(p=>"<p>"+esc(p).replace(/\n/g,"<br>")+"</p>").join("\n");
    const notes=Array.isArray(a.readingGuide)?a.readingGuide:[];
    const questions=Array.isArray(a.checkQuestions)?a.checkQuestions:[];
    const noteMarkup=notes.length?`<section aria-labelledby="notes-title"><h2 class="section-title" id="notes-title">表現と文法のポイント</h2><div class="notes">${notes.map(n=>`<div class="note"><h3>${esc(n.heading)}</h3><p>${esc(n.explanation)}</p>${n.example?`<p class="example" lang="${esc(a.language||"en")}">${esc(n.example)}</p>`:""}</div>`).join("")}</div></section>`:"";
    const questionMarkup=questions.length?`<section aria-labelledby="questions-title"><h2 class="section-title" id="questions-title">読解チェック</h2><p class="lead">問題の答えを考えてから「答えと解説」を開いてください。</p>${questions.map((q,i)=>`<div class="question"><p lang="${esc(a.language||"en")}">${i+1}. ${esc(q.prompt)}</p><details><summary>答えと解説を見る</summary><div class="answer"><strong lang="${esc(a.language||"en")}">${esc(q.answer)}</strong>${q.explanation?`<p lang="ja">${esc(q.explanation)}</p>`:""}</div></details></div>`).join("")}</section>`:"";
    const recs=published.filter(item=>item.id!==a.id).slice(0,3).map(item=>`<li><a href="../${esc(item.id)}/">${esc(item.title)}</a></li>`).join("");
    const learnLink="../../index.html#discover/"+encodeURIComponent(a.id);
    const detailHtml=`${detailHeader}<main class="shell"><a href="../">← 教材一覧に戻る</a><div class="eyebrow" style="margin-top:20px">Smart Reader Originals · ${esc(a.type||"Reading")}</div><h1 class="page-title" lang="${esc(a.language||"en")}">${esc(a.title)}</h1><p class="lead" lang="ja">${esc(a.descriptions?.ja||a.descriptions?.en||"")}</p><div class="meta"><span class="pill">${esc(a.difficulty||"")}</span><span class="pill">約${esc(a.minutes||"")}分</span><time datetime="${esc(a.publishedAt||"")}">${esc(a.publishedAt||"")}</time><span>${esc(a.sourceName||"Smart Reader Originals")}</span></div><a class="reader-cta" href="${esc(learnLink)}">Readerで学習する</a><p class="hint">単語登録・読み上げ・しおりなどを使えます。本文はこのページでも全文読めます。</p><article class="lesson-article" lang="${esc(a.language||"en")}">${paragraphHtml}</article>${noteMarkup}${questionMarkup}<div class="more-links"><h2 class="section-title">ほかの教材</h2><ul>${recs}</ul><a class="reader-cta" href="${esc(learnLink)}">Readerでこの教材を学習する</a></div></main>${footer}`;
    const desc=text(a.descriptions?.ja || a.descriptions?.en);
    const schema={"@context":"https://schema.org","@type":"LearningResource",name:a.title,description:desc,inLanguage:a.language||"en",datePublished:a.publishedAt||undefined,learningResourceType:"Reading exercise",educationalLevel:a.difficulty||undefined,publisher:{"@type":"Organization",name:"Smart Reader Originals"}};
    if(siteUrl)schema.url=siteUrl+urlSuffix;
    files.set("articles/"+a.id+"/index.html",frame(a.title,desc,detailHtml,urlSuffix,"ja",schema));
  }
  files.set("robots.txt", "User-agent: *\nAllow: /\n"+(siteUrl ? "Sitemap: "+siteUrl+"/sitemap.xml\n" : ""));
  if(siteUrl) {
    const paths=["/articles/",...published.map(a=>"/articles/"+a.id+"/")];
    const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((suffix,i)=>"  <url><loc>"+esc(siteUrl+suffix)+"</loc>"+(i>0&&published[i-1]?.publishedAt?"<lastmod>"+esc(published[i-1].publishedAt)+"</lastmod>":"")+"</url>").join("\n")}\n</urlset>\n`;
    files.set("sitemap.xml",xml);
  }
  return files;
}
module.exports = {buildPublicPages};
