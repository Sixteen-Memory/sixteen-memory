// Author the live v0.1 API here; generate JSON and SDK types together.
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const string = (maxLength, description) => ({ type: "string", ...(maxLength ? { minLength: 1, maxLength } : {}), ...(description ? { description } : {}) });
const object = (properties, required = Object.keys(properties)) => ({ type: "object", properties, required });
const array = items => ({ type: "array", items });
const identifier = { ...string(100), pattern: "^[A-Za-z0-9][A-Za-z0-9_.:@-]*$" };
const timestamp = { type: "string", format: "date-time" };
const nullableDate = { type: ["string", "null"], format: "date-time" };
const version = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER };
const status = { type: "string", enum: ["active", "revoked"] };
const source = object({
  type: { type: "string", enum: ["conversation", "business", "manual"] },
  ref: string(300), text: string(8000), observed_at: timestamp,
});
const memoryFields = { user_id: identifier, content: string(8000), source: ref("Source"), expires_at: nullableDate };
const recordFields = {
  ...memoryFields, id: { type: "string", format: "uuid" }, version, status,
  created_at: timestamp, updated_at: timestamp,
};
const identityFields = {
  key_id: string(), role: { type: "string", enum: ["admin", "read", "write"] },
  user_id: { type: ["string", "null"] }, project_id: string(),
};
const schemas = {
  Source: source,
  Memory: object(recordFields),
  CreateMemory: {
    ...object({ request_id: identifier, ...memoryFields }, ["request_id", "user_id", "content", "source"]),
    description: "expires_at defaults to null. A new expiry must be in the future. request_id is scoped to the credential for 30 days. Reuse the identical JSON payload, including field order, on retry; a changed payload returns 409. A deleted or expired record returns 410 during that period.",
  },
  UpdateMemory: {
    ...object({ content: string(8000), source: ref("Source"), expires_at: nullableDate, expected_version: version, reason: string(500) }, ["content", "source", "expected_version", "reason"]),
    description: "Replaces content and source, sets status to active, and increments version. Omitted expires_at resets expiry to null. User scope cannot change.",
  },
  RevokeMemory: object({ expected_version: version, reason: string(500) }),
  DeleteMemory: object({ expected_version: version }),
  DeleteResult: object({
    deleted: { type: "boolean", const: true }, id: string(),
    online_copies_removed: { type: "boolean", const: true },
    backup_cleanup_confirmed: { type: "boolean", const: false },
  }),
  MemoryPage: object({ data: { ...array(ref("Memory")), maxItems: 50 }, next_cursor: { type: ["string", "null"] } }),
  ExportPage: object({ data: { ...array(ref("Memory")), maxItems: 50 }, next_cursor: { type: ["string", "null"] }, exported_at: timestamp }),
  SearchInput: {
    ...object({ query: string(1000), user_id: identifier, limit: { type: "integer", minimum: 1, maximum: 50, default: 10 } }, ["query"]),
    description: "Only lexical search is supported in this API version. A scoped key always stays within its user. Omitting user_id with an administrator credential searches the whole project.",
  },
  SearchMatch: object({ ...recordFields, score: { type: "number", description: "Lexical ranking score, not a probability." } }),
  SearchResult: object({ data: array(ref("SearchMatch")), retrieval: { type: "string", const: "lexical" } }),
  HistoryEntry: object({
    version, action: { type: "string", enum: ["created", "updated", "revoked"] },
    content: string(8000), source: ref("Source"), status, reason: string(), actor: string(), created_at: timestamp,
  }),
  Identity: object(identityFields),
  CreateKey: object({ name: string(80), role: { type: "string", enum: ["read", "write"] }, user_id: identifier }),
  KeyRecord: object({
    id: string(), name: string(80), role: { type: "string", enum: ["read", "write"] },
    user_id: identifier, prefix: string(), created_at: timestamp, revoked_at: nullableDate,
  }),
  CreateKeyResult: object({ key: string(), record: ref("KeyRecord") }),
  RevokeKeyResult: object({ revoked: { type: "boolean", const: true } }),
  AuditEntry: object({
    id: { type: "integer" }, action: string(), status: { type: "integer" },
    duration_ms: { type: "integer", minimum: 0 }, actor: string(), created_at: timestamp,
  }),
  Health: object({
    status: { type: "string", const: "ok" }, version: { type: "string", const: "0.1.0" },
    retrieval: { type: "string", const: "lexical" }, extraction: { type: "string", const: "explicit" },
    model_configured: { type: "boolean" },
  }),
  Answer: object({
    answer: string(), memories: array(ref("SearchMatch")),
    usage: { description: "Provider-specific usage data or null; no provider response shape is guaranteed." },
    model: string(),
  }),
  LoginInput: object({ api_key: { ...string(256), writeOnly: true } }),
  LogoutResult: object({ logged_out: { type: "boolean", const: true } }),
  Error: object({ error: object({ code: string(), message: string() }) }),
};
const json = schema => ({ "application/json": { schema } });
const errors = {
  401: "Missing, invalid or expired credential or session.",
  403: "Read-only key, administrator required, or cross-origin request denied.",
  404: "Unknown route, missing record or user outside the key scope.",
  409: "Version conflict, idempotency conflict, project capacity or key limit.",
  410: "The original idempotent write was deleted or expired.",
  413: "JSON body exceeds 64 KiB.",
  415: "Expected Content-Type: application/json.",
  422: "Invalid JSON, identifier, field, source, expiry, version, query or limit.",
  429: "Rate limited. Wait according to Retry-After; writes are not retried automatically.",
  502: "The configured answer provider failed or returned an invalid response.",
  503: "Service, storage or provider configuration unavailable.",
};
const errorResponse = code => ({
  description: errors[code], content: json(ref("Error")),
  ...(code === 429 ? { headers: { "Retry-After": { schema: { type: "string", const: "60" }, description: "Seconds to wait." } } } : {}),
});
const idParam = { name: "id", in: "path", required: true, schema: { type: "string", pattern: "^[A-Za-z0-9-]+$" } };
const pageParams = [
  { name: "user_id", in: "query", schema: identifier, description: "Scoped keys default to their own user; administrators default to all users." },
  { name: "status", in: "query", schema: { type: "string", enum: ["all", "active", "revoked"], default: "all" } },
  { name: "cursor", in: "query", schema: identifier, description: "Pass the previous next_cursor unchanged. Pages contain at most 50 records, ordered by ID. This is not a historical snapshot." },
];
const authErrors = [401, 403, 404, 429, 503];
const writeErrors = [...authErrors, 409, 413, 415, 422];
function operation(operationId, summary, schema, { body, parameters, codes = authErrors, description, ...extra } = {}) {
  return {
    operationId, summary, ...(description ? { description } : {}),
    ...(parameters ? { parameters } : {}),
    ...(body ? { requestBody: { required: true, content: json(ref(body)) } } : {}),
    responses: { 200: { description: "Success.", content: json(typeof schema === "string" ? ref(schema) : schema) }, ...Object.fromEntries(codes.map(code => [code, errorResponse(code)])) },
    ...extra,
  };
}
export const document = {
  openapi: "3.1.0",
  info: {
    title: "SixteenMemory API",
    version: "0.1.0",
    description: "The deployed explicit-memory API. Server-side integrations should use a user-scoped Bearer key. Cross-origin browser calls are rejected. Source evidence is supplied by the application, not extracted by a model. All successful operations return HTTP 200. JSON request bodies are limited to 64 KiB; content and source text to 8,000 UTF-16 code units. Fields outside the documented input schema are ignored, not supported features. Intelligence, metadata filters, ingestion, evidence and reindex endpoints belong to an unreleased candidate and are deliberately absent. The answer endpoint requires a configured provider and may incur costs; it was disabled in the public deployment when this document was released.",
  },
  servers: [{ url: "https://console.sixteenmemory.com", description: "Online developer preview" }],
  security: [{ bearerAuth: [] }, { sessionCookie: [] }],
  paths: {
    "/health": { get: operation("health", "Inspect service availability", "Health", { security: [], codes: [503], tags: ["Service"] }) },
    "/v1/me": { get: operation("me", "Inspect the current identity", "Identity", { tags: ["Access"] }) },
    "/v1/memories": {
      get: operation("list", "List current memories", "MemoryPage", { parameters: pageParams, codes: [...authErrors, 422], tags: ["Memory"] }),
      post: operation("add", "Save an explicit memory", "Memory", { body: "CreateMemory", codes: [...writeErrors, 410], tags: ["Memory"] }),
    },
    "/v1/memories/{id}": {
      parameters: [idParam],
      get: operation("get", "Read a memory", "Memory", { description: "Includes active or revoked records. Expired records are removed.", tags: ["Memory"] }),
      patch: operation("update", "Replace a memory at its current version", "Memory", { body: "UpdateMemory", codes: writeErrors, tags: ["Memory"] }),
      delete: operation("delete", "Delete online memory and history", "DeleteResult", { body: "DeleteMemory", codes: writeErrors, description: "Permanent removal of online content, history and search entries. Does not confirm backup cleanup. A retry tombstone remains for up to 30 days.", tags: ["Memory"] }),
    },
    "/v1/memories/{id}/history": {
      parameters: [idParam],
      get: operation("history", "List versions, newest first", array(ref("HistoryEntry")), { tags: ["Memory"] }),
    },
    "/v1/memories/{id}/revoke": {
      parameters: [idParam],
      post: operation("revoke", "Deactivate a memory", "Memory", { body: "RevokeMemory", codes: writeErrors, description: "Removes the record from search. Direct reads and history remain available until expiry or deletion.", tags: ["Memory"] }),
    },
    "/v1/search": { post: operation("search", "Search active memories lexically", "SearchResult", { body: "SearchInput", codes: [...authErrors, 413, 415, 422], tags: ["Memory"] }) },
    "/v1/export": { get: operation("exportPage", "Export one page of current memories", "ExportPage", { parameters: pageParams, codes: [...authErrors, 422], tags: ["Memory"] }) },
    "/v1/answer": { post: operation("answer", "Answer with a configured model", "Answer", {
      body: "SearchInput", codes: [...authErrors, 413, 415, 422, 502], tags: ["Optional model"],
      description: "Retrieves memories then calls the configured provider. Returns 503 model_not_configured when disabled. May incur charges; the SDK never invokes this method automatically.",
      "x-availability": "requires-provider-configuration",
    }) },
    "/v1/keys": {
      get: operation("keys", "List API keys (administrator only)", array(ref("KeyRecord")), { tags: ["Access"] }),
      post: operation("createKey", "Create a user-scoped key (administrator only)", "CreateKeyResult", { body: "CreateKey", codes: writeErrors, description: "At most 100 active keys. The full key is returned once; never log or place it in a browser.", tags: ["Access"] }),
    },
    "/v1/keys/{id}": {
      parameters: [idParam],
      delete: operation("revokeKey", "Revoke a key and its sessions (administrator only)", "RevokeKeyResult", { description: "Returns revoked: true even when the key does not exist.", tags: ["Access"] }),
    },
    "/v1/requests": { get: operation("requests", "List the latest 100 request records (administrator only)", array(ref("AuditEntry")), { description: "Contains operation metadata, not memory bodies. No pagination.", tags: ["Access"] }) },
    "/v1/session": {
      post: operation("login", "Create a console cookie session", "Identity", {
        body: "LoginInput", security: [], codes: [401, 403, 413, 415, 422, 429, 503], tags: ["Console session"],
        description: "Console-only session flow. The HttpOnly SameSite=Strict sixteen_session cookie lasts eight hours and is Secure on HTTPS. Server SDKs use Bearer keys instead.",
      }),
      delete: operation("logout", "Clear the console cookie session", "LogoutResult", {
        security: [], codes: [403, 429, 503], tags: ["Console session"],
        description: "Clears the cookie even when no session exists. The server SDK does not manage browser sessions.",
      }),
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", description: "Administrator or user-scoped API key. Never use a provider credential here." },
      sessionCookie: { type: "apiKey", in: "cookie", name: "sixteen_session", description: "Same-origin console only. Authorization headers take precedence." },
    },
    schemas,
  },
};
for (const method of ["post", "delete"]) {
  document.paths["/v1/session"][method].responses[200].headers = {
    "Set-Cookie": { schema: { type: "string" }, description: "Sets or clears the HttpOnly console session." },
  };
}
