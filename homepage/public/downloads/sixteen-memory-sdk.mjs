// ../product/sdk/client.mjs
var MemoryApiError = class extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "MemoryApiError";
    this.status = status;
    this.code = code;
  }
};
var MemoryTransportError = class extends Error {
  constructor(code) {
    super(`Memory transport failed (${code}).`);
    this.name = "MemoryTransportError";
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
  constructor({ baseUrl, apiKey, fetch: fetcher = (...args) => globalThis.fetch(...args), timeoutMs = 15e3, maxResponseBytes = 16 * 1024 * 1024 }) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) {
      throw new MemoryTransportError("invalid_config");
    }
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
    this.maxResponseBytes = maxResponseBytes;
  }
  /** @param {string} path @param {{method?: string, body?: unknown, signal?: AbortSignal}} options */
  async request(path, { method = "GET", body, signal } = {}) {
    if (signal?.aborted) throw new MemoryTransportError("aborted");
    const serialized = body === void 0 ? void 0 : JSON.stringify(body);
    if (serialized && new TextEncoder().encode(serialized).byteLength > 64 * 1024) {
      throw new MemoryTransportError("request_too_large");
    }
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    try {
      const response = await this.fetcher(this.baseUrl + path, {
        method,
        signal: combined,
        redirect: "manual",
        headers: {
          ...this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
          ...body === void 0 ? {} : { "Content-Type": "application/json" }
        },
        ...serialized === void 0 ? {} : { body: serialized }
      });
      if (response.status >= 300 && response.status < 400) {
        try {
          await response.body?.cancel();
        } catch {
        }
        throw new MemoryApiError(response.status, "redirect_denied", "HTTP redirects are not allowed.");
      }
      const reader = response.body?.getReader();
      let output = "";
      if (reader) {
        const decoder = new TextDecoder();
        let size = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > this.maxResponseBytes) throw new MemoryTransportError("response_too_large");
            output += decoder.decode(value, { stream: true });
          }
          output += decoder.decode();
        } catch (error) {
          try {
            await reader.cancel();
          } catch {
          }
          throw error;
        } finally {
          reader.releaseLock();
        }
      }
      let result;
      try {
        result = JSON.parse(output);
      } catch {
        if (!response.ok) throw new MemoryApiError(response.status, "request_failed", "Request failed");
        throw new MemoryTransportError("invalid_response");
      }
      if (!response.ok) throw new MemoryApiError(
        response.status,
        typeof result?.error?.code === "string" ? result.error.code : "request_failed",
        typeof result?.error?.message === "string" ? result.error.message : "Request failed"
      );
      return result;
    } catch (error) {
      if (signal?.aborted) throw new MemoryTransportError("aborted");
      if (timeout.aborted) throw new MemoryTransportError("timeout");
      if (error instanceof MemoryApiError || error instanceof MemoryTransportError) throw error;
      throw new MemoryTransportError("network_error");
    }
  }
  health(call = {}) {
    return this.request("/health", call);
  }
  me(call = {}) {
    return this.request("/v1/me", call);
  }
  login(api_key, call = {}) {
    return this.request("/v1/session", { ...call, method: "POST", body: { api_key } });
  }
  logout(call = {}) {
    return this.request("/v1/session", { ...call, method: "DELETE" });
  }
  add(input, call = {}) {
    return this.request("/v1/memories", { ...call, method: "POST", body: input });
  }
  get(id, call = {}) {
    return this.request(`/v1/memories/${encodeURIComponent(id)}`, call);
  }
  list(filters = {}, call = {}) {
    return this.request("/v1/memories?" + queryParams(filters), call);
  }
  search(input, call = {}) {
    return this.request("/v1/search", { ...call, method: "POST", body: input });
  }
  update(id, input, call = {}) {
    return this.request(`/v1/memories/${encodeURIComponent(id)}`, { ...call, method: "PATCH", body: input });
  }
  history(id, call = {}) {
    return this.request(`/v1/memories/${encodeURIComponent(id)}/history`, call);
  }
  revoke(id, expected_version, reason, call = {}) {
    return this.request(`/v1/memories/${encodeURIComponent(id)}/revoke`, { ...call, method: "POST", body: { expected_version, reason } });
  }
  delete(id, expected_version, call = {}) {
    return this.request(`/v1/memories/${encodeURIComponent(id)}`, { ...call, method: "DELETE", body: { expected_version } });
  }
  exportPage(filters = {}, call = {}) {
    return this.request("/v1/export?" + queryParams(filters), call);
  }
  answer(input, call = {}) {
    return this.request("/v1/answer", { ...call, method: "POST", body: input });
  }
  keys(call = {}) {
    return this.request("/v1/keys", call);
  }
  createKey(input, call = {}) {
    return this.request("/v1/keys", { ...call, method: "POST", body: input });
  }
  revokeKey(id, call = {}) {
    return this.request(`/v1/keys/${encodeURIComponent(id)}`, { ...call, method: "DELETE" });
  }
  requests(call = {}) {
    return this.request("/v1/requests", call);
  }
};

// ../product/sdk/index.mjs
var SixteenMemory2 = class extends SixteenMemory {
  ingest(input, call = {}) {
    return this.request("/v1/ingestions", { ...call, method: "POST", body: input });
  }
  ingestion(id, call = {}) {
    return this.request(`/v1/ingestions/${encodeURIComponent(id)}`, call);
  }
  ingestions(user_id, call = {}) {
    return this.request("/v1/ingestions?" + new URLSearchParams({ user_id }), call);
  }
  resolveIngestion(id, approve, call = {}) {
    return this.request(`/v1/ingestions/${encodeURIComponent(id)}/resolve`, { ...call, method: "POST", body: { approve } });
  }
  evidence(id, call = {}) {
    return this.request(`/v1/memories/${encodeURIComponent(id)}/evidence`, call);
  }
  reindex(user_id, cursor = "", call = {}) {
    return this.request("/v1/reindex", { ...call, method: "POST", body: { user_id, cursor } });
  }
};
export {
  MemoryApiError,
  MemoryTransportError,
  SixteenMemory2 as SixteenMemory
};
