# Memory optimization plan

Date: November 9, 2026.
Status: proposed work, except for the narrowly scoped knowledge fixes in
[the Qwen continuation receipt](../product/QWEN_CONTINUATION_2026-11-09.md).
No performance or schedule below is a measured production guarantee.

## Priority 0: quality and retrieval diagnostics

The existing system already has FTS5/BM25, optional semantic ranking, RRF fusion,
source search, complete-record context packing, filters and version checks.
Do not present adding "hybrid search" as a new capability.

1. Freeze development cases and acquire a separately reviewed test set.
   Once a test informs prompt changes it is development material, not blind data.
2. Record candidates by source: memory summary, exact source, conversation
   fragment, and eventually Wiki. Keep IDs, versions, scope, signals and omissions.
3. Compare raw-source search, summary-only, current hybrid/context, and
   Wiki-plus-source search under the same answer model and evidence budget.
4. Start with bounded fusion and deduplication. Add reranking/entity expansion
   only when an ablation shows useful gains exceeding latency/token overhead.
5. Calibrate no-answer and ambiguity behavior; do not treat cosine or RRF scores
   as probabilities. Keep reported facts, time, negation and conditions distinct.

**Measures:** Recall@10, ranking quality, unsupported-answer rate, stale-fact
use, useful-source coverage, context size, review rate, latency and cost per
supported answer. Show per-case failures, not only an average.

**Safety gates:** no observed cross-user exposure, deleted-record resurrection
or invented assistant-origin business completion in the negative test suite.
Passing a finite suite is not a guarantee of zero production incidents.

The real knowledge diagnostic's false qualifier and safe-but-empty refund case
make coverage and entailment higher priorities than another visualization.

## Priority 0: dependency-aware incremental maintenance

Today, a source change invalidates the user's complete derived Wiki, and an
accepted run replaces all its pages. Replace this only after lifecycle tests:

- Persist source/version-to-claim-to-page dependencies and stable page IDs.
- Mark affected claims unavailable immediately; do not serve a stale claim
  while waiting for an asynchronous refresh.
- Preserve unaffected pages, but revalidate dependent edges and shared claims.
- Create coalesced per-scope jobs with leases, idempotency and a transactional
  outbox. Explicitly separate source reads, generation and atomic publication.
- Recheck authorization and source versions at publication; a deletion or
  revocation must win against an in-flight worker.
- Record provider request state and usage. A timeout with unknown completion
  cannot be retried as though it certainly cost nothing.
- Add project/user cost ceilings, concurrency caps, stop controls, pending-review
  visibility and explicit failure recovery before any scheduled paid work.

**Measures:** affected versus total pages recomputed, freshness delay, duplicate
jobs/model calls, coverage, source-version conflicts, review backlog and cost.
Exercise edit/delete/expiry/revocation races and crash/restart between each step.
Do not add a paid cron job until cadence and billing authority are explicit.

## Priority 1: SDK and integration reliability

Focus on a small supported surface rather than dozens of thin adapters:

1. Keep JS/TS and Python behavior aligned on cancellation/timeouts, errors,
   scope, pagination, version checks, idempotency and evidence types.
2. Add a real async Python client and executable examples for the current
   Vercel integration and one Python workflow chosen by actual demand.
3. Test fresh installation, upgrades and complete write/search/delete workflows.
4. Prepare signed/versioned release artifacts and changelogs. Registry
   publication and repository visibility changes require separate approval.
5. Only then add MCP OAuth and scoped write tools with explicit approval UX.
   Keep read-only access the default; do not accept cross-scope IDs from tools.
   Authorization details must be rechecked against current official MCP specs.

**Measures:** successful fresh integrations, contract-test parity, supported
version matrix and observed onboarding failures. Set an onboarding-time target
only after users have attempted the documented workflow.

## Priority 1: capacity and recovery evidence

Current source guards: 1,000 active records per user for semantic preview and
10,000 project memories. Semantic queries read the eligible vectors and calculate
cosines in application code; raising the cap is not an indexing improvement.

1. Benchmark below/at/above existing limits locally with fixed vectors and
   synthetic data first. Report rejection behavior above the cap instead of
   calling it supported capacity. Separate provider delay from service latency.
2. Vary corpus size, number of users, concurrency and hot-user skew. Measure
   p50/p95/p99, errors, memory/CPU, queued work, index lag and per-request cost.
3. Evaluate a replaceable approximate-nearest-neighbor backend only after the
   full-scan baseline identifies a bottleneck. Candidate IDs must be rehydrated
   through authoritative scope/version/validity checks before response.
4. Test eventual-index deletion, tombstones, stale candidates, backfills,
   migration interruption and reconciliation. Never return cached deleted facts.
5. Evaluate tenant/user-sharded persistence with explicit key revocation and
   cross-shard authorization semantics. Avoid both one global hotspot and
   unbounded uncoordinated shards.
6. Exercise restarts, quota exhaustion, provider failures and restore/replay.
   Restoring old state must not resurrect records deleted after that snapshot.

**Acceptance:** choose a concrete workload and SLO after the baseline; document
hardware/runtime, load shape, sample duration and error budget. A local benchmark
cannot prove cloud capacity, and an integration smoke cannot prove an SLA.
Production load testing, new infrastructure and higher cloud spend require
separate authorization.

## Recommended delivery order

1. Finish source-support/coverage review and ship retrieval diagnostics.
2. Add bounded unified retrieval with the current service as the baseline.
3. Add dependency-aware incremental refresh behind a disabled flag.
4. Improve two supported SDK paths and MCP onboarding.
5. Use capacity evidence to decide vector-index and persistence changes.

The single-model billing switch is now off; that is not authorization for
recurring maintenance charges or a substitute for the above acceptance gates.
