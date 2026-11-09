# Qwen continuation after quota-setting approval

Date: November 9, 2026 (Asia/Shanghai).
This supersedes the account-blocker status in the
[earlier diagnostic receipt](QWEN_ACCEPTANCE_2026-11-09.md), while retaining all
failed and partial runs as evidence.

## Outcome

- The user explicitly confirmed the financial effect immediately before the UI
  operation. Only the `qwen-flash` free-quota auto-stop switch was turned off.
  Its dated variant `qwen-flash-2025-07-28` remained on. No recharge,
  subscription, API-key creation, other model switch or production secret change.
- The console displayed the target switch as off/disabled with the status
  translated as "not supported to enable"; do not promise it can be re-enabled.
  A subsequent inference run succeeded using the same approved personal key.
- The small local memory pipeline diagnostic passed five assertions.
- **Automatic knowledge quality was not accepted.** Real outputs demonstrated
  an omission and an unsupported strengthening that the same-model verifier
  incorrectly accepted. No production model capability was enabled.

## All continuation runs

| Local run | Calls | Result | Known usage estimate (CNY) |
| --- | ---: | --- | ---: |
| Memory run 2, about 19:55 | 11 | Initial city/language, city change/history, semantic recall, answer, and assistant-completion exclusion passed | 0.00124100 |
| Knowledge run 2, about 19:56 | 2 | Generator succeeded; verifier rejected by provider HTTP 400 because JSON-mode instruction omitted the word JSON | 0.00030525 plus unknown-call reservation |
| Knowledge run 3, about 19:59 | 2 | Generator returned a very short response consistent with an empty plan; verifier shape rejected locally | 0.00015855 |
| Knowledge run 4, about 20:00 | 3 | Deployment condition generated; refund case tried to cite an assistant claim and was blocked by exact role/citation validation | 0.00104820 |
| Knowledge run 5, about 20:03 | 5 | Completed after fixes: two applied cases and one empty review case; subsequent content review did not accept automatic quality | 0.00114570 |

No automatic retry was enabled. Separate diagnostic runs followed a concrete
compatibility change, targeted logging, or input-boundary/empty-plan correction.
All original results remain local; no failed run was removed or averaged away.
These reused synthetic cases are development data, not a fresh blind evaluation.
After run 5, paid execution stopped rather than repeatedly sampling for success.

## Memory-path findings

The initial statement produced two memories (home city and language), the newer
city replaced the old current value with versioned history retained, and the
answer correctly named the new city and language. The refund input generated no
durable facts: this prevented a false completed action but does **not** demonstrate
successful retention of the refund request or completion uncertainty.

The eleven provider calls were six text and five embedding calls. Returned
model labels were `qwen-flash` and `text-embedding-v4`; this is provider-reported
identity, not a separately pinned immutable text-model snapshot.

## Knowledge review

Reviewer: the implementation assistant reading outputs against the complete
synthetic sources. **Not independent, blinded, statistically powered, or human
acceptance.**

| Final case | Review finding |
| --- | --- |
| Deployment condition | Customer approval condition preserved and quoted correctly |
| Refund status | Empty result held for review; safe from invented completion, but failed to preserve the useful requested/unconfirmed information |
| Release runbook | Correctly retained project-note reference; changed "need the owner and the review receipt" into requiring the owner's approval, adding a material condition not explicitly in the source |

The same model marked the last strengthened claim supported. This demonstrates
that **an exact quotation and a second model pass are not sufficient proof of
entailment**. The current `mode=auto` path is not recommended for production.
The default remains review; production extraction/model configuration stays off.

## Source changes and regression checks

1. Add an explicit JSON instruction in knowledge verification for the provider's
   `response_format=json_object` requirement. The offline provider fixture now
   reproduces this requirement and failed before the fix.
2. Do not send assistant/tool/system conversation roles to the knowledge model.
   Complete transcripts still remain stored and readable; eligible source bodies
   are not clipped. This reduces non-evidence exposure but can lose antecedents
   from assistant context and is not a complete prompt-injection defense.
3. With no eligible source, return an empty review proposal without model calls.
   With an empty generated plan, return review after one call, not an unnecessary
   verifier request. Never auto-publish the empty plan. Scope/epoch checks remain.
4. Add opt-in, ignored, private text-output diagnostics for synthetic runs only.
   They contain generated content, not keys, headers or full request prompts.

Build/TypeScript, 33 offline tests and eight knowledge-runtime groups passed.
The new runtime checks exercise role filtering, preserved raw roles, no-source
zero-call behavior, empty-plan one-call behavior, replay, and deletion cleanup.
These are source changes in the pending PR, **not a deployed product update**.

## Cumulative accounting and cleanup

Across the initial runs and this continuation:

- Total attempted inference calls: **31**.
- Calls with valid returned usage: **28**.
- Unknown-usage errors: **3** (two earlier HTTP 403s and the HTTP 400).
- Known usage at the previously reviewed public rates: **CNY 0.00392620**.
- Unsettled error reservations: **CNY 0.01713885**.
- Shared envelope used: **CNY 0.02106505 / CNY 0.20**.

The last number is conservative script accounting, not a supplier invoice.
Other clients can now incur charges for the target model; this ledger does not
limit the account. No fresh budget was created for the continuation.

All eight executed local run databases were read-only reconciled: zero memories,
conversations, messages, Wiki pages, edges and retained knowledge proposals.
Private diagnostic output files deliberately remain as receipts.
Production health was checked separately and remained v0.3.0,
lexical/explicit/`model_configured=false`.

## Next gate

Prioritize coverage and qualifier fidelity before attempting unattended
organization. Use a new separately reviewed set, represent conditions/negation
explicitly, label omitted or ambiguous material, and measure source-supported
answers versus raw search. Do not label these mixed results full quality
acceptance or deploy automatic generation simply because the billing blocker
has been removed.

See the [optimization plan](../docs/MEMORY_OPTIMIZATION_PLAN.md).
