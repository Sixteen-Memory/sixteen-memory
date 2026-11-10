import { fail, identifier, mediaSegments, memoryInput, object, rejectSecrets, text, type MediaProvenance, type Source } from "./domain";
import { canonicalFactKey } from "./fact-slots";
import { providedAttributes } from "./memory-attributes";
import type { Decision } from "./intelligence-domain";

export const MAX_INLINE_MEDIA_BYTES = 7 * 1024 * 1024;
export const MAX_MEDIA_BODY = 10 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 500 * 1024 * 1024;
export const MAX_MEDIA_SECONDS = 30 * 60;
export const MEDIA_CHUNK_BYTES = 8 * 1024 * 1024;
export type MediaMime = "audio/wav" | "audio/mpeg" | "video/mp4";
export type MediaAnalysis = MediaProvenance & { warnings: string[] };

export function mediaInput(value: unknown) {
  const data = object(value), media = object(data.media);
  if (data.consent !== true) fail(422, "media_consent_required", "需明确同意将媒体发送给已配置的模型供应商");
  if (data.mode !== undefined && data.mode !== "review") fail(422, "media_review_required", "媒体导入必须先确认再写入");
  if (!["audio/wav", "audio/mpeg", "video/mp4"].includes(String(media.mime_type))) fail(415, "unsupported_media_type", "仅支持WAV、MP3或MP4");
  if (Object.keys(media).some(key => !["mime_type", "data_base64"].includes(key))) fail(422, "invalid_media_input", "媒体只接受mime_type和data_base64，不接受远程地址");
  const encoded = media.data_base64;
  if (typeof encoded !== "string" || !encoded || encoded.length % 4 !== 0 || encoded.length > Math.ceil(MAX_INLINE_MEDIA_BYTES / 3) * 4 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) fail(422, "invalid_media_data", "内联媒体需要有效Base64且解码后不超过7 MiB；更大文件请使用分片上传");
  const bytes = atob(encoded);
  if (bytes.length > MAX_INLINE_MEDIA_BYTES || btoa(bytes) !== encoded) fail(422, "invalid_media_data", "媒体Base64或大小无效");
  const mime = media.mime_type as MediaMime;
  const matches = mime === "audio/wav" ? bytes.startsWith("RIFF") && bytes.slice(8, 12) === "WAVE" :
    mime === "audio/mpeg" ? bytes.startsWith("ID3") || (bytes.charCodeAt(0) === 255 && (bytes.charCodeAt(1) & 224) === 224) :
      bytes.slice(4, 8) === "ftyp";
  if (!matches || bytes.length < 16) fail(415, "media_signature_mismatch", "文件头与媒体类型不一致");
  const checked = memoryInput({ ...providedAttributes(data), user_id: data.user_id, content: "Media import",
    source: { type: "conversation", ref: identifier(data.ref, "媒体来源标识"), text: "Media import", observed_at: data.observed_at },
    expires_at: data.expires_at });
  if (Date.parse(checked.source.observed_at) > Date.now() + 300_000) fail(422, "future_evidence", "媒体时间不能晚于当前时间");
  return { ...providedAttributes(data), user_id: checked.user_id, request_id: identifier(data.request_id, "请求标识"),
    ref: checked.source.ref, observed_at: checked.source.observed_at, expires_at: checked.expires_at,
    media: { mime_type: mime, data_base64: encoded }, consent: true as const, mode: "review" as const };
}

export function mediaUploadInput(value: unknown) {
  const data = object(value), mime = data.mime_type as MediaMime;
  if (data.mode !== undefined && data.mode !== "review") fail(422, "media_review_required", "媒体导入必须先确认再写入");
  if (data.consent !== true) fail(422, "media_consent_required", "需明确同意将媒体发送给已配置的模型供应商");
  if (!["audio/wav", "audio/mpeg", "video/mp4"].includes(String(mime))) fail(415, "unsupported_media_type", "仅支持WAV、MP3或MP4");
  const size = Number(data.size_bytes);
  if (!Number.isSafeInteger(size) || size < 16 || size > MAX_MEDIA_BYTES) fail(422, "invalid_media_size", "媒体大小需为16字节至500 MiB");
  const checked = memoryInput({ ...providedAttributes(data), user_id: data.user_id, content: "Media upload",
    source: { type: "conversation", ref: identifier(data.ref, "媒体来源标识"), text: "Media upload", observed_at: data.observed_at },
    expires_at: data.expires_at });
  if (Date.parse(checked.source.observed_at) > Date.now() + 300_000) fail(422, "future_evidence", "媒体时间不能晚于当前时间");
  return { ...providedAttributes(data), user_id: checked.user_id, request_id: identifier(data.request_id, "请求标识"),
    ref: checked.source.ref, observed_at: checked.source.observed_at, expires_at: checked.expires_at,
    mime_type: mime, size_bytes: size, consent: true as const, mode: "review" as const };
}

export function mediaDecisions(value: unknown, input: Omit<ReturnType<typeof mediaInput>, "media"> & { media: { mime_type: MediaMime } }, sha256: string, model: string, duration?: number) {
  const data = object(value);
  const segments = mediaSegments(data.segments, input.media.mime_type);
  if (duration !== undefined && segments.some(segment => segment.end_ms !== null && segment.end_ms > Math.ceil(duration * 1000))) fail(502, "invalid_media_timestamp", "模型片段时间超出媒体时长");
  if (data.complete !== true) fail(502, "incomplete_media", "模型未完整处理媒体，未创建候选记忆");
  if (!Array.isArray(data.warnings) || data.warnings.length > 8 ||
      !Array.isArray(data.facts) || data.facts.length > 8) fail(502, "invalid_media_output", "媒体抽取格式无效");
  const warnings = data.warnings.map(v => text(v, "媒体提示", 300));
  warnings.forEach(rejectSecrets);
  const provenance = { sha256, mime_type: input.media.mime_type, model, interpretation: "model_generated" as const };
  const decisions: Decision[] = data.facts.map(value => {
    const f = object(value);
    if (!Array.isArray(f.evidence) || !f.evidence.length || f.evidence.length > 4 ||
        typeof f.confidence !== "number" || !Number.isFinite(f.confidence) || f.confidence < 0 || f.confidence > 1) fail(502, "invalid_media_fact", "媒体候选缺少依据或可信度无效");
    const evidence = f.evidence.map(value => {
      const e = object(value), segment = segments.find(s => s.id === e.segment_id);
      const quote = text(e.quote, "片段引用", 1000);
      if (!segment || !segment.text.includes(quote)) fail(502, "ungrounded_media_fact", "候选引用不在媒体解读片段中");
      return { ...segment, text: quote };
    });
    const source: Source = { type: "conversation", ref: input.ref, observed_at: input.observed_at,
      text: "Model-generated media interpretation; not a verified transcript.\n" + evidence.map(s =>
        `[${s.id}; ${s.start_ms ?? "?"}-${s.end_ms ?? "?"}ms; ${s.kind}; speaker=${s.speaker ?? "unknown"}] ${s.text}`).join("\n"),
      media: { ...provenance, segments: evidence } };
    const content = text(f.content, "候选记忆", 1000);
    memoryInput({ user_id: input.user_id, content, source, expires_at: input.expires_at });
    return { fact: { content, fact_key: canonicalFactKey(identifier(f.fact_key, "事实槽位")), source, confidence: f.confidence },
      action: "add", reason: "User confirmation required for model-generated media evidence.", needs_review: true,
      review_reasons: ["media_interpretation", "speaker_and_timestamps_unverified"] };
  });
  if (new Set(decisions.map(d => d.fact.fact_key)).size !== decisions.length) fail(502, "ambiguous_batch", "媒体候选包含重复事实槽位");
  return { decisions, media: { ...provenance, segments, warnings } satisfies MediaAnalysis };
}
