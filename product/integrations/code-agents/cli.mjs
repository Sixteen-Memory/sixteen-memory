import { parseArgs } from "node:util";
import { clientConfig } from "./config.mjs";
import { checkConnection } from "./check.mjs";

const help = `SixteenMemory Code Agent connection helper
  node integrations/code-agents/cli.mjs config codex --base-url https://memory.example
  node integrations/code-agents/cli.mjs config claude-code --base-url https://memory.example
  node integrations/code-agents/cli.mjs check --base-url https://memory.example
Options: --key-env SIXTEEN_MEMORY_API_KEY, --help
Config prints a fragment, never keys, and does not edit client files.
Check reads the key from the named environment variable; it requires a scoped read-only key.
`;
try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    "base-url": { type: "string" }, "key-env": { type: "string", default: "SIXTEEN_MEMORY_API_KEY" },
    help: { type: "boolean" },
  } });
  const options = { baseUrl: values["base-url"], keyEnv: values["key-env"] };
  if (values.help) process.stdout.write(help);
  else if (positionals[0] === "config" && positionals.length === 2) process.stdout.write(clientConfig(positionals[1], options));
  else if (positionals[0] === "check" && positionals.length === 1) process.stdout.write(JSON.stringify(await checkConnection(options), null, 2) + "\n");
  else throw new Error("invalid_arguments");
} catch (error) {
  // SDK/client errors can contain endpoints or headers. Never print their raw text.
  const hints = {
    invalid_config: "Use an HTTPS service origin (HTTP only for localhost), without a path, query or credentials, and a valid environment-variable name.",
    unsupported_client: "Choose codex or claude-code.",
    missing_key: "Set the named environment variable to a read-only user key before checking.",
    read_only_scoped_key_required: "Use a read-only user key, not an administrator or read/write key.",
    invalid_capabilities: "The target does not advertise the expected capability format. Check its deployed version.",
    capabilities_mismatch: "The advertised capabilities differ from the MCP tools. Check the service version.",
    mcp_check_failed: "MCP negotiation failed. Check the endpoint and service logs.",
    mcp_http_error: "The MCP endpoint rejected the request. Check its version and key access.",
    invalid_key: "The key is invalid or revoked. Obtain a new read-only user key.",
    login_required: "The service requires a valid read-only user key.",
    timeout: "The connection timed out.",
    network_error: "The service could not be reached.",
    redirect_denied: "The service redirected the request. Use its final trusted origin.",
    response_too_large: "The service response exceeded the metadata size limit.",
  };
  process.stderr.write((hints[error?.code ?? error?.message] ?? "Setup failed. Check arguments, the service URL and the named key environment variable; use --help for usage.") + "\nNo client configuration was changed.\n");
  process.exitCode = 1;
}
