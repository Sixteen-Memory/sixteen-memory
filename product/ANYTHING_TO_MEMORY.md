# Anything to Memory: 30-minute uploads

The release accepts WAV/MP3 audio and MP4 video of **at most 30 minutes and
500 MiB**. Duration and byte size are independent limits: high-bitrate files
may need compression even if shorter than 30 minutes. Media container metadata
is parsed server-side; this is not a full codec-integrity or recognition-quality
certification. A 30:00 fixture passes; 30:01 fails before a model call.

## Availability

The code and console can be deployed with media disabled. Current production
credentials permit Worker/Pages release but not R2 storage administration.
`wrangler.production.jsonc` intentionally omits the unprovisioned R2 binding and
keeps all model flags disabled. The UI clearly reports that uploads are not yet
enabled. Publishing this code is not equivalent to enabling paid model access.

To activate uploads, separately authorize R2 provisioning/use, configure the
private `MEDIA_BUCKET`, and choose an approved long-media model, e.g. a supported
Qwen3.5/3.8 Omni deployment. Set `MEDIA_ENABLED`, `MEDIA_BASE_URL`, `MEDIA_MODEL`,
`MEDIA_API_KEY` (secret), and `MEDIA_OBJECT_BASE_URL` to the canonical console
HTTPS origin. Do not enable public bucket access. Configure a one-day bucket
lifecycle for the `pending/` prefix as a backstop for interrupted cleanup.

Qwen's Base64 media input must be below 10 MB. Large files therefore use a
private, temporary server endpoint rather than inflating JSON request limits.
Older Qwen3 Omni supports only 20-minute audio / 150-second video, and is not
accepted by the 30-minute upload route. References checked November 10, 2026:

- [Qwen Omni](https://help.aliyun.com/zh/model-studio/qwen-omni)
- [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Durable Object alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)

## Upload API

1. `POST /v1/media/uploads` with `user_id`, `request_id`, `ref`, `observed_at`,
   `mime_type`, `size_bytes`, and explicit `consent: true`.
2. `PUT /v1/media/uploads/{id}/parts/{part}` with raw bytes; 8 MiB per part,
   except the final part. Upload sequentially. Identical repeated parts are
   accepted; different bytes for an already accepted part return 409.
3. `POST /v1/media/uploads/{id}/complete` creates a normal ingestion job and
   queues processing. It does not hold the browser request open for the model.
4. `GET /v1/media/uploads/{id}` reports uploading/queued/running/processed,
   failed/cancelled/expired and the linked `ingestion_id`.
5. `DELETE /v1/media/uploads/{id}` cancels outstanding work and queues cleanup.

The metadata response includes `received_bytes`, `part_size`, and `next_part`.
Reusing an unchanged create request resumes the same upload. Never reuse a
request ID for a different file. The service rejects arbitrary remote URLs.

The old `POST /v1/media/ingestions` route remains for Base64 clips up to 7 MiB
(10 MiB JSON limit), with server-side duration checks. Larger files must use the
upload route. Normal JSON routes remain capped at 64 KiB.

## Processing and retention

A Durable Object alarm performs bounded-memory file hashing, metadata parsing,
and one text-only streamed model request, with a ten-minute provider deadline.
Uploads expire after two hours or the requested memory expiry, whichever is
sooner. At most eight uploads may be pending per project. One model call counts
against the existing 200/day project limit. This is not a financial cost cap.
Interrupted model execution is failed, not silently retried and charged again.

Only a token digest is stored. The temporary model-read URL is valid only for
that running job; it supports byte ranges and checks credential revocation.
No public bucket URL is created. Input segments are removed after processing,
failure, cancellation, expiry or relevant user/key invalidation. Cleanup errors
remain retryable. A bucket lifecycle should also be configured before enabling
production uploads. Provider retention and Cloudflare backup retention are
separate from online deletion.

The full file is not copied into SQLite or loaded into memory. Each R2 segment
is read through a stream. SHA-256 records the actual file bytes. Metadata parser
`music-metadata@12.3.5` is MIT licensed, pinned, and limited to 4 MiB individual
metadata allocations and 1,000 user-metadata entries. Model segments and facts
retain the existing bounds, so this is **memory extraction, not full transcription**.

## Review, SDKs and limits

Candidates are additions only and require human review. Approve/reject using
`POST /v1/ingestions/{id}/resolve` with `approve`. Before approval, they cannot
appear in search. Approved memories preserve cited excerpts and media provenance;
ordinary versioned read/update/delete operations apply. Exact substring citations
are checks against model-produced text, not independent truth verification.

JS methods: `createMediaUpload`, `uploadMediaPart`, `completeMediaUpload`,
`mediaUpload`, `cancelMediaUpload`, and the Blob helper `uploadMedia`.
Python sync/async expose snake_case equivalents and `upload_media(file_path, ...)`.
Python helpers perform bounded local file reads between asynchronous network calls.
Neither SDK retries network requests automatically. Existing website download
archives are not replaced in this service-only deployment; build SDKs from this
checkout until a separately versioned archive release.

No image/PDF/OCR upload, biometric identification or verified speaker labeling.
Model confidence is not calibrated probability. No real media/model accuracy
benchmark was performed; activation still needs an approved dataset evaluation.

## Local verification

Run from `product/`: `npm run build`, `npm test`, `npm run test:media`,
`npm run test:media:upload`, `npm run test:runtime`, `npm run test:knowledge`,
`npm run test:oauth`, and `npm run test:migration`.
The upload suite uses a synthetic 30-minute black MP4, a 30:01 rejection fixture,
and a generated 14 MB WAV in actual local Worker/R2 simulation. It exercises
private ranged reads, repeated/conflicting parts, cancellation, scope and cleanup.
All provider calls are intercepted; no production file or paid model is used.
