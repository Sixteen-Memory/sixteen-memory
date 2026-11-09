import { SixteenMemory as StableClient } from "./client.mjs";
export { MemoryApiError, MemoryTransportError } from "./client.mjs";

// Preserve the original source API. Candidate methods are not in the release package.
export class SixteenMemory extends StableClient {
  createConversation(input, call = {}) { return this.request("/v1/conversations", { ...call, method: "POST", body: input }); }
  appendConversation(id, input, call = {}) { return this.request(`/v1/conversations/${encodeURIComponent(id)}/messages`, { ...call, method: "POST", body: input }); }
  conversation(id, cursor = "", call = {}) { return this.request(`/v1/conversations/${encodeURIComponent(id)}?` + new URLSearchParams({ cursor }), call); }
  conversations(user_id, cursor = "", call = {}) { return this.request("/v1/conversations?" + new URLSearchParams({ user_id, cursor }), call); }
  searchConversations(input, call = {}) { return this.request("/v1/conversations/search", { ...call, method: "POST", body: input }); }
  deleteConversation(id, expected_version, call = {}) { return this.request(`/v1/conversations/${encodeURIComponent(id)}`, { ...call, method: "DELETE", body: { expected_version } }); }
  organize(input, call = {}) { return this.request("/v1/knowledge/organize", { ...call, method: "POST", body: input }); }
  knowledgeRuns(user_id, call = {}) { return this.request("/v1/knowledge/runs?" + new URLSearchParams({ user_id }), call); }
  knowledgeRun(id, call = {}) { return this.request(`/v1/knowledge/runs/${encodeURIComponent(id)}`, call); }
  resolveKnowledge(id, approve, call = {}) { return this.request(`/v1/knowledge/runs/${encodeURIComponent(id)}/resolve`, { ...call, method: "POST", body: { approve } }); }
  wiki(user_id, call = {}) { return this.request("/v1/wiki?" + new URLSearchParams({ user_id }), call); }
  wikiPage(user_id, slug, call = {}) { return this.request(`/v1/wiki/${encodeURIComponent(slug)}?` + new URLSearchParams({ user_id }), call); }
  graph(user_id, call = {}) { return this.request("/v1/knowledge/graph?" + new URLSearchParams({ user_id }), call); }
  context(input, call = {}) { return this.request("/v1/context", { ...call, method: "POST", body: input }); }
  searchEvidence(input, call = {}) { return this.request("/v1/evidence/search", { ...call, method: "POST", body: input }); }
  reviewMemories(input, call = {}) { return this.request("/v1/memory-review", { ...call, method: "POST", body: input }); }
  ingest(input, call = {}) { return this.request("/v1/ingestions", { ...call, method: "POST", body: input }); }
  ingestion(id, call = {}) { return this.request(`/v1/ingestions/${encodeURIComponent(id)}`, call); }
  ingestions(user_id, call = {}) { return this.request("/v1/ingestions?" + new URLSearchParams({ user_id }), call); }
  resolveIngestion(id, approve, call = {}) { return this.request(`/v1/ingestions/${encodeURIComponent(id)}/resolve`, { ...call, method: "POST", body: { approve } }); }
  evidence(id, call = {}) { return this.request(`/v1/memories/${encodeURIComponent(id)}/evidence`, call); }
  reindex(user_id, cursor = "", call = {}) { return this.request("/v1/reindex", { ...call, method: "POST", body: { user_id, cursor } }); }
}
