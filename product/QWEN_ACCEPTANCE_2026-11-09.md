# Qwen diagnostic receipt — November 9, 2026

## Decision

**Partial result, not end-to-end acceptance.** Real Qwen embeddings passed a
small retrieval diagnostic. Text generation was blocked by the provider account's
free-quota-only setting. No production model secret or enabled flag was changed.
The production release remains v0.3.0 with lexical retrieval and models disabled.

The user explicitly approved the existing personal Bailian profile and a
**cumulative CNY 0.20 local estimated budget**. This was not authorization to
recharge, subscribe, change account-wide billing protections or spend an
unlimited amount after the diagnostic.

## Attempts and observations

| Workflow | Provider requests | Result |
| --- | ---: | --- |
| Memory extraction/update/answer pilot | 1 text | First extraction returned HTTP 403; no successful generation |
| Knowledge organization pilot | 1 text | HTTP 403 `AllocationQuota.FreeTierOnly`; provider message says free quota exhausted |
| Embedding-only retrieval diagnostic | 6 embedding | Passed against the actual local Worker and SQLite |

The text workflow stopped on its first error, without automatic retries.
A free `/models` metadata check returned the configured `qwen-flash` model.
It does not establish inference quota availability. A subsequent distinct
knowledge-workflow attempt captured the safe error code/message; it hit the
same provider restriction. No additional text request or alternate model was
tried after the restriction was identified.

Embedding configuration: `text-embedding-v4`, 1024 dimensions,
OpenAI-compatible HTTPS endpoint. Three explicitly written Chinese synthetic
memories covered peanut avoidance, weekend delivery and a Paris travel plan.

| Query | Expected record | Observed rank | Score |
| --- | --- | ---: | ---: |
| Paraphrase asking which food to avoid when ordering | Peanut avoidance | 1 | 0.49891 |
| Paraphrase asking which two days suit delivery | Weekend delivery | 1 | 0.70397 |
| Repeat food query after deleting peanut memory | Deleted record excluded | Absent | n/a |

Three calls embedded source memories, two embedded paraphrase queries, and
one queried after deletion. Both positive queries returned the expected record
first, but their top-three lists also included distractors at threshold 0.2.
This validates connectivity, configured dimensions, bounded ranking behavior
on these cases, and deletion propagation. **It is not a recall/precision,
threshold-calibration, no-answer, broad semantic quality or competitor benchmark.**
There was no independent blind reviewer or held-out dataset.

## Cost envelope

Public Beijing-region prices were rechecked on November 9:

- `qwen-flash`, at up to 128K input tokens: CNY 0.15/million input and
  CNY 1.50/million output.
- `text-embedding-v4`: CNY 0.50/million input.

Six successful embedding responses reported a total of 55 input tokens:
**CNY 0.00002750 at those rates**. This is a token-based estimate, not the
account's final invoice or cash debit; free quota may apply.

The two failed text calls returned no usage. They were **not counted as zero**:
their reservations remain CNY 0.00576900 and CNY 0.00571530. The ledger total
of known usage plus unknown-call reservations is **CNY 0.01151180**, below
the CNY 0.20 envelope. No further paid attempt is planned while blocked.

The new local shared ledger prevents separate runner invocations from each
reusing the full cumulative budget. It takes an exclusive lock, persists a
reservation before network transmission, settles only valid returned usage,
and retains reservations for unknown failures. A crash leaves the lock for
manual reconciliation rather than permitting concurrent/resumed spending.
The ledger covers these diagnostic invocations only, not other account clients.

## Data and deployment handling

- Only synthetic records were sent to the authorized provider.
- The key was read from the existing private profile; no credential was printed,
  copied into source control, provider payload logs or Worker bindings.
- Raw results, requests/usage receipts and the cumulative ledger remain ignored
  local artifacts. Public documentation contains only aggregate observations.
- The memory and retrieval runs reported zero remaining synthetic memories.
  The knowledge run's retained conversation was explicitly deleted by its
  `finally` cleanup; its local persisted storage was checked separately.
- Existing online customer scopes were not read or reindexed.
- Cloudflare secrets, provider flags, DNS, account recharge and free-quota-only
  settings were not changed. The online service remains in no-model mode.

## Remaining gate and continuation

The concrete blocker is the **configured text model's provider-side free-quota-only
restriction**, not missing permission for the local test. The provider advises
reviewing the model's free-quota-only setting and funding/verification state.
Do not infer an unverified account merely from this error.

The account owner can explicitly enable paid use for the chosen model (or
authorize a separately reviewed replacement), then continue under the same
cumulative ledger. Changing that setting can permit other clients to spend too;
the CNY 0.20 runner envelope does not cap the whole account. Do not change
billing protections implicitly or remove a ledger lock without reconciliation.

Once available, rerun extraction/maintenance, organization, quotation support,
negation and assistant-role safety with real text generation. Review generated
claims against complete source text; a second call to the same model does not
establish independent factual validation. Production enablement should follow
that acceptance and an explicit rollout/reindex policy, not simply this
embedding connectivity result.

## Sources

- Pricing: `https://help.aliyun.com/zh/model-studio/model-pricing`
- Error semantics: `https://help.aliyun.com/zh/model-studio/error-code`
- Free-quota-only control:
  `https://help.aliyun.com/zh/model-studio/new-free-quota`
- Runner: [qwen-provider-pilot.mjs](eval/qwen-provider-pilot.mjs)
- Cumulative envelope: [pilot-budget.mjs](eval/pilot-budget.mjs)
