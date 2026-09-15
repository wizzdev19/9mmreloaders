/**
 * Simple static Worker for 9mmreloaders - serves dist/ assets
 * Makes https://9mmreloaders.oneuppolkadot.workers.dev functional without Docker
 * Includes Backend DO class to satisfy existing migration (delete later if needed)
 */

export class Backend {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
  async fetch(request) {
    return new Response("Container not used in static mode", { status: 503 });
  }
}

export default {
  async fetch(request, env, ctx) {
    // Try assets first
    if (env.ASSETS) {
      try {
        const url = new URL(request.url);
        // For root and pages, try to fetch from assets
        let res = await env.ASSETS.fetch(request);
        // If 404 and path doesn't have extension, try with trailing slash index.html
        if (res.status === 404 && !url.pathname.includes('.')) {
          // Try /path/index.html
          const indexUrl = new URL(url.pathname.replace(/\/$/, '') + '/index.html', url.origin);
          const indexReq = new Request(indexUrl, request);
          const indexRes = await env.ASSETS.fetch(indexReq);
          if (indexRes.status !== 404) {
            return indexRes;
          }
          // Try /404.html
          const notFoundReq = new Request(new URL('/404.html', url.origin), request);
          const notFoundRes = await env.ASSETS.fetch(notFoundReq);
          if (notFoundRes.status !== 404) {
            return new Response(notFoundRes.body, { status: 404, headers: notFoundRes.headers });
          }
        }
        return res;
      } catch (e) {
        return new Response(`Assets error: ${e.message}`, { status: 500 });
      }
    }
    return new Response('9mmreloaders static - ASSETS binding missing', { status: 500 });
  }
};
