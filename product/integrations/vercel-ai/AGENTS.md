# Adapter rules

- This is a server-only Vercel AI SDK 7 integration. Do not place scoped memory keys in browsers.
- User scope comes from authenticated application configuration. Never add `userId`, key, endpoint, or write controls to model tool schemas.
- Keep model tools read-only. Application-controlled explicit user-message writes stay outside tools.
- Do not add implicit retries, automatic answer storage, global cross-user caches, or production provider defaults.
- Preserve no-network mock tests and both v0.1.0/v0.2.1 local runtime checks when changing behavior.
- Do not publish or deploy this package without separate approval.
