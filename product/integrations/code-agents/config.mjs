import { SixteenMemory } from "../../sdk/client.mjs";

export function connectionOptions({ baseUrl, keyEnv = "SIXTEEN_MEMORY_API_KEY" }) {
  const client = new SixteenMemory({ baseUrl });
  const url = new URL(client.baseUrl);
  if (url.pathname !== "/" || /[${}\\]/.test(baseUrl) || !/^[A-Z][A-Z0-9_]{0,99}$/.test(keyEnv)) {
    throw new Error("invalid_config");
  }
  return { baseUrl: url.origin, endpoint: url.origin + "/v1/mcp", keyEnv };
}

export function clientConfig(client, options) {
  const { endpoint, keyEnv } = connectionOptions(options);
  if (client === "codex") {
    return `[mcp_servers.sixteen-memory]\nurl = ${JSON.stringify(endpoint)}\nbearer_token_env_var = ${JSON.stringify(keyEnv)}\n`;
  }
  if (client === "claude-code") {
    return JSON.stringify({ mcpServers: { "sixteen-memory": {
      type: "http", url: endpoint, headers: { Authorization: "Bearer ${" + keyEnv + "}" },
    } } }, null, 2) + "\n";
  }
  throw new Error("unsupported_client");
}
