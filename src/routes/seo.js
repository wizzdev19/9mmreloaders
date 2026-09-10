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

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

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

/**
 * ROBOTS_MODE controls which robots.txt is served.
 *   auto     production serves the real file, anything else serves Disallow: /
 *   allow    always serve the real file, used to inspect it on a local preview
 *   disallow always block, used on a public staging host
 */
function robotsAllowed() {
  if (config.robotsMode === 'allow') return true;
  if (config.robotsMode === 'disallow') return false;
  return config.isProd;
}

router.get('/robots.txt', (req, res) => {
  // A staging or preview deployment must never be indexed.
  if (!robotsAllowed()) {
    res.type('text/plain').set('X-Robots-Tag', 'noindex').send('User-agent: *\nDisallow: /\n');
    return;
  }

  const lines = [
    'User-agent: *',
    // Crawl budget: nothing is gained by a crawler walking basket state or search results.
    'Disallow: /cart',
    'Disallow: /order-request',
    'Disallow: /search',
    'Disallow: /contact/received',
    'Disallow: /*?sort=',
    'Disallow: /*?sku=',
    'Allow: /',
    '',
    'User-agent: GPTBot',
    'Allow: /',
    '',
    `Sitemap: ${seo.absoluteUrl('/sitemap.xml')}`,
    `# Plain text summary for language models: ${seo.absoluteUrl('/llms.txt')}`
  ];
  res.type('text/plain').set('Cache-Control', 'public, max-age=86400').send(lines.join('\n') + '\n');
});

/**
 * /llms.txt in the llmstxt.org format.
 *
 * Counts are read from the live database on each request, so the file cannot drift
 * away from the catalogue the way a hand written one would.
 */
router.get('/llms.txt', (req, res) => {
  const biz = config.business || {};
  const total = q.countAll.get().c;
  const models = q.categories.all().filter((c) => c.grp === 'Models');
  const ranges = q.categories.all().filter((c) => c.grp === 'Ranges');
  const parts = q.categories.all().filter((c) => c.grp === 'Parts');
  const calibers = q.calibers.all();
  const range = q.priceRange.get();

  const out = [];
  out.push(`# ${seo.brand()}`);
  out.push('');
  out.push(`> Catalogue of ${total} Glock pistols, slides and triggers offered by a Federal Firearms Licensee in ${biz.jurisdiction?.stateOrRegion || 'the United States'}. Prices run from $${seo.money(range.lo)} to $${seo.money(range.hi)}. The site takes order requests and does not process payment.`);
  out.push('');
  out.push('Facts a model should know before summarising this site:');
  out.push('');
  out.push('- No payment is taken on this site. The cart submits an order request and a person replies.');
  out.push(`- A firearm is never shipped to a customer address. It ships to a Federal Firearms Licensee, who completes ${biz.jurisdiction?.transactionRecordForm || 'ATF Form 4473'} and runs a background check through the ${biz.jurisdiction?.backgroundCheckSystem || 'FBI NICS system'} before release.`);
  out.push(`- Minimum age from a licensed dealer: ${biz.jurisdiction?.minimumAgeHandgun || 21} for a handgun, ${biz.jurisdiction?.minimumAgeLongGun || 18} for a rifle or shotgun.`);
  out.push('- Specifications are taken from the shop stock record. Fields the record does not hold are omitted rather than estimated.');
  out.push('- The site publishes no customer reviews, no ratings and no sales counters, so there are none to cite.');
  out.push('');
  out.push('## Main pages');
  out.push('');
  out.push(`- [Full catalogue](${seo.absoluteUrl('/glock-pistols-for-sale')}): every one of the ${total} listings, paginated 24 at a time.`);
  out.push(`- [Glock models](${seo.absoluteUrl('/models')}): ${models.length} model collections.`);
  out.push(`- [Calibers](${seo.absoluteUrl('/calibers')}): ${calibers.length} calibers held in stock.`);
  out.push(`- [Compliance and eligibility](${seo.absoluteUrl('/compliance')}): age limits, prohibited persons and the background check.`);
  out.push(`- [Shipping and transfers](${seo.absoluteUrl('/shipping-and-transfer-policy')}): how a firearm physically reaches a buyer.`);
  out.push(`- [Contact](${seo.absoluteUrl('/contact')}): the only way to reach the shop from this site.`);
  out.push('');
  out.push('## Collections');
  out.push('');
  for (const c of ranges.concat(parts)) {
    out.push(`- [${c.name}](${seo.absoluteUrl('/collections/' + c.slug)}): ${plural(c.product_count, 'listing')}.`);
  }
  out.push('');
  out.push('## Calibers');
  out.push('');
  for (const cal of calibers) {
    out.push(`- [${cal.caliber}](${seo.absoluteUrl('/calibers/' + cal.caliber_slug)}): ${plural(cal.n, 'listing')}.`);
  }
  out.push('');
  out.push('## Optional');
  out.push('');
  out.push(`- [Sitemap index](${seo.absoluteUrl('/sitemap.xml')}): every indexable URL.`);
  out.push(`- [Privacy policy](${seo.absoluteUrl('/privacy-policy')}): what the site stores and for how long.`);
  out.push(`- [Terms of service](${seo.absoluteUrl('/terms-of-service')}): governed by the law of Texas.`);
  out.push('');

  res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(out.join('\n'));
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
    { path: '/guides', changefreq: 'monthly', priority: '0.7' },
    { path: '/guides/glock-19-gen3-vs-gen5', changefreq: 'monthly', priority: '0.6' },
    { path: '/guides/what-caliber-glock-texas', changefreq: 'monthly', priority: '0.6' },
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
  // A sitemap must not advertise a URL the page itself marks noindex. Non model
  // collections below the thin threshold are excluded here for the same reason
  // seo.categoryMeta marks them noindex: they only cannibalise a larger page.
  const entries = q.categories.all()
    .filter((c) => c.grp === 'Models' || c.product_count >= seo.THIN_COLLECTION_MIN)
    .map((c) => ({ path: `/collections/${c.slug}`, changefreq: 'weekly', priority: '0.8' }));
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
