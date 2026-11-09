# Documentation

**Run the project. Understand the data. Make a focused change.**

[Repository home](../README.md)

## 01 / Get started

| Guide | What you will find |
| :--- | :--- |
| [Quickstart](QUICKSTART.md) | Installation, local website and product startup, keys, and ports |
| [Code map](REPOSITORY_MAP.md) | Module responsibilities, reading order, and where changes belong |
| [Examples](../product/examples/README.md) | Basic continuity flows and separately authorized intelligent examples |
| [SDK guide](../product/sdk/README.md) | Typed TypeScript / JavaScript package, methods, availability, and errors |
| [OpenAPI](../product/openapi/README.md) | Versioned specification, generated types, and local API checks |
| [Vercel AI SDK adapter](../product/integrations/vercel-ai/README.md) | Server-side retrieval middleware, read-only tools, explicit writes, and tests |
| [End-to-end integration](../product/integrations/vercel-ai/examples/end-to-end.mjs) | Runnable authenticated HTTP chat against real local storage; model mocked |

## 02 / Understand the system

| Guide | Contents |
| :--- | :--- |
| [Architecture](ARCHITECTURE.md) | Access, rules, SQLite, model calls, and deployment boundaries |
| [Memory service](../product/worker/README.md) | Key source files and maintenance rules |
| [Roadmap](ROADMAP.md) | Implemented, development-stage, and unavailable capabilities |
| [API additions](../product/ROUND1_API.md) | Development attributes, filters, validity windows, and upgrade considerations |
| [Provider policy](../product/PROVIDER_POLICY.md) | Generation and Qwen embedding configuration boundaries |
| [Core REST Quickstart source](../product/public/quickstart.html) | The product's bundled HTML integration guide; its existing localization is unchanged |

## 03 / Ship and collaborate

| Guide | Contents |
| :--- | :--- |
| [Website](../homepage/README.md) | Routes, assets, and independent static builds |
| [Product deployment](../product/DEPLOYMENT.md) | Worker, Pages, and data-operation boundaries |
| [Website deployment](../homepage/DEPLOYMENT.md) | Prerequisites for publishing static assets |
| [Contributing](../CONTRIBUTING.md) | Personal accounts, English documentation, branches, checks, and pull requests |
| [Security](../SECURITY.md) | Secrets, data, production actions, and reporting |

## 04 / Reference

- [PR 8 production repair deployment receipt](../product/PR8_DEPLOYMENT_2026-11-09.md)
- [Prioritized memory optimization plan](MEMORY_OPTIMIZATION_PLAN.md)
- [Qwen continuation after quota approval](../product/QWEN_CONTINUATION_2026-11-09.md)

- [Post-release comparison: SixteenMemory, Mem0 and Anthropic](MEMORY_COMPARISON_V030.md)
- [Approved real-Qwen diagnostic receipt](../product/QWEN_ACCEPTANCE_2026-11-09.md)

- [v0.3 conversations, knowledge and MCP](../product/KNOWLEDGE_RELEASE.md)
- [Python SDK](../product/sdk-python/README.md)
- [v0.3 release verification](../product/RELEASE_0.3.0_VERIFICATION.md)

- [Mem0 research notes](MEM0_LEARNINGS_2026-11-06.md): a pinned source revision and the approaches we do or do not adopt.
- [Agent memory research and comparison](MEMORY_RESEARCH_2026-11-09.md): Mem0 source, Anthropic's components, implemented improvements, and remaining gaps.
- [Context and evidence APIs](../product/MEMORY_COMPONENTS.md): local source search, whole-record context budget, and read-only review.
- [GitHub organization and repository](GITHUB_REPOSITORY_PLAN.md): company ownership, private visibility, and contributor identity.
- [Evaluation tools](../product/eval/README.md): separate from routine development; real requests require explicit authorization.

> Implemented does not mean deployed. Read the roadmap for recorded version status and inspect the actual environment separately.
