'use strict';
/**
 * Application entry point.
 *
 * Middleware order matters and is deliberate:
 *   1. proxy trust        so req.ip is right before anything rate limits on it
 *   2. nonce              before headers, because the CSP embeds it
 *   3. security headers   before any response body can be produced
 *   4. cors               before routes, rejects nothing but adds no permissive default
 *   5. body parsers       with hard size limits
 *   6. rate limiting      before any handler does work
 *   7. csrf token issue   before templates need it
 *   8. routes
 *   9. 404 then the error handler last
 */
const path = require('path');
const express = require('express');
const compression = require('compression');
const cookieParser = require('cookie-parser');

const { config, report } = require('./src/config');
report();

const security = require('./src/security');
const { locals } = require('./src/locals');
const { purgeExpired } = require('./src/db');

const catalogRoutes = require('./src/routes/catalog');
const commerceRoutes = require('./src/routes/commerce');
const contentRoutes = require('./src/routes/content');
const seoRoutes = require('./src/routes/seo');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', config.trustProxy ? 1 : false);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('strict routing', false);
app.set('etag', 'strong');

/* ------------------------------------------------------------ 1 to 4 */

app.use(security.nonce);
app.use(security.securityHeaders());
app.use(security.cors);
app.use(compression());

/* ------------------------------------------------------ 5 body parsing */

// Small limits. Nothing this site accepts is large, so anything larger is abuse.
app.use(express.urlencoded({ extended: false, limit: '16kb', parameterLimit: 40 }));
app.use(express.json({ limit: '16kb' }));
app.use(cookieParser(config.sessionSecret));

/* ------------------------------------------------------ 6 rate limiting */

app.use(security.generalLimiter);
app.use('/search', security.searchLimiter);

/* ---------------------------------------------------- 7 csrf and locals */

app.use(security.csrfToken);
app.use(locals);

/* ------------------------------------------------------- static assets */

app.use(express.static(path.join(__dirname, 'public'), {
  dotfiles: 'deny',          // no .env, .git or any dotfile ever served
  index: false,              // no directory index anywhere
  redirect: false,
  etag: true,
  maxAge: config.isProd ? '30d' : 0,
  setHeaders(res, filePath) {
    if (/\.(html|json)$/i.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
    if (/\.(jpe?g|png|webp|gif|svg|ico)$/i.test(filePath) && config.isProd) {
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    }
  }
}));

/* ----------------------------------------------------- canonical host */

// One host, one protocol, one URL per page. Prevents the same content being
// crawled at both www and apex, or at both http and https.
app.use((req, res, next) => {
  if (!config.isProd) return next();
  const expected = new URL(config.siteOrigin);
  const host = req.headers.host;
  if (host && host !== expected.host) {
    return res.redirect(301, config.siteOrigin + req.originalUrl);
  }
  if (req.protocol !== expected.protocol.replace(':', '')) {
    return res.redirect(301, config.siteOrigin + req.originalUrl);
  }
  return next();
});

// Trailing slash normalisation, again to keep one URL per page.
app.use((req, res, next) => {
  if (req.method === 'GET' && req.path.length > 1 && req.path.endsWith('/')) {
    const qs = req.originalUrl.slice(req.path.length);
    return res.redirect(301, req.path.replace(/\/+$/, '') + qs);
  }
  return next();
});

/* ---------------------------------------------------------- 8 routes */

app.use(seoRoutes);
app.use(contentRoutes);
app.use(commerceRoutes);
app.use(catalogRoutes);

/* ------------------------------------------------ 9 404 and error handler */

app.use((req, res) => {
  res.status(404);
  res.locals.meta = {
    title: 'Page not found | ' + res.locals.brand,
    description: 'That page does not exist on this site.',
    canonical: require('./src/seo').absoluteUrl(req.path),
    robots: 'noindex, follow'
  };
  res.render('error', {
    heading: 'Page not found',
    body: 'That address does not match anything on this site. It may have been removed, or the link may be mistyped.',
    showDetail: false,
    detail: ''
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;

  // Logged server side with full detail, never shown to the visitor in production.
  if (status >= 500) console.error('[error]', err.stack || err.message);
  else console.warn(`[${status}]`, err.message);

  if (res.headersSent) return;

  res.status(status);
  res.locals.meta = {
    title: (status === 403 ? 'Request rejected' : 'Something went wrong') + ' | ' + (res.locals.brand || ''),
    description: 'An error occurred handling this request.',
    canonical: require('./src/seo').absoluteUrl(req.path || '/'),
    robots: 'noindex, nofollow'
  };
  res.render('error', {
    heading: status === 403 ? 'Request rejected' : 'Something went wrong',
    body: status === 403
      ? err.message
      : 'The request could not be completed. If it keeps happening, tell the shop what you were doing at the time.',
    // Stack traces only ever reach the browser when DEBUG_MODE is explicitly on,
    // and config.js refuses to boot with DEBUG_MODE on in production.
    showDetail: config.debugMode && !config.isProd,
    detail: config.debugMode && !config.isProd ? (err.stack || err.message) : ''
  });
});

/* ------------------------------------------------------------- start */

const purged = purgeExpired();
if (purged) console.log(`[retention] deleted ${purged} expired submission record(s)`);
setInterval(() => {
  const n = purgeExpired();
  if (n) console.log(`[retention] deleted ${n} expired submission record(s)`);
}, 24 * 60 * 60 * 1000).unref();

const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`${config.env} server listening on port ${config.port}`);
  console.log(`canonical origin: ${config.siteOrigin}`);
  if (!config.isProd) console.log('robots.txt is serving Disallow: / because this is not a production build');
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    console.log(`\n${signal} received, closing server`);
    server.close(() => process.exit(0));
  });
}

module.exports = app;
