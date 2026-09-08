'use strict';
/**
 * Basket held in a signed, httpOnly cookie.
 *
 * No server side session store is needed because the basket is nothing more than a
 * short list of catalogue ids and quantities. The cookie is signed, so a visitor
 * cannot edit it, it is httpOnly so no script can read it, and every value is
 * re-validated against the catalogue on read. Prices are never taken from the
 * cookie, only ever from the database.
 */
const { config } = require('./config');
const { q } = require('./db');

const COOKIE = 'cart';
const MAX_LINES = 20;
const MAX_QTY = 5;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function read(req) {
  const raw = req.signedCookies?.[COOKIE];
  if (!raw) return [];
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  const out = [];
  for (const entry of parsed.slice(0, MAX_LINES)) {
    const p = Number.parseInt(entry?.p, 10);
    const v = Number.parseInt(entry?.v, 10) || 0;
    const qty = Number.parseInt(entry?.q, 10);
    if (!Number.isInteger(p) || p <= 0) continue;
    if (!Number.isInteger(qty) || qty < 1) continue;
    out.push({ p, v, q: Math.min(MAX_QTY, qty) });
  }
  return out;
}

function write(res, lines) {
  const trimmed = lines.filter((l) => l.q > 0).slice(0, MAX_LINES);
  if (!trimmed.length) {
    res.clearCookie(COOKIE, { path: '/' });
    return;
  }
  res.cookie(COOKIE, JSON.stringify(trimmed), {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    signed: true,
    path: '/',
    maxAge: MAX_AGE_MS
  });
}

const keyFor = (line) => `${line.p}-${line.v}`;

/** Expand cookie lines into full catalogue rows. Unknown ids are dropped silently. */
function detail(req) {
  const lines = read(req);
  const out = [];
  for (const line of lines) {
    const product = q.productById.get(line.p);
    if (!product) continue;
    let variantLabel = null;
    let unitCents = product.price_cents;
    if (line.v) {
      const variant = q.variantsFor.all(product.id).find((v) => v.id === line.v);
      if (variant) {
        variantLabel = variant.label;
        if (variant.price_cents != null) unitCents = variant.price_cents;
      }
    }
    out.push({
      key: keyFor(line),
      product,
      variantId: line.v,
      variantLabel,
      qty: line.q,
      unitCents: unitCents ?? 0,
      lineCents: (unitCents ?? 0) * line.q
    });
  }
  return out;
}

function add(req, res, productId, variantId, qty) {
  const lines = read(req);
  const key = `${productId}-${variantId || 0}`;
  const existing = lines.find((l) => keyFor(l) === key);
  if (existing) existing.q = Math.min(MAX_QTY, existing.q + qty);
  else if (lines.length < MAX_LINES) lines.push({ p: productId, v: variantId || 0, q: Math.min(MAX_QTY, qty) });
  write(res, lines);
}

function setQty(req, res, key, qty) {
  const lines = read(req).map((l) => (keyFor(l) === key ? { ...l, q: Math.min(MAX_QTY, qty) } : l));
  write(res, lines.filter((l) => l.q > 0));
}

function remove(req, res, key) {
  write(res, read(req).filter((l) => keyFor(l) !== key));
}

function clear(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function count(req) {
  return read(req).reduce((total, l) => total + l.q, 0);
}

module.exports = { read, detail, add, setQty, remove, clear, count, MAX_QTY, MAX_LINES };
