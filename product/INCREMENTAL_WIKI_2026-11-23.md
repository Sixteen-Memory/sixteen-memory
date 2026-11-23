# Incremental source-linked Wiki

Date: November 23, 2026. The source candidate was subsequently deployed; see the
[production release receipt](INCREMENTAL_WIKI_RELEASE_2026-11-23.md).

## Behavior

- Published pages have explicit source/version dependencies.
- Updating a memory or appending to a conversation makes only dependent pages
  stale. Current reads return no old claims or quotes for those pages.
- Deleting or expiring a source removes dependent derived pages and graph edges.
  Invalidating its validity window or revoking it makes dependent pages stale.
  Unrelated pages remain current.
- `POST /v1/knowledge/organize` accepts optional `target_slugs` (one to eight)
  to rebuild exact pages. Missing targets preserve the existing full-rebuild API.
- A targeted result must return exactly the named pages. Wrong or empty output
  fails before old content is changed.
- Conflict claims require different claims backed by at least two source keys,
  remain visibly grouped, and never auto-publish.
- Console and MCP list metadata-only stale pages; `read_wiki` reads current pages
  only. Stale claims are never injected into an agent context.

This follows the useful parts of Anthropic's knowledge-Wiki pattern—source
provenance, retained conflicts, read-only agent use and explicit consolidation—
without copying shared Markdown mutation, adding Managed Agents, or allowing
unreviewed conflicts to become facts.

## Boundaries

No new package, provider, model secret, scheduled job, Worker binding, Durable
Object class or migration tag. Existing SQLite objects add columns and a
dependency table on first access. Production generation remains disabled unless
separately configured; deployed code may expose incremental reads and controls
while organization honestly returns `503 extraction_not_configured`.

Stale page metadata becomes eligible for cleanup after 30 days and is removed
on the next storage purge (request or existing alarm). Rebuilding a single page removes its
old cross-page edges; rebuild related pages together when those relationships are
needed. The graph remains a cited page graph, not a general entity database.

## Upgrade and recovery

The schema backfill is additive and retains existing source versions. Old Worker
bundles use positional `INSERT ... VALUES` for the extended tables and cannot
write them after this upgrade. Do not roll back to the pre-upgrade Worker.
If generation fails, leave provider flags disabled and deploy a forward fix
preserving the new columns and deletion behavior. A frontend-only rollback does
not reverse storage changes. No customer database restore is part of this release.

No Anthropic source code was copied. The design reference is the official
`anthropics/claude-quickstarts` `managed-agents/knowledge-wiki` example, inspected
November 23, 2026. This implementation remains provider-independent.

## Verification

`npm run test:wiki` covers dependency isolation, unrelated writes, targeted
review, exact retries, invalid targets, conflicts, schema backfill/restart,
deletion/expiry, edge invalidation, full rebuild compatibility, MCP scope and
stale-data exclusion over the actual Worker/SQLite runtime with fixture providers.
No real model or production data is used.

Local results on the candidate: 49 unit tests; 10 incremental Wiki groups,
8 knowledge groups, 9 OAuth groups, 6 Agent access groups, 29 core runtime groups,
7 context/evidence groups and 10 metadata/validity groups passed. Both JS/TS SDK
type suites, Python unit/runtime tests, v0.1-to-current migration and native
Codex/Claude configuration parsing passed. Build and Pages packaging passed.

A real isolated Chromium session verified current conflict pages, stale metadata,
source lists, the single-page candidate/approval flow and preservation of the
unrelated page at desktop and 390px widths. No horizontal overflow was observed;
the only console error was the expected pre-login `401 /v1/me`.

The separate ecosystem archive-install suite did not run to completion: npm
reported `ai@7.0.165` as `ai@undefined` while resolving the pre-existing adapter
peer dependency. It failed before code execution and removed temporary packages
and SQLite. No dependency override was used to turn this failure into a pass.
