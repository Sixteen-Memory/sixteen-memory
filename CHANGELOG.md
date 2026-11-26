# Changelog

All notable changes to SixteenMemory are documented in this file.

## [Unreleased]

### Added
- GitHub Actions CI workflow (`.github/workflows/ci.yml`) running offline docs/SVG checks, OpenAPI & SDK type suites, Worker build, unit/Wiki/MCP/OAuth runtime tests, Vercel AI adapter tests, Python wheel checks, website checks, and the zero-key demo on every push and pull request.
- Bilingual English / Chinese interface (`EN / zh-CN`) for the React management console (`product/src/i18n.ts`), with automatic browser locale detection and persisted language toggle, aligned with the official cobalt-blue SixteenMemory brand palette.
- Self-contained zero-API-key incremental Wiki & MCP walkthrough demo (`npm run demo` / `product/examples/incremental-wiki-demo.mjs`).
- Faster local onboarding scripts (`npm run setup:product`, `npm run quickstart`) and `product/.dev.vars.example` configuration template for model-free, OpenAI, and Qwen setups.
- Structured GitHub issue templates and discussion routing under `.github/ISSUE_TEMPLATE/`.

## [0.3.0] - 2026-11-26

### Added
- Initial public open-source release under the [Apache License 2.0](LICENSE).
- Incremental source-linked Wiki with `(source_id, version)` dependency tracking, selective stale-page invalidation, preserved multi-source conflict review, and exact-page rebuilds (`target_slugs`).
- Native MCP endpoint (`/v1/mcp`), PKCE OAuth 2.1 human-approved write flow, and zero-daemon Codex & Claude Code setup/verification CLI (`product/integrations/code-agents/`).
- Zero-dependency TypeScript / JavaScript SDK (`@sixteen-memory/sdk@0.3.0`), Python sync + optional `httpx` native `asyncio` SDK (`sixteen-memory==0.3.1`), and Vercel AI SDK 7 adapter (`@sixteen-memory/vercel-ai@0.3.0`).
- Reviewed 30-minute chunked audio/video ingestion workflow (opt-in, disabled by default).
- Light and Dark adaptive README lockups, minimalist architecture/lifecycle SVGs, and `README.zh-CN.md`.
