# SixteenMemory for Vercel AI SDK

A server-side AI SDK 7 adapter for scoped memory retrieval, read-only model tools, and explicit user-message writes.

> **Developer preview · private source**<br>
> This package is not published to npm and is not a production-release claim. It targets the development API candidate while its retrieval and explicit-write paths are also checked against the recorded v0.1.0 source fixture.

## Install from the private repository

This package currently has no registry release. Requires Node.js 22 or newer;
the repository uses Node.js 24. Tested with `ai@7.0.165` and `zod@4.6.7`.
AI SDK 5/6 are not included in this package's compatibility claim.

In an authorized checkout:

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
```

To install it into another authorized application without publishing, run
`npm pack --pack-destination /path/to/private-artifacts` in this package and
install the resulting local archive in that application. It contains an ESM
entry point and TypeScript declarations. Imports then use
`@sixteen-memory/vercel-ai`, not a relative checkout path.

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

[`examples/server.ts`](examples/server.ts) is compile-checked and shows ordinary and streaming responses. The host must provide:

- authenticated user state and a matching user-scoped key;
- trusted Origin/session checks, body-size and rate limits;
- an approved model instance and model budget;
- production logging that does not expose keys or raw memory content.

The example retrieves memory before streaming starts so memory failures can return a useful HTTP response. It does not auto-save a generated answer.

## Security and failure behavior

- Base URLs require HTTPS, except loopback HTTP for local development. URL credentials, query strings, and fragments are rejected. Supply the service base before `/v1`, not an individual API route.
- Requests use `redirect: "manual"`, timeout and caller abort signals, a 64 KiB request limit, and a 256 KiB response limit.
- HTTP and transport errors expose sanitized error codes, not response bodies, URLs, credentials, or raw causes. There are no automatic HTTP retries.
- Cross-scope or malformed service responses fail closed. Revoked, expired, and currently invalid records do not enter context.
- Context is bounded by a character limit, preserves memory IDs and source metadata, removes raw source text, escapes markup delimiters, and explicitly warns that records are not instructions.
- There is no global cache. Create one adapter per authenticated user/request or per immutable user-scoped service context.
- Using retrieved context with a real model sends that context to the chosen model provider. This adapter neither obtains data-sharing consent nor configures provider retention. The host remains responsible for both.

Prompt injection remains an application risk. Escaping and data labels improve separation but cannot make untrusted text safe by themselves. Keep high-authority instructions in the system prompt, restrict tools and downstream business actions, and require human confirmation where appropriate.

The adapter intentionally has a small independent HTTP transport rather than
copying the existing JavaScript SDK into a distributable package. This allows
bounded responses, cancellation, redirect denial, and sanitized tool errors
without changing current SDK behavior. Both use the same existing API routes,
with compatibility checked against the real local service.

## Official framework references

- `https://ai-sdk.dev/docs/ai-sdk-core/middleware`
- `https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling`
- `https://ai-sdk.dev/docs/ai-sdk-core/testing`

Implementation was checked against the installed official package declarations,
middleware documentation, and `ai/test` mock interfaces. No Mem0 source or prompts
were copied.

## Verification

```sh
npm test          # Type declarations + 20 offline tests using official AI SDK mocks
npm run example   # Offline middleware example; no provider or service request
npm run test:runtime
```

The runtime test uses local Miniflare/SQLite against the recorded v0.1.0 source fixture and the current v0.2.1 candidate. It checks idempotent writes, retrieval, framework middleware, read/write keys, cross-user isolation, updates, deactivation, deletion, and stale-context avoidance. Provider calls and production requests are disabled.
