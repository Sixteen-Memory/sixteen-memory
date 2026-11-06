import test from "node:test";
import assert from "node:assert/strict";
import { snippets, endpoints } from "../src/developer-examples.mjs";
import { SixteenMemory } from "../public/downloads/sixteen-memory-sdk.mjs";

const checkRecord = input => {
  assert.equal(input.user_id, "customer-42");
  assert.ok(input.request_id);
  assert.ok(input.content.includes("refund"));
  assert.equal(input.source.type, "business");
  assert.ok(input.source.ref && input.source.text);
  assert.ok(Number.isFinite(Date.parse(input.source.observed_at)));
  assert.equal(input.expires_at, null);
};

test("displayed JavaScript runs against the downloadable SDK without calling the network", async () => {
  const calls = [];
  class ExampleClient extends SixteenMemory {
    constructor(options) {
      super({ ...options, fetch: async (url, init) => {
        calls.push({ url, ...init });
        return Response.json({ data: [] });
      } });
    }
  }
  const execute = Object.getPrototypeOf(async function () {}).constructor;
  const body = snippets.js.replace(/^import[^\n]*\n/, "");
  await new execute("SixteenMemory", "process", body)(ExampleClient, { env: { SIXTEEN_API_KEY: "synthetic-test-key" } });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://console.sixteenmemory.com/v1/memories");
  assert.equal(calls[1].url, "https://console.sixteenmemory.com/v1/search");
  assert.equal(calls[0].headers.Authorization, "Bearer synthetic-test-key");
  checkRecord(JSON.parse(calls[0].body));
  assert.deepEqual(JSON.parse(calls[1].body), { user_id: "customer-42", query: "refund open", limit: 10 });
});

test("displayed REST bodies match required online fields and documented routes", () => {
  const bodies = [...snippets.rest.matchAll(/-d '([^']+)'/g)].map(match => JSON.parse(match[1]));
  assert.equal(bodies.length, 2);
  checkRecord(bodies[0]);
  assert.equal(bodies[1].user_id, "customer-42");
  assert.equal(bodies[1].query, "refund open");
  assert.equal(endpoints.length, 9);
  assert.ok(endpoints.some(([method, path]) => method === "DELETE" && path === "/v1/memories/:id"));
  assert.ok(endpoints.every(([, path]) => path.startsWith("/v1/") && !/ingest|reindex|mcp/.test(path)));
});
