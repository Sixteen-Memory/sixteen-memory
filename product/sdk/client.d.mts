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
export type Fetch = (input: string, init: RequestInit) => Promise<Response>;
export interface ClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetch?: Fetch;
  timeoutMs?: number;
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
  /** Low-level escape hatch. Response shape must be checked by the caller. */
  request(path: string, options?: { method?: string; body?: unknown }): Promise<unknown>;
  health(): Promise<ResponseFor<"health">>;
  me(): Promise<ResponseFor<"me">>;
  add(input: CreateMemoryInput): Promise<Memory>;
  get(id: string): Promise<Memory>;
  list(options?: PageOptions): Promise<MemoryPage>;
  search(input: SearchInput): Promise<SearchResult>;
  update(id: string, input: UpdateMemoryInput): Promise<Memory>;
  history(id: string): Promise<HistoryEntry[]>;
  revoke(id: string, expected_version: number, reason: string): Promise<Memory>;
  delete(id: string, expected_version: number): Promise<ResponseFor<"delete">>;
  exportPage(options?: PageOptions): Promise<ExportPage>;
  /** Requires a configured provider; may incur costs. Never called automatically. */
  answer(input: SearchInput): Promise<ResponseFor<"answer">>;
  keys(): Promise<ResponseFor<"keys">>;
  createKey(input: CreateKeyInput): Promise<ResponseFor<"createKey">>;
  revokeKey(id: string): Promise<ResponseFor<"revokeKey">>;
  requests(): Promise<ResponseFor<"requests">>;
}
