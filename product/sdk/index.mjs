import { SixteenMemory as StableClient } from "./client.mjs";
export { MemoryApiError, MemoryTransportError } from "./client.mjs";

// Preserve the original source API. Candidate methods are not in the release package.
export class SixteenMemory extends StableClient {
  ingest(input, call = {}) { return this.request("/v1/ingestions", { ...call, method: "POST", body: input }); }
  ingestion(id, call = {}) { return this.request(`/v1/ingestions/${encodeURIComponent(id)}`, call); }
  ingestions(user_id, call = {}) { return this.request("/v1/ingestions?" + new URLSearchParams({ user_id }), call); }
  resolveIngestion(id, approve, call = {}) { return this.request(`/v1/ingestions/${encodeURIComponent(id)}/resolve`, { ...call, method: "POST", body: { approve } }); }
  evidence(id, call = {}) { return this.request(`/v1/memories/${encodeURIComponent(id)}/evidence`, call); }
  reindex(user_id, cursor = "", call = {}) { return this.request("/v1/reindex", { ...call, method: "POST", body: { user_id, cursor } }); }
}
