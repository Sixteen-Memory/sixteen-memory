# MCP OAuth and controlled-write release

Date: November 9, 2026 (Asia/Shanghai). Baseline: `fcaa1dc`.
User explicitly requested implementation and production publication of both features.
This is a preregistered-client preview, not universal OAuth-client certification.

## Authorization contract

Canonical issuer: `https://console.sixteenmemory.com`.
Protected resource: `https://console.sixteenmemory.com/v1/mcp`.

- `GET /.well-known/oauth-protected-resource/v1/mcp` and the root protected-resource
  alias advertise the canonical authorization server; unauthenticated/invalid
  MCP bearer requests return a `WWW-Authenticate` resource metadata challenge.
- `GET /.well-known/oauth-authorization-server` advertises authorization-code
  grant, S256 PKCE, public-client authentication `none`, authorization, token and
  revocation endpoints. No implicit/password/client-credentials grant.
- Administrators preregister a client through `POST /v1/oauth/clients` using a
  client name, exact `redirect_uris` and allowed `scope`. HTTPS or literal loopback
  HTTP redirects only; no wildcard, embedded credential or fragment. Redirects
  must match exactly, including port/path/query. No external metadata fetching.
- `GET /oauth/authorize` requires `response_type=code`, `client_id`, registered
  `redirect_uri`, `resource`, `state`, `code_challenge_method=S256` and a challenge.
  The page visibly shows client, redirect, requested scope and duration.
- `POST /oauth/consent` requires same-origin browser submission and a flow-bound
  HttpOnly cookie/CSRF pair. The user enters an existing user-scoped key on the
  server's page. Administrator keys cannot consent; read keys cannot grant write.
  No approval is inferred from an existing session or from the model.
- Code exchange at `POST /oauth/token` requires a verifier and exact client,
  redirect and resource bindings. Unredeemed codes last 60 seconds. Successful
  exchange consumes the code; authenticated replay revokes its grant. No bearer
  plaintext is stored in SQLite: code/token digests only.
- Access lasts at most 15 minutes from consent. **No refresh tokens are issued**;
  clients must reauthorize after expiry. The MCP challenge requests read scope by default;
  `mcp:read mcp:write` must be requested explicitly by write-enabled clients.
- OAuth tokens work only at the canonical `/v1/mcp` resource, not ordinary REST
  routes, sessions, client administration or browser approvals. Legacy scoped
  API keys continue to expose only the original seven read-only MCP tools.
- `POST /oauth/revoke`, user `DELETE /v1/oauth/grants/:id`, client revocation or
  original key revocation immediately blocks token use and outstanding proposals.
  Users can inspect/revoke connections at `/oauth/connections` after console login.

Client example (administrator action, never a model tool):

```sh
curl "$BASE_URL/v1/oauth/clients" \
  -H "Authorization: Bearer $SIXTEEN_ADMIN_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"client_name":"My trusted MCP client","redirect_uris":["https://app.example/oauth/callback"],"scope":"mcp:read mcp:write"}'
```

The resulting `client_id` is public; no client secret exists. Supply it, the
canonical issuer and exact registered redirect to the client. Users still need an
administrator-issued scoped key; OAuth does not create accounts or grant SSO.

## Controlled writes

Only OAuth grants containing `mcp:write` from a write-capable user key expose:

1. `propose_memory_change({change})`: validates a proposed `add`, `update` or
   `delete`, binds its user/key/client/grant/version and returns `id`, state,
   expiry and a server `approval_url`. It does not mutate memory.
2. `memory_change_status({id})`: reads only this grant's proposal state.
3. `commit_memory_change({id})`: accepts no replacement body. It executes only
   after the user approves the exact stored proposal on `/oauth/approval`.

The review page renders escaped proposed content, current record, source,
operation and application identity. Browser cookie, same-origin and CSRF checks
protect decisions; model tools and bearer tokens cannot approve. A same-site
continuation link handles external arrivals with Strict cookies. The page uses
`Referrer-Policy: same-origin` to preserve same-origin POST Origin while avoiding
cross-origin referrer leaks; authorization permits only the registered callback
origin in CSP form navigation.

Proposal request IDs are per OAuth grant. Pending proposals expire after ten
minutes. Denial, stale versions, expired/revoked grants and cross-grant IDs fail
closed. Mutation and a content-free receipt commit in one SQLite transaction.
Concurrent or repeated commits return the same receipt without rerunning the
write. Add/update/delete preserve existing source/version/index/history behavior.
Committed/denied/deleted/invalidated proposals no longer retain their payload;
expired or revoked proposals are purged. Deletion still cannot certify platform
backup erasure. Only explicit core memory writes are exposed, not conversation,
knowledge, ingestion, provider calls, bulk operations or administrative mutation.
If embeddings are enabled later, these MCP write tools fail closed until an
explicit provider-aware workflow is implemented. Production models remain off.

## Storage and operational boundaries

Six additive tables in the existing `MemoryProject` SQLite object: OAuth clients,
flows, grants, codes, tokens and MCP proposals. No new Durable Object binding,
class migration, provider secret or DNS change. Existing expiration alarms cover
all temporary tables. Limits: 100 active registered clients, 1,000 live consent
flows, 100 active grants per key and 100 proposals per grant; 8 KiB form bodies,
64 KiB MCP request bodies, original memory/source limits. IP rate limits and a
stricter consent/login limit remain enabled. No automatic network retries. OAuth audit entries contain action/status only, never
raw tokens, codes, verifiers, state, keys, proposal bodies or redirects.

No dynamic registration, client-ID metadata documents, refresh tokens, OIDC/SSO,
external identity provider, persistent MCP session, or automatic tool approval.
No promise of compatibility with a client that cannot accept preregistered IDs,
resource indicators and S256. An independent security audit was not performed.

## Verification

`npm --prefix product run test:oauth` exercises the actual Worker/SQLite and the
installed official MCP SDK. Nine groups cover discovery, redirect/resource/PKCE,
consent/CSRF, key/scope separation, code replay/revocation, official-client auth,
immutable human-reviewed writes, stale versions, denial, deletion, persistence,
concurrent commits, expiry and revocation. External traffic is denied.

A real Chrome loopback exercise completed consent, callback/token exchange,
proposal review, explicit approval, commit and connection revocation. It exposed
a no-referrer/Origin interaction that API-only tests missed; the fix preserves
strict Origin checking and uses same-origin referrers only on authorization UI.
The browser used an isolated synthetic key and database, not a production account.

Existing product/integration/knowledge/component suites remain required. Published
metadata, actual production flow and synthetic cleanup are recorded below after
deployment. Do not equate local success with a completed production smoke test.

## Production receipt

- PR **#12**, tested head `725f6c6af78c9a802f07afbbc6f7aa5b336f9f44`,
  merged as `032acc4ba26e03bc732b77ec7b8c2699d698b882` at
  **22:25:03 Asia/Shanghai**. No hosted CI check or independent reviewer verdict
  was present; the evidence below is local and explicit production verification.
- Worker version `0daffda2-ea0d-496e-9e68-163c2973da42` receives **100%** traffic
  through deployment `98e75fb8-2437-4a4e-8d3c-87e05f774b76`, created at
  **22:26:54**. Console Pages production deployment
  `1f254702-b726-4f1c-a1d1-81f21e12d3c9` uses source `032acc4`.
- The website project was not redeployed, so concurrent homepage SEO/indexing
  work was not overwritten. Quickstart is served by the Worker asset bundle and
  was updated with this release.
- Existing storage/rate-limit/assets/model bindings remained equal. Added only
  `OAUTH_ISSUER=https://console.sixteenmemory.com` and Worker-first OAuth/well-known
  paths. Durable Object class/migration remains `v1`; the only secret remains
  `ADMIN_KEY`. Production models/extraction/embeddings remain disabled. No DNS,
  credential, provider, billing or customer-data change.

The first read-only Cloudflare metadata query and first Console Pages deployment
attempt failed because the remote authentication/API endpoint was temporarily
unreachable. The Worker upload completed on the next authenticated path; the
identical Console artifact succeeded on retry. No user/data mutation was tied to
those retries.

The production synthetic smoke completed all eight checks:

1. health with models disabled;
2. OAuth discovery;
3. S256 consent/code exchange;
4. MCP resource restriction and ten-tool write grant;
5. unapproved write rejection, approval and exactly-once add receipt;
6. scoped read of the new memory;
7. independently approved deletion and no stale result;
8. immediate token revocation.

Final reconciliation for user
`oauth-smoke-67d5b7f296d44c76a653a60393ef6420` found **zero memories,
zero active keys and zero active clients**. The smoke did not read customer
collections and made no provider/model calls. This is a single synthetic
production lifecycle, not penetration testing, availability certification or
universal client interoperability.

Rollback references: prior Worker version
`87c8536e-9582-40f1-886a-7fa80dcf70a0`; prior Console Pages deployment
`056e6e45-77b8-4626-9f69-93e726736c64`. Rollback would restore old code but
does not remove additive SQLite tables; they contain authorization metadata and
digests, not bearer plaintext. No rollback was executed.

## Standards reference

Implementation checked against the installed official MCP SDK **1.32.2** and
MCP authorization specification **2025-11-25**, including its preregistration
path, PKCE, resource binding and short-lived token guidance:
`https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization`.
The release deliberately issues no refresh tokens, so refresh-token rotation is
not claimed. OAuth functionality is not a full OAuth 2.1 certification claim.
