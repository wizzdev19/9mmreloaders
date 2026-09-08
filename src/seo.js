'use strict';
/**
 * SEO helpers.
 *
 * Implements the technical items in Google Search Central's SEO Starter Guide and
 * the ecommerce specialty guide: one indexable URL per thing, unique title and
 * description per page, self referencing canonicals, crawlable <a href> links,
 * breadcrumbs, and structured data for Organization, WebSite, BreadcrumbList,
 * Product and ItemList.
 *
 * Deliberately absent: any promise about rankings. Structure and eligibility are
 * what code can deliver.
 */
const { config } = require('./config');

const b = () => config.business || {};
// The trading name drives every page title, the footer and the structured data.
// Until the licence holder supplies it, a neutral catalogue name is used. It is a
// single field to change, not a string scattered through the templates.
const brand = () => b().tradingName || b().legalName || b().fallbackBrand || 'Glock Catalogue';
const legalName = () => b().legalName || brand();

function absoluteUrl(pathname) {
  return config.siteOrigin + (pathname.startsWith('/') ? pathname : '/' + pathname);
}

function money(cents) {
  if (cents == null) return null;
  return (cents / 100).toFixed(2);
}

function truncate(str, n) {
  const s = String(str || '').replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  return s.slice(0, s.lastIndexOf(' ', n - 1)).replace(/[,.;:]$/, '') + '.';
}

/* --------------------------------------------------------------- meta */

/**
 * Title pattern: primary keyword first, brand last, under ~60 characters where possible.
 * Description pattern: what the page lists, the concrete attributes, the price floor.
 * Everything is generated from catalogue data, so nothing here is an invented figure.
 */
// "1 listings" reads like a bug, so counts are pluralised everywhere they are printed.
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// A collection with fewer than this many listings is too thin to rank on its own.
const THIN_COLLECTION_MIN = 3;

function categoryMeta(category, stats) {
  const n = category.product_count;
  const from = stats.minPrice != null ? `Prices from $${money(stats.minPrice)}.` : '';
  const calibers = stats.calibers.slice(0, 3).join(', ');

  if (/^glock-(\d{2})-for-sale$/.test(category.slug)) {
    const model = category.name.replace(/^Glock\s*/, '');
    return {
      title: `Glock ${model} For Sale | ${n} Listed | ${brand()}`,
      description: truncate(
        `${n} Glock ${model} pistols listed${calibers ? ` in ${calibers}` : ''}. Factory, colored and custom configurations with specifications, images and SKUs. ${from}`, 155),
      h1: `Glock ${model} for sale`,
      intro: `${plural(n, 'Glock ' + model + ' listing')}. Each entry shows the caliber, barrel length, magazine capacity and SKU taken from the supplier record.`
    };
  }

  // Each non model collection is given its own angle, so two collections that
  // contain overlapping stock never compete for the same search term. The map is
  // the single source of that wording: title, H1 and intro all derive from it.
  const map = {
    'gen-6-glocks': ['Gen 6 Glock Pistols', 'Gen 6 Glock models with the Standard Optic Ready System and RTF6 frame texture.'],
    'custom-glocks': ['Custom Glock Builds', 'Custom slide cuts, coatings, grip work and optic installations carried out on Glock frames.'],
    'optic-ready-glocks': ['Optic Ready Glock Pistols', 'Glock pistols supplied with the slide already cut for a red dot, or with an optic fitted.'],
    'glock-factory-handguns': ['Glock Factory Handguns', 'Unmodified factory configuration Glock pistols, as they leave the factory with no aftermarket work.'],
    'glock-factory-colored-handguns': ['Glock Factory Colored Handguns', 'Factory Glock pistols in a factory applied color finish rather than standard black.'],
    'used-glock-pistols': ['Used Glock Pistols', 'Second hand Glock pistols taken in by the shop.'],
    'glock-slides': ['Glock Slides', 'Complete and stripped slides for Glock frames, sold as a part rather than a firearm.'],
    'glock-triggers': ['Glock Triggers', 'Drop in trigger assemblies and trigger shoes for Glock pistols.'],
    'glock-store-models': ['Glock Store Models', 'Store exclusive Glock configurations built for a single retailer.']
  };
  const [label, blurb] = map[category.slug] || [category.name, `${category.name} listings.`];
  return {
    title: `${label} | ${n} Listed | ${brand()}`,
    description: truncate(`${blurb} ${plural(n, 'listing')} with specifications, images and SKUs. ${from}`, 155),
    h1: label,
    intro: `${blurb} ${plural(n, 'listing')}, each with the specifications recorded against the SKU.`,
    // A collection holding one or two items cannot support its own search term and
    // only competes with the larger page that also contains those items, so it is
    // kept crawlable but out of the index. Model collections are exempt: a single
    // Glock 39 listing is still the only answer to a search for a Glock 39.
    robots: n < THIN_COLLECTION_MIN ? 'noindex, follow' : null
  };
}

function caliberMeta(caliber, slug, count, minPrice) {
  return {
    title: `${caliber} Glock Pistols | ${count} Listed | ${brand()}`,
    description: truncate(`${plural(count, 'Glock pistol')} chambered in ${caliber}, with barrel length, capacity and SKU for each listing.${minPrice != null ? ` Prices from $${money(minPrice)}.` : ''}`, 155),
    h1: `Glock pistols in ${caliber}`,
    intro: `Every Glock in the catalogue chambered in ${caliber}, drawn from all models and finishes. Use this page to compare barrel length and magazine capacity across models in one caliber.`
  };
}

function productMeta(product) {
  const parts = [];
  if (product.caliber) parts.push(product.caliber);
  if (product.barrel_in) parts.push(`${product.barrel_in} in barrel`);
  if (product.capacity) parts.push(`${product.capacity} capacity`);
  const spec = parts.join(', ');
  // Where the supplier reused a product name, the SKU keeps the page title unique.
  // The SKU is never trimmed away, because that is the part doing the work.
  const suffix = product.title_suffix ? ` (${product.title_suffix})` : '';
  const withBrand = `${product.name}${suffix} | ${brand()}`;
  let title;
  if (withBrand.length <= 64) {
    title = withBrand;
  } else if (product.name.length + suffix.length <= 66) {
    // Long name, so the brand is dropped rather than the product identity.
    title = `${product.name}${suffix}`;
  } else {
    const room = 66 - suffix.length;
    const cut = product.name.lastIndexOf(' ', room);
    title = product.name.slice(0, cut > 30 ? cut : room).replace(/[\s,;:.-]+$/, '') + suffix;
  }

  return {
    title,
    description: truncate(
      `${product.name}. ${spec ? spec + '. ' : ''}SKU ${product.sku}${product.price_cents != null ? `, $${money(product.price_cents)}` : ''}. Specifications and images for this listing.`, 155)
  };
}

/* ------------------------------------------------------ structured data */

function organizationLd() {
  const biz = b();
  const node = {
    '@context': 'https://schema.org',
    '@type': 'Store',
    '@id': absoluteUrl('/#organization'),
    name: brand(),
    url: config.siteOrigin,
    description: biz.tagline,
    image: absoluteUrl('/img/brand/storefront.png'),
    logo: absoluteUrl('/img/brand/logo.png')
  };
  if (biz.legalName) node.legalName = biz.legalName;
  if (biz.contact?.phone) node.telephone = biz.contact.phone;
  if (biz.contact?.email) node.email = biz.contact.email;
  if (biz.address?.street && biz.address?.locality) {
    node.address = {
      '@type': 'PostalAddress',
      streetAddress: biz.address.street,
      addressLocality: biz.address.locality,
      addressRegion: biz.address.region,
      postalCode: biz.address.postalCode,
      addressCountry: biz.address.country
    };
  }
  if (biz.geo?.latitude != null && biz.geo?.longitude != null) {
    node.geo = { '@type': 'GeoCoordinates', latitude: biz.geo.latitude, longitude: biz.geo.longitude };
  }
  if (Array.isArray(biz.openingHours) && biz.openingHours.length) node.openingHours = biz.openingHours;
  if (Array.isArray(biz.social?.profiles) && biz.social.profiles.length) node.sameAs = biz.social.profiles;
  return node;
}

function websiteLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': absoluteUrl('/#website'),
    url: config.siteOrigin,
    name: brand(),
    publisher: { '@id': absoluteUrl('/#organization') },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: absoluteUrl('/search?q={search_term_string}') },
      'query-input': 'required name=search_term_string'
    }
  };
}

function breadcrumbLd(trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.label,
      item: absoluteUrl(item.href)
    }))
  };
}

/**
 * Product structured data.
 * Only fields backed by real catalogue data are emitted. No aggregateRating and no
 * review markup, because there are no genuine reviews. Fabricating either would be
 * a spam policy violation as well as a lie to customers.
 */
function productLd(product, images) {
  const node = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': absoluteUrl(`/product/${product.slug}#product`),
    name: product.name,
    description: product.summary,
    sku: product.sku,
    category: product.product_class,
    brand: { '@type': 'Brand', name: 'Glock' },
    image: images.map((img) => absoluteUrl('/img/products/' + img.filename))
  };
  const props = [];
  if (product.caliber) props.push({ '@type': 'PropertyValue', name: 'Caliber', value: product.caliber });
  if (product.barrel_in) props.push({ '@type': 'PropertyValue', name: 'Barrel length', value: `${product.barrel_in} in` });
  if (product.capacity) props.push({ '@type': 'PropertyValue', name: 'Magazine capacity', value: product.capacity });
  if (product.generation) props.push({ '@type': 'PropertyValue', name: 'Generation', value: product.generation });
  if (product.model) props.push({ '@type': 'PropertyValue', name: 'Model', value: 'Glock ' + product.model });
  if (props.length) node.additionalProperty = props;

  if (product.price_cents != null) {
    node.offers = {
      '@type': 'Offer',
      url: absoluteUrl(`/product/${product.slug}`),
      priceCurrency: 'USD',
      price: money(product.price_cents),
      availability: product.in_stock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: product.product_class === 'Used pistol'
        ? 'https://schema.org/UsedCondition' : 'https://schema.org/NewCondition',
      seller: { '@id': absoluteUrl('/#organization') }
    };
  }
  return node;
}

/**
 * A typed page node for the non catalogue pages, so each one declares what it is
 * rather than leaving Google to infer it. Also carries the last review date on
 * policy pages, which is the signal that they are maintained.
 */
function webPageLd(type, { name, description, pathname, dateModified }) {
  const node = {
    '@context': 'https://schema.org',
    '@type': type,
    '@id': absoluteUrl(pathname) + '#page',
    url: absoluteUrl(pathname),
    name,
    description,
    isPartOf: { '@id': absoluteUrl('/#website') },
    publisher: { '@id': absoluteUrl('/#organization') }
  };
  if (dateModified) node.dateModified = dateModified;
  return node;
}

function itemListLd(products, pathname) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    '@id': absoluteUrl(pathname) + '#list',
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: absoluteUrl(`/product/${p.slug}`),
      name: p.name
    }))
  };
}

/* ------------------------------------------------------------------ images */

/**
 * Alt text for a product photograph.
 *
 * Google asks for descriptive alt text, not a keyword list, so this states what the
 * picture actually shows: the product, its caliber and which of the supplied views
 * it is. The supplier gives no per image caption, so the position is the only honest
 * way to distinguish the second and third shots.
 */
function imageAlt(product, index, total) {
  const parts = [product.name];
  if (product.caliber) parts.push(product.caliber);
  const base = parts.join(', ');
  if (!index) return `${base}, product photograph`;
  return `${base}, photograph ${index + 1} of ${total}`;
}

/** WebP srcset for an image row that carries a comma separated variants column. */
function webpSrcset(image) {
  if (!image || !image.variants) return '';
  const base = String(image.filename).replace(/\.[^.]+$/, '');
  return String(image.variants)
    .split(',')
    .filter(Boolean)
    .map((w) => `/img/products/${base}-${w}.webp ${w}w`)
    .join(', ');
}

/** Smallest generated variant, used for gallery thumbnails. */
function thumbFile(image) {
  if (!image) return '';
  if (!image.variants) return image.filename;
  const smallest = String(image.variants).split(',').filter(Boolean)[0];
  return `${String(image.filename).replace(/\.[^.]+$/, '')}-${smallest}.webp`;
}

module.exports = {
  THIN_COLLECTION_MIN,
  imageAlt,
  webpSrcset,
  thumbFile,
  absoluteUrl, money, truncate, brand,
  categoryMeta, caliberMeta, productMeta,
  organizationLd, websiteLd, breadcrumbLd, productLd, itemListLd,
  webPageLd, legalName
};
