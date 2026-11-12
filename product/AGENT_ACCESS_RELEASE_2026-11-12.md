# Code Agent access release

Date: November 12, 2026 (Asia/Shanghai).

## Source and deployments

The user explicitly authorized merging and production deployment.
PR #16 merged tested head `42b2e9d9447a4d4111f328784ef31e4c0d83e587`
as `808f0fbfc37020e5bcf07173751f66475a431a6c` at 13:25:29.
The PR had no hosted CI checks or independent review result.

- Worker version: `5107551c-7fdf-4f27-bd65-3eab71fdedbf`.
- Worker deployment: `b13a99e7-4f2c-44cc-96d6-4e2c273560ab`,
  100% traffic at 13:29:30.
- Console Pages production: `048963e3-3e25-4b47-ae76-d62b1c5cae88`,
  source `808f0fb`.
- Public catalog: `https://console.sixteenmemory.com/v1/capabilities`.
- MCP resource: `https://console.sixteenmemory.com/v1/mcp`.

The production configuration was `wrangler.production.jsonc`, not the default
local media configuration. Full before/after bindings, namespace IDs and runtime
configuration were identical, including Durable Object migration `v1`, limits,
the existing administrator secret binding, compatibility settings and asset
routing. No bucket, provider credential, DNS or customer-data change was made.
The website project was not deployed.

All model flags and production media upload remain disabled. Existing OAuth and
user-approved MCP write behavior were retained. The public catalog describes
only the API-key read-only profile; it is not an A2A Agent Card.
Client helpers are available as private repository source, not a published
package or an installation into the user's current clients.

## Evidence

The merged source was rebuilt successfully. Prior checks on the identical
product source passed: 47 unit tests, six Agent access groups, eight knowledge
groups, nine OAuth groups and isolated native Codex/Claude configuration parsing.
See [implementation verification](AGENT_ACCESS_VERIFICATION_2026-11-12.md).

Observed on production:

- Health and OAuth discovery returned their expected values; missing MCP
  authentication returned the resource-metadata challenge.
- The new metadata-only connection helper completed successfully using a
  synthetic read-only key and the official MCP client.
- HTTP capability metadata matched all seven MCP tool schemas and descriptions.
- Synthetic memory retrieval/search and cross-scope rejection were observed
  before a later smoke-script assertion failed.
- The console JavaScript matched the local artifact SHA-256:
  `e738333c6205da36db299c89567ab5a21643cd4f9bbecf8116593b025e49c0a3`.

## Incomplete production checks

**A complete production smoke run did not pass end to end.**

Two diagnostic errors were corrected without changing deployed code: a write
denial probe omitted required source input, and an unknown-tool response was
incorrectly read as a top-level JSON-RPC error instead of `result.isError`.
Node HTTPS requests also failed with `TypeError`; curl reproduced intermittent
TLS/connection timeouts. A small probe returned four 200 responses and one SSL
timeout for five health requests, and two 200 responses plus one timeout for
three catalog requests. This does not locate the failure to the server or prove
an availability rate.

Read-only requests received bounded retries in the later diagnostic; mutations
were not automatically repeated. The final new run stopped on a key-creation
transport timeout and reconciled its exact synthetic scope instead of creating
another batch. Production revocation and full OAuth write-lifecycle acceptance
are not newly established by this release; their local regression suites passed.

One earlier synthetic memory deletion timed out. A targeted follow-up verified
ownership, deleted the known record and confirmed zero remaining memories and
active keys for that run. The final run likewise reported zero memories and
active keys with no cleanup errors. No customer memory collection or real
model was used by the diagnostic.

Final reconciliation covered all 14 synthetic user scopes from the attempts:
zero remaining memories and zero active keys.

## Recovery references

Prior Worker: `66acc1bf-40e7-40a4-89d8-e32e5d29880f`.
Prior Console Pages: `e17c1e90-b0fd-43ae-90ef-29ca50c945f5`.
No new storage migration was introduced and no rollback was performed.
These references restore code, not deleted customer data or database snapshots.
