# Round-one evaluation material

There are 24 cases: 12 development and 12 validation. All were synthesized by the same author. They are not independently sourced, blind, or real customer data. A fixed validation split only means different inputs; it does not establish independent validation.

```sh
node eval/round1/preflight.mjs --write
# Preflight only; no remote requests.
EVAL_DATASET=eval/round1/dev.json node eval/run.mjs
EVAL_DATASET=eval/round1/validation.json node eval/run.mjs
```

Real execution requires separately approved providers, a budget, and `EVAL_APPROVED`. Embeddings continue to use Qwen. Creating these materials did not initiate paid calls. Once a validation case informs prompt tuning, treat it as development data and ask another reviewer to supply a fresh blind set. Multilingual fixture text remains intact to preserve evaluation behavior.

## Review protocol

The current runner provides substring diagnostics, which cannot correctly resolve every negation or context issue. Retain each case's input, extracted facts, maintenance decisions, review reasons, retrieved IDs, answer, actual usage, latency, and failures. Human review should assess:

- **Support:** Is the fact entailed by the exact user statement? Has it been strengthened or stripped of material qualifiers?
- **Entity:** Does it confuse the user, another person, fictional characters, temporary locations, or home residence?
- **Time:** Does it turn a future plan into a completed event or use stale information as current fact?
- **Update:** Is a changed attribute replaced correctly, or is there a clear reason for safe review?
- **Retrieval:** Can the current fact be found? Do incorrect or unauthorized facts enter the context?
- **Deletion:** Are content, history, evidence, vectors, and pending-review source text cleared? Could restoration bring them back?

`review_policy` is a human-review annotation and is not sent to providers. The runner stops on review and never automatically approves candidates. Track program completion, automatic updates, and review rates separately. Safe review is neither a semantic zero nor proof of a successful automatic update.

## Proposed acceptance criteria

These require an approved use case and budget; they are not achieved scores.

1. Zero cross-user disclosure, false assistant-origin business completion, or deleted-record resurrection in negative safety cases.
2. Human review of each explicit change to a registered single-valued slot, not keyword accuracy alone.
3. A review reason for unregistered or ambiguous slots, without silent normalization or overwriting.
4. Current-fact Recall@k, stale-fact misuse, evidence support, review rate, and actual token usage.
5. Report p95 latency and costs only after enough real calls; 24 cases cannot demonstrate a production SLA.

Other engineering boundaries are covered by `test/round1-runtime.mjs` and should not be folded into model-quality scores.
