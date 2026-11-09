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
async function* pages(fetch, cursor = "", field = "data") {
  const seen = new Set(cursor ? [cursor] : []);
  while (true) {
    const page = await fetch(cursor);
    if (!page || !Array.isArray(page[field]) || !("next_cursor" in page)) throw new MemoryTransportError("invalid_response");
    const next = page.next_cursor;
    if (next !== null && (typeof next !== "string" || !next || seen.has(next) || seen.size >= 1e3)) throw new MemoryTransportError("invalid_pagination");
    if (next !== null) seen.add(next);
    yield page;
    if (next === null) return;
    cursor = next;
  }
}
var SixteenMemory = class {
  constructor({ baseUrl, apiKey, fetch: fetcher = (...args) => globalThis.fetch(...args), timeoutMs = 15e3, maxResponseBytes = 16 * 1024 * 1024 }) {
    let parsed;
    try {
      if (typeof baseUrl !== "string" || /[\x00-\x20]/.test(baseUrl)) throw Error();
      parsed = new URL(baseUrl);
    } catch {
      throw new MemoryTransportError("invalid_config");
    }
    const loopback = parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (!loopback && parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1 || apiKey !== void 0 && (typeof apiKey !== "string" || !/^[A-Za-z0-9_.-]{32,256}$/.test(apiKey))) {
      throw new MemoryTransportError("invalid_config");
    }
    this.baseUrl = parsed.origin + parsed.pathname.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.fetcher = fetcher;
    this.timeoutMs = timeoutMs;
    this.maxResponseBytes = maxResponseBytes;
  }
  /** @param {string} path @param {{method?: string, body?: unknown, signal?: AbortSignal}} options */
  async request(path, { method = "GET", body, signal } = {}) {
    if (signal?.aborted) throw new MemoryTransportError("aborted");
    if (typeof path !== "string" || !path.startsWith("/") || path.startsWith("//") || /[\\\r\n]/.test(path)) throw new MemoryTransportError("invalid_input");
    let serialized;
    try {
      serialized = body === void 0 ? void 0 : JSON.stringify(body);
    } catch {
      throw new MemoryTransportError("invalid_input");
    }
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
      if (!response.ok) {
        const code = typeof result?.error?.code === "string" && /^[a-z0-9_]{1,100}$/.test(result.error.code) ? result.error.code : "request_failed";
        throw new MemoryApiError(response.status, code, `SixteenMemory API error: ${code} (${response.status})`);
      }
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
  async *listPages(options = {}, call = {}) {
    yield* pages((cursor) => this.list({ ...options, cursor }, call), options.cursor);
  }
  async listAll(options = {}, call = {}) {
    const data = [];
    for await (const page of this.listPages(options, call)) data.push(...page.data);
    return data;
  }
  async *exportPages(options = {}, call = {}) {
    yield* pages((cursor) => this.exportPage({ ...options, cursor }, call), options.cursor);
  }
  async exportAll(options = {}, call = {}) {
    const data = [];
    for await (const page of this.exportPages(options, call)) data.push(...page.data);
    return data;
  }
  createConversation(input, call = {}) {
    return this.request("/v1/conversations", { ...call, method: "POST", body: input });
  }
  appendConversation(id, input, call = {}) {
    return this.request(`/v1/conversations/${encodeURIComponent(id)}/messages`, { ...call, method: "POST", body: input });
  }
  conversation(id, cursor = "", call = {}) {
    return this.request(`/v1/conversations/${encodeURIComponent(id)}?` + new URLSearchParams({ cursor }), call);
  }
  async *conversationPages(id, cursor = "", call = {}) {
    yield* pages((next) => this.conversation(id, next, call), cursor, "messages");
  }
  async conversationMessagesAll(id, call = {}) {
    const messages = [];
    for await (const page of this.conversationPages(id, "", call)) messages.push(...page.messages);
    return messages;
  }
  conversations(user_id, cursor = "", call = {}) {
    return this.request("/v1/conversations?" + new URLSearchParams({ user_id, cursor }), call);
  }
  async *conversationsPages(user_id, cursor = "", call = {}) {
    yield* pages((next) => this.conversations(user_id, next, call), cursor);
  }
  async conversationsAll(user_id, call = {}) {
    const data = [];
    for await (const page of this.conversationsPages(user_id, "", call)) data.push(...page.data);
    return data;
  }
  searchConversations(input, call = {}) {
    return this.request("/v1/conversations/search", { ...call, method: "POST", body: input });
  }
  deleteConversation(id, expected_version, call = {}) {
    return this.request(`/v1/conversations/${encodeURIComponent(id)}`, { ...call, method: "DELETE", body: { expected_version } });
  }
  organize(input, call = {}) {
    return this.request("/v1/knowledge/organize", { ...call, method: "POST", body: input });
  }
  knowledgeRuns(user_id, call = {}) {
    return this.request("/v1/knowledge/runs?" + new URLSearchParams({ user_id }), call);
  }
  knowledgeRun(id, call = {}) {
    return this.request(`/v1/knowledge/runs/${encodeURIComponent(id)}`, call);
  }
  resolveKnowledge(id, approve, call = {}) {
    return this.request(`/v1/knowledge/runs/${encodeURIComponent(id)}/resolve`, { ...call, method: "POST", body: { approve } });
  }
  wiki(user_id, call = {}) {
    return this.request("/v1/wiki?" + new URLSearchParams({ user_id }), call);
  }
  wikiPage(user_id, slug, call = {}) {
    return this.request(`/v1/wiki/${encodeURIComponent(slug)}?` + new URLSearchParams({ user_id }), call);
  }
  graph(user_id, call = {}) {
    return this.request("/v1/knowledge/graph?" + new URLSearchParams({ user_id }), call);
  }
  context(input, call = {}) {
    return this.request("/v1/context", { ...call, method: "POST", body: input });
  }
  searchEvidence(input, call = {}) {
    return this.request("/v1/evidence/search", { ...call, method: "POST", body: input });
  }
  reviewMemories(input, call = {}) {
    return this.request("/v1/memory-review", { ...call, method: "POST", body: input });
  }
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
  SixteenMemory
};
