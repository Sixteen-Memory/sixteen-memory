# Media code release — November 10, 2026

## Published source

User requested 30-minute media support, code push and deployment.
PR #14 merged tested head `2878437f8c01abf691b02a9f3f634095314ae4b2` as
`ce4462a1337ef77955c90f8a9204d21668fece76` at 10:03:07 UTC.
Only `product/` changes were included; homepage and unpublished blog branches
were excluded. No hosted checks or independent reviewer verdict was present.

Worker version `66acc1bf-40e7-40a4-89d8-e32e5d29880f` receives 100% traffic,
created at 10:05:40 UTC and deployed at 10:05:41 UTC. Console Pages production
`e17c1e90-b0fd-43ae-90ef-29ca50c945f5` identifies source `ce4462a`.

## Important availability limit

**The code is live; media uploads are not activated.** The authenticated R2
bucket query failed because the existing OAuth credential lacks R2 scopes.
No login permission expansion, bucket creation, billing change or model secret
was attempted. Production uses `wrangler.production.jsonc`, which omits the
unprovisioned bucket. All model flags remain disabled. Activation requires
separate R2/private lifecycle setup and an approved long-media model/budget.

Public health verified:

```json
{"media_ingestion":"disabled","media_upload":{"enabled":false,"max_bytes":524288000,"max_seconds":1800,"part_bytes":8388608}}
```

An authorized upload-init probe returned explicit `503 media_storage_not_configured`;
an unauthenticated probe returned 401. No media upload or provider call occurred
in production. Existing rate limits, Durable Object namespace/class/migration,
assets and secret bindings were compared against the prior version and unchanged.
Only the four disabled/empty media configuration variables were added. No DNS,
customer-data, homepage deployment or website SDK archive changes.

## Verification

- 43 unit tests passed.
- 7 inline media groups passed with 14 intercepted provider requests.
- Large upload tests passed: 30:00 MP4, 30:01 rejection, 14 MB 30-minute WAV,
  sequential and repeated/conflicting chunks, scoped writes, cancellation,
  private range endpoint, cleanup, JS Blob and Python sync/async helpers.
- 29 core memory, 8 knowledge and 9 OAuth runtime groups passed.
- Python sync/async transport (9 tests), migration, TypeScript, clean JS archive
  install, OpenAPI legacy runtime and documentation checks passed.
- No real-model recognition, transcript completeness or quality acceptance.
  500 MiB is an enforced size allowance, not a measured 500 MiB load-test result.

Production synthetic checks passed for health, memory/evidence/context,
conversation idempotency/scope/read-only access, disabled knowledge and official
MCP client. The first cleanup encountered a network timeout while revoking one
key. Follow-up reconciliation confirmed zero active keys, zero memories and zero
conversations for `release-08b633dd-f929-4e75-a831-a1937c9df071`.
No customer collection was queried.

The deployed console JavaScript matched the local artifact SHA-256
`e738333c6205da36db299c89567ab5a21643cd4f9bbecf8116593b025e49c0a3`, including the
30-minute copy and disabled-configuration notice. An initial static download
was truncated by a network timeout; the complete repeated GET matched.

## Rollback references

Prior Worker: `0daffda2-ea0d-496e-9e68-163c2973da42`.
Prior Console Pages: `1f254702-b726-4f1c-a1d1-81f21e12d3c9`.
The additive media table is not removed by code rollback. No rollback executed.
