import type { components, operations } from "./schema.js";
export type { components, operations, paths } from "./schema.js";

type ResponseFor<K extends keyof operations> = operations[K]["responses"][200]["content"]["application/json"];
type BodyFor<K extends keyof operations> = operations[K] extends {
  requestBody: { content: { "application/json": infer T } };
} ? T : never;

export type Memory = components["schemas"]["Memory"];
export type Source = components["schemas"]["Source"];
export type CreateMemoryInput = BodyFor<"add">;
export type UpdateMemoryInput = BodyFor<"update">;
export type SearchInput = BodyFor<"search">;
export type PageOptions = NonNullable<operations["list"]["parameters"]["query"]>;
export type SearchResult = ResponseFor<"search">;
export type MemoryPage = ResponseFor<"list">;
export type ExportPage = ResponseFor<"exportPage">;
export type HistoryEntry = components["schemas"]["HistoryEntry"];
export type CreateKeyInput = BodyFor<"createKey">;
export type Identity = ResponseFor<"me">;
export type KeyRecord = components["schemas"]["KeyRecord"];
export type AuditEntry = components["schemas"]["AuditEntry"];
export type Answer = ResponseFor<"answer">;
export type DeleteResult = ResponseFor<"delete">;
export interface CallOptions { signal?: AbortSignal }
export type Fetch = (input: string, init: RequestInit) => Promise<Response>;
export interface ClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetch?: Fetch;
  timeoutMs?: number;
  /** Defaults to 16 MiB. Framework adapters use a smaller context-oriented limit. */
  maxResponseBytes?: number;
}
export declare class MemoryTransportError extends Error {
  code: string;
  constructor(code: string);
}
export declare class MemoryApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string);
}
export declare class SixteenMemory {
  constructor(options: ClientOptions);
  baseUrl: string;
  apiKey: string | undefined;
  fetcher: Fetch;
  timeoutMs: number;
  maxResponseBytes: number;
  /** Low-level escape hatch. Response shape must be checked by the caller. */
  request(path: string, options?: { method?: string; body?: unknown; signal?: AbortSignal }): Promise<unknown>;
  health(call?: CallOptions): Promise<ResponseFor<"health">>;
  me(call?: CallOptions): Promise<Identity>;
  /** Same-origin console cookies only; Node callers must supply their own cookie transport. */
  login(apiKey: string, call?: CallOptions): Promise<ResponseFor<"login">>;
  logout(call?: CallOptions): Promise<ResponseFor<"logout">>;
  add(input: CreateMemoryInput, call?: CallOptions): Promise<Memory>;
  get(id: string, call?: CallOptions): Promise<Memory>;
  list(options?: PageOptions, call?: CallOptions): Promise<MemoryPage>;
  search(input: SearchInput, call?: CallOptions): Promise<SearchResult>;
  update(id: string, input: UpdateMemoryInput, call?: CallOptions): Promise<Memory>;
  history(id: string, call?: CallOptions): Promise<HistoryEntry[]>;
  revoke(id: string, expected_version: number, reason: string, call?: CallOptions): Promise<Memory>;
  delete(id: string, expected_version: number, call?: CallOptions): Promise<DeleteResult>;
  exportPage(options?: PageOptions, call?: CallOptions): Promise<ExportPage>;
  /** Requires a configured provider; may incur costs. Never called automatically. */
  answer(input: SearchInput, call?: CallOptions): Promise<Answer>;
  keys(call?: CallOptions): Promise<KeyRecord[]>;
  createKey(input: CreateKeyInput, call?: CallOptions): Promise<ResponseFor<"createKey">>;
  revokeKey(id: string, call?: CallOptions): Promise<ResponseFor<"revokeKey">>;
  requests(call?: CallOptions): Promise<AuditEntry[]>;
}
