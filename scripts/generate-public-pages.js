#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { buildPublicPages } = require('../public-pages-core.js');

const root = path.resolve(__dirname, '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'discover-data/index.json'), 'utf8'));
const pages = buildPublicPages(catalog, { siteUrl: process.env.SITE_URL || '' });
const manifest = 'articles/.generated-pages.json';
const oldManifestPath = path.join(root, manifest);
let previous = [];
if (fs.existsSync(oldManifestPath)) {
  const parsed = JSON.parse(fs.readFileSync(oldManifestPath, 'utf8'));
  if (!Array.isArray(parsed.files)) throw new Error('Invalid generated pages manifest');
  previous = parsed.files;
}
const generatedPaths = [...pages.keys()].sort();
pages.set(manifest, JSON.stringify({ version: 1, files: generatedPaths }, null, 2) + '\n');
const stale = previous.filter(name => !pages.has(name));
const safePath = name => (name === 'robots.txt' || name === 'sitemap.xml' || /^articles\/[a-z0-9-]+\/index\.html$/.test(name) || name === 'articles/index.html' || name === 'articles/public-articles.css');
for (const name of [...pages.keys(), ...stale]) {
  if (name !== manifest && !safePath(name)) throw new Error('Unsafe generated file path: ' + name);
  const absolute = path.resolve(root, name);
  if (!absolute.startsWith(root + path.sep)) throw new Error('Unexpected file outside repository: ' + name);
}
const checkOnly = process.argv.includes('--check');
let changed = 0;
for (const [name, content] of pages) {
  const fullPath = path.join(root, name);
  const existing = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : null;
  if (existing === content) continue;
  changed += 1;
  if (!checkOnly) {
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log('Generated: ' + name);
  } else {
    console.error('Out of date: ' + name);
  }
}
for (const name of stale) {
  const fullPath = path.join(root, name);
  if (!fs.existsSync(fullPath)) continue;
  changed += 1;
  if (checkOnly) console.error('Stale generated page: ' + name);
  else {
    fs.unlinkSync(fullPath);
    console.log('Removed stale generated page: ' + name);
  }
}
if (checkOnly && changed) process.exitCode = 1;
else console.log(checkOnly ? 'Public pages are up to date.' : 'Public pages generated (' + (pages.size - 1) + ' files).');
if (!process.env.SITE_URL && !checkOnly) console.warn('SITE_URL is not configured. Set SMART_READER_SITE_URL as a GitHub Actions variable to generate canonical tags and sitemap.');
