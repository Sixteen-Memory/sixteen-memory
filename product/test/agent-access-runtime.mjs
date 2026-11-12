import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SixteenMemory } from "../sdk/client.mjs";
import { clientConfig } from "../integrations/code-agents/config.mjs";
import { checkConnection } from "../integrations/code-agents/check.mjs";

const directory = await mkdtemp(join(tmpdir(), "sixteen-agent-access-"));
const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
const owner = "synthetic-owner-" + crypto.randomUUID();
let outbound = 0;
const groups = [];
const run = async (name, fn) => { await fn(); groups.push(name); console.log("PASS", name); };
const mf = new Miniflare({
  ...convertV4MiniflareOptions({ workers: [
    { name: "pages", modules: true, scriptPath: join(process.cwd(), "pages/_worker.js"),
      compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
      serviceBindings: { MEMORY_SERVICE: "memory", ASSETS: () => new Response("page") } },
    { name: "memory", modules: true, scriptPath: join(process.cwd(), "dist-worker/index.js"),
      compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
      bindings: { ...config.vars, PROJECT_ID: "agent-access", ADMIN_KEY: owner },
      durableObjects: { PROJECTS: { className: "MemoryProject", useSQLite: true } },
      serviceBindings: { ASSETS: () => new Response("asset") },
      ratelimits: Object.fromEntries(config.ratelimits.map(({ name, ...value }) => [name, value])),
      outboundService: () => { outbound++; throw Error("Unexpected external access"); } },
  ] }), resourcePersistencePath: directory,
});
let client;
try {
  const baseUrl = (await mf.ready).origin;
  const admin = new SixteenMemory({ baseUrl, apiKey: owner });
  const reader = await admin.createKey({ name: "code-agent", user_id: "alice", role: "read" });
  const foreign = await admin.createKey({ name: "other-agent", user_id: "bob", role: "read" });
  const source = { type: "manual", ref: "synthetic", text: "AgentAccessNeedle", observed_at: "2026-11-12T00:00:00Z" };
  const alice = await admin.add({ user_id: "alice", request_id: "alice", content: "AgentAccessNeedle", source });
  const bob = await admin.add({ user_id: "bob", request_id: "bob", content: "AgentAccessNeedle", source });
  const env = { SIXTEEN_MEMORY_API_KEY: reader.key };
  let catalog;
  await run("Pages exposes a public, data-free capability catalog with origin and method guards", async () => {
    const response = await fetch(baseUrl + "/v1/capabilities");
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    catalog = await response.json();
    assert.equal(catalog.schema, "sixteen-memory.capabilities/1");
    assert.equal(catalog.profile, "api-key-read-only");
    assert.equal(catalog.authentication.credential, "api-key");
    assert.equal(catalog.tools.length, 7);
    for (const privateValue of [owner, reader.key, "alice", "bob", alice.id, bob.id, "AgentAccessNeedle"]) {
      assert.ok(!JSON.stringify(catalog).includes(privateValue));
    }
    const wrong = await fetch(baseUrl + "/v1/capabilities", { method: "POST" });
    assert.equal(wrong.status, 405); assert.equal(wrong.headers.get("allow"), "GET");
    assert.equal((await fetch(baseUrl + "/v1/capabilities", { headers: { Origin: "https://hostile.test" } })).status, 403);
  });
  await run("generated Claude config drives official MCP client; tools and schemas match HTTP catalog", async () => {
    const generated = JSON.parse(clientConfig("claude-code", { baseUrl })).mcpServers["sixteen-memory"];
    assert.equal(generated.headers.Authorization, "Bearer ${SIXTEEN_MEMORY_API_KEY}");
    client = new Client({ name: "generated-config-test", version: "1" });
    await client.connect(new StreamableHTTPClientTransport(new URL(generated.url), {
      requestInit: { headers: { Authorization: generated.headers.Authorization.replace("${SIXTEEN_MEMORY_API_KEY}", reader.key) } },
    }));
    const tools = await client.listTools();
    assert.deepEqual(tools.tools.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })), catalog.tools);
    assert.equal(client.getInstructions(), catalog.instructions);
    for (const tool of tools.tools) {
      assert.equal(tool.annotations.readOnlyHint, true); assert.equal(tool.annotations.destructiveHint, false);
      assert.equal(tool.inputSchema.additionalProperties, false);
      assert.equal(tool.inputSchema.properties.user_id, undefined);
    }
  });
  await run("native MCP reads preserve scope, reject scope overrides and cannot write", async () => {
    const found = await client.callTool({ name: "get_memory", arguments: { id: alice.id } });
    assert.equal(JSON.parse(found.content[0].text).data.id, alice.id);
    assert.equal((await client.callTool({ name: "get_memory", arguments: { id: bob.id } })).isError, true);
    assert.equal((await client.callTool({ name: "get_memory", arguments: { id: alice.id, user_id: "bob" } })).isError, true);
    assert.equal((await client.callTool({ name: "delete_memory", arguments: { id: alice.id } })).isError, true);
    assert.equal((await admin.get(alice.id)).id, alice.id);
  });
  await run("connection helper and CLI negotiate over real loopback HTTP without reading memories", async () => {
    const requests = [];
    const report = await checkConnection({ baseUrl }, { env, fetch: (url, init) => {
      requests.push({ path: new URL(url).pathname, method: init?.body ? JSON.parse(init.body).method : null });
      return fetch(url, init);
    } });
    assert.equal(report.status, "connected"); assert.equal(report.tool_count, 7);
    assert.ok(requests.every(r => ["/v1/me", "/v1/capabilities", "/v1/mcp"].includes(r.path)));
    assert.ok(!requests.some(r => r.method === "tools/call"));
    const output = await promisify(execFile)(process.execPath,
      ["integrations/code-agents/cli.mjs", "check", "--base-url", baseUrl],
      { env: { ...process.env, ...env }, timeout: 30000, maxBuffer: 8192 });
    assert.equal(JSON.parse(output.stdout).status, "connected");
    assert.ok(!output.stdout.includes(reader.key)); assert.ok(!output.stdout.includes("alice"));
  });
  await run("helper detects drift, refuses credential redirects and bounds metadata responses", async () => {
    await assert.rejects(checkConnection({ baseUrl }, { env, fetch: async (url, init) => {
      if (new URL(url).pathname === "/v1/capabilities") {
        const drift = structuredClone(catalog); drift.tools[0].description = "drift"; return Response.json(drift);
      }
      return fetch(url, init);
    } }), /capabilities_mismatch/);
    let redirected = 0;
    await assert.rejects(checkConnection({ baseUrl }, { env, fetch: async (url, init) => {
      if (new URL(url).pathname === "/v1/mcp") {
        redirected++; assert.equal(init.redirect, "error");
        return new Response(null, { status: 302, headers: { Location: "https://hostile.test" } });
      }
      return fetch(url, init);
    } }));
    assert.equal(redirected, 1);
    let cancelled = false;
    await assert.rejects(checkConnection({ baseUrl }, { env, fetch: async (url, init) => {
      if (new URL(url).pathname === "/v1/mcp") return new Response(new ReadableStream({
        start(controller) { controller.enqueue(new Uint8Array(256 * 1024 + 1)); },
        cancel() { cancelled = true; },
      }));
      return fetch(url, init);
    } }));
    assert.equal(cancelled, true);
  });
  await run("revoked keys stop both the existing client and new connections; administrator is not an adapter key", async () => {
    await assert.rejects(checkConnection({ baseUrl }, { env: { SIXTEEN_MEMORY_API_KEY: owner } }), /read_only_scoped_key_required/);
    await admin.revokeKey(reader.record.id);
    await assert.rejects(client.listTools());
    await assert.rejects(checkConnection({ baseUrl }, { env }), error => error.status === 401);
    assert.equal((await checkConnection({ baseUrl }, { env: { SIXTEEN_MEMORY_API_KEY: foreign.key } })).status, "connected");
    assert.equal(outbound, 0);
  });
  console.log(JSON.stringify({ status: "passed", groups, real_model_calls: 0, production_access: false }, null, 2));
} finally {
  await client?.close(); await mf.dispose(); await rm(directory, { recursive: true, force: true });
}
