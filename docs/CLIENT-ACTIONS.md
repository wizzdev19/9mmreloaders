# What the client needs to supply

Nothing on this list can be written by the developer without inventing facts about a licensed firearms business. Each item blocks something specific.

## Blocks production launch

The server refuses to start with `NODE_ENV=production` until these are done. That is on purpose.

### 1. Business identity

Edit `data/business.json`. Every field still set to `null` is outstanding. Nothing on the public site prints a placeholder: a `null` field is simply left out of the page and out of the structured data, so an unfinished field costs you a missing detail rather than visible filler text. `src/config.js` lists the outstanding fields at every boot and refuses a production start until the eleven in `policy.requiredBeforeLaunch` are filled.

| Field | What is needed |
|---|---|
| `legalName` | The registered entity name. `tradingName` is now set to **9mmreloaders**, so this is the only naming field still open |
| `fflLicenceNumber`, `fflLicenceType` | Licence number and type, as printed on the licence |
| `businessRegistrationNumber`, `salesTaxId` | Company and tax registration |
| `address.*` | The trading premises address |
| `geo.latitude`, `geo.longitude` | Coordinates of the premises, for local search |
| `contact.phone`, `contact.email`, `contact.privacyEmail`, `contact.supportHours` | Real, monitored contact points. The privacy address should be separate from sales |
| `openingHours` | In schema.org format, for example `Mo-Fr 09:00-17:00` |
| `social.website`, `social.profiles` | The live domain and any social profiles you control |

Use the exact same name, address and phone here as on the Google Business Profile. A mismatch weakens local search.

### 2. Jurisdiction: done, but read it

`jurisdiction` in `data/business.json` is now filled for a Federal Firearms Licensee operating in Texas, and `/compliance`, `/terms-of-service`, `/shipping-and-transfer-policy` and `/returns-policy` are written to that law. What is asserted:

| Statement on the site | Basis |
|---|---|
| 21 for a handgun, 18 for a rifle or shotgun, from a licensed dealer | Federal age floor for a dealer transfer |
| ATF Form 4473 completed at the counter, NICS check before release | Federal requirement on every dealer transfer |
| No Texas waiting period, no purchase permit, no state registration | Texas adds no state layer and defers to NICS |
| A firearm ships to a licensee, never to a customer address | Federal rule for a non licensee buyer |
| A handgun sold to an out of state buyer transfers through a licensee in the buyer's own state | Federal restriction on dealer handgun sales |
| Governing law is Texas, venue is Texas | Standard for a Texas trading entity |

One thing is deliberately **not** stated anywhere on the site: whether a Texas License to Carry exempts the holder from the NICS check on a purchase. Sources conflict on this and it is the kind of claim that gets a dealer in trouble, so it is omitted. If your compliance officer has a definitive answer, tell me and I will add it.

Everything above still needs the sign off in item 4. Read it as a developer's summary of published law, not as legal advice.

### 3. Transfer process: drafted, needs sign off

`policy.transferProcessConfirmed` is now `true` and `policy.transferProcessText` describes the federal and Texas route. It appears on the home page, `/compliance` and `/shipping-and-transfer-policy`.

Two things in it are still yours to confirm:

1. `policy.transferFeeUsd` is `null`. If you charge a transfer fee, or you know the typical fee your receiving licensees charge, put the number there. Right now the site says only that the receiving licensee sets their own fee.
2. `policy.restrictedDestinations` holds three entries written from federal law. Add anything specific to how you actually trade.

Set `transferProcessConfirmed` back to `false` if you disagree with any of the wording. The site drops the whole section rather than publishing something you have not approved.

### 4. Legal sign off

An attorney or compliance officer reviews `/privacy-policy`, `/terms-of-service`, `/compliance`, `/returns-policy` and `/shipping-and-transfer-policy`. Record their name in `policy.complianceReviewedBy` and the date in `policy.complianceReviewedOn`.

---

## Blocks good search performance

### 5. Product names

`data/reports/content-gaps.csv` lists all 379 products. 158 of them share a title with at least one other product, because the supplier export reused the same name. Forty three products are all called "Glock 43 9mm | Pistol For Sale".

For each, either:

* supply a distinct name, for example "Glock 43X 9mm Pistol, Battleworn Burnt Bronze", or
* tell me which ones are the same firearm in different finishes so they can be merged into one product page with a finish selector.

### 6. Product descriptions

None are published. The supplier copy made claims the shop cannot evidence, so it was discarded.

Write descriptions into `data/product-overrides.json`, keyed by product id:

```json
{
  "5163": {
    "title": "Glock 43X 9mm Pistol, Join or Die Slide Engraving",
    "description": "<p>Factory Glock 43X with a laser engraved slide. Ships with two 10 round magazines.</p>"
  }
}
```

Then run `npm run ingest`. The HTML is sanitised on the way in, so only structural tags survive.

Priority order: the highest traffic models first, which is Glock 43 (67 listings), Glock 45 (38), Glock 48 (27), Glock 42 (27) and Glock 19 (25).

### 7. Image rights

All 642 product images were downloaded from the supplier site and are now hosted locally, and each one now has a 400 pixel and an 800 pixel WebP variant generated from it, 1534 files in total. Confirm the shop holds the right to publish them, or replace them with your own photographs. Your own photographs of your own stock are also better for search than manufacturer stock images every competitor uses.

If you replace an image, drop the new file into `public/img/products/` under the same name and run `npm run images` to regenerate its variants.

### 7a. Alt text

Alt text is generated from the product name, the caliber and the position of the photograph in the set, because the supplier supplied no captions. That is accurate but generic. If you know a photograph shows a specific detail, for example the optic cut or the engraving, tell me and I will move that product to hand written alt text.

---

## Needed for the site to actually do its job

### 8. Email notification

Submissions are stored in `data/app.db` but nobody is told about them. Fill the SMTP variables in `.env` and I will wire the notification. Until then someone has to read the database.

### 8a. The domain

The trading name is set to `9mmreloaders` and the site renders it everywhere the brand appears: titles, footer, contact page, structured data, favicon, web manifest. When the matching domain is registered:

1. set `SITE_ORIGIN=https://9mmreloaders.com` (or whichever exact host, including the `www` decision, since that is the canonical form every page will point at),
2. set `NODE_ENV=production`,
3. restart. Canonicals, the sitemap, robots.txt and llms.txt all read from `SITE_ORIGIN`, so nothing else needs editing.

Pick the `www` or non `www` form once and never change it. Both are fine, but switching later costs you consolidated links.

Read the brand note at the end of `docs/KEYWORD-MAP.md` before buying. In short: the name describes reloading equipment, which is not what this shop sells, and it signals neither Glock nor Texas. That is a real cost in search terms and it is worth accepting knowingly rather than by accident.

### 9. Hosting and domain

Needed before Search Console, sitemap submission, HTTPS, HSTS and real speed measurement. Once the domain is live:

* set `SITE_ORIGIN` to the https origin
* set `NODE_ENV=production`
* set `TRUST_PROXY=1` if there is a load balancer or reverse proxy in front
* generate a fresh `SESSION_SECRET` with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### 10. Decisions I need from you

| Question | Why it matters |
|---|---|
| Do you want real online payment, or is the order request flow correct? | Taking payment for a firearm before eligibility is verified is a different legal and technical build. The current flow deliberately does not take money |
| Do you want analytics, and which product? | It needs a CSP change, a privacy policy entry and a cookie policy row before it can be switched on |
| Do you want customer reviews? | Rating markup was deliberately left out because there are no genuine reviews. It can be added properly once real ones exist |
| Are you selling parts to the same buyers as firearms? | Affects whether the parts sections get their own navigation prominence |
