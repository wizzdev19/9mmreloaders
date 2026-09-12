/**
 * Cloudflare Workers Container - runs Express backend as container
 * New syntax: Durable Object class name matches container class_name
 */

export default {
  async fetch(request, env, ctx) {
    // Forward to container via Durable Object
    const id = env.BACKEND.idFromName("singleton");
    const stub = env.BACKEND.get(id);
    return await stub.fetch(request);
  }
};

// Durable Object class for container - required by new syntax
// The container runtime will handle the actual container lifecycle
export class Backend {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    // This will be handled by container runtime
    // The container's fetch is automatically available via ctx.container
    if (this.ctx.container) {
      return await this.ctx.container.fetch(request);
    }
    // Fallback
    return new Response("Container not ready", { status: 503 });
  }
}
