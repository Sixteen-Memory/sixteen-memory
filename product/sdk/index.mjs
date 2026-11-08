import { SixteenMemory as StableClient } from "./client.mjs";
export { MemoryApiError } from "./client.mjs";

// Preserve the original source API. Candidate methods are not in the release package.
export class SixteenMemory extends StableClient {
  ingest(input) { return this.request("/v1/ingestions", { method: "POST", body: input }); }
  ingestion(id) { return this.request(`/v1/ingestions/${encodeURIComponent(id)}`); }
  ingestions(user_id) { return this.request("/v1/ingestions?" + new URLSearchParams({ user_id })); }
  resolveIngestion(id, approve) { return this.request(`/v1/ingestions/${encodeURIComponent(id)}/resolve`, { method: "POST", body: { approve } }); }
  evidence(id) { return this.request(`/v1/memories/${encodeURIComponent(id)}/evidence`); }
  reindex(user_id, cursor = "") { return this.request("/v1/reindex", { method: "POST", body: { user_id, cursor } }); }
}
