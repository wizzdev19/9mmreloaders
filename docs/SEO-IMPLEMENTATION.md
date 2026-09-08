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

**Total indexable URLs: 438.**

Crawl depth from the home page to any product: **3 clicks maximum** (home to model index to model page to product), and 2 for anything in the top eight models.

## 3. Keyword to URL mapping

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
| Unique `<title>` per page | Done | 415 unique titles across 450 crawled URLs, verified. Keyword first, brand last, trimmed so the brand is not what falls off the end |
| Unique meta description per page | Done | 415 unique, generated from real attributes and the price floor |
| Self referencing canonical on every page | Done | Absolute URLs |
| One `<h1>` per page | Done | Verified across 450 pages |
| Logical heading order | Done | No level is skipped |
| Descriptive alt text on every image | Done | Product name plus caliber. Decorative card images carry an empty alt so screen readers skip them, and the card title link carries the accessible name |
| `width` and `height` on every image | Done | Real intrinsic dimensions read from the JPEG headers at ingest, so there is no layout shift |
| Crawlable `<a href>` navigation | Done | Every link is a real anchor. Nothing is a `<div onclick>` |
| Descriptive, readable URLs | Done | `/collections/glock-43-for-sale`, `/product/glock-43x-9mm-pistol-battleworn-burnt-bronze` |
| Breadcrumbs, visible and marked up | Done | On every catalogue page |
| Pagination | Done | Crawlable numbered links, `rel="prev"` and `rel="next"`, self canonical per page, page 2 onward gets its own title and description rather than duplicating page 1 |
| Faceted navigation control | Done | Sort variants return `noindex, follow`, and `?sort=featured` or `?page=1` 301 redirect to the clean URL so a default parameter cannot create a second address for the same content |
| Internal linking from content | Done | Product pages link to the model collection, related products, and the caliber page. Model index links every collection |
| XML sitemap | Done | Index plus three children: pages, collections, products. Generated live from the database, so it can never list a dead URL. Product sitemap carries image entries |
| robots.txt | Done | References the sitemap, disallows cart, search and order request. Serves `Disallow: /` automatically when `NODE_ENV` is not production, so a staging copy cannot be indexed |
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
| `Store` | Home page | name, legalName, url, description, telephone, email, address, geo, openingHours, sameAs. Fields still holding placeholders are omitted rather than published as fake data |
| `WebSite` with `SearchAction` | Home page | Enables the sitelinks search box if Google chooses to show it |
| `BreadcrumbList` | Every catalogue and policy page | Matches the visible breadcrumb exactly |
| `Product` with `Offer` | All 379 product pages | name, description, sku, category, brand, image array, price, priceCurrency, availability, itemCondition, seller, plus `additionalProperty` entries for caliber, barrel length, capacity, generation and model |
| `ItemList` | Every listing page | Ordered list of the products on that page |

**Deliberately not emitted: `aggregateRating` and `Review`.** There are no genuine reviews, and inventing them is both a Google spam policy violation and a lie to customers. The claim checker fails the build if rating markup is ever added. When real reviews exist, they can be added properly.

## 6. Honest problems found in the supplied data

These are catalogue problems, not code problems, and they cap how well the site can perform until the client fixes them.

**158 of 379 products share a title with another product.** Forty three products are all called "Glock 43 9mm | Pistol For Sale". Duplicate titles compete with each other and look like doorway pages.

* Mitigation applied: the SKU is appended to the page title where a name repeats, so all 379 titles are unique and each page self canonicalises.
* Real fix: the shop supplies distinct product names. `data/reports/content-gaps.csv` lists every affected product with its URL, SKU, price and the action needed.
* A second option, if the variants are genuinely the same firearm in different finishes, is to merge them into one product page with a finish selector. That would be better for users and for search. It needs the client to tell us which ones are truly the same item.

**No product descriptions are published.** The supplier copy was promotional and unverifiable, so it was discarded rather than published. Each product page carries a factual specification table and a one line data derived summary, and says openly that a description is pending. Thin product pages will limit ranking. This is the single highest value content task for the client.

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
npm run audit:seo
```

Crawls the site from the home page and checks titles, descriptions, canonicals, h1 counts, alt text, image dimensions, structured data validity, skip links, inline styles and sitemap coverage. Current result: **450 pages crawled, 0 errors, 0 warnings.**
