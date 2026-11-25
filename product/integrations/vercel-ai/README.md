# SixteenMemory for Vercel AI SDK

A server-side AI SDK 7 adapter using the shared typed SDK for scoped retrieval,
read-only tools, explicit writes, and an authenticated HTTP chat handler.

> **Developer preview · versioned download**<br>
> This package is distributed as a versioned website archive, not through npm. It targets the development API candidate while its retrieval and explicit-write paths are also checked against the recorded v0.1.0 source fixture.

## Install from source

This package is open-source under Apache-2.0 and currently has no public npm registry release. Requires Node.js 22 or newer;
the repository uses Node.js 24. Tested with `ai@7.0.165` and `zod@4.6.7`.
AI SDK 5/6 are not included in this package's compatibility claim.

In a local checkout:

```sh
cd product/integrations/vercel-ai
npm ci
npm test
npm run example
```

For the local Workers/SQLite checks, also install and build `product/` first.
From the repository root:

```sh
npm ci --prefix product
npm run build:product
npm run check:vercel-ai:runtime
```

Application dependencies must satisfy the peer range:

```sh
npm install ai@^7 zod@^4.1.8
npm install -D @types/node@^22 @types/json-schema@7.0.15
```

The adapter has a peer dependency on `@sixteen-memory/sdk@^0.3.0`.
From the repository root, prepare both archives without publishing:

```sh
mkdir -p output/packages
npm --prefix product/integrations/vercel-ai run build
npm pack ./product/sdk --pack-destination output/packages --ignore-scripts
npm pack ./product/integrations/vercel-ai --pack-destination output/packages --ignore-scripts
# In the consuming application, install both archives together:
npm install /path/to/output/packages/sixteen-memory-sdk-0.3.0.tgz /path/to/output/packages/sixteen-memory-vercel-ai-0.3.0.tgz
```

Imports use `@sixteen-memory/sdk` and `@sixteen-memory/vercel-ai`. Both 0.3.0 archives are website downloads, not public-registry packages. TypeScript consumers
need Node and JSON Schema declarations for the installed official AI SDK types.

Do not use an invented public package command. Publishing requires separate naming, access, license, changelog, and registry approval.

## Retrieval middleware

Create the adapter **inside authenticated server request handling**. Resolve the user ID and its scoped memory key from trusted application state, never from model output or an unverified request-body field.

```ts
import { generateText } from 'ai';
import { createSixteenMemory } from './product/integrations/vercel-ai/dist/index.js';

const memory = createSixteenMemory({
  baseUrl: process.env.SIXTEEN_MEMORY_URL!,
  apiKey: scopedMemoryKey,
  userId: authenticatedUser.id,
});

const result = await generateText({
  model: memory.withMemory(approvedModel),
  prompt: 'How should you reply to me?',
  maxRetries: 0,
});
```

The middleware searches with only the latest user text and appends bounded reference data to that user message. It does not replace the system prompt, does not query from assistant/tool/file/image content, and does not write the answer back to memory.

Use the same `memory.withMemory(approvedModel)` with `streamText` for streaming.
Use a model instance from your approved provider, not an implicit gateway string.
Each model step can make a fresh lexical search: there is no hidden cross-request
cache. Set a model/tool step budget and `maxRetries: 0` in the host.

## Read-only tools

```ts
import { generateText, stepCountIs } from 'ai';

const result = await generateText({
  model: approvedModel,
  tools: memory.tools,
  prompt: 'Find my communication preference.',
  stopWhen: stepCountIs(3),
  maxRetries: 0,
});
```

`searchMemory` accepts only `query`; `getMemory` accepts only `id`. Neither accepts `userId`, API keys, endpoints, filters, or write data. The application configuration and server enforce user scope. Returned context includes memory IDs and source attribution, omits raw source text, and labels records as untrusted reference data.

## Explicit writes only

```ts
await memory.rememberUserMessage({
  role: 'user',
  requestId: event.id,          // stable across retries of the same event
  ref: conversation.id,
  text: verifiedUserText,
  observedAt: event.timestamp,  // ISO timestamp with timezone
});
```

Writes are deliberately outside the AI SDK tool set. They accept only an explicit `role: 'user'` payload, store the same text as content and conversation evidence, and rely on the service's idempotency and scope checks. Assistant messages and inferred business completion are not accepted.

This stores an explicit user statement; it does not perform automatic fact
extraction or authorize storing every message. Your application must decide what
to retain and obtain any required consent. If embeddings are enabled on the
target service, a write can invoke that service's configured embedding provider;
the adapter cannot override server-side model billing.

## Server handler

`createChatHandler` is a tested package export, not a copy-paste-only example.
It accepts Web-standard Request/Response values, so a Next.js route can export
the returned function as `POST` (use the Node.js runtime). The host must provide:

- authenticated user state and a matching user-scoped key;
- exact allowed browser origins and a real per-user quota callback;
- an approved model instance and model budget;
- production logging that does not expose keys or raw memory content.

```ts
import { createChatHandler } from '@sixteen-memory/vercel-ai';

// Define these using your application session store, quota service and approved provider.
export const POST = createChatHandler({
  memoryBaseUrl: process.env.SIXTEEN_MEMORY_URL!,
  allowedOrigins: ['https://your-application.example'],
  authenticate: resolveVerifiedSession,
  rateLimit: consumeUserQuota,
  model: approvedModel,
});
```

The JSON body is strictly `{ message: string, stream?: boolean }`; supplying a
user ID, credential or unknown field returns 400. Requests are bounded to 64 KiB.
Normal responses are `{ text, memoryIds }`. Streaming responses are plain text;
errors after headers fail the response body with a sanitized error. Consumers
must treat interrupted streams as incomplete, not as a successful full answer.

Authentication and quota checks precede retrieval. Memory is retrieved before
streaming headers, output is capped at 512 model tokens, retries are disabled,
and the request abort signal reaches retrieval and generation. There are no
implicit writes. Call `rememberUserMessage` separately only for an authorized
retention event with a stable event ID and original user text.

The handler is single-turn plus long-term memory, not a conversation transcript
store. Each request carries one current user message. The host still owns
deployment, session expiry, cross-instance quota enforcement, overall request
deadlines and provider data-retention policy. The quota callback must enforce
limits atomically in a shared store in multi-instance deployments.

## Security and failure behavior

- Base URLs require HTTPS, except loopback HTTP for local development. URL credentials, query strings, and fragments are rejected. Supply the service base before `/v1`, not an individual API route.
- Requests use `redirect: "manual"`, timeout and caller abort signals, a 64 KiB request limit, and a 256 KiB response limit.
- HTTP and transport errors expose sanitized error codes, not response bodies, URLs, credentials, or raw causes. There are no automatic HTTP retries.
- Cross-scope or malformed service responses fail closed. Revoked, expired, and currently invalid records do not enter context.
- Context is bounded by a character limit, preserves memory IDs and source metadata, removes raw source text, escapes markup delimiters, and explicitly warns that records are not instructions.
- There is no global cache. Create one adapter per authenticated user/request or per immutable user-scoped service context.
- Using retrieved context with a real model sends that context to the chosen model provider. This adapter neither obtains data-sharing consent nor configures provider retention. The host remains responsible for both.

Prompt injection remains an application risk. Escaping and data labels improve separation but cannot make untrusted text safe by themselves. Keep high-authority instructions in the system prompt, restrict tools and downstream business actions, and require human confirmation where appropriate.

The adapter has no independent HTTP implementation. It calls the typed SDK's
`search`, `get`, and `add`; the SDK owns transport, limits and cancellation.
The adapter additionally validates response shape/scope and sanitizes errors
before exposing them to tools. Generated OpenAPI types supply evidence types.
The documented search request defaults to lexical retrieval on both tested APIs.

## Official framework references

- `https://ai-sdk.dev/docs/ai-sdk-core/middleware`
- `https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling`
- `https://ai-sdk.dev/docs/ai-sdk-core/testing`

Implementation was checked against the installed official package declarations,
middleware documentation, and `ai/test` mock interfaces. No Mem0 source or prompts
were copied.

## Verification

```sh
npm test          # Type declarations + 25 offline tests using official AI SDK mocks
npm run example   # Offline middleware example; no provider or service request
npm run test:runtime
npm run test:e2e     # Loopback HTTP chat -> shared SDK -> real local Workers/SQLite
npm run test:console # Actual console API module with cookie sessions
npm run test:package # Two clean archives installed offline with public-registry cache
```

The runtime test uses local Miniflare/SQLite against the recorded v0.1.0 source fixture and the current v0.3.0 Worker (legacy test label `v021`). It checks idempotent writes, retrieval, framework middleware, read/write keys, cross-user isolation, updates, deactivation, deletion, and stale-context avoidance. Provider calls and production requests are disabled.

`test:e2e` starts a temporary loopback HTTP server and both real local API
versions. It maps synthetic application sessions to scoped keys, explicitly
stores a user event, calls normal/streaming chat, verifies Bob cannot retrieve
Alice's data, updates and deactivates the record, exports/deletes it and confirms
there is no stale recall or automatic assistant-answer storage. All temporary
storage and sockets are cleaned up. This is real application/storage integration
with an official mock model, not real-model quality or production acceptance.


## Complete no-model lifecycle example

Install both versioned archives together, then download
`/downloads/vercel-lifecycle.mjs` from the website. Set `SIXTEEN_BASE_URL`,
`SIXTEEN_API_KEY` and `SIXTEEN_USER_ID` to an authorized synthetic user scope.
Run `node vercel-lifecycle.mjs`. It checks models are disabled, stores an explicit
user message, searches, deletes using the shared SDK, and checks no stale result.
The installed-package acceptance suite runs this same file unchanged.
Deletion stays an application operation; no model write tools were added.
