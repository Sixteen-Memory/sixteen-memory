# P0 evaluation runner

Default `node eval/run.mjs` is a **preflight**, not a benchmark. It writes missing
configuration and `evidence=not_run`; no provider calls occur.

Install isolated optional dependency with `cd eval && npm ci`. This directory pins
`mem0ai@3.3.1` (OSS, not Platform). Its SQLite dependency may need its normal native
build installation; an `--ignore-scripts` install alone is not sufficient proof of
runtime readiness. Mem0 is not added to the production Worker.

Real run:

1. Supply approved `EXTRACTION_{BASE_URL,MODEL,API_KEY}`,
   `EMBEDDING_{BASE_URL,MODEL,API_KEY}`, and
   `EVAL_ANSWER_{BASE_URL,MODEL,API_KEY}`.
2. Check the provider pricing and authorize a call ceiling `EVAL_MAX_CALLS` (1..500).
   Use `EVAL_APPROVED=yes` and `node eval/run.mjs --execute`.
3. Use a new output directory. Do not reuse result directories after changing code
   or inputs. No automatic resuming/resampling.

The Worker runs locally against real remote models; no production product memory
is read or changed. Every case gets independent scope and a fresh Mem0 collection.
No-memory/recent/raw-FTS/Sixteen-hybrid/Mem0-OSS groups use the same source text,
questions, answer model, 6,000-character evidence budget, 10 retrieval results and
500 output token maximum. A character budget is not a token budget.
Temperature is omitted consistently at the transport boundary by default, including
Mem0 requests; an explicit compatible `EVAL_TEMPERATURE` applies to all groups.
This avoids claiming omission is deterministic or forcing unsupported zero.
Embeddings use the same configured Qwen model and dimensions for Sixteen and Mem0.
The paired runner currently requires OpenAI-compatible mode for both; it refuses
to compare a native query/document protocol on one side with different semantics
on the other. Protocol and dimensions are recorded in the preflight.

The raw-FTS baseline currently writes with the same configured embedding path, so
its indexing cost is recorded as baseline preprocessing rather than claimed to be
necessary for FTS; retrieval itself is lexical. The two systems' built-in prompts
and extraction/storage internals differ and are not represented as identical.

Mem0 OSS has no historical timestamp parameter support in this version. The same
explicit observation-date prefix is therefore included in source text for all groups;
avoid complex relative-date benchmark claims until this normalization is validated.
Our observed timestamps support write ordering, not general temporal QA.

Inputs carry required/forbidden answer fragments for a deterministic diagnostic
scorer; those labels never enter extraction, search or answer inputs. This scorer
can misread negation/paraphrases; retain answers and manually audit them before any
external quality claim. An independent answer judge/human scoring protocol is not
completed by substring checks.

The network gate permits only configured HTTPS provider origins, disables Mem0
telemetry, counts actual outbound calls and records returned usage. It stops remote
traffic after first error or ceiling. After a provider failure, any subsequent library retry is denied before outbound
traffic. Legitimate repeated successful requests count toward the ceiling. This is
not a claim that Mem0 itself never retries. The supported OpenAI web shim is loaded
before Mem0 so requests use the budget gate, rather than bypassing it via node-fetch.

Extracted scopes needing human review stop the automatic run; do not auto-approve
with access to gold. This reports a review requirement, not a model score.

Current fixtures are synthetic development diagnostics. The first approved
real-provider run is documented in [the receipt](../QWEN_ACCEPTANCE_2026-11-09.md):
small embedding checks passed; text generation hit an account restriction.
A comparative quality claim is not established.

For the first bounded Qwen product-path check, use `qwen-provider-pilot.mjs`.
Its ignored 0600 settings file points to an existing Bailian CLI profile; it never
copies the API key into the project or report. Preflight is free:

```sh
QWEN_PILOT_CONFIG=.local/qwen-pilot/settings.json node eval/qwen-provider-pilot.mjs
```

Execution is limited to 14 requests. Before each request the runner reserves an
estimated cost using request UTF-8 bytes plus message overhead and the output
limit, then checks returned usage. The approved local estimate may not exceed
CNY 0.10; this is not an account-level billing cap. Missing usage or a failed
request stops the run without retry, and unknown cost is not reported as zero.
It requires explicit cost approval, `QWEN_PILOT_APPROVED=yes`,
`QWEN_PILOT_APPROVED_MAX_COST_CNY` matching the settings, and `--execute`.
It tests the local product path only; the full five-group comparison is separate.

Offline adapter checks:

The same Qwen runner accepts `--knowledge` for three small source-linked wiki
diagnostics (at most six text calls, no embeddings). It retains generated pages
in the private report, tests exact idempotency and source-deletion invalidation,
and reports `requires_independent_quality_review`, never automatic quality
acceptance. The same explicit cost-approval guards apply. Reconfirm public rates
and the allowed account before execution.

```sh
QWEN_PILOT_CONFIG=.local/qwen-pilot/settings.json node eval/qwen-provider-pilot.mjs --knowledge
```

This command is preflight only without `--execute` and approval variables.
Review generated claims for supported meaning, preserved conditions, unverified
assistant claims and missing coverage. The generating model and a same-provider
verifier are not independent quality judges.

```sh
node eval/smoke.mjs
node eval/run.mjs --pipeline-smoke
```

These use fixed provider responses. The pipeline report is explicitly labelled
`simulated-pipeline-smoke-not-quality`; accuracy and provider-token summaries are
null, not competitive scores. The installed native SQLite addon and all five
adapter paths were exercised without real model traffic.

## Shared budget and embedding-only diagnostic

Use `--retrieval` for three explicitly stored memories, two paraphrase queries and
a post-delete semantic query (six embedding calls; no text generation). It is a
connectivity/behavior diagnostic, not a competitive or held-out quality score.

The private settings may provide `cumulative_budget_file` and execution requires
`QWEN_PILOT_APPROVED_TOTAL_CNY` for that file (up to CNY 0.20). The ledger locks
for the run, reserves before sending each call, and settles only known usage.
Failure with unknown usage retains its full reservation. All retries and distinct
workflows from one approval must share that ledger; never reset it to restart
the allowance. An interrupted process leaves a lock for manual reconciliation.
The original per-run CNY 0.10 gate remains in addition to the cumulative gate.


## Confirmed quota change and continuation

[Continuation results](../QWEN_CONTINUATION_2026-11-09.md) supersede the original
provider-blocked status. Optional `save_text_diagnostics: true` in private pilot
settings retains only synthetic generated text in ignored 0600 JSONL files.
It is off by default and never records keys, headers or full request prompts.
The same cumulative ledger covers diagnostics and fixes; the latest aggregate
is CNY 0.02106505 known usage plus unknown-call reservations across 31 calls.
Memory-path assertions passed. Knowledge coverage and meaning preservation did
not pass review; no competitive or automatic-quality claim is established.
