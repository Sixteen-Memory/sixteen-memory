# v0.3.0 verification and publication

Prepared November 9, 2026. Status: v0.3.0 source is merged and deployed to the existing Worker and Pages console. Model quality acceptance is not established.

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

## Production publication

- GitHub main: `4f6a6bc` (`feat: add scoped conversations, knowledge workspace, MCP and Python client`). PR #7 was merged into the private repository.
- Worker `sixteen-memory-product`: current version `6efdd109-0bac-4a80-a629-5a3cd2194f40`, tag `v0.3.0`, message `v0.3.0 source 4f6a6bc; conversations and read-only MCP; models disabled`.
- Pages project `sixteen-memory-console`: production deployment `19b10576-3fcf-419d-9b7e-c7a08dce3e0a`, source `4f6a6bc`.
- Public health on both custom and Pages domains returned `version=0.3.0`, `retrieval=lexical`, `extraction=explicit`, `model_configured=false`.
- Existing `ADMIN_KEY` secret remained the only listed Worker secret. No DNS, model secret, npm/PyPI, or visibility change was performed.

## Blocking model decision

The existing local Qwen settings explicitly record pending cost approval.
Real provider requests have not been made. The user's permitted account,
evaluation cost ceiling and production provider credential authorization must
be resolved before real-model acceptance or production model enablement.

No employer/internal gateway credential may be used for production.

## Live synthetic verification after deploy

The first custom-domain verification attempt reached health and memory evidence/context, then hit a local network timeout; its temporary memory was already gone. Two temporary keys were later found revoked, and reconciliation showed zero remaining conversations, memories or active keys for that synthetic user.

A second run used the same HTTPS target through a curl-backed transport after observing Node TLS/socket instability. It passed health, memory evidence/context, conversation idempotency/scope/read-only checks, honest unconfigured knowledge failure, and official MCP client calls. It created one memory, one conversation and two scoped keys for `release-7b2e3f31-dce9-4288-80b2-415a4c44d2e0`; cleanup reported no errors. A follow-up reconciliation over both synthetic users found zero remaining memories, conversations or active keys. Real model calls: zero. Production customer-data reads: none.

Browser verification after Pages deploy loaded `https://console.sixteenmemory.com`, showed `v0.3.0 · 开发预览`, and had no mobile login overflow at 390px. The expected unauthenticated `/v1/me` 401 appeared in the console log.
