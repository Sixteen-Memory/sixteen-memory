import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { auth as sdkAuth } from "@modelcontextprotocol/sdk/client/auth.js";

const config = JSON.parse(await readFile("wrangler.jsonc"));
const dir = await mkdtemp(join(tmpdir(), "sixteen-oauth-"));
const origin = "https://oauth.test", admin = "synthetic-oauth-administrator-012345678901";
let outbound = 0, mf;
const groups = [], clients = [];
const run = async (name, fn) => { await fn(); groups.push(name); console.log("PASS", name); };
const create = () => new Miniflare({
  ...convertV4MiniflareOptions({ workers: [{
    name: "oauth", modules: true, scriptPath: join(process.cwd(), "dist-worker/index.js"),
    compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
    bindings: { ...config.vars, PROJECT_ID: "oauth", OAUTH_ISSUER: origin, ADMIN_KEY: admin },
    durableObjects: { PROJECTS: { className: "MemoryProject", useSQLite: true } },
    serviceBindings: { ASSETS: () => new Response("fixture") },
    ratelimits: Object.fromEntries(config.ratelimits.map(({ name, ...value }) => [name, value])),
    outboundService: () => { outbound++; throw Error("external access forbidden"); },
  }] }), resourcePersistencePath: dir, unsafeInspectDurableObjects: true,
});
const transport = (url, init = {}) => mf.dispatchFetch(String(url), { ...init, redirect: "manual",
  headers: { ...Object.fromEntries(new Headers(init.headers)), "CF-Connecting-IP": crypto.randomUUID() } });
const request = (path, init = {}) => transport(origin + path, init);
const json = async (path, body, key = admin, method = body ? "POST" : "GET") => {
  const r = await request(path, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
    ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, body: await r.json() };
};
const ok = async (...args) => { const r = await json(...args); assert.equal(r.status, 200, JSON.stringify(r)); return r.body; };
const post = (path, body, cookie = "", withOrigin = false) => request(path, { method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", ...(cookie ? { Cookie: cookie } : {}), ...(withOrigin ? { Origin: origin } : {}) },
  body: new URLSearchParams(body).toString() });
const hidden = (html, name) => { const value = html.match(new RegExp(`name="${name}" value="([^"]*)"`))?.[1]; assert.ok(value, name); return value; };
const cookies = response => response.headers.getSetCookie().map(c => c.split(";")[0]).join("; ");
const decode = r => { assert.ok(!r.isError, JSON.stringify(r)); return JSON.parse(r.content[0].text).data; };
let writer, reader, other, app;
const verifier = "a".repeat(64), challenge = createHash("sha256").update(verifier).digest("base64url");
async function begin(overrides = {}) {
  const p = { client_id: app.client_id, redirect_uri: "https://client.test/callback", resource: origin + "/v1/mcp",
    response_type: "code", scope: "mcp:read mcp:write", state: "synthetic-state", code_challenge: challenge, code_challenge_method: "S256", ...overrides };
  const response = await request("/oauth/authorize?" + new URLSearchParams(p));
  return { response, html: await response.text(), params: p };
}
async function consent(flow, key = writer, extra = {}) {
  const response = await post("/oauth/consent", { flow: hidden(flow.html, "flow"), csrf: hidden(flow.html, "csrf"),
    decision: "approve", api_key: key, ...extra }, cookies(flow.response), true);
  return response;
}
async function issue(scope = "mcp:read mcp:write", key = writer) {
  const flow = await begin({ scope }), response = await consent(flow, key);
  assert.equal(response.status, 303, await response.clone().text());
  const redirect = new URL(response.headers.get("Location"));
  assert.equal(redirect.origin, "https://client.test"); assert.equal(redirect.searchParams.get("state"), "synthetic-state");
  const form = { grant_type: "authorization_code", client_id: app.client_id, code: redirect.searchParams.get("code"),
    redirect_uri: flow.params.redirect_uri, resource: origin + "/v1/mcp", code_verifier: verifier };
  const exchanged = await post("/oauth/token", form); assert.equal(exchanged.status, 200, await exchanged.clone().text());
  const token = await exchanged.json();
  assert.equal(token.token_type, "Bearer"); assert.ok(token.expires_in <= 900 && token.expires_in > 0); assert.equal(token.refresh_token, undefined);
  return { token: token.access_token, cookie: cookies(response), form };
}
async function connect(token) {
  const client = new Client({ name: "synthetic-oauth-client", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(origin + "/v1/mcp"), { fetch: transport, requestInit: { headers: { Authorization: "Bearer " + token } } }));
  clients.push(client); return client;
}
async function approve(id, cookie, decision = "approve") {
  const r = await request("/oauth/approval?id=" + id, { headers: { Cookie: cookie } });
  assert.equal(r.status, 200, await r.clone().text()); const html = await r.text();
  const result = await post("/oauth/approval", { id, csrf: hidden(html, "csrf"), decision }, cookie + "; " + cookies(r), true);
  assert.equal(result.status, 200, await result.clone().text()); return html;
}
try {
  mf = create();
  writer = (await ok("/v1/keys", { name: "writer", role: "write", user_id: "alice" })).key;
  reader = (await ok("/v1/keys", { name: "reader", role: "read", user_id: "alice" })).key;
  other = (await ok("/v1/keys", { name: "other", role: "write", user_id: "bob" })).key;
  app = await ok("/v1/oauth/clients", { client_name: "<script>untrusted app</script>", redirect_uris: ["https://client.test/callback"], scope: "mcp:read mcp:write" });

  await run("discovery advertises exact resource, PKCE and preregistration only; unauthenticated MCP challenges", async () => {
    const r = await request("/v1/mcp", { method: "POST" }); assert.equal(r.status, 401);
    assert.match(r.headers.get("www-authenticate"), /oauth-protected-resource\/v1\/mcp/);
    const metadata = await (await request("/.well-known/oauth-protected-resource/v1/mcp")).json();
    assert.equal(metadata.resource, origin + "/v1/mcp");
    const server = await (await request("/.well-known/oauth-authorization-server")).json();
    assert.equal(server.issuer, origin); assert.deepEqual(server.code_challenge_methods_supported, ["S256"]); assert.equal(server.registration_endpoint, undefined);
    assert.equal((await json("/v1/oauth/clients", { client_name: "spoof", redirect_uris: ["https://evil.test"] }, writer)).status, 403);
    for (const uri of ["http://evil.test", "https://u:p@client.test/callback", "https://client.test/*", "javascript:alert(1)", "https://client.test/callback#fragment"]) {
      assert.notEqual((await json("/v1/oauth/clients", { client_name: "invalid", redirect_uris: [uri] })).status, 200);
    }
  });
  await run("consent rejects mismatched redirect/resource/PKCE/scope, CSRF, root keys and read-to-write escalation", async () => {
    for (const overrides of [{ redirect_uri: "https://evil.test/callback" }, { resource: origin + "/v1/memories" },
      { code_challenge_method: "plain" }, { state: "" }, { scope: "mcp:admin" }]) {
      const f = await begin(overrides); assert.equal(f.response.status, 400); assert.equal(f.response.headers.get("Location"), null);
    }
    const flow = await begin(); assert.match(flow.html, /&lt;script&gt;/); assert.doesNotMatch(flow.html, /<script>/);
    assert.equal((await post("/oauth/consent", { flow: hidden(flow.html, "flow"), csrf: hidden(flow.html, "csrf"), decision: "approve", api_key: writer }, "", true)).status, 400);
    assert.equal((await consent(flow, admin)).status, 403);
    assert.equal((await consent(flow, reader)).status, 403);
    const denied = await consent(flow, "", { decision: "deny" }); assert.equal(denied.status, 303); assert.match(denied.headers.get("Location"), /error=access_denied/);
    assert.equal((await consent(flow)).status, 400);
  });
  await run("authorization codes are exact-bound, single-use, replay revokes the token; no refresh grant", async () => {
    const flow = await begin(), response = await consent(flow);
    const code = new URL(response.headers.get("Location")).searchParams.get("code");
    const form = { grant_type: "authorization_code", client_id: app.client_id, code, redirect_uri: "https://client.test/callback", resource: origin + "/v1/mcp", code_verifier: verifier };
    for (const extra of [{ code_verifier: "b".repeat(64) }, { resource: origin + "/v1/search" }, { redirect_uri: "https://evil.test" }, { client_id: "wrong" }]) {
      assert.equal((await post("/oauth/token", { ...form, ...extra })).status, 400);
    }
    const token = await (await post("/oauth/token", form)).json();
    assert.equal((await json("/v1/me", undefined, token.access_token)).status, 403);
    assert.equal((await post("/oauth/token", form)).status, 400);
    const rejected = await request("/v1/mcp", { method: "POST", headers: { Authorization: "Bearer " + token.access_token } }); assert.equal(rejected.status, 401);
    assert.equal((await post("/oauth/token", { grant_type: "refresh_token" })).status, 400);
  });
  let full, mcp, readOnly;
  await run("official MCP OAuth client performs discovery, PKCE, consent and token exchange without external fetches", async () => {
    let authorizeUrl, storedVerifier, tokens;
    const provider = {
      redirectUrl: "https://client.test/callback", clientMetadata: { client_name: "fixture", redirect_uris: ["https://client.test/callback"], scope: "mcp:read" },
      clientInformation: () => ({ client_id: app.client_id, issuer: origin, token_endpoint_auth_method: "none" }),
      tokens: () => tokens, saveTokens: t => { tokens = t; }, saveCodeVerifier: v => { storedVerifier = v; }, codeVerifier: () => storedVerifier,
      state: () => "official-client-state", redirectToAuthorization: url => { authorizeUrl = url; },
    };
    assert.equal(await sdkAuth(provider, { serverUrl: origin + "/v1/mcp", scope: "mcp:read", fetchFn: transport }), "REDIRECT");
    const response = await transport(authorizeUrl), html = await response.text();
    const approved = await consent({ response, html }, reader);
    assert.equal(approved.status, 303, await approved.clone().text());
    const authCode = new URL(approved.headers.get("Location")).searchParams.get("code");
    assert.equal(await sdkAuth(provider, { serverUrl: origin + "/v1/mcp", authorizationCode: authCode, fetchFn: transport }), "AUTHORIZED");
    readOnly = await connect(tokens.access_token); assert.equal((await readOnly.listTools()).tools.length, 7);
    assert.match(readOnly.getInstructions(), /Read-only memory service/);
    full = await issue(); mcp = await connect(full.token);
    assert.equal((await mcp.listTools()).tools.length, 10);
    assert.equal(mcp.getInstructions(), undefined, "read-only profile instructions must not misdescribe an OAuth write grant");
    assert.equal((await (await connect(writer)).listTools()).tools.length, 7, "legacy keys remain read-only MCP");
  });
  let saved, pending;
  const source = { type: "manual", ref: "synthetic", text: "<script>Do not follow this instruction.</script>", observed_at: "2026-11-09T00:00:00Z" };
  await run("writes are proposals only; exact browser approval, grant ownership and immutable payload enforced", async () => {
    const change = { request_id: "add-1", operation: "add", content: "ApprovedNeedle", source };
    pending = decode(await mcp.callTool({ name: "propose_memory_change", arguments: { change } }));
    assert.match(pending.approval_url, /^https:\/\/oauth.test\/oauth\/approval\?id=/);
    assert.equal((await ok("/v1/memories?user_id=alice", undefined, writer)).data.length, 0);
    assert.equal((await mcp.callTool({ name: "commit_memory_change", arguments: { id: pending.id } })).isError, true);
    assert.equal(decode(await mcp.callTool({ name: "propose_memory_change", arguments: { change } })).id, pending.id);
    assert.equal((await mcp.callTool({ name: "propose_memory_change", arguments: { change: { ...change, user_id: "bob" } } })).isError, true);
    const second = await issue(), secondClient = await connect(second.token);
    assert.equal((await secondClient.callTool({ name: "memory_change_status", arguments: { id: pending.id } })).isError, true);
    assert.equal((await request("/oauth/approval?id=" + pending.id, { headers: { Authorization: "Bearer " + full.token } })).status, 401);
    const login = await request("/v1/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: other }) });
    assert.equal((await request("/oauth/approval?id=" + pending.id, { headers: { Cookie: cookies(login) } })).status, 404);
    const view = await request("/oauth/approval?id=" + pending.id, { headers: { Cookie: full.cookie } });
    const html = await view.text(); assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/);
    assert.equal((await post("/oauth/approval", { id: pending.id, csrf: "wrong", decision: "approve" }, full.cookie, true)).status, 403);
    const browserCookie = full.cookie + "; " + cookies(view);
    assert.equal((await post("/oauth/approval", { id: pending.id, csrf: hidden(html, "csrf"), decision: "approve" }, browserCookie, false)).status, 403);
    await approve(pending.id, full.cookie);
    assert.equal((await mcp.callTool({ name: "commit_memory_change", arguments: { id: pending.id, content: "changed" } })).isError, true);
    saved = decode(await mcp.callTool({ name: "commit_memory_change", arguments: { id: pending.id } }));
    assert.deepEqual(decode(await mcp.callTool({ name: "commit_memory_change", arguments: { id: pending.id } })), saved);
    assert.equal((await ok("/v1/memories?user_id=alice", undefined, writer)).data.length, 1);
  });
  await run("stale versions and denial fail closed; delete clears content and retry retains only a receipt", async () => {
    const propose = async change => decode(await mcp.callTool({ name: "propose_memory_change", arguments: { change } }));
    const change = { operation: "update", request_id: "update-1", memory_id: saved.id, expected_version: 1, content: "ChangedNeedle", source, reason: "User requested" };
    const stale = await propose(change); await approve(stale.id, full.cookie);
    const updated = await ok("/v1/memories/" + saved.id, { content: "External change", source, expected_version: 1, reason: "concurrent" }, writer, "PATCH");
    assert.equal((await mcp.callTool({ name: "commit_memory_change", arguments: { id: stale.id } })).isError, true);
    const denied = await propose({ ...change, request_id: "deny", expected_version: updated.version });
    await approve(denied.id, full.cookie, "deny");
    assert.equal((await mcp.callTool({ name: "commit_memory_change", arguments: { id: denied.id } })).isError, true);
    const deletion = await propose({ operation: "delete", request_id: "delete-1", memory_id: saved.id, expected_version: updated.version });
    await approve(deletion.id, full.cookie);
    const receipt = decode(await mcp.callTool({ name: "commit_memory_change", arguments: { id: deletion.id } }));
    assert.equal(receipt.deleted, true);
    assert.deepEqual(decode(await mcp.callTool({ name: "commit_memory_change", arguments: { id: deletion.id } })), receipt);
    assert.equal((await json("/v1/memories/" + saved.id, undefined, writer)).status, 404);
    const sql = await mf.unsafeGetDurableObjectStorage("oauth", "MemoryProject", { name: "oauth" });
    assert.equal((await sql.exec("SELECT count(*) n FROM mcp_write_requests WHERE payload LIKE '%ApprovedNeedle%' OR payload LIKE '%ChangedNeedle%'"))[0].n, 0);
    assert.equal((await sql.exec("SELECT count(*) n FROM memories"))[0].n, 0);
  });
  await run("restart retains consent; concurrent commits run once; proposal/code/token expiry fail closed", async () => {
    const change = { request_id: "restart-1", operation: "add", content: "RestartNeedle", source };
    const pending = decode(await mcp.callTool({ name: "propose_memory_change", arguments: { change } }));
    await approve(pending.id, full.cookie);
    for (const client of clients.splice(0)) await client.close();
    await mf.dispose(); mf = create(); mcp = await connect(full.token);
    const results = await Promise.all([1, 2].map(() => mcp.callTool({ name: "commit_memory_change", arguments: { id: pending.id } }).then(decode)));
    assert.deepEqual(results[0], results[1]);
    let sql = await mf.unsafeGetDurableObjectStorage("oauth", "MemoryProject", { name: "oauth" });
    assert.equal((await sql.exec("SELECT count(*) n FROM memories"))[0].n, 1);
    const live = await ok("/v1/memories/" + results[0].id, undefined, writer);
    await ok("/v1/memories/" + live.id, { expected_version: live.version }, writer, "DELETE");
    const expires = decode(await mcp.callTool({ name: "propose_memory_change", arguments: { change: { ...change, request_id: "expires" } } }));
    await sql.exec("UPDATE mcp_write_requests SET expires_at='2000-01-01T00:00:00Z' WHERE id=?", expires.id);
    assert.equal((await mcp.callTool({ name: "commit_memory_change", arguments: { id: expires.id } })).isError, true);
    const flow = await begin(), consentResponse = await consent(flow);
    const code = new URL(consentResponse.headers.get("Location")).searchParams.get("code");
    await sql.exec("UPDATE oauth_codes SET expires_at='2000-01-01T00:00:00Z' WHERE used=0");
    assert.equal((await post("/oauth/token", { grant_type: "authorization_code", client_id: app.client_id, code,
      redirect_uri: "https://client.test/callback", resource: origin + "/v1/mcp", code_verifier: verifier })).status, 400);
    const expired = await issue();
    await sql.exec("UPDATE oauth_tokens SET expires_at='2000-01-01T00:00:00Z' WHERE digest=?", createHash("sha256").update(expired.token).digest("hex"));
    assert.equal((await request("/v1/mcp", { method: "POST", headers: { Authorization: "Bearer " + expired.token } })).status, 401);
    const wrongOrigin = await transport("https://other.test/v1/mcp", { method: "POST", headers: { Authorization: "Bearer " + full.token } });
    assert.equal(wrongOrigin.status, 401);
    const wrongScope = await issue("mcp:read"), restricted = await connect(wrongScope.token);
    assert.equal((await restricted.callTool({ name: "propose_memory_change", arguments: { change } })).isError, true);
  });
  await run("original-key revocation invalidates tokens and pending proposals without retaining plaintext", async () => {
    const keyRecord = await ok("/v1/keys", { name: "revocation-test", role: "write", user_id: "alice" });
    const access = await issue("mcp:read mcp:write", keyRecord.key), client = await connect(access.token);
    const pending = decode(await client.callTool({ name: "propose_memory_change", arguments: { change: { operation: "add", request_id: "revoke", content: "RevokedPlaintext", source } } }));
    await approve(pending.id, access.cookie);
    await ok("/v1/keys/" + keyRecord.record.id, {}, admin, "DELETE");
    assert.equal((await request("/v1/mcp", { method: "POST", headers: { Authorization: "Bearer " + access.token } })).status, 401);
    const sql = await mf.unsafeGetDurableObjectStorage("oauth", "MemoryProject", { name: "oauth" });
    assert.equal((await sql.exec("SELECT count(*) n FROM mcp_write_requests WHERE id=?", pending.id))[0].n, 0);
  });
  await run("token, grant, original key and client revocation are immediate; raw tokens never stored", async () => {
    const revoke = await post("/oauth/revoke", { token: full.token, client_id: app.client_id }); assert.equal(revoke.status, 200);
    assert.equal((await request("/v1/mcp", { method: "POST", headers: { Authorization: "Bearer " + full.token } })).status, 401);
    const next = await issue();
    const grants = await ok("/v1/oauth/grants", undefined, writer);
    for (const grant of grants) await ok("/v1/oauth/grants/" + grant.id, {}, writer, "DELETE");
    assert.equal((await request("/v1/mcp", { method: "POST", headers: { Authorization: "Bearer " + next.token } })).status, 401);
    const beforeClientRevoke = await issue();
    await ok("/v1/oauth/clients/" + app.client_id, {}, admin, "DELETE");
    assert.equal((await request("/v1/mcp", { method: "POST", headers: { Authorization: "Bearer " + beforeClientRevoke.token } })).status, 401);
    const sql = await mf.unsafeGetDurableObjectStorage("oauth", "MemoryProject", { name: "oauth" });
    const tokens = await sql.exec("SELECT digest FROM oauth_tokens");
    assert.ok(tokens.every(row => /^[a-f0-9]{64}$/.test(row.digest)));
    for (const key of await ok("/v1/keys")) await ok("/v1/keys/" + key.id, {}, admin, "DELETE");
  });
  assert.equal(outbound, 0);
  console.log(JSON.stringify({ status: "passed", groups: groups.length, tests: groups, provider_calls: 0, production_requests: 0 }, null, 2));
} finally {
  for (const client of clients) await client.close().catch(() => {});
  await mf?.dispose(); await rm(dir, { recursive: true, force: true });
}
