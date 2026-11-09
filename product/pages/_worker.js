export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/health" || path.startsWith("/v1/") || path.startsWith("/oauth/") || path.startsWith("/.well-known/oauth-")) return env.MEMORY_SERVICE.fetch(request);
    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Frame-Options", "DENY");
    headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    return new Response(response.body, { status: response.status, headers });
  },
};
