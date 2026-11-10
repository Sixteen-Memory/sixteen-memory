# Anything to Memory

This development branch adds short meeting audio/video clips to the existing
text ingestion flow. It is not deployed, and the website SDK downloads have
not been replaced. Audio/video model quality has not been accepted.

## API

`POST /v1/media/ingestions`

```json
{
  "user_id": "user-1",
  "request_id": "unique-request-id",
  "ref": "meeting-2026-11-10",
  "observed_at": "2026-11-10T09:00:00+08:00",
  "media": {
    "mime_type": "audio/wav",
    "data_base64": "<Base64-encoded local clip>"
  },
  "consent": true,
  "mode": "review"
}
```

Supported inputs are WAV, MP3 and MP4 clips up to 2 MiB. The JSON request is
limited to 3 MiB. Remote URLs are rejected, so the service does not fetch
untrusted or expiring locations. The first release is synchronous and intended
for short clips, not full-length meetings.

Signature checks reject obvious MIME mismatches but are not a codec decoder
or duration check. Provider limits may be lower. `ref` must be a non-secret
identifier of at most 100 characters, not a URL or filename. Optional category,
metadata, event time, validity and memory expiry use existing ingestion rules.

## Review and deletion

`GET /v1/ingestions/{id}` and `GET /v1/ingestions?user_id=...` include media
jobs alongside text jobs. The list returns the latest 30 jobs, not a complete
paginated history.

```text
POST /v1/ingestions/{id}/resolve   {"approve": true}
POST /v1/ingestions/{id}/resolve   {"approve": false}
```

The response includes `state: "review"`, `proposal.media` and
`proposal.decisions`. Nothing is searchable until approval. After approval,
`results[].memory_id` identifies ordinary memories. Use their current version
when calling `DELETE /v1/memories/{id}` with `expected_version`.

Approval applies to the whole job. To correct a candidate, reject the job and
explicitly create the corrected memory with relevant source evidence.
Per-candidate editing is not included.

Pending analysis is removed after 24 hours or the requested memory expiry,
whichever comes first. Rejection or approval clears the
complete analysis immediately; approved memories keep only cited excerpts and
provenance until their own expiry or deletion. Job metadata is purged after
30 days. Provider retention and platform backups are not controlled here.

Repeat the identical payload and `request_id` to recover a completed proposal
without another model call. Running/failed jobs return `409 ingestion_incomplete`;
changed payloads return `409 idempotency_conflict`; rejected/expired/deleted
jobs return `410`. Idempotency is scoped to the credential, not every key for
the same user. Failed calls are never retried automatically.

## Stored provenance

The original media is sent once to the explicitly configured provider and is
not written to the Durable Object. Each candidate keeps:

- a SHA-256 digest of the clip;
- MIME type and model identifier;
- model-generated speech or visual segments;
- relative time bounds when available;
- a speaker label or `null` when attribution is uncertain;
- exact segment substrings supporting the candidate.

Every media candidate is an `add` proposal with `media_interpretation` review
reasons. It cannot automatically supersede an existing memory. An authorized
user must call the ordinary ingestion approval endpoint before it becomes
searchable. Approved media memories retain the provenance through history,
evidence search, exports and updates that preserve the source. The console
removes the media link when source fields are replaced.

## SDK usage

The methods are `client.ingestMedia(input)` in JS and
`client.ingest_media(**input)` in Python sync/async. Build the SDK from this
checkout; the published archives do not contain these methods yet.

Use the [JS example](examples/media-to-memory.mjs) or
[Python sync/async example](examples/media-to-memory.py):

```sh
export SIXTEEN_BASE_URL=http://127.0.0.1:8790
export SIXTEEN_USER_ID=authorized-test-user
export SIXTEEN_MEDIA_FILE=/absolute/path/to/authorized-clip.wav
export SIXTEEN_REQUEST_ID=media-test-001
export SIXTEEN_OBSERVED_AT=2026-11-10T09:00:00+08:00
export SIXTEEN_MEDIA_CONSENT=yes
# Supply SIXTEEN_API_KEY through your existing secret environment.
node media-to-memory.mjs
# Or, with sixteen_memory installed:
python media-to-memory.py
# SIXTEEN_ASYNC=yes selects AsyncSixteenMemory with the existing [async] extra.
```

Examples print the review job to the local terminal. Keep this output private.
They do not approve or delete the job. SDK types are in `service-types.d.ts`;
the core OpenAPI snapshot still covers the earlier explicit-memory API and
optional source provenance, not this new endpoint.

The provider deadline is 60 seconds; examples use a 90-second client timeout.
Client cancellation does not guarantee cancellation of a provider request
already accepted. Inspect the job list before starting a new request. Each
job reserves one call in the existing project daily limit. This is a call
counter, not a currency-denominated spending limit.

## Provider settings

The feature stays disabled unless all four settings are present:

```text
MEDIA_ENABLED=true
MEDIA_BASE_URL=https://<approved-provider>/compatible-mode/v1
MEDIA_MODEL=<approved-omni-model>
MEDIA_API_KEY=<secret>
```

The current adapter uses an OpenAI-compatible streaming chat completion with
Qwen Omni input parts. Provider failures are not retried, and provider response
bodies are not returned to callers.

The adapter follows the official
[Qwen Omni audio/video documentation](https://help.aliyun.com/zh/model-studio/qwen-omni),
checked on November 10, 2026: `input_audio` or `video_url`, inline Base64,
text-only SSE output. The SSE parser is `eventsource-parser@3.1.1`, already
installed through MCP and now declared directly at the same locked version.

Selecting a model, transmitting recordings and enabling paid calls require
separate approval. No real provider was called in validation. Exact substring
citations and a valid JSON shape cannot establish transcript accuracy. Check
the candidates against the original clip. Confidence is uncalibrated model
output; the same model produces the segments and candidate facts.

## Current limits

- no arbitrary remote media URLs;
- no server-side object storage or background job queue;
- no automatic long-meeting chunking;
- no full-transcript archive, image/PDF/OCR ingestion, or MCP media upload;
- no independent speaker verification or biometric identification;
- no embedding generation on media approval; reindex explicitly when semantic
  retrieval is enabled;
- no real-model quality acceptance in this release.

"Anything to Memory" is the product direction, not a claim that every file
format is already supported.

The next production-grade step is an authenticated object-upload flow plus
asynchronous chunk processing, explicit retention controls, and measured
audio/video retrieval quality on an approved meeting dataset.

## Validation

Build first with `npm run build`. Then run `npm test`, `npm run test:media`,
`npm run test:runtime`, `npm run test:knowledge` and `npm run test:oauth`.
All media responses are synthetic and intercepted, with zero external model
calls. `test:media` also exercises JS and Python sync/async against loopback
HTTP. Set `PYTHON_BIN` to a Python with the existing `httpx==0.28.1` optional
dependency; its default is this checkout's local Python build environment.

Checks cover MIME/size/consent, speech/visual evidence, unknown speakers/times,
scoped access, review-before-search, repeat requests, concurrent changes,
malformed output, failure sanitization, expiry/deletion and SDK transport.
They do not measure word error rate, speaker accuracy, temporal accuracy,
factual recall or real-media retrieval quality.

### November 10 local results

| Check | Result |
| --- | --- |
| Product unit tests | 43 passed |
| Media Worker tests | 7 groups passed; 14 intercepted provider calls |
| Core memory Worker tests | 29 groups passed |
| Knowledge Worker tests | 8 groups passed |
| MCP OAuth tests | 9 groups passed |
| Python transport tests | 4 sync and 5 async passed |
| SDK/OpenAPI checks | 17 legacy API operations, clean JS archive install and both TS module modes passed |
| Existing SQLite migration | Passed |
| TypeScript, Vite and Worker dry-run | Passed |
| Documentation links and language | Passed |

The media runtime suite runs the JS and Python sync/async examples as well as
the store-search-delete workflows. There were zero production requests and
zero real model calls. The console's audio form was inspected in a local
browser at desktop and mobile size. No real file was uploaded through the
browser. The temporary local UI key was revoked afterward.
