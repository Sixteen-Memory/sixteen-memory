import { isDeepStrictEqual } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { MemoryApiError, MemoryTransportError, SixteenMemory } from "../../sdk/client.mjs";
import { connectionOptions } from "./config.mjs";

// Check metadata only: never search memories, invoke tools or call a model.
export async function checkConnection(options, { env = process.env, fetch: fetcher = globalThis.fetch, timeoutMs = 15000 } = {}) {
  const { baseUrl, endpoint, keyEnv } = connectionOptions(options);
  const apiKey = env[keyEnv];
  if (!apiKey) throw new Error("missing_key");
  const memory = new SixteenMemory({ baseUrl, apiKey, fetch: fetcher, timeoutMs, maxResponseBytes: 256 * 1024 });
  const identity = await memory.me();
  if (identity.role !== "read" || !identity.user_id) throw new Error("read_only_scoped_key_required");
  const catalog = await memory.request("/v1/capabilities");
  if (catalog?.schema !== "sixteen-memory.capabilities/1" || catalog?.profile !== "api-key-read-only" ||
      catalog?.authentication?.credential !== "api-key" || catalog?.protocol?.endpoint !== "/v1/mcp" ||
      catalog?.protocol?.name !== "mcp" || catalog?.protocol?.transport !== "streamable-http" ||
      !Array.isArray(catalog.tools) || !catalog.tools.length) throw new Error("invalid_capabilities");
  const deadline = AbortSignal.timeout(timeoutMs);
  const client = new Client({ name: "sixteen-memory-connection-check", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
    fetch: async (url, init = {}) => {
      if (String(url) !== endpoint) throw new Error("unexpected_endpoint");
      const response = await fetcher(url, { ...init, redirect: "error",
        signal: init.signal ? AbortSignal.any([init.signal, deadline]) : deadline });
      if (!response.ok) { await response.body?.cancel(); throw new MemoryApiError(response.status, "mcp_http_error", "mcp_http_error"); }
      const reader = response.body?.getReader(), chunks = [];
      let size = 0;
      try {
        if (reader) while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 256 * 1024) { await reader.cancel(); throw new Error("response_too_large"); }
          chunks.push(value);
        }
      } finally { reader?.releaseLock(); }
      return new Response(size ? Buffer.concat(chunks) : null, { status: response.status, headers: response.headers });
    },
  });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const fields = tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, annotations: tool.annotations });
    if (listed.nextCursor || !isDeepStrictEqual(listed.tools.map(fields), catalog.tools.map(fields)) ||
        client.getServerVersion()?.version !== catalog.version ||
        client.getInstructions() !== catalog.instructions ||
        listed.tools.some(tool => tool.annotations?.readOnlyHint !== true || tool.annotations?.destructiveHint !== false ||
          "user_id" in (tool.inputSchema.properties ?? {}))) throw new Error("capabilities_mismatch");
    return { status: "connected", protocol: "mcp", transport: "streamable-http", read_only: true,
      tool_count: listed.tools.length, memory_reads: 0, model_calls: 0 };
  } catch (error) {
    if (error instanceof MemoryApiError || error instanceof MemoryTransportError) throw error;
    if (error?.message === "capabilities_mismatch") throw error;
    throw new Error(deadline.aborted ? "timeout" : "mcp_check_failed");
  } finally { await client.close(); }
}
