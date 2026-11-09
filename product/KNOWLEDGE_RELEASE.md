# v0.3.0: conversations, knowledge and clients

**Continuation update:** The user subsequently confirmed disabling free-quota
protection for `qwen-flash` only. The memory-path diagnostic then passed; real
knowledge generation revealed coverage and qualifier-fidelity failures, so
production models remain disabled. See the [continuation receipt](QWEN_CONTINUATION_2026-11-09.md).

Prepared November 9, 2026. Source version and deployment/quality status are
different: check [release verification](RELEASE_0.3.0_VERIFICATION.md) for actual
publication results. No model credential is part of this repository.

## Capabilities and limits

- Complete conversations are explicitly saved by the application, including
  user/assistant/system/tool roles, original message text, and observation times.
  Append in batches of 1-32 messages, at most 16,000 content characters per
  request. Up to 1,000 messages per conversation, 1,000 conversations and 100,000
  messages per project. These are interface limits, not demonstrated load limits.
- Conversation reads paginate by 32 messages. Follow `next_cursor` to retrieve
  every stored message. The lexical index covers every retained message, not only
  extracted facts. It does not recover conversations that were never submitted.
- Model-driven organization reads explicit selected sources in full, produces
  small source-linked wiki pages and a topic graph, and checks the generated
  statements in a second model call. A run replaces the user's entire derived
  wiki, not original memories. Include every desired source when rebuilding.
- The graph connects topic pages with `related`, `supports`, or `conflicts`
  edges and exact-source citations. It is not a general entity graph database,
  an independently verified ontology, or a multi-hop graph retrieval engine.
- Organization defaults to `review`; `mode:"auto"` publishes only after all
  model checks pass. Unsupported items remain visible in the review proposal.
  An exact citation and a second model's agreement do not prove factual truth.
  Only low-risk material should use automatic publication.
- Changing any memory or conversation in a user scope invalidates that user's
  derived pages, edges and pending proposals. This deliberately favors correctness
  over incremental rebuild efficiency. Reads also check validity/expiry.
- Review candidates expire after 24 hours. Runs do not auto-retry after provider
  errors or crashes. An interrupted run eventually expires; create a new explicit
  request only after checking prior state. No scheduled paid maintenance is enabled.
- User-only conversation evidence supports knowledge claims. Other roles remain
  searchable as original messages but cannot substantiate generated knowledge.
  Confirmed business events must use the existing trusted explicit-memory path.

## API additions

All routes use the existing same-origin policy, key/session authentication, rate
limits, content-free audit logging and 64 KiB request limit. ID reads enforce
stored ownership. Collection operations require explicit `user_id`.

| Method and route | Purpose |
| --- | --- |
| `POST /v1/conversations` | Create with `request_id`, `user_id`, `title`, `messages`, optional `expires_at` |
| `POST /v1/conversations/:id/messages` | Append with `request_id`, `expected_version`, `messages` |
| `GET /v1/conversations?user_id=...&cursor=...` | List conversations, 50 per page |
| `GET /v1/conversations/:id?cursor=...` | Read messages, 32 per page |
| `POST /v1/conversations/search` | Lexical message search: `user_id`, `query`, optional `limit` |
| `DELETE /v1/conversations/:id` | Delete with `expected_version`; clear derived caches |
| `POST /v1/knowledge/organize` | `user_id`, `request_id`, `memory_ids` and/or `conversation_ids`, optional `mode` |
| `GET /v1/knowledge/runs?user_id=...` | Latest 30 run states/proposals |
| `GET /v1/knowledge/runs/:id` | One run |
| `POST /v1/knowledge/runs/:id/resolve` | Review decision with `approve: true/false` |
| `GET /v1/wiki?user_id=...` | Current derived pages |
| `GET /v1/wiki/:slug?user_id=...` | One page with citations/source locators |
| `GET /v1/knowledge/graph?user_id=...` | Topic nodes, edges and source locators |
| `POST /v1/mcp` | Read-only MCP Streamable HTTP endpoint |

An organization run accepts at most 32 memory IDs and eight conversation IDs.
The complete source payload must fit 40,000 UTF-16 characters including metadata;
oversized selections return 413, not silently clipped input. Output limits are
eight pages, 12 claims per page, 24 edges and four citations per claim/edge.
Each claim and quote is at most 1,000 characters. The output-token cap can be
reached before these maxima; truncated model output fails rather than publishes.

Use a unique request ID per operation; an identical retry does not duplicate
messages or call a model again. Keep the same JSON key order on exact retries.
Replaying deleted source writes returns 410 within the 30-day tombstone period.
Concurrent versions and scope changes return 409.

Complete-conversation deletion is separate from deleting independently saved
explicit memories. The service does not guess whether an unrelated caller-supplied
source reference belongs to a conversation. Applications handling erasure requests
must delete both intentionally retained originals and separately created records.
Online deletion does not erase platform recovery copies instantly.

## MCP

Use the server URL `https://console.sixteenmemory.com/v1/mcp` only after the release
receipt confirms availability, with an HTTP `Authorization: Bearer ...` header.
Issue a read-only key bound to the application's authenticated user. Administrator
keys and browser cookies are rejected. Revoke the key to disconnect access.

The implementation uses the official `@modelcontextprotocol/sdk@1.32.2` and
`zod@4.6.7` (MIT; [notices](THIRD_PARTY_LICENSES.md)). Web Standard Streamable HTTP, JSON responses, stateless requests:
no legacy SSE endpoint, persistent MCP sessions, OAuth onboarding, or prompts.
Clients must support custom Bearer headers. GET/DELETE on MCP return 405.
Browser origins other than the service origin are rejected.

Tools:
`search_memories`, `get_memory`, `search_conversations`, `read_conversation`,
`list_wiki`, `read_wiki`, `knowledge_graph`.

They expose no writes, user-ID overrides, provider settings, or automatic model
calls. Retrieved data must not be promoted to system instructions. MCP reader
permissions do not make quoted text true or safe to execute.

## SDKs

The repository's `product/sdk/index.mjs` development client contains all additions
with typed declarations. The stable downloadable v0.1 SDK and OpenAPI remain
unchanged for compatibility; this guide documents the new routes separately.

The [Python SDK](sdk-python/README.md) has no runtime dependencies and supports
Python 3.9+. It includes sync lifecycle, ingestion, conversations, organization,
wiki/graph, evidence and context calls. A local wheel/source build is not a PyPI
publication. No registry name or public package availability is implied.

## Model release gate

Generation uses the existing separately configured extraction provider. Qwen
embeddings use the established provider profile; no employer gateway credentials
may be deployed. Model calls reserve from the existing 200 calls/day project gate.
This is not a currency cap, per-user quota or account billing guarantee.

The existing synthetic real-Qwen runner and the knowledge extension require
explicit approved credentials and cost limits. Engineering fixtures verify logic,
not semantic quality. Until real results are reviewed, production model bindings
remain disabled; organization returns 503 instead of simulated success.

## Migration and rollback

The change adds tables/indexes within the existing SQLite Durable Object. Existing
memory records and the Durable Object binding/class identity are preserved. Local
tests upgrade the v0.1 fixture and retain original sources/history.

Do not roll back to v0.1 while retaining newly written knowledge/conversations:
old code cannot invalidate their caches. If rollback is required, first stop new
writes and retain a private recovery/export receipt. Revert the frontend or deploy
a forward fix preserving the v0.3 storage cleanup semantics. Model failure should
disable only provider flags, not downgrade storage code.

## First approved real-provider diagnostic

See [November 9 results](QWEN_ACCEPTANCE_2026-11-09.md): embeddings passed a small
synthetic diagnostic, but the text model was refused by a provider-side
free-quota-only restriction. Generation and production-model enablement remain
blocked. An account setting must not be changed merely to turn a failed test green.
