# SixteenMemory / Product

[Quickstart](../docs/QUICKSTART.md) · [Architecture](../docs/ARCHITECTURE.md) · [Code map](../docs/REPOSITORY_MAP.md) · [Roadmap](../docs/ROADMAP.md)

Development source v0.3.0. Read the [release receipt](RELEASE_0.3.0_VERIFICATION.md) for deployment and model-validation status. This service is separate from the website, demonstration prototype, and legacy competition service.

The public entry point is `https://console.sixteenmemory.com`. Deployment credentials and operating records are not included in the repository.

See the [P0 implementation notes](P0.md) for intelligent paths, test scope, and outstanding validation. The November 5, 2026 round added a fact-slot registry, metadata, categories, validity windows, and compound filters; see [API additions](ROUND1_API.md). These additions are API-level features, not a claim that the console already exposes every field. Generation targets OpenAI GPT or Alibaba Qwen; semantic embeddings use Qwen only. See [provider policy](PROVIDER_POLICY.md).

## Recorded v0.1.0 production baseline

- Real SQLite storage: create, read, list, explicit update, history, deactivate, delete, expiry cleanup, and paginated export.
- Chinese and English lexical retrieval over active memories, without semantic retrieval or automatic extraction enabled.
- Administrator credentials, user-scoped read-only/read-write keys, server-side scope checks, and revocable login sessions.
- Console connected to the real API: memory lists, sources, history, search, key management, and request records.
- JavaScript SDK and customer continuity example.
- Optional answer-model endpoint; returns 503 when unconfigured rather than fabricating an answer.
- Worker and Pages Service Binding, with baseline login and API rate limits.

The [Vercel AI SDK 7 adapter](integrations/vercel-ai/README.md) was added to the
repository on November 8, 2026. Its local tests cover both the recorded v0.1.0 source
fixture and the current Worker runtime; pushing source does not deploy a service.

The November 9 v0.3 deployment adds [source search, bounded context, read-only
memory review](MEMORY_COMPONENTS.md), explicit complete conversations,
source-linked knowledge pages, a topic graph, read-only MCP, and a Python client.
Routes that do not need models are live. Model-driven organization remains
disabled on production until provider/cost approval and quality acceptance.
The stable v0.1 OpenAPI and website-download SDK remain compatibility artifacts.

## Run locally

For Codex and Claude Code, see [Code Agent connections](integrations/code-agents/README.md).
The November 12 addition provides native MCP configuration helpers,
metadata-only connection checks and the deployed `GET /v1/capabilities`; see
[release results and limitations](AGENT_ACCESS_RELEASE_2026-11-12.md).
This API-key profile remains read-only and user-scoped; the separate
existing OAuth and approved-write flow is unchanged.

From `product/`:

```sh
npm ci
npm run prepare:local
npm run types
npm run build
npm run dev
```

Use `npm run start:local` if the preview must outlive the terminal command. Process IDs and logs are stored under `.local/`. Startup stops if a required port is occupied; it does not terminate other services.

- Console: `http://127.0.0.1:4191`.
- Built application and API: `http://127.0.0.1:8790`.

First-run preparation generates a local-only administrator key in `.dev.vars` with mode 0600. Read `ADMIN_KEY` locally to sign in. Never put the file or its value in Git, browser source, or chat.

Data lives in `product/.wrangler/state/`, not browser localStorage. It survives restarts; deleting that directory deletes local data.

The bundled API guide is `public/quickstart.html`. Create a scoped application key in the console, set `SIXTEEN_API_KEY` in the terminal, then run:

```sh
SIXTEEN_BASE_URL=http://127.0.0.1:8790 \
SIXTEEN_USER_ID=example-user \
node examples/customer-continuity.mjs
```

The example writes, searches, updates, and deletes a synthetic record without model calls. Existing sample localization and product interface language are unchanged by repository documentation translation.

## Checks

```sh
npm test
npm run build
npm run test:runtime
npm run build:pages
```

`test:runtime` exercises the actual local Workers/SQLite runtime through a Pages Service Binding. It creates and cleans up isolated temporary storage, without accessing production data or calling models.

Coverage includes login, key scopes, project isolation, concurrent version conflicts, idempotency, history, deactivation, online physical deletion, expiry cleanup, restart persistence, and SDK behavior.

## Data behavior

- `source` is caller-supplied evidence, not an independently verified truth claim.
- A repeated `request_id` checks the request content. Identical retries within 30 days do not duplicate the record. A deleted or expired original returns 410.
- Updates require `expected_version` and do not overwrite concurrent changes. Previous content and sources are preserved in history.
- Deactivation preserves history but excludes the record from retrieval. Updating a deactivated record reactivates it.
- Deletion clears online content, sources, history, and the FTS index. The retry table retains only the request digest and original ID to prevent a retry from recreating the record.
- A null expiry means no automatic expiry, not exemption from capacity limits.
- Export is a paginated read of current records, not a database backup or consistent snapshot. Concurrent changes can produce records from different points in time.
- Request records contain operation, status, duration, credential ID, and timestamp. The latest 1,000 are retained, without query or memory content.
- Platform recovery-copy retention is separate from online deletion; see deployment notes.

## Current limitations

See the [roadmap](../docs/ROADMAP.md) for the distinction between the production baseline and development candidates. This is not a complete enterprise release. Outstanding work includes:

- Real-model validation and production enablement of extraction, semantic retrieval, and automatic knowledge organization; general temporal reasoning is not implemented.
- Multi-organization signup, SSO, and project membership. Each deployment currently has one fixed project.
- Strict global quotas, comprehensive abuse controls, load validation, and regional network checks. Current rate limits use approximate per-location counters.
- Cloud backup/recovery drills and reapplying deletions after restoration.
- Matched-condition Mem0 evaluation, real customer pilots, and full paid-model validation.

Interface limits: 10,000 current records per project; 64 KiB per request; 8,000 characters each for content and source text; up to 50 search results. History also consumes storage. These are interface limits, not demonstrated production capacity. Complete usage and billing-cap management is not available.

## Files

```text
worker/       API, authorization, storage, and history
src/          React console
sdk/          JavaScript client with no runtime dependencies
examples/     Synthetic continuity examples
integrations/ Framework adapters with independent dependency locks
pages/        Domain entry and Service Binding
test/         SDK and Workers runtime checks
DEPLOYMENT.md Deployment boundaries and prerequisites
```

## v0.3 additions

[Complete conversations, source-linked Wiki/topic graph and MCP](KNOWLEDGE_RELEASE.md)
are implemented with a console workspace and [Python SDK](sdk-python/README.md).
The November 23 release adds [incremental source dependencies, conflict labels
and reviewed single-page rebuilds](INCREMENTAL_WIKI_2026-11-23.md); see the
[production receipt](INCREMENTAL_WIKI_RELEASE_2026-11-23.md) for verification and limits.
Model-driven organization is separate from deployment: it requires approved
provider configuration and independent quality review.


SDK hardening and native async Python: see the [ecosystem release](ECOSYSTEM_RELEASE_2026-11-09.md).

MCP preregistered OAuth and explicitly approved memory writes: [release contract and tests](MCP_OAUTH_RELEASE_2026-11-09.md).
