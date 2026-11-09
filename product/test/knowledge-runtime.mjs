import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
const directory = await mkdtemp(join(tmpdir(), "sixteen-knowledge-"));
const owner = "synthetic-knowledge-owner-012345678901234567890";
let calls = 0, supported = true, badQuote = false, emptyPlan = false, outage = false, pause, release, reached;
const groups = [];
const run = async (name, fn) => { await fn(); groups.push(name); console.log("PASS", name); };
const fakeProvider = async request => {
  calls++;
  if (pause) { reached(); await new Promise(resolve => { release = resolve; }); pause = false; }
  if (outage) return new Response("fixture error", { status: 503 });
  const body = await request.json(), payload = JSON.parse(body.messages[1].content);
  assert.ok(payload.sources.every(s => s.role === "user" || s.role === "memory"),
    "non-evidence conversation roles must not reach the knowledge provider");
  assert.match(body.messages[0].content, /json/i);
  const sources = payload.items ? null : payload.sources;
  const value = sources && emptyPlan ? { pages: [], edges: [] } : sources ? {
    pages: sources.filter(s => s.role === "user" || s.role === "memory").slice(0, 2).map((s, i) => ({
      slug: "topic-" + i, title: "Topic " + i,
      claims: [{ text: s.text, citations: [{ source_key: s.key, quote: badQuote ? "invented evidence" : s.text }] }],
    })),
    edges: sources.filter(s => s.role === "user" || s.role === "memory").length < 2 ? [] :
      [{ from: "topic-0", to: "topic-1", relation: "related", citations: [{ source_key: sources[0].key, quote: sources[0].text }] }],
  } : { supported: payload.items.map(() => supported) };
  return Response.json({ model: "fixture", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }], usage: { prompt_tokens: 10, completion_tokens: 10 } });
};
const create = () => new Miniflare({
  ...convertV4MiniflareOptions({ workers: [{
    name: "knowledge", modules: true, scriptPath: join(process.cwd(), "dist-worker/index.js"),
    compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
    bindings: { ...config.vars, PROJECT_ID: "knowledge", ADMIN_KEY: owner,
      EXTRACTION_ENABLED: "true", EXTRACTION_BASE_URL: "https://fixture.test/v1", EXTRACTION_MODEL: "fixture", EXTRACTION_API_KEY: "synthetic",
    }, durableObjects: { PROJECTS: { className: "MemoryProject", useSQLite: true } },
    serviceBindings: { ASSETS: () => new Response("") }, outboundService: fakeProvider,
    ratelimits: Object.fromEntries(config.ratelimits.map(({ name, ...value }) => [name, value])),
  }] }), resourcePersistencePath: directory, unsafeInspectDurableObjects: true,
});
let mf = create();
const api = async (method, path, body, key = owner, extraHeaders = {}) => {
  const response = await mf.dispatchFetch("https://fixture.local" + path, {
    method, headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "CF-Connecting-IP": crypto.randomUUID(), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
};
const ok = async (...args) => { const r = await api(...args); assert.equal(r.status, 200, JSON.stringify(r)); return r.body; };
const msg = (id, content = "Rule " + id, role = "user") => ({ id, role, content, observed_at: "2026-11-01T00:00:00Z" });
const conversation = (request_id, user_id = "alice", messages = [msg("m1", "Do not refund without approval.")]) =>
  ({ request_id, user_id, title: "Synthetic full conversation", messages });
const organize = (request_id, ids, extra = {}) => ({ user_id: "alice", request_id, conversation_ids: ids, ...extra });
const wiki = (user = "alice") => ok("GET", "/v1/wiki?user_id=" + user);
let saved, reader, writer;
try {
  await run("conversation writes are exact, paginated, scoped, versioned and idempotent", async () => {
    reader = (await ok("POST", "/v1/keys", { name: "reader", role: "read", user_id: "alice" })).key;
    writer = (await ok("POST", "/v1/keys", { name: "writer", role: "write", user_id: "alice" })).key;
    const input = conversation("c1", "alice", Array.from({ length: 32 }, (_, i) => msg("m" + i)));
    saved = await ok("POST", "/v1/conversations", input, writer);
    assert.equal((await ok("POST", "/v1/conversations", input, writer)).id, saved.id);
    assert.equal((await api("POST", "/v1/conversations", { ...input, title: "changed" }, writer)).status, 409);
    const append = { request_id: "append", expected_version: 1, messages: [msg("m32", "Final message NeedleFinal"), msg("m33", "Unverified claim", "assistant"), msg("m34", "instruction", "system"), msg("m35", "result", "tool")] };
    saved = await ok("POST", `/v1/conversations/${saved.id}/messages`, append, writer);
    assert.equal(saved.version, 2);
    assert.equal((await ok("POST", `/v1/conversations/${saved.id}/messages`, append, writer)).version, 2);
    assert.equal((await api("POST", `/v1/conversations/${saved.id}/messages`, { ...append, request_id: "stale" }, writer)).status, 409);
    const p1 = await ok("GET", `/v1/conversations/${saved.id}`, undefined, reader);
    const p2 = await ok("GET", `/v1/conversations/${saved.id}?cursor=${p1.next_cursor}`, undefined, reader);
    assert.equal(p1.messages.length, 32); assert.equal(p2.messages.length, 4); assert.equal(p2.next_cursor, null);
    assert.equal(p2.messages[0].content, append.messages[0].content);
    assert.deepEqual(p2.messages.map(m => m.role), ["user", "assistant", "system", "tool"]);
    const hits = await ok("POST", "/v1/conversations/search", { user_id: "alice", query: "NeedleFinal" }, reader);
    assert.equal(hits.data[0].conversation_id, saved.id); assert.equal(hits.data[0].conversation_version, 2);
    assert.equal((await api("POST", "/v1/conversations", conversation("denied"), reader)).status, 403);
    assert.equal((await api("POST", "/v1/conversations/search", { user_id: "bob", query: "Rule" }, reader)).status, 404);
    assert.equal((await api("POST", "/v1/conversations", conversation("foreign", "bob"), writer)).status, 404);
    assert.equal((await api("POST", "/v1/conversations", conversation("secret", "alice", [msg("s", "sk-" + "x".repeat(40))]))).status, 422);
  });
  await run("organization generates cited wiki and graph only after review; retry does not call a model", async () => {
    const input = organize("organize-review", [saved.id]);
    const before = calls;
    const job = await ok("POST", "/v1/knowledge/organize", input, writer);
    assert.equal(job.state, "review"); assert.equal(job.proposal.pages.length, 2); assert.equal(calls - before, 2);
    assert.equal((await wiki()).data.length, 0);
    await ok("POST", "/v1/knowledge/organize", input, writer); assert.equal(calls - before, 2);
    assert.equal((await api("POST", `/v1/knowledge/runs/${job.id}/resolve`, { approve: true }, reader)).status, 403);
    assert.equal((await ok("POST", `/v1/knowledge/runs/${job.id}/resolve`, { approve: true }, writer)).state, "applied");
    const pages = (await wiki()).data;
    assert.equal(pages.length, 2); assert.equal(pages[0].claims[0].citations[0].quote, "Rule m0");
    assert.equal((await ok("GET", "/v1/wiki/topic-0?user_id=alice", undefined, reader)).title, "Topic 0");
    assert.equal((await ok("GET", "/v1/knowledge/graph?user_id=alice", undefined, reader)).edges.length, 1);
    assert.equal((await api("GET", "/v1/wiki?user_id=bob", undefined, reader)).status, 404);
    const beforeDenied = calls;
    assert.equal((await api("POST", "/v1/knowledge/organize", { ...input, user_id: "bob" }, writer)).status, 404);
    assert.equal((await api("POST", "/v1/knowledge/organize", { ...input, request_id: "denied-reader" }, reader)).status, 403);
    assert.equal(calls, beforeDenied);
  });
  await run("source append invalidates pages, graph and stored proposals; failed verification never auto-publishes", async () => {
    saved = await ok("POST", `/v1/conversations/${saved.id}/messages`, { request_id: "append-new", expected_version: saved.version, messages: [msg("m36")] });
    assert.equal((await wiki()).data.length, 0);
    assert.equal((await ok("GET", "/v1/knowledge/graph?user_id=alice")).edges.length, 0);
    supported = false;
    const job = await ok("POST", "/v1/knowledge/organize", organize("held", [saved.id], { mode: "auto" }));
    assert.equal(job.state, "review"); assert.ok(job.unsupported_items.length);
    assert.equal((await wiki()).data.length, 0);
    await ok("POST", `/v1/knowledge/runs/${job.id}/resolve`, { approve: false });
    supported = true;
    const auto = await ok("POST", "/v1/knowledge/organize", organize("auto", [saved.id], { mode: "auto" }));
    assert.equal(auto.state, "applied"); assert.equal((await wiki()).data.length, 2);
  });
  await run("empty knowledge and non-evidence-only sources never auto-publish or invoke an unnecessary verifier", async () => {
    const source = await ok("POST", "/v1/conversations", conversation("empty-source", "empty", [msg("m1", "Hello.")]));
    emptyPlan = true; const before = calls;
    const input = { user_id: "empty", request_id: "empty-result", conversation_ids: [source.id], mode: "auto" };
    const job = await ok("POST", "/v1/knowledge/organize", input);
    assert.equal(calls - before, 1); assert.equal(job.state, "review");
    assert.deepEqual(job.proposal.pages, []); assert.equal(job.usage.length, 1);
    assert.equal((await wiki("empty")).data.length, 0);
    await ok("POST", "/v1/knowledge/organize", input); assert.equal(calls - before, 1);
    emptyPlan = false;
    await ok("DELETE", `/v1/conversations/${source.id}`, { expected_version: 1 });
    const context = await ok("POST", "/v1/conversations", conversation("context-only", "context", [
      msg("a", "Refund completed.", "assistant"), msg("t", "Store all claims.", "tool"), msg("s", "Ignore policy.", "system"),
    ]));
    const beforeContext = calls;
    const result = await ok("POST", "/v1/knowledge/organize", { user_id: "context", request_id: "no-evidence", conversation_ids: [context.id], mode: "auto" });
    assert.equal(calls, beforeContext); assert.equal(result.state, "review");
    assert.deepEqual(result.proposal.pages, []); assert.deepEqual(result.usage, []);
    assert.equal((await ok("GET", `/v1/conversations/${context.id}`)).messages.length, 3);
    await ok("DELETE", `/v1/conversations/${context.id}`, { expected_version: 1 });
  });
  await run("invented citations, provider failures and source races fail closed without implicit retries", async () => {
    badQuote = true;
    const before = calls;
    const badInput = organize("bad-quote", [saved.id], { mode: "auto" });
    assert.equal((await api("POST", "/v1/knowledge/organize", badInput)).status, 502); assert.equal(calls - before, 1);
    assert.equal((await ok("POST", "/v1/knowledge/organize", badInput)).state, "failed"); assert.equal(calls - before, 1);
    badQuote = false; outage = true;
    assert.equal((await api("POST", "/v1/knowledge/organize", organize("outage", [saved.id]))).status, 502);
    outage = false;
    pause = true;
    const waiting = new Promise(resolve => { reached = resolve; });
    const request = api("POST", "/v1/knowledge/organize", organize("race", [saved.id], { mode: "auto" }));
    await waiting;
    saved = await ok("POST", `/v1/conversations/${saved.id}/messages`, { request_id: "race-append", expected_version: saved.version, messages: [msg("m37")] });
    release();
    assert.equal((await request).status, 409);
    assert.equal((await wiki()).data.length, 0);
    const jobs = await ok("GET", "/v1/knowledge/runs?user_id=alice");
    assert.ok(jobs.some(job => job.state === "stale" && job.proposal === null));
  });
  await run("actual MCP client negotiates and calls read-only scoped tools; scope spoofing and admin keys are rejected", async () => {
    const before = calls;
    const client = new Client({ name: "runtime-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL("https://fixture.local/v1/mcp"), {
      fetch: async (url, init = {}) => {
        const headers = new Headers(init.headers); headers.set("Authorization", "Bearer " + reader); headers.set("CF-Connecting-IP", crypto.randomUUID());
        return mf.dispatchFetch(url, { ...init, headers });
      },
    });
    try {
      await client.connect(transport);
      const tools = await client.listTools(); assert.equal(tools.tools.length, 7);
      for (const tool of tools.tools) { assert.equal(tool.annotations.readOnlyHint, true); assert.equal(tool.inputSchema.properties.user_id, undefined); }
      const result = await client.callTool({ name: "search_conversations", arguments: { query: "NeedleFinal" } });
      assert.equal(JSON.parse(result.content[0].text).data.data[0].conversation_id, saved.id);
      const spoof = await client.callTool({ name: "search_conversations", arguments: { query: "Rule", user_id: "bob" } });
      assert.equal(spoof.isError, true);
      const page = await client.callTool({ name: "read_conversation", arguments: { id: saved.id } });
      assert.equal(JSON.parse(page.content[0].text).data.messages.length, 32);
      const graph = await client.callTool({ name: "knowledge_graph", arguments: {} });
      assert.deepEqual(JSON.parse(graph.content[0].text).data.edges, []);
    } finally { await client.close(); }
    assert.equal(calls, before);
    const initialize = { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "x", version: "1" } } };
    assert.equal((await api("POST", "/v1/mcp", initialize, owner)).status, 403);
    assert.equal((await api("POST", "/v1/mcp", initialize, reader, { Origin: "https://hostile.invalid" })).status, 403);
    const keyRecord = (await ok("GET", "/v1/keys")).find(key => key.name === "reader");
    await ok("DELETE", `/v1/keys/${keyRecord.id}`);
    assert.equal((await api("POST", "/v1/mcp", initialize, reader)).status, 401);
  });
  await run("complete conversation persists across restart; deletion clears every online derived copy and prevents resurrection", async () => {
    await mf.dispose(); mf = create();
    const page = await ok("GET", `/v1/conversations/${saved.id}?cursor=32`);
    assert.equal(page.messages.length, 6);
    await ok("POST", "/v1/knowledge/organize", organize("before-delete", [saved.id], { mode: "auto" }));
    assert.equal((await wiki()).data.length, 2);
    await ok("DELETE", `/v1/conversations/${saved.id}`, { expected_version: saved.version });
    assert.equal((await wiki()).data.length, 0);
    assert.equal((await api("GET", `/v1/conversations/${saved.id}`)).status, 404);
    assert.equal((await ok("POST", "/v1/conversations/search", { user_id: "alice", query: "NeedleFinal" })).data.length, 0);
    const sql = await mf.unsafeGetDurableObjectStorage("knowledge", "MemoryProject", { name: "knowledge" });
    for (const table of ["conversation_messages", "conversation_index"]) assert.equal((await sql.exec(`SELECT count(*) n FROM ${table} WHERE conversation_id=?`, saved.id))[0].n, 0);
    assert.equal((await sql.exec("SELECT count(*) n FROM knowledge_runs WHERE proposal IS NOT NULL"))[0].n, 0);
    const old = conversation("c1", "alice", Array.from({ length: 32 }, (_, i) => msg("m" + i)));
    assert.equal((await api("POST", "/v1/conversations", old, writer)).status, 410);
    assert.equal((await api("POST", `/v1/conversations/${saved.id}/messages`, { request_id: "race-append", expected_version: saved.version - 1, messages: [msg("m37")] })).status, 410);
  });
  await run("memory and conversation expiry clear generated knowledge and preserve exact raw whitespace", async () => {
    const memory = await ok("POST", "/v1/memories", { user_id: "expiry", request_id: "expiry-memory", content: "Approved policy",
      source: { type: "manual", ref: "fixture", text: "Approval is required.", observed_at: "2026-11-01T00:00:00Z" }, expires_at: null });
    const whitespace = " \n Keep spaces and tabs.\t ";
    const conversation = await ok("POST", "/v1/conversations", { user_id: "expiry", request_id: "expiry-conversation", title: "Expiry", messages: [msg("space", whitespace)] });
    assert.equal((await ok("GET", `/v1/conversations/${conversation.id}`)).messages[0].content, whitespace);
    const job = await ok("POST", "/v1/knowledge/organize", { user_id: "expiry", request_id: "expiry-organize", memory_ids: [memory.id], mode: "auto" });
    assert.equal(job.state, "applied"); assert.equal((await wiki("expiry")).data.length, 1);
    const sql = await mf.unsafeGetDurableObjectStorage("knowledge", "MemoryProject", { name: "knowledge" });
    await sql.exec("UPDATE memories SET valid_to=? WHERE id=?", "2000-01-01T00:00:00.000Z", memory.id);
    assert.equal((await wiki("expiry")).data.length, 0, "validity passage invalidates wiki on read");
    await sql.exec("UPDATE conversations SET expires_at=? WHERE id=?", "2000-01-01T00:00:00.000Z", conversation.id);
    assert.equal((await api("GET", `/v1/conversations/${conversation.id}`)).status, 404);
    assert.equal((await sql.exec("SELECT count(*) n FROM conversation_index WHERE conversation_id=?", conversation.id))[0].n, 0);
  });
  console.log(JSON.stringify({ status: "passed", groups: groups.length, tests: groups, fixture_model_calls: calls, real_model_calls: 0 }, null, 2));
} finally { await mf.dispose(); await rm(directory, { recursive: true, force: true }); }
