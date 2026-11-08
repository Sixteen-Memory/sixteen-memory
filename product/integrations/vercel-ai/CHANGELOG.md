# Changelog

## 0.2.0 — Private integration candidate

- Use the typed core SDK as a required peer instead of a second HTTP transport.
- Export a Web-standard authenticated chat handler with Origin, quota, input-size,
  cancellation and sanitized streaming-failure handling.
- Add real local HTTP/SQLite end-to-end, console-cookie and clean two-archive tests.
- Keep read-only tools and explicit application-owned writes.

Not publicly published; API/Worker versions and production storage are unchanged.

## 0.1.0 — 2026-11-08

- Add AI SDK 7 language-model middleware for scoped memory retrieval in generate and stream calls.
- Add read-only `searchMemory` and `getMemory` tools.
- Add an explicit, user-only `rememberUserMessage` application method outside model tools.
- Add bounded context serialization, input/response validation, abort/timeout propagation, redirect denial, and sanitized errors.
- Add AI SDK mock tests, type interoperability checks, an offline example, and local v0.1.0/v0.2.1 Workers/SQLite integration tests.

Unreleased to npm. No public API-compatibility promise exists before an approved registry release.
