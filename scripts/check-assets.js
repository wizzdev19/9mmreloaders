'use strict';
/**
 * Asset and console error check.
 *
 * There is no headless browser in this environment, so "no console errors" is verified
 * the only honest way available: every asset the HTML actually references is fetched
 * and must return 200. A 404 on a stylesheet, a script, an image, a font or an icon is
 * exactly what fills a browser console, and this catches all of them.
 *
 * It also enforces the payload rules:
 *   - no source map is served in production and no .map file is referenced,
 *   - no bundler runtime reaches the browser (no Vite client, no React, no hydration),
 *   - the total JavaScript on any page stays under a hard ceiling,
 *   - no inline event handler attributes, which the CSP would block anyway.
 *
 * Usage: node scripts/check-assets.js [origin]
 */
const ORIGIN = process.argv[2] || process.env.SITE_ORIGIN || 'http://localhost:8080';

const JS_CEILING_KB = 20;      // total JavaScript bytes allowed on a single page
const CSS_CEILING_KB = 60;     // total CSS bytes allowed on a single page
const HTML_CEILING_KB = 120;   // a single HTML document

const PAGES = [
  '/', '/glock-pistols-for-sale', '/glock-pistols-for-sale?page=2', '/models', '/calibers',
  '/calibers/9mm', '/collections/glock-19-for-sale', '/collections/glock-slides',
  '/search?q=glock+19', '/cart', '/order-request', '/contact', '/about', '/compliance',
  '/privacy-policy', '/cookie-policy', '/terms-of-service', '/returns-policy',
  '/shipping-and-transfer-policy', '/accessibility', '/this-page-does-not-exist'
];

const BANNED_SOURCES = [
  [/\/@vite\/client/, 'Vite dev client'],
  [/react(-dom)?(\.production|\.development)?\.js/i, 'React runtime'],
  [/__vite|__NEXT_DATA__|window\.__remix/i, 'framework hydration payload'],
  [/\bsourceMappingURL\b/, 'source map reference'],
  [/\.map(["'\s>]|$)/, 'source map file reference']
];

const errors = [];
const warnings = [];
const seen = new Map();

async function head(url) {
  if (seen.has(url)) return seen.get(url);
  const res = await fetch(url, { redirect: 'manual' });
  const buf = res.status === 200 ? Buffer.from(await res.arrayBuffer()) : Buffer.alloc(0);
  const info = { status: res.status, bytes: buf.length, type: res.headers.get('content-type') || '' };
  seen.set(url, info);
  return info;
}

function assetsIn(html) {
  const out = new Set();
  const push = (u) => {
    if (!u) return;
    const clean = u.trim();
    if (!clean || clean.startsWith('data:') || clean.startsWith('#') || clean.startsWith('mailto:') || clean.startsWith('tel:')) return;
    if (/^https?:\/\//i.test(clean)) return; // external hosts are out of scope, and there are none
    out.add(clean);
  };

  for (const m of html.matchAll(/<link[^>]+href="([^"]+)"/g)) push(m[1]);
  for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) push(m[1]);
  for (const m of html.matchAll(/<img[^>]+src="([^"]+)"/g)) push(m[1]);
  for (const m of html.matchAll(/srcset="([^"]+)"/g)) {
    for (const candidate of m[1].split(',')) push(candidate.trim().split(/\s+/)[0]);
  }
  return [...out];
}

(async () => {
  for (const path of PAGES) {
    const res = await fetch(ORIGIN + path, { redirect: 'manual' });
    // /order-request redirects to the cart when the cart is empty, which is correct.
    const expected = path === '/this-page-does-not-exist' ? [404]
      : path === '/order-request' ? [200, 303]
        : [200];
    if (!expected.includes(res.status)) { errors.push(`${path} returned ${res.status}, expected ${expected.join(' or ')}`); continue; }
    if (res.status !== 200) continue;
    const html = await res.text();

    const htmlKb = Buffer.byteLength(html) / 1024;
    if (htmlKb > HTML_CEILING_KB) warnings.push(`${path} HTML is ${htmlKb.toFixed(1)} KB, over the ${HTML_CEILING_KB} KB guide`);

    for (const [re, label] of BANNED_SOURCES) {
      if (re.test(html)) errors.push(`${path} references a ${label}`);
    }

    // Inline handlers would be blocked by script-src-attr 'none' and would log an error.
    const inlineHandler = html.match(/\son(click|load|error|submit|change|mouseover)=/i);
    if (inlineHandler) errors.push(`${path} has an inline ${inlineHandler[1]} handler, which the CSP blocks`);

    // Any inline <script> must carry the per request nonce or the CSP blocks it.
    for (const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)) {
      if (!/nonce="/.test(m[1])) errors.push(`${path} has an inline script with no nonce`);
    }

    let jsBytes = 0;
    let cssBytes = 0;

    for (const asset of assetsIn(html)) {
      const url = new URL(asset, ORIGIN).toString();
      const info = await head(url);
      if (info.status !== 200) {
        errors.push(`${path} references ${asset} which returned ${info.status}`);
        continue;
      }
      if (/\.js(\?|$)/.test(asset)) jsBytes += info.bytes;
      if (/\.css(\?|$)/.test(asset)) cssBytes += info.bytes;
    }

    if (jsBytes / 1024 > JS_CEILING_KB) errors.push(`${path} loads ${(jsBytes / 1024).toFixed(1)} KB of JavaScript, over the ${JS_CEILING_KB} KB ceiling`);
    if (cssBytes / 1024 > CSS_CEILING_KB) errors.push(`${path} loads ${(cssBytes / 1024).toFixed(1)} KB of CSS, over the ${CSS_CEILING_KB} KB ceiling`);
  }

  // A product page carries the largest image payload, so it is measured separately.
  const listing = await (await fetch(ORIGIN + '/glock-pistols-for-sale')).text();
  const firstProduct = (listing.match(/href="(\/product\/[^"]+)"/) || [])[1];
  if (firstProduct) {
    const html = await (await fetch(ORIGIN + firstProduct)).text();
    for (const asset of assetsIn(html)) {
      const info = await head(new URL(asset, ORIGIN).toString());
      if (info.status !== 200) errors.push(`${firstProduct} references ${asset} which returned ${info.status}`);
    }
    if (!/<picture>/.test(html)) errors.push(`${firstProduct} does not use a responsive <picture> element`);
    if (!/type="image\/webp"/.test(html)) errors.push(`${firstProduct} serves no WebP candidate`);
    const altless = [...html.matchAll(/<img(?![^>]*\balt=)[^>]*>/g)];
    if (altless.length) errors.push(`${firstProduct} has ${altless.length} image(s) with no alt attribute`);
  }

  // Nothing may serve a source map, whether or not any page links to one.
  for (const probe of ['/js/site.js.map', '/js/measurement.js.map', '/css/site.css.map']) {
    const info = await head(ORIGIN + probe);
    if (info.status === 200) errors.push(`${probe} is served. Source maps must not be published.`);
  }

  const fetched = seen.size;
  console.log(`Asset check: ${PAGES.length} pages, ${fetched} unique assets fetched from ${ORIGIN}`);
  warnings.forEach((w) => console.log(`  warn  ${w}`));
  if (errors.length) {
    errors.forEach((e) => console.error(`  FAIL  ${e}`));
    console.error(`\n${errors.length} problem(s) that would appear in a browser console.`);
    process.exit(1);
  }
  console.log('  Every referenced asset returned 200. No framework runtime, no source maps, no inline handlers.');
})();
