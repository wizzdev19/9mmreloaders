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
const brand = () => b().tradingName || b().legalName || 'Glock Retailer';

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
      intro: `${n} Glock ${model} listings. Each entry shows the caliber, barrel length, magazine capacity and SKU taken from the supplier record.`
    };
  }

  const map = {
    'gen-6-glocks': ['Gen 6 Glock Pistols', 'Gen 6 Glock models with the Standard Optic Ready System and RTF6 frame texture.'],
    'custom-glocks': ['Custom Glock Builds', 'Custom slide cuts, coatings, grip work and optic installations on Glock frames.'],
    'optic-ready-glocks': ['Optic Ready Glock Pistols', 'Glock pistols supplied with a red dot already cut and mounted.'],
    'glock-factory-handguns': ['Glock Factory Handguns', 'Standard factory configuration Glock pistols.'],
    'glock-factory-colored-handguns': ['Glock Factory Colored Handguns', 'Factory Glock pistols in Cerakote and factory color finishes.'],
    'used-glock-pistols': ['Used Glock Pistols', 'Second hand Glock pistols.'],
    'glock-slides': ['Glock Slides', 'Complete and stripped slides for Glock frames.'],
    'glock-triggers': ['Glock Triggers', 'Drop in trigger assemblies and trigger shoes for Glock pistols.'],
    'glock-store-models': ['Glock Store Models', 'Store exclusive Glock configurations.']
  };
  const [label, blurb] = map[category.slug] || [category.name, `${category.name} listings.`];
  return {
    title: `${label} | ${n} Listed | ${brand()}`,
    description: truncate(`${blurb} ${n} listings with specifications, images and SKUs. ${from}`, 155),
    h1: label,
    intro: `${blurb} ${n} listings, each with the specifications recorded against the SKU.`
  };
}

function caliberMeta(caliber, slug, count, minPrice) {
  return {
    title: `${caliber} Glock Pistols | ${count} Listed | ${brand()}`,
    description: truncate(`${count} Glock pistols chambered in ${caliber}, with barrel length, capacity and SKU for each listing.${minPrice != null ? ` Prices from $${money(minPrice)}.` : ''}`, 155),
    h1: `Glock pistols in ${caliber}`,
    intro: `Every Glock listing recorded as ${caliber}, grouped so you can compare barrel length and capacity across models.`
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
    name: biz.tradingName || biz.legalName,
    legalName: biz.legalName,
    url: config.siteOrigin,
    description: biz.tagline,
    image: absoluteUrl('/img/brand/storefront.png'),
    logo: absoluteUrl('/img/brand/logo.png')
  };
  if (biz.contact?.phone && !/PLACEHOLDER/.test(biz.contact.phone)) node.telephone = biz.contact.phone;
  if (biz.contact?.email && !/PLACEHOLDER/.test(biz.contact.email)) node.email = biz.contact.email;
  if (biz.address && !/PLACEHOLDER/.test(biz.address.street || '')) {
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

module.exports = {
  absoluteUrl, money, truncate, brand,
  categoryMeta, caliberMeta, productMeta,
  organizationLd, websiteLd, breadcrumbLd, productLd, itemListLd
};
