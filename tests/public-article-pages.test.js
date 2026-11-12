const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {buildPublicPages} = require('../public-pages-core.js');

const root = path.resolve(__dirname,'..');
const catalog = JSON.parse(fs.readFileSync(path.join(root,'discover-data/index.json'),'utf8'));

test('Only reviewed original lessons get standalone searchable pages', () => {
  const output = buildPublicPages(catalog);
  const publicArticles = catalog.articles.filter(a => a.publicPage === true && a.original === true);
  assert.ok(publicArticles.length >= 2);
  for (const article of publicArticles) {
    const page = output.get('articles/' + article.id + '/index.html');
    assert.ok(page, 'Missing page for ' + article.id);
    assert.match(page, /<article class="lesson-article"/);
    assert.match(page, /<meta name="description" content="/);
    assert.match(page, /<script type="application\/ld\+json">/);
    assert.ok(page.includes('index.html#discover/' + article.id), 'Reader link must include Discover ID');
    assert.ok(page.includes(article.content.split(/\n\s*\n/)[0].slice(0,20)), 'Article body must be in static HTML');
    assert.match(page, /<details><summary>答えと解説を見る<\/summary>/);
  }
  assert.equal(output.has('articles/sample-science-001/index.html'),false);
  assert.equal(output.has('articles/voa-original-3947928/index.html'),false);
  assert.match(output.get('articles/index.html'), /無料の英語リーディング教材/);
  assert.ok(!output.has('sitemap.xml'), 'No sitemap should be generated until SITE_URL is verified');
});

test('Sitemap, canonical and structured data use configured site base', () => {
  const output = buildPublicPages(catalog,{siteUrl:'https://example.com/test-mulch/'});
  const url='https://example.com/test-mulch/articles/original-reading-habit-2026/';
  assert.ok(output.get('articles/original-reading-habit-2026/index.html').includes('rel="canonical" href="'+url+'"'));
  assert.ok(output.get('sitemap.xml').includes(url));
  assert.ok(output.get('robots.txt').includes('Sitemap: https://example.com/test-mulch/sitemap.xml'));
  assert.throws(()=>buildPublicPages(catalog,{siteUrl:'javascript:alert(1)'}));
});

test('User-provided article fields are escaped; no unreviewed content is indexed', () => {
  const original={id:'safe-original',publicPage:true,original:true,title:'Bad <script>alert(1)</script>',
    content:'Safe text <b>bold</b> '.repeat(170),
    descriptions:{ja:'安全 <img src=x onerror=alert(1)>'},
    readingGuide:[{heading:'<x>',explanation:'& punctuation'}],
    checkQuestions:[{prompt:'<iframe>',answer:'<b>text</b>'}]};
  const output=buildPublicPages({articles:[original]});
  const article=output.get('articles/safe-original/index.html');
  assert.ok(article.includes('&lt;script&gt;'));
  assert.ok(article.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!article.includes('<iframe>'));
  assert.ok(!article.includes('<b>text</b>'));
});

test('Committed public pages match catalog in the initial release', () => {
  const pages=buildPublicPages(catalog);
  const published=catalog.articles.filter(a=>a.publicPage===true&&a.original===true);
  for(const article of published){
    assert.equal(fs.readFileSync(path.join(root,'articles',article.id,'index.html'),'utf8'),
      pages.get('articles/'+article.id+'/index.html'));
  }
});
