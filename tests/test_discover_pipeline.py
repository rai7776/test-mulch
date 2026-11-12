"""Offline regression tests for NASA RSS extraction; no network."""
import importlib.util
import json
import unittest
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path

PATH=Path(__file__).resolve().parents[1]/"scripts"/"discover_pipeline.py"
spec=importlib.util.spec_from_file_location("pipeline",PATH)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
NASA=json.loads((PATH.parents[1]/"discover-data"/"sources.json").read_text())["sources"][0]

def html(title="NASA Discovers New Science",paras=6,third_party=False):
    parts=[]
    for i in range(paras):
        phrase="NASA researchers studied observations from the space telescope to understand the Moon and its changing landscape. "
        phrase=phrase*7+f" Result number {i} is described in detail."
        if i==0 and third_party:phrase+=" Reuters provided this reporting."
        parts.append("<p>"+phrase+"</p>")
    return "<html><main><article><h1>"+title+"</h1><div class='entry-content'>"+''.join(parts)+"</div></article></main></html>"

def rss():
    date=format_datetime(datetime.now(timezone.utc))
    return "<rss><channel><item><title>NASA Discovers New Science</title><link>https://www.nasa.gov/news-release/nasa-discovers-new-science/</link><pubDate>"+date+"</pubDate></item></channel></rss>"

class PipelineTests(unittest.TestCase):
    def entry(self):
        return mod.feed_entries(rss(),NASA)[0]

    def test_restricted_host_and_path(self):
        self.assertEqual(mod.canonical("https://www.nasa.gov/news-release/abc/?utm=a",NASA),
                         "https://www.nasa.gov/news-release/abc/")
        for u in ("https://www.nasa.gov.evil.net/news-release/hi/",
                  "http://www.nasa.gov/news-release/hi/",
                  "https://www.nasa.gov/blog/not-a-release/"):
            with self.assertRaises(ValueError):
                mod.canonical(u,NASA)

    def test_rss_date(self):
        self.assertEqual(len(mod.feed_entries(rss(),NASA)),1)
        self.assertEqual(self.entry()["date"],datetime.now(timezone.utc).date())

    def test_title_mismatch(self):
        with self.assertRaisesRegex(ValueError,"title mismatch"):
            mod.build_article(self.entry(),NASA,html("Unrelated Title"))

    def test_original_paragraphs_and_schema(self):
        score,article,details=mod.build_article(self.entry(),NASA,html())
        self.assertGreater(score,0)
        self.assertEqual(article["type"],"News")
        self.assertEqual(article["sourceName"],"NASA")
        self.assertIn("\n\n",article["content"])
        self.assertEqual(details["paragraphs"],6)
        self.assertEqual(article["wordCount"],len(mod.WORDS.findall(article["content"])))

    def test_third_party_marker_rejected(self):
        with self.assertRaisesRegex(ValueError,"Third-party"):
            mod.build_article(self.entry(),NASA,html(third_party=True))

    def test_missing_body_rejected(self):
        with self.assertRaisesRegex(ValueError,"Insufficient"):
            mod.build_article(self.entry(),NASA,html(paras=1))

    def test_duplicate(self):
        _,article,_=mod.build_article(self.entry(),NASA,html())
        self.assertTrue(mod.is_duplicate(article,[article]))
        self.assertFalse(mod.is_duplicate(article,[]))

    def test_no_rewriting_of_emphasis(self):
        raw="<div><p>NASA <em>researchers</em> explored the Moon.</p><p>They collected data.</p></div>"
        b=mod.blocks(raw,"fixture")
        self.assertIn("NASA researchers explored the Moon.",b["body"])

if __name__=="__main__":
    unittest.main()
