# Glock dealer catalogue

Server rendered catalogue and order request site for a licensed firearms dealer, generated from a WooCommerce product export.

Node 20 or newer, Express 5, SQLite, EJS. No front end framework, no build step, no third party script at runtime.

## Run it

```bash
npm install
cp .env.example .env          # then edit it, see below
npm run ingest                # builds the catalogue and downloads product images
npm start                     # http://localhost:8080
```

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`src/config.js` validates the environment on boot and exits with a numbered list of problems rather than starting half configured.

## What is here

| Path | Contents |
|---|---|
| `server.js` | Application entry, middleware order, error handling |
| `src/config.js` | Environment validation and typed config |
| `src/security.js` | CSP, security headers, CORS, CSRF, rate limits, honeypot |
| `src/sanitize.js` | Input normalisation, validation, HTML allowlist, claim screening |
| `src/db.js` | Read only catalogue connection, writable submissions connection, all prepared statements |
| `src/seo.js` | Titles, descriptions, canonicals, JSON-LD builders |
| `src/cart.js` | Signed cookie basket |
| `src/routes/` | catalog, commerce, content, seo |
| `views/` | EJS templates. Every page renders complete HTML on the server |
| `public/` | The only directory served statically |
| `scripts/ingest.js` | CSV to SQLite plus image download |
| `scripts/make-image-variants.js` | Generates the 400w and 800w WebP variants |
| `scripts/scan-secrets.js` | Working tree and git history secret scan |
| `scripts/check-claims.js` | House style and unsupported claim checker |
| `scripts/check-seo.js` | On page SEO and accessibility crawler |
| `scripts/check-cannibalisation.js` | Fails if two indexable URLs chase the same keyword |
| `scripts/check-assets.js` | Fetches every referenced asset, enforces payload ceilings |
| `data/business.json` | Single source of truth for business identity. Fill this in |
| `data/product-overrides.json` | Client supplied product titles and descriptions |
| `data/reports/` | Generated content gap report and ingest statistics |
| `docs/` | Security audit, SEO implementation, keyword map, design notes, client action list |

## Scripts

| Command | Does |
|---|---|
| `npm start` | Run the server |
| `npm run ingest` | Rebuild the catalogue from the CSV and download images |
| `npm run ingest:nodl` | Same without downloading images |
| `npm run audit:deps` | `npm audit`, fails on moderate or higher |
| `npm run audit:secrets` | Scan the tree and git history for credentials |
| `npm run audit:claims` | Check house style and unsupported claims |
| `npm run audit:seo` | Crawl the running site and check on page SEO |
| `npm run audit:cannibal` | Check no two indexable URLs chase the same keyword |
| `npm run audit:assets` | Check every referenced asset returns 200 and the payload ceilings hold |
| `npm run images` | Regenerate responsive WebP variants |
| `npm run audit:all` | All of the above |

The audits that crawl need the server running in another shell.

## Rebuilding the catalogue

```bash
npm run ingest                                   # uses ../uploads/https___glockretailers_com_woocommerce.csv
npm run ingest -- /path/to/another-export.csv    # or point it at a different file
```

The ingest is destructive and idempotent. It rebuilds `data/catalog.db` from scratch, keeps already downloaded images, and rewrites `data/reports/`.

It does **not** publish the promotional copy in the CSV. See `docs/SEO-IMPLEMENTATION.md` section 6 for why.

## Deploying

1. Set `NODE_ENV=production` and `SITE_ORIGIN` to the https origin.
2. Set `TRUST_PROXY=1` if there is a reverse proxy in front.
3. Fill in `data/business.json`. Production boot is blocked while any field in `policy.requiredBeforeLaunch` is still `null`. Nothing user facing ever prints filler: an unsupplied field is omitted from the page and from the structured data.
4. Keep `policy.transferProcessConfirmed` true only while the licence holder stands behind `policy.transferProcessText`.
5. Run `npm run ingest` on the target machine so the image directory is populated.
6. Terminate TLS at the proxy and forward to the app port.
7. Run `npm run audit:all` as a deploy gate.

In production the app switches on HSTS, `X-Frame-Options`, secure cookies, the `__Host-` CSRF cookie prefix, long lived immutable image caching, and a real `robots.txt`. Outside production `robots.txt` serves `Disallow: /` so a staging copy cannot be indexed. `ROBOTS_MODE=allow` overrides that for local inspection, `ROBOTS_MODE=disallow` forces the block on a public staging host.

## Enable the pre commit hook

```bash
git config core.hooksPath .githooks
```

Blocks a commit that stages a credential file and runs the secret scanner.

## Things that are deliberately absent

* No payment processing. A firearm sale is completed by a licensed person against a verified buyer, so the flow collects an order request and hands it to staff.
* No rating or review markup. There are no genuine reviews and inventing them is a Google spam policy violation.
* No third party scripts, fonts or trackers.
* No product descriptions from the supplier feed. See the SEO document.
* No invented licence number, trading name or business address. Unknown fields are `null` in `data/business.json` and are omitted from the site rather than shown as filler.
* No front end framework. There is one 5 KB script, no bundler, no hydration payload and no source maps.
* No claim about whether a Texas License to Carry exempts the holder from the NICS check. Published sources conflict, so the site stays silent on it.
