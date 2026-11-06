import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { SixteenMemory } from "../sdk/index.mjs";

const directory = await mkdtemp(join(tmpdir(), "sixteen-product-"));
const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url)));
const runtimeDate = config.compatibility_date;
const owner = "synthetic-owner-key-not-for-production-123456";
const otherOwner = "synthetic-other-owner-key-not-for-production";
const origin = "https://console.example";
const tests = [];
const run = async (name, fn) => { await fn(); tests.push(name); console.log("PASS", name); };
const bindings = { ...config.vars, ADMIN_KEY: owner };
const fakeCalls = { chat: 0, embeddings: 0, messages: [] };
const fakeControl = { malformed: false, ungrounded: false, city: "柏林", cityQuote: "我住在柏林", embeddingError: false, delay: null, forcedTarget: null };
const fakeOutbound = async request => {
  const url = new URL(request.url);
  const body = await request.json();
  if (url.pathname.endsWith("/embeddings")) {
    fakeCalls.embeddings++; if (fakeControl.embeddingError) return new Response("outage", { status: 503 }); fakeCalls.messages.push({ type: "embedding", input: body.input, dimensions: body.dimensions });
    assert.equal(body.dimensions, 4);
    const vector = text => {
      const s = String(text).toLowerCase();
      const values = [s.includes("berlin") || s.includes("柏林") ? 1 : 0, s.includes("bike") || s.includes("自行车") ? 1 : 0, s.includes("chinese") || s.includes("中文") ? 1 : 0, 0.1];
      return values.every(x => x === 0 || x === 0.1) ? [0.1, 0.2, 0.3, 0.4] : values;
    };
    return Response.json({ data: body.input.map((value, index) => ({ index, embedding: vector(value) })), usage: { prompt_tokens: 3, total_tokens: 3 } });
  }
  if (url.pathname.endsWith("/chat/completions")) {
    fakeCalls.chat++; if (fakeControl.delay) { const wait = fakeControl.delay; fakeControl.delay = null; await wait; } if (fakeControl.malformed) return Response.json({ choices: [{ finish_reason: "stop", message: { content: "not-json" } }] }); const payload = JSON.parse(body.messages[1].content); fakeCalls.messages.push({ type: "chat", payload });
    const content = payload.messages ? {
      facts: [
        { content: "用户住在" + fakeControl.city, fact_key: "user.home_city", confidence: 0.99, evidence: [{ message_id: fakeControl.ungrounded ? "m2" : "m1", quote: fakeControl.ungrounded ? "我已经为你更改了地址。" : fakeControl.cityQuote }] },
        { content: "用户通常骑自行车通勤", fact_key: "user.commute_mode", confidence: 0.99, evidence: [{ message_id: "m1", quote: "通常骑自行车通勤" }] },
      ],
    } : {
      decisions: payload.facts.map((fact, index) => {
        const same = payload.existing.find(row => row.fact_key === fact.fact_key);
        if (fakeControl.forcedTarget) return { fact_index: index, action: "supersede", target_id: fakeControl.forcedTarget, confidence: 1, supported: true, reason: "malicious target" };
        const exact = payload.existing.find(row => row.content === fact.content);
        return { fact_index: index, action: exact ? "merge" : same ? "supersede" : "add", target_id: (exact ?? same)?.id ?? null, supported: true, confidence: 0.99, reason: exact ? "同一事实" : same ? "更新同一事实槽位" : "新事实" };
      }),
    };
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }], usage: { prompt_tokens: 20, completion_tokens: 10 } });
  }
  return new Response("unexpected provider URL", { status: 500 });
};
function worker(name, projectId = "sixteen", root = owner, intelligence = false) {
  return {
    name, modules: true, scriptPath: fileURLToPath(new URL("../dist-worker/index.js", import.meta.url)),
    compatibilityDate: runtimeDate, compatibilityFlags: config.compatibility_flags,
    bindings: {
      ...bindings, PROJECT_ID: projectId, ADMIN_KEY: root,
      ...(intelligence ? { EXTRACTION_ENABLED: "true", EXTRACTION_BASE_URL: "https://provider.test/v1", EXTRACTION_MODEL: "fixture-extract", EXTRACTION_API_KEY: "fixture-secret", EMBEDDINGS_ENABLED: "true", EMBEDDING_BASE_URL: "https://provider.test/v1", EMBEDDING_MODEL: "fixture-embed", EMBEDDING_API_KEY: "fixture-secret", EMBEDDING_PROVIDER: "openai-compatible", EMBEDDING_API_STYLE: "openai-compatible", EMBEDDING_DIMENSIONS: "4" } : {}),
    },
    serviceBindings: { ASSETS: () => new Response("assets") },
    durableObjects: { PROJECTS: { className: "MemoryProject", useSQLite: true } },
    ratelimits: Object.fromEntries(config.ratelimits.map(({ name, ...value }) => [name, value])),
    outboundService: fakeOutbound,
  };
}
function create(root = owner) {
  return new Miniflare({
    ...convertV4MiniflareOptions({
      workers: [
        { name: "console", modules: true, scriptPath: fileURLToPath(new URL("../pages/_worker.js", import.meta.url)),
          compatibilityDate: runtimeDate, serviceBindings: { MEMORY_SERVICE: "product", ASSETS: () => new Response("console assets") } },
        worker("product", "sixteen", root),
        worker("other-product", "other", otherOwner),
        worker("smart-product", "smart", owner, true),
      ],
    }),
    resourcePersistencePath: directory, unsafeInspectDurableObjects: true,
  });
}
let mf = create();
let backend = await mf.getWorker("product");
let otherBackend = await mf.getWorker("other-product");
let smartBackend = await mf.getWorker("smart-product");
async function request(method, path, body, key = owner, cookie = "", originHeader, ip = "test-" + crypto.randomUUID(), target = "console") {
  const response = target === "console" ? await mf.dispatchFetch(origin + path, {
    method, headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(originHeader ? { Origin: originHeader } : {}),
      "CF-Connecting-IP": ip,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) : await mf.getWorker(target).then(worker => worker.fetch(origin + path, {
    method, headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(originHeader ? { Origin: originHeader } : {}),
      "CF-Connecting-IP": ip,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  return { status: response.status, body: await response.json(), headers: response.headers };
}
const draft = (request_id, user_id = "customer-1", content = "设备重启已完成，等待网络排查。") => ({
  request_id, user_id, content,
  source: { type: "business", ref: "synthetic-ticket", text: content, observed_at: "2026-11-04T09:00:00Z" },
  expires_at: null,
});
let entry;
let readKey;
let writeKey;
let loginCookie;
try {
  await run("Pages service binding and public health", async () => {
    const value = await request("GET", "/health", undefined, "");
    assert.equal(value.status, 200); assert.equal(value.body.version, "0.2.1");
    assert.equal(value.body.model_configured, false);
    assert.equal(value.headers.get("Cache-Control"), "no-store");
    assert.equal((await mf.dispatchFetch(origin + "/")).status, 200);
  });
  await run("missing and malformed credentials rejected", async () => {
    assert.equal((await request("GET", "/v1/memories", undefined, "")).status, 401);
    assert.equal((await request("GET", "/v1/memories", undefined, "wrong")).status, 401);
  });
  await run("cross-origin login and writes rejected", async () => {
    assert.equal((await request("POST", "/v1/session", { api_key: owner }, "", "", "https://attacker.example")).status, 403);
    assert.equal((await request("POST", "/v1/memories", draft("cross"), owner, "", "https://attacker.example")).status, 403);
  });
  await run("login rate limit rejects repeated attempts with retry guidance", async () => {
    let last;
    for (let i = 0; i < 12; i++) last = await request("POST", "/v1/session", { api_key: "synthetic-wrong" }, "", "", undefined, "synthetic-limited-client");
    assert.equal(last.status, 429);
    assert.equal(last.headers.get("Retry-After"), "60");
  });
  await run("durable add, exact retry and conflicting retry", async () => {
    const value = await request("POST", "/v1/memories", draft("write-1"));
    assert.equal(value.status, 200); entry = value.body;
    assert.equal(entry.version, 1);
    assert.equal((await request("POST", "/v1/memories", draft("write-1"))).body.id, entry.id);
    assert.equal((await request("POST", "/v1/memories", draft("write-1", "customer-1", "不同内容"))).status, 409);
    assert.equal((await request("GET", "/v1/memories")).body.data.length, 1);
  });
  await run("Chinese FTS retrieval and hostile query remain bounded", async () => {
    assert.equal((await request("POST", "/v1/search", { query: "网络", user_id: "customer-1" })).body.data[0].id, entry.id);
    assert.equal((await request("POST", "/v1/search", { query: '" OR 1=1; --' })).status, 200);
    assert.equal((await request("POST", "/v1/search", { query: "网络", limit: 100000 })).status, 422);
  });
  await run("keys are scoped, secret only returned once", async () => {
    readKey = (await request("POST", "/v1/keys", { name: "Read", user_id: "customer-1", role: "read" })).body;
    writeKey = (await request("POST", "/v1/keys", { name: "Write", user_id: "customer-1", role: "write" })).body;
    assert.ok(readKey.key.startsWith("sm_"));
    const listed = await request("GET", "/v1/keys");
    assert.ok(!JSON.stringify(listed.body).includes(readKey.key));
    assert.ok(!JSON.stringify(listed.body).includes("digest"));
    assert.equal((await request("GET", "/v1/keys", undefined, readKey.key)).status, 403);
    assert.equal((await request("POST", "/v1/memories", draft("read-write"), readKey.key)).status, 403);
    assert.equal((await request("POST", "/v1/memories", draft("wrong-scope", "customer-2"), writeKey.key)).status, 404);
    const other = await request("POST", "/v1/memories", draft("second", "customer-2", "private OTHER_SCOPE_MARKER"));
    for (const suffix of ["", "/history"]) assert.equal((await request("GET", `/v1/memories/${other.body.id}${suffix}`, undefined, readKey.key)).status, 404);
    assert.equal((await request("DELETE", `/v1/memories/${other.body.id}`, { expected_version: 1 }, writeKey.key)).status, 404);
    assert.equal((await request("GET", "/v1/memories", undefined, readKey.key)).body.data.length, 1);
    assert.equal((await request("GET", "/v1/export?user_id=customer-2", undefined, readKey.key)).status, 404);
  });
  await run("cookie session login, HttpOnly and server logout", async () => {
    const value = await request("POST", "/v1/session", { api_key: owner }, "");
    assert.equal(value.status, 200); assert.ok(value.headers.get("Set-Cookie").includes("HttpOnly"));
    assert.ok(value.headers.get("Set-Cookie").includes("Secure"));
    loginCookie = value.headers.get("Set-Cookie").split(";")[0];
    assert.equal((await request("GET", "/v1/me", undefined, "", loginCookie)).body.role, "admin");
    const userSession = await request("POST", "/v1/session", { api_key: readKey.key }, "");
    const userCookie = userSession.headers.get("Set-Cookie").split(";")[0];
    await request("DELETE", `/v1/keys/${readKey.record.id}`);
    assert.equal((await request("GET", "/v1/me", undefined, "", userCookie)).status, 401);
    assert.equal((await request("GET", "/v1/me", undefined, readKey.key)).status, 401);
  });
  await run("explicit update preserves history and removes old search state", async () => {
    const update = { ...draft("unused", "customer-1", "网络配置恢复，问题已解决。"), expected_version: 1, reason: "业务确认" };
    const value = await request("PATCH", `/v1/memories/${entry.id}`, update, writeKey.key);
    assert.equal(value.status, 200); entry = value.body; assert.equal(entry.version, 2);
    const history = await request("GET", `/v1/memories/${entry.id}/history`, undefined, writeKey.key);
    assert.equal(history.body.length, 2); assert.ok(history.body[1].content.includes("等待"));
    assert.equal((await request("PATCH", `/v1/memories/${entry.id}`, update)).status, 409);
    const rows = (await request("POST", "/v1/search", { query: "网络" }, writeKey.key)).body.data;
    assert.ok(rows.every(row => !row.content.includes("等待")));
  });
  await run("concurrent updates reject stale version", async () => {
    const values = await Promise.all(["a", "b"].map(reason => request("PATCH", `/v1/memories/${entry.id}`, {
      ...draft("unused", "customer-1", `网络恢复 ${reason}`), expected_version: entry.version, reason,
    })));
    assert.deepEqual(values.map(v => v.status).sort(), [200, 409]);
    entry = values.find(v => v.status === 200).body;
  });
  await run("revoke excludes retrieval but preserves authorized history", async () => {
    const value = await request("POST", `/v1/memories/${entry.id}/revoke`, { expected_version: entry.version, reason: "人工复核" });
    assert.equal(value.status, 200); entry = value.body; assert.equal(entry.status, "revoked");
    assert.equal((await request("POST", "/v1/search", { query: "网络" }, writeKey.key)).body.data.length, 0);
    assert.equal((await request("GET", `/v1/memories/${entry.id}/history`, undefined, writeKey.key)).body.length, 4);
  });
  await run("delete clears source, history and FTS; retries cannot resurrect", async () => {
    const value = await request("DELETE", `/v1/memories/${entry.id}`, { expected_version: entry.version });
    assert.equal(value.status, 200);
    assert.equal((await request("GET", `/v1/memories/${entry.id}`)).status, 404);
    assert.equal((await request("GET", `/v1/memories/${entry.id}/history`)).status, 404);
    assert.equal((await request("POST", "/v1/memories", draft("write-1"))).status, 410);
    const sql = await mf.unsafeGetDurableObjectStorage("product", "MemoryProject", { name: "sixteen" });
    for (const [table, column] of [["memories", "id"], ["history", "memory_id"], ["search_index", "id"]]) {
      assert.equal((await sql.exec(`SELECT COUNT(*) n FROM ${table} WHERE ${column}=?`, entry.id))[0].n, 0);
    }
  });
  await run("expiry physically clears evidence and retains retry tombstone", async () => {
    const value = await request("POST", "/v1/memories", draft("expiry"));
    const sql = await mf.unsafeGetDurableObjectStorage("product", "MemoryProject", { name: "sixteen" });
    await sql.exec("UPDATE memories SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?", value.body.id);
    assert.equal((await request("GET", `/v1/memories/${value.body.id}`)).status, 404);
    assert.equal((await sql.exec("SELECT COUNT(*) n FROM history WHERE memory_id=?", value.body.id))[0].n, 0);
    assert.equal((await request("POST", "/v1/memories", draft("expiry"))).status, 410);
    const expiring = { ...draft("expiry-clock"), expires_at: new Date(Date.now() + 80).toISOString() };
    assert.equal((await request("POST", "/v1/memories", expiring)).status, 200);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal((await request("POST", "/v1/memories", expiring)).status, 410);
  });
  await run("validation, secret rejection and request-size limit", async () => {
    const invalid = await request("POST", "/v1/memories", { ...draft("invalid"), user_id: "../other", marker: "PRIVATE_MARKER" });
    assert.equal(invalid.status, 422); assert.ok(!JSON.stringify(invalid.body).includes("PRIVATE_MARKER"));
    assert.equal((await request("POST", "/v1/memories", draft("secret", "customer-1", "sk-" + "a".repeat(40)))).status, 422);
    assert.equal((await request("POST", "/v1/memories", { value: "a".repeat(70000) })).status, 413);
    const future = draft("past"); future.expires_at = "2020-01-01T00:00:00Z";
    assert.equal((await request("POST", "/v1/memories", future)).status, 422);
  });
  await run("metadata-only request log, missing model is honest", async () => {
    const log = await request("GET", "/v1/requests");
    assert.ok(!JSON.stringify(log.body).includes("OTHER_SCOPE_MARKER"));
    assert.ok(log.body.some(item => item.status === 409));
    const value = await request("POST", "/v1/answer", { user_id: "customer-1", query: "网络" });
    assert.equal(value.status, 503); assert.equal(value.body.error.code, "model_not_configured");
  });
  await run("intelligence features stay explicit when providers are disabled", async () => {
    assert.equal((await request("POST", "/v1/search", { user_id: "customer-1", query: "网络", mode: "semantic" })).status, 503);
    assert.equal((await request("POST", "/v1/search", { user_id: "customer-1", query: "网络", mode: "semantic", fallback: "lexical" })).body.retrieval, "lexical");
    assert.equal((await request("POST", "/v1/ingestions", { user_id: "customer-1", request_id: "disabled", ref: "session", observed_at: "2026-11-04T09:00:00Z", messages: [{ id: "m1", role: "user", content: "我住在柏林" }] })).status, 503);
  });
  await run("model-assisted extraction, review, evidence and hybrid retrieval", async () => {
    const seed = draft("smart-seed", "smart-user", "用户偏好中文沟通");
    const saved = await request("POST", "/v1/memories", seed, owner, "", "", undefined, "smart-product");
    assert.equal(saved.status, 200, JSON.stringify({body:saved.body, fakeCalls}));
    let page = await request("POST", "/v1/reindex", { user_id: "smart-user" }, owner, "", "", undefined, "smart-product");
    assert.equal(page.status, 200); assert.equal(page.body.indexed, 1);
    const start = fakeCalls.chat;
    const input = { user_id: "smart-user", request_id: "smart-ingest", ref: "synthetic-session", observed_at: "2026-11-04T09:10:00Z", mode: "review",
      messages: [{ id: "m1", role: "user", content: "我住在柏林，通常骑自行车通勤。" }, { id: "m2", role: "assistant", content: "我已经为你更改了地址。" }] };
    let result = await request("POST", "/v1/ingestions", input, owner, "", "", undefined, "smart-product");
    assert.equal(result.status, 200); assert.equal(result.body.state, "review"); assert.equal(result.body.proposal.decisions.length, 2);
    assert.equal(fakeCalls.chat - start, 2);
    result = await request("POST", `/v1/ingestions/${result.body.id}/resolve`, { approve: true }, owner, "", "", undefined, "smart-product");
    assert.equal(result.body.state, "applied"); assert.equal(result.body.results.length, 2);
    const repeated = await request("POST", "/v1/ingestions", input, owner, "", "", undefined, "smart-product");
    assert.equal(repeated.body.state, "applied"); assert.equal(fakeCalls.chat - start, 2);
    const hybrid = await request("POST", "/v1/search", { user_id: "smart-user", query: "在哪个欧洲城市生活", mode: "hybrid" }, owner, "", "", undefined, "smart-product");
    assert.equal(hybrid.status, 200); assert.equal(hybrid.body.retrieval, "hybrid"); assert.ok(hybrid.body.data.some(row => row.content.includes("柏林")));
    const evidence = await request("GET", `/v1/memories/${hybrid.body.data.find(row => row.content.includes("柏林")).id}/evidence`, undefined, owner, "", "", undefined, "smart-product");
    assert.equal(evidence.status, 200); assert.match(evidence.body.primary.text, /我住在柏林/);
    assert.ok(!JSON.stringify(evidence.body).includes("更改了地址"));
  });
  const smart = (method, path, body, key = owner) => request(method, path, body, key, "", "", undefined, "smart-product");
  const conversation = (id, user = "auto-user", observed = "2026-11-04T09:00:00Z") => ({
    user_id: user, request_id: id, ref: "synthetic:" + id, mode: "auto", observed_at: observed,
    messages: [{ id: "m1", role: "user", content: `${fakeControl.cityQuote}，通常骑自行车通勤。` }, { id: "m2", role: "assistant", content: "我已经为你更改了地址。" }],
  });
  await run("exact merge and newer-slot supersession preserve original history", async () => {
    let added = await smart("POST", "/v1/ingestions", conversation("auto-first"));
    assert.equal(added.status, 200); assert.equal(added.body.state, "applied");
    let listed = (await smart("GET", "/v1/memories?user_id=auto-user")).body.data;
    const cityId = listed.find(m => m.fact_key === "user.home_city").id;
    const merged = await smart("POST", "/v1/ingestions", conversation("auto-duplicate", "auto-user", "2026-11-04T09:01:00Z"));
    assert.equal(merged.body.state, "applied"); assert.ok(merged.body.results.every(r => r.action === "merge"));
    assert.equal((await smart("GET", "/v1/memories?user_id=auto-user")).body.data.length, 2);
    assert.equal((await smart("GET", `/v1/memories/${cityId}/evidence`)).body.supporting.length, 1);
    fakeControl.city = "巴黎"; fakeControl.cityQuote = "我搬到了巴黎";
    const updated = await smart("POST", "/v1/ingestions", conversation("auto-change", "auto-user", "2026-11-04T09:02:00Z"));
    assert.equal(updated.body.state, "applied");
    const current = (await smart("GET", `/v1/memories/${cityId}`)).body;
    assert.equal(current.content, "用户住在巴黎"); assert.equal(current.version, 2);
    const history = (await smart("GET", `/v1/memories/${cityId}/history`)).body;
    assert.equal(history.length, 2); assert.equal(history[1].content, "用户住在柏林");
    await smart("PATCH", `/v1/memories/${cityId}`, { ...draft("manual", "auto-user", "人工确认：用户住在巴黎"), expected_version: 2, reason: "人工核实" });
    const manual = (await smart("GET", `/v1/memories/${cityId}`)).body;
    assert.equal(manual.origin, "explicit"); assert.equal(manual.fact_key, "user.home_city");
    fakeControl.city = "上海"; fakeControl.cityQuote = "我又搬到上海";
    const protectedProposal = await smart("POST", "/v1/ingestions", conversation("manual-protected", "auto-user", "2026-11-04T09:03:00Z"));
    assert.equal(protectedProposal.body.state, "review");
    await smart("POST", `/v1/ingestions/${protectedProposal.body.id}/resolve`, { approve: false });
    fakeControl.city = "柏林"; fakeControl.cityQuote = "我住在柏林";
  });
  await run("untrusted model output fails closed and never retries implicitly", async () => {
    fakeControl.ungrounded = true;
    const bad = await smart("POST", "/v1/ingestions", conversation("bad-evidence", "bad-user"));
    assert.equal(bad.status, 502); assert.equal(bad.body.error.code, "ungrounded_fact"); fakeControl.ungrounded = false;
    const before = fakeCalls.chat;
    assert.equal((await smart("POST", "/v1/ingestions", conversation("bad-evidence", "bad-user"))).status, 409);
    assert.equal(fakeCalls.chat, before);
    assert.equal((await smart("GET", "/v1/memories?user_id=bad-user")).body.data.length, 0);
    fakeControl.malformed = true;
    assert.equal((await smart("POST", "/v1/ingestions", conversation("bad-json", "bad-user"))).status, 502);
    fakeControl.malformed = false;
    fakeControl.forcedTarget = "cross-scope-id";
    assert.equal((await smart("POST", "/v1/ingestions", conversation("bad-target", "bad-user"))).status, 502);
    fakeControl.forcedTarget = null;
  });
  await run("scope authorization happens before provider calls", async () => {
    const reader = (await smart("POST", "/v1/keys", { name: "reader", role: "read", user_id: "auto-user" })).body.key;
    const before = fakeCalls.chat + fakeCalls.embeddings;
    assert.equal((await smart("POST", "/v1/ingestions", conversation("read-only"), reader)).status, 403);
    assert.equal((await smart("POST", "/v1/reindex", { user_id: "auto-user" }, reader)).status, 403);
    assert.equal((await smart("POST", "/v1/search", { user_id: "bad-user", query: "private", mode: "hybrid" }, reader)).status, 404);
    assert.equal(fakeCalls.chat + fakeCalls.embeddings, before);
  });
  await run("stale review and concurrent extraction cannot overwrite newer writes", async () => {
    const input = { ...conversation("review-stale", "review-user"), mode: "review" };
    const proposal = await smart("POST", "/v1/ingestions", input);
    assert.equal(proposal.body.state, "review");
    await smart("POST", "/v1/memories", draft("new-write", "review-user", "新的人工信息"));
    assert.equal((await smart("POST", `/v1/ingestions/${proposal.body.id}/resolve`, { approve: true })).status, 409);
    assert.equal((await smart("POST", `/v1/ingestions/${proposal.body.id}/resolve`, { approve: false })).body.state, "rejected");
    let release;
    fakeControl.delay = new Promise(resolve => { release = resolve; });
    const calls = fakeCalls.chat;
    const pending = smart("POST", "/v1/ingestions", conversation("concurrent", "concurrent-user"));
    for (let i = 0; i < 50 && fakeCalls.chat === calls; i++) await new Promise(r => setTimeout(r, 10));
    await smart("POST", "/v1/memories", draft("interleaved", "concurrent-user", "新的人工信息"));
    release();
    assert.equal((await pending).status, 409);
    assert.equal((await smart("GET", "/v1/memories?user_id=concurrent-user")).body.data.length, 1);
  });
  await run("vector failures do not commit writes; deletion clears derived evidence and vectors", async () => {
    const before = (await smart("GET", "/v1/memories?user_id=auto-user")).body.data.length;
    fakeControl.embeddingError = true;
    assert.equal((await smart("POST", "/v1/memories", draft("failed-embedding", "auto-user"))).status, 502);
    const fallback = await smart("POST", "/v1/search", { user_id: "auto-user", query: "巴黎", mode: "hybrid", fallback: "lexical" });
    assert.equal(fallback.body.degraded, true); assert.equal(fallback.body.retrieval, "lexical");
    fakeControl.embeddingError = false;
    assert.equal((await smart("GET", "/v1/memories?user_id=auto-user")).body.data.length, before);
    const rows = (await smart("GET", "/v1/memories?user_id=auto-user")).body.data;
    const sql = await mf.unsafeGetDurableObjectStorage("smart-product", "MemoryProject", { name: "smart" });
    for (const row of rows) {
      assert.equal((await smart("DELETE", `/v1/memories/${row.id}`, { expected_version: row.version })).status, 200);
      for (const [table, field] of [["vectors", "memory_id"], ["history", "memory_id"], ["search_index", "id"], ["memory_evidence", "memory_id"]]) assert.equal((await sql.exec(`SELECT count(*) n FROM ${table} WHERE ${field}=?`, row.id))[0].n, 0);
    }
    assert.equal((await smart("POST", "/v1/ingestions", conversation("auto-first"))).status, 410);
  });
  await run("index coverage, model revisions and raw-client vector injection are explicit", async () => {
    const before = fakeCalls.embeddings;
    const input = { ...draft("injected-vector", "coverage-user", "必须由供应商生成向量"), _vector: { model: "attacker", values: [1, 0] } };
    const added = await smart("POST", "/v1/memories", input);
    assert.equal(added.status, 200); assert.equal(fakeCalls.embeddings, before + 1);
    const sql = await mf.unsafeGetDurableObjectStorage("smart-product", "MemoryProject", { name: "smart" });
    assert.notEqual((await sql.exec("SELECT model FROM vectors WHERE memory_id=?", added.body.id))[0].model, "attacker");
    await sql.exec("UPDATE vectors SET model='stale-revision' WHERE memory_id=?", added.body.id);
    const calls = fakeCalls.embeddings;
    assert.equal((await smart("POST", "/v1/search", { user_id: "coverage-user", query: "向量", mode: "semantic" })).body.error.code, "index_incomplete");
    assert.equal(fakeCalls.embeddings, calls);
    assert.equal((await smart("POST", "/v1/reindex", { user_id: "coverage-user" })).body.indexed, 1);
    assert.equal((await smart("POST", "/v1/search", { user_id: "coverage-user", query: "向量", mode: "semantic" })).status, 200);
  });
  await run("expired review clears candidate text and expired memory clears vectors", async () => {
    const proposal = await smart("POST", "/v1/ingestions", { ...conversation("expired-review", "expire-user"), mode: "review" });
    const sql = await mf.unsafeGetDurableObjectStorage("smart-product", "MemoryProject", { name: "smart" });
    await sql.exec("UPDATE ingest_jobs SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?", proposal.body.id);
    const status = await smart("GET", `/v1/ingestions/${proposal.body.id}`);
    assert.equal(status.body.state, "expired"); assert.equal(status.body.proposal, null);
    assert.equal((await smart("POST", "/v1/ingestions", { ...conversation("expired-review", "expire-user"), mode: "review" })).status, 410);
    const record = await smart("POST", "/v1/memories", draft("exp-vector", "expire-user"));
    await sql.exec("UPDATE memories SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?", record.body.id);
    assert.equal((await smart("GET", `/v1/memories/${record.body.id}`)).status, 404);
    assert.equal((await sql.exec("SELECT count(*) n FROM vectors WHERE memory_id=?", record.body.id))[0].n, 0);
  });
  await run("project-wide intelligence budget is enforced before outbound calls", async () => {
    const sql = await mf.unsafeGetDurableObjectStorage("smart-product", "MemoryProject", { name: "smart" });
    await sql.exec("UPDATE model_budget SET reserved=200");
    const before = fakeCalls.chat + fakeCalls.embeddings;
    assert.equal((await smart("POST", "/v1/memories", draft("budget-deny", "smart-user"))).status, 429);
    assert.equal(fakeCalls.chat + fakeCalls.embeddings, before);
  });
  await run("pagination and export cover every record without leaking scopes", async () => {
    const ids = new Set();
    for (let i = 0; i < 52; i++) {
      const value = await request("POST", "/v1/memories", draft(`page-${i}`, "paging-user", `分页合成记录 ${i}`));
      assert.equal(value.status, 200); ids.add(value.body.id);
    }
    let cursor = "";
    const exported = [];
    do {
      const value = await request("GET", `/v1/export?user_id=paging-user&cursor=${cursor}`);
      assert.equal(value.status, 200);
      exported.push(...value.body.data);
      cursor = value.body.next_cursor ?? "";
    } while (cursor);
    assert.equal(exported.length, 52);
    assert.deepEqual(new Set(exported.map(row => row.id)), ids);
    assert.ok(exported.every(row => row.user_id === "paging-user"));
    assert.equal((await request("GET", "/v1/export?user_id=paging-user", undefined, writeKey.key)).status, 404);
    for (const row of exported) await request("DELETE", `/v1/memories/${row.id}`, { expected_version: row.version });
  });
  await run("different project deployment cannot read another project's key or records", async () => {
    const response = await otherBackend.fetch(origin + "/v1/memories", { headers: { Authorization: `Bearer ${owner}` } });
    assert.equal(response.status, 401);
    const empty = await otherBackend.fetch(origin + "/v1/memories", { headers: { Authorization: `Bearer ${otherOwner}` } });
    assert.equal((await empty.json()).data.length, 0);
  });
  await run("SDK lifecycle works against actual Worker runtime", async () => {
    const client = new SixteenMemory({ baseUrl: origin, apiKey: writeKey.key, fetch: (url, init) => mf.dispatchFetch(url, init) });
    let value = await client.add(draft("sdk", "customer-1", "SDK service continuity"));
    assert.equal((await client.search({ query: "continuity" })).data[0].id, value.id);
    value = await client.update(value.id, { ...draft("unused", "customer-1", "SDK resolved"), expected_version: 1, reason: "confirmed" });
    assert.equal((await client.history(value.id)).length, 2);
    await client.delete(value.id, value.version);
  });
  await run("restart persistence and root-key rotation invalidate old admin sessions", async () => {
    const before = (await request("GET", "/v1/memories")).body.data.map(row => row.id);
    await mf.dispose(); mf = create(); backend = await mf.getWorker("product");
    assert.deepEqual((await request("GET", "/v1/memories")).body.data.map(row => row.id), before);
    assert.equal((await request("GET", "/v1/me", undefined, "", loginCookie)).status, 200);
    await mf.dispose(); mf = create(otherOwner);
    assert.equal((await request("GET", "/v1/me", undefined, "", loginCookie)).status, 401);
    assert.equal((await request("GET", "/v1/me", undefined, owner)).status, 401);
    assert.equal((await request("GET", "/v1/me", undefined, otherOwner)).status, 200);
  });
  console.log(JSON.stringify({ status: "passed", groups: tests.length, cloud_requests: 0, real_model_calls: 0, fake_provider_calls: { chat: fakeCalls.chat, embeddings: fakeCalls.embeddings } }, null, 2));
} finally {
  await mf.dispose();
  await rm(directory, { recursive: true, force: true });
}
