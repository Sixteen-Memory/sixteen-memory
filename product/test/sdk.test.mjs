import test from "node:test";
import assert from "node:assert/strict";
import { MemoryApiError, SixteenMemory } from "../sdk/index.mjs";

test("SDK preserves authorization, versions, source and scope without retries", async () => {
  const requests = [];
  const client = new SixteenMemory({ baseUrl: "https://memory.example/", apiKey: "test-key", fetch: async (url, init) => {
    requests.push({ url, ...init }); return Response.json({ id: "record" });
  } });
  await client.add({ request_id: "r1", user_id: "u1", content: "text" });
  await client.update("memory/id", { expected_version: 2, reason: "confirmed" });
  await client.delete("memory/id", 3);
  await client.exportPage({ cursor: "after", user_id: "u1" });
  assert.equal(requests[0].url, "https://memory.example/v1/memories");
  assert.equal(requests[0].headers.Authorization, "Bearer test-key");
  assert.equal(requests[0].redirect, "manual");
  assert.equal(JSON.parse(requests[0].body).user_id, "u1");
  assert.equal(requests[1].url, "https://memory.example/v1/memories/memory%2Fid");
  assert.equal(JSON.parse(requests[1].body).expected_version, 2);
  assert.equal(requests[2].method, "DELETE");
  assert.equal(JSON.parse(requests[2].body).expected_version, 3);
  assert.ok(requests[3].url.includes("cursor=after"));
});

test("SDK exposes server errors once, without duplicating mutations", async () => {
  let count = 0;
  const client = new SixteenMemory({ baseUrl: "", apiKey: undefined, fetch: async () => {
    count++; return Response.json({ error: { code: "version_conflict", message: "changed" } }, { status: 409 });
  } });
  await assert.rejects(client.update("id", {}), error => error instanceof MemoryApiError && error.status === 409 && error.code === "version_conflict");
  assert.equal(count, 1);
});

test("default browser fetch retains its global receiver", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = function () {
    assert.equal(this, globalThis);
    return Promise.resolve(Response.json({ success: true }));
  };
  try {
    const client = new SixteenMemory({ baseUrl: "", apiKey: undefined });
    assert.equal((await client.get("record")).success, true);
  } finally { globalThis.fetch = original; }
});
test("list/export encode nested filters as JSON, not object stringification", async () => {
  const urls=[];
  const client=new SixteenMemory({baseUrl:"https://test.invalid",fetch:async url=>{urls.push(url);return Response.json({data:[]});}});
  const filter={AND:[{field:"category",op:"eq",value:"support"}]};
  await client.list({user_id:"u",filter});
  await client.exportPage({user_id:"u",filter});
  for(const u of urls) assert.deepEqual(JSON.parse(new URL(u).searchParams.get("filter")),filter);
});
test("development context, evidence and review keep scope and cancellation in shared transport", async () => {
  const requests = [];
  const client = new SixteenMemory({ baseUrl: "https://test.invalid", fetch: async (url, init) => {
    requests.push({ url, init }); return Response.json({});
  } });
  const signal = new AbortController().signal;
  await client.context({ user_id: "alice", query: "policy", max_chars: 900 }, { signal });
  await client.searchEvidence({ user_id: "alice", query: "source" });
  await client.reviewMemories({ user_id: "alice" });
  assert.deepEqual(requests.map(r => new URL(r.url).pathname), ["/v1/context", "/v1/evidence/search", "/v1/memory-review"]);
  for (const { init } of requests) { assert.equal(JSON.parse(init.body).user_id, "alice"); assert.equal(init.method, "POST"); }
  assert.ok(requests[0].init.signal instanceof AbortSignal);
});
