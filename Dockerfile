# Production image for 9mmreloaders - Node 20, no build step, SQLite
FROM node:20-bookworm-slim AS base
WORKDIR /app
# system deps for better-sqlite3 and sharp
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*

# dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# app files
COPY server.js ./
COPY src ./src
COPY views ./views
COPY public ./public
COPY scripts ./scripts
COPY data/business.json ./data/business.json
COPY data/product-overrides.json ./data/product-overrides.json
COPY data/catalog.db ./data/catalog.db

# ensure data dir writable for app.db and image variants
RUN mkdir -p data/reports public/img/products && chown -R node:node /app

USER node
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# healthcheck - the app has no /health endpoint, use root
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://localhost:'+ (process.env.PORT||8080) + '/').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
