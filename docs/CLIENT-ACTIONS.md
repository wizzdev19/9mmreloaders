# What the client needs to supply

Nothing on this list can be written by the developer without inventing facts about a licensed firearms business. Each item blocks something specific.

## Blocks production launch

The server refuses to start with `NODE_ENV=production` until these are done. That is on purpose.

### 1. Business identity

Edit `data/business.json`. Replace every value containing the word PLACEHOLDER.

| Field | What is needed |
|---|---|
| `legalName` | The registered entity name |
| `tradingName` | The name customers know |
| `fflLicenceNumber`, `fflLicenceType` | Licence number and type, as printed on the licence |
| `businessRegistrationNumber`, `salesTaxId` | Company and tax registration |
| `address.*` | The trading premises address |
| `geo.latitude`, `geo.longitude` | Coordinates of the premises, for local search |
| `contact.phone`, `contact.email`, `contact.privacyEmail`, `contact.supportHours` | Real, monitored contact points. The privacy address should be separate from sales |
| `openingHours` | In schema.org format, for example `Mo-Fr 09:00-17:00` |
| `social.website`, `social.profiles` | The live domain and any social profiles you control |

Use the exact same name, address and phone here as on the Google Business Profile. A mismatch weakens local search.

### 2. Jurisdiction

| Field | What is needed |
|---|---|
| `jurisdiction.country`, `jurisdiction.stateOrRegion` | Where the business is licensed and operates |
| `jurisdiction.regulator` | The primary firearms regulator for that jurisdiction |
| `jurisdiction.minimumAgeHandgun`, `minimumAgeLongGun`, `minimumAgeAccessory` | The ages that actually apply, confirmed against the law, not the defaults currently in the file |

If the business operates outside the United States, the compliance, terms, shipping and returns pages all have to be rewritten for that country's law and the prices reviewed. Tell me and I will redo them.

### 3. Transfer process

Set `policy.transferProcessConfirmed` to `true` and fill `policy.transferProcessText` only after the licence holder has written the wording. It must answer:

1. Which licence or premises the firearm ships to, and whether a customer address is ever used.
2. What identification and what background check the receiving party performs.
3. Who pays the transfer fee and how much it is.
4. How long the process normally takes.
5. Which destinations are refused. Put these in `policy.restrictedDestinations`.
6. What happens if the buyer fails the check after the item has shipped.

I have not written a plausible looking version of this. Guessing a legal process on a firearms site is the one thing that could genuinely harm the client.

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

All 642 product images were downloaded from the supplier site and are now hosted locally. Confirm the shop holds the right to publish them, or replace them with your own photographs. Your own photographs of your own stock are also better for search than manufacturer stock images every competitor uses.

---

## Needed for the site to actually do its job

### 8. Email notification

Submissions are stored in `data/app.db` but nobody is told about them. Fill the SMTP variables in `.env` and I will wire the notification. Until then someone has to read the database.

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
