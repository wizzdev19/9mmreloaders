/**
 * Cloudflare Workers Container - runs Express backend as container
 * This lets you keep better-sqlite3 and existing code, but run on Cloudflare's network
 * Deploy: wrangler deploy
 */

export default {
  async fetch(request, env, ctx) {
    // Proxy to container
    // The container runs the Express app on port 8080
    const container = env.BACKEND;
    return await container.fetch(request);
  }
};
