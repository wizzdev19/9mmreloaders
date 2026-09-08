'use strict';
/**
 * Catalogue routes.
 *
 * Every page below is a real server rendered URL with its own title, description,
 * canonical and structured data. Nothing is injected by JavaScript, so a crawler
 * that never runs a script still sees the whole catalogue, and every product is
 * reachable through plain <a href> links from the home page in three clicks.
 */
const express = require('express');
const { q, listProducts, search, relatedProducts } = require('../db');
const seo = require('../seo');
const clean = require('../sanitize');

const router = express.Router();
const PER_PAGE = 24;

/* ------------------------------------------------------------- helpers */

function categoryGroups() {
  const all = q.categories.all();
  return {
    Models: all.filter((c) => c.grp === 'Models'),
    Ranges: all.filter((c) => c.grp === 'Ranges'),
    Parts: all.filter((c) => c.grp === 'Parts')
  };
}

function pageNumbers(page, totalPages) {
  const out = new Set([1, totalPages, page, page - 1, page + 1]);
  const list = [...out].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const withGaps = [];
  list.forEach((n, i) => {
    if (i > 0 && n - list[i - 1] > 1) withGaps.push('...');
    withGaps.push(n);
  });
  return withGaps;
}

function priceStats(rows) {
  const prices = rows.map((r) => r.price_cents).filter((p) => p != null);
  return prices.length ? Math.min(...prices) : null;
}

/**
 * Renders any product listing. Sorted views are marked noindex so the same set of
 * products in a different order does not compete with the canonical listing, which
 * is the behaviour Google's ecommerce guidance asks for.
 */
function renderListing(req, res, opts) {
  const sort = clean.oneOf(req.query.sort, ['featured', 'price-asc', 'price-desc', 'name-asc'], 'featured');
  const page = clean.integer(req.query.page, { min: 1, max: 500, fallback: 1 });
  const offset = (page - 1) * PER_PAGE;

  // One URL per set of results. Default parameters are redirected away rather than
  // left to produce a second address for identical content.
  const redundant = (sort === 'featured' && 'sort' in req.query) || (page === 1 && 'page' in req.query);
  if (redundant) {
    const p = new URLSearchParams();
    if (sort !== 'featured') p.set('sort', sort);
    if (page > 1) p.set('page', String(page));
    const qs = p.toString();
    return res.redirect(301, opts.basePath + (qs ? '?' + qs : ''));
  }

  const { rows, total } = listProducts({ ...opts.filter, sort, limit: PER_PAGE, offset });
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  if (page > totalPages && total > 0) return res.redirect(301, opts.basePath);

  const groups = categoryGroups();
  const calibers = q.calibers.all();

  const params = new URLSearchParams();
  if (sort !== 'featured') params.set('sort', sort);
  const pageUrl = (n) => {
    const p = new URLSearchParams(params);
    if (n > 1) p.set('page', String(n));
    const qs = p.toString();
    return opts.basePath + (qs ? '?' + qs : '');
  };

  const canonicalPath = pageUrl(page);
  const isFiltered = sort !== 'featured';

  res.locals.meta = {
    title: page > 1 ? seo.truncate(`${opts.h1}, page ${page} of ${totalPages} | ${seo.brand()}`, 75) : opts.meta.title,
    description: page > 1
      ? seo.truncate(`Page ${page} of ${totalPages}. Listings ${offset + 1} to ${Math.min(offset + PER_PAGE, total)} of ${total}. ${opts.meta.description}`, 158)
      : opts.meta.description,
    canonical: seo.absoluteUrl(canonicalPath),
    robots: isFiltered ? 'noindex, follow' : null,
    prev: page > 1 ? seo.absoluteUrl(pageUrl(page - 1)) : null,
    next: page < totalPages ? seo.absoluteUrl(pageUrl(page + 1)) : null,
    image: rows[0]?.primary_image ? seo.absoluteUrl('/img/products/' + rows[0].primary_image) : null
  };
  res.locals.jsonLd = [
    seo.breadcrumbLd(opts.trail),
    seo.itemListLd(rows, canonicalPath)
  ];

  res.render('listing', {
    trail: opts.trail,
    h1: page > 1 ? `${opts.h1}, page ${page}` : opts.h1,
    intro: opts.intro,
    products: rows,
    total,
    page,
    totalPages,
    pageList: pageNumbers(page, totalPages),
    pageUrl,
    basePath: opts.basePath,
    sort,
    groups,
    calibers,
    activeSlug: opts.activeSlug || null,
    activeCaliber: opts.activeCaliber || null,
    rangeFrom: total === 0 ? 0 : offset + 1,
    rangeTo: Math.min(offset + PER_PAGE, total),
    footNote: opts.footNote || null
  });
}

/* ---------------------------------------------------------------- home */

router.get('/', (req, res) => {
  const all = q.categories.all();
  const models = all.filter((c) => c.grp === 'Models').sort((a, b) => b.product_count - a.product_count);
  const ranges = all.filter((c) => c.grp === 'Ranges').sort((a, b) => a.sort - b.sort);
  const calibers = q.calibers.all();
  const range = q.priceRange.get();
  const total = q.countAll.get().c;

  const recent = listProducts({ sort: 'newest', limit: 8 }).rows;
  const featured = recent.find((p) => p.primary_image) || null;

  res.locals.meta = {
    title: `${seo.brand()} | Glock Pistols, Slides and Triggers`,
    description: seo.truncate(
      `Licensed dealer catalogue of ${total} Glock listings across ${models.length} models: factory, factory colored, custom and optic ready pistols plus slides and triggers.`, 155),
    canonical: seo.absoluteUrl('/'),
    robots: null,
    image: featured ? seo.absoluteUrl('/img/products/' + featured.primary_image) : null
  };
  res.locals.jsonLd = [seo.organizationLd(), seo.websiteLd()];

  res.render('home', {
    stats: {
      total,
      modelCount: models.length,
      caliberCount: calibers.length,
      minPrice: range.lo,
      maxPrice: range.hi
    },
    topModels: models.slice(0, 8),
    ranges,
    recent,
    featured
  });
});

/* --------------------------------------------------- full catalogue */

router.get('/glock-pistols-for-sale', (req, res) => {
  const total = q.countAll.get().c;
  const range = q.priceRange.get();
  renderListing(req, res, {
    basePath: '/glock-pistols-for-sale',
    filter: {},
    trail: [{ label: 'Home', href: '/' }, { label: 'Glock pistols for sale', href: '/glock-pistols-for-sale' }],
    h1: 'Glock pistols for sale',
    intro: `The complete catalogue: ${total} listings covering factory, colored, custom and optic ready Glock pistols along with spare slides and drop in triggers.`,
    meta: {
      title: `Glock Pistols For Sale | ${total} Listings | ${seo.brand()}`,
      description: seo.truncate(`Every Glock listing in the catalogue, ${total} in total, with caliber, barrel length, magazine capacity, SKU and price. Prices from $${seo.money(range.lo)}.`, 155)
    }
  });
});

/* ------------------------------------------------------- collections */

router.get('/collections/:slug', (req, res, next) => {
  const slug = clean.slug(req.params.slug);
  const category = q.categoryBySlug.get(slug);
  if (!category || category.product_count === 0) return next();

  const sample = listProducts({ categorySlug: slug, limit: 500 }).rows;
  const calibers = [...new Set(sample.map((p) => p.caliber).filter(Boolean))];
  const meta = seo.categoryMeta(category, { minPrice: priceStats(sample), calibers });

  renderListing(req, res, {
    basePath: `/collections/${slug}`,
    filter: { categorySlug: slug },
    activeSlug: slug,
    trail: [
      { label: 'Home', href: '/' },
      { label: 'Glock pistols for sale', href: '/glock-pistols-for-sale' },
      { label: category.name, href: `/collections/${slug}` }
    ],
    h1: meta.h1,
    intro: meta.intro,
    meta: { title: meta.title, description: meta.description }
  });
});

/* ------------------------------------------------- browse by model */

router.get('/models', (req, res) => {
  const models = q.categories.all().filter((c) => c.grp === 'Models');
  const total = models.reduce((a, c) => a + c.product_count, 0);
  const trail = [{ label: 'Home', href: '/' }, { label: 'Browse by model', href: '/models' }];

  res.locals.meta = {
    title: `Glock Models Index | ${models.length} Models | ${seo.brand()}`,
    description: seo.truncate(`Index of every Glock model in the catalogue, from the Glock 17 to the Glock 49, with the number of listings held against each model.`, 155),
    canonical: seo.absoluteUrl('/models')
  };
  res.locals.jsonLd = [seo.breadcrumbLd(trail)];

  res.render('index-page', {
    trail,
    h1: 'Browse Glock pistols by model',
    intro: `${models.length} Glock models are represented in the catalogue, covering ${total} listings. Each model page groups every configuration of that frame, including colored and custom versions.`,
    sections: [{
      heading: 'Model pages',
      note: 'Sorted by model number.',
      items: models.map((c) => ({ label: c.name, href: `/collections/${c.slug}`, count: c.product_count }))
    }]
  });
});

/* ----------------------------------------------- browse by caliber */

router.get('/calibers', (req, res) => {
  const calibers = q.calibers.all();
  const trail = [{ label: 'Home', href: '/' }, { label: 'Browse by caliber', href: '/calibers' }];

  res.locals.meta = {
    title: `Glock Pistols By Caliber | ${seo.brand()}`,
    description: seo.truncate(`Glock listings grouped by chambering: ${calibers.map((c) => c.caliber).join(', ')}. Compare barrel length and capacity within a caliber.`, 155),
    canonical: seo.absoluteUrl('/calibers')
  };
  res.locals.jsonLd = [seo.breadcrumbLd(trail)];

  res.render('index-page', {
    trail,
    h1: 'Browse Glock pistols by caliber',
    intro: 'Caliber pages collect every listing recorded with that chambering, which makes it easier to compare barrel length and magazine capacity across different frame sizes.',
    sections: [{
      heading: 'Calibers in the catalogue',
      note: 'A caliber gets its own page once at least three listings share it.',
      items: calibers.map((c) => ({ label: c.caliber, href: `/calibers/${c.caliber_slug}`, count: c.n }))
    }]
  });
});

router.get('/calibers/:slug', (req, res, next) => {
  const slug = clean.slug(req.params.slug);
  const row = q.calibers.all().find((c) => c.caliber_slug === slug);
  if (!row) return next();

  const sample = listProducts({ caliberSlug: slug, limit: 500 }).rows;
  const meta = seo.caliberMeta(row.caliber, slug, row.n, priceStats(sample));

  renderListing(req, res, {
    basePath: `/calibers/${slug}`,
    filter: { caliberSlug: slug },
    activeCaliber: slug,
    trail: [
      { label: 'Home', href: '/' },
      { label: 'Browse by caliber', href: '/calibers' },
      { label: row.caliber, href: `/calibers/${slug}` }
    ],
    h1: meta.h1,
    intro: meta.intro,
    meta: { title: meta.title, description: meta.description }
  });
});

/* -------------------------------------------------------- product */

router.get('/product/:slug', (req, res, next) => {
  const slug = clean.slug(req.params.slug);
  const product = q.productBySlug.get(slug);
  if (!product) return next();

  const images = q.imagesFor.all(product.id);
  const variants = q.variantsFor.all(product.id);
  const cats = q.categoriesFor.all(product.id);
  const primaryCategory = cats.find((c) => c.grp === 'Models') || cats[0] || null;
  const related = relatedProducts(product, 4);

  const trail = [{ label: 'Home', href: '/' }, { label: 'Glock pistols for sale', href: '/glock-pistols-for-sale' }];
  if (primaryCategory) trail.push({ label: primaryCategory.name, href: `/collections/${primaryCategory.slug}` });
  trail.push({ label: product.name, href: `/product/${product.slug}` });

  const meta = seo.productMeta(product);
  res.locals.meta = {
    title: meta.title,
    description: meta.description,
    canonical: seo.absoluteUrl(`/product/${product.slug}`),
    ogType: 'product',
    image: images[0] ? seo.absoluteUrl('/img/products/' + images[0].filename) : null
  };
  res.locals.jsonLd = [seo.breadcrumbLd(trail), seo.productLd(product, images)];

  res.render('product', {
    product,
    images,
    variants,
    related,
    primaryCategory,
    trail,
    clientCopy: product.client_copy ? clean.renderClientCopy(product.client_copy) : null
  });
});

/* --------------------------------------------------------- search */

router.get('/search', (req, res) => {
  const term = clean.text(req.query.q, 60);
  const products = term ? search(term, 48) : [];

  res.locals.searchTerm = term;
  res.locals.meta = {
    title: term ? `Search: ${term} | ${seo.brand()}` : `Search the catalogue | ${seo.brand()}`,
    description: 'Search the Glock catalogue by model number, caliber or SKU.',
    canonical: seo.absoluteUrl('/search'),
    // Internal search result pages are exactly what Google asks sites not to index.
    robots: 'noindex, follow'
  };

  res.render('search', { term, products, total: products.length });
});

module.exports = router;
