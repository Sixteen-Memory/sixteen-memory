# Code Agent connections

Status: local implementation, not deployed or published. Requires Node.js 24
and the existing product dependencies (`npm ci` in `product/`).

Codex and Claude Code connect directly to the existing MCP endpoint using its
read-only API-key profile.
No sidecar, daemon, model proxy, new runtime dependency or automatic memory
capture is added. These helpers do not start, orchestrate or remotely expose
the coding agents themselves.

## Generate a connection

From `product/`, use the origin of the SixteenMemory deployment you intend to
trust. The following loopback example requires a running local service:

```sh
npm run agents -- config codex --base-url http://127.0.0.1:8790
npm run agents -- config claude-code --base-url http://127.0.0.1:8790
```

The first command prints a TOML fragment for Codex's `mcp_servers.sixteen-memory`
entry. The second prints an `mcpServers` JSON object for Claude Code's
project `.mcp.json`. They do not edit either file or overwrite existing servers.
Add only the generated entry to the client's existing configuration using its
normal setup workflow. Codex project configuration requires a trusted project;
Claude Code project servers require user approval.

Both configurations refer to `SIXTEEN_MEMORY_API_KEY`, not its value.
`--key-env MY_MEMORY_KEY` selects another environment variable.
Supply a **read-only, user-scoped** key to the client process through your
approved secret mechanism. A GUI client might not inherit a terminal's
environment. Restart the client after changing its environment.
Never put an administrator key, a key value or business data in the generated
configuration or source control. Claude reserves some provider credential
variable names; use the default dedicated SixteenMemory variable.

Only HTTPS service origins are accepted, with HTTP allowed for
`localhost`, `127.0.0.1` and `[::1]`. Do not pass `/v1/mcp`, credentials,
queries or fragments in `--base-url`. Reverse proxies must preserve the
root-relative `/v1/` routes.

## Check the connection

After the key is available in the named environment variable:

```sh
npm run agents -- check --base-url http://127.0.0.1:8790
```

The check reads `/v1/me` and `/v1/capabilities`, negotiates MCP, and compares
the actual `tools/list`, schemas, server version and instructions against the
advertised catalog. It makes **no tool calls, memory reads, writes or model
calls**. It never changes client files. A successful report contains only
status, transport and counts, not user IDs or credentials.

The check requires a read-only API key even though the existing MCP server also
accepts user-scoped write API keys for read-only operations. It does not accept
OAuth tokens: those remain restricted to the MCP resource, not `/v1/me`.
Redirects are refused;
metadata is capped at 256 KiB, and requests have time limits. A failed check
exits nonzero with a bounded message rather than printing upstream error text.
The capability check requires this local addition to be deployed; it is not
expected to pass against an older server missing `/v1/capabilities`.

## Use and discover

An agent first negotiates MCP and calls `tools/list`, the standard discovery
interface. Available operations are memory search/read, conversation
search/read, Wiki list/read and the topic graph. No user ID can be supplied
through a tool; the authenticated key fixes its scope.

For example, ask the connected agent to find stored context for a project and
report its sources. It can only find material explicitly retained in
SixteenMemory. Installing the connection does not import local chats or files.
Reading another user's record fails; revoking the key prevents future requests.
Revocation cannot erase material a client already retrieved.

The optional `GET /v1/capabilities` returns a public `api-key-read-only` catalog generated
from the same tool definitions. It exposes descriptions, JSON Schema inputs,
read-only annotations, authentication requirements and a relative MCP URL;
it contains no user records, identities, provider settings or keys.
It is available through both the Worker and the Pages Service Binding.
The catalog is not an inventory of every authenticated connection. OAuth write
grants can expose additional user-approved write tools through their own
`tools/list`; that existing behavior is preserved. See the
[OAuth guide](../../MCP_OAUTH_RELEASE_2026-11-09.md) for preregistration, consent,
approval and revocation. This helper does not enable or alter OAuth.
The existing origin policy, rate limit and `no-store` response policy apply.
Only GET is supported; other methods return 405.

The catalog envelope is **SixteenMemory-specific**, with schema identifier
`sixteen-memory.capabilities/1`. Standard discovery is MCP `tools/list` and
standard input descriptions are JSON Schema. This is **not an A2A Agent Card**,
does not register with a global directory, and makes no A2A task claim.
The existing historical v0.1 OpenAPI download is not changed by this addition.

## Verification

```sh
node --test test/code-agents.test.mjs
npm run build
npm run test:agent-access
npm run test:knowledge
```

The tests exercise the generated configuration through the official MCP client
over real loopback HTTP, Pages, Worker and SQLite. They verify catalog parity,
scope isolation, read-only tools, key revocation, metadata-only checks, drift,
redirect refusal and response limits. Only synthetic data and local storage are
used. These checks do not establish model-driven behavior in every client,
production availability or an SLA.

When both native CLIs are installed, optionally run
`node integrations/code-agents/native-config-check.mjs`. It uses temporary
configuration directories and a non-serving loopback address to check Codex's
TOML parser and Claude Code's project JSON parser. Claude's project approval
remains pending; no user settings or model credentials are loaded.

## Design references

Reviewed November 12, 2026:

- [Codex MCP configuration](https://developers.openai.com/codex/mcp):
  Streamable HTTP and `bearer_token_env_var`.
- [Claude Code MCP configuration](https://code.claude.com/docs/en/mcp):
  HTTP server entries and environment-variable expansion.
- [Google Agent Mesh](https://github.com/google/agentmesh):
  existing-service integration and explicit access boundaries.
- [OpenAgents](https://github.com/openagents-org/openagents):
  low-friction connections for existing coding agents.

No Google Agent Mesh or OpenAgents source was copied. The implementation reuses
the project's official MCP SDK and Zod dependencies; their existing notices
remain in [THIRD_PARTY_LICENSES.md](../../THIRD_PARTY_LICENSES.md).
