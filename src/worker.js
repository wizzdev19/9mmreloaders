/**
 * Cloudflare Workers version of 9mmreloaders
 * Uses Hono + D1 (catalog) + R2 (images) + D1 (submissions)
 * This replaces Express + better-sqlite3 for Workers deployment
 * 
 * Deploy: wrangler deploy -c wrangler.toml
 * Requires: D1 database 9mmreloaders-catalog and R2 bucket 9mmreloaders-images
 */

import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';

const app = new Hono();

// Helper to query D1
async function queryD1(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const result = params.length ? stmt.bind(...params) : stmt;
  return await result.all();
}

async function getOne(db, sql, params = []) {
  const stmt = db.prepare(sql);
  const result = params.length ? stmt.bind(...params) : stmt;
  return await result.first();
}

// Home page - simplified
app.get('/', async (c) => {
  const db = c.env.CATALOG_DB;
  const count = await getOne(db, 'SELECT COUNT(*) as c FROM products');
  const priceRange = await getOne(db, 'SELECT MIN(price_cents) lo, MAX(price_cents) hi FROM products');
  // Render simple HTML for now - in production you'd use same EJS templates via string rendering or pre-render
  return c.html(`
    <!DOCTYPE html>
    <html><head><title>9mmreloaders - Glock Pistols</title>
    <link rel="stylesheet" href="/css/site.css">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    </head><body>
    <h1>Glock pistols, slides and triggers from a licensed Texas dealer</h1>
    <p>${count.c} listings, $${(priceRange.lo/100).toFixed(2)} to $${(priceRange.hi/100).toFixed(2)}</p>
    <p><a href="/glock-pistols-for-sale">Browse all ${count.c} listings</a></p>
    <p>Workers deployment - full catalog available via D1. For full SSR, use Fly.io backend with Cloudflare in front (see docs/CLOUDFLARE.md)</p>
    </body></html>
  `);
});

// Health check
app.get('/health', (c) => c.json({ ok: true, products: 379 }));

// Serve R2 images
app.get('/img/products/:file', async (c) => {
  const file = c.req.param('file');
  const bucket = c.env.PRODUCT_IMAGES;
  if (!bucket) return c.notFound();
  const obj = await bucket.get(`products/${file}`);
  if (!obj) return c.notFound();
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=2592000');
  headers.set('Content-Type', obj.httpMetadata?.contentType || 'image/jpeg');
  return new Response(obj.body, { headers });
});

// Fallback - for now proxy to static Pages or return 404 with instructions
app.get('*', (c) => {
  return c.html(`
    <h1>9mmreloaders Workers - Coming Soon</h1>
    <p>This is the Workers scaffold. Full catalog is in D1 (${c.env.CATALOG_DB ? 'connected' : 'not connected'}).</p>
    <p>For now, use Cloudflare Pages for static catalog: <a href="https://9mmreloaders.pages.dev">9mmreloaders.pages.dev</a></p>
    <p>Or deploy Express backend to Fly.io dfw region for full cart/checkout with PayPal, Chime, CashApp, ApplePay, Crypto -15%.</p>
    <p>See docs/CLOUDFLARE.md for deploy options.</p>
  `, 200);
});

export default app;
