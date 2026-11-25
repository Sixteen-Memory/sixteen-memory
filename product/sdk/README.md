# TypeScript / JavaScript SDK

A zero-runtime-dependency, server-side ESM client for the online SixteenMemory
v0.3 API. Requires Node.js 20.3 or newer. Licensed under Apache-2.0 in the
open-source `Sixteen-Memory/sixteen-memory` repository; distributed via source
checkout or versioned website archive (not yet published to the npm registry).

## Install

SDK 0.3.0 is delivered as open-source code and as a versioned website archive, not yet through the npm registry.
Build from a local checkout or install the website archive:

```sh
mkdir -p output/packages
npm pack ./product/sdk --pack-destination output/packages --ignore-scripts
# In your consuming application:
npm install /path/to/output/packages/sixteen-memory-sdk-0.3.0.tgz
```

```ts
import { SixteenMemory, MemoryApiError, type Memory } from "@sixteen-memory/sdk";

const client = new SixteenMemory({
  baseUrl: "https://console.sixteenmemory.com",
  apiKey: process.env.SIXTEEN_API_KEY,
  timeoutMs: 15_000,
});

const saved: Memory = await client.add({
  request_id: "example-1",
  user_id: "example-user",
  content: "Prefers concise replies.",
  source: {
    type: "conversation",
    ref: "example-1",
    text: "Please keep replies concise.",
    observed_at: "2026-11-01T08:00:00Z",
  },
});
const found = await client.search({ user_id: saved.user_id, query: "concise" });
const updated = await client.update(saved.id, {
  content: "Prefers detailed replies.",
  source: { ...saved.source, text: "Please use detailed replies." },
  expected_version: saved.version,
  reason: "Explicit user correction",
});
```

For JavaScript, omit the `type Memory` import and type annotations.
The base SDK rejects external non-HTTPS URLs, embedded URL credentials, query/fragment
configuration and malformed keys. Loopback HTTP is allowed for local tests.
API keys belong in the server environment, never in browser code or URLs.
Use user-scoped keys; administrator keys can search the whole project.

## Methods

`ingestMedia` is new in this development checkout, not yet in the website
archive. See [Anything to Memory](../ANYTHING_TO_MEMORY.md) for consent,
clip limits, provider setup, review and deletion.

| Group | Methods |
| :--- | :--- |
| Service and identity | `health`, `me` |
| Same-origin console sessions | `login`, `logout`; Node does not manage cookies automatically |
| Memory | `add`, `get`, `list`, `search`, `update`, `history`, `revoke`, `delete`, `exportPage` |
| Administrator only | `keys`, `createKey`, `revokeKey`, `requests` |
| Optional provider | `answer` requires server configuration and may incur costs; it is never called automatically |
| Reviewed ingestion | `ingest`, `ingestMedia`, `ingestion`, `ingestions`, `resolveIngestion`; media requires a configured provider and explicit consent |

Request and response types come from the included `openapi.json`. Exported types
include `Memory`, `Source`, `CreateMemoryInput`, `UpdateMemoryInput`,
`SearchInput`, `SearchResult`, `MemoryPage`, `ExportPage`, `HistoryEntry`,
`PageOptions`, `ClientOptions`, `CallOptions`, `Identity`, `KeyRecord`,
`AuditEntry`, `paths`, `operations`, and `components`.
The low-level `request` method returns `unknown`; callers must check its shape.
TypeScript checks calls at compile time, not responses from arbitrary servers.

## Paging and conflicts

`list` and `exportPage` return at most 50 records. Pass `next_cursor` into
`cursor` until it is null. An export reflects current records, not a snapshot.
Updates replace content and source; omitting `expires_at` resets it to null.
Update, revoke, and delete require the current `expected_version`.
Deactivation leaves a record readable but excludes it from search.
Deletion removes online data and history, not confirmed backup copies.

The client never retries automatically and refuses HTTP redirects.
`MemoryApiError` preserves HTTP `status` and a bounded validated service `code`,
never the raw server message. Invalid codes become `request_failed`.
`MemoryTransportError` classifies `aborted`, `timeout`, `network_error`,
`request_too_large`, `response_too_large`, `invalid_response` and `invalid_pagination`, without raw
causes or URLs. Invalid inputs such as non-serializable JSON can still throw
`invalid_input` before a request. Do not log raw service messages or credentials.

Every method accepts an optional final `{ signal }` argument. The caller's
abort signal is combined with `timeoutMs`. JSON requests are capped at 64 KiB,
except `ingestMedia`, which accepts at most 10 MiB of JSON for a clip capped at
7 MiB before Base64 encoding;
responses default to 16 MiB, configurable through `maxResponseBytes`. Large
history responses over that limit fail explicitly, never silently truncate.
The framework adapter uses a tighter 256 KiB response limit. There are no retries.

```ts
try {
  await client.delete(updated.id, updated.version);
} catch (error) {
  if (error instanceof MemoryApiError) {
    console.error(error.status, error.code);
  } else {
    throw error;
  }
}
```

Keep the identical create payload, including JSON property order, when retrying
with a `request_id`. The server keeps that ID per credential for 30 days.
A changed payload returns 409; deletion or expiry returns 410 during that period.

## v0.3 methods and pagination

The installed package now includes context/evidence/review, ingestion/reindex,
conversations, knowledge, wiki and graph methods. Source `index.mjs`
reexports the same runtime. The generated OpenAPI covers the core subset;
`service-types.d.ts` describes newer methods without importing Worker internals.

Use `listPages`, `exportPages`, `conversationsPages` and `conversationPages` with
`for await` to consume pages, or `listAll`, `exportAll`, `conversationsAll` and
`conversationMessagesAll` to collect results. Filters/scope and abort signals are
preserved. Malformed/repeated cursors fail; no more than 1,000 continuing cursors.
Traversal is not a snapshot and `*All` materializes every returned row in memory.

```ts
for await (const page of client.listPages({ user_id: "example-user", filter: {
  field: "category", op: "eq", value: "support"
} })) {
  // Consume page.data privately.
}
```

Download `/downloads/lifecycle.mjs` and run it after installing this package and
setting the three `SIXTEEN_*` variables. It uses unique synthetic data and verifies
store -> retrieve -> delete -> no stale result. Never enable models just to run it.
New method availability does not enable server models. Ingestion, answer and
reindex require separately configured providers and can incur costs.

For direct ESM imports, keep `sixteen-memory-client.mjs`, its `.d.mts`,
`service-types.d.ts` and `schema.d.ts` together. Manifest hashes cover each file.

## Repository maintenance

From the repository root:

```sh
npm ci --prefix product/openapi
npm --prefix product/openapi run generate
npm run check:api
npm --prefix homepage run prepare:sdk
```

The OpenAPI tooling is development-only and has its own lockfile.
The release package contains no tools, tests, provider settings or dependencies.

## Integrated validation

From the repository root, `npm run check:integration` checks SDK types and
transport, product build, framework adapter, cookie-based console API, both
local Worker versions, HTTP chat, and clean two-package installation.
`npm run example:integration` runs the self-contained local integration.
The official mock language model is clearly labeled; neither command contacts
paid providers or modifies production data.
