/** Sends a local test clip to the configured media provider. The service stores no raw media. */
import { open } from "node:fs/promises";
import { extname } from "node:path";
import { SixteenMemory } from "@sixteen-memory/sdk";

const { SIXTEEN_BASE_URL: baseUrl, SIXTEEN_API_KEY: apiKey, SIXTEEN_USER_ID: user_id, SIXTEEN_MEDIA_FILE: file,
  SIXTEEN_MEDIA_CONSENT: consent, SIXTEEN_REQUEST_ID: request_id, SIXTEEN_OBSERVED_AT: observed_at } = process.env;
if (!baseUrl || !apiKey || !user_id || !file || consent !== "yes" || !request_id || !observed_at) {
  throw Error("Set SIXTEEN_BASE_URL, SIXTEEN_API_KEY, SIXTEEN_USER_ID, SIXTEEN_MEDIA_FILE, SIXTEEN_REQUEST_ID, SIXTEEN_OBSERVED_AT and SIXTEEN_MEDIA_CONSENT=yes.");
}
const mimeTypes = { ".wav": "audio/wav", ".mp3": "audio/mpeg", ".mp4": "video/mp4" };
const mime_type = mimeTypes[extname(file).toLowerCase()];
if (!mime_type) throw Error("SIXTEEN_MEDIA_FILE must be WAV, MP3 or MP4.");
const handle = await open(file, "r");
let bytes;
try {
  if ((await handle.stat()).size > 2 * 1024 * 1024) throw Error("The first release accepts clips up to 2 MiB.");
  const buffer = Buffer.alloc(2 * 1024 * 1024 + 1);
  let length = 0;
  while (length < buffer.length) {
    const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
    if (!bytesRead) break;
    length += bytesRead;
  }
  if (length > 2 * 1024 * 1024) throw Error("Clip exceeds 2 MiB.");
  bytes = buffer.subarray(0, length);
} finally { await handle.close(); }
const client = new SixteenMemory({ baseUrl, apiKey, timeoutMs: 90_000 });
const health = await client.health();
if (health.media_ingestion !== "assisted") throw Error("The target service has no configured media provider.");
const job = await client.ingestMedia({
  user_id, request_id, ref: "media-example", observed_at,
  media: { mime_type, data_base64: bytes.toString("base64") }, consent: true, mode: "review",
});
console.log(JSON.stringify({ id: job.id, state: job.state, proposal: job.proposal }, null, 2));
console.log("Review this job, then explicitly approve or reject it. This example does not commit candidate memories.");
