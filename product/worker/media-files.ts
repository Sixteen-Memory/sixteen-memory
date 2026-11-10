import { createHash } from "node:crypto";
import { parseBuffer, parseWebStream } from "music-metadata";
import { fail } from "./domain";
import { MAX_MEDIA_SECONDS, type MediaMime } from "./media-domain";

type Part = { key: string; size: number; sha256: string };
export function mediaPartStream(bucket: R2Bucket, parts: Part[], offset = 0, length = parts.reduce((sum, part) => sum + part.size, 0)) {
  let index = 0, skip = offset, remaining = length, reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  while (index < parts.length && skip >= parts[index].size) { skip -= parts[index].size; index++; }
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        while (remaining > 0) {
          if (!reader) {
            const part = parts[index++];
            if (!part) throw Error("missing part");
            const object = await bucket.get(part.key, { range: { offset: skip, length: Math.min(remaining, part.size - skip) } });
            if (!object) throw Error("missing part");
            reader = object.body.getReader(); skip = 0;
          }
          const chunk = await reader.read();
          if (chunk.done) { reader.releaseLock(); reader = undefined; continue; }
          remaining -= chunk.value.byteLength; controller.enqueue(chunk.value); return;
        }
        await reader?.cancel(); controller.close();
      } catch (error) { controller.error(error); }
    },
    async cancel() { await reader?.cancel(); },
  });
}
function checkedDuration(format: Awaited<ReturnType<typeof parseBuffer>>["format"], mime: MediaMime) {
  const values = [format.duration, format.containerDuration, ...format.trackInfo.map(track => track.duration)].filter((value): value is number => typeof value === "number");
  const duration = Math.max(...values);
  if (!Number.isFinite(duration) || duration <= 0) fail(422, "media_duration_unknown", "无法确认文件时长，请重新导出为WAV、MP3或标准MP4");
  if (mime === "video/mp4" && format.hasVideo !== true) fail(415, "media_signature_mismatch", "MP4文件没有可识别的视频轨道");
  if (duration > MAX_MEDIA_SECONDS) fail(422, "media_duration_limit", "媒体时长不能超过30分钟");
  return duration;
}
export async function inlineDuration(bytes: Uint8Array, mime: MediaMime) {
  try { return checkedDuration((await parseBuffer(bytes, { mimeType: mime, size: bytes.length }, { duration: true, skipCovers: true, maxMemoryAllocation: 4 * 1024 * 1024, maxMetadataEntries: 1000 })).format, mime); }
  catch (error) { if (error instanceof Error && "status" in error) throw error; fail(422, "invalid_media_file", "无法解析媒体文件，请检查文件完整性"); }
}
export async function inspectMediaFile(bucket: R2Bucket, parts: Part[], mime: MediaMime) {
  const hash = createHash("sha256"), stream = mediaPartStream(bucket, parts), reader = stream.getReader();
  try {
    while (true) { const chunk = await reader.read(); if (chunk.done) break; hash.update(chunk.value); }
  } finally { await reader.cancel(); }
  const metadataStream = mediaPartStream(bucket, parts);
  try {
    const info = await parseWebStream(metadataStream, { mimeType: mime, size: parts.reduce((sum, part) => sum + part.size, 0) },
      { duration: true, skipCovers: true, maxMemoryAllocation: 4 * 1024 * 1024, maxMetadataEntries: 1000 });
    return { duration: checkedDuration(info.format, mime), sha256: hash.digest("hex") };
  } catch (error) {
    if (error instanceof Error && "status" in error) throw error;
    fail(422, "invalid_media_file", "无法解析媒体文件，请检查文件完整性");
  }
}
