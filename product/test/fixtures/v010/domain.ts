export const VERSION = "0.1.0";
export const MAX_BODY = 64 * 1024;
export const MAX_CONTENT = 8000;
export const MAX_MEMORIES = 10000;
export type Role = "admin" | "read" | "write";
export type Status = "active" | "revoked";
export interface Identity { key_id: string; role: Role; user_id: string | null }
export interface Source { type: "conversation" | "business" | "manual"; ref: string; text: string; observed_at: string }
export interface MemoryInput { user_id: string; content: string; source: Source; expires_at: string | null }
export interface MemoryRecord extends MemoryInput {
  id: string; version: number; status: Status; created_at: string; updated_at: string;
}
export interface KeyRecord {
  id: string; name: string; role: "read" | "write"; user_id: string; prefix: string;
  created_at: string; revoked_at: string | null;
}
export interface HistoryRecord {
  version: number; action: string; content: string; source: Source;
  status: Status; reason: string; actor: string; created_at: string;
}
export interface AuditRecord {
  id: number; action: string; status: number; duration_ms: number; actor: string; created_at: string;
}
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function fail(status: number, code: string, message: string): never {
  throw new ApiError(status, code, message);
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(422, "invalid_body", "需要 JSON 对象");
  return value as Record<string, unknown>;
}
export function text(value: unknown, field: string, max = 200): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) fail(422, "invalid_field", `${field} 不能为空，且不能超过 ${max} 字符`);
  return value.trim();
}
export function identifier(value: unknown, field: string): string {
  const result = text(value, field, 100);
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:@-]*$/.test(result)) fail(422, "invalid_id", `${field} 只能包含字母、数字及 _ . : @ -`);
  return result;
}
export function date(value: unknown, field: string): string {
  const result = text(value, field, 40);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(result) || !Number.isFinite(Date.parse(result))) fail(422, "invalid_date", `${field} 需要 ISO 日期`);
  return new Date(result).toISOString();
}
export function source(value: unknown): Source {
  const data = object(value);
  if (!["conversation", "business", "manual"].includes(String(data.type))) fail(422, "invalid_source", "来源类型无效");
  return {
    type: data.type as Source["type"],
    ref: text(data.ref, "来源标识", 300),
    text: text(data.text, "来源正文", MAX_CONTENT),
    observed_at: date(data.observed_at, "来源时间"),
  };
}
export function memoryInput(value: unknown, allowExpired = false): MemoryInput {
  const data = object(value);
  const content = text(data.content, "记忆内容", MAX_CONTENT);
  const evidence = source(data.source);
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-|sk_live_|ghp_)[A-Za-z0-9_-]{20,}/.test(content + evidence.text)) {
    fail(422, "secret_detected", "内容疑似包含密钥，请先移除");
  }
  const expires = data.expires_at == null || data.expires_at === "" ? null : date(data.expires_at, "到期时间");
  if (!allowExpired && expires && Date.parse(expires) <= Date.now()) fail(422, "invalid_expiry", "到期时间必须晚于现在");
  return { user_id: identifier(data.user_id, "用户标识"), content, source: evidence, expires_at: expires };
}
export function expectedVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) fail(422, "invalid_version", "需要当前版本号");
  return Number(value);
}
export function access(identity: Identity, userId: string, write = false) {
  if (identity.role !== "admin" && identity.user_id !== userId) fail(404, "not_found", "未找到记录");
  if (write && identity.role === "read") fail(403, "read_only", "该凭证只允许读取");
}
export function admin(identity: Identity) {
  if (identity.role !== "admin") fail(403, "admin_required", "需要管理员权限");
}
export function tokens(value: string, limit = 64): string[] {
  const normalized = value.toLowerCase().normalize("NFKC").replace(/\p{Script=Han}/gu, " $& ");
  return [...new Set(normalized.match(/[\p{L}\p{N}_]+/gu) ?? [])].slice(0, limit);
}
export async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, "0")).join("");
}
export function equalDigest(left: string, right: string): boolean {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function randomSecret(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, "0")).join("");
}
export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) fail(415, "content_type", "需要 application/json");
  const reader = request.body?.getReader();
  if (!reader) fail(422, "empty_body", "请求内容为空");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); fail(413, "body_limit", "请求内容超过 64 KiB"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return object(JSON.parse(new TextDecoder().decode(bytes))); }
  catch (error) { if (error instanceof ApiError) throw error; fail(422, "invalid_json", "JSON 格式无效"); }
}
import { timingSafeEqual } from "node:crypto";

