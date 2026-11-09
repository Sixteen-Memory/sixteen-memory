# v0.3.0 verification and publication

Prepared November 9, 2026. Status: local release checks passed; production
publication receipt pending. Model quality acceptance is not established.

## Observed checks

- Product unit and transport checks: 32 passed.
- Knowledge/conversation/MCP runtime: seven groups passed against real temporary
  SQLite and the official MCP client, with 13 intercepted fixture-model calls.
- Prior component runtime: seven groups passed.
- Prior product runtime: 29 groups passed.
- Attribute/extraction runtime: ten groups passed.
- Existing v0.1 data migration: passed.
- Python transport tests: four passed on Python 3.9 and 3.11.
- Python wheel/source builds, clean offline installation and real Worker integration: passed.
- Stable OpenAPI/SDK, Vercel adapter, real runtime, HTTP/streaming e2e, console and package checks: passed.
- Production-dependency audit: zero reported vulnerabilities at check time.
- New lockfile tarballs: 93 public-registry integrities verified; no internal mirror URLs retained.
- Build: TypeScript, Vite and Worker dry-run passed.

Browser checks passed for conversation creation, search, role labels, detail/Escape,
missing-model error and wiki/graph empty state at 320/390/768/1440 widths.
A separate local fixture-provider browser verified review/publish, Wiki citation
expansion, and the generated topic graph at the same four widths. Mobile
conversation and graph screenshots were inspected. No real model was called.
The knowledge real-provider runner extension passed six-call intercepted fixtures.
Real provider calls remain zero.
No claim of real-model acceptance, comparison superiority or load certification.

## Current production inspection

Read-only inspection found v0.1.0 at the public health endpoint, with models
disabled. Worker and Pages targets matched the existing product deployment.
GitHub repository remains private. Deployment credentials were available through
the existing CLI credential stores; their values were not exported.

## Blocking model decision

The existing local Qwen settings explicitly record pending cost approval.
Real provider requests have not been made. The user's permitted account,
evaluation cost ceiling and production provider credential authorization must
be resolved before real-model acceptance or production model enablement.

No employer/internal gateway credential may be used for production.
