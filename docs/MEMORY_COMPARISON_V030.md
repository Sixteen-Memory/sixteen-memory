# SixteenMemory v0.3 versus Mem0 and Anthropic memory patterns

Reviewed November 9, 2026, after v0.3 deployment and the first approved real-Qwen
diagnostics. This replaces the capability conclusions of the
[earlier same-day comparison](MEMORY_RESEARCH_2026-11-09.md), not its historical
implementation log.

## Bottom line

SixteenMemory now provides a working, source-preserving memory foundation,
complete submitted-conversation retrieval, a read-only MCP endpoint and a
knowledge-workspace implementation. It is **not yet equivalent to Mem0's mature
managed product, nor to Anthropic's demonstrated iterative dreaming workflows**.

The biggest remaining gap is no longer merely the absence of a Wiki UI or Python
client. It is validated knowledge quality, useful representation-aware retrieval,
incremental maintenance, feedback-driven correction, integration breadth, and
operational scale. Adding feature names does not close those gaps.

## Comparison boundaries

- **SixteenMemory:** deployed source `4f6a6bc`; latest source-only diagnostic work
  adds cumulative budgeting and an embedding-only test. The
  [release receipt](../product/RELEASE_0.3.0_VERIFICATION.md) and
  [Qwen diagnostic receipt](../product/QWEN_ACCEPTANCE_2026-11-09.md) distinguish
  engineering checks, live no-model checks, successful inference, and blockers.
- **Mem0 OSS:** inspected Python implementation at
  `f1791daa86d469249c9b002f62644d58a1eb96a0`, the GitHub API head returned during
  the source inspection. Main branches and search-engine snapshots can differ;
  source-specific statements below refer to this immutable revision.
- **Mem0 Platform:** current vendor documentation retrieved November 9, separate
  from OSS. Its hosted-only features and published scores must not be attributed
  automatically to the open-source package. No paid Mem0 benchmark was run.
- **Anthropic:** *The components of agent memory*, November 6, 2026, plus the
  dreaming cookbook and knowledge-wiki quickstart. Quickstart inspection used
  `4a4224bdf0e9cfb3332167b69c90457403813625`. These are research findings and
  Managed Agents workflows, not a second cross-provider memory API.

## Updated capability matrix

| Area | SixteenMemory v0.3 | Mem0 OSS / managed Platform | Anthropic article and examples |
| --- | --- | --- | --- |
| Product form | Private Worker/SQLite API, management console, JS/TS development client, Python source client | OSS library/server plus managed service, clients, CLI and integrations [1,4] | Research plus Managed Agents workflows and notebooks [5,6] |
| Original material | Explicit complete conversations, role/time preservation, pagination and lexical search; no implicit app capture | Memory-centric API; raw-message writes and local plugin capture exist. Do not assert it lacks all transcript capabilities [1] | Logs/documents remain available to verify notes and answer through search [5] |
| Fast memory creation | Explicit writes live; two-stage extraction/maintenance implemented, text inference blocked | Inspected OSS v3 uses additive one-call extraction with context and dedup; hosted maintenance differs [1,2] | Agents write salient notes during work; offline computation can reorganize them [5] |
| Retrieval | Lexical/evidence/context live; real local embedding paraphrase test passed; no entity graph ranking or reranker | Semantic/BM25/entity signals and optional OSS reranking; backend support matters [1,3] | Source search combined with linked wiki navigation and small injected layer [5,6] |
| Graph meaning | Citation-linked **topic-page graph**; not an entity database and not used to rerank memory search | Platform graph links memories through shared entities and contributes ranking boosts; not a typed relationship ontology [3] | Linked knowledge pages and indexes support navigation; graph visuals do not imply a standard graph API [5,6] |
| Learned organization | Generate then verify once; review default; auto is explicit and model-dependent; not enabled online | Platform Dream provides supersede/merge plus opt-in scheduled synthesis; synthesized memories retain source links [2] | Multi-stage extraction/resolution/analysis/organization and iterative corrections [5,6] |
| Repeated maintenance | Any source change invalidates the user's derived wiki; next accepted run replaces all derived pages | Platform performs ongoing lifecycle/synthesis work; OSS ADD-only is not a description of all hosted behavior [1,2] | Subsequent passes repair notes, fill gaps, improve representations and tune instructions [5] |
| Current state and history | Version checks, history, revocation, expiry and manual-correction protection; validity filters are not historical snapshots | Hosted superseded records remain in default reads; `latest_only=true` narrows to active; merged records hidden by default [2] | Dates, provenance and conflicting reports are represented in task-specific notes [5,6] |
| Evidence and trust | Exact allowed-source quotation checks; assistant/tool/system messages are not accepted as proof; source changes invalidate derivatives | Source/history and synthesized-memory provenance exist. README treats agent-generated facts as first-class; verify business outcomes at integration boundary [1,2] | Grounding against transcripts/documents is central; cookbook permissions and workflows constrain writes [5,6] |
| Access and concurrency | Server-enforced user keys, optimistic versions and scope revisions; one project per deployment | OSS has entity filters; managed API supplies separate credentials/project permissions. Filters alone do not replace app auth [1,4] | Depends on memory mounts, session/tool permissions and platform configuration [6] |
| Integrations | Read-only Bearer MCP tested live; Python wheel tested locally; no OAuth or npm/PyPI publication | Hosted MCP has reads/writes and browser sign-in or Bearer auth; published clients and broader app integration [1,4] | Claude tools, agent harnesses and Managed Agents; not an identical SDK comparison [5,6] |
| Quality evidence | Local runtime/browser checks plus two real semantic successes on three records; no real generated wiki yet | Vendor-published managed-platform results, not our independent OSS reproduction [1] | Vendor-reported task experiments showing gains and failures, not universal guarantees [5] |

## Important corrections to the earlier comparison

1. **Mem0 does have learned background maintenance.** Platform Dream exposes
   Synthesis, Supersede and Merge. Its docs describe Synthesis as opt-in on Pro
   and above and the latter two as automatic. Default reads include superseded
   history; consumers who want only current facts must request it. The inspected
   open-source write path being ADD-only does not contradict this separate
   hosted lifecycle. Use current feature docs rather than generalizing from
   README shorthand or an older release. [1,2]
2. **Two graph pictures are not the same capability.** Our topic edges are
   returned and displayed, but do not currently improve retrieval. Mem0's
   Platform graph participates in scoring through shared entities. Anthropic's
   linked wiki is a representation agents navigate with source search. [3,5]
3. **Two model calls are not a learning loop.** Our generator/verifier can reject
   unsupported output and request review. It does not learn better memory
   instructions from downstream failures, iteratively repair the representation,
   or independently prove that the accepted claims are true. [5,6]
4. **MCP and Python have been added, but the ecosystem gap remains.** Our scoped
   read-only MCP and sync source client are real; they do not imply OAuth
   onboarding, write tools, registry publication or broad application plugins. [4]

## What is actually demonstrated now

The real-Qwen diagnostic attempted eight inference requests: two text requests
were refused, while six embedding requests succeeded. Two paraphrase queries
ranked their expected memories first, and a deletion removed its vector from
subsequent retrieval. The stored records were synthetic and cleaned up.

Text inference failed with `AllocationQuota.FreeTierOnly`, indicating the
model's free-quota-only protection after exhausted free allowance. No account
funding or billing guard was changed. Thus **extraction quality, real Wiki
generation, long-horizon consolidation and end-to-end answer gains remain
unvalidated**, despite deployed code and fixture success.

The token-price estimate was CNY 0.00002750 for known successful usage.
Including conservative reservations for two unknown-usage failures, the shared
budget ledger is CNY 0.01151180 against an approved CNY 0.20 ceiling. This is
not the final supplier bill. See the diagnostic receipt for exact counts.

## What to learn, and what not to copy blindly

### From Mem0

- Prioritize retrieval measurement: semantic, lexical and entity candidates,
  score calibration, reranking only if justified by held-out improvements.
- Separate a low-latency write path from source-linked background maintenance.
  Make inherited/superseded states and read defaults explicit.
- Improve distribution and onboarding: tested SDK releases, proper MCP auth,
  provider compatibility and per-application/user/run boundaries.
- Do not reuse managed vendor scores as our results or promise that OSS
  reproduces them. Do not accept an assistant's business claim as confirmation
  merely because a competitor stores agent-generated memory. [1-4]

### From Anthropic

- Preserve full sources for correction; keep only a small top-level injected
  index and retrieve details as needed.
- Evaluate wiki plus search against search alone on repeated multi-document
  questions. A wiki can add overhead without helping single-document questions.
- Add incremental, source-version-aware updates and feedback-driven repair,
  instead of claiming that one generate/check pass implements dreaming.
- Preserve scope, dates and material conditions; validate missing coverage, not
  just the existence of supporting quotes. Existing version checks prevent
  some races but do not measure completeness.
- Do not claim universal compression or accuracy improvements. Anthropic reports
  examples of both useful wikis and wikis that exceed their source size. [5,6]

## Next priorities

1. Resolve the provider's per-model billing restriction with the account owner.
   Continue generation tests under the existing shared budget, never a reset.
2. Establish a small held-out task suite with supported/unsupported answers,
   temporal corrections, deletion, negation, source completeness and role trust.
   Compare raw-source search, our memory/context, and wiki plus source search
   using the same model, data, context budget and scoring criteria.
3. Only then add incremental knowledge refresh and use citations/links in actual
   retrieval. Include failures, stale sources and cost per successful answer.
4. Run a separately approved pinned Mem0 OSS arm for empirical comparison.
   Anthropic's proprietary-model experiments cannot be treated as that same arm.
5. Improve install/auth packaging and capacity/recovery tests after quality
   evidence, rather than adding more unverified feature labels.

**Positioning recommendation:** a controlled, source-traceable memory service
for a narrow repeated business workflow. This is a direction to validate, not
an established claim of superiority in privacy, accuracy, cost or scalability.

## Primary sources

[1] Mem0 source/README:
`https://github.com/mem0ai/mem0/tree/f1791daa86d469249c9b002f62644d58a1eb96a0`

[2] Managed Dream:
`https://docs.mem0.ai/platform/features/dream`

[3] Managed Graph Memory:
`https://docs.mem0.ai/platform/features/graph-memory`

[4] Managed MCP:
`https://docs.mem0.ai/platform/mem0-mcp`

[5] Anthropic article, November 6, 2026:
`https://www.anthropic.com/research/components-of-agent-memory`

[6] Dreaming cookbook and pinned wiki example:
`https://platform.claude.com/cookbook/managed-agents-cma-dreaming-with-a-dynamic-workflow`
`https://github.com/anthropics/claude-quickstarts/tree/4a4224bdf0e9cfb3332167b69c90457403813625/managed-agents/knowledge-wiki`

These are vendor source, documentation and reported results, not an independent
quality certification. No third-party implementation was vendored.
