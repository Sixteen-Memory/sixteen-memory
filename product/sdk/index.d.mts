// Private development client. This entry is not included in the stable SDK package.
import { SixteenMemory as StableClient } from "./client.mjs";
import type { CallOptions, ClientOptions, SearchInput, PageOptions, Answer } from "./client.mjs";
import type { MemoryInput, MemoryRecord, HistoryRecord, Source } from "../worker/domain";
import type { Decision, IngestionInput, ModelUsage, Plan, SearchResult } from "../worker/intelligence-domain";
import type { MemoryFilter } from "../worker/memory-filter";
import type { MemoryContext } from "../worker/memory-context";
import type { EvidenceSearch } from "../worker/evidence-index";
import type { MemoryReview } from "../worker/memory-review";
import type { Conversation, ConversationPage, Message } from "../worker/conversations";
import type { KnowledgeJob, KnowledgePage, KnowledgeEdge, WikiPage, StaleWikiPage, WikiListing } from "../worker/knowledge-domain";
import type { MediaIngestionInput } from "./service-types.js";
export type { MediaIngestionInput, MediaAnalysis, MediaMime } from "./service-types.js";
export type { MediaUploadInput, MediaUpload } from "./service-types.js";
export type { Conversation, ConversationPage, Message, KnowledgeJob, KnowledgePage, KnowledgeEdge, WikiPage, StaleWikiPage, WikiListing };
export type { MemoryContext, EvidenceSearch, MemoryReview };
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
  createConversation(input: { user_id: string; request_id: string; title: string; messages: Message[]; expires_at?: string | null }, call?: CallOptions): Promise<Conversation>;
  appendConversation(id: string, input: { request_id: string; expected_version: number; messages: Message[] }, call?: CallOptions): Promise<Conversation>;
  conversation(id: string, cursor?: string, call?: CallOptions): Promise<ConversationPage>;
  conversations(user_id: string, cursor?: string, call?: CallOptions): Promise<{ data: Conversation[]; next_cursor: string | null }>;
  searchConversations(input: { user_id: string; query: string; limit?: number }, call?: CallOptions): Promise<{ data: (Message & { conversation_id: string; conversation_version: number; title: string; score: number })[]; retrieval: string }>;
  deleteConversation(id: string, expected_version: number, call?: CallOptions): Promise<{ deleted: true; id: string }>;
  organize(input: { user_id: string; request_id: string; memory_ids?: string[]; conversation_ids?: string[]; mode?: "auto" | "review"; target_slugs?: string[] }, call?: CallOptions): Promise<KnowledgeJob & { usage?: ModelUsage[]; unsupported_items?: number[] }>;
  knowledgeRuns(user_id: string, call?: CallOptions): Promise<KnowledgeJob[]>;
  knowledgeRun(id: string, call?: CallOptions): Promise<KnowledgeJob>;
  resolveKnowledge(id: string, approve: boolean, call?: CallOptions): Promise<KnowledgeJob>;
  wiki(user_id: string, call?: CallOptions): Promise<WikiListing>;
  wikiPage(user_id: string, slug: string, call?: CallOptions): Promise<WikiPage>;
  graph(user_id: string, call?: CallOptions): Promise<{ nodes: { id: string; slug: string; title: string }[]; edges: KnowledgeEdge[] }>;
  context(input: DevelopmentSearchInput & { user_id: string; max_chars?: number; include_evidence?: boolean }, call?: CallOptions): Promise<MemoryContext & { usage: ModelUsage[] }>;
  searchEvidence(input: Pick<DevelopmentSearchInput, "query" | "limit" | "filter" | "at"> & { user_id: string }, call?: CallOptions): Promise<EvidenceSearch>;
  reviewMemories(input: { user_id: string; stale_before?: string }, call?: CallOptions): Promise<MemoryReview>;
  health(call?: CallOptions): Promise<{ status: "ok"; version: string; retrieval: string; extraction: string; media_ingestion?: "assisted" | "disabled"; media_upload?: { enabled: boolean; max_bytes: number; max_seconds: number; part_bytes: number }; model_configured: boolean }>;
  add(input: MemoryInput & { request_id: string }, call?: CallOptions): Promise<MemoryRecord>;
  get(id: string, call?: CallOptions): Promise<MemoryRecord>;
  list(options?: DevelopmentPageOptions, call?: CallOptions): Promise<{ data: MemoryRecord[]; next_cursor: string | null }>;
  update(id: string, input: Omit<MemoryInput, "user_id"> & { expected_version: number; reason: string }, call?: CallOptions): Promise<MemoryRecord>;
  history(id: string, call?: CallOptions): Promise<HistoryRecord[]>;
  search(input: DevelopmentSearchInput, call?: CallOptions): Promise<SearchResult>;
  answer(input: DevelopmentSearchInput, call?: CallOptions): Promise<Answer>;
  exportPage(options?: DevelopmentPageOptions, call?: CallOptions): Promise<{ data: MemoryRecord[]; next_cursor: string | null; exported_at: string }>;
  ingest(input: Omit<IngestionInput, "expires_at" | "mode"> & { expires_at?: string | null; mode?: "review" | "auto" }, call?: CallOptions): Promise<IngestionJob>;
  ingestMedia(input: MediaIngestionInput, call?: CallOptions): Promise<IngestionJob>;
  ingestion(id: string, call?: CallOptions): Promise<IngestionJob>;
  ingestions(user_id: string, call?: CallOptions): Promise<IngestionJob[]>;
  resolveIngestion(id: string, approve: boolean, call?: CallOptions): Promise<IngestionJob>;
  evidence(id: string, call?: CallOptions): Promise<{ primary: Source; version: number; supporting: { source: Source; memory_version: number }[] }>;
  reindex(user_id: string, cursor?: string, call?: CallOptions): Promise<{ indexed: number; next_cursor: string | null; usage: ModelUsage[] }>;
}
export declare const SixteenMemory: { new(options: ClientOptions): SixteenMemory; prototype: SixteenMemory };
