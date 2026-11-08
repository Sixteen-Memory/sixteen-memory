# TypeScript / JavaScript SDK

A zero-runtime-dependency, server-side ESM client for the online SixteenMemory
v0.1 API. Requires Node.js 20.3 or newer. The company repository remains private;
this client download is not an open-source or npm registry release.

## Install

SDK 0.2.0 is the private integration candidate. It is not yet published to the
website or npm. Build a local package from an authorized checkout:

```sh
mkdir -p output/packages
npm pack ./product/sdk --pack-destination output/packages --ignore-scripts
# In your consuming application:
npm install /path/to/output/packages/sixteen-memory-sdk-0.2.0.tgz
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
API keys belong in the server environment, never in browser code or URLs.
Use user-scoped keys; administrator keys can search the whole project.

## Methods

| Group | Methods |
| :--- | :--- |
| Service and identity | `health`, `me` |
| Same-origin console sessions | `login`, `logout`; Node does not manage cookies automatically |
| Memory | `add`, `get`, `list`, `search`, `update`, `history`, `revoke`, `delete`, `exportPage` |
| Administrator only | `keys`, `createKey`, `revokeKey`, `requests` |
| Optional provider | `answer` requires server configuration and may incur costs; it is never called automatically |

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
`MemoryApiError` preserves HTTP `status` and service `code`.
`MemoryTransportError` classifies `aborted`, `timeout`, `network_error`,
`request_too_large`, `response_too_large` and `invalid_response`, without raw
causes or URLs. Invalid inputs such as non-serializable JSON can still throw
native exceptions before a request. Do not log raw service messages or credentials.

Every method accepts an optional final `{ signal }` argument. The caller's
abort signal is combined with `timeoutMs`. JSON requests are capped at 64 KiB;
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

## Source compatibility

In the private repository, `product/sdk/index.mjs` retains the original source
client and its development ingestion, evidence, filter and reindex paths.
`index.d.mts` describes that private entry using development service types.
It is compiled in the product's Bundler environment, not packaged for external use.
Those features are **not included in this release package** and are not online.
`product/sdk/client.mjs` is the stable client. The old single-file website URL,
`/downloads/sixteen-memory-sdk.mjs`, remains available as a bundled legacy client.

For a direct typed ESM import outside npm, download
`sixteen-memory-client.mjs`, `sixteen-memory-client.d.mts`, and `schema.d.ts`
from the website's `/downloads/` directory and keep them together.
`manifest.json` contains SHA-256 hashes for the published artifacts.

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
