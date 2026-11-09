import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { SixteenMemory } from "../sdk/index.mjs";

const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
const directory = await mkdtemp(join(tmpdir(), "sixteen-components-"));
const owner = "synthetic-components-owner-01234567890123456789";
let outbound = 0;
const groups = [];
function create() {
  return new Miniflare({
    ...convertV4MiniflareOptions({ workers: [{
      name: "components", modules: true, scriptPath: join(process.cwd(), "dist-worker/index.js"),
      compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
      bindings: { ...config.vars, PROJECT_ID: "components", ADMIN_KEY: owner },
      durableObjects: { PROJECTS: { className: "MemoryProject", useSQLite: true } },
      serviceBindings: { ASSETS: () => new Response("") },
      outboundService: () => { outbound++; throw new Error("Unexpected network request"); },
      ratelimits: Object.fromEntries(config.ratelimits.map(({ name, ...value }) => [name, value])),
    }] }), resourcePersistencePath: directory, unsafeInspectDurableObjects: true,
  });
}
let mf = create();
const api = async (method, path, body, key = owner) => {
  const response = await mf.dispatchFetch("https://fixture.local" + path, { method,
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "CF-Connecting-IP": crypto.randomUUID() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
};
const ok = async (...args) => { const result = await api(...args); assert.equal(result.status, 200, JSON.stringify(result)); return result.body; };
const draft = (request_id, extra = {}) => ({
  request_id, user_id: "alice", content: "Delivery preferences",
  source: { type: "manual", ref: "fixture-receipt", text: "Deliver using the ZephyrToken route only after approval.", observed_at: "2026-11-01T00:00:00.000Z" },
  expires_at: null, ...extra,
});
const run = async (name, check) => { await check(); groups.push(name); console.log("PASS", name); };
let saved, key;
try {
  await run("evidence retrieves source-only facts without changing existing summary search", async () => {
    saved = await ok("POST", "/v1/memories", draft("first", { category: "support" }));
    assert.equal((await ok("POST", "/v1/search", { user_id: "alice", query: "ZephyrToken" })).data.length, 0);
    const result = await ok("POST", "/v1/evidence/search", { user_id: "alice", query: "ZephyrToken" });
    assert.equal(result.data[0].memory_id, saved.id); assert.equal(result.data[0].source.text, saved.source.text);
    assert.equal(result.data[0].kind, "primary");
    const context = await ok("POST", "/v1/context", { user_id: "alice", query: "ZephyrToken", max_chars: 1000 });
    assert.equal(context.memories[0].id, saved.id); assert.equal(context.budget.used, context.context.length);
    assert.ok(context.context.length <= 1000); assert.deepEqual(JSON.parse(context.context).memories, context.memories);
    assert.equal((await ok("POST", "/v1/context", { user_id: "alice", query: "ZephyrToken", include_evidence: false })).memories.length, 0);
  });
  await run("all new endpoints require explicit scope and honor read-only user keys", async () => {
    key = (await ok("POST", "/v1/keys", { name: "Reader", role: "read", user_id: "alice" })).key;
    await ok("POST", "/v1/memories", draft("foreign", { user_id: "bob" }));
    for (const path of ["/v1/context", "/v1/evidence/search", "/v1/memory-review"]) {
      const input = { user_id: "alice", query: "ZephyrToken" };
      assert.equal((await api("POST", path, input, key)).status, 200);
      assert.equal((await api("POST", path, { ...input, user_id: "bob" }, key)).status, 404);
      assert.equal((await api("POST", path, { query: "ZephyrToken" })).status, 422);
      assert.equal((await api("POST", path, { query: "ZephyrToken" }, key)).status, 422);
      assert.equal((await api("POST", path, input, "unknown-key-012345678901234567890123456789")).status, 401);
    }
    assert.equal((await api("POST", "/v1/context", { user_id: "bob", query: "ZephyrToken", mode: "semantic" }, key)).status, 404);
    assert.equal(outbound, 0);
  });
  await run("source search filters and validity run before top-k and resist SQL text", async () => {
    await ok("POST", "/v1/memories", draft("sales", { category: "sales" }));
    await ok("POST", "/v1/memories", draft("future", { category: "future", valid_from: "2090-01-01T00:00:00Z", valid_to: "2090-02-01T00:00:00Z" }));
    const input = { user_id: "alice", query: "ZephyrToken", limit: 1, filter: { field: "category", op: "eq", value: "support" } };
    assert.equal((await ok("POST", "/v1/evidence/search", input, key)).data[0].memory_id, saved.id);
    assert.equal((await ok("POST", "/v1/context", input, key)).memories[0].id, saved.id);
    const future = { ...input, filter: { ...input.filter, value: "future" } };
    assert.equal((await ok("POST", "/v1/evidence/search", future)).data.length, 0);
    assert.equal((await ok("POST", "/v1/evidence/search", { ...future, at: "2090-01-01T00:00:00Z" })).data.length, 1);
    assert.equal((await ok("POST", "/v1/evidence/search", { ...future, at: "2090-02-01T00:00:00Z" })).data.length, 0);
    assert.equal((await ok("POST", "/v1/evidence/search", { ...input, filter: { ...input.filter, value: "' OR 1=1--" } })).data.length, 0);
    assert.equal((await api("POST", "/v1/evidence/search", { ...input, filter: { ...input.filter, field: "user_id" } })).status, 422);
  });
  await run("context validates budgets and explicitly reports whole-record omission", async () => {
    await ok("POST", "/v1/memories", draft("long", { user_id: "large", content: "LongToken " + "x".repeat(3000), source: { ...saved.source, text: "A".repeat(3000) + " never approved" } }));
    const result = await ok("POST", "/v1/context", { user_id: "large", query: "LongToken", max_chars: 512 });
    assert.equal(result.context, ""); assert.equal(result.omitted_count, 1); assert.equal(result.truncated, true);
    for (const invalid of [{ max_chars: 511 }, { max_chars: "6000" }, { limit: 21 }, { include_evidence: "yes" }]) {
      assert.equal((await api("POST", "/v1/context", { user_id: "alice", query: "Delivery", ...invalid })).status, 422);
    }
    const unavailable = await api("POST", "/v1/context", { user_id: "alice", query: "Delivery", mode: "semantic" });
    assert.equal(unavailable.status, 503);
    const fallback = await ok("POST", "/v1/context", { user_id: "alice", query: "Delivery", mode: "hybrid", fallback: "lexical" });
    assert.equal(fallback.degraded, true); assert.ok(fallback.warning);
  });
  await run("updates, revocation and deletion remove stale primary evidence from retrieval", async () => {
    const updated = await ok("PATCH", `/v1/memories/${saved.id}`, { ...saved, source: { ...saved.source, text: "Use UpdatedToken after approval." }, expected_version: 1, reason: "Source correction" });
    const query = text => ok("POST", "/v1/evidence/search", { user_id: "alice", query: text, filter: { field: "category", op: "eq", value: "support" } });
    assert.equal((await query("ZephyrToken")).data.length, 0);
    assert.equal((await query("UpdatedToken")).data[0].memory_version, 2);
    const revoked = await ok("POST", `/v1/memories/${saved.id}/revoke`, { expected_version: 2, reason: "Inactive" });
    assert.equal((await query("UpdatedToken")).data.length, 0);
    await ok("DELETE", `/v1/memories/${saved.id}`, { expected_version: revoked.version });
    const sql = await mf.unsafeGetDurableObjectStorage("components", "MemoryProject", { name: "components" });
    assert.equal((await sql.exec("SELECT count(*) n FROM evidence_index WHERE memory_id=?", updated.id))[0].n, 0);
    assert.equal((await api("POST", "/v1/memories", draft("first", { category: "support" }))).status, 410);
  });
  await run("review is read-only and identifies duplicates, slot differences and old sources", async () => {
    const a = await ok("POST", "/v1/memories", draft("review1", { user_id: "review", content: "Berlin" }));
    await ok("POST", "/v1/memories", draft("review2", { user_id: "review", content: "Berlin" }));
    const b = await ok("POST", "/v1/memories", draft("review3", { user_id: "review", content: "Paris", source: { ...saved.source, observed_at: "2020-01-01T00:00:00Z" } }));
    const sql = await mf.unsafeGetDurableObjectStorage("components", "MemoryProject", { name: "components" });
    await sql.exec("UPDATE memories SET fact_key='user.home_city' WHERE id=?", a.id);
    await sql.exec("UPDATE memories SET fact_key='user.residence_city' WHERE id=?", b.id);
    const before = await sql.exec("SELECT * FROM memories WHERE user_id='review' ORDER BY id");
    const review = await ok("POST", "/v1/memory-review", { user_id: "review" });
    assert.equal(review.scanned, 3); assert.equal(review.changed, 0);
    assert.deepEqual(new Set(review.findings.map(f => f.kind)), new Set(["duplicate_content", "slot_conflict", "old_evidence"]));
    assert.deepEqual(await sql.exec("SELECT * FROM memories WHERE user_id='review' ORDER BY id"), before);
    assert.equal((await api("POST", "/v1/memory-review", { user_id: "review", stale_before: "2090-01-01T00:00:00Z" })).status, 422);
  });
  await run("evidence index persists without duplicate rows after restart; private SDK works", async () => {
    await mf.dispose(); mf = create();
    const result = await ok("POST", "/v1/evidence/search", { user_id: "alice", query: "ZephyrToken" });
    assert.equal(result.data.length, 1);
    const client = new SixteenMemory({ baseUrl: "https://fixture.local", apiKey: key, fetch: (url, init) => mf.dispatchFetch(url, { ...init, headers: { ...init.headers, "CF-Connecting-IP": crypto.randomUUID() } }) });
    assert.equal((await client.context({ user_id: "alice", query: "ZephyrToken" })).memories.length, 1);
    assert.equal((await client.searchEvidence({ user_id: "alice", query: "ZephyrToken" })).data.length, 1);
    assert.equal((await client.reviewMemories({ user_id: "alice" })).changed, 0);
    assert.equal(outbound, 0);
  });
  console.log(JSON.stringify({ status: "passed", groups: groups.length, tests: groups, provider_calls: outbound }, null, 2));
} finally { await mf.dispose(); await rm(directory, { recursive: true, force: true }); }
