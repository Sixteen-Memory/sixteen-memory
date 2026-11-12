# Code Agent access verification

Date: November 12, 2026. PR preparation against GitHub main `d1c24a2`.
The user authorized a branch push and PR. No deployment, package publication,
production data, real model calls or user client configuration changes.

## Delivered

- Native Codex TOML and Claude Code JSON fragments with environment-key references.
- A connection checker using the existing SDK and official MCP client.
- A public `GET /v1/capabilities` API-key read-only catalog with the same definitions
  and JSON Schema inputs as that profile's MCP `tools/list`; no identity,
  credentials, records or provider details.
- Server-wide MCP guidance for scope, provenance and read-only behavior.
- Examples, scope boundaries and a local-only capability-status entry.

The discovery envelope is SixteenMemory-specific, not an A2A Agent Card.
No network registry, sidecar, coding-agent orchestrator or background task system
was added. No production dependencies or lockfiles changed.

## Integration baseline

The initial implementation used an older homepage worktree. Before preparing
the PR, the latest private GitHub main was fetched. Only the Agent access commit
was moved onto that base; unmerged homepage work was excluded.

Main already includes preregistered OAuth, approved MCP writes and media
ingestion. Those implementations are retained. The new catalog explicitly
describes the API-key read-only profile; it no longer implies OAuth is absent.
Read-only instructions are not injected into OAuth write sessions.

## Executed checks

| Check | Result |
| --- | --- |
| Product `npm run build` | TypeScript, Vite and Worker dry-run passed |
| Product `npm test` | 47 tests passed on the updated main baseline, including four new helper tests |
| `npm run test:agent-access` | Six groups passed over loopback HTTP, Pages, Worker and SQLite |
| `npm run test:knowledge` | Eight existing groups passed; fixture providers only |
| `npm run test:oauth` | Nine existing OAuth groups passed; read-only instructions present for read grants and absent from write grants |
| `node integrations/code-agents/native-config-check.mjs` | Installed Codex and Claude Code parsed generated configs in temporary homes; Claude project approval remained pending |
| Local Wrangler preview on port 8792 | GET capability catalog returned seven tools; default ports were occupied and left unchanged |

The first revocation check used the wrong field in the test's create-key
response (`id` instead of `record.id`). After correcting the test, revocation
blocked both an existing MCP client and a new helper connection. Service
authorization was not loosened.

## Behavioral coverage

- HTTP catalog and actual MCP schemas, descriptions, annotations and instructions
  match exactly; tools cannot supply user-scope overrides.
- Valid read-only clients retrieve their synthetic record, not another user's.
  A write-tool name is rejected and the source record remains intact.
- The helper calls identity/discovery only, with no `tools/call`.
- Catalog drift, non-read-only keys, revoked keys, redirects and oversized
  responses are rejected. CLI messages and configuration omit key values.
- The Pages Service Binding forwards discovery correctly. Non-GET methods return
  405, hostile origins return 403, and the response is `no-store`.

## Not established

- A real-model Codex or Claude conversation consuming memory autonomously.
- Installation in the user's current client configurations.
- Production readiness, production availability, performance or an SLA.
- New OAuth functionality, A2A, automatic chat import or persistent job recovery.
