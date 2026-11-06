# Code map

[Documentation](README.md) · [Architecture](ARCHITECTURE.md)

## Where to start

| Task | Entry point |
| :--- | :--- |
| Edit the homepage, navigation, or bilingual product pages | [homepage/src](../homepage/src/) |
| Inspect API routes and authentication | [worker/index.ts](../product/worker/index.ts) |
| Change writes, versions, or deletion | [project.ts](../product/worker/project.ts) + [domain.ts](../product/worker/domain.ts) |
| Change extraction and review | [intelligence.ts](../product/worker/intelligence.ts) + [intelligence-domain.ts](../product/worker/intelligence-domain.ts) |
| Change categories and validity windows | [memory-attributes.ts](../product/worker/memory-attributes.ts) |
| Change filter behavior | [memory-filter.ts](../product/worker/memory-filter.ts) |
| Configure generation or embeddings | [providers.ts](../product/worker/providers.ts) + [embedding-config.ts](../product/worker/embedding-config.ts) |
| Edit the console | [product/src](../product/src/) |
| Change client methods | [SDK](../product/sdk/README.md) |
| Run an end-to-end continuity example | [Examples](../product/examples/README.md) |

## Service core

```text
product/worker/
├── index.ts                  HTTP, authentication entry, and responses
├── domain.ts                 Types, validation, versions, and access rules
├── project.ts                Durable Object and baseline SQLite storage
├── intelligence.ts           Intelligent writes, search, and reindex orchestration
├── intelligence-domain.ts    Fact, evidence, and maintenance-action validation
├── intelligence-store.ts     Intelligent-path data and commits
├── fact-slots.ts             Controlled fact fields
├── memory-attributes.ts      Categories, metadata, and time attributes
├── memory-filter.ts          Filter validation and SQL compilation
├── providers.ts              Generation and embedding adapters
├── embedding-config.ts       Configuration, fingerprints, and dimensions
└── generation-options.ts     Compatible generation parameters
```

These files form one Worker, not separately published packages.

The website follows the same principle: `src/` contains pages, `public/` holds assets and font licenses, `scripts/` prepares the SDK download and route HTML, and `tests/` checks presentation and interaction constraints.

## Match checks to changes

| Change | Starting point |
| :--- | :--- |
| Documentation, README, or evidence paths | `npm run check:docs` |
| Website code | `npm run check:website`, then inspect affected pages |
| Worker or SDK rules | `npm run check:product` and relevant local runtime checks |
| Database structure | Migration checks and compatibility notes; do not directly downgrade to an incompatible Worker |
| Real-model or retrieval quality | Separately approve data, models, and budget before evaluation |

Fixed-response provider fixtures are not model-quality scores. Documentation changes do not justify repeating the entire backend suite or running paid evaluation.

## One source of truth

Develop only in this repository. The old prototype workspace is historical reference, not a second active codebase. Import old files through reviewed changes after checking provenance, secrets, dependencies, and differences; do not overwrite whole directories.
