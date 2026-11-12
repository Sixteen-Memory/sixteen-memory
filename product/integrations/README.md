# Framework integrations

Adapters live beside the product but keep independent dependency locks. They do not change the core service's package versions or deployment settings.

| Integration | Source status | Verified scope |
| :--- | :--- | :--- |
| [Codex and Claude Code](code-agents/README.md) | Local source helpers, not deployed or published | Native MCP configuration, metadata-only connection checks and shared capability discovery |
| [Vercel AI SDK 7](vercel-ai/README.md) | Private developer preview, not published to npm | Generate/stream middleware, read-only tools, explicit user-message writes, and local v0.1.0/v0.2.1 compatibility |

Install and test only the integration you need. Real provider calls, package publication, and production deployment need separate authorization. Existing product localization and multilingual fixtures remain unchanged.
