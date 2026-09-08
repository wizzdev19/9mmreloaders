# Security and compliance audit

Project: server rendered Glock dealer catalogue
Audited against the 23 item checklist supplied by the client.
Date of this pass: 2026-09-08
Auditor: implementing developer. This is a build review, not an independent penetration test.

Status key:

| Mark | Meaning |
|---|---|
| Done | Implemented in code and verified against the running site |
| Partial | Implemented as far as code can take it, the rest needs the client or live infrastructure |
| Client | Cannot be done by the developer, needs a decision or a fact from the business |

---

## 1. Check tracking

**Done.** There is no third party script on this site. No analytics tag, no advertising pixel, no social widget, no font CDN, no session recorder.

* The content security policy sets `script-src 'self' 'nonce-...'`. A tag from any other origin is blocked by the browser, so one cannot be added by accident or by a compromised template.
* `public/js/measurement.js` exists as a documented empty loader. It is fetched only after a visitor presses "Allow measurement cookies" and only if `ANALYTICS_MEASUREMENT_ID` is set. It contains no vendor code.
* Verify with: `curl -sI http://localhost:8080/ | grep -i content-security-policy`

**Client action:** if you want analytics, tell me which product. It needs a CSP change, a privacy policy entry and a cookie policy row. All three are listed in the comment block at the top of `public/js/measurement.js`.

## 2. Form consent

**Done.** Both forms carry an explicit, unchecked, required consent box, and the checkbox state is stored with the record.

| Form | Required consent | Optional consent | Stored column |
|---|---|---|---|
| Contact | Store my name, email and message in order to reply | none | `consent_terms` |
| Order request | Same, plus an age and eligibility confirmation | Marketing email opt in | `consent_terms`, `attested_eligible`, `consent_marketing` |

No box is pre ticked. The form is rejected server side with a 422 and a linked error summary if a required box is missing. Marketing consent defaults to off and is never bundled with the required consent.

## 3. Check local laws

**Partial, and this is the largest open item.**

What the code does: `data/business.json` holds a `jurisdiction` block. `/compliance`, `/terms-of-service` and `/shipping-and-transfer-policy` read from it. While `jurisdiction.country` is a placeholder, those pages display a visible warning saying the rules shown are an unverified baseline, and the governing law clause is left blank rather than guessed.

What the code deliberately does **not** do: invent a firearm transfer process. `policy.transferProcessConfirmed` is `false`, so every page that would describe the transfer instead shows a block listing the six questions the licence holder must answer. Production boot is blocked while that flag is false.

**Client action:** confirm the operating country and state, the licence number and type, the minimum ages that actually apply, the restricted destination list, and the exact transfer wording. Then have a lawyer sign off and record the name in `policy.complianceReviewedBy`.

## 4. Clear button labels

**Done.** Every button says what it does. There is no "Submit", "Send", "Go", "OK", "Click here", "Continue" or "Next" anywhere.

Examples in use: "Add this pistol to my order request", "Send my order request to the shop", "Update quantity", "Remove Glock 43", "Search catalogue", "Apply sort order", "Use required cookies only".

`npm run audit:claims` fails the build if a vague label is reintroduced.

## 5. Check for cookie consent

**Done.** A banner appears on first visit and records the answer in a `cc` cookie for six months. Nothing beyond the strictly necessary cookies is set before an answer is given, and because no measurement vendor is connected, choosing "allow" currently changes nothing observable. Every cookie the site can set is listed on `/cookie-policy` with its purpose and lifetime. There are four, all first party.

## 6. Add real business details

**Client.** `data/business.json` is the single source of truth for name, licence, address, phone, email, hours, geo coordinates and social profiles. It currently holds 23 placeholder values.

Guardrails already in place:

* `src/config.js` walks the file at boot, counts placeholders and **refuses to start in production** while any remain.
* In development the count is printed and shown in an amber bar at the top of every page.
* The footer, contact page, About page and the `Store` structured data all read from that one file, so filling it in updates the whole site and the schema markup at once.
* Fields that are still placeholders are suppressed from structured data rather than published as fake values.

## 7. Only collect necessary data

**Done.** Full data map:

| Field | Collected where | Why it is necessary |
|---|---|---|
| Name | Both forms | To address a reply |
| Email | Both forms | The reply channel |
| Phone | Order request only, optional | Only if the customer prefers a call |
| Message | Both forms | The question being asked |
| Item list | Order request | The subject of the request |
| Consent flags | Both forms | Proof of consent |

Not collected anywhere: date of birth, home address, identity document, licence number, card details, IP based profiling. The forms say so on the page.

Retention is enforced in code, not by policy alone. Every row carries a `purge_after` date and `purgeExpired()` runs at boot and every 24 hours.

## 8. Keyboard friendly forms

**Done.**

* Skip link is the first focusable element on every page.
* Every control has a real `<label for>`. No placeholder is used as a label.
* `:focus-visible` gets a 3px outline that is never removed.
* Errors render in a summary at the top with `role="alert"`, each entry links to the field, the field gets `aria-invalid="true"` and its own error text via `aria-describedby`. The summary receives focus on load.
* Related controls are grouped in `<fieldset>` with a `<legend>`.
* Checkboxes have a 20px target and the whole label is clickable.
* No keyboard trap exists because there is no modal anywhere in the site.
* Everything works with JavaScript disabled, so no interaction depends on a pointer.

## 9. Remove unsupported claims

**Done, aggressively.**

The supplier export shipped copy such as "legendary", "unparalleled reliability", "the most trusted name", "proven in the harshest conditions", "Limited stock. Order today". None of it is published. The ingest discards the prose entirely and builds a factual one line summary plus a specification table from the fields that are actually recorded against the SKU.

`npm run audit:claims` scans templates and every published catalogue string against 20 claim patterns. Current result: **379 products checked, 0 fields carrying claim wording.**

Where a field is absent from the source data, the product page omits the row rather than estimating a value, and says so.

## 10. Check git for secrets

**Done.** `npm run audit:secrets` scans the working tree and every blob in git history for 12 credential patterns, then checks that `.gitignore` actually excludes `.env`, `node_modules` and the databases, and that no `.env` or key file is tracked.

Result on the current repository: 59 historical blobs scanned, no secrets, no configuration problems.

A pre commit hook is provided at `.githooks/pre-commit` and enabled with `git config core.hooksPath .githooks`. It blocks a commit that stages a credential file and runs the scanner.

Note: the submissions database was caught during the audit and removed from tracking, and the repository history was rebuilt so it never existed in a commit.

## 11. Add rate limiting

**Done.** Four tiers, all keyed on the socket address with IPv6 prefix normalisation:

| Scope | Window | Limit |
|---|---|---|
| Every request | 15 minutes | 300 |
| `/search` | 1 minute | 30 |
| Cart mutations | 1 minute | 60 |
| Contact and order request POSTs | 1 hour | 5 |

Limits are configurable per environment. A honeypot field catches naive bots without adding a CAPTCHA, and a caught bot receives a normal looking response while nothing is stored.

## 12. Hide my API keys

**Done.** No key exists anywhere in the tree. Secrets are read from the environment through `src/config.js` and never reach a template. `res.locals` carries only the analytics measurement id, which is a public identifier by design and is empty right now.

`.env` is git ignored, `.env.example` documents every variable, and the example file contains no live value.

## 13. Update dependencies

**Done.** Ten direct dependencies, all on current major versions. Express was moved from 4 to 5 and sanitize-html to 2.17.7 during the build specifically to clear advisories.

`npm audit` result: **0 vulnerabilities.** Re-run with `npm run audit:deps`, which fails on moderate or higher.

## 14. Sanitize my forms

**Done.** Every input passes through `src/sanitize.js` before it reaches logic or storage: control characters stripped, whitespace collapsed, hard length caps, email validated by pattern, phone reduced to dialling characters with a minimum digit count, integers clamped to a range, path parameters reduced to `[a-z0-9-]`, and sort keys constrained to a fixed allowlist.

Body size is capped at 16kb with a maximum of 40 parameters, so a parameter pollution or large body attack is rejected before parsing.

## 15. Protect against XSS

**Done.** Layered:

1. Output escaping. Templates use EJS `<%= %>` everywhere. The only raw output is client supplied product copy, which first goes through `sanitize-html` with a tag allowlist, no attributes except `href` and `title`, and schemes limited to http, https and mailto.
2. CSP. `script-src 'self' 'nonce'`, plus `script-src-attr 'none'` which blocks every inline event handler, and `object-src 'none'`.
3. Structured data is serialised with a JSON encoder that escapes `<`, `>`, `&` and the line separator characters, so a product name cannot break out of a `<script type="application/ld+json">` block.
4. `X-Content-Type-Options: nosniff`.

Verified by probe: `/search?q=<script>alert(1)</script>` and an `onerror` payload both render as inert escaped text.

## 16. Debug mode

**Done.** `DEBUG_MODE` is an explicit environment flag, default off. `src/config.js` **refuses to boot** if `NODE_ENV=production` and `DEBUG_MODE=1`. Stack traces reach the browser only when debug mode is on and the environment is not production. In production the error page is a plain message and the detail goes to the server log.

## 17. Full security audit

This document. Scope is the application code and its configuration. Out of scope and still required before launch: an independent penetration test, a TLS and host configuration review, and a review of whatever payment or CRM system is bolted on later.

## 18. Check my env variables

**Done.** `src/config.js` validates on boot and exits with a numbered list rather than starting in a broken state. It enforces:

* `SITE_ORIGIN` is an absolute origin, and https in production.
* `SESSION_SECRET` is at least 32 characters and is not the example value. In development a random one is generated for the process rather than defaulting to something guessable.
* `DEBUG_MODE` is off in production.
* `CORS_ALLOWED_ORIGINS` contains no wildcard and only bare origins.
* The catalogue database exists.
* `data/business.json` parses and, in production, contains no placeholders.

## 19. Check for exposed files

**Done.** Static serving is restricted to `public/` with `dotfiles: 'deny'` and `index: false`, so there is no directory listing anywhere and no dotfile is ever served. Source, templates, `.env`, `package.json` and both databases sit outside the served root.

Probe results: `/.env` 404, `/../.env` 404, `/%2e%2e/%2e%2e/server.js` 404, `/data/catalog.db` 404, `/package.json` 404, `/img/products/` no listing.

`X-Powered-By` is disabled so the stack is not advertised.

## 20. Secure API endpoints

**Done.** There is no public JSON API by design, which removes a whole class of exposure. The four state changing endpoints (`/cart/add`, `/cart/update`, `/cart/remove`, `/order-request`, `/contact`) are each protected by:

* CSRF token check, timing safe comparison against a signed httpOnly cookie.
* Origin header check that rejects a cross site post outright.
* Rate limiting.
* Input validation and clamping.
* Ownership validation. A variant id is accepted only if it genuinely belongs to the product being added.
* POST then redirect then GET, so a refresh cannot resubmit.

Verified: a POST without a token returns 403, a POST with a foreign `Origin` returns 403, a valid POST returns 303.

## 21. Check CORS setting

**Done.** Same origin only. No `Access-Control-Allow-Origin` header is emitted unless the requesting origin appears in the `CORS_ALLOWED_ORIGINS` allowlist, which is empty by default. Credentials are never granted cross origin, and the config validator rejects `*`.

Verified: a request with `Origin: https://evil.example` receives no CORS header at all.

## 22. Add security headers

**Done.** Served on every response:

| Header | Value |
|---|---|
| Content-Security-Policy | `default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; object-src 'none'; script-src 'self' 'nonce-...'; script-src-attr 'none'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; upgrade-insecure-requests` |
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` (production only) |
| X-Content-Type-Options | `nosniff` |
| X-Frame-Options | `SAMEORIGIN` (production only) |
| Referrer-Policy | `strict-origin-when-cross-origin` |
| Permissions-Policy | `geolocation=(), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()` |
| Cross-Origin-Opener-Policy | `same-origin` |
| Cross-Origin-Resource-Policy | `same-site` |

In development only, `frame-ancestors` is opened and `X-Frame-Options` is dropped so the workspace preview can render the site in an iframe. Both tighten automatically when `NODE_ENV=production`.

## 23. Secure DB access

**Done.**

* Two databases with different privileges. `catalog.db` is opened **read only** by the web process, so no request path can write to the catalogue even in the event of a logic flaw. `app.db` is the only writable store and holds nothing but form submissions.
* Every statement is a prepared statement with bound parameters. There is no string concatenation of user input into SQL anywhere in the project. Sort order is chosen from a fixed map of allowed values, never interpolated from the query string.
* `trusted_schema = OFF` on both connections.
* `app.db` is created with 0600 permissions.
* Full text search terms are quoted and stripped of FTS operators before they reach the MATCH clause.
* Both files live outside the static root and are git ignored.
* Retention deletion runs automatically, so the writable database does not accumulate personal data indefinitely.

---

## Remaining risk register

| Item | Severity | Owner | Note |
|---|---|---|---|
| Jurisdiction and transfer process unconfirmed | High | Client | Production boot is blocked until resolved, which is the mitigation, not a fix |
| Business identity placeholders | High | Client | Same |
| No independent penetration test | Medium | Client | Recommended before taking real orders |
| No TLS yet | Medium | Client/host | HSTS and secure cookies switch on automatically once `NODE_ENV=production` and an https origin are set |
| 158 products share a supplier title | Medium | Client | Mitigated with SKU disambiguated page titles, see `data/reports/content-gaps.csv` |
| No email delivery configured | Low | Client | Submissions are stored, nobody is notified yet. SMTP variables are stubbed in `.env.example` |
| Product images hotlinked from the supplier originally | Low | Client | All 642 are now stored locally, but confirm you hold the right to publish them |

## How to re-run the audit

```
npm run audit:all
```

Runs, in order: dependency audit, secret scan of tree and git history, house style and claim check, then the SEO and accessibility crawl against a running server.
