'use strict';
/**
 * Export static HTML for Cloudflare Pages deployment.
 * Crawls the running server (localhost:8080) and saves HTML + assets to dist/
 * This gives you a *.pages.dev URL to test before adding custom domain.
 * Dynamic routes (/cart, /order-request, /contact POST) will still need backend on Fly.io/Render,
 * but all catalog pages, product pages, about, guides will be static and CDN cached.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const BASE = process.env.EXPORT_BASE || 'http://localhost:8080';

const ROUTES = [
  '/',
  '/glock-pistols-for-sale',
  '/collections/glock-factory-handguns',
  '/collections/glock-factory-colored-handguns',
  '/collections/custom-glocks',
  '/collections/optic-ready-glocks',
  '/collections/gen-6-glocks',
  '/collections/glock-slides',
  '/collections/glock-triggers',
  '/models',
  '/calibers',
  '/about',
  '/contact',
  '/compliance',
  '/shipping-and-transfer-policy',
  '/returns-policy',
  '/privacy-policy',
  '/cookie-policy',
  '/terms-of-service',
  '/accessibility',
  '/guides',
  '/guides/glock-19-gen3-vs-gen5',
  '/guides/what-caliber-glock-texas',
  '/search',
  '/cart',
  '/order-request',
  '/sitemap.xml',
  '/sitemap-pages.xml',
  '/sitemap-collections.xml',
  '/sitemap-products.xml',
  '/robots.txt',
  '/llms.txt'
];

function fetch(url) {
  return new Promise((resolve, reject) => {
    const auditKey = process.env.AUDIT_KEY;
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      headers: auditKey ? { 'x-audit-key': auditKey } : {}
    };
    http.get(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log(`Exporting from ${BASE} to ${DIST}`);
  if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  // Get product slugs from DB or sitemap
  const { q } = require('../src/db');
  const slugs = q.allSlugs.all().map(r => r.slug);
  console.log(`Found ${slugs.length} product slugs`);
  const productRoutes = slugs.map(s => `/product/${s}`);
  
  // Get collection and caliber slugs
  const categories = q.categories.all();
  const collectionRoutes = categories.map(c => `/collections/${c.slug}`);
  const calibers = q.calibers.all();
  const caliberRoutes = calibers.map(c => `/calibers/${c.caliber_slug}`);
  const modelRoutes = [...new Set(q.categories.all().filter(c=>c.grp==='Models').map(c=>c.slug))].map(s=>`/collections/${s}`);

  const allRoutes = [...new Set([...ROUTES, ...productRoutes, ...collectionRoutes, ...caliberRoutes])];
  console.log(`Total routes to export: ${allRoutes.length}`);

  let ok = 0, fail = 0;
  for (const route of allRoutes) {
    const url = BASE + route;
    try {
      const { status, body, headers } = await fetch(url);
      if (status !== 200) {
        console.log(`  SKIP ${route} -> ${status}`);
        fail++;
        continue;
      }
      const contentType = headers['content-type'] || '';
      let filePath;
      if (route.endsWith('.xml') || route.endsWith('.txt')) {
        filePath = path.join(DIST, route);
      } else if (route === '/') {
        filePath = path.join(DIST, 'index.html');
      } else {
        filePath = path.join(DIST, route, 'index.html');
      }
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, body);
      ok++;
      if (ok % 50 === 0) console.log(`  ${ok}/${allRoutes.length} exported`);
    } catch (e) {
      console.log(`  FAIL ${route}: ${e.message}`);
      fail++;
    }
  }

  // Copy public assets
  const publicDir = path.join(ROOT, 'public');
  const copyRecursive = (src, dest) => {
    if (!fs.existsSync(src)) return;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.mkdirSync(dest, { recursive: true });
      for (const entry of fs.readdirSync(src)) {
        copyRecursive(path.join(src, entry), path.join(dest, entry));
      }
    } else {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  };
  copyRecursive(publicDir, path.join(DIST, 'public'));
  // Also copy public to dist root for assets referenced as /css/*, /js/*, /img/* etc
  // Our templates reference /css/site.css, /js/site.js, /img/... which are served from public/
  // In dist, we need them at /css, /js, /img
  for (const sub of ['css', 'js', 'img', 'favicon.svg', 'favicon.ico', 'site.webmanifest', 'apple-touch-icon.png', 'icon-32.png', 'icon-192.png', 'icon-512.png']) {
    const src = path.join(publicDir, sub);
    const dest = path.join(DIST, sub);
    if (fs.existsSync(src)) copyRecursive(src, dest);
  }

  // Generate search-index.json for client-side search (all product names)
  try {
    const allProducts = q.allSlugs ? q.allSlugs.all() : [];
    // Get full product data for search
    const products = [];
    const db = require('../src/db');
    const rows = db.q.productsForSearch ? db.q.productsForSearch.all() : db.q.allProducts ? db.q.allProducts.all() : [];
    // Fallback: query directly
    const sqlite = require('better-sqlite3');
    const path = require('path');
    const dbPath = path.join(__dirname, '..', 'data', 'catalog.db');
    const sdb = new sqlite(dbPath, { readonly: true });
    const prods = sdb.prepare('SELECT id, slug, name, sku, model, caliber, product_class, price_cents, primary_image FROM products').all();
    sdb.close();
    const index = prods.map(p => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      sku: p.sku,
      model: p.model,
      caliber: p.caliber,
      product_class: p.product_class,
      price_cents: p.price_cents,
      image: p.primary_image,
      searchText: [p.name, p.sku, p.model ? 'Glock '+p.model : '', p.caliber, p.product_class].filter(Boolean).join(' ').toLowerCase()
    }));
    fs.writeFileSync(path.join(DIST, 'search-index.json'), JSON.stringify(index));
    console.log(`Search index: ${index.length} products`);
  } catch (e) {
    console.log('Search index generation failed:', e.message);
    // Fallback minimal index
    try {
      const fs = require('fs');
      const path = require('path');
      const sqlite = require('better-sqlite3');
      const dbPath = path.join(__dirname, '..', 'data', 'catalog.db');
      const sdb = new sqlite(dbPath, { readonly: true });
      const prods = sdb.prepare('SELECT id, slug, name, sku, model, caliber, product_class, price_cents, primary_image FROM products').all();
      sdb.close();
      const index = prods.map(p => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        sku: p.sku,
        model: p.model,
        caliber: p.caliber,
        product_class: p.product_class,
        price_cents: p.price_cents,
        image: p.primary_image,
        searchText: [p.name, p.sku, p.model ? 'Glock '+p.model : '', p.caliber, p.product_class].filter(Boolean).join(' ').toLowerCase()
      }));
      const DIST = path.join(__dirname, '..', 'dist');
      fs.mkdirSync(DIST, { recursive: true });
      fs.writeFileSync(path.join(DIST, 'search-index.json'), JSON.stringify(index));
      console.log(`Search index fallback: ${index.length} products`);
    } catch (e2) {
      console.log('Fallback also failed:', e2.message);
    }
  }

  // Create _headers for Cloudflare Pages caching
  fs.writeFileSync(path.join(DIST, '_headers'), `
/css/*
  Cache-Control: public, max-age=31536000, immutable
/js/*
  Cache-Control: public, max-age=31536000, immutable
/img/*
  Cache-Control: public, max-age=2592000
/*.jpg
  Cache-Control: public, max-age=2592000
/*.webp
  Cache-Control: public, max-age=2592000
/*.svg
  Cache-Control: public, max-age=31536000, immutable
/sitemap*.xml
  Cache-Control: public, max-age=3600
/robots.txt
  Cache-Control: public, max-age=3600
`.trim() + '\n');

  // Create _redirects for SPA fallback and for dynamic routes to backend (optional)
  // For now, all static. Cart and order-request will be static HTML but POST will fail without backend.
  // You can later proxy /cart and /order-request to Fly.io via Cloudflare Workers.
  fs.writeFileSync(path.join(DIST, '_redirects'), `
# Cloudflare Pages redirects
# Dynamic routes that need backend - uncomment and set your Fly URL when backend is live
# /cart/* https://9mmreloaders.fly.dev/cart/:splat 200
# /order-request/* https://9mmreloaders.fly.dev/order-request/:splat 200
# /contact https://9mmreloaders.fly.dev/contact 200

# Fallback for SPA (not needed for this MPA, but keeps 404 page)
# /* /404.html 404
`.trim() + '\n');

  console.log(`\nExport complete: ${ok} ok, ${fail} failed`);
  console.log(`Dist size: ${fs.readdirSync(DIST).length} top-level entries`);
  console.log(`\nTo deploy to Cloudflare Pages:`);
  console.log(`  npx wrangler pages deploy dist --project-name=9mmreloaders`);
  console.log(`  Or connect GitHub repo in Cloudflare dashboard -> Pages -> Create project -> Build command: npm run export, Output: dist`);
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1); });
} else {
  module.exports = { main };
}
