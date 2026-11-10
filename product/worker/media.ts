import { ApiError, fail, hash } from "./domain";
import { mediaDecisions, mediaInput } from "./media-domain";
import { mediaConfigured, understandMedia, type MediaEnv } from "./media-provider";
import { endpoint } from "./providers";
import { providedAttributes } from "./memory-attributes";
import type { Action, Auth, Outcome } from "./project";
import type { Plan } from "./intelligence-domain";
import { inlineDuration } from "./media-files";

type Project = { execute(auth: Auth, action: Action, input: Record<string, unknown>, digest?: string): Promise<Outcome> };
async function execute<T>(project: Project, auth: Auth, action: Action, input: Record<string, unknown>, digest = ""): Promise<T> {
  const result = await project.execute(auth, action, input, digest);
  if (!result.ok) throw new ApiError(result.status, result.code, result.message);
  return JSON.parse(result.json) as T;
}
export async function ingestMedia(env: MediaEnv, project: Project, auth: Auth, raw: Record<string, unknown>) {
  await execute(project, auth, "preflight", { user_id: raw.user_id, write: true });
  if (!mediaConfigured(env)) fail(503, "media_not_configured", "音视频理解未启用或缺少模型配置");
  const input = mediaInput(raw);
  endpoint(env.MEDIA_BASE_URL, "/chat/completions");
  const bytes = Uint8Array.from(atob(input.media.data_base64), c => c.charCodeAt(0));
  const duration = await inlineDuration(bytes, input.media.mime_type);
  if (/^qwen3-omni-/.test(env.MEDIA_MODEL!) && duration > (input.media.mime_type === "video/mp4" ? 150 : 1200)) fail(422, "media_model_duration", "当前模型不支持此时长，请配置长音视频模型");
  const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(n => n.toString(16).padStart(2, "0")).join("");
  const { media, ...metadata } = input;
  // Only a digest crosses the storage boundary; never store the original clip or a signed URL.
  const job = await execute<{ id: string; epoch: number; replay?: boolean }>(project, auth, "ingest_begin", metadata,
    await hash(JSON.stringify({ ...metadata, kind: "media", mime_type: media.mime_type, sha256 })));
  if (job.replay) return job;
  try {
    await execute(project, auth, "model_budget", { user_id: input.user_id, calls: 1 });
    const generated = await understandMedia(env, media, duration);
    let analysis: ReturnType<typeof mediaDecisions>;
    try { analysis = mediaDecisions(generated.value, input, sha256, generated.usage.model, duration); }
    catch (error) {
      if (error instanceof ApiError && error.status === 422) fail(502, "invalid_media_output", "媒体模型返回无效片段或候选内容");
      throw error;
    }
    const plan: Plan = { user_id: input.user_id, request_id: input.request_id, epoch: job.epoch,
      expires_at: input.expires_at, ...providedAttributes(input), ...analysis };
    const result = await execute<Record<string, unknown>>(project, auth, "ingest_finish", { id: job.id, plan, mode: "review" });
    return { ...result, usage: [generated.usage] };
  } catch (error) {
    await execute(project, auth, "ingest_fail", { id: job.id }).catch(() => undefined);
    if (error instanceof ApiError) throw new ApiError(error.status, error.code, `${error.message}（导入ID：${job.id}）`);
    throw error;
  }
}
