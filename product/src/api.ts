import { SixteenMemory as DevelopmentClient } from "../sdk/index.mjs";
import type { IngestionJob, RetrievalMode, DevelopmentPageOptions } from "../sdk/index.mjs";
import { SixteenMemory } from "../sdk/client.mjs";
import type { Identity, CreateKeyInput } from "../sdk/client.mjs";
import type { AuditRecord, HistoryRecord, KeyRecord, MemoryInput, MemoryRecord } from "../worker/domain";

const client = new SixteenMemory({ baseUrl: "", apiKey: undefined, timeoutMs: 115000 });
const development = new DevelopmentClient({ baseUrl: "", apiKey: undefined, timeoutMs: 115000 });
export type Session = Identity;
export type { IngestionJob, RetrievalMode };
export interface Page { data: MemoryRecord[]; next_cursor: string | null }
export const api = {
  me: (): Promise<Session> => client.me(),
  login: (api_key: string): Promise<Session> => client.login(api_key),
  logout: () => client.logout(),
  list: (filters: DevelopmentPageOptions): Promise<Page> => development.list(filters),
  add: (input: MemoryInput & { request_id: string }): Promise<MemoryRecord> => development.add(input),
  update: (id: string, input: MemoryInput & { expected_version: number; reason: string }): Promise<MemoryRecord> => development.update(id, input),
  history: (id: string): Promise<HistoryRecord[]> => development.history(id),
  revoke: (id: string, version: number, reason: string) => client.revoke(id, version, reason),
  delete: (id: string, version: number) => client.delete(id, version),
  search: (query: string, user_id: string, mode: RetrievalMode = "lexical") => development.search({ query, user_id, limit: 10, mode }),
  ingest: (input: Parameters<DevelopmentClient["ingest"]>[0]) => development.ingest(input),
  ingestions: (user_id: string) => development.ingestions(user_id),
  resolveIngestion: (id: string, approve: boolean) => development.resolveIngestion(id, approve),
  reindex: (user_id: string, cursor = "") => development.reindex(user_id, cursor),
  evidence: (id: string) => development.evidence(id),
  answer: (query: string, user_id: string, mode: RetrievalMode = "lexical") => development.answer({ query, user_id, limit: 10, mode }),
  keys: (): Promise<KeyRecord[]> => client.keys(),
  createKey: (input: CreateKeyInput): Promise<{ key: string; record: KeyRecord }> => client.createKey(input),
  revokeKey: (id: string) => client.revokeKey(id),
  requests: (): Promise<AuditRecord[]> => client.requests(),
  exportPage: (filters: DevelopmentPageOptions): Promise<Page> => development.exportPage(filters),
};
export const errorMessage = (error: unknown) => error instanceof Error ? error.message : "请求失败，请稍后重试";
