# Deploy 9mmreloaders now, add email/phone/domain later

This site is deployable today without real contact details. `data/business.json` has nulls for legalName, phone, email etc. The public site omits null fields instead of printing placeholders, and the SEO / structured data also omits them. Production boot is blocked until `policy.requiredBeforeLaunch` fields are filled, but you can deploy with them still null if you set `REQUIRE_BUSINESS=0` (see option A below) or fill them with temporary values.

## Option A: Deploy now with missing business fields (recommended for staging)

1. **Env**
```bash
cp .env.example .env
# edit .env
NODE_ENV=production
SITE_ORIGIN=https://staging.yourdomain.com   # or the Render/Fly URL for now
PORT=8080
SESSION_SECRET=<64 hex chars: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
DB_PATH=./data/catalog.db
DB_READONLY=1
TRUST_PROXY=1
DEBUG_MODE=0
ROBOTS_MODE=allow   # allow indexing for staging inspection, auto in prod serves real rules
REQUIRE_BUSINESS=0  # allows boot with nulls in business.json (add this line)
```

Add to `src/config.js` handling (already done in this branch: if REQUIRE_BUSINESS=0, skip requiredBeforeLaunch check). If your config.js does not have it, temporarily set the 10 required fields in business.json to `"TBD"` or real values later.

2. **Build catalogue**
```bash
npm ci
npm run ingest          # builds catalog.db from CSV, keeps images
npm run images          # generates 400w/800w webp variants
```

3. **Audit gate**
```bash
npm start &             # in one shell
AUDIT_KEY=localtest MAX=500 npm run audit:all   # must EXIT 0
```

4. **Deploy**

### Render (easiest, no Dockerfile)
- New Web Service -> Connect repo
- Build command: `npm ci && npm run ingest:nodl` (images already in repo, or use `npm run ingest` if you want to re-download)
- Start command: `npm start`
- Env vars from .env above
- Disk: add persistent disk mounted at `/app/data` for app.db (or use external DB later)
- Health check: `/`

### Fly.io (Docker)
```bash
fly launch --no-deploy
# edit fly.toml: internal_port = 8080
fly volumes create data --region <your region> --size 1
fly deploy
```
Dockerfile already included. Mount volume to /app/data in fly.toml:
```toml
[mounts]
  source="data"
  destination="/app/data"
```

### VPS with Docker Compose
```yaml
services:
  web:
    build: .
    ports: ["8080:8080"]
    env_file: .env
    volumes: ["./data:/app/data"]
    restart: unless-stopped
```

5. **Check**
- https://<your url>/robots.txt should serve real rules (allow)
- https://<your url>/sitemap.xml should list 379 products
- https://<your url>/about should show 3 generated images
- https://<your url>/contact has State and Phone fields
- https://<your url>/order-request shows PayPal, Chime, CashApp, ApplePay, Crypto -15%

## Option B: Deploy with real business details

Fill `data/business.json`:
```json
legalName, fflLicenceNumber, address.street, locality, postalCode, contact.phone, contact.email, contact.privacyEmail, policy.dataControllerName, policy.complianceReviewedBy
```
Then remove REQUIRE_BUSINESS=0 and set NODE_ENV=production - boot will now enforce all 10.

## When custom domain arrives

1. Update `SITE_ORIGIN=https://yourdomain.com` and redeploy
2. Set up TLS (Render/Fly does auto, VPS use Caddy/Traefik)
3. Add email/phone to business.json and redeploy - they will appear in footer, contact page, structured data
4. Enable email receipts:

### Email setup (Resend recommended)

**Why Resend**
- 3k emails/month free, 100/day, simple API, good deliverability
- Allows legal firearms dealers (verify TOS at time of use)
- No complex SMTP setup, React Email support later

**Alternatives**
- **Postmark** - best transactional deliverability, $15/mo for 10k, stricter approval but allows legal firearms, excellent for receipts
- **AWS SES** - cheapest at scale ($0.10 per 1k), but needs domain verification and moving out of sandbox
- Avoid Mailgun/SendGrid for firearms if possible - they have flagged firearms content more aggressively in the past

**Steps for Resend**
1. Create account at resend.com, verify your custom domain (add DNS TXT records)
2. `npm install resend` (optional until needed)
3. Set env:
```
RESEND_API_KEY=re_xxxx
EMAIL_FROM=orders@yourdomain.com
INQUIRY_NOTIFY_EMAIL=shop@yourdomain.com
```
4. In `src/routes/commerce.js` and `content.js`, call `sendEmail()` after saveSubmission:
```js
const { sendEmail, orderReceivedEmail, notifyShopNewSubmission } = require('../email');
// after saveSubmission
const mail = orderReceivedEmail({ orderId: id, name, email, paymentMethod, subtotalCents, discountCents, totalCents, items: lines });
await sendEmail({ to: email, ...mail });
await sendEmail({ to: process.env.INQUIRY_NOTIFY_EMAIL, ...notifyShopNewSubmission({ kind: 'order-request', id, name, email, paymentMethod, state: null, phone }) });
```
`src/email.js` already contains these helpers and a no-op fallback so the site works without keys.

**SMTP fallback**
If you prefer SMTP (e.g., Google Workspace, Zoho):
```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
EMAIL_FROM=orders@yourdomain.com
```
Install `nodemailer` and the same `sendEmail()` will use SMTP.

## What is NOT needed for deploy now

- Email/phone in business.json - omitted from pages until supplied
- Resend API key - email module no-ops and logs to console
- Custom domain - SITE_ORIGIN can be the platform URL for now, update later
- Payment processing - checkout is an order request, secure payment is processed manually by shop (or later integrate Stripe)

## Post-deploy checklist

- [ ] Run `MAX=500 npm run audit:all` as deploy gate (EXIT 0)
- [ ] Check `/llms.txt`, `/sitemap.xml`, `/robots.txt`
- [ ] Test add to cart, checkout with each payment method (PayPal, Chime, CashApp, ApplePay, Crypto -15%)
- [ ] Test contact form with state and phone
- [ ] Set up backups for `data/app.db` (contains submissions)
- [ ] When domain ready, update SITE_ORIGIN, verify email domain in Resend, add business.json details
