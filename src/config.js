'use strict';
/**
 * Environment validation and typed config.
 * Fails fast on a bad or unsafe configuration instead of booting a
 * half configured production server.
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const ROOT = path.resolve(__dirname, '..');

const errors = [];
const warnings = [];

function str(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : String(v).trim();
}
function int(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) { errors.push(`${name} must be an integer, got "${v}"`); return fallback; }
  return n;
}
function bool(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

const env = str('NODE_ENV', 'development');
const isProd = env === 'production';

const config = {
  env,
  isProd,
  root: ROOT,
  port: int('PORT', 8080),
  siteOrigin: str('SITE_ORIGIN', 'http://localhost:' + int('PORT', 8080)).replace(/\/+$/, ''),
  trustProxy: bool('TRUST_PROXY', false),
  debugMode: bool('DEBUG_MODE', false),
  sessionSecret: str('SESSION_SECRET', ''),
  dbPath: path.resolve(ROOT, str('DB_PATH', './data/catalog.db')),
  dbReadonly: bool('DB_READONLY', isProd),
  corsAllowedOrigins: str('CORS_ALLOWED_ORIGINS', '')
    .split(',').map((s) => s.trim()).filter(Boolean),
  rateLimit: {
    windowMs: int('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    max: int('RATE_LIMIT_MAX', 300),
    formMax: int('FORM_RATE_LIMIT_MAX', 5)
  },
  robotsMode: ['auto', 'allow', 'disallow'].includes(String(process.env.ROBOTS_MODE || '').trim())
    ? String(process.env.ROBOTS_MODE).trim()
    : 'auto',
  analyticsMeasurementId: str('ANALYTICS_MEASUREMENT_ID', ''),
  smtp: {
    host: str('SMTP_HOST', ''),
    port: int('SMTP_PORT', 0),
    user: str('SMTP_USER', ''),
    pass: str('SMTP_PASS', '')
  },
  inquiryNotifyEmail: str('INQUIRY_NOTIFY_EMAIL', '')
};

/* ---------------- validation ---------------- */

if (!/^https?:\/\/[^\s/]+/i.test(config.siteOrigin)) {
  errors.push('SITE_ORIGIN must be an absolute origin such as https://example.com');
}
if (isProd && !config.siteOrigin.startsWith('https://')) {
  errors.push('SITE_ORIGIN must use https in production');
}
if (config.sessionSecret.length < 32) {
  if (isProd) errors.push('SESSION_SECRET must be at least 32 characters in production');
  else {
    warnings.push('SESSION_SECRET is missing or short. A random development secret was generated for this process only.');
    config.sessionSecret = require('crypto').randomBytes(32).toString('hex');
  }
}
if (/replace_me/i.test(config.sessionSecret)) {
  errors.push('SESSION_SECRET is still the example value from .env.example');
}
if (isProd && config.debugMode) {
  errors.push('DEBUG_MODE must be 0 in production. Debug mode exposes stack traces and internal paths.');
}
for (const origin of config.corsAllowedOrigins) {
  if (origin === '*') errors.push('CORS_ALLOWED_ORIGINS may not contain "*". List explicit origins.');
  else if (!/^https?:\/\/[^\s/]+$/i.test(origin)) errors.push(`CORS origin "${origin}" is not a bare origin such as https://example.com`);
}
if (!fs.existsSync(config.dbPath)) {
  errors.push(`Catalog database missing at ${config.dbPath}. Run: npm run ingest`);
}

/* -------- business identity completeness -------- */

const businessPath = path.join(ROOT, 'data', 'business.json');
let business = null;
const pendingFields = [];

/** Reads a dotted path out of the business object. */
function pick(obj, dotted) {
  return dotted.split('.').reduce((node, key) => (node == null ? undefined : node[key]), obj);
}

const isEmpty = (v) => v === null || v === undefined || v === ''
  || (Array.isArray(v) && v.length === 0)
  || (typeof v === 'string' && /PLACEHOLDER/i.test(v));

try {
  business = JSON.parse(fs.readFileSync(businessPath, 'utf8'));
} catch (err) {
  errors.push(`data/business.json could not be read or parsed: ${err.message}`);
}

if (business) {
  const required = Array.isArray(business.policy?.requiredBeforeLaunch) ? business.policy.requiredBeforeLaunch : [];
  for (const field of required) {
    if (isEmpty(pick(business, field))) pendingFields.push(field);
  }

  // Nothing user facing may ever print the word PLACEHOLDER.
  // The _README key documents this very rule, so it is excluded from its own scan.
  const scanned = Object.fromEntries(Object.entries(business).filter(([k]) => k !== '_README'));
  const leaked = JSON.stringify(scanned).match(/PLACEHOLDER/gi);
  if (leaked) errors.push(`data/business.json still contains ${leaked.length} literal PLACEHOLDER string(s). Use null for a value that is not known yet.`);

  if (pendingFields.length) {
    const msg = `data/business.json is missing ${pendingFields.length} required value(s): ${pendingFields.join(', ')}`;
    if (isProd) errors.push(msg + '. These are required before launch.');
    else warnings.push(msg);
  }

  if (business.policy?.transferProcessConfirmed !== true) {
    const msg = 'business.json policy.transferProcessConfirmed is false. The firearm transfer wording has not been signed off.';
    if (isProd) errors.push(msg);
    else warnings.push(msg);
  }

  if (isEmpty(business.jurisdiction?.country) || isEmpty(business.jurisdiction?.stateOrRegion)) {
    errors.push('business.json jurisdiction.country and jurisdiction.stateOrRegion are required. Legal pages depend on them.');
  }
}

config.business = business;
config.pendingFields = pendingFields;
config.startupWarnings = warnings;

function report() {
  for (const w of warnings) console.warn('[config] warning: ' + w);
  if (errors.length) {
    console.error('\n[config] refusing to start:');
    for (const e of errors) console.error('  - ' + e);
    console.error('');
    process.exit(1);
  }
}

module.exports = { config, report };
