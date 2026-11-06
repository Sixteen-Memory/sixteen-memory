import { SixteenMemory } from "../sdk/index.mjs";
import type { AuditRecord, HistoryRecord, KeyRecord, MemoryInput, MemoryRecord } from "../worker/domain";

const client = new SixteenMemory({ baseUrl: "", apiKey: undefined, timeoutMs: 115000 });
export interface Session { key_id: string; role: "admin" | "read" | "write"; user_id: string | null; project_id: string }
export interface Page { data: MemoryRecord[]; next_cursor: string | null }
export const api = {
  me: (): Promise<Session> => client.request("/v1/me"),
  login: (api_key: string): Promise<Session> => client.request("/v1/session", { method: "POST", body: { api_key } }),
  logout: () => client.request("/v1/session", { method: "DELETE" }),
  list: (filters: Record<string, string>): Promise<Page> => client.list(filters),
  add: (input: MemoryInput & { request_id: string }): Promise<MemoryRecord> => client.add(input),
  update: (id: string, input: MemoryInput & { expected_version: number; reason: string }): Promise<MemoryRecord> => client.update(id, input),
  history: (id: string): Promise<HistoryRecord[]> => client.history(id),
  revoke: (id: string, version: number, reason: string) => client.revoke(id, version, reason),
  delete: (id: string, version: number) => client.delete(id, version),
  search: (query: string, user_id: string, mode = "lexical"): Promise<{ data: (MemoryRecord & { score: number })[]; retrieval: string; coverage?: { indexed: number; active: number } }> => client.search({ query, user_id, limit: 10, mode }),
  ingest: (input: Record<string, unknown>) => client.ingest(input),
  ingestions: (user_id: string) => client.ingestions(user_id),
  resolveIngestion: (id: string, approve: boolean) => client.resolveIngestion(id, approve),
  reindex: (user_id: string, cursor = "") => client.reindex(user_id, cursor),
  evidence: (id: string) => client.evidence(id),
  answer: (query: string, user_id: string, mode = "lexical"): Promise<{ answer: string; model: string; usage: unknown }> => client.answer({ query, user_id, limit: 10, mode }),
  keys: (): Promise<KeyRecord[]> => client.request("/v1/keys"),
  createKey: (input: { name: string; user_id: string; role: string }): Promise<{ key: string; record: KeyRecord }> => client.request("/v1/keys", { method: "POST", body: input }),
  revokeKey: (id: string) => client.request(`/v1/keys/${id}`, { method: "DELETE" }),
  requests: (): Promise<AuditRecord[]> => client.request("/v1/requests"),
  exportPage: (filters: Record<string, string>): Promise<Page> => client.exportPage(filters),
};
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : "请求失败，请稍后重试";
