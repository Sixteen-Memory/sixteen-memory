# Incremental Wiki production release

Date: November 23, 2026 (Asia/Shanghai).

## Source and publication

The user explicitly authorized implementation, PR, merge and production
deployment. PR #18 merged tested head
`8ddb7b5c52e867c1be18fba4e23b578447f87b4d` as
`3491270d7446f528dc82c22437b7b7558a3d9b9b` at 17:06:51.
The PR was mergeable and clean, with no hosted checks or independent review.

- Worker version: `9ccd6655-426d-40e3-ae97-c4cfcb25d7f3`.
- Worker deployment: `9e718333-8d06-4a50-bfce-ff50c4211e2f`,
  100% traffic at 17:09:11.
- Console Pages production: `0420b83b-0942-401d-b3b8-91d84a2fa846`,
  source `3491270`.
- Console JavaScript SHA-256:
  `798f7d2c8c57e99a0666379fcf681cd3151bde474b813475306cffc57305bb70`,
  matching the local production build.

The production profile was `wrangler.production.jsonc`. Full bindings (including
the existing secret and Durable Object namespace IDs) and script runtime settings
matched the prior production version exactly. No new binding, Durable Object
class, migration tag, route, DNS, credential rotation, provider, package, billing setting or
homepage publication was introduced.

All model and media provider flags remain disabled. The release publishes
incremental Wiki storage/read/control behavior, not generated production pages or
model-quality acceptance.

## Production verification

An isolated random user and one temporary read-only key were used. The check:

- verified health, disabled model/media state and existing OAuth discovery;
- verified the public capability catalog contains the new metadata-only stale
  Wiki behavior;
- initialized the new SQLite Wiki schema and observed `{data:[], stale:[]}`;
- wrote and read one synthetic explicit memory without changing its evidence;
- verified cross-scope reads, read-only writes and malformed target lists fail;
- verified targeted organization returns `503 extraction_not_configured`;
- negotiated MCP, matched the Wiki tool metadata, listed the empty Wiki and read
  the synthetic memory;
- revoked the reader and observed immediate rejection.

No real model was called and no customer collection was queried. Final
reconciliation confirmed zero memories, zero active keys and an empty Wiki for
the synthetic user. A first attempt used six-digit fractional seconds and was
correctly rejected by the existing ISO-date validator; it created no memory or
key and also reconciled to zero.

The external network continued to show intermittent TLS/large-download timeouts.
The complete console asset was downloaded successfully in a later bounded
attempt and matched the local hash. Read-only smoke requests had bounded retries;
mutations were not automatically repeated.

## Verification before release

Build, Pages packaging, both JS/TS SDK type suites, 49 unit tests, 10 incremental
Wiki groups, 8 knowledge groups, 9 OAuth groups, 6 Agent access groups, 29 core
runtime groups, 7 context/evidence groups, 10 metadata/validity groups, Python
unit/runtime, migration and native Code Agent config checks passed.

Real isolated Chromium verified conflict display, metadata-only stale pages,
source lists, single-page candidate/review/publish, unrelated-page preservation
and no horizontal overflow at desktop and 390px widths. The only console error
was the expected pre-login `401 /v1/me`.

The ecosystem archive-install suite failed before project code execution because
npm represented the existing `ai@7.0.165` package as `ai@undefined` during peer
resolution. Temporary packages and SQLite were removed; no override or production
request was used.

## Recovery boundary

Prior Worker version: `5107551c-7fdf-4f27-bd65-3eab71fdedbf`.
Prior Console Pages: `048963e3-3e25-4b47-ae76-d62b1c5cae88`.

These are comparison references, **not a safe Worker rollback plan**. The live
SQLite objects now contain extra Wiki/run columns and a dependency table; the old
Worker's positional inserts cannot write those extended tables. Recover with a
forward code fix that preserves the additive schema and deletion behavior.
The previous frontend can be republished independently if needed. No rollback or
customer database restore was performed.
