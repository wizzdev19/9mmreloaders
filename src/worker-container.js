/**
 * Cloudflare Workers Container - runs Express backend as container
 * New syntax: Durable Object class name matches container class_name
 * Falls back to static assets if container not ready (so Workers URL is functional without Docker build)
 */

export default {
  async fetch(request, env, ctx) {
    // Try container first (dynamic Express with better-sqlite3)
    try {
      if (env.BACKEND) {
        const id = env.BACKEND.idFromName("singleton");
        const stub = env.BACKEND.get(id);
        // Add timeout to avoid hanging if container not built
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const res = await stub.fetch(request.clone(), { signal: controller.signal });
          clearTimeout(timeout);
          // If container returns 503 not ready, fallback to assets
          if (res.status !== 503) {
            return res;
          }
        } catch (e) {
          clearTimeout(timeout);
          // Container fetch failed, fallback to assets
          console.log("Container fetch failed, falling back to assets:", e.message);
        }
      }
    } catch (e) {
      console.log("Container error:", e.message);
    }

    // Fallback to static assets (dist folder)
    if (env.ASSETS) {
      try {
        const assetRes = await env.ASSETS.fetch(request);
        // If asset found (not 404), return it
        if (assetRes.status !== 404) {
          return assetRes;
        }
        // For SPA routing, try to serve index or 404 page from assets
        // Check if it's a page that should return 404.html
        const url = new URL(request.url);
        // Try 404 page for unknown routes
        const notFoundRes = await env.ASSETS.fetch(new Request(new URL("/404.html", request.url), request));
        if (notFoundRes.status !== 404) {
          return new Response(notFoundRes.body, { ...notFoundRes, status: 404 });
        }
        return assetRes;
      } catch (e) {
        console.log("Assets fetch failed:", e.message);
      }
    }

    // Ultimate fallback - simple HTML
    return new Response(
      `<!DOCTYPE html><html><head><title>9mmreloaders</title><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{font-family:system-ui;padding:40px;max-width:800px;margin:0 auto}h1{color:#14171a}a{color:#8c2f14}</style></head><body><h1>9mmreloaders is live</h1><p>Container is building. Static site is available at <a href="https://9mmreloaders.pages.dev">9mmreloaders.pages.dev</a></p><p>Dist has 379 Glock listings. Images are in /img/products/</p><p><a href="https://9mmreloaders.pages.dev/glock-pistols-for-sale/">Browse pistols</a></p></body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8" }, status: 200 }
    );
  }
};

// Durable Object class for container - required by new syntax
export class Backend {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    if (this.ctx.container) {
      return await this.ctx.container.fetch(request);
    }
    return new Response("Container not ready - fallback to static", { status: 503 });
  }
}
