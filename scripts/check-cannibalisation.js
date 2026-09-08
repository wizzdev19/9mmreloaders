'use strict';
/**
 * Keyword cannibalisation check.
 *
 * Crawls the running site and fails if two indexable URLs compete with each other:
 * identical title tags, identical H1s, or a shared primary keyword taken from
 * docs/KEYWORD-MAP.md. Pages that carry a noindex directive are reported but never
 * fail the build, because a noindex page cannot cannibalise anything.
 *
 * Usage: node scripts/check-cannibalisation.js [origin]
 */
require('dotenv').config();

const ORIGIN = process.argv[2] || process.env.SITE_ORIGIN || 'http://localhost:8080';
const AUDIT_HEADERS = process.env.AUDIT_KEY ? { 'x-audit-key': process.env.AUDIT_KEY } : {};

/* The primary term each URL pattern is allowed to own. Mirrors docs/KEYWORD-MAP.md. */
const PRIMARY = [
  [/^\/$/, 'glock retailer texas'],
  [/^\/glock-pistols-for-sale$/, 'glock pistols for sale'],
  [/^\/models$/, 'glock models list'],
  [/^\/calibers$/, 'glock calibers'],
  [/^\/collections\/glock-(\d{2})-for-sale$/, (m) => `glock ${m[1]} for sale`],
  [/^\/collections\/([a-z0-9-]+)$/, (m) => `collection ${m[1]}`],
  [/^\/calibers\/([a-z0-9-]+)$/, (m) => `caliber ${m[1]}`]
];

function primaryFor(pathname) {
  for (const [re, term] of PRIMARY) {
    const m = pathname.match(re);
    if (m) return typeof term === 'function' ? term(m) : term;
  }
  return null;
}

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase();

async function get(path) {
  const res = await fetch(ORIGIN + path, { redirect: 'manual', headers: AUDIT_HEADERS });
  const body = res.status === 200 ? await res.text() : '';
  return { status: res.status, body };
}

function tag(html, re) {
  const m = html.match(re);
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : '';
}

async function collectUrls() {
  const urls = ['/', '/glock-pistols-for-sale', '/models', '/calibers'];
  const { body } = await get('/sitemap-collections.xml');
  for (const m of body.matchAll(/<loc>([^<]+)<\/loc>/g)) urls.push(new URL(m[1]).pathname);
  return [...new Set(urls)];
}

(async () => {
  const urls = await collectUrls();
  const byTitle = new Map();
  const byH1 = new Map();
  const byTerm = new Map();
  const errors = [];
  const notes = [];

  for (const path of urls) {
    const { status, body } = await get(path);
    if (status !== 200) { errors.push(`${path} returned ${status}`); continue; }

    const robots = norm(tag(body, /<meta name="robots" content="([^"]*)"/));
    if (robots.includes('noindex')) { notes.push(`${path} is noindex, excluded from the comparison`); continue; }

    const title = norm(tag(body, /<title>([^<]*)<\/title>/));
    const h1 = norm(tag(body, /<h1[^>]*>([\s\S]*?)<\/h1>/));
    const term = primaryFor(path);

    for (const [map, value, label] of [[byTitle, title, 'title'], [byH1, h1, 'H1'], [byTerm, term, 'primary keyword']]) {
      if (!value) { if (label !== 'primary keyword') errors.push(`${path} has no ${label}`); continue; }
      if (map.has(value)) errors.push(`Duplicate ${label} "${value}" on ${map.get(value)} and ${path}`);
      else map.set(value, path);
    }

    // A page must not use another page's model phrase in its own title.
    const foreign = [...byTerm.keys()].filter((t) => /^glock \d{2} for sale$/.test(t) && t !== term && title.includes(t));
    if (foreign.length) errors.push(`${path} uses another page's primary keyword in its title: ${foreign.join(', ')}`);
  }

  console.log(`Cannibalisation check: ${urls.length} indexable hub and collection URLs compared against ${ORIGIN}`);
  notes.forEach((n) => console.log(`  note  ${n}`));
  if (errors.length) {
    errors.forEach((e) => console.error(`  FAIL  ${e}`));
    console.error(`\n${errors.length} collision(s). See docs/KEYWORD-MAP.md for the rule each URL is meant to follow.`);
    process.exit(1);
  }
  console.log('  No duplicate titles, H1s or primary keywords among indexable pages.');
})();
