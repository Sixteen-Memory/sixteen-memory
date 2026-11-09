# Memory service

**Access, rules, persistence, and provider boundaries.**

[Architecture](../../docs/ARCHITECTURE.md) · [Code map](../../docs/REPOSITORY_MAP.md)

| File | Responsibility |
| :--- | :--- |
| [index.ts](index.ts) | HTTP routes, Origin, rate limits, credentials, sessions, and responses; includes current answer-model calls |
| [domain.ts](domain.ts) | Core types, input validation, access rules, and version constraints |
| [project.ts](project.ts) | SQLite Durable Object, baseline lifecycle, indexes, keys, and request records |
| [intelligence.ts](intelligence.ts) | Extraction, maintenance, semantic retrieval, and reindex orchestration |
| [intelligence-domain.ts](intelligence-domain.ts) | Candidate facts, source evidence, and update-action validation |
| [intelligence-store.ts](intelligence-store.ts) | Ingestions, vectors, evidence, review, and commits |
| [fact-slots.ts](fact-slots.ts) | Controlled fact fields and alias mappings |
| [memory-attributes.ts](memory-attributes.ts) | Categories, metadata, events, and validity windows |
| [memory-filter.ts](memory-filter.ts) | Filter-tree validation and parameterized SQL |
| [providers.ts](providers.ts) | Generation and embedding provider calls |
| [embedding-config.ts](embedding-config.ts) | Dimensions, API modes, and index identity |
| [generation-options.ts](generation-options.ts) | Output-token and thinking-parameter compatibility |
| [conversations.ts](conversations.ts) | Explicit complete-conversation storage, pagination, search, expiry, and deletion |
| [knowledge.ts](knowledge.ts) | Two-pass model orchestration for source-linked organization |
| [knowledge-domain.ts](knowledge-domain.ts) | Wiki/graph output validation and exact source citations |
| [knowledge-store.ts](knowledge-store.ts) | Review jobs, derived pages/edges, source-version invalidation |
| [evidence-index.ts](evidence-index.ts) | Current-version retained-source lexical index |
| [memory-context.ts](memory-context.ts) | Complete-record context budgets and rank fusion |
| [memory-review.ts](memory-review.ts) | Read-only duplicate, slot-difference, and source-age checks |
| [mcp.ts](mcp.ts) | Stateless read-only Streamable HTTP MCP adapter |

## Maintenance rules

- Verify authorization server-side; query conditions cannot broaden scope.
- Do not wait for model calls inside database transactions; final commits must account for concurrent changes.
- Preserve source text and role boundaries. Assistant messages do not prove business outcomes.
- Do not silently treat model failure as success or switch providers automatically.
- Do not mix old and new vectors after model, dimension, or configuration changes.
- Explain migrations when changing storage structure; do not downgrade directly to incompatible code.
- Complete conversations are explicit application writes, not implicit capture.
- Wiki pages and graph edges are derived caches. Invalidate them whenever their user scope changes.
- MCP requires a user-scoped Bearer key and exposes no writes or caller-controlled user scope.
