# SEO implementation

Built against Google Search Central documentation: the Search Essentials, the SEO Starter Guide, How Search Works, the Helpful Content guidance and the Ecommerce specialty guide.

**Stated plainly before anything else:** this document describes technical conformance and eligibility. No implementation, and no developer, can guarantee a ranking or a traffic figure. Google says so in its own documentation. What follows is the part that is in our control, done properly.

---

## 1. What was generated from the supplied CSV

| Item | Count |
|---|---|
| Products imported | 379 |
| Product variations | 23 |
| Categories | 39 |
| Product images downloaded and hosted locally | 642 |
| Responsive WebP variants generated (400w and 800w) | 892 |
| Products with no image | 0 |

## 2. URL architecture

Every one of these is a real server rendered URL. No page depends on JavaScript to show its content or its links, which is the single most important thing an ecommerce site can get right for crawling.

| Pattern | Count | Indexable | Purpose |
|---|---|---|---|
| `/` | 1 | Yes | Brand and entry point |
| `/glock-pistols-for-sale` | 1 | Yes | Full catalogue, paginated 24 per page |
| `/collections/{slug}` | 39 | Yes | Category pages, model and range |
| `/calibers` and `/calibers/{slug}` | 8 | Yes | Caliber facet pages, created only where at least 3 products share a chambering so no thin page is generated |
| `/models` | 1 | Yes | Model index, a hub linking all 30 model pages |
| `/product/{slug}` | 379 | Yes | Product detail pages |
| Policy and information pages | 9 | Yes | About, contact, compliance, transfers, returns, privacy, cookies, terms, accessibility |
| `/search`, `/cart`, `/order-request` | 3 | No | `noindex, follow` and disallowed in robots.txt |

**Total indexable URLs: 436.** Two collections that hold a single listing each, `used-glock-pistols` and `glock-store-models`, were moved to `noindex, follow` and dropped from the sitemap. They are still linked and still crawlable, they simply cannot compete with the larger pages that contain the same two items. See section 3a.

Crawl depth from the home page to any product: **3 clicks maximum** (home to model index to model page to product), and 2 for anything in the top eight models.

## 3. Keyword to URL mapping

The full one keyword per URL table lives in `docs/KEYWORD-MAP.md` and is enforced by `npm run audit:cannibal`. The summary below explains the reasoning behind it.

Derived from the earlier keyword research, adapted to the fact that this catalogue is single brand. The head term "guns for sale" is not targeted, because a new domain cannot take it from the national chains and pretending otherwise wastes the client's money. The strategy is to own the exact model and configuration long tail, where the catalogue genuinely has the best inventory depth.

| Intent | Target query shape | Page that serves it | Why it can win |
|---|---|---|---|
| Transactional, high value | `glock 43 for sale`, `glock 19 for sale`, `glock 43x for sale` | `/collections/glock-43-for-sale` and 29 sibling model pages | 67 Glock 43 listings and 25 Glock 19 listings is real depth, not a thin page |
| Transactional, long tail | `glock 43x battleworn burnt bronze`, exact finish and SKU queries | 379 product pages | Low competition, exact match, high purchase intent |
| Commercial investigation | `gen 6 glock`, `custom glock builds`, `optic ready glock` | `/collections/gen-6-glocks`, `/collections/custom-glocks`, `/collections/optic-ready-glocks` | Newer and specialist terms where the big chains have thin coverage |
| Commercial investigation | `10mm glock`, `380 glock pistol`, `.45 acp glock` | `/calibers/10mm-auto`, `/calibers/380-acp`, `/calibers/45-acp` | Caliber is how a lot of buyers actually shop, and no competitor page groups this brand by caliber |
| Transactional, parts | `glock slides`, `glock triggers`, `drop in trigger for gen 5` | `/collections/glock-slides`, `/collections/glock-triggers` | 32 parts listings, a different buyer with a different journey |
| Navigational | the business name | `/`, `/about`, `/contact` | The only navigational set a new dealer can own, and it is owned by having a clean, complete, honest home and about page |
| Informational | how the transfer works, eligibility, local law | `/compliance`, `/shipping-and-transfer-policy` | Answers the question that stops people buying. Needs the client's real process before it can rank for anything |

## 3a. Keyword cannibalisation

Three pages in this catalogue contain many of the same products: `/glock-pistols-for-sale` (379 listings), `/collections/glock-factory-handguns` (111) and `/calibers/9mm` (185). Left alone they would compete for the same queries and each rank worse than one page would. Four things keep them apart.

**One primary term per URL.** `docs/KEYWORD-MAP.md` assigns exactly one primary keyword to every indexable URL. Model collections own `glock <model> for sale`. Caliber pages own `<caliber> glock` and never claim a model term. The hub owns the generic head term and no collection repeats it.

**Distinct angles, not distinct inventory.** The hub says it is the complete index. The factory collection is about the configuration being unmodified. The caliber page is a cross model comparison in one chambering. That difference is carried through the H1, the intro paragraph and the meta description on each page rather than being asserted once and forgotten.

**Thin pages are removed from the index.** A non model collection holding fewer than three listings gets `noindex, follow` automatically, set in `seo.categoryMeta` and mirrored by the sitemap, which excludes the same pages. Model collections are exempt on purpose: a single Glock 39 listing is still the only answer to a search for a Glock 39, so it stays indexable.

**Duplicate titles and H1s fail the build.** `npm run audit:cannibal` crawls the live site and exits non zero if two indexable URLs share a title, share an H1, share a primary keyword, or if one page uses another page's model phrase in its title. `npm run audit:seo` does the same across all 500 crawled URLs including every product page.

Product pages were the largest risk: 158 of 379 products share a supplier name. Both the title tag and the H1 now carry the SKU, for example `GLOCK 19 Gen 5 Austrian MFG 9mm Luger Semi Automatic Pistol (GR-4767)`, which makes every one unique. That is a mitigation, not a fix. The real fix is item 5 in `docs/CLIENT-ACTIONS.md`.

## 3b. Page payload and console errors

| Check | Result |
|---|---|
| JavaScript shipped to the browser | one file, `public/js/site.js`, under 20 KB, no framework |
| Build step | none. No Vite, no React, no bundler, no hydration payload |
| Source maps | none referenced, none served. `npm run audit:assets` probes for them |
| Inline event handlers | none. The CSP blocks them and the audit fails on them |
| Inline scripts | permitted only with the per request CSP nonce |
| Broken asset references | none. Every `src`, `href` and `srcset` candidate on 21 representative pages is fetched and must return 200 |

There is no headless browser in this environment, so "no console errors" is verified by fetching every asset the HTML references rather than by reading a real console. That catches the 404s, the blocked inline scripts and the missing icons that actually fill a console, but it cannot catch a runtime exception. Open the browser console once on a staging URL to confirm.

## 3c. Images

Every product image now has a 400 pixel and an 800 pixel WebP variant, served through a `<picture>` element with a `sizes` attribute matched to the layout. A phone loading a listing page pulls roughly 6 KB per card instead of the 30 KB original. Every image carries intrinsic `width` and `height` so nothing shifts while loading, real alt text derived from the product name, caliber and photograph position, and `loading="lazy"` on everything below the fold with `fetchpriority="high"` on the one image that is not.

## 3d. Files for crawlers and language models

| File | Purpose |
|---|---|
| `/robots.txt` | Crawl rules plus a sitemap reference. Controlled by `ROBOTS_MODE`, which serves `Disallow: /` on anything that is not production so a staging host cannot be indexed |
| `/sitemap.xml` | Index pointing at three child sitemaps |
| `/sitemap-pages.xml`, `-collections.xml`, `-products.xml` | Generated from the live database on every request, so a sitemap can never list a URL that no longer exists |
| `/llms.txt` | The llmstxt.org format. A plain text summary of what the site is, the facts a language model should not get wrong about it, and links to the main sections. Counts are read live from the database |


Caliber coverage available to target:

| Caliber page | Listings |
|---|---|
| `/calibers/9mm` | 185 |
| `/calibers/40-sw` | 42 |
| `/calibers/380-acp` | 32 |
| `/calibers/45-acp` | 24 |
| `/calibers/10mm-auto` | 17 |
| `/calibers/22-lr` | 11 |
| `/calibers/357-sig` | 8 |

## 4. On page implementation, item by item

| Requirement | Status | How |
|---|---|---|
| Unique `<title>` per page | Done | 428 unique titles across 500 crawled URLs, verified. Keyword first, brand last, trimmed so the brand is not what falls off the end |
| Unique meta description per page | Done | 428 unique, generated from real attributes and the price floor |
| Self referencing canonical on every page | Done | Absolute URLs |
| One `<h1>` per page, unique across the site | Done | 425 unique H1s among the indexable pages. Where 158 products share a supplier name the SKU is appended to the H1 as well as the title, so no two indexable pages carry the same heading |
| Logical heading order | Done | No level is skipped |
| Descriptive alt text on every image | Done | Product name, caliber, generation and which photograph in the set it is. Gallery thumbnails carry an empty alt because their link already has an accessible name, which avoids reading the same text twice |
| Responsive images | Done | 400w and 800w WebP variants behind a `<picture>` with a `sizes` attribute matched to the layout |
| `width` and `height` on every image | Done | Real intrinsic dimensions read from the image headers at ingest, so there is no layout shift |
| Crawlable `<a href>` navigation | Done | Every link is a real anchor. Nothing is a `<div onclick>` |
| Descriptive, readable URLs | Done | `/collections/glock-43-for-sale`, `/product/glock-43x-9mm-pistol-battleworn-burnt-bronze` |
| Breadcrumbs, visible and marked up | Done | On every page except the home page, catalogue and policy pages alike, with `BreadcrumbList` matching the visible trail |
| Pagination | Done | Crawlable numbered links, `rel="prev"` and `rel="next"`, self canonical per page, page 2 onward gets its own title and description rather than duplicating page 1 |
| Faceted navigation control | Done | Sort variants return `noindex, follow`, and `?sort=featured` or `?page=1` 301 redirect to the clean URL so a default parameter cannot create a second address for the same content |
| Internal linking from content | Done | Product pages link to the model collection, related products, and the caliber page. Model index links every collection |
| XML sitemap | Done | Index plus three children: pages, collections, products. Generated live from the database, so it can never list a dead URL. Product sitemap carries image entries |
| robots.txt | Done | References the sitemap and `/llms.txt`, disallows cart, search, order request and parameter URLs. `ROBOTS_MODE` controls it: `auto` serves the real file in production only, `allow` forces it on for inspection, `disallow` forces it off on a public staging host |
| Custom 404 page | Done | Its own template with a search box pre filled from the attempted path, the eight deepest model collections, and links to every main section. Returns a genuine 404 status with `noindex, follow` |
| `/llms.txt` | Done | llmstxt.org format, generated live from the database |
| Trailing slash and host normalisation | Done | 301 to one canonical form |
| HTTP status correctness | Done | 404 for a missing product, 301 for a redirect, 422 for a rejected form |
| Mobile friendly | Done | Single stylesheet, fluid grid, reflows to one column, no horizontal scroll at 400 percent zoom |
| Core Web Vitals posture | Partial | No render blocking third party resource, one same origin stylesheet, deferred script, sized images, `fetchpriority="high"` on the LCP image, `loading="lazy"` below the fold, compression on, immutable cache headers on images in production. Real field data needs a live host |
| Favicon | Done | SVG plus ICO plus 180, 192 and 512 PNG, and a web manifest |
| Language declared | Done | `<html lang="en">` |

## 5. Structured data

Emitted as JSON-LD with a CSP nonce.

| Type | Where | Fields |
|---|---|---|
| `Store` | Home page | name, legalName, url, description, telephone, email, address, geo, openingHours, sameAs. A field the client has not supplied is omitted from the node rather than published as filler |
| `WebSite` with `SearchAction` | Home page | Enables the sitelinks search box if Google chooses to show it |
| `BreadcrumbList` | Every catalogue and policy page | Matches the visible breadcrumb exactly |
| `Product` with `Offer` | All 379 product pages | name, description, sku, category, brand, image array, price, priceCurrency, availability, itemCondition, seller, plus `additionalProperty` entries for caliber, barrel length, capacity, generation and model |
| `ItemList` | Every listing page | Ordered list of the products on that page |
| `WebPage`, `AboutPage`, `ContactPage` | Policy, about and contact pages | name, description, url, `isPartOf` the WebSite node |

**Deliberately not emitted: `aggregateRating` and `Review`.** There are no genuine reviews, and inventing them is both a Google spam policy violation and a lie to customers. The claim checker fails the build if rating markup is ever added. When real reviews exist, they can be added properly.

## 6. Honest problems found in the supplied data

These are catalogue problems, not code problems, and they cap how well the site can perform until the client fixes them.

**158 of 379 products share a title with another product.** Forty three products are all called "Glock 43 9mm | Pistol For Sale". Duplicate titles compete with each other and look like doorway pages.

* Mitigation applied: the SKU is appended to the page title where a name repeats, so all 379 titles are unique and each page self canonicalises.
* Real fix: the shop supplies distinct product names. `data/reports/content-gaps.csv` lists every affected product with its URL, SKU, price and the action needed.
* A second option, if the variants are genuinely the same firearm in different finishes, is to merge them into one product page with a finish selector. That would be better for users and for search. It needs the client to tell us which ones are truly the same item.

**No product descriptions are published.** The supplier copy was promotional and unverifiable, so it was discarded rather than published. Each product page carries a factual specification table, a one line data derived summary, and a short note explaining that the specification comes from the stock record and pointing at the contact form. Thin product pages will limit ranking. This is the single highest value content task for the client.

**Specification coverage is incomplete.** Barrel length is present for 219 of 402 source rows and capacity for 145. Where a value is missing the row is omitted rather than guessed.

## 7. What still needs a live domain

None of the following can be done from a development environment:

1. Point the domain, get a TLS certificate, set `SITE_ORIGIN` to the https origin.
2. Verify the property in Google Search Console and submit `/sitemap.xml`.
3. Request indexing for the home page and the top model pages.
4. Set up Bing Webmaster Tools.
5. Create the Google Business Profile, using exactly the name, address and phone in `data/business.json` so the citation matches.
6. Run PageSpeed Insights against the live host and act on the field data.
7. If the shop wants Shopping surfaces, build a Merchant Center feed. The catalogue already holds every required field: id, title, description, link, image_link, availability, price, brand, condition.

## 8. What no developer can deliver

Repeating this because it matters more than any of the above:

* Rankings. Google's own documentation says nobody can guarantee them.
* Genuine expertise and first hand experience in the content, which is what the helpful content guidance rewards. That has to come from the person who actually handles these firearms.
* Links and mentions from other sites.
* Reviews.
* Trading history and reputation.

The build makes the site eligible and removes every technical obstacle. The rest is the business.

## 9. Verifying any of this

With the server running:

```
npm run audit:all
```

That runs six checks in sequence, and any one of them failing fails the build.

| Command | What it proves | Current result |
|---|---|---|
| `npm run audit:deps` | No known vulnerability in any dependency | 0 vulnerabilities |
| `npm run audit:secrets` | No credential in the working tree or in git history | 72 files in history scanned, none found |
| `npm run audit:claims` | No unsupported marketing claim, no em dash, no emoji icon, no pill button, no fake metric in any template or catalogue string | 379 products checked, 0 claim strings |
| `npm run audit:seo` | Titles, descriptions, canonicals, H1 count and H1 uniqueness, alt text, image dimensions, structured data validity, breadcrumbs, skip links, inline styles, sitemap coverage | 500 pages crawled, 0 errors, 0 warnings |
| `npm run audit:cannibal` | No two indexable URLs share a title, an H1 or a primary keyword | 48 hub and collection URLs, no collisions |
| `npm run audit:assets` | Every referenced asset returns 200, no framework runtime, no source map, no inline handler, JavaScript under 20 KB per page | 21 pages, 239 assets, all 200 |
