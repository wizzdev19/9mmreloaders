'use strict';
/**
 * Security middleware stack.
 * Each export maps to a line item in docs/SECURITY-AUDIT.md.
 */
const crypto = require('crypto');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { config } = require('./config');

/* ---------------------------------------------------------- 1. CSP nonce */

function nonce(req, res, next) {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
}

/* ------------------------------------------------ 2. Security headers */

function securityHeaders() {
  // In production the site refuses to be framed. In development the workspace
  // preview renders the app inside an iframe, so framing is left open locally.
  const frameAncestors = config.isProd ? ["'self'"] : ['*'];

  return [
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'self'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
          'frame-ancestors': frameAncestors,
          'object-src': ["'none'"],
          'script-src': ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`],
          'script-src-attr': ["'none'"],          // blocks every inline onclick style handler
          'style-src': ["'self'"],                // no inline styles anywhere in this project
          'img-src': ["'self'", 'data:'],
          'font-src': ["'self'"],
          'connect-src': ["'self'"],
          'manifest-src': ["'self'"],
          'upgrade-insecure-requests': config.isProd ? [] : null
        }
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: config.isProd ? { maxAge: 31536000, includeSubDomains: true, preload: false } : false,
      frameguard: config.isProd ? { action: 'sameorigin' } : false,
      xPoweredBy: false
    }),
    (req, res, next) => {
      res.setHeader('Permissions-Policy',
        'geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      next();
    }
  ];
}

/* ---------------------------------------------------------------- 3. CORS */

/**
 * Same origin only unless the operator lists explicit origins in
 * CORS_ALLOWED_ORIGINS. There is no wildcard path and credentials are never
 * granted to a cross origin caller.
 */
function cors(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next();
  if (config.corsAllowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  return next();
}

/* -------------------------------------------------------- 4. Rate limits */

// The default key generator is used on purpose. It normalises IPv6 addresses to a
// /56 prefix, so a single visitor cannot walk through a huge address range to reset
// their own limit. Without a trusted proxy req.ip is the socket address and cannot
// be spoofed by a header.
const baseLimiterOptions = {
  standardHeaders: 'draft-7',
  legacyHeaders: false
};

/**
 * The audit scripts crawl 500 pages and fetch several hundred assets in a few
 * seconds, which is exactly the traffic shape the limiter exists to stop. Rather
 * than raise the limit for everyone, a local run can present a key that matches
 * AUDIT_KEY from .env.
 *
 * Two conditions guard it, and both must hold: the build must not be production,
 * and the key must be non empty and match exactly. On a production host the first
 * condition is false, so the header is ignored no matter what it contains.
 */
function auditBypass(req) {
  if (config.isProd) return false;
  if (!config.auditKey) return false;
  return req.get('x-audit-key') === config.auditKey;
}

const generalLimiter = rateLimit({
  ...baseLimiterOptions,
  skip: auditBypass,
  windowMs: config.rateLimit.windowMs,
  limit: config.rateLimit.max,
  message: 'Too many requests. Please wait a few minutes and try again.'
});

const searchLimiter = rateLimit({
  ...baseLimiterOptions,
  skip: auditBypass,
  windowMs: 60 * 1000,
  limit: 30,
  message: 'Too many searches. Please wait a minute.'
});

const formLimiter = rateLimit({
  ...baseLimiterOptions,
  windowMs: 60 * 60 * 1000,
  limit: config.rateLimit.formMax,
  message: 'Too many submissions from this address. Please try again later.'
});

const cartLimiter = rateLimit({
  ...baseLimiterOptions,
  windowMs: 60 * 1000,
  limit: 60
});

/* ---------------------------------------------------------------- 5. CSRF */

const CSRF_COOKIE = '__Host-csrf';
const CSRF_COOKIE_FALLBACK = 'csrf';

function cookieName() {
  // The __Host- prefix requires https. Fall back to a plain name over http in development.
  return config.isProd ? CSRF_COOKIE : CSRF_COOKIE_FALLBACK;
}

function csrfToken(req, res, next) {
  const name = cookieName();
  let token = req.signedCookies?.[name];
  if (!token || typeof token !== 'string' || token.length !== 64) {
    token = crypto.randomBytes(32).toString('hex');
    res.cookie(name, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProd,
      signed: true,
      path: '/',
      maxAge: 4 * 60 * 60 * 1000
    });
  }
  res.locals.csrfToken = token;
  req.csrfToken = token;
  next();
}

function verifyCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  // Origin check first. A cross site form post either omits Origin or sends a foreign one.
  const origin = req.headers.origin;
  if (origin) {
    const allowed = [config.siteOrigin, ...config.corsAllowedOrigins];
    const host = req.headers.host;
    const selfOrigins = [`${req.protocol}://${host}`, `https://${host}`, `http://${host}`];
    if (!allowed.includes(origin) && !selfOrigins.includes(origin)) {
      return next(Object.assign(new Error('Cross origin form submission rejected'), { status: 403 }));
    }
  }

  const sent = String(req.body?._csrf || req.headers['x-csrf-token'] || '');
  const expected = String(req.signedCookies?.[cookieName()] || '');
  const ok = sent.length === 64 && expected.length === 64
    && crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) {
    return next(Object.assign(new Error('Security token missing or expired. Please reload the page and try again.'), { status: 403 }));
  }
  return next();
}

/* ------------------------------------------------- 6. Honeypot for bots */

/**
 * A hidden field real users never fill. Cheap spam control that costs no
 * accessibility, because the field is removed from the accessibility tree
 * and skipped in the tab order.
 */
function honeypot(fieldName = 'company_website') {
  return (req, res, next) => {
    if (req.body && String(req.body[fieldName] || '').trim() !== '') {
      // Respond as if accepted so bots get no signal, but store nothing.
      req.spamDetected = true;
    }
    next();
  };
}

module.exports = {
  nonce, securityHeaders, cors, verifyCsrf, csrfToken, honeypot,
  generalLimiter, searchLimiter, formLimiter, cartLimiter
};
