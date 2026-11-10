import { date, fail, identifier, memoryInput, object, text, type MemoryAttributes, type MemoryInput, type MemoryRecord, type Source } from "./domain";
import { canonicalFactKey, registeredFactKey } from "./fact-slots";
import { providedAttributes } from "./memory-attributes";
import type { MediaAnalysis } from "./media-domain";

export const MAX_FACTS = 8;
export const MAX_VECTOR_DIMENSIONS = 2048;
export const MAX_SEMANTIC_RECORDS = 1000;
export type Vector = { model: string; values: number[] };
export type Fact = { content: string; fact_key: string; source: Source; confidence: number };
export type Decision = {
  fact: Fact; action: "add" | "merge" | "supersede"; target_id?: string;
  target_version?: number; reason: string; needs_review: boolean; vector?: Vector;
  review_reasons?: string[];
};
export type Plan = MemoryAttributes & { user_id: string; request_id: string; epoch: number; decisions: Decision[]; expires_at: string | null; media?: MediaAnalysis };
export type IngestionInput = MemoryAttributes & {
  user_id: string; request_id: string; ref: string; observed_at: string;
  messages: { id: string; role: "user" | "assistant"; content: string }[];
  mode: "review" | "auto"; expires_at: string | null;
};
export type ModelUsage = { stage: string; model: string; input_tokens: number | null; output_tokens: number | null; duration_ms: number };
export type SearchResult = { data: (MemoryRecord & { score: number; signals?: Record<string, number> })[]; retrieval: string; coverage?: { indexed: number; active: number }; degraded?: boolean; warning?: string };

export function validateVector(input: unknown): Vector {
  const data = object(input);
  const model = text(data.model, "向量模型标识", 200);
  const values = data.values;
  if (!Array.isArray(values) || !values.length || values.length > MAX_VECTOR_DIMENSIONS ||
    !values.every(n => typeof n === "number" && Number.isFinite(n) && Math.abs(n) <= 1e6)) {
    fail(502, "invalid_embedding", "向量响应格式无效");
  }
  const norm = Math.hypot(...values);
  if (!Number.isFinite(norm) || norm <= 0) fail(502, "invalid_embedding", "向量不能为零");
  return { model, values: values.map(n => n / norm) };
}
export const normalizedFact = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[\p{P}\p{Z}\s]/gu, "");
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) fail(409, "embedding_mismatch", "向量维度不一致，请重建索引");
  return a.reduce((sum, x, i) => sum + x * b[i], 0);
}
export function ingestionInput(value: unknown): IngestionInput {
  const data = object(value);
  if (!Array.isArray(data.messages) || !data.messages.length || data.messages.length > 32) fail(422, "invalid_messages", "需要1至32条对话消息");
  const messages = data.messages.map((v, i) => {
    const m = object(v);
    if (m.role !== "user" && m.role !== "assistant") fail(422, "invalid_role", "对话只接受 user 或 assistant，业务事件请使用显式写入接口");
    return { id: identifier(m.id ?? `m${i + 1}`, "消息ID"), role: m.role as "user" | "assistant", content: text(m.content, "消息内容", 8000) };
  });
  if (new Set(messages.map(m => m.id)).size !== messages.length) fail(422, "duplicate_message", "消息ID必须唯一");
  if (messages.reduce((n, m) => n + m.content.length, 0) > 16000) fail(422, "message_limit", "对话总长度不能超过16000字符");
  const mode = data.mode ?? "review";
  if (mode !== "review" && mode !== "auto") fail(422, "invalid_mode", "mode 必须是 review 或 auto");
  const now = date(data.observed_at, "对话时间");
  if (Date.parse(now) > Date.now() + 300_000) fail(422, "future_evidence", "对话时间不能晚于当前时间");
  const checked = memoryInput({
    user_id: data.user_id, content: messages.map(m => m.content).join("\n").slice(0, 8000),
    source: { type: "conversation", ref: data.ref, observed_at: now, text: messages.map(m => m.content).join("\n").slice(0, 8000) },
    expires_at: data.expires_at,
  });
  // Check every message, not just the first 8,000 characters.
  for (const m of messages) memoryInput({ ...checked, content: m.content, source: { ...checked.source, text: m.content } });
  return { user_id: checked.user_id, request_id: identifier(data.request_id, "请求标识"), ref: checked.source.ref, observed_at: now, messages, mode, expires_at: checked.expires_at, ...providedAttributes(data) };
}
export function extractedFacts(value: unknown, input: IngestionInput): Fact[] {
  const data = object(value);
  if (!Array.isArray(data.facts) || data.facts.length > MAX_FACTS) fail(502, "invalid_extraction", "抽取结果必须为最多8条事实");
  const facts = data.facts.map(value => {
    const f = object(value);
    const content = text(f.content, "抽取内容", 1000);
    const fact_key = canonicalFactKey(identifier(f.fact_key, "事实槽位"));
    if (typeof f.confidence !== "number" || !Number.isFinite(f.confidence) || f.confidence < 0 || f.confidence > 1) fail(502, "invalid_extraction", "抽取可信度无效");
    if (!Array.isArray(f.evidence) || !f.evidence.length || f.evidence.length > 4) fail(502, "invalid_evidence", "抽取结果缺少依据");
    const quotes = f.evidence.map(value => {
      const e = object(value);
      const message = input.messages.find(m => m.id === e.message_id);
      const quote = text(e.quote, "原文引用", 2000);
      if (!message || message.role !== "user" || !message.content.includes(quote)) fail(502, "ungrounded_fact", "抽取依据不是用户消息中的原文");
      return { id: message.id, quote };
    });
    const source: Source = { type: "conversation", ref: input.ref, text: quotes.map(q => `[${q.id}] ${q.quote}`).join("\n"), observed_at: input.observed_at };
    memoryInput({ user_id: input.user_id, content, source, expires_at: input.expires_at });
    return { content, fact_key, source, confidence: f.confidence };
  });
  if (new Set(facts.map(f => f.fact_key)).size !== facts.length) fail(502, "ambiguous_batch", "同一批对话包含重复事实槽位，请缩小到明确的一次状态变化");
  return facts;
}
export function maintenanceDecisions(facts: Fact[], candidates: MemoryRecord[], value: unknown, vectors: Vector[]): Decision[] {
  const data = object(value);
  if (!Array.isArray(data.decisions) || data.decisions.length !== facts.length) fail(502, "invalid_maintenance", "事实维护结果数量不一致");
  const seen = new Set<number>();
  return data.decisions.map(value => {
    const d = object(value);
    const index = d.fact_index as number;
    if (!Number.isInteger(index) || index < 0 || index >= facts.length || seen.has(index)) fail(502, "invalid_maintenance", "事实编号无效");
    seen.add(index);
    if (!["add", "merge", "supersede", "conflict"].includes(String(d.action))) fail(502, "invalid_maintenance", "事实操作无效");
    const fact = facts[index];
    const target = d.action === "add" ? undefined : candidates.find(m => m.id === d.target_id);
    if (d.action !== "add" && !target) fail(502, "invalid_target", "模型引用了范围外或未知记忆");
    const reason = text(d.reason, "变更依据", 500);
    const confidence = typeof d.confidence === "number" && Number.isFinite(d.confidence) && d.confidence >= 0 && d.confidence <= 1 ? d.confidence : 0;
    const exact = target && normalizedFact(target.content) === normalizedFact(fact.content);
    const sameSlot = target?.fact_key && canonicalFactKey(target.fact_key) === canonicalFactKey(fact.fact_key);
    const canSupersede = target && target.status !== "revoked" && target.origin === "extracted" && sameSlot && registeredFactKey(fact.fact_key) &&
      Date.parse(fact.source.observed_at) > Date.parse(target.source.observed_at);
    const incompatibleSlot = d.action === "add" && candidates.some(m => m.fact_key && canonicalFactKey(m.fact_key) === canonicalFactKey(fact.fact_key) && normalizedFact(m.content) !== normalizedFact(fact.content));
    const slotCandidates = candidates.filter(m => m.status !== "revoked" && m.fact_key && canonicalFactKey(m.fact_key) === canonicalFactKey(fact.fact_key));
    const review_reasons = [
      ...(!registeredFactKey(fact.fact_key) ? ["unregistered_slot"] : []),
      ...(incompatibleSlot ? ["existing_slot_conflict"] : []),
      ...(slotCandidates.length > 1 ? ["ambiguous_slot_candidates"] : []),
      ...(d.supported !== true ? ["unsupported_evidence"] : []),
      ...(fact.confidence < 0.95 ? ["extraction_confidence"] : []),
      ...(confidence < 0.95 ? ["maintenance_confidence"] : []),
      ...(d.action === "conflict" ? ["model_conflict"] : []),
      ...(d.action === "supersede" && !canSupersede ? ["unsafe_supersession"] : []),
      ...(d.action === "merge" && (!exact || !sameSlot || target?.status === "revoked") ? ["non_equivalent_merge"] : []),
    ];
    return {
      fact, action: d.action === "conflict" ? "supersede" : d.action as Decision["action"],
      target_id: target?.id, target_version: target?.version, reason, vector: vectors[index],
      needs_review: review_reasons.length > 0, review_reasons,
    };
  }).sort((a, b) => facts.indexOf(a.fact) - facts.indexOf(b.fact));
}
