import type { MemoryAttributes, MemoryFilter, RetrievalMode, ModelUsage, Message, Conversation, ConversationPage, KnowledgeJob, KnowledgePage, KnowledgeEdge, MemoryContext, EvidenceSearch, MemoryReview, IngestionInput, IngestionJob, MediaIngestionInput } from "./service-types.js";
export type * from "./service-types.js";
import type { components, operations } from "./schema.js";
export type { components, operations, paths } from "./schema.js";

type ResponseFor<K extends keyof operations> = operations[K]["responses"][200]["content"]["application/json"];
type BodyFor<K extends keyof operations> = operations[K] extends {
  requestBody: { content: { "application/json": infer T } };
} ? T : never;

export type Memory = import("./service-types.js").Memory;
export type Source = components["schemas"]["Source"];
export type CreateMemoryInput = BodyFor<"add"> & MemoryAttributes;
export type UpdateMemoryInput = BodyFor<"update"> & MemoryAttributes;
export type SearchInput = BodyFor<"search"> & { mode?: RetrievalMode; filter?: MemoryFilter; at?: string; fallback?: "error" | "lexical"; threshold?: number };
export type PageOptions = NonNullable<operations["list"]["parameters"]["query"]> & { filter?: MemoryFilter; at?: string };
export type SearchResult = import("./service-types.js").SearchResult;
export type MemoryPage = { data: Memory[]; next_cursor: string | null };
export type ExportPage = MemoryPage & { exported_at: string };
export type HistoryEntry = components["schemas"]["HistoryEntry"] & MemoryAttributes;
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
  health(call?: CallOptions): Promise<{ status: "ok"; version: string; retrieval: string; extraction: string; media_ingestion?: "assisted" | "disabled"; media_upload?: { enabled: boolean; max_bytes: number; max_seconds: number; part_bytes: number }; model_configured: boolean }>;
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

  listPages(options?: PageOptions, call?: CallOptions): AsyncGenerator<MemoryPage>;
  listAll(options?: PageOptions, call?: CallOptions): Promise<Memory[]>;
  exportPages(options?: PageOptions, call?: CallOptions): AsyncGenerator<ExportPage>;
  exportAll(options?: PageOptions, call?: CallOptions): Promise<Memory[]>;
  createConversation(input: { user_id: string; request_id: string; title: string; messages: Message[]; expires_at?: string | null }, call?: CallOptions): Promise<Conversation>;
  appendConversation(id: string, input: { request_id: string; expected_version: number; messages: Message[] }, call?: CallOptions): Promise<Conversation>;
  conversation(id: string, cursor?: string, call?: CallOptions): Promise<ConversationPage>;
  conversationPages(id: string, cursor?: string, call?: CallOptions): AsyncGenerator<ConversationPage>;
  conversationMessagesAll(id: string, call?: CallOptions): Promise<Message[]>;
  conversations(user_id: string, cursor?: string, call?: CallOptions): Promise<{ data: Conversation[]; next_cursor: string | null }>;
  conversationsPages(user_id: string, cursor?: string, call?: CallOptions): AsyncGenerator<{ data: Conversation[]; next_cursor: string | null }>;
  conversationsAll(user_id: string, call?: CallOptions): Promise<Conversation[]>;
  searchConversations(input: { user_id: string; query: string; limit?: number }, call?: CallOptions): Promise<{ data: (Message & { conversation_id: string; conversation_version: number; title: string; score: number })[]; retrieval: string }>;
  deleteConversation(id: string, expected_version: number, call?: CallOptions): Promise<{ deleted: true; id: string }>;
  organize(input: { user_id: string; request_id: string; memory_ids?: string[]; conversation_ids?: string[]; mode?: "auto" | "review" }, call?: CallOptions): Promise<KnowledgeJob & { usage?: ModelUsage[]; unsupported_items?: number[] }>;
  knowledgeRuns(user_id: string, call?: CallOptions): Promise<KnowledgeJob[]>;
  knowledgeRun(id: string, call?: CallOptions): Promise<KnowledgeJob>;
  resolveKnowledge(id: string, approve: boolean, call?: CallOptions): Promise<KnowledgeJob>;
  wiki(user_id: string, call?: CallOptions): Promise<{ data: (KnowledgePage & { id: string; user_id: string; run_id: string })[] }>;
  wikiPage(user_id: string, slug: string, call?: CallOptions): Promise<KnowledgePage & { id: string; user_id: string; run_id: string }>;
  graph(user_id: string, call?: CallOptions): Promise<{ nodes: { id: string; slug: string; title: string }[]; edges: KnowledgeEdge[] }>;
  context(input: SearchInput & { user_id: string; max_chars?: number; include_evidence?: boolean }, call?: CallOptions): Promise<MemoryContext>;
  searchEvidence(input: Pick<SearchInput, "query" | "limit" | "filter" | "at"> & { user_id: string }, call?: CallOptions): Promise<EvidenceSearch>;
  reviewMemories(input: { user_id: string; stale_before?: string }, call?: CallOptions): Promise<MemoryReview>;
  ingest(input: IngestionInput, call?: CallOptions): Promise<IngestionJob>;
  /** Sends a clip to the configured provider. Always creates a review proposal; use a timeout above 60 seconds. */
  ingestMedia(input: MediaIngestionInput, call?: CallOptions): Promise<IngestionJob>;
  createMediaUpload(input: import("./service-types.js").MediaUploadInput, call?: CallOptions): Promise<import("./service-types.js").MediaUpload>;
  mediaUpload(id: string, call?: CallOptions): Promise<import("./service-types.js").MediaUpload>;
  uploadMediaPart(id: string, part: number, bytes: Uint8Array | ArrayBuffer | Blob, call?: CallOptions): Promise<import("./service-types.js").MediaUpload>;
  completeMediaUpload(id: string, call?: CallOptions): Promise<import("./service-types.js").MediaUpload>;
  cancelMediaUpload(id: string, call?: CallOptions): Promise<import("./service-types.js").MediaUpload>;
  uploadMedia(input: import("./service-types.js").MediaUploadInput, blob: Blob, call?: CallOptions): Promise<import("./service-types.js").MediaUpload>;
  ingestion(id: string, call?: CallOptions): Promise<IngestionJob>;
  ingestions(user_id: string, call?: CallOptions): Promise<IngestionJob[]>;
  resolveIngestion(id: string, approve: boolean, call?: CallOptions): Promise<IngestionJob>;
  evidence(id: string, call?: CallOptions): Promise<{ primary: Source; version: number; supporting: { source: Source; memory_version: number }[] }>;
  reindex(user_id: string, cursor?: string, call?: CallOptions): Promise<{ indexed: number; next_cursor: string | null; usage: ModelUsage[] }>;
}
