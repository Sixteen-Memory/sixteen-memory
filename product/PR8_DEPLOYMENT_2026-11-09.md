# PR 8 production deployment receipt

Date: November 9, 2026 (Asia/Shanghai).
The user explicitly authorized merging and deploying the pending repair.
This publishes the source changes, not automatic knowledge-quality acceptance.

## Publication

- PR **#8** merged at **20:12:34** into `main`.
- Merge source: `b7786ed452942fc241215921c154f90e2603e9fd`.
- Its tree matched tested head `c74344f0b19bd63bdb9607ed912079b0c74fffec`.
- Worker `sixteen-memory-product`: version
  `c0bd964e-c561-46bf-a8c3-5b2dfce7328e`, deployed at 100% at about **20:13**.
- Worker tag: `pr8-knowledge-hardening`.
- Pages `sixteen-memory-console`: production deployment
  `ccea3b0f-8493-4024-ab44-c64967673acb`, branch `main`, source `b7786ed`.
- The published application version remains **0.3.0**; this repair did not bump
  the package/API version. Deployment IDs identify the specific artifact.

The local tree was clean before publication. The merged tree was rebuilt,
and Worker deployment used strict conflict checking. No CI checks or independent
review submissions were present on the PR; do not report a GitHub CI pass.

## Verification

Immediately before merging:

- Build and TypeScript passed.
- Unit/transport: **33 tests**.
- Product runtime: **29 groups**.
- Knowledge runtime: **8 groups**.
- Memory-component runtime: **7 groups**.
- Documentation: **226 local links** checked.

After deploying:

- Cloudflare deployment metadata confirmed the new Worker at 100%.
- Before/after Worker bindings and runtime configuration compared equal,
  including the existing Durable Object namespace and migration tag.
- The only listed secret remained `ADMIN_KEY`; no secrets were changed.
- Pages production metadata pointed to the merged source.
- Custom-domain HTML matched the local build; CSP, frame denial, no-referrer
  and no-sniff response headers were present.
- Custom-domain and Pages-domain health agreed:
  `status=ok`, `version=0.3.0`, `retrieval=lexical`,
  `extraction=explicit`, `model_configured=false`.
- An unauthenticated `/v1/me` request returned HTTP 401.

### Live synthetic checks: partial, not a full smoke pass

Three attempts were retained rather than counting a failed attempt as success:

1. Custom-domain smoke passed health and memory/evidence/context, then timed
   out during the conversation section. Cleanup reported no errors. A separate
   read confirmed zero memories, conversations and active keys for that run.
2. A later attempt failed on health with a transport error, before creating any
   synthetic objects.
3. HTTP/1.1 transport passed health, memory/evidence/context and the complete
   conversation/idempotency/scope/read-only group, then encountered a transport
   error before the knowledge-disabled group completed. The test did not reach
   a confirmed successful official MCP-client group.

The third attempt reported a memory-cleanup transport error. A subsequent
read through the Pages domain nevertheless observed **zero memories, zero
conversations and zero active keys** in that exact synthetic scope; no further
deletion was necessary. An additional redundant read then failed in transport.
This does not erase the observed zero state, but it is not a clean full-script
reconciliation result.

Transport instability's root cause was not independently established. The
deployment and repeatedly successful public health checks are verified; **the
complete live MCP/knowledge smoke is still not verified for this deployment**.
Offline runtime/MCP checks passed, which is a different claim.

## Unchanged boundaries

- Production models and automatic extraction/organization remain disabled.
- No database migration, customer collection read/reindex, DNS change,
  credential rotation, account recharge, registry publication or visibility change.
- Only this release's isolated synthetic records and temporary scoped keys
  were created and cleaned up during verification.
- No model calls were made for merging, deployment or live verification.
  The approved local diagnostic ledger remains at 31 prior attempts and
  CNY 0.02106505 known usage plus reservations; not an account invoice.
- The `qwen-flash` provider-side switch changed in the previous approved task,
  not in this deployment. It does not enable production model code by itself.

## Rollback reference

Previous Worker version: `6efdd109-0bac-4a80-a629-5a3cd2194f40`.
Previous Pages deployment: `19b10576-3fcf-419d-9b7e-c7a08dce3e0a`.
No rollback or database restore was performed. Reverting code does not imply
restoring data, and restoring old data requires separate deletion reconciliation.

This receipt is documentation added after publication; the deployed code
remains the exact `b7786ed` tree.
