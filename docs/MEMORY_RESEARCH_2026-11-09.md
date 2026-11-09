# Agent memory research and implementation comparison

Date: November 9, 2026.

**Historical first-iteration snapshot.** For current capabilities, the Mem0
Platform Dream/Graph distinction and real-provider findings, read the
[post-release comparison](MEMORY_COMPARISON_V030.md).

This report describes the first November 9 iteration. The subsequent v0.3 work
is documented in [conversations and knowledge](../product/KNOWLEDGE_RELEASE.md);
its runtime and publication status are recorded separately.

## Scope and source identity

This review reads the complete Anthropic article and the central Mem0 write,
search, maintenance, provider, and evaluation paths. It also examines
Anthropic's linked dreaming cookbook and knowledge-wiki example. It does not
claim to have executed every integration, read every peripheral source file,
or reproduced either organization's model benchmarks.

Mem0 is pinned to `f1791daa86d469249c9b002f62644d58a1eb96a0`, the main-branch head
returned by GitHub during this review. Anthropic's article is **The components
of agent memory**, published **November 6, 2026**, at the address without
`the-` in its URL. It is a research article, not a second open-source memory
service. The associated cookbooks are examples built on Managed Agents.

The implementation baseline is the canonical private repository at `4b59784`,
not the older product copy in the surrounding workspace.

## What Mem0 does well

1. **A clear integration surface.** The library, self-hosted service, managed
   platform, Python/TypeScript clients, CLI, and framework integrations serve
   different users. We already have a smaller typed SDK/HTTP/console foundation.
2. **Separated provider concerns.** LLM, embedding, vector-store, and reranker
   factories keep backend choices outside the memory rules. We keep existing
   provider boundaries rather than add unneeded adapters.
3. **A lower-call write path.** The inspected v3 path gathers context, makes
   one extraction call, batch-embeds facts, deduplicates hashes, and appends
   records. This preserves dated observations without eager replacement.
4. **Multiple retrieval signals.** The source combines semantic retrieval,
   keyword/BM25 scoring, and entity boosts, with optional reranking and score
   explanations. In the inspected implementation, the ranking candidate set
   originates from semantic results; provider keyword capabilities vary.
5. **Attention to cost and scale.** The evaluation documentation measures
   quality, context consumption, and latency together. It distinguishes hosted
   results from the open-source implementation.
6. **Operational APIs.** Scope identifiers, metadata filters, history, explicit
   updates/deletes, expiry, and synchronous/asynchronous clients support actual
   integrations rather than only a retrieval demonstration.

Important boundaries: README benchmark scores describe the managed platform
and explicitly include proprietary optimizations. Temporal parameters such as
`reference_date` and `timestamp` are marked platform-only in the inspected
Python API. A library's `user_id` filter is not a substitute for application
authentication. Do not attribute all hosted features or scores to OSS.

## What Anthropic contributes

| Article component | Useful lesson | Application here |
| --- | --- | --- |
| In-session notes and salience | Keep reusable knowledge, not every transient state | Preserve selective extraction; avoid indiscriminate transcript storage |
| Validated learning loops | Separate checked rules from guesses and record evidence | Keep exact user quotes, source types, versions, and explicit correction |
| Model-dependent guidance | Strong models may choose salience better; rigid rules can hurt | Do not copy a universal extraction prompt or claim it is optimal |
| Offline correction | Compare notes with the underlying transcript/document | Add direct search of retained evidence and a read-only review surface |
| New representations and wikis | Linked summaries help cross-document questions | Preserve source access; defer generated wikis until a repeated-use case is demonstrated |
| Small injected layer | Keep top-level context bounded and leave details retrievable | Add complete-record context packing with explicit omissions |
| Goal-specific organization | Preserve material terms rather than compress everything | Never cut facts or source conditions merely to fit a budget |
| Concurrent writing | Shared pages can overwrite another agent's work | Retain version checks and reject mixed-revision context |
| Repeated cleanup | Missing links and drift accumulate across sessions | Surface duplicate text, slot differences, and old primary sources |
| Open questions | Maintenance costs compute and does not always improve answers | No automatic paid background maintenance or performance claim |

The article reports benefits in some multi-document tasks and little or no
benefit in some single-document tasks. It also describes a wiki larger than its
source material. These results support testing representations for a specific
workload, not making a wiki mandatory for every agent.

The linked cookbook separates analyzers from an organizer and gives ordinary
reader sessions read-only memory access. Its examples include budgets, failure
reporting, limited tools/network access, and explicit handling of untrusted
transcripts. We adopt the separation between inspection and mutation, without
claiming that deterministic checks implement its model-driven dreaming loop.

## Changes implemented in this repository

See [API and behavior details](../product/MEMORY_COMPONENTS.md).

| Change | Before | Current local candidate |
| --- | --- | --- |
| Evidence retrieval | Sources could be read by known memory ID | Search retained primary/current-version supporting sources directly |
| Source-only details | Missing summary terms could prevent retrieval | Source matches can bring the complete memory into context |
| Context assembly | Framework-specific packing only | Private service endpoint and typed development SDK with whole-record budget |
| Context consistency | Separate reads could observe different revisions | Reject assembly if the user scope changes during retrieval |
| Memory review | Individual manual inspection | Bounded read-only duplicate/slot/old-source checks |
| Console | Memory, search, ingestion, keys, requests | Additional context, evidence, review, and linked record inspection |
| Deletion/update integration | Summary/vector lifecycle | Evidence-index lifecycle included, with old-data migration |

No production configuration, public API behavior, stable SDK export, homepage,
model provider policy, or dependency lockfile was changed. These additions are
not automatically used by the stable Vercel adapter, which remains compatible
with the recorded v0.1 service.

## Current capability comparison

| Area | SixteenMemory after this work | Mem0 at inspected revision | Anthropic article/examples |
| --- | --- | --- | --- |
| Product form | Private Worker/SQLite API, console, typed SDK and Vercel adapter | OSS library/server plus managed platform and broader integrations | Research guidance and Managed Agents examples |
| Explicit lifecycle | Versioned writes, history, revocation, deletion, expiry | Add/get/search/update/delete/history/expiry | Depends on the example's file and memory-store workflow |
| Extraction | Two-stage extraction/maintenance, exact user-source checks, review | Single-call additive extraction with context and hash dedup | Agent-authored notes and offline interpretation |
| Current facts | Controlled slots and versioned replacement; manual edits protected | Accumulated observations with explicit update API | Notes can be corrected against underlying sources |
| Retrieval | Lexical; local Qwen semantic/RRF; new source search | Semantic, BM25 and entity signals; optional reranker | Search plus linked representations and injected index |
| Context budget | New service-level UTF-16 budget; complete facts/quotes | top-k and managed-platform token-efficiency evaluation | Small injected layer and on-demand details |
| Source support | Primary/current supporting source lookup and search | Payload metadata, attribution and history; no identical claim made | Source-linked notes and transcript/document verification |
| Maintenance | Read-only structural checks; explicit editor | Additive write path and explicit lifecycle; hosted features differ | Model-driven correction, enrichment, and organization |
| Time | Event dates and validity filters, not historical reasoning | Hosted temporal reasoning; OSS temporal API limits | Date-aware notes and drift handling, not a general temporal API |
| Scope/auth | Server-enforced user keys and single-project deployment | Library entity filters; server/platform authentication separately | Tool, mount, and platform permissions depend on setup |
| Ecosystem | Typed JS/TS download, private Vercel adapter; no Python package/MCP | Larger SDK, CLI, provider and framework ecosystem | Managed Agents and notebooks, not a drop-in cross-provider service |
| Quality proof | Local deterministic/runtime checks only | Published vendor benchmarks with stated hosted scope | Reported experiments in specific tasks and models |

Our strongest demonstrated areas are explicit versioned lifecycle, scope
enforcement, source retention, and testable no-model paths. Mem0 remains ahead
in breadth of integrations, provider choices, retrieval signals, and published
scale evaluation. Anthropic's examples go much further in learned memory
organization and cross-session knowledge representations. This work does not
establish overall superiority to either.

## Deliberate exclusions and next decisions

- Do not treat an assistant's claimed business action as an equally verified
  event. Accept explicit trusted business evidence through the existing API.
- Do not convert current-fact storage wholesale to ADD-only; that changes
  customer-facing data meaning and pushes conflict handling to every read.
- Do not add a graph database, entity linker, reranker service, scheduler, or
  model-driven wiki without a workload and operational budget.
- No automatic merge/delete or fixed-age invalidation: findings are candidates
  for human or separately approved model review.
- Full transcript retention, provenance-aware learned summaries, per-agent/run
  scope, profiles, MCP, Python SDK, async job recovery and feedback remain gaps.
- Next quality study should compare summary-only retrieval, summary plus source
  retrieval, and bounded context under identical datasets, model, permissions,
  token budgets, and scoring. Add Mem0 OSS as a separate pinned arm. Measure
  recall/precision, answer support, changes/deletions, latency, and actual tokens.
  Synthetic success is not a blind evaluation; paid calls require approval.

## Sources inspected

- Mem0 repository and README:
  `https://github.com/mem0ai/mem0/tree/f1791daa86d469249c9b002f62644d58a1eb96a0`
- Core memory implementation:
  `https://raw.githubusercontent.com/mem0ai/mem0/f1791daa86d469249c9b002f62644d58a1eb96a0/mem0/memory/main.py`
- Provider factories:
  `https://raw.githubusercontent.com/mem0ai/mem0/f1791daa86d469249c9b002f62644d58a1eb96a0/mem0/utils/factory.py`
- Evaluation description:
  `https://raw.githubusercontent.com/mem0ai/mem0/f1791daa86d469249c9b002f62644d58a1eb96a0/docs/core-concepts/memory-evaluation.mdx`
- Anthropic article:
  `https://www.anthropic.com/research/components-of-agent-memory`
- Dreaming cookbook:
  `https://platform.claude.com/cookbook/managed-agents-cma-dreaming-with-a-dynamic-workflow`
- Knowledge-wiki example and analyzer prompt:
  `https://github.com/anthropics/claude-quickstarts/tree/main/managed-agents/knowledge-wiki`
- Workers runtime guidance:
  `https://developers.cloudflare.com/workers/best-practices/workers-best-practices/`

Public sources were fetched read-only on November 9, 2026. No third-party
implementation or prompt was copied into the product. Mem0's Apache-2.0 license
does not change this repository's private license.
