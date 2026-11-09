import test from "node:test";
import assert from "node:assert/strict";
import { SixteenMemory, MemoryApiError, MemoryTransportError } from "../sdk/client.mjs";

const baseUrl = "https://memory.example";
const apiKey = "synthetic-hardening-key-0123456789";
const code = expected => error => error instanceof MemoryTransportError && error.code === expected;

test("base SDK rejects unsafe URL/key configuration without starting a request", () => {
  for (const url of ["http://outside.invalid", "https://user:pass@host", "https://host?key=secret", "https://host#secret", "file:///tmp/test", ""]) {
    assert.throws(() => new SixteenMemory({ baseUrl: url, apiKey }), code("invalid_config"));
  }
  for (const key of ["short", "x".repeat(300), "key\nHeader:value", null]) {
    assert.throws(() => new SixteenMemory({ baseUrl, apiKey: key }), code("invalid_config"));
  }
  for (const url of ["http://127.0.0.1:1234", "http://localhost:1234", "http://[::1]:1234"]) {
    assert.equal(new SixteenMemory({ baseUrl: url, apiKey }).baseUrl, url);
  }
});

test("SDK errors retain bounded codes, never raw messages or invalid code text", async () => {
  for (const serviceCode of ["version_conflict", "PRIVATE_SENTINEL", "x".repeat(101), { private: true }]) {
    let calls = 0;
    const c = new SixteenMemory({ baseUrl, apiKey, fetch: async () => {
      calls++; return Response.json({ error: { code: serviceCode, message: "PRIVATE_SENTINEL" } }, { status: 409 });
    } });
    await assert.rejects(c.get("id"), error => error instanceof MemoryApiError && error.status === 409 &&
      error.code === (serviceCode === "version_conflict" ? serviceCode : "request_failed") &&
      !String(error).includes("PRIVATE_SENTINEL"));
    assert.equal(calls, 1);
  }
});

test("automatic pagination preserves filters, detects loops and stops on cancellation", async () => {
  const queries = [];
  const c = new SixteenMemory({ baseUrl, apiKey, fetch: async url => {
    const params = new URL(url).searchParams; queries.push(params);
    return Response.json({ data: [{ id: params.get("cursor") || "first" }], next_cursor: params.get("cursor") ? null : "second" });
  } });
  const filter = { field: "category", op: "eq", value: "support" };
  assert.deepEqual((await c.listAll({ user_id: "alice", filter })).map(x => x.id), ["first", "second"]);
  assert.ok(queries.every(query => query.get("user_id") === "alice" && JSON.parse(query.get("filter")).value === "support"));
  const loop = new SixteenMemory({ baseUrl, apiKey, fetch: async () => Response.json({ data: [], next_cursor: "loop" }) });
  await assert.rejects(loop.exportAll({ user_id: "alice" }), code("invalid_pagination"));
  const invalid = new SixteenMemory({ baseUrl, apiKey, fetch: async () => Response.json({ data: [], next_cursor: 3 }) });
  await assert.rejects(invalid.listAll(), code("invalid_pagination"));
  const controller = new AbortController(), iterator = c.listPages({}, { signal: controller.signal });
  await iterator.next(); const before = queries.length; controller.abort();
  await assert.rejects(iterator.next(), code("aborted")); assert.equal(queries.length, before);
});

test("all new methods propagate pre-abort; invalid JSON fails before network", async () => {
  const controller = new AbortController(); controller.abort();
  let requests = 0;
  const c = new SixteenMemory({ baseUrl, apiKey, fetch: async () => { requests++; return Response.json({}); } });
  const call = { signal: controller.signal };
  const invocations = [
    () => c.createConversation({}, call), () => c.appendConversation("id", {}, call),
    () => c.conversation("id", "", call), () => c.conversations("user", "", call),
    () => c.searchConversations({}, call), () => c.deleteConversation("id", 1, call),
    () => c.organize({}, call), () => c.knowledgeRuns("user", call), () => c.knowledgeRun("id", call),
    () => c.resolveKnowledge("id", false, call), () => c.wiki("user", call), () => c.wikiPage("user", "slug", call),
    () => c.graph("user", call), () => c.context({}, call), () => c.searchEvidence({}, call),
    () => c.reviewMemories({}, call), () => c.ingest({}, call), () => c.ingestion("id", call),
    () => c.ingestions("user", call), () => c.resolveIngestion("id", false, call),
    () => c.evidence("id", call), () => c.reindex("user", "", call),
  ];
  for (const invoke of invocations) await assert.rejects(invoke(), code("aborted"));
  const cyclic = {}; cyclic.self = cyclic;
  await assert.rejects(c.add(cyclic), code("invalid_input"));
  await assert.rejects(c.request("//external.invalid"), code("invalid_input"));
  assert.equal(requests, 0);
});
