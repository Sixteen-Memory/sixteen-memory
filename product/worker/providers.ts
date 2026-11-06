import { fail, hash, object } from "./domain";
import { validateVector, type ModelUsage, type Vector } from "./intelligence-domain";
import { generationOptions } from "./generation-options";
import { embeddingOptions, embeddingRequest, type EmbeddingEnv, type EmbeddingPurpose } from "./embedding-config";

export interface IntelligenceEnv extends EmbeddingEnv {
  EXTRACTION_ENABLED?: string; EMBEDDINGS_ENABLED?: string;
  EXTRACTION_BASE_URL?: string; EXTRACTION_MODEL?: string; EXTRACTION_API_KEY?: string;
  EMBEDDING_BASE_URL?: string; EMBEDDING_MODEL?: string; EMBEDDING_API_KEY?: string;
  EMBEDDING_REVISION?: string;
  EXTRACTION_TOKEN_PARAMETER?: string; EXTRACTION_THINKING?: string;
}
const configured = (enabled: string | undefined, url: string | undefined, model: string | undefined, key: string | undefined) => enabled === "true" && !!(url && model && key);
export const extractionConfigured = (env: IntelligenceEnv) => configured(env.EXTRACTION_ENABLED, env.EXTRACTION_BASE_URL, env.EXTRACTION_MODEL, env.EXTRACTION_API_KEY);
export const embeddingConfigured = (env: IntelligenceEnv) => configured(env.EMBEDDINGS_ENABLED, env.EMBEDDING_BASE_URL, env.EMBEDDING_MODEL, env.EMBEDDING_API_KEY);

function endpoint(base: string | undefined, path: string) {
  let url: URL;
  try { url = new URL(base ?? ""); } catch { fail(503, "provider_config", "模型地址未配置"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      url.hostname === "localhost" || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname) || url.hostname.includes(":")) fail(503, "provider_config", "模型地址必须是受信任供应商的HTTPS域名");
  return url.toString().replace(/\/$/, "") + path;
}
export async function providerJson(url: string, key: string, body: unknown, byteLimit = 2 * 1024 * 1024): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(url, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(25_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body),
    });
    if (!response.ok) { await response.body?.cancel(); fail(502, "provider_error", `模型服务返回HTTP ${response.status}；未自动重试`); }
    const reader = response.body?.getReader();
    if (!reader) fail(502, "provider_empty", "模型响应为空");
    const decoder = new TextDecoder(); let size = 0; let output = "";
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > byteLimit) { await reader.cancel(); fail(502, "provider_size", "模型响应超出限制"); }
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return object(JSON.parse(output));
  } catch (error) {
    if (error instanceof Error && "status" in error) throw error;
    fail(502, "provider_unavailable", "模型请求失败或格式无效；未自动重试");
  }
}
function usage(body: Record<string, unknown>, stage: string, model: string, start: number): ModelUsage {
  const u = body.usage as Record<string, unknown> | undefined;
  const valid = (v: unknown) => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null;
  return { stage, model, input_tokens: valid(u?.prompt_tokens ?? u?.input_tokens), output_tokens: valid(u?.completion_tokens ?? u?.output_tokens), duration_ms: Date.now() - start };
}
export async function modelJson(env: IntelligenceEnv, system: string, payload: unknown, stage: string) {
  if (!extractionConfigured(env)) fail(503, "extraction_not_configured", "自动抽取未启用或缺少模型配置");
  const encoded = JSON.stringify(payload);
  if (encoded.length > 50000) fail(422, "model_input_limit", "模型输入过长");
  const start = Date.now();
  const body = await providerJson(endpoint(env.EXTRACTION_BASE_URL, "/chat/completions"), env.EXTRACTION_API_KEY!, {
    model: env.EXTRACTION_MODEL, ...generationOptions(3500, env.EXTRACTION_TOKEN_PARAMETER, env.EXTRACTION_THINKING), response_format: { type: "json_object" },
    messages: [{ role: "system", content: system }, { role: "user", content: encoded }],
  }, 256 * 1024);
  const choice = (body.choices as { finish_reason?: string; message?: { content?: unknown } }[] | undefined)?.[0];
  if (choice?.finish_reason === "length" || typeof choice?.message?.content !== "string") fail(502, "invalid_model_json", "模型输出为空或被截断");
  let value: unknown;
  try { value = JSON.parse(choice.message.content); } catch { fail(502, "invalid_model_json", "模型未输出有效JSON"); }
  return { value, usage: usage(body, stage, env.EXTRACTION_MODEL!, start) };
}
export async function embeddingSignature(env: IntelligenceEnv) {
  if (!embeddingConfigured(env)) fail(503, "embeddings_not_configured", "语义检索未启用或缺少向量模型配置");
  const { provider, apiStyle, dimensions } = embeddingOptions(env);
  return hash(JSON.stringify({
    schema: "embedding/2", base: endpoint(env.EMBEDDING_BASE_URL, ""), model: env.EMBEDDING_MODEL,
    provider, apiStyle, dimensions, revision: env.EMBEDDING_REVISION || "1", normalization: "unit-l2",
  }));
}
export async function embed(env: IntelligenceEnv, inputs: string[], purpose: EmbeddingPurpose = "document"): Promise<{ vectors: Vector[]; usage: ModelUsage }> {
  const signature = await embeddingSignature(env);
  const options = embeddingOptions(env);
  const request = embeddingRequest(env, env.EMBEDDING_MODEL!, inputs, purpose);
  const start = Date.now();
  const body = await providerJson(endpoint(env.EMBEDDING_BASE_URL, request.path), env.EMBEDDING_API_KEY!, request.body);
  if (body.code && body.code !== "Success") fail(502, "embedding_provider_error", "向量供应商返回业务错误；没有自动重试");
  const output = options.apiStyle === "dashscope" ? object(body.output) : body;
  const data = options.apiStyle === "dashscope" ? output.embeddings : output.data;
  if (!Array.isArray(data) || data.length !== inputs.length) fail(502, "invalid_embedding", "向量响应数量不一致");
  const ordered = data.map(value => {
    const row = object(value);
    const index = row.index ?? row.text_index;
    if (!Number.isSafeInteger(index) || (row.index !== undefined && row.text_index !== undefined && row.index !== row.text_index)) {
      fail(502, "invalid_embedding", "向量响应序号无效");
    }
    return { index: index as number, embedding: row.embedding };
  }).sort((a, b) => a.index - b.index);
  const vectors = ordered.map((v, i) => {
    if (v.index !== i) fail(502, "invalid_embedding", "向量响应序号无效");
    const vector = validateVector({ model: signature, values: v.embedding });
    if (options.dimensions !== null && vector.values.length !== options.dimensions) {
      fail(502, "embedding_dimension_mismatch", "供应商返回维度与配置不符，未裁剪、补零或写入");
    }
    return vector;
  });
  if (new Set(vectors.map(v => v.values.length)).size !== 1) fail(502, "invalid_embedding", "向量维度不一致");
  // Embedding-only total_tokens counts input. No output-generation tokens are invented.
  const rawUsage = body.usage as Record<string, unknown> | undefined;
  return { vectors, usage: usage({ ...body, usage: {
    ...rawUsage, prompt_tokens: rawUsage?.prompt_tokens ?? rawUsage?.input_tokens ?? rawUsage?.total_tokens,
  } }, "embedding", env.EMBEDDING_MODEL!, start) };
}
