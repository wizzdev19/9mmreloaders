'use strict';
/**
 * Responsive image variants.
 *
 * The supplier images are single fixed size JPEG, PNG and WebP files. A phone on a
 * slow connection should not download a 1900 pixel image to show it 160 pixels wide,
 * so this generates 400w and 800w WebP versions of every product image and records
 * the real intrinsic dimensions of the original.
 *
 * Templates then emit a <picture> with a WebP <source> and srcset, falling back to
 * the original file for any browser that cannot take WebP.
 *
 * Run standalone with: node scripts/make-image-variants.js
 * It also runs automatically at the end of npm run ingest.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const Database = require('better-sqlite3');

const ROOT = path.resolve(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'public', 'img', 'products');
const DB_PATH = path.join(ROOT, 'data', 'catalog.db');

const WIDTHS = [400, 800];

async function run() {
  const db = new Database(DB_PATH);
  const rows = db.prepare('SELECT product_id, position, filename FROM product_images ORDER BY product_id, position').all();
  const update = db.prepare('UPDATE product_images SET width = ?, height = ?, variants = ? WHERE product_id = ? AND position = ?');

  let made = 0;
  let skipped = 0;
  let failed = 0;

  const CONCURRENCY = 6;
  let cursor = 0;

  async function worker() {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      const source = path.join(IMG_DIR, row.filename);
      if (!fs.existsSync(source)) { failed++; continue; }
      const base = row.filename.replace(/\.[^.]+$/, '');

      try {
        const meta = await sharp(source).metadata();
        const widths = WIDTHS.filter((w) => w <= (meta.width || 0));
        if (!widths.length) widths.push(meta.width || 400);

        for (const w of widths) {
          const out = path.join(IMG_DIR, `${base}-${w}.webp`);
          if (fs.existsSync(out) && fs.statSync(out).size > 256) { skipped++; continue; }
          await sharp(source).resize({ width: w, withoutEnlargement: true }).webp({ quality: 78, effort: 4 }).toFile(out);
          made++;
        }

        update.run(meta.width || null, meta.height || null, widths.join(','), row.product_id, row.position);
      } catch {
        failed++;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  db.close();

  const total = fs.readdirSync(IMG_DIR).length;
  console.log(`Image variants: ${made} created, ${skipped} already present, ${failed} failed. ${total} files in public/img/products.`);
}

if (require.main === module) run();
module.exports = { run };
