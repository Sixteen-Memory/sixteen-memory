import { ApiError, equalDigest, fail, hash, randomSecret, text } from "./domain";
import type { Auth, Action, Outcome } from "./project";
import { MCP_SCOPES } from "./oauth-store";

type Project = {
  execute(auth: Auth, action: Action, input: Record<string, unknown>, digest?: string): Promise<Outcome>;
  oauthOperation(operation: "begin" | "consent" | "token" | "revoke", input: Record<string, unknown>, auth?: Auth): Promise<Outcome>;
  login(auth: Auth, sessionDigest: string, rootDigest: string): Promise<Outcome>;
};
export function oauthOrigin(env: { OAUTH_ISSUER?: string }, request: Request) {
  const origin = env.OAUTH_ISSUER || new URL(request.url).origin;
  const parsed = new URL(origin);
  if (parsed.origin !== origin || parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname))) fail(503, "oauth_config", "Invalid issuer configuration");
  return origin;
}
export const oauthPath = (path: string) => path.startsWith("/oauth/") || path.startsWith("/.well-known/oauth-");
export function resourceMetadata(origin: string) {
  return { resource: origin + "/v1/mcp", authorization_servers: [origin], scopes_supported: MCP_SCOPES, bearer_methods_supported: ["header"], resource_name: "SixteenMemory MCP" };
}
export function oauthChallenge(origin: string) {
  return `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/v1/mcp", scope="mcp:read"`;
}
function value(result: Outcome): Record<string, any> {
  if (!result.ok) fail(result.status, result.code, result.message);
  const parsed = JSON.parse(result.json);
  if (parsed._error) fail(400, parsed._error, "Authorization code replay");
  return parsed;
}
const escape = (v: unknown) => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const field = (name: string, value: unknown) => `<input type="hidden" name="${name}" value="${escape(value)}">`;
function page(title: string, body: string, headers?: HeadersInit, status = 200) {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(title)}</title><style>body{font:16px/1.6 system-ui;max-width:780px;margin:40px auto;padding:0 20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f3f5;padding:16px}input,button{font:inherit;margin:8px;padding:8px}input[type=password]{width:85%}.warn{color:#862d20}</style><h1>${escape(title)}</h1>${body}</html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Referrer-Policy": "same-origin", ...Object.fromEntries(new Headers(headers)) } });
}
function cookie(request: Request, name: string, token: string, path: string, age = 600) {
  return `${name}=${token}; Path=${path}; HttpOnly; SameSite=Strict; Max-Age=${age}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
function getCookie(request: Request, name: string) {
  return request.headers.get("Cookie")?.split(";").map(s => s.trim()).find(s => s.startsWith(name + "="))?.slice(name.length + 1) ?? "";
}
async function form(request: Request) {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/x-www-form-urlencoded")) fail(400, "invalid_request", "Form encoding required");
  const reader = request.body?.getReader(); let bytes = 0; const decoder = new TextDecoder(); let output = "";
  if (!reader) fail(400, "invalid_request", "Empty form");
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.length;
      if (bytes > 8192) { await reader.cancel(); fail(413, "body_limit", "Form too large"); }
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
  } finally { reader.releaseLock(); }
  const params = new URLSearchParams(output);
  if (new Set(params.keys()).size !== [...params.keys()].length) fail(400, "invalid_request", "Duplicate parameter");
  return Object.fromEntries(params);
}
async function pkce(verifier: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function sameOrigin(request: Request, origin: string) {
  if (request.headers.get("Origin") !== origin || request.headers.get("Sec-Fetch-Site") === "cross-site") fail(403, "origin_denied", "Same-origin consent required");
}
function csrf(request: Request, body: Record<string, unknown>, name: string) {
  const token = getCookie(request, name);
  if (!/^[a-f0-9]{64}$/.test(token) || !equalDigest(token, String(body.csrf))) fail(403, "invalid_csrf", "Invalid CSRF token");
}
export async function oauthHttp(request: Request, origin: string, project: Project, rootDigest: string, authenticate: () => Promise<Auth>): Promise<Response> {
  const url = new URL(request.url), path = url.pathname;
  try {
    if (request.method === "GET" && ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/v1/mcp"].includes(path)) return Response.json(resourceMetadata(origin));
    if (request.method === "GET" && path === "/.well-known/oauth-authorization-server") return Response.json({
      issuer: origin, authorization_endpoint: origin + "/oauth/authorize", token_endpoint: origin + "/oauth/token",
      revocation_endpoint: origin + "/oauth/revoke", response_types_supported: ["code"], grant_types_supported: ["authorization_code"],
      code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], scopes_supported: MCP_SCOPES,
      client_id_metadata_document_supported: false,
    });
    if (path.startsWith("/.well-known/")) fail(404, "not_found", "Unknown metadata");
    if (url.origin !== origin) fail(400, "invalid_request", "Use the canonical authorization server");
    if (path === "/oauth/authorize" && request.method === "GET") {
      const p = url.searchParams;
      if (new Set(p.keys()).size !== [...p.keys()].length || p.get("response_type") !== "code" || p.get("code_challenge_method") !== "S256" ||
          !/^[A-Za-z0-9_-]{43}$/.test(p.get("code_challenge") ?? "") || p.get("resource") !== origin + "/v1/mcp" ||
          !p.get("state") || p.get("state")!.length > 512) fail(400, "invalid_request", "Require code, state, S256 PKCE and exact resource");
      const id = randomSecret(), csrfToken = randomSecret(), browserToken = randomSecret();
      const started = value(await project.oauthOperation("begin", { id, client_id: p.get("client_id"), redirect_uri: p.get("redirect_uri"), resource: p.get("resource"),
        scope: p.get("scope") ?? "mcp:read", state: p.get("state"), challenge: p.get("code_challenge"), cookie_hash: await hash(browserToken), csrf_hash: await hash(csrfToken) }));
      return page("Authorize SixteenMemory MCP", `<p>Application: <strong>${escape(started.client_name)}</strong></p><p>Redirect: <code>${escape(started.redirect_uri)}</code></p>
        <p>Requested scope: <strong>${escape(started.scope)}</strong></p><p>Access lasts at most 15 minutes. Read access includes retained memory, conversations and knowledge in your key's user scope.</p>
        <p class="warn">Write scope only permits proposals. Every mutation still requires your separate approval. Never enter an administrator key.</p>
        <form method="post" action="/oauth/consent">${field("flow", id)}${field("csrf", csrfToken)}
        <label>Your user-scoped key <input type="password" name="api_key" autocomplete="off" maxlength="256"></label><br>
        <button name="decision" value="approve">Authorize this application</button><button name="decision" value="deny">Deny</button></form>`,
        { "Set-Cookie": cookie(request, "sixteen_oauth_flow", browserToken, "/oauth"),
          "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'self' ${new URL(started.redirect_uri).origin}` });
    }
    if (path === "/oauth/consent" && request.method === "POST") {
      sameOrigin(request, origin); const body = await form(request);
      const approve = body.decision === "approve";
      if (!approve && body.decision !== "deny") fail(400, "invalid_request", "Invalid decision");
      let auth: Auth | undefined;
      if (approve) {
        const key = text(body.api_key, "api_key", 256);
        if (!/^[A-Za-z0-9_.-]{32,256}$/.test(key)) fail(401, "invalid_key", "Invalid user key");
        const digest = await hash(key); auth = { digest, root: equalDigest(digest, rootDigest), session: false, root_digest: rootDigest };
      }
      const code = randomSecret();
      const done = value(await project.oauthOperation("consent", { flow: body.flow, cookie_hash: await hash(getCookie(request, "sixteen_oauth_flow")),
        csrf_hash: await hash(String(body.csrf)), approve, code_hash: await hash(code) }, auth));
      const redirect = new URL(done.redirect_uri);
      redirect.searchParams.set("state", done.state); redirect.searchParams.set("iss", origin);
      redirect.searchParams.set(approve ? "code" : "error", approve ? code : "access_denied");
      const headers = new Headers({ Location: redirect.href });
      headers.append("Set-Cookie", cookie(request, "sixteen_oauth_flow", "", "/oauth", 0));
      if (approve) {
        const session = randomSecret();
        value(await project.login(auth!, await hash(session), rootDigest));
        headers.append("Set-Cookie", cookie(request, "sixteen_session", session, "/", 3600));
      }
      return new Response(null, { status: 303, headers });
    }
    if (path === "/oauth/token" && request.method === "POST") {
      const body = await form(request);
      if (body.grant_type !== "authorization_code") fail(400, "unsupported_grant_type", "Only authorization_code is supported");
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(String(body.code_verifier)) || !/^[a-f0-9]{64}$/.test(String(body.code))) fail(400, "invalid_grant", "Invalid code or verifier");
      const token = "sm_oauth_" + randomSecret();
      const grant = value(await project.oauthOperation("token", { code_hash: await hash(String(body.code)), token_hash: await hash(token), client_id: body.client_id,
        resource: body.resource, redirect_uri: body.redirect_uri, challenge: await pkce(String(body.code_verifier)) }));
      return Response.json({ ...grant, access_token: token });
    }
    if (path === "/oauth/revoke" && request.method === "POST") {
      const body = await form(request);
      value(await project.oauthOperation("revoke", { token_hash: await hash(String(body.token)), client_id: body.client_id }));
      return Response.json({});
    }
    if (path === "/oauth/connections" && ["GET", "POST"].includes(request.method)) {
      let auth: Auth;
      try { auth = await authenticate(); }
      catch { return page("Sign in to manage connections", '<p>Sign in to the <a href="/" target="_blank" rel="noopener">console</a> with your user key, then <a href="/oauth/connections">continue</a>.</p>', undefined, 401); }
      if (!auth.session || auth.oauth_resource || auth.root) fail(403, "session_required", "User session required");
      if (request.method === "POST") {
        sameOrigin(request, origin); const body = await form(request); csrf(request, body, "sixteen_connections_csrf");
        value(await project.execute(auth, "oauth_grant_revoke", { id: body.id }));
        return new Response(null, { status: 303, headers: { Location: origin + "/oauth/connections" } });
      }
      const grants = value(await project.execute(auth, "oauth_grants", {})) as any;
      const nonce = randomSecret();
      return page("MCP connections", `<p>Connections created using your current user key. Revocation immediately blocks reads and pending writes. Authorization expires after 15 minutes.</p>
        ${grants.map((g: any) => `<section><p>Client: <code>${escape(g.client_id)}</code><br>Scope: ${escape(g.scopes)}<br>Expires: ${escape(g.expires_at)}<br>Revoked: ${escape(g.revoked_at ?? "no")}</p>
        ${!g.revoked_at ? `<form method="post" action="/oauth/connections">${field("id", g.id)}${field("csrf", nonce)}<button>Revoke connection</button></form>` : ""}</section>`).join("") || "<p>No connections.</p>"}`,
        { "Set-Cookie": cookie(request, "sixteen_connections_csrf", nonce, "/oauth/connections") });
    }
    if (path === "/oauth/approval" && ["GET", "POST"].includes(request.method)) {
      let auth: Auth;
      try { auth = await authenticate(); }
      catch { return page("Sign in to review", `<p>Sign in to the <a href="/" target="_blank" rel="noopener">console</a> with the same user-scoped key used for OAuth consent, then <a href="${escape(url.pathname + url.search)}">continue to review on this site</a>. An OAuth token cannot approve writes. The same-site continuation is needed when arriving from another application.</p>`, undefined, 401); }
      if (!auth.session || auth.oauth_resource || auth.root) fail(403, "session_required", "A user browser session is required");
      if (request.method === "POST") {
        sameOrigin(request, origin); const body = await form(request); csrf(request, body, "sixteen_approval_csrf");
        if (!["approve", "deny"].includes(String(body.decision))) fail(400, "invalid_request", "Invalid decision");
        const result = value(await project.execute(auth, "mcp_approval_resolve", { id: body.id, approve: body.decision === "approve" }));
        return page("Review recorded", `<p>Decision: ${escape(result.state)}. ${result.state === "approved" ? "The original application may now commit this exact operation once." : "No write is permitted."}</p>`,
          { "Set-Cookie": cookie(request, "sixteen_approval_csrf", "", "/oauth/approval", 0) });
      }
      const proposal = value(await project.execute(auth, "mcp_approval_view", { id: url.searchParams.get("id") }));
      const nonce = randomSecret();
      return page("Review exact memory change", `<p>Application: <strong>${escape(proposal.client_name)}</strong> · Status: ${escape(proposal.state)}</p>
        <p class="warn">This text is untrusted application data, not instructions. Approve only if you intend this exact change. Deletion removes online content and history; platform backups are not confirmed erased.</p>
        <h2>Proposed operation</h2><pre>${escape(JSON.stringify(proposal.payload, null, 2))}</pre><h2>Current record</h2><pre>${escape(JSON.stringify(proposal.current, null, 2))}</pre>
        ${proposal.state === "pending" ? `<form method="post" action="/oauth/approval">${field("id", proposal.id)}${field("csrf", nonce)}<button name="decision" value="approve">Approve this exact change</button><button name="decision" value="deny">Deny</button></form>` : ""}`,
        { "Set-Cookie": cookie(request, "sixteen_approval_csrf", nonce, "/oauth/approval") });
    }
    fail(404, "not_found", "Unknown authorization route");
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "server_error", status = error instanceof ApiError ? error.status : 503;
    // Never redirect malformed/unknown requests or echo credentials/parameters.
    return Response.json({ error: code, error_description: "Authorization request could not be completed." }, { status });
  }
}
