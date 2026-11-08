// Private development client. This entry is not included in the stable SDK package.
import { SixteenMemory as StableClient } from "./client.mjs";
import type { CallOptions, ClientOptions, SearchInput, PageOptions, Answer } from "./client.mjs";
import type { MemoryInput, MemoryRecord, HistoryRecord, Source } from "../worker/domain";
import type { Decision, IngestionInput, ModelUsage, Plan, SearchResult } from "../worker/intelligence-domain";
import type { MemoryFilter } from "../worker/memory-filter";
export { MemoryApiError, MemoryTransportError } from "./client.mjs";
export type RetrievalMode = "lexical" | "semantic" | "hybrid";
export type DevelopmentSearchInput = SearchInput & {
  mode?: RetrievalMode; filter?: MemoryFilter; at?: string;
  fallback?: "error" | "lexical"; threshold?: number;
};
export type DevelopmentPageOptions = PageOptions & { filter?: MemoryFilter; at?: string };
export interface IngestionJob {
  id: string; user_id: string; state: string; expires_at: string;
  results: { memory_id: string; action: string }[];
  proposal: (Omit<Plan, "decisions"> & { decisions: Omit<Decision, "vector">[] }) | null;
  usage?: ModelUsage[]; slot_revision?: string; replay?: boolean;
}
type Overridden = "health" | "add" | "get" | "list" | "update" | "history" | "search" | "answer" | "exportPage";
export interface SixteenMemory extends Omit<StableClient, Overridden> {
  health(call?: CallOptions): Promise<{ status: "ok"; version: string; retrieval: string; extraction: string; model_configured: boolean }>;
  add(input: MemoryInput & { request_id: string }, call?: CallOptions): Promise<MemoryRecord>;
  get(id: string, call?: CallOptions): Promise<MemoryRecord>;
  list(options?: DevelopmentPageOptions, call?: CallOptions): Promise<{ data: MemoryRecord[]; next_cursor: string | null }>;
  update(id: string, input: Omit<MemoryInput, "user_id"> & { expected_version: number; reason: string }, call?: CallOptions): Promise<MemoryRecord>;
  history(id: string, call?: CallOptions): Promise<HistoryRecord[]>;
  search(input: DevelopmentSearchInput, call?: CallOptions): Promise<SearchResult>;
  answer(input: DevelopmentSearchInput, call?: CallOptions): Promise<Answer>;
  exportPage(options?: DevelopmentPageOptions, call?: CallOptions): Promise<{ data: MemoryRecord[]; next_cursor: string | null; exported_at: string }>;
  ingest(input: Omit<IngestionInput, "expires_at" | "mode"> & { expires_at?: string | null; mode?: "review" | "auto" }, call?: CallOptions): Promise<IngestionJob>;
  ingestion(id: string, call?: CallOptions): Promise<IngestionJob>;
  ingestions(user_id: string, call?: CallOptions): Promise<IngestionJob[]>;
  resolveIngestion(id: string, approve: boolean, call?: CallOptions): Promise<IngestionJob>;
  evidence(id: string, call?: CallOptions): Promise<{ primary: Source; version: number; supporting: { source: Source; memory_version: number }[] }>;
  reindex(user_id: string, cursor?: string, call?: CallOptions): Promise<{ indexed: number; next_cursor: string | null; usage: ModelUsage[] }>;
}
export declare const SixteenMemory: { new(options: ClientOptions): SixteenMemory; prototype: SixteenMemory };
