'use strict';
/**
 * Input handling.
 *
 * Rules applied everywhere:
 *  - Output escaping is the primary XSS defence. Every template value goes through
 *    EJS <%= %> which HTML escapes. The only place raw HTML is emitted is
 *    renderClientCopy() below, which runs an allowlist sanitiser first.
 *  - Input is normalised and length capped on the way in so nothing unbounded
 *    reaches the database or the logs.
 */
const sanitizeHtml = require('sanitize-html');

/** Collapse whitespace, strip control characters, hard cap length. */
function text(value, maxLength = 200) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Multi line text: keeps newlines, strips control characters, caps length. */
function multiline(value, maxLength = 2000) {
  return String(value == null ? '' : value)
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;

function email(value) {
  const v = text(value, 254).toLowerCase();
  return EMAIL_RE.test(v) ? v : null;
}

function phone(value) {
  const v = text(value, 32).replace(/[^\d+()\-.\s]/g, '');
  return v.replace(/\D/g, '').length >= 7 ? v : null;
}

function integer(value, { min = 0, max = 1000, fallback = min } = {}) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Only lowercase slug characters survive. Used for every path parameter. */
function slug(value, maxLength = 90) {
  return String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, maxLength);
}

/** Restrict a value to a known set. Used for sort keys and similar. */
function oneOf(value, allowed, fallback) {
  const v = String(value ?? '');
  return allowed.includes(v) ? v : fallback;
}

const checked = (value) => value === 'on' || value === 'yes' || value === '1' || value === true;

/** HTML escape for the rare places a string is built outside a template. */
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** JSON that is safe to embed inside a <script> element. */
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

/**
 * Client supplied product copy. Only structural tags survive, no attributes that
 * can carry script, no links to anything other than http(s) or mailto.
 */
const COPY_POLICY = {
  allowedTags: ['p', 'br', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a'],
  allowedAttributes: { a: ['href', 'title'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href'],
  disallowedTagsMode: 'discard',
  transformTags: {
    a: (tagName, attribs) => ({ tagName: 'a', attribs: { ...attribs, rel: 'nofollow noopener', target: '_blank' } })
  }
};

function renderClientCopy(html) {
  if (!html) return '';
  return sanitizeHtml(String(html), COPY_POLICY);
}

/**
 * Claim screen. The source catalogue is full of unverifiable superlatives.
 * Any copy that reaches the site is checked and the offending phrases are reported
 * rather than silently published. Run `npm run check:claims` to audit.
 */
const CLAIM_PATTERNS = [
  /\bbest\b/i, /\b#\s?1\b/i, /\bnumber one\b/i, /\bworld'?s\b/i, /\bunparalleled\b/i,
  /\blegendary\b/i, /\bguarantee(d|s)?\b/i, /\bmost trusted\b/i, /\bunbeatable\b/i,
  /\blowest price\b/i, /\bcheapest\b/i, /\bmilitary grade\b/i, /\blimited stock\b/i,
  /\bact now\b/i, /\bonly a few left\b/i, /\bperfect (choice|for)\b/i, /\bultimate\b/i,
  /\brisk free\b/i, /\b100%\b/i, /\bproven in the harshest\b/i
];

function findClaims(str) {
  const s = String(str || '');
  return CLAIM_PATTERNS.filter((re) => re.test(s)).map((re) => re.source);
}

module.exports = {
  text, multiline, email, phone, integer, slug, oneOf, checked,
  escapeHtml, jsonForScript, renderClientCopy, findClaims, CLAIM_PATTERNS
};
