// ../product/sdk/client.mjs
var MemoryApiError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "MemoryApiError";
    this.status = status;
    this.code = code;
  }
};
function queryParams(filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === void 0 || value === null || value === "") continue;
    params.set(key, key === "filter" && typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  return params;
}
var SixteenMemory = class {
  constructor({ baseUrl, apiKey, fetch: fetcher = (...args) => globalThis.fetch(...args), timeoutMs = 15e3 }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
  }
  /** @param {string} path @param {{method?: string, body?: unknown}} options */
  async request(path, { method = "GET", body } = {}) {
    const response = await this.fetcher(this.baseUrl + path, {
      method,
      signal: AbortSignal.timeout(this.timeoutMs),
      redirect: "error",
      headers: {
        ...this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
        ...body === void 0 ? {} : { "Content-Type": "application/json" }
      },
      ...body === void 0 ? {} : { body: JSON.stringify(body) }
    });
    const result = await response.json();
    if (!response.ok) throw new MemoryApiError(response.status, result.error?.code ?? "request_failed", result.error?.message ?? "Request failed");
    return result;
  }
  health() {
    return this.request("/health");
  }
  me() {
    return this.request("/v1/me");
  }
  add(input) {
    return this.request("/v1/memories", { method: "POST", body: input });
  }
  get(id) {
    return this.request(`/v1/memories/${encodeURIComponent(id)}`);
  }
  list(filters = {}) {
    return this.request("/v1/memories?" + queryParams(filters));
  }
  search(input) {
    return this.request("/v1/search", { method: "POST", body: input });
  }
  update(id, input) {
    return this.request(`/v1/memories/${encodeURIComponent(id)}`, { method: "PATCH", body: input });
  }
  history(id) {
    return this.request(`/v1/memories/${encodeURIComponent(id)}/history`);
  }
  revoke(id, expected_version, reason) {
    return this.request(`/v1/memories/${encodeURIComponent(id)}/revoke`, { method: "POST", body: { expected_version, reason } });
  }
  delete(id, expected_version) {
    return this.request(`/v1/memories/${encodeURIComponent(id)}`, { method: "DELETE", body: { expected_version } });
  }
  exportPage(filters = {}) {
    return this.request("/v1/export?" + queryParams(filters));
  }
  answer(input) {
    return this.request("/v1/answer", { method: "POST", body: input });
  }
  keys() {
    return this.request("/v1/keys");
  }
  createKey(input) {
    return this.request("/v1/keys", { method: "POST", body: input });
  }
  revokeKey(id) {
    return this.request(`/v1/keys/${encodeURIComponent(id)}`, { method: "DELETE" });
  }
  requests() {
    return this.request("/v1/requests");
  }
};

// ../product/sdk/index.mjs
var SixteenMemory2 = class extends SixteenMemory {
  ingest(input) {
    return this.request("/v1/ingestions", { method: "POST", body: input });
  }
  ingestion(id) {
    return this.request(`/v1/ingestions/${encodeURIComponent(id)}`);
  }
  ingestions(user_id) {
    return this.request("/v1/ingestions?" + new URLSearchParams({ user_id }));
  }
  resolveIngestion(id, approve) {
    return this.request(`/v1/ingestions/${encodeURIComponent(id)}/resolve`, { method: "POST", body: { approve } });
  }
  evidence(id) {
    return this.request(`/v1/memories/${encodeURIComponent(id)}/evidence`);
  }
  reindex(user_id, cursor = "") {
    return this.request("/v1/reindex", { method: "POST", body: { user_id, cursor } });
  }
};
export {
  MemoryApiError,
  SixteenMemory2 as SixteenMemory
};
