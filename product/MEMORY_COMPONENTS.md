# Evidence, context, and memory review

Originally implemented November 9, 2026 in v0.2.1 and retained in v0.3.0.
See [the release receipt](RELEASE_0.3.0_VERIFICATION.md) for publication status.
They are not part of the stable website SDK package or v0.1 OpenAPI document.

## API

All three routes accept JSON via POST, use existing bearer or cookie
authentication, and require an explicit `user_id`, including for administrators.
Read-only keys may call them for their own user. Origin checks, request limits,
rate limits, and content-free request logging remain in force.

| Route | Input | Output |
| --- | --- | --- |
| `/v1/evidence/search` | `user_id`, `query`; optional `limit` (1-50), `filter`, `at` | `data` with current memory ID/version, content, source, primary/supporting kind, lexical score |
| `/v1/context` | `user_id`, `query`; optional `mode`, `filter`, `at`, `fallback`, `threshold`, `include_evidence`, `limit` (1-20), `max_chars` (512-24000) | Complete context JSON string, selected memories/sources, budget, candidate/omission counts, retrieval status, usage |
| `/v1/memory-review` | `user_id`; optional `stale_before` timestamp | Checked time, scanned count, findings with IDs/versions, finding count, truncation flag, `changed: 0` |

The SDK development entry exposes `searchEvidence`, `context`, and
`reviewMemories`. Each accepts the shared transport call options, including
cancellation. No new runtime dependency or model provider is required.

```js
import { SixteenMemory } from "./sdk/index.mjs";

const memory = new SixteenMemory({
  baseUrl: "http://127.0.0.1:8790",
  apiKey: process.env.SIXTEEN_API_KEY,
});
const result = await memory.context({
  user_id: process.env.SIXTEEN_USER_ID,
  query: "delivery instructions",
  max_chars: 6000,
  limit: 10,
});
console.log(result.context, result.budget, result.omitted_count);
```

`context` is untrusted reference data, never a system instruction. Applications
should pass it in a data/tool-result position with their own governing
instructions. It is not automatically injected by the stable Vercel adapter.
Use the existing scoped get/evidence/history methods for deeper inspection.

## Retrieval and data behavior

- The original summary `/v1/search` keeps its behavior. Source search uses a
  separate FTS5 index over retained source text and references, not full session
  transcripts. Unretained conversation turns cannot be searched.
- Only active records within their validity window are returned. Filters and
  user scope apply before top-k. Physical expiry still removes data; `at` does
  not restore history or deleted records.
- Primary and merged supporting sources are tied to the current version.
  Historical supporting sources remain available to authorized evidence reads
  but cannot be retrieved as support for a newer version.
- Existing records are indexed in a one-time transactional migration. New
  writes, merges, updates, revocation, deletion, and expiry maintain the index.
- Context combines up to 50 summary matches and 50 source matches using
  reciprocal rank fusion. Multiple matching sources do not multiply a memory's
  rank contribution. An explicit cosine threshold cannot be bypassed by a
  source-only match.
- Scope revision checks reject changes between retrieval and context assembly
  with 409. A returned response is a point-in-time read, not a guarantee that
  records will remain unchanged after the request.
- The budget counts UTF-16 characters in the fully serialized, escaped context,
  including its notice and sources. It is **not a model-token estimate**.
  Facts and quotes are never cut mid-sentence. Oversized candidates are skipped;
  later smaller candidates can still fit. Empty context is explicit.
- `candidate_count` and `omitted_count` describe the bounded retrieval pool,
  not the total matching corpus. No claim of corpus completeness is made.

## Read-only review

The review scans at most 1,000 currently valid memories per user. Larger scopes
return 409 rather than silently scan a subset. At most 100 findings are returned,
with a full finding count and a truncation flag.

- `duplicate_content`: same text after Unicode/case/whitespace normalization,
  with matching category, metadata, event time, and validity. Punctuation is
  retained. This is a duplicate-content signal, not merge authorization.
- `slot_conflict`: different text under one registered single-valued fact slot,
  including reviewed aliases. This is a candidate disagreement, not proof that
  either source is false.
- `old_evidence`: primary source observation predates the caller's cutoff,
  defaulting to 90 days before the check. It is not a claim that the fact expired.

The check makes no model calls and does not edit memory records. Normal
maintenance still removes already expired data and records the request.
The console can inspect a finding and open the existing versioned editor.
There is no background scheduler, auto-consolidation, source-verification model,
wiki builder, or automatic conflict resolution.

## Checks

See the [recorded local results](MEMORY_COMPONENTS_VERIFICATION.md).

From `product/`:

```sh
npm test
npm run build
npm run test:components
npm run test:round1
npm run test:runtime
npm run test:migration
```

The component suite uses isolated real Workers/SQLite storage, rejects all
outbound provider calls, and checks source-only retrieval, budgets, scope,
filters, time windows, updates, revocation, deletion, restart, and SDK behavior.
The round-one suite checks merged supporting-source lifecycle with intercepted
provider fixtures. These are engineering checks, not real-model quality scores.
