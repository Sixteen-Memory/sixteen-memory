/** Standalone v0.3 service types. Core OpenAPI remains in schema.d.ts. */
import type { components } from "./schema.js";
export type Source = components["schemas"]["Source"];
export type Metadata = Record<string, string | number | boolean | null>;
export interface MemoryAttributes {
  metadata?: Metadata; category?: string | null; event_time?: string | null;
  valid_from?: string | null; valid_to?: string | null;
}
export type Memory = components["schemas"]["Memory"] & MemoryAttributes & { origin?: "explicit" | "extracted"; fact_key?: string | null };
export type MemoryFilter = { AND: MemoryFilter[] } | { OR: MemoryFilter[] } | { NOT: MemoryFilter } |
  { field: string; op: "eq" | "ne" | "in" | "gt" | "gte" | "lt" | "lte" | "exists"; value: string | number | boolean | null | (string | number | boolean | null)[] };
export type RetrievalMode = "lexical" | "semantic" | "hybrid";
export type ModelUsage = { stage: string; model: string; input_tokens: number | null; output_tokens: number | null; duration_ms: number };
export type SearchResult = {
  data: (Memory & { score: number; signals?: Record<string, number> })[]; retrieval?: string;
  coverage?: { indexed: number; active: number }; degraded?: boolean; warning?: string; usage?: ModelUsage[];
};
export type ContextMemory = Pick<Memory, "id" | "version" | "content" | "fact_key"> & { sources: Source[] };
export type MemoryContext = {
  context: string; memories: ContextMemory[]; retrieval: string;
  budget: { unit: "utf16_characters"; limit: number; used: number };
  candidate_count: number; omitted_count: number; truncated: boolean;
  degraded?: boolean; warning?: string; usage?: ModelUsage[];
};
export type EvidenceHit = { memory_id: string; memory_version: number; user_id: string; content: string; source: Source; kind: "primary" | "supporting"; score: number };
export type EvidenceSearch = { data: EvidenceHit[]; retrieval: "evidence_lexical" };
export type MemoryReview = {
  checked_at: string; stale_before: string; scanned: number; changed: 0;
  findings: { kind: "duplicate_content" | "slot_conflict" | "old_evidence"; memories: { id: string; version: number }[]; fact_key?: string }[];
  finding_count: number; truncated: boolean;
};
export type Message = { id: string; role: "user" | "assistant" | "system" | "tool"; content: string; observed_at: string };
export type Conversation = { id: string; user_id: string; title: string; version: number; created_at: string; updated_at: string; expires_at: string | null };
export type ConversationPage = Conversation & { messages: Message[]; next_cursor: string | null };
export type KnowledgeSource = { key: string; kind: "memory" | "conversation"; id: string; version: number; message_id?: string; role: string; text: string; observed_at?: string; source_type?: string; ref?: string };
export type Citation = { source_key: string; quote: string };
export type KnowledgePage = { slug: string; title: string; claims: { text: string; citations: Citation[]; status?: "reported" | "conflicted"; conflict_group?: string }[] };
export type WikiPage = KnowledgePage & { id: string; user_id: string; run_id: string; created_at: string; state: "active"; has_conflicts: boolean; sources: Omit<KnowledgeSource, "text">[] };
export type StaleWikiPage = { id: string; slug: string; title: string; state: "stale"; stale_at: string; reason: "source_changed"; sources: Omit<KnowledgeSource, "text">[] };
export type WikiListing = { data: WikiPage[]; stale: StaleWikiPage[] };
export type KnowledgeEdge = { from: string; to: string; relation: "related" | "supports" | "conflicts"; citations: Citation[] };
export type KnowledgePlan = { pages: KnowledgePage[]; edges: KnowledgeEdge[]; sources: KnowledgeSource[]; unsupported_items?: number[] };
export type KnowledgeJob = { id: string; user_id: string; state: string; proposal: KnowledgePlan | null; error: string | null; created_at: string; expires_at: string; target_slugs?: string[] | null };
export type IngestionInput = MemoryAttributes & {
  user_id: string; request_id: string; ref: string; observed_at: string;
  messages: { id: string; role: "user" | "assistant"; content: string }[];
  mode?: "review" | "auto"; expires_at?: string | null;
};
export type MediaMime = "audio/wav" | "audio/mpeg" | "video/mp4";
export type MediaSegment = {
  id: string; start_ms: number | null; end_ms: number | null;
  speaker: string | null; kind: "speech" | "visual"; text: string;
};
export type MediaAnalysis = {
  sha256: string; mime_type: MediaMime; model: string;
  interpretation: "model_generated"; segments: MediaSegment[]; warnings: string[];
};
export type MediaIngestionInput = MemoryAttributes & {
  user_id: string; request_id: string; ref: string; observed_at: string;
  media: { mime_type: MediaMime; data_base64: string };
  consent: true; mode?: "review"; expires_at?: string | null;
};
export type MediaUploadInput = Omit<MediaIngestionInput, "media"> & { mime_type: MediaMime; size_bytes: number };
export type MediaUpload = { id: string; user_id: string; state: string; size_bytes: number; received_bytes: number;
  part_size: number; next_part: number; expires_at: string; ingestion_id: string | null; error: string | null };
export type IngestionDecision = {
  fact: { content: string; fact_key: string; source: Source; confidence: number };
  action: "add" | "merge" | "supersede"; target_id?: string; target_version?: number;
  reason: string; needs_review: boolean; review_reasons?: string[];
};
export type IngestionJob = {
  id: string; user_id: string; state: string; expires_at: string;
  results: { memory_id: string; action: string }[];
  proposal: (MemoryAttributes & { user_id: string; request_id: string; epoch: number; decisions: IngestionDecision[]; expires_at: string | null; media?: MediaAnalysis }) | null;
  usage?: ModelUsage[]; slot_revision?: string; replay?: boolean;
};
