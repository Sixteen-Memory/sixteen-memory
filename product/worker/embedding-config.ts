import { fail } from "./domain";
import { MAX_VECTOR_DIMENSIONS } from "./intelligence-domain";

export interface EmbeddingEnv {
  EMBEDDING_PROVIDER?: string;
  EMBEDDING_API_STYLE?: string;
  EMBEDDING_DIMENSIONS?: string;
}
export type EmbeddingPurpose = "query" | "document";
export function embeddingOptions(env: EmbeddingEnv) {
  const provider = env.EMBEDDING_PROVIDER || "qwen";
  const apiStyle = env.EMBEDDING_API_STYLE || "openai-compatible";
  if (!["qwen", "openai-compatible"].includes(provider)) fail(503, "embedding_config", "向量供应商配置无效");
  if (!["openai-compatible", "dashscope"].includes(apiStyle) || (apiStyle === "dashscope" && provider !== "qwen")) {
    fail(503, "embedding_config", "DashScope原生协议仅用于千问供应商");
  }
  const dimensions = env.EMBEDDING_DIMENSIONS ? Number(env.EMBEDDING_DIMENSIONS) : provider === "qwen" ? 1024 : null;
  if (dimensions !== null && (!Number.isSafeInteger(dimensions) || dimensions < 1 || dimensions > MAX_VECTOR_DIMENSIONS)) {
    fail(503, "embedding_config", `向量维度必须为1至${MAX_VECTOR_DIMENSIONS}`);
  }
  if (provider === "qwen" && ![64,128,256,512,768,1024,1536,2048].includes(dimensions!)) {
    fail(503, "embedding_config", "千问向量维度配置无效；还需确认所选模型支持该维度");
  }
  return { provider, apiStyle, dimensions, maxBatch: provider === "qwen" ? 10 : 16 };
}
export function embeddingRequest(env: EmbeddingEnv, model: string, inputs: string[], purpose: EmbeddingPurpose) {
  const options = embeddingOptions(env);
  if (!["query", "document"].includes(purpose)) fail(422, "embedding_purpose", "向量用途必须是query或document");
  if (!inputs.length || inputs.length > options.maxBatch || inputs.some(s => typeof s !== "string" || !s || s.length > 8000)) {
    fail(422, "embedding_input", `向量批次需要1至${options.maxBatch}条文本，每条最多8000字符`);
  }
  if (options.apiStyle === "dashscope") {
    return {
      path: "/services/embeddings/text-embedding/text-embedding",
      body: { model, input: { texts: inputs }, parameters: { dimension: options.dimensions, text_type: purpose, output_type: "dense" } },
    };
  }
  // The compatible API documents dimensions, not DashScope's text_type.
  // Never invent a compatible query/document field or rewrite the source text.
  return {
    path: "/embeddings",
    body: { model, input: inputs, encoding_format: "float", ...(options.dimensions === null ? {} : { dimensions: options.dimensions }) },
  };
}
