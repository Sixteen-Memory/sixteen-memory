import { access, admin, equalDigest, expectedVersion, fail, identifier, memoryInput, object, text, type Identity } from "./domain";

export type OAuthAction = "oauth_client_add" | "oauth_clients" | "oauth_client_revoke" | "oauth_grants" | "oauth_grant_revoke" |
  "mcp_write_propose" | "mcp_write_status" | "mcp_write_commit" | "mcp_approval_view" | "mcp_approval_resolve";
type Client = { id: string; name: string; redirects: string; scopes: string; revoked_at: string | null };
type Grant = { id: string; client_id: string; key_id: string; resource: string; scopes: string; expires_at: string; revoked_at: string | null };
type Flow = { id: string; client_id: string; redirect_uri: string; resource: string; scopes: string; state: string; challenge: string; cookie_hash: string; csrf_hash: string; expires_at: string };
type Code = { digest: string; grant_id: string; redirect_uri: string; challenge: string; expires_at: string; used: number };
type Write = { id: string; grant_id: string; request_id: string; payload: string | null; state: string; result: string | null; expires_at: string };
type Key = { id: string; user_id: string; role: "read" | "write"; revoked_at: string | null };
const future = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();
export const MCP_SCOPES = ["mcp:read", "mcp:write"];
export function scopes(value: unknown) {
  const parts = String(value ?? "mcp:read").split(" ");
  if (!parts.includes("mcp:read") || new Set(parts).size !== parts.length || parts.some(s => !MCP_SCOPES.includes(s))) fail(400, "invalid_scope", "Unsupported scope");
  return MCP_SCOPES.filter(s => parts.includes(s)).join(" ");
}
export function redirectUri(value: unknown) {
  const raw = text(value, "redirect_uri", 2048);
  let url: URL; try { url = new URL(raw); } catch { fail(400, "invalid_redirect_uri", "Invalid redirect URI"); }
  if (url.username || url.password || url.hash || raw.includes("*") ||
      !(url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    fail(400, "invalid_redirect_uri", "HTTPS or literal loopback redirect required");
  }
  return raw; // Exact match, including path, query and port. No external metadata fetch.
}

/** All methods run inside the owning Durable Object transaction. No bearer plaintext is stored. */
export class OAuthStore {
  constructor(private sql: SqlStorage, private dispatch: (who: Identity, action: string, input: Record<string, unknown>, digest?: string) => unknown) {
    sql.exec(`
      CREATE TABLE IF NOT EXISTS oauth_clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, redirects TEXT NOT NULL, scopes TEXT NOT NULL, revoked_at TEXT);
      CREATE TABLE IF NOT EXISTS oauth_flows (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, resource TEXT NOT NULL, scopes TEXT NOT NULL, state TEXT NOT NULL, challenge TEXT NOT NULL, cookie_hash TEXT NOT NULL, csrf_hash TEXT NOT NULL, expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS oauth_grants (id TEXT PRIMARY KEY, client_id TEXT NOT NULL, key_id TEXT NOT NULL, resource TEXT NOT NULL, scopes TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT);
      CREATE TABLE IF NOT EXISTS oauth_codes (digest TEXT PRIMARY KEY, grant_id TEXT NOT NULL, redirect_uri TEXT NOT NULL, challenge TEXT NOT NULL, expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS oauth_tokens (digest TEXT PRIMARY KEY, grant_id TEXT NOT NULL, expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS mcp_write_requests (id TEXT PRIMARY KEY, grant_id TEXT NOT NULL, request_id TEXT NOT NULL, payload TEXT, state TEXT NOT NULL, result TEXT, expires_at TEXT NOT NULL, UNIQUE(grant_id,request_id));
    `);
  }
  client(id: string) {
    const row = this.sql.exec<Client>("SELECT * FROM oauth_clients WHERE id=? AND revoked_at IS NULL", id).toArray()[0];
    if (!row) fail(400, "invalid_client", "Unknown or revoked client");
    return row;
  }
  grant(id: string): { grant: Grant; key: Key } {
    const grant = this.sql.exec<Grant>("SELECT * FROM oauth_grants WHERE id=? AND revoked_at IS NULL AND expires_at>?", id, new Date().toISOString()).toArray()[0];
    if (!grant) fail(401, "invalid_token", "Grant unavailable");
    const client = this.sql.exec<Client>("SELECT * FROM oauth_clients WHERE id=? AND revoked_at IS NULL", grant.client_id).toArray()[0];
    const key = this.sql.exec<Key>("SELECT id,user_id,role,revoked_at FROM api_keys WHERE id=? AND revoked_at IS NULL", grant.key_id).toArray()[0];
    if (!client || !key) fail(401, "invalid_token", "Grant revoked");
    return { grant, key };
  }
  identity(digest: string, resource: string): Identity {
    const token = this.sql.exec<{ grant_id: string }>("SELECT grant_id FROM oauth_tokens WHERE digest=? AND expires_at>?", digest, new Date().toISOString()).toArray()[0];
    if (!token) fail(401, "invalid_token", "Token unavailable");
    const { grant, key } = this.grant(token.grant_id);
    if (grant.resource !== resource) fail(401, "invalid_token", "Wrong resource");
    return { key_id: "oauth:" + grant.id, user_id: key.user_id, role: key.role === "write" && grant.scopes.includes("mcp:write") ? "write" : "read" };
  }
  begin(input: Record<string, unknown>) {
    this.purge();
    const client = this.client(String(input.client_id));
    if (!JSON.parse(client.redirects).includes(input.redirect_uri)) fail(400, "invalid_redirect_uri", "Redirect is not registered");
    const scope = scopes(input.scope);
    if (scope.split(" ").some(s => !client.scopes.split(" ").includes(s))) fail(400, "invalid_scope", "Client scope is not allowed");
    if (this.sql.exec<{ n: number }>("SELECT count(*) n FROM oauth_flows").one().n >= 1000) fail(429, "oauth_capacity", "Try later");
    this.sql.exec("INSERT INTO oauth_flows VALUES (?,?,?,?,?,?,?,?,?,?)", String(input.id), client.id, String(input.redirect_uri), String(input.resource),
      scope, String(input.state), String(input.challenge), String(input.cookie_hash), String(input.csrf_hash), future(600));
    return { client_name: client.name, redirect_uri: input.redirect_uri, scope };
  }
  consent(input: Record<string, unknown>, who?: Identity) {
    const row = this.sql.exec<Flow>("SELECT * FROM oauth_flows WHERE id=? AND expires_at>?", String(input.flow), new Date().toISOString()).toArray()[0];
    if (!row || !equalDigest(row.cookie_hash, String(input.cookie_hash)) || !equalDigest(row.csrf_hash, String(input.csrf_hash))) fail(400, "invalid_request", "Expired or invalid consent");
    this.client(row.client_id);
    if (input.approve === true) {
      if (!who?.user_id || who.role === "admin" || who.key_id.startsWith("oauth:")) fail(403, "scoped_key_required", "Use a user-scoped key");
      if (row.scopes.includes("mcp:write") && who.role !== "write") fail(403, "read_only", "A write key is required");
      if (this.sql.exec<{ n: number }>("SELECT count(*) n FROM oauth_grants WHERE key_id=? AND revoked_at IS NULL AND expires_at>?", who.key_id, new Date().toISOString()).one().n >= 100) fail(429, "oauth_capacity", "Too many active grants");
      const grantId = crypto.randomUUID();
      this.sql.exec("INSERT INTO oauth_grants VALUES (?,?,?,?,?,?,NULL)", grantId, row.client_id, who.key_id, row.resource, row.scopes, future(900));
      this.sql.exec("INSERT INTO oauth_codes VALUES (?,?,?,?,?,0)", String(input.code_hash), grantId, row.redirect_uri, row.challenge, future(60));
    }
    this.sql.exec("DELETE FROM oauth_flows WHERE id=?", row.id);
    return { redirect_uri: row.redirect_uri, state: row.state };
  }
  token(input: Record<string, unknown>) {
    const code = this.sql.exec<Code>("SELECT * FROM oauth_codes WHERE digest=? AND expires_at>?", String(input.code_hash), new Date().toISOString()).toArray()[0];
    if (!code) fail(400, "invalid_grant", "Code expired or consumed");
    const { grant } = this.grant(code.grant_id);
    if (grant.client_id !== input.client_id || grant.resource !== input.resource ||
        code.redirect_uri !== input.redirect_uri || !equalDigest(code.challenge, String(input.challenge))) fail(400, "invalid_grant", "Code binding mismatch");
    if (code.used) {
      // Return a committed error outcome rather than throwing inside the transaction.
      this.sql.exec("UPDATE oauth_grants SET revoked_at=? WHERE id=?", new Date().toISOString(), grant.id);
      this.purge();
      return { _error: "invalid_grant" };
    }
    this.sql.exec("UPDATE oauth_codes SET used=1,expires_at=? WHERE digest=?", grant.expires_at, code.digest);
    const seconds = Math.max(1, Math.floor((Date.parse(grant.expires_at) - Date.now()) / 1000));
    this.sql.exec("INSERT INTO oauth_tokens VALUES (?,?,?)", String(input.token_hash), grant.id, grant.expires_at);
    return { token_type: "Bearer", expires_in: seconds, scope: grant.scopes };
  }
  revoke(input: Record<string, unknown>) {
    const token = this.sql.exec<{ grant_id: string }>("SELECT grant_id FROM oauth_tokens WHERE digest=?", String(input.token_hash)).toArray()[0];
    if (token) this.sql.exec("UPDATE oauth_grants SET revoked_at=? WHERE id=? AND client_id=?", new Date().toISOString(), token.grant_id, String(input.client_id));
    this.purge();
    return {};
  }
  execute(who: Identity, action: OAuthAction, input: Record<string, unknown>) {
    if (action === "oauth_client_add") {
      admin(who);
      const data = object(input);
      if (!Array.isArray(data.redirect_uris) || !data.redirect_uris.length || data.redirect_uris.length > 8) fail(422, "invalid_redirect_uri", "Supply 1-8 exact redirects");
      if (this.sql.exec<{ n: number }>("SELECT count(*) n FROM oauth_clients WHERE revoked_at IS NULL").one().n >= 100) fail(409, "oauth_capacity", "Client limit");
      const id = crypto.randomUUID(), name = text(data.client_name, "client_name", 100), redirects = data.redirect_uris.map(redirectUri), scope = scopes(data.scope);
      this.sql.exec("INSERT INTO oauth_clients VALUES (?,?,?,?,NULL)", id, name, JSON.stringify(redirects), scope);
      return { client_id: id, client_name: name, redirect_uris: redirects, scope, token_endpoint_auth_method: "none" };
    }
    if (action === "oauth_clients") { admin(who); return this.sql.exec("SELECT * FROM oauth_clients").toArray(); }
    if (action === "oauth_client_revoke") { admin(who); this.sql.exec("UPDATE oauth_clients SET revoked_at=? WHERE id=?", new Date().toISOString(), identifier(input.id, "id")); this.purge(); return { revoked: true }; }
    if (action === "oauth_grants" || action === "oauth_grant_revoke") {
      if (!who.user_id || who.key_id.startsWith("oauth:")) fail(403, "scoped_key_required", "Use the original user key or session");
      if (action === "oauth_grants") return this.sql.exec("SELECT id,client_id,resource,scopes,expires_at,revoked_at FROM oauth_grants WHERE key_id=?", who.key_id).toArray();
      this.sql.exec("UPDATE oauth_grants SET revoked_at=? WHERE id=? AND key_id=?", new Date().toISOString(), identifier(input.id, "id"), who.key_id);
      this.purge(); return { revoked: true };
    }
    if (action === "mcp_write_propose") {
      if (who.role !== "write" || !who.key_id.startsWith("oauth:")) fail(403, "insufficient_scope", "mcp:write OAuth consent required");
      const grantId = who.key_id.slice(6); this.grant(grantId);
      const requestId = identifier(input.request_id, "request_id");
      const data = this.validateWrite(who, input);
      const payload = JSON.stringify(data);
      const existing = this.sql.exec<Write>("SELECT * FROM mcp_write_requests WHERE grant_id=? AND request_id=?", grantId, requestId).toArray()[0];
      if (existing) {
        if (existing.payload !== payload) fail(409, "idempotency_conflict", "Request already used or consumed");
        return { id: existing.id, state: existing.state, expires_at: existing.expires_at };
      }
      if (this.sql.exec<{ n: number }>("SELECT count(*) n FROM mcp_write_requests WHERE grant_id=?", grantId).one().n >= 100) fail(429, "approval_capacity", "Too many proposals");
      const id = crypto.randomUUID(), expires = future(600);
      this.sql.exec("INSERT INTO mcp_write_requests VALUES (?,?,?,?,'pending',NULL,?)", id, grantId, requestId, payload, expires);
      return { id, state: "pending", expires_at: expires };
    }
    const row = this.sql.exec<Write>("SELECT * FROM mcp_write_requests WHERE id=? AND expires_at>?", identifier(input.id, "id"), new Date().toISOString()).toArray()[0];
    if (!row) fail(404, "not_found", "Proposal unavailable");
    const { grant, key } = this.grant(row.grant_id);
    if (action.startsWith("mcp_approval")) {
      if (who.key_id !== key.id || who.role !== "write") fail(404, "not_found", "Proposal unavailable");
      if (action === "mcp_approval_view") {
        const payload = row.payload ? JSON.parse(row.payload) : null;
        const current = payload?.memory_id ? this.dispatch(who, "get", { id: payload.memory_id }) : null;
        return { id: row.id, state: row.state, payload, current, client_name: this.client(grant.client_id).name, expires_at: row.expires_at };
      }
      if (typeof input.approve !== "boolean" || row.state !== "pending") fail(409, "approval_state", "Proposal already decided");
      this.sql.exec("UPDATE mcp_write_requests SET state=?,payload=CASE WHEN ? THEN payload ELSE NULL END WHERE id=?", input.approve ? "approved" : "denied", input.approve ? 1 : 0, row.id);
      return { id: row.id, state: input.approve ? "approved" : "denied" };
    }
    if (who.key_id !== "oauth:" + row.grant_id || who.role !== "write") fail(404, "not_found", "Proposal unavailable");
    if (action === "mcp_write_status") return { id: row.id, state: row.state, expires_at: row.expires_at };
    if (action !== "mcp_write_commit") fail(404, "not_found", "Unknown action");
    if (row.state === "committed") return JSON.parse(row.result!);
    if (row.state !== "approved" || !row.payload) fail(409, "approval_required", "A human must approve the exact proposal first");
    const data = this.validateWrite(who, JSON.parse(row.payload));
    const operation = String(data.operation);
    const result = this.dispatch(who, operation, { ...data, id: data.memory_id, user_id: key.user_id, request_id: "mcp-" + row.id }) as { id: string; version?: number; deleted?: boolean };
    const receipt = { id: result.id, operation, ...(result.version ? { version: result.version } : {}), ...(result.deleted ? { deleted: true } : {}) };
    this.sql.exec("UPDATE mcp_write_requests SET state='committed',payload=NULL,result=? WHERE id=?", JSON.stringify(receipt), row.id);
    return receipt; // Transaction commits mutation + receipt atomically, never retains deleted plaintext.
  }
  private validateWrite(who: Identity, input: Record<string, unknown>) {
    const op = input.operation;
    if (!["add", "update", "delete"].includes(String(op))) fail(422, "invalid_operation", "Unsupported mutation");
    const allowed = ["operation", "request_id", ...(op === "add" ? ["content", "source", "expires_at"] :
      op === "update" ? ["memory_id", "expected_version", "content", "source", "expires_at", "reason"] : ["memory_id", "expected_version"])];
    if (Object.keys(input).some(k => !allowed.includes(k))) fail(422, "invalid_field", "Unexpected mutation field");
    let base: Record<string, unknown> = { operation: op, request_id: identifier(input.request_id, "request_id") };
    if (op !== "add") {
      const id = identifier(input.memory_id, "memory_id");
      const current = this.dispatch(who, "get", { id }) as { version: number; user_id: string };
      access(who, current.user_id, true);
      if (expectedVersion(input.expected_version) !== current.version) fail(409, "version_conflict", "Memory changed; submit a new proposal");
      base = { ...base, memory_id: id, expected_version: current.version };
    }
    if (op !== "delete") {
      const draft = memoryInput({ ...input, user_id: who.user_id });
      base = { ...base, content: draft.content, source: draft.source, expires_at: draft.expires_at };
      if (op === "update") base.reason = text(input.reason, "reason", 500);
    }
    return base;
  }
  purge() {
    const now = new Date().toISOString();
    this.sql.exec("UPDATE oauth_grants SET revoked_at=? WHERE revoked_at IS NULL AND (key_id IN (SELECT id FROM api_keys WHERE revoked_at IS NOT NULL) OR client_id IN (SELECT id FROM oauth_clients WHERE revoked_at IS NOT NULL))", now);
    this.sql.exec("DELETE FROM oauth_flows WHERE expires_at<=?", now);
    this.sql.exec("DELETE FROM mcp_write_requests WHERE expires_at<=? OR grant_id IN (SELECT id FROM oauth_grants WHERE expires_at<=? OR revoked_at IS NOT NULL OR key_id IN (SELECT id FROM api_keys WHERE revoked_at IS NOT NULL) OR client_id IN (SELECT id FROM oauth_clients WHERE revoked_at IS NOT NULL))", now, now);
    this.sql.exec("DELETE FROM oauth_codes WHERE expires_at<=?", now);
    this.sql.exec("DELETE FROM oauth_tokens WHERE expires_at<=?", now);
    this.sql.exec("DELETE FROM oauth_grants WHERE expires_at<=?", now);
    this.sql.exec("DELETE FROM oauth_codes WHERE grant_id NOT IN (SELECT id FROM oauth_grants WHERE revoked_at IS NULL)");
    this.sql.exec("DELETE FROM oauth_tokens WHERE grant_id NOT IN (SELECT id FROM oauth_grants WHERE revoked_at IS NULL)");
  }
}
