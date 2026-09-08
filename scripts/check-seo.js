'use strict';
/**
 * On page SEO and accessibility crawler.
 *
 * Crawls the running site from the home page and checks the technical items that
 * Google's SEO Starter Guide and ecommerce guidance actually specify. It reports
 * conformance. It says nothing about rankings, because no tool and no developer
 * can promise those.
 *
 * Usage: npm run audit:seo   (with the server running)
 *        BASE=http://localhost:8080 MAX=400 npm run audit:seo
 */
require('dotenv').config();

const BASE = (process.env.BASE || 'http://localhost:8080').replace(/\/+$/, '');
// A crawl of several hundred pages looks exactly like abuse to the rate limiter,
// so a local run presents the dev only audit key. It is ignored in production.
const AUDIT_HEADERS = process.env.AUDIT_KEY ? { 'x-audit-key': process.env.AUDIT_KEY } : {};
const MAX_PAGES = Number(process.env.MAX || 250);

const visited = new Map();
const queue = ['/'];
const issues = [];
const titles = new Map();
const descriptions = new Map();
const h1s = new Map();

// Length must be measured on the text a user sees, not on the encoded HTML,
// otherwise every ampersand and quote inflates the count by four characters.
const decodeEntities = (str) => String(str || '')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&');

const attr = (tag, name) => {
  const m = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag) || new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i').exec(tag);
  return m ? m[1] : null;
};

function metaContent(html, nameAttr, value) {
  const re = new RegExp(`<meta[^>]*${nameAttr}\\s*=\\s*["']${value}["'][^>]*>`, 'i');
  const tag = re.exec(html);
  return tag ? attr(tag[0], 'content') : null;
}

function add(path, level, message) {
  issues.push({ path, level, message });
}

async function check(path) {
  const url = BASE + path;
  let res;
  try {
    res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'seo-audit/1.0', ...AUDIT_HEADERS } });
  } catch (err) {
    add(path, 'error', 'request failed: ' + err.message);
    return;
  }
  visited.set(path, res.status);

  if (res.status >= 300 && res.status < 400) return;
  if (res.status >= 400) { add(path, 'error', `HTTP ${res.status}`); return; }
  const type = res.headers.get('content-type') || '';
  if (!type.includes('text/html')) return;

  const html = await res.text();

  /* ---------------------------------------------------- head checks */

  const canonicalEarly = (() => {
    const tag = /<link[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.exec(html);
    return tag ? attr(tag[0], 'href') : null;
  })();
  // A page that points its canonical at a different URL is not a duplicate problem,
  // it is the consolidation Google asks for, so it is excluded from the checks below.
  const canonicalised = Boolean(canonicalEarly) && canonicalEarly !== BASE + path;

  const title = decodeEntities((/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1]?.trim());
  if (!title) add(path, 'error', 'no <title>');
  else {
    if (title.length > 70) add(path, 'warn', `title is ${title.length} characters, likely truncated in results`);
    if (title.length < 15) add(path, 'warn', `title is only ${title.length} characters`);
    if (!canonicalised) {
      if (titles.has(title)) add(path, 'error', `duplicate title, also used by ${titles.get(title)}`);
      else titles.set(title, path);
    }
  }

  const desc = decodeEntities(metaContent(html, 'name', 'description'));
  if (!desc) add(path, 'error', 'no meta description');
  else {
    if (desc.length > 165) add(path, 'warn', `meta description is ${desc.length} characters`);
    if (desc.length < 50) add(path, 'warn', `meta description is only ${desc.length} characters`);
    if (!canonicalised) {
      if (descriptions.has(desc)) add(path, 'error', `duplicate meta description, also used by ${descriptions.get(desc)}`);
      else descriptions.set(desc, path);
    }
  }

  const canonical = canonicalEarly;
  if (!canonical) add(path, 'error', 'no canonical link');
  else if (!canonical.startsWith('http')) add(path, 'error', 'canonical is not absolute');

  const robots = metaContent(html, 'name', 'robots');
  const indexable = !robots || !/noindex/i.test(robots);

  if (!/<html[^>]+lang=/i.test(html)) add(path, 'error', 'no lang attribute on <html>');
  if (!/<meta[^>]+name=["']viewport["']/i.test(html)) add(path, 'error', 'no viewport meta');
  if (!/rel=["']icon["']/i.test(html)) add(path, 'error', 'no favicon link');

  /* --------------------------------------------------- body checks */

  const found = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)];
  if (found.length === 0) add(path, 'error', 'no h1');
  if (found.length > 1) add(path, 'error', `${found.length} h1 elements`);
  if (found.length === 1 && indexable && !canonicalised) {
    // Two indexable pages sharing an H1 are two pages competing for one query.
    const heading = decodeEntities(found[0][1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (h1s.has(heading)) add(path, 'error', `duplicate h1 "${heading.slice(0, 50)}", also used by ${h1s.get(heading)}`);
    else h1s.set(heading, path);
  }

  // Every page except the home page should tell a crawler where it sits.
  if (path !== '/' && indexable && !/BreadcrumbList/.test(html)) add(path, 'warn', 'no BreadcrumbList structured data');
  if (path !== '/' && indexable && !/class="breadcrumbs"/.test(html)) add(path, 'warn', 'no visible breadcrumb trail');

  const imgs = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]);
  for (const img of imgs) {
    if (attr(img, 'alt') === null) add(path, 'error', 'img without an alt attribute: ' + (attr(img, 'src') || '').slice(0, 60));
    if (!attr(img, 'width') || !attr(img, 'height')) {
      add(path, 'warn', 'img without width and height, which can cause layout shift: ' + (attr(img, 'src') || '').slice(0, 60));
    }
  }

  const inlineStyles = [...html.matchAll(/<[^>]+\sstyle\s*=/gi)];
  if (inlineStyles.length) add(path, 'warn', `${inlineStyles.length} inline style attribute(s), the CSP forbids them`);
  if (/<a[^>]*href\s*=\s*["']#["'][^>]*>/i.test(html)) add(path, 'warn', 'placeholder href="#" link');
  if (/javascript:/i.test(html)) add(path, 'error', 'javascript: URL present');

  const skip = /<a[^>]*class=["'][^"']*skip-link/i.test(html);
  if (!skip) add(path, 'warn', 'no skip link');

  /* --------------------------------------------- structured data */

  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const node = JSON.parse(m[1]);
      if (!node['@context'] || !node['@type']) add(path, 'error', 'structured data missing @context or @type');
      if (JSON.stringify(node).includes('aggregateRating')) add(path, 'error', 'aggregateRating emitted without genuine reviews');
    } catch (err) {
      add(path, 'error', 'structured data is not valid JSON: ' + err.message);
    }
  }

  /* ------------------------------------------------- link harvest */

  if (indexable) {
    for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["']/gi)) {
      const href = m[1];
      if (/^(https?:|mailto:|tel:)/i.test(href)) continue;
      const clean = href.split('#')[0];
      if (!clean.startsWith('/')) continue;
      if (/\.(jpe?g|png|webp|svg|ico|xml|txt|css|js)$/i.test(clean)) continue;
      if (!visited.has(clean) && !queue.includes(clean)) queue.push(clean);
    }
  }
}

(async () => {
  console.log(`Crawling ${BASE} (max ${MAX_PAGES} pages)`);
  while (queue.length && visited.size < MAX_PAGES) {
    const next = queue.shift();
    await check(next);
    if (visited.size % 25 === 0) process.stdout.write(`  ${visited.size} pages\n`);
  }

  /* -------------------------------------------- site level checks */

  const robotsRes = await fetch(BASE + '/robots.txt', { headers: AUDIT_HEADERS });
  if (!robotsRes.ok) add('/robots.txt', 'error', 'robots.txt not served');
  const robotsBody = await robotsRes.text();
  if (robotsRes.ok && !/sitemap:/i.test(robotsBody) && !/Disallow: \/\s*$/.test(robotsBody.trim())) {
    add('/robots.txt', 'error', 'robots.txt does not reference a sitemap');
  }

  const smRes = await fetch(BASE + '/sitemap.xml', { headers: AUDIT_HEADERS });
  if (!smRes.ok) add('/sitemap.xml', 'error', 'sitemap index not served');
  const productSm = await fetch(BASE + '/sitemap-products.xml', { headers: AUDIT_HEADERS });
  const productXml = productSm.ok ? await productSm.text() : '';
  const sitemapUrls = [...productXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  console.log('\n================ SEO AUDIT ================');
  console.log(`Pages crawled:            ${visited.size}`);
  console.log(`Product URLs in sitemap:  ${sitemapUrls.length}`);
  console.log(`Unique titles:            ${titles.size}`);
  console.log(`Unique descriptions:      ${descriptions.size}`);
  console.log(`Unique h1 headings:       ${h1s.size}`);

  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');

  const summarise = (list, label) => {
    if (!list.length) return;
    console.log(`\n${label} (${list.length})`);
    const grouped = new Map();
    for (const i of list) {
      const key = i.message.replace(/[0-9]+/g, 'N').slice(0, 80);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(i.path);
    }
    for (const [key, paths] of grouped) {
      console.log(`  ${key}`);
      console.log(`    ${paths.length} page(s), for example ${paths.slice(0, 3).join(', ')}`);
    }
  };

  summarise(errors, 'ERRORS');
  summarise(warns, 'WARNINGS');

  console.log('\nNote: this checks technical conformance only. Rankings depend on content,');
  console.log('reputation and competition, and cannot be guaranteed by any implementation.');
  process.exit(errors.length ? 1 : 0);
})();
