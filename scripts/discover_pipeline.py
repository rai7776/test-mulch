#!/usr/bin/env python3
"""Read-only-by-default NASA RSS -> Discover pipeline."""
import argparse
import hashlib
import json
import re
import sys
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
from urllib.request import Request, urlopen
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
WORDS = re.compile(r"\b[A-Za-z]+(?:[’'-][A-Za-z]+)*\b")
DANGER = re.compile(r"(?i)\b(?:Reuters|Associated Press|Agence France-Presse|AFP|Getty Images|Shutterstock|copyright|used with permission|licensed from)\b")
SKIP = re.compile(r"(?i)(?:invites media|media advisory|media accreditation|funding opportunity|image of the day|apod:|photo of the day|seeks proposals|to welcome expedition|awards? .*contract)")
TOPICS = ("science","space","earth","moon","mars","planet","solar","astronaut","discovery","research","technology","exploration","climate","telescope","robot","mission","galaxy","universe","geology","earthquake","landslide","water","mineral","ecosystem","conservation")
DROP = "script,style,nav,form,aside,footer,figure,figcaption,iframe,.wp-block-image,.wp-block-embed,.caption,.share-tools,.related-content,.author-bio,.media-contact"

def clean(s):
    return re.sub(r"\s+"," ",(s or "").replace("\u200b","")).strip()

def canonical(url, source):
    p=urlsplit(url.strip())
    if p.scheme!="https" or p.username or p.password or p.port or p.hostname not in source["hosts"]:
        raise ValueError("Unapproved HTTPS host")
    if not any(p.path.startswith(prefix) for prefix in source["article_paths"]):
        raise ValueError("Unapproved article path")
    return urlunsplit(("https",p.hostname,p.path.rstrip("/")+"/","",""))

def fetch(url, hosts):
    p=urlsplit(url)
    if p.scheme!="https" or p.hostname not in hosts or p.username or p.password or p.port:
        raise ValueError("Offsite URL blocked")
    request=Request(url, headers={"User-Agent":"SmartReader-Discover/0.1","Accept":"text/html,application/rss+xml,application/xml;q=0.9"})
    with urlopen(request,timeout=20) as response:
        final=urlsplit(response.geturl())
        if final.scheme!="https" or final.hostname not in hosts:
            raise ValueError("Offsite redirect blocked")
        b=response.read(2_500_001)
        if len(b)>2_500_000:
            raise ValueError("Page too large")
    return b.decode("utf-8-sig",errors="replace")

def feed_entries(raw, source):
    doc=ET.fromstring(raw)
    result=[]
    for item in doc.findall("./channel/item"):
        url,title,pub=item.findtext("link"),item.findtext("title"),item.findtext("pubDate")
        if not all((url,title,pub)):
            continue
        try:
            link=canonical(url,source)
            date=parsedate_to_datetime(pub)
            if date.tzinfo is None:
                date=date.replace(tzinfo=timezone.utc)
        except (ValueError,TypeError,OverflowError):
            continue
        result.append({"url":link,"title":clean(title),"date":date.astimezone(timezone.utc).date(),
                       "html":item.findtext("{http://purl.org/rss/1.0/modules/content/}encoded") or "",
                       "creator":clean(item.findtext("{http://purl.org/dc/elements/1.1/}creator"))})
    return result

def blocks(raw, origin):
    doc=BeautifulSoup(raw,"html.parser")
    for node in doc.select(DROP):
        node.decompose()
    text=[]
    for node in doc.select("p,h2,h3,li"):
        if node.find_parent(("p","li","figcaption","figure","aside","nav","footer")):
            continue
        if node.name=="li" and node.find(("p","li")):
            continue
        line=clean(node.get_text(separator="",strip=False))
        if not line:
            continue
        if re.fullmatch(r"(?i)(?:related (?:stories|articles)|share this|contacts?|media contacts?|about the author)",line) or line.startswith("The USGS provides science for a changing world."):
            break
        if line in ("Sources/Usage: Public Domain.","View Media Details"):
            break
        if re.match(r"(?i)^(?:image credit|photo credit|credit:|photo:|video:)",line):
            continue
        if node.name=="p" and len(line)<15:
            continue
        if text and text[-1]==line:
            continue
        text.append(line)
    body="\n\n".join(text)
    return {"body":body,"words":len(WORDS.findall(body)),"paragraphs":len(text),"origin":origin}

def page_extract(html, expected_title=""):
    soup=BeautifulSoup(html,"html.parser")
    # USGS news templates use h2 for the page headline; NASA usually uses h1.
    headline_candidates=[clean(h.get_text(" ",strip=True)) for h in soup.select("h1,h2")]
    expected=clean(expected_title).casefold()
    title=next((t for t in headline_candidates if t.casefold()==expected), "")
    if not title:
        h=soup.select_one("h1.entry-title,main h1,article h1,h1")
        title=clean(h.get_text(" ",strip=True)) if h else ""
    selectors=("article .entry-content","article .article-content","article .wp-block-post-content",
               ".hds-content",".entry-content",".article-content",".field--name-body","[itemprop=articleBody]",
               ".wp-block-post-content",".field--type-text-with-summary",".field--name-field-body","main article","article","main")
    options=[]
    for selector in selectors:
        for el in soup.select(selector)[:3]:
            candidate=blocks(str(el),selector)
            if candidate["paragraphs"]>=3:
                options.append(candidate)
    return title,sorted(options,key=lambda b:(b["words"],b["paragraphs"]),reverse=True)

def build_article(entry, source, html, min_words=250, max_words=1300):
    if html:
        heading, options=page_extract(html, entry["title"])
        if not heading or clean(heading).casefold()!=entry["title"].casefold():
            raise ValueError("RSS and page title mismatch")
    else:
        # Official NASA RSS can supply authoring text when article pages rate-limit clients.
        # A missing page is allowed only when RSS content independently passes all checks.
        options=[]
    if SKIP.search(entry["title"]):
        raise ValueError("Administrative/image-only content")
    if entry["html"]:
        options.insert(0,blocks(entry["html"],"rss-authoring-content"))
    eligible=[o for o in options if o["paragraphs"]>=4 and min_words<=o["words"]<=max_words]
    if not eligible:
        best=max((o["words"] for o in options),default=0)
        raise ValueError("Insufficient complete body: "+str(best)+" words")
    selected=eligible[0]
    body=selected["body"]
    if DANGER.search(body) or DANGER.search(entry["creator"]):
        raise ValueError("Third-party/copyright marker")
    haystack=(entry["title"]+" "+body[:450]).lower()
    if not any(t in haystack for t in TOPICS):
        raise ValueError("Outside science learning themes")
    word_count=selected["words"]
    genres=["Science"]
    if any(x in haystack for x in ("technology","robot","engineering","spacecraft","mission")):
        genres.append("Technology")
    elif any(x in haystack for x in ("earth","climate","ocean","weather")):
        genres.append("Society")
    article={"id":source["id"]+"-"+hashlib.sha256(entry["url"].encode()).hexdigest()[:16],
             "type":"News","genres":genres,"tags":[],
             "difficulty":"初級" if word_count<450 else "中級" if word_count<950 else "上級",
             "minutes":max(1,(word_count+179)//180),
             "publishedAt":entry["date"].isoformat(),"title":entry["title"],"content":body,
             "language":"en","descriptions":{"en":"An original article from "+source["name"]+"."},
             "sourceName":source["name"],"sourceUrl":entry["url"],"licenseUrl":source["licenseUrl"],
             "contentType":"original","wordCount":word_count}
    score=(2 if 350<=word_count<=900 else 0)+min(word_count,900)/100
    score+=sum(t in entry["title"].lower() for t in TOPICS)
    return score,article,selected

def is_duplicate(article, articles):
    bodyhash=hashlib.sha256(article["content"].encode()).hexdigest()
    return any(a.get("id")==article["id"] or a.get("sourceUrl")==article["sourceUrl"]
               or clean(a.get("title","")).casefold()==clean(article["title"]).casefold()
               or hashlib.sha256(a.get("content","").encode()).hexdigest()==bodyhash
               for a in articles)

def run(args, getter=fetch):
    config=json.loads((ROOT/"discover-data/sources.json").read_text(encoding="utf-8"))
    source=next((x for x in config["sources"] if x["id"]==args.source and x["enabled"]),None)
    if not source:
        raise ValueError("Source is disabled until licensing and extraction are validated")
    index_path=ROOT/"discover-data/index.json"
    index=json.loads(index_path.read_text(encoding="utf-8"))
    if index.get("version")!=1 or "News" not in index.get("types",[]):
        raise ValueError("Discover index schema changed")
    feed_urls=source.get("feeds") or [source["feed"]]
    entries=[]
    feed_errors=[]
    for feed_url in feed_urls:
        try:
            entries+=feed_entries(getter(feed_url,source["hosts"]),source)
        except Exception as error:
            feed_errors.append({"url":feed_url,"error":str(error)[:100]})
    if not entries:
        raise ValueError("No recognizable RSS articles; feeds: "+str(feed_errors))
    entries=list({e["url"]:e for e in entries}.values())
    entries.sort(key=lambda x:x["date"],reverse=True)
    report={"source":args.source,"feed":source["feed"],"feed_errors":feed_errors,"items":len(entries),
            "fetched":0,"rejections":[],"selected":None,"result":"none",
            "rss_content_words":[{"title":e["title"],"words":blocks(e["html"],"rss")["words"] if e["html"] else 0} for e in entries[:10]]}
    if args.publish and not source.get("publish_approved",False):
        raise ValueError("Publishing from this source is not yet approved")
    now=datetime.now(timezone.utc).date()
    candidates=[]
    for e in entries[:args.max_candidates]:
        age=(now-e["date"]).days
        if age<0 or age>args.max_age_days:
            report["rejections"].append({"title":e["title"],"reason":"date outside limit"})
            continue
        if SKIP.search(e["title"]):
            report["rejections"].append({"title":e["title"],"reason":"low-learning-value announcement"})
            continue
        if any(a.get("sourceUrl")==e["url"] for a in index["articles"]):
            report["rejections"].append({"title":e["title"],"reason":"duplicate URL"})
            continue
        report["fetched"]+=1
        try:
            # Prefer the official RSS authoring content and avoid extra article requests.
            # Only if full RSS text fails validation should we fetch the HTML page.
            if e["html"]:
                try:
                    score,article,details=build_article(e,source,None,args.min_words,args.max_words)
                except ValueError:
                    page=getter(e["url"],source["hosts"])
                    score,article,details=build_article(e,source,page,args.min_words,args.max_words)
            else:
                page=getter(e["url"],source["hosts"])
                score,article,details=build_article(e,source,page,args.min_words,args.max_words)
            if is_duplicate(article,index["articles"]):
                raise ValueError("duplicate ID/title/text")
            candidates.append((score,e["date"],article,details))
        except Exception as exc:
            report["rejections"].append({"title":e["title"],"reason":str(exc)[:140]})
    if candidates:
        candidates.sort(key=lambda x:(x[0],x[1]),reverse=True)
        score,_,article,details=candidates[0]
        report["selected"]={key:article[key] for key in ("id","title","sourceUrl","publishedAt","wordCount","genres")}
        report["selected"]["paragraphs"]=details["paragraphs"]
        report["selected"]["extraction"]=details["origin"]
        Path(args.preview).write_text(json.dumps(article,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        if args.publish:
            index["articles"].append(article)
            if len({a["id"] for a in index["articles"]})!=len(index["articles"]):
                raise ValueError("Duplicate article ID")
            if not set(article["genres"]) <= set(index["genres"]):
                raise ValueError("Unknown genre")
            index_path.write_text(json.dumps(index,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
            report["result"]="added_one"
        else:
            report["result"]="preview_only"
    Path(args.report).write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return report

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--source",default="nasa",choices=["nasa","usgs"])
    p.add_argument("--publish",action="store_true")
    p.add_argument("--min-words",type=int,default=250)
    p.add_argument("--max-words",type=int,default=1300)
    p.add_argument("--max-age-days",type=int,default=30)
    p.add_argument("--max-candidates",type=int,default=15)
    p.add_argument("--preview",default="/tmp/discover-candidate.json")
    p.add_argument("--report",default="/tmp/discover-report.json")
    args=p.parse_args()
    if not (100<=args.min_words<=args.max_words<=3000 and 1<=args.max_candidates<=30 and 1<=args.max_age_days<=365):
        p.error("Invalid limits")
    try:
        run(args)
    except Exception as exc:
        print("PIPELINE_ERROR: "+str(exc),file=sys.stderr)
        sys.exit(1)

if __name__=="__main__":
    main()
