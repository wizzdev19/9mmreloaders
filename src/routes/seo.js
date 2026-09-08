'use strict';
/**
 * robots.txt and XML sitemaps.
 *
 * Generated from the live catalogue rather than maintained by hand, so a sitemap
 * can never list a URL that no longer exists. Split into an index plus child
 * sitemaps because the product sitemap will keep growing.
 */
const express = require('express');
const { catalog, q } = require('../db');
const seo = require('../seo');
const { config } = require('../config');

const router = express.Router();

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const BOOT_DATE = new Date().toISOString().slice(0, 10);

function urlset(entries) {
  const body = entries.map((e) => [
    '  <url>',
    `    <loc>${xmlEscape(seo.absoluteUrl(e.path))}</loc>`,
    `    <lastmod>${e.lastmod || BOOT_DATE}</lastmod>`,
    e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
    e.priority ? `    <priority>${e.priority}</priority>` : null,
    e.image ? `    <image:image><image:loc>${xmlEscape(seo.absoluteUrl(e.image))}</image:loc></image:image>` : null,
    '  </url>'
  ].filter(Boolean).join('\n')).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${body}
</urlset>`;
}

function sendXml(res, xml) {
  res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(xml);
}

router.get('/robots.txt', (req, res) => {
  const lines = [
    'User-agent: *',
    // Crawl budget: nothing is gained by a crawler walking basket state or search results.
    'Disallow: /cart',
    'Disallow: /order-request',
    'Disallow: /search',
    'Disallow: /contact/received',
    'Allow: /',
    '',
    `Sitemap: ${seo.absoluteUrl('/sitemap.xml')}`
  ];
  // A staging or preview deployment must never be indexed.
  if (!config.isProd) {
    res.type('text/plain').set('X-Robots-Tag', 'noindex').send('User-agent: *\nDisallow: /\n');
    return;
  }
  res.type('text/plain').set('Cache-Control', 'public, max-age=86400').send(lines.join('\n') + '\n');
});

router.get('/sitemap.xml', (req, res) => {
  const children = ['/sitemap-pages.xml', '/sitemap-collections.xml', '/sitemap-products.xml'];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${children.map((c) => `  <sitemap><loc>${xmlEscape(seo.absoluteUrl(c))}</loc><lastmod>${BOOT_DATE}</lastmod></sitemap>`).join('\n')}
</sitemapindex>`;
  sendXml(res, xml);
});

router.get('/sitemap-pages.xml', (req, res) => {
  sendXml(res, urlset([
    { path: '/', changefreq: 'daily', priority: '1.0' },
    { path: '/glock-pistols-for-sale', changefreq: 'daily', priority: '0.9' },
    { path: '/models', changefreq: 'weekly', priority: '0.7' },
    { path: '/calibers', changefreq: 'weekly', priority: '0.7' },
    { path: '/about', changefreq: 'monthly', priority: '0.4' },
    { path: '/contact', changefreq: 'monthly', priority: '0.4' },
    { path: '/compliance', changefreq: 'monthly', priority: '0.5' },
    { path: '/shipping-and-transfer-policy', changefreq: 'monthly', priority: '0.5' },
    { path: '/returns-policy', changefreq: 'monthly', priority: '0.3' },
    { path: '/privacy-policy', changefreq: 'yearly', priority: '0.3' },
    { path: '/cookie-policy', changefreq: 'yearly', priority: '0.3' },
    { path: '/terms-of-service', changefreq: 'yearly', priority: '0.3' },
    { path: '/accessibility', changefreq: 'yearly', priority: '0.3' }
  ]));
});

router.get('/sitemap-collections.xml', (req, res) => {
  const entries = q.categories.all().map((c) => ({
    path: `/collections/${c.slug}`, changefreq: 'weekly', priority: '0.8'
  }));
  for (const cal of q.calibers.all()) {
    entries.push({ path: `/calibers/${cal.caliber_slug}`, changefreq: 'weekly', priority: '0.6' });
  }
  sendXml(res, urlset(entries));
});

router.get('/sitemap-products.xml', (req, res) => {
  const rows = catalog.prepare('SELECT slug, primary_image FROM products ORDER BY id').all();
  sendXml(res, urlset(rows.map((r) => ({
    path: `/product/${r.slug}`,
    changefreq: 'weekly',
    priority: '0.7',
    image: r.primary_image ? `/img/products/${r.primary_image}` : null
  }))));
});

module.exports = router;
