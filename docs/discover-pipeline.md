# Discover RSS automation trial

## Initial sources

- NASA news releases (enabled): https://www.nasa.gov/news-release/feed/
- NASA rights guidance: https://www.nasa.gov/nasa-brand-center/images-and-media/
- USGS national releases (disabled until extraction and rights review): https://www.usgs.gov/news/national-news-release/feed
- USGS rights guidance: https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits
- NOAA is a future source; see https://www.noaa.gov/office-education/outreach-communication/faq

## Running

GitHub > Actions > Discover RSS pipeline trial > Run workflow.

- publish=false (default): find, score, extract and validate NASA articles, upload a complete candidate JSON preview, but do not update Discover.
- publish=true: append at most one eligible article to discover-data/index.json and commit it to main.
- Push-triggered runs always preview, never publish. No daily schedule is active.
- Unknown rights, third-party content indicators, incomplete extraction, duplicate articles and offsite URL redirects result in skipping the article.
- The source article's English wording is retained; only HTML markup and extraneous whitespace are removed.
- Check the Artifacts section for discover-rss-trial, containing the candidate and a rejection report.

Rule-based checks are conservative and do not constitute a legal guarantee. Review original-source credits and extraction quality before enabling daily unsupervised publishing.
Existing Discover UI and saved learning records are not modified by this workflow.
