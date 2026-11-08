# Roadmap and status

**Build the product and integration foundation first; validate real use cases incrementally.**

[Documentation](README.md) · [Architecture](ARCHITECTURE.md)

This source and release-record snapshot was assembled on November 6, 2026. It is not live monitoring. The recorded production baseline is v0.1.0; development source is v0.2.1.

The private Vercel AI SDK adapter entry was added on November 8, 2026. This does
not change the recorded production version or publish an npm package.

The same day's 0.2.0 integration candidate unifies SDK transport, framework
adapter and console types, and adds an authenticated HTTP handler with real
local storage tests. Those package versions are private and not deployed.

## Implemented foundation

- [x] Explicit create, read, list, update, history, deactivate, delete, and paginated export.
- [x] Chinese and English lexical retrieval.
- [x] User-scoped keys, role checks, and revocable console sessions.
- [x] Console, request records, JavaScript SDK source, and examples.
- [x] OpenAPI 3.1 for online v0.1, generated TypeScript types, and a downloadable zero-dependency SDK package.
- [x] Private Vercel AI SDK 7 adapter with retrieval middleware, read-only tools, explicit writes, and local compatibility tests.
- [x] Shared SDK transport, authenticated normal/streaming chat handler, console cookie integration, and clean two-package installation checks.
- [x] Independent website, product pages, developer documentation, and bilingual navigation.
- [x] Private company repository, personal contributions, and collaboration guides.

## Development features awaiting real-model validation

| Work | Implemented | Still needed |
| :--- | :--- | :--- |
| Conversation extraction and maintenance | Source checks, candidates, fact slots, and ambiguity review | Model-quality and pilot validation |
| Semantic and hybrid retrieval | Qwen adapter, coverage checks, cosine/RRF ranking, and reindexing | Real embedding calls and retrieval-quality validation |
| Categories, metadata, and time | API validation, storage, and compound filtering | Complete console forms and release |
| Evaluation material | Local checks, synthetic cases, and isolated scripts | Independent blind review and real customer results |

Validity windows are not historical snapshots or temporal reasoning. Usage limits are not a hard account-billing cap. Credentials are not committed; possessing credentials does not validate a model path.

## Next structural work

1. Keep the console and documentation aligned with actual APIs; complete entry points for implemented features.
2. Derive new API descriptions from real routes rather than maintaining a conflicting second interface.
3. Design task state, idempotency, and recovery when batch workloads require them, not an empty queue in advance.
4. Confirm providers and use cases before scheduling a small real-model quality pilot.

These are directions, not delivery-date commitments. Ordinary website and repository maintenance does not trigger paid model evaluation.

## Not available

- Profile API or read-only MCP server.
- npm registry and Python SDK releases. The typed JS/TS package is distributed through website downloads; the Vercel AI SDK adapter remains private source.
- Webhooks, feedback endpoints, or a unified asynchronous task framework.
- Self-service signup, customer billing, organization membership, or SSO.
- Enterprise SLA, public compliance certification, validated production capacity, or customer outcome claims.

Do not represent planned work with empty directories, invented installation commands, or nonfunctional endpoints. Open-source modules belong in separate public repositories; the core repository remains private.
