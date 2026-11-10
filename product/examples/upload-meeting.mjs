/** Explicitly authorized local media only. Creates a background review job. */
import { openAsBlob } from 'node:fs';
import { extname } from 'node:path';
import { SixteenMemory } from '@sixteen-memory/sdk';
const env = process.env;
if (env.SIXTEEN_MEDIA_CONSENT !== 'yes') throw Error('Explicit consent required.');
const mime_type = { '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' }[extname(env.SIXTEEN_MEDIA_FILE ?? '').toLowerCase()];
if (!mime_type || !env.SIXTEEN_REQUEST_ID || !env.SIXTEEN_OBSERVED_AT) throw Error('Set file, stable request ID and observed timestamp.');
const file = await openAsBlob(env.SIXTEEN_MEDIA_FILE);
const client = new SixteenMemory({ baseUrl: env.SIXTEEN_BASE_URL, apiKey: env.SIXTEEN_API_KEY, timeoutMs: 120000 });
const job = await client.uploadMedia({ user_id: env.SIXTEEN_USER_ID, request_id: env.SIXTEEN_REQUEST_ID,
  observed_at: env.SIXTEEN_OBSERVED_AT, ref: 'meeting-upload', mime_type, size_bytes: file.size, consent: true }, file);
console.log(JSON.stringify(job));
// Poll client.mediaUpload(job.id); then read/approve the linked ingestion_id.
