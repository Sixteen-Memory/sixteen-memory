import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const folder = await mkdtemp(join(tmpdir(), "sixteen-wiki-"));
const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
const owner = "synthetic-wiki-admin-" + crypto.randomUUID(), user = "wiki-test";
let generated = { pages: [], edges: [] }, providerCalls = 0, empty = false;
const provider = async request => {
  providerCalls++;
  const body = await request.json(), input = JSON.parse(body.messages[1].content);
  const value = input.items ? { supported: input.items.map(() => true) } : empty ? { pages: [], edges: [] } : {
    pages: generated.pages.map(p => ({
      slug: p.slug, title: p.slug, claims: p.sources.map((sourceId, i) => {
        const s = input.sources.find(s => s.id === sourceId && s.role !== "assistant");
        assert.ok(s);
        return { text: s.text, citations: [{ source_key: s.key, quote: s.text }],
          ...(p.conflict ? { status: "conflicted", conflict_group: "policy" } : {}) };
      }),
    })), edges: generated.edges.map(e => {
      const s = input.sources.find(s => s.id === e.source);
      return { from: e.from, to: e.to, relation: e.relation, citations: [{ source_key: s.key, quote: s.text }] };
    }),
  };
  return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }] });
};
const create = () => new Miniflare({
  ...convertV4MiniflareOptions({ workers: [{
    name: "wiki", modules: true, scriptPath: join(process.cwd(), "dist-worker/index.js"),
    compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
    bindings: { ...config.vars, PROJECT_ID: "wiki", ADMIN_KEY: owner, EXTRACTION_ENABLED: "true",
      EXTRACTION_BASE_URL: "https://fixture.test/v1", EXTRACTION_MODEL: "fixture", EXTRACTION_API_KEY: "synthetic" },
    durableObjects: { PROJECTS: { className: "MemoryProject", useSQLite: true } },
    ratelimits: Object.fromEntries(config.ratelimits.map(({ name, ...value }) => [name, value])),
    serviceBindings: { ASSETS: () => new Response("") }, outboundService: provider,
  }] }), resourcePersistencePath: folder, unsafeInspectDurableObjects: true,
});
let mf = create(), client;
const api = async (method, path, body, key = owner) => {
  const response = await mf.dispatchFetch("https://wiki.test" + path, { method,
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "CF-Connecting-IP": crypto.randomUUID() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
};
const ok = async (...args) => { const r = await api(...args); assert.equal(r.status, 200, JSON.stringify(r)); return r.body; };
const wiki = () => ok("GET", "/v1/wiki?user_id=" + user);
const graph = () => ok("GET", "/v1/knowledge/graph?user_id=" + user);
const source = text => ({ type: "manual", ref: "synthetic-wiki", text, observed_at: "2026-11-01T00:00:00Z" });
const add = (name, text) => ok("POST", "/v1/memories", { user_id: user, request_id: name, content: text, source: source(text) });
const organize = (request_id, ids, extra = {}) => ok("POST", "/v1/knowledge/organize",
  { user_id: user, request_id, memory_ids: ids, mode: "auto", ...extra });
const sql = () => mf.unsafeGetDurableObjectStorage("wiki", "MemoryProject", { name: "wiki" });
const checks = [], run = async (name, fn) => { await fn(); checks.push(name); console.log("PASS", name); };
let a, b, c, reader;
try {
  await run("independent page dependencies survive unrelated additions and isolate source updates", async () => {
    a = await add("a", "Approval is required."); b = await add("b", "Shipping takes seven days.");
    generated = { pages: [{ slug: "approval", sources: [a.id] }, { slug: "shipping", sources: [b.id] }], edges: [] };
    assert.equal((await organize("initial", [a.id, b.id])).state, "applied");
    reader = (await ok("POST", "/v1/keys", { name: "reader", role: "read", user_id: user })).key;
    const before = await wiki(); assert.equal(before.data.length, 2);
    c = await add("c", "Unrelated addition.");
    assert.deepEqual((await wiki()).data.map(p => p.id), before.data.map(p => p.id));
    a = await ok("PATCH", "/v1/memories/" + a.id, {
      expected_version: a.version, content: "Written approval is required.", source: source("Written approval is required."), reason: "Explicit correction",
    });
    const after = await wiki();
    assert.deepEqual(after.data.map(p => p.slug), ["shipping"]);
    assert.deepEqual(after.stale.map(p => p.slug), ["approval"]);
    assert.equal(after.stale[0].claims, undefined);
    assert.ok(!JSON.stringify(after).includes('"quote":"Approval is required."'));
    assert.equal((await api("GET", "/v1/wiki/approval?user_id=" + user)).status, 404);
    assert.equal((await graph()).nodes.length, 1);
    const db = await sql();
    assert.equal((await db.exec("SELECT count(*) n FROM wiki_dependencies"))[0].n, 2);
    assert.ok(!(await db.exec("SELECT body FROM wiki_pages WHERE slug='approval'"))[0].body.includes('"quote"'));
  });
  await run("targeted review replaces only requested pages and exact retries do not invoke providers", async () => {
    const shipping = (await wiki()).data[0];
    generated = { pages: [{ slug: "approval", sources: [a.id] }], edges: [] };
    const job = await organize("repair", [a.id], { target_slugs: ["approval"], mode: "review" });
    assert.deepEqual(job.target_slugs, ["approval"]); assert.equal(job.state, "review");
    assert.equal((await wiki()).stale.length, 1);
    const calls = providerCalls;
    await organize("repair", [a.id], { target_slugs: ["approval"], mode: "review" });
    assert.equal(providerCalls, calls);
    assert.equal((await api("POST", `/v1/knowledge/runs/${job.id}/resolve`, { approve: true }, reader)).status, 403);
    await ok("POST", `/v1/knowledge/runs/${job.id}/resolve`, { approve: true });
    const after = await wiki();
    assert.equal(after.stale.length, 0); assert.equal(after.data.length, 2);
    assert.deepEqual(after.data.find(p => p.slug === "shipping"), shipping);
    assert.equal(after.data.find(p => p.slug === "approval").sources[0].version, a.version);
  });
  await run("invalid, empty and wrong-target rebuilds never replace existing pages", async () => {
    const before = await wiki(), calls = providerCalls;
    for (const targets of [[], ["approval", "approval"], ["../bad"], Array(9).fill("page")]) {
      assert.equal((await api("POST", "/v1/knowledge/organize", { user_id: user, request_id: crypto.randomUUID(), memory_ids: [a.id], target_slugs: targets })).status, 422);
    }
    assert.equal(providerCalls, calls);
    assert.equal((await api("POST", "/v1/knowledge/organize", { user_id: "other", request_id: "wrong-user", memory_ids: [a.id], target_slugs: ["approval"] }, reader)).status, 404);
    generated = { pages: [{ slug: "other", sources: [a.id] }], edges: [] };
    const wrong = await api("POST", "/v1/knowledge/organize", { user_id: user, request_id: "wrong-target", memory_ids: [a.id], target_slugs: ["approval"] });
    assert.equal(wrong.status, 502); assert.equal(wrong.body.error.code, "wiki_target_mismatch");
    empty = true;
    assert.equal((await api("POST", "/v1/knowledge/organize", { user_id: user, request_id: "empty-target", memory_ids: [a.id], target_slugs: ["approval"] })).status, 502);
    empty = false;
    assert.deepEqual(await wiki(), before);
  });
  await run("conflicting claims retain both sources and require review even in auto mode", async () => {
    const opposite = await add("opposite", "No approval is required.");
    generated = { pages: [{ slug: "approval", sources: [a.id, opposite.id], conflict: true }], edges: [] };
    const job = await organize("conflict", [a.id, opposite.id], { target_slugs: ["approval"] });
    assert.equal(job.state, "review");
    assert.equal(job.proposal.pages[0].claims.length, 2);
    await ok("POST", `/v1/knowledge/runs/${job.id}/resolve`, { approve: true });
    const page = (await wiki()).data.find(p => p.slug === "approval");
    assert.equal(page.has_conflicts, true); assert.equal(page.sources.length, 2);
    assert.ok(page.claims.every(c => c.status === "conflicted" && c.conflict_group === "policy"));
    await ok("DELETE", "/v1/memories/" + opposite.id, { expected_version: opposite.version });
    assert.deepEqual((await wiki()).data.map(p => p.slug), ["shipping"]);
    assert.equal((await wiki()).stale.length, 0, "deletion removes dependent pages, not just their current claims");
  });
  await run("legacy schema migration backfills dependencies and survives repeated restart", async () => {
    let db = await sql();
    await db.exec("DROP TABLE wiki_dependencies");
    await db.exec("ALTER TABLE wiki_pages DROP COLUMN state");
    await db.exec("ALTER TABLE wiki_pages DROP COLUMN stale_at");
    await db.exec("ALTER TABLE knowledge_runs DROP COLUMN target_slugs");
    await mf.dispose(); mf = create();
    assert.deepEqual((await wiki()).data.map(p => p.slug), ["shipping"]);
    db = await sql();
    assert.equal((await db.exec("SELECT count(*) n FROM wiki_dependencies"))[0].n, 1);
    await mf.dispose(); mf = create();
    assert.equal((await wiki()).data.length, 1);
    b = await ok("PATCH", "/v1/memories/" + b.id, { expected_version: b.version,
      content: "Shipping takes five days.", source: source("Shipping takes five days."), reason: "Update" });
    assert.equal((await wiki()).stale.length, 1);
  });
  await run("deleting or expiring stale dependencies clears online derived metadata and index", async () => {
    await ok("DELETE", "/v1/memories/" + b.id, { expected_version: b.version });
    assert.deepEqual(await wiki(), { data: [], stale: [] });
    assert.equal((await (await sql()).exec("SELECT count(*) n FROM wiki_dependencies"))[0].n, 0);
    generated = { pages: [{ slug: "expires", sources: [c.id] }], edges: [] };
    await organize("expiry", [c.id]);
    await (await sql()).exec("UPDATE memories SET expires_at='2000-01-01T00:00:00Z' WHERE id=?", c.id);
    assert.deepEqual(await wiki(), { data: [], stale: [] });
    assert.equal((await (await sql()).exec("SELECT count(*) n FROM wiki_dependencies"))[0].n, 0);
  });
  await run("edge dependencies fail closed while unrelated pages and full rebuild compatibility remain", async () => {
    const x = await add("edge-x", "Policy X."), y = await add("edge-y", "Policy Y.");
    const z = await add("edge-z", "Separate reference.");
    generated = { pages: [{ slug: "x", sources: [x.id] }, { slug: "y", sources: [y.id] }, { slug: "z", sources: [z.id] }],
      edges: [{ from: "x", to: "y", relation: "related", source: x.id }] };
    await organize("edges", [x.id, y.id, z.id]);
    assert.equal((await graph()).edges.length, 1);
    await ok("PATCH", "/v1/memories/" + x.id, { expected_version: x.version, content: "Revised X.",
      source: source("Revised X."), reason: "Change edge evidence" });
    assert.deepEqual((await wiki()).data.map(p => p.slug), ["z"]);
    assert.equal((await wiki()).stale.length, 2);
    assert.equal((await graph()).edges.length, 0);
    generated = { pages: [{ slug: "replacement", sources: [z.id] }], edges: [] };
    await organize("legacy-full", [z.id]);
    assert.deepEqual((await wiki()).data.map(p => p.slug), ["replacement"]);
    assert.equal((await wiki()).stale.length, 0);
  });
  await run("MCP returns scoped current pages and metadata-only stale pages, never stale claims", async () => {
    generated = { pages: [{ slug: "approval", sources: [a.id] }], edges: [] };
    await organize("mcp-page", [a.id], { target_slugs: ["approval"] });
    await ok("PATCH", "/v1/memories/" + a.id, { expected_version: a.version, content: "Changed again.",
      source: source("Changed again."), reason: "Explicit" });
    client = new Client({ name: "wiki-test", version: "1" });
    await client.connect(new StreamableHTTPClientTransport(new URL("https://wiki.test/v1/mcp"), {
      fetch: (url, init) => { const headers = new Headers(init.headers); headers.set("Authorization", "Bearer " + reader);
        headers.set("CF-Connecting-IP", crypto.randomUUID()); return mf.dispatchFetch(url, { ...init, headers }); },
    }));
    const result = JSON.parse((await client.callTool({ name: "list_wiki", arguments: {} })).content[0].text).data;
    assert.equal(result.stale[0].slug, "approval"); assert.equal(result.stale[0].claims, undefined);
    assert.equal((await client.callTool({ name: "read_wiki", arguments: { slug: "approval" } })).isError, true);
    assert.equal((await api("GET", "/v1/wiki?user_id=other", undefined, reader)).status, 404);
  });
  await run("conversation dependency changes keep unrelated pages and erase only their own stale metadata", async () => {
    const conversation = await ok("POST", "/v1/conversations", { user_id: user, request_id: "conversation", title: "Conversation",
      messages: [{ id: "m1", role: "user", content: "Conversation rule.", observed_at: "2026-11-01T00:00:00Z" }] });
    generated = { pages: [{ slug: "conversation", sources: [conversation.id] }], edges: [] };
    await ok("POST", "/v1/knowledge/organize", { user_id: user, request_id: "from-chat", conversation_ids: [conversation.id], target_slugs: ["conversation"], mode: "auto" });
    const unrelated = (await wiki()).data.find(p => p.slug === "replacement");
    await ok("POST", `/v1/conversations/${conversation.id}/messages`, { request_id: "append", expected_version: 1,
      messages: [{ id: "m2", role: "user", content: "Additional rule.", observed_at: "2026-11-01T00:00:00Z" }] });
    assert.deepEqual((await wiki()).data.find(p => p.slug === "replacement"), unrelated);
    assert.ok((await wiki()).stale.some(p => p.slug === "conversation"));
    await ok("DELETE", "/v1/conversations/" + conversation.id, { expected_version: 2 });
    assert.ok(!(await wiki()).stale.some(p => p.slug === "conversation"));
    assert.deepEqual((await wiki()).data.find(p => p.slug === "replacement"), unrelated);
  });
  await run("publication capacity failures roll back removals and retain the existing page", async () => {
    const db = await sql(), before = await wiki();
    const current = before.data.find(p => p.slug === "replacement");
    const edge = { from: "replacement", to: "replacement", relation: "related", citations: current.claims[0].citations };
    // Deliberately overfill with local fixture rows to fail after target removal.
    for (let i = 0; i < 257; i++) await db.exec("INSERT INTO knowledge_edges VALUES (?,?,?)", user, "capacity-fixture", JSON.stringify(edge));
    const fresh = await add("capacity-memory", "Capacity rollback evidence.");
    generated = { pages: [{ slug: "approval", sources: [fresh.id] }], edges: [] };
    const response = await api("POST", "/v1/knowledge/organize", { user_id: user, request_id: "capacity-failure", memory_ids: [fresh.id], target_slugs: ["approval"], mode: "auto" });
    assert.equal(response.status, 409); assert.equal(response.body.error.code, "wiki_capacity");
    assert.deepEqual((await wiki()).data.find(p => p.slug === "replacement"), current);
    assert.deepEqual((await wiki()).stale, before.stale);
    await db.exec("DELETE FROM knowledge_edges WHERE run_id='capacity-fixture'");
  });
  console.log(JSON.stringify({ status: "passed", checks, fixture_provider_calls: providerCalls, real_model_calls: 0 }, null, 2));
} finally { await client?.close(); await mf.dispose(); await rm(folder, { recursive: true, force: true }); }
