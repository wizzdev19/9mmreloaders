# Deploy to Cloudflare - options for 9mmreloaders

Your stack is Node 20 + Express 5 + better-sqlite3 (native module) + SQLite file. This does NOT run directly on Cloudflare Workers/Pages (Workers don't support native Node modules). You have 3 good options:

## Option 1: Cloudflare in front of Fly.io/Render (RECOMMENDED - 10 min)

Keep your backend on Fly.io (dfw region, Texas) or Render, and put Cloudflare in front for DNS, CDN, WAF, DDoS, custom domain.

**Why this is best now:**
- No code changes
- You keep SQLite and better-sqlite3 (fast)
- You get Cloudflare's CDN caching for images, WAF, bot protection, and free SSL for custom domain
- You already fixed Docker build (catalog.db in repo)

**Steps:**

1. **Deploy backend to Fly.io** (you already have fly.toml):
```bash
fly launch --no-deploy --region dfw
fly volumes create data --region dfw --size 1
fly secrets set SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") SITE_ORIGIN=https://yourdomain.com
fly deploy
fly ips list  # note the IPv4 and IPv6
```

2. **Add domain to Cloudflare:**
- Cloudflare dashboard -> Add site -> yourdomain.com
- Change nameservers at your registrar to Cloudflare's
- DNS -> Add records:
  - Type A, Name @, Content <Fly IPv4>, Proxy ON (orange cloud)
  - Type AAAA, Name @, Content <Fly IPv6>, Proxy ON
  - Type CNAME, Name www, Content yourdomain.com, Proxy ON

3. **Update SITE_ORIGIN:**
```bash
fly secrets set SITE_ORIGIN=https://yourdomain.com
fly deploy
```

4. **Cloudflare settings for firearms dealer:**
- SSL/TLS -> Full (strict) if Fly has cert, or Full
- Speed -> Caching: Cache images (public/img/products/*) - set Edge TTL 1 month (images are immutable)
- Security -> WAF: Enable, add rule to rate limit /cart/add and /contact and /order-request (5 req/min)
- Security -> Bots: Enable bot fight mode (but allow good bots for SEO)
- Rules -> Page Rules: Cache Everything for /img/* and /css/* and /js/*

Result: Backend runs on Fly, Cloudflare handles DNS, CDN, DDoS, SSL, caching.

## Option 2: Cloudflare Tunnel (if backend stays on your own VPS)

If you run backend on a VPS (not Fly/Render), use cloudflared tunnel:

```bash
# On VPS
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/

cloudflared tunnel login
cloudflared tunnel create 9mmreloaders
cloudflared tunnel route dns 9mmreloaders yourdomain.com

# config.yml
# tunnel: <tunnel-id>
# credentials-file: /root/.cloudflared/<tunnel-id>.json
# ingress:
#   - hostname: yourdomain.com
#     service: http://localhost:8080
#   - service: http_status:404

cloudflared tunnel run 9mmreloaders
```

Set as systemd service for auto-start.

## Option 3: Full Cloudflare Workers + D1 + R2 (future, requires code migration)

If you want everything on Cloudflare (no Fly/Render):

- **D1**: Cloudflare's SQLite. Migrate catalog.db to D1 via `wrangler d1 execute`
- **R2**: Cloudflare's S3 for product images (642 images)
- **Workers/Pages Functions**: Rewrite Express to Hono or similar that runs on Workers
- **Limitations**: better-sqlite3 native module won't work, need to use D1 API

This is doable but requires:
- Rewrite src/db.js to use D1 binding instead of better-sqlite3
- Rewrite server.js to export fetch handler for Workers
- Migrate images to R2 and serve via R2 binding
- Estimated 1-2 days work

I can scaffold this if you want, but Option 1 is recommended for launch now, Option 3 for later scale.

## Checklist for Cloudflare deploy

- [ ] Backend deployed to Fly.io dfw with catalog.db in repo (fixed)
- [ ] SESSION_SECRET generated and set as secret (not in repo)
- [ ] SITE_ORIGIN set to https://yourdomain.com
- [ ] REQUIRE_BUSINESS=0 for staging, =1 for final launch after filling business.json
- [ ] Custom domain DNS in Cloudflare, proxy ON
- [ ] SSL mode Full (strict)
- [ ] Test: https://yourdomain.com/robots.txt, /sitemap.xml (should show 379 products), /about (images), /contact (State/Phone), cart -> checkout (PayPal, Chime, CashApp, ApplePay, Crypto -15%)
- [ ] When domain ready, add RESEND_API_KEY and EMAIL_FROM for order receipts
- [ ] Purge Cloudflare cache after each deploy if you cache HTML (or set Cache-Control: no-cache for HTML, cache only assets)

## Current DB health

- catalog.db: 379 products, 39 categories, 7 calibers, price $84.55 - $1994.05, has_client_copy 379/379, 642 images (not in repo, but primary images work via fallback)
- app.db: submissions table with columns id, kind, created_at, name, email, phone, state, payment_method, message, cart_json, etc. - ready for order requests with payment method and crypto discount
- Backend: Express 5, helmet, rate limiting, CSRF, signed cookies, no inline styles, no source maps, 243 assets all 200, audits EXIT 0
