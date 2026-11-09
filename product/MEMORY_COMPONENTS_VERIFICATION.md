# Memory component verification

Date: November 9, 2026. Branch: `codex/memory-components-20261109`.
Baseline: `4b59784`. All results below concern local source, not production.

## Automated checks

| Check | Result | Scope |
| --- | --- | --- |
| Product unit/transport tests | 31 passed | Source parsing, context budgets, version races, review, SDK and existing provider fixtures |
| Product build | Passed | TypeScript, React/Vite, Worker dry-run bundle; no deploy |
| Component runtime | 7 groups passed | Real isolated SQLite, evidence/context/review, auth, filters, lifecycle, restart, SDK |
| Existing product runtime | 29 groups passed | Lifecycle, sessions, isolation, concurrency, expiry, intelligence fixture behavior |
| Round-one runtime | 10 groups passed | Attributes/time/filters, hybrid context, source merges and current-version retrieval |
| v0.1 migration | Passed | Existing source/history retained; evidence backfill and context retrieval work |
| Stable OpenAPI/SDK | Passed | 17 runtime operations, 13 paths, generated files, strict types, clean package installation |
| Vercel adapter tests | 25 passed | Real framework APIs with mock generation, transport and authenticated handler |
| Vercel runtime | 8 checks passed | v0.1/v0.2 lifecycle, scope enforcement, middleware and stale-state exclusion |
| Console API runtime | Both versions passed | Cookie sessions and lifecycle; new development methods on v0.2 |
| Documentation checks | Passed | English repository prose, 163 local links, 19 capability entries |
| Diff whitespace | Passed | `git diff --check` |

These counts refer to different checks, not a combined benchmark score.
Model responses used by intelligence/framework checks were local fixtures or
official SDK mocks. Real provider calls and production requests: zero.

## Browser verification

Local console `http://127.0.0.1:4191`, API `http://127.0.0.1:8790`.
The preview uses clearly marked synthetic records in `components-preview`.
The server reports v0.2.1, lexical retrieval, explicit extraction, and no
configured answer model.

Checked with Playwright against the real local service:

- Source-only keyword lookup creates context with the exact source condition.
- Source expansion, record detail, and Escape dismissal work.
- Evidence search displays the retained source.
- Review displays duplicate text and old-source findings without record edits.
- Changing users removes prior results.
- Context and review layouts and six-item navigation at widths 320, 390, 768, and 1440 have
  no horizontal overflow or offscreen controls.
- Desktop screenshot inspected using a 640px safe preview. Other screenshots
  checked through DOM geometry; no additional image inspection.

The first source-text browser assertion inspected a closed details element.
Opening the source revealed the full text and the corrected check passed; this
was a check issue, not lost source data.
Initial unauthenticated `/v1/me` requests return expected 401 responses.
Budget omission, unconfigured semantic-mode error, and switching back to lexical
retrieval also passed. The expected unconfigured-provider request returns 503.

## Limits

Not performed: matched Mem0 benchmark, learned consolidation, real embedding or
generation quality testing, load/cold-start benchmarking at capacity, physical
mobile-device testing, production verification, deployment, or registry release.

The evidence migration has a supporting `(memory_id,memory_version)` index and
runs transactionally, but maximum-size cold-start cost has not been measured.
The context length is a character bound, not a token/price guarantee.
Source age and slot-text differences do not establish factual correctness.
