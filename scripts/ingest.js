'use strict';
/**
 * Catalog ingest.
 *
 * Reads the client's WooCommerce CSV export and produces:
 *   data/catalog.db              SQLite catalog used by the web app (read only at runtime)
 *   public/img/products/*.jpg    locally hosted product images
 *   data/reports/content-gaps.csv  list of products whose copy the client must supply
 *
 * Editorial policy applied here, deliberately:
 *   The source CSV descriptions are spun promotional text containing unverifiable
 *   claims ("legendary", "unparalleled reliability", "most trusted", "Limited stock").
 *   None of that prose is published. Only hard facts that can be read straight out of
 *   the data (model, caliber, barrel length, capacity, price, stock, category) are kept,
 *   plus any per product override the client writes into data/product-overrides.json.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { parse } = require('csv-parse/sync');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '..');
const CSV_PATH = process.argv[2] || path.join(ROOT, '..', 'uploads', 'https___glockretailers_com_woocommerce.csv');
const DB_PATH = path.join(ROOT, 'data', 'catalog.db');
const IMG_DIR = path.join(ROOT, 'public', 'img', 'products');
const REPORT_DIR = path.join(ROOT, 'data', 'reports');
const OVERRIDES_PATH = path.join(ROOT, 'data', 'product-overrides.json');
const DOWNLOAD_IMAGES = process.env.SKIP_IMAGES !== '1';
const MAX_IMAGES_PER_PRODUCT = 3;

for (const d of [IMG_DIR, REPORT_DIR]) fs.mkdirSync(d, { recursive: true });

/* ------------------------------------------------------------------ helpers */

const stripTags = (s) => String(s || '').replace(/<[^>]*>/g, ' ');
const decode = (s) => String(s || '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#0?39;|&apos;|&#8217;|’/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#8221;|&#8220;|[\u201C\u201D]/g, '"').replace(/&#8211;|\u2013/g, '-')
  .replace(/\u2014/g, '-')                       // house style: no em dashes
  .replace(/&#8243;|\u2033|\u201D(?=\s)/g, '"');
const clean = (s) => decode(stripTags(s)).replace(/\s+/g, ' ').trim();

function slugify(s) {
  return decode(String(s))
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function money(v) {
  const n = Number.parseFloat(String(v || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/* ------------------------------------------------------- fact extraction */

const CALIBERS = [
  [/\b9\s*mm\b|\b9x19\b/i, '9mm', '9mm'],
  [/\.?\s*380\s*(acp)?\b/i, '.380 ACP', '380-acp'],
  [/\.?\s*40\s*(s\s*&\s*w|s&w|s\b)/i, '.40 S&W', '40-sw'],
  [/\.?\s*45\s*(acp)\b/i, '.45 ACP', '45-acp'],
  [/\b45\s*gap\b/i, '.45 GAP', '45-gap'],
  [/\.?\s*357\s*sig\b/i, '.357 SIG', '357-sig'],
  [/\b10\s*mm\b/i, '10mm Auto', '10mm-auto'],
  [/\.?\s*22\s*lr\b/i, '.22 LR', '22-lr']
];

function extractFacts(name, descriptionText, shortText) {
  const hay = `${name} ${shortText} ${descriptionText}`;
  const f = {};

  const model = /glock\s*g?\s*(\d{2}[a-z]{0,3})\b/i.exec(name) || /\bg?(\d{2}(?:x|c|sf|mos|l)?)\b/i.exec(name);
  if (model) f.model = model[1].toUpperCase().replace(/SF$/, 'SF');

  for (const [re, label, slug] of CALIBERS) {
    if (re.test(name)) { f.caliber = label; f.caliberSlug = slug; break; }
  }
  if (!f.caliber) {
    for (const [re, label, slug] of CALIBERS) {
      if (re.test(hay)) { f.caliber = label; f.caliberSlug = slug; break; }
    }
  }

  const barrel = /barrel length of\s*([\d.]+)\s*inch/i.exec(descriptionText)
    || /\b([\d.]{3,5})\s*(?:in|"|\u2033|\u201d)\s*(?:barrel)?/i.exec(name);
  if (barrel) {
    const n = Number.parseFloat(barrel[1]);
    if (Number.isFinite(n) && n > 2 && n < 12) f.barrelIn = n;
  }

  const cap = /\((\d{1,2})\+(\d)\s*rounds?\)/i.exec(descriptionText) || /\b(\d{1,2})\s*rd\b/i.exec(name);
  if (cap) f.capacity = cap[2] !== undefined ? `${cap[1]}+${cap[2]}` : `${cap[1]}`;

  const gen = /\bgen\s*(\d)\b/i.exec(name) || /\bgen(\d)\b/i.exec(name);
  if (gen) f.generation = `Gen ${gen[1]}`;

  if (/\bmos\b/i.test(name)) f.opticCut = 'MOS';
  else if (/holosun|acro|optic|rmr|507|407|scs/i.test(name)) f.opticCut = 'Optic mounted';

  return f;
}

function classify(categories, name) {
  const c = categories.join(' ').toLowerCase();
  const n = name.toLowerCase();
  if (/trigger/.test(c) || /trigger/.test(n)) return 'Trigger';
  if (/slide/.test(c) || /\bslide\b/.test(n)) return 'Slide';
  if (/custom|optiquipped/.test(c)) return 'Custom pistol';
  if (/used/.test(c)) return 'Used pistol';
  return 'Pistol';
}

/* --------------------------------------------------- category taxonomy */

const CATEGORY_META = {
  // slug: [display name, group, sort]
  'gen-6-glocks': ['Gen 6 Glocks', 'Ranges', 5],
  'custom-glocks': ['Custom Glocks', 'Ranges', 10],
  'optic-ready-glocks': ['Optic Ready Glocks', 'Ranges', 15],
  'glock-factory-handguns': ['Glock Factory Handguns', 'Ranges', 20],
  'glock-factory-colored-handguns': ['Glock Factory Colored Handguns', 'Ranges', 25],
  'used-glock-pistols': ['Used Glock Pistols', 'Ranges', 30],
  'glock-store-models': ['Glock Store Models', 'Ranges', 35],
  'glock-slides': ['Glock Slides', 'Parts', 40],
  'glock-triggers': ['Glock Triggers', 'Parts', 45]
};

function categorySlug(raw) {
  const name = clean(raw);
  const m = /^glock\s*(\d{2})\s*(pistols|for sale)?$/i.exec(name);
  if (m) return `glock-${m[1]}-for-sale`;
  const known = {
    'glockstore optiquipped glocks': 'optic-ready-glocks',
    'gen 6 glock': 'gen-6-glocks',
    'glock store models': 'glock-store-models'
  };
  const key = name.toLowerCase();
  if (known[key]) return known[key];
  return slugify(name);
}

function categoryDisplay(slug, raw) {
  if (CATEGORY_META[slug]) return CATEGORY_META[slug][0];
  const m = /^glock-(\d{2})-for-sale$/.exec(slug);
  if (m) return `Glock ${m[1]}`;
  return clean(raw);
}

function categoryGroup(slug) {
  if (CATEGORY_META[slug]) return CATEGORY_META[slug][1];
  if (/^glock-\d{2}-for-sale$/.test(slug)) return 'Models';
  return 'Ranges';
}

/* ------------------------------------------------------------- read CSV */

console.log('Reading ' + CSV_PATH);
const raw = fs.readFileSync(CSV_PATH, 'utf8').replace(/^\uFEFF/, '');
const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true, bom: true });
console.log(`  ${rows.length} rows`);

let overrides = {};
if (fs.existsSync(OVERRIDES_PATH)) {
  overrides = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));
  delete overrides._README;
  console.log(`  ${Object.keys(overrides).length} client override(s) loaded`);
}

/* ------------------------------------------------------------ transform */

const parents = [];
const variations = [];
const usedSlugs = new Set();

for (const r of rows) {
  const type = (r.Type || '').trim();
  const id = String(r.ID || '').trim();
  const name = clean(r.Name);
  if (!id || !name) continue;

  if (type === 'variation') {
    variations.push({
      id,
      parentId: String(r.Parent || '').replace(/^id:/, '').trim(),
      label: clean(r.Name).split(' - ').slice(1).join(' - ') || clean(r.Name),
      priceCents: money(r['Sale price']) ?? money(r['Regular price']),
      a1name: clean(r['Attribute 1 name']),
      a1value: clean(r['Attribute 1 value(s)']),
      a2name: clean(r['Attribute 2 name']),
      a2value: clean(r['Attribute 2 value(s)'])
    });
    continue;
  }

  const cats = (r.Categories || '').split(',').map((c) => clean(c)).filter(Boolean);
  const descText = clean(r.Description);
  const shortText = clean(r['Short description']);
  const facts = extractFacts(name, descText, shortText);
  const productClass = classify(cats, name);

  const ov = overrides[id] || {};

  let base = slugify(ov.slug || name);
  if (!base) base = 'product';
  let slug = base;
  if (usedSlugs.has(slug)) slug = `${base}-${id}`;
  let n = 2;
  while (usedSlugs.has(slug)) slug = `${base}-${id}-${n++}`;
  usedSlugs.add(slug);

  const regular = money(r['Regular price']);
  const sale = money(r['Sale price']);
  const priceCents = sale !== null && regular !== null && sale < regular ? sale : (regular ?? sale);
  const compareCents = sale !== null && regular !== null && sale < regular ? regular : null;

  const images = (r.Images || '')
    .split(',')
    .map((u) => u.trim())
    .filter((u) => /^https?:\/\//i.test(u));
  const uniqueImages = [...new Set(images)].slice(0, MAX_IMAGES_PER_PRODUCT);

  parents.push({
    id,
    slug,
    name: ov.title || name,
    sourceName: name,
    type,
    sku: clean(r.SKU) || `GR-${id}`,
    priceCents,
    compareCents,
    inStock: String(r['In stock?']).trim() === '1' ? 1 : 0,
    stock: clean(r.Stock),
    productClass,
    model: facts.model || null,
    caliber: facts.caliber || null,
    caliberSlug: facts.caliberSlug || null,
    capacity: facts.capacity || null,
    barrelIn: facts.barrelIn || null,
    generation: facts.generation || null,
    opticCut: facts.opticCut || null,
    weightKg: clean(r['Weight (kg)']) || null,
    categories: cats,
    imageUrls: uniqueImages,
    clientCopy: ov.description || null,
    hasClientCopy: ov.description ? 1 : 0,
    attr1name: clean(r['Attribute 1 name']),
    attr1values: clean(r['Attribute 1 value(s)']),
    attr2name: clean(r['Attribute 2 name']),
    attr2values: clean(r['Attribute 2 value(s)'])
  });
}

console.log(`  ${parents.length} products, ${variations.length} variations`);

/**
 * 158 of the 379 rows in the supplier export share a title with another row. Two
 * pages carrying the same title compete with each other in search, so where a title
 * repeats the SKU is appended to make the page title unique. This is a mitigation,
 * not a fix. The fix is the shop supplying real distinct product names, which is
 * what data/reports/content-gaps.csv asks for.
 */
{
  const nameCounts = new Map();
  for (const p of parents) nameCounts.set(p.name, (nameCounts.get(p.name) || 0) + 1);
  for (const p of parents) p.titleSuffix = nameCounts.get(p.name) > 1 ? p.sku : null;
}

// Factual, data derived summary. No adjectives, no claims.
function buildSummary(p) {
  const bits = [];
  const head = p.productClass === 'Pistol' || p.productClass === 'Custom pistol' || p.productClass === 'Used pistol'
    ? `${p.model ? 'Glock ' + p.model : 'Glock'} semi automatic pistol`
    : `${p.productClass} for Glock pistols`;
  bits.push(head + (p.caliber ? ` chambered in ${p.caliber}` : ''));
  const specs = [];
  if (p.barrelIn) specs.push(`${p.barrelIn} in barrel`);
  if (p.capacity) specs.push(`${p.capacity} capacity`);
  if (p.generation) specs.push(p.generation);
  if (p.opticCut) specs.push(p.opticCut);
  let s = bits.join('') + '.';
  if (specs.length) s += ' ' + specs.join(', ') + '.';
  return s;
}

/* ------------------------------------------------------------- database */

if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
const db = new Database(DB_PATH);
db.pragma('journal_mode = DELETE');
db.exec(`
CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  grp TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 100,
  product_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  source_name TEXT NOT NULL,
  sku TEXT NOT NULL,
  price_cents INTEGER,
  compare_cents INTEGER,
  in_stock INTEGER NOT NULL DEFAULT 0,
  product_class TEXT NOT NULL,
  model TEXT,
  caliber TEXT,
  caliber_slug TEXT,
  capacity TEXT,
  barrel_in REAL,
  generation TEXT,
  optic_cut TEXT,
  summary TEXT NOT NULL,
  title_suffix TEXT,
  client_copy TEXT,
  has_client_copy INTEGER NOT NULL DEFAULT 0,
  attr1_name TEXT, attr1_values TEXT,
  attr2_name TEXT, attr2_values TEXT,
  primary_image TEXT,
  primary_w INTEGER,
  primary_h INTEGER,
  primary_variants TEXT,
  image_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE product_images (
  product_id INTEGER NOT NULL REFERENCES products(id),
  position INTEGER NOT NULL,
  filename TEXT NOT NULL,
  width INTEGER, height INTEGER,
  variants TEXT,
  PRIMARY KEY (product_id, position)
);
CREATE TABLE product_categories (
  product_id INTEGER NOT NULL REFERENCES products(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  PRIMARY KEY (product_id, category_id)
);
CREATE TABLE variants (
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id),
  label TEXT NOT NULL,
  price_cents INTEGER,
  a1_name TEXT, a1_value TEXT, a2_name TEXT, a2_value TEXT
);
CREATE INDEX idx_pc_cat ON product_categories(category_id);
CREATE INDEX idx_p_model ON products(model);
CREATE INDEX idx_p_caliber ON products(caliber_slug);
CREATE INDEX idx_v_product ON variants(product_id);
CREATE VIRTUAL TABLE products_fts USING fts5(name, summary, model, caliber, content='');
`);

const catRows = new Map();
for (const p of parents) {
  for (const c of p.categories) {
    const slug = categorySlug(c);
    if (!catRows.has(slug)) catRows.set(slug, { slug, name: categoryDisplay(slug, c), grp: categoryGroup(slug), sort: CATEGORY_META[slug]?.[2] ?? 100 });
  }
}

const insCat = db.prepare('INSERT INTO categories (slug, name, grp, sort) VALUES (?,?,?,?)');
const catIds = new Map();
const sortedCats = [...catRows.values()].sort((a, b) => {
  const na = /^glock-(\d{2})-for-sale$/.exec(a.slug), nb = /^glock-(\d{2})-for-sale$/.exec(b.slug);
  if (na && nb) return Number(na[1]) - Number(nb[1]);
  return a.sort - b.sort || a.name.localeCompare(b.name);
});
db.transaction(() => {
  for (const c of sortedCats) catIds.set(c.slug, insCat.run(c.slug, c.name, c.grp, c.sort).lastInsertRowid);
})();

const insProd = db.prepare(`INSERT INTO products
 (id, slug, name, source_name, sku, price_cents, compare_cents, in_stock, product_class, model,
  caliber, caliber_slug, capacity, barrel_in, generation, optic_cut, summary, title_suffix, client_copy, has_client_copy,
  attr1_name, attr1_values, attr2_name, attr2_values, primary_image, image_count)
 VALUES (@id,@slug,@name,@source_name,@sku,@price_cents,@compare_cents,@in_stock,@product_class,@model,
  @caliber,@caliber_slug,@capacity,@barrel_in,@generation,@optic_cut,@summary,@title_suffix,@client_copy,@has_client_copy,
  @attr1_name,@attr1_values,@attr2_name,@attr2_values,@primary_image,@image_count)`);
const insPC = db.prepare('INSERT OR IGNORE INTO product_categories (product_id, category_id) VALUES (?,?)');
const insVar = db.prepare('INSERT INTO variants (id, product_id, label, price_cents, a1_name, a1_value, a2_name, a2_value) VALUES (?,?,?,?,?,?,?,?)');
const insFts = db.prepare('INSERT INTO products_fts (rowid, name, summary, model, caliber) VALUES (?,?,?,?,?)');

db.transaction(() => {
  for (const p of parents) {
    insProd.run({
      id: Number(p.id), slug: p.slug, name: p.name, source_name: p.sourceName, sku: p.sku,
      price_cents: p.priceCents, compare_cents: p.compareCents, in_stock: p.inStock,
      product_class: p.productClass, model: p.model, caliber: p.caliber, caliber_slug: p.caliberSlug,
      capacity: p.capacity, barrel_in: p.barrelIn, generation: p.generation, optic_cut: p.opticCut,
      summary: buildSummary(p), title_suffix: p.titleSuffix, client_copy: p.clientCopy, has_client_copy: p.hasClientCopy,
      attr1_name: p.attr1name || null, attr1_values: p.attr1values || null,
      attr2_name: p.attr2name || null, attr2_values: p.attr2values || null,
      primary_image: null, image_count: 0
    });
    insFts.run(Number(p.id), p.name, buildSummary(p), p.model || '', p.caliber || '');
    for (const c of p.categories) insPC.run(Number(p.id), catIds.get(categorySlug(c)));
  }
  const parentIds = new Set(parents.map((p) => p.id));
  for (const v of variations) {
    if (!parentIds.has(v.parentId)) continue;
    insVar.run(Number(v.id), Number(v.parentId), v.label, v.priceCents, v.a1name || null, v.a1value || null, v.a2name || null, v.a2value || null);
  }
  db.prepare(`UPDATE categories SET product_count =
    (SELECT COUNT(*) FROM product_categories pc WHERE pc.category_id = categories.id)`).run();
})();

/* ------------------------------------------------------------- images */

function download(url, dest) {
  return new Promise((resolve) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 20000, headers: { 'User-Agent': 'catalog-ingest/1.0' } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(download(new URL(res.headers.location, url).href, dest));
      }
      if (res.statusCode !== 200 || !/^image\//.test(res.headers['content-type'] || '')) {
        res.resume();
        return resolve(false);
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (buf.length < 512) return resolve(false);
        fs.writeFileSync(dest, buf);
        resolve(true);
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return { width: null, height: null };
}

(async () => {
  if (DOWNLOAD_IMAGES) {
    const jobs = [];
    for (const p of parents) p.imageUrls.forEach((url, i) => jobs.push({ p, url, i }));
    console.log(`Downloading ${jobs.length} images ...`);
    const insImg = db.prepare('INSERT OR REPLACE INTO product_images (product_id, position, filename, width, height) VALUES (?,?,?,?,?)');
    let done = 0, ok = 0;
    const CONCURRENCY = 10;
    let cursor = 0;
    async function worker() {
      while (cursor < jobs.length) {
        const job = jobs[cursor++];
        const ext = (path.extname(new URL(job.url).pathname) || '.jpg').toLowerCase().slice(0, 5);
        const filename = `${job.p.id}-${job.i}${['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg'}`;
        const dest = path.join(IMG_DIR, filename);
        let good = fs.existsSync(dest) && fs.statSync(dest).size > 512;
        if (!good) good = await download(job.url, dest);
        if (good) {
          ok++;
          let dim = { width: null, height: null };
          try { if (/\.jpe?g$/.test(filename)) dim = jpegSize(fs.readFileSync(dest)); } catch { /* ignore */ }
          insImg.run(Number(job.p.id), job.i, filename, dim.width, dim.height);
        }
        if (++done % 100 === 0) process.stdout.write(`  ${done}/${jobs.length}\n`);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    console.log(`  ${ok}/${jobs.length} images stored`);
  } else {
    console.log('SKIP_IMAGES=1, image download skipped');
  }

  db.prepare(`UPDATE products SET
      image_count = (SELECT COUNT(*) FROM product_images i WHERE i.product_id = products.id),
      primary_image = (SELECT filename FROM product_images i WHERE i.product_id = products.id ORDER BY position LIMIT 1)`).run();

  /* --------------------------------------------------------- reports */
  const dupes = db.prepare(`SELECT source_name, COUNT(*) n FROM products GROUP BY source_name HAVING n > 1 ORDER BY n DESC`).all();
  const gaps = db.prepare(`SELECT id, slug, name, sku, price_cents, image_count, has_client_copy FROM products ORDER BY name`).all();
  const csvOut = ['product_id,url_path,current_title,sku,price,images,client_title_supplied,client_description_supplied,action_required'];
  for (const g of gaps) {
    const dupCount = dupes.find((d) => d.source_name === g.name)?.n || 1;
    const action = dupCount > 1
      ? `DUPLICATE TITLE shared by ${dupCount} products. Supply a unique product name and description.`
      : 'Supply verified manufacturer description and specifications.';
    csvOut.push([g.id, `/product/${g.slug}`, `"${g.name.replace(/"/g, '""')}"`, g.sku,
      (g.price_cents / 100).toFixed(2), g.image_count, g.has_client_copy ? 'yes' : 'no',
      g.has_client_copy ? 'yes' : 'no', `"${action}"`].join(','));
  }
  fs.writeFileSync(path.join(REPORT_DIR, 'content-gaps.csv'), csvOut.join('\n'));

  const stats = {
    products: db.prepare('SELECT COUNT(*) c FROM products').get().c,
    categories: db.prepare('SELECT COUNT(*) c FROM categories').get().c,
    variants: db.prepare('SELECT COUNT(*) c FROM variants').get().c,
    images: db.prepare('SELECT COUNT(*) c FROM product_images').get().c,
    withoutImage: db.prepare('SELECT COUNT(*) c FROM products WHERE image_count = 0').get().c,
    duplicateTitleGroups: dupes.length,
    duplicateTitleProducts: dupes.reduce((a, d) => a + d.n, 0)
  };
  fs.writeFileSync(path.join(REPORT_DIR, 'ingest-stats.json'), JSON.stringify(stats, null, 2));
  db.close();

  // Responsive WebP variants are generated from the files just downloaded.
  await require('./make-image-variants').run();

  // Card grids only load the primary image, so its dimensions and variant list are
  // denormalised onto the product row to avoid a join on every listing page.
  const db2 = new Database(DB_PATH);
  db2.prepare(`UPDATE products SET
      primary_w = (SELECT width FROM product_images i WHERE i.product_id = products.id ORDER BY position LIMIT 1),
      primary_h = (SELECT height FROM product_images i WHERE i.product_id = products.id ORDER BY position LIMIT 1),
      primary_variants = (SELECT variants FROM product_images i WHERE i.product_id = products.id ORDER BY position LIMIT 1)`).run();
  db2.close();

  console.log('\nIngest complete');
  console.table(stats);
})();
