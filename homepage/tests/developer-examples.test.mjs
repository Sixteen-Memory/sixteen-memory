import test from "node:test";
import assert from "node:assert/strict";
import { snippets, endpoints } from "../src/developer-examples.mjs";
import { SixteenMemory } from "../public/downloads/sixteen-memory-sdk.mjs";
import { SixteenMemory as StableClient } from "../public/downloads/sixteen-memory-client.mjs";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { sdkPackageUrl } from "../src/content.mjs";

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
  class ExampleClient extends StableClient {
    constructor(options) {
      super({ ...options, fetch: async (url, init) => {
        calls.push({ url, ...init });
        return Response.json({ data: [], id: "synthetic-id", version: 1 });
      } });
    }
  }
  const execute = Object.getPrototypeOf(async function () {}).constructor;
  const body = snippets.js.replace(/^import[^\n]*\n/, "");
  await new execute("SixteenMemory", "process", body)(ExampleClient, { env: { SIXTEEN_API_KEY: "synthetic-test-key-0123456789012345" } });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].url, "https://console.sixteenmemory.com/v1/memories");
  assert.equal(calls[1].url, "https://console.sixteenmemory.com/v1/search");
  assert.equal(calls[0].headers.Authorization, "Bearer synthetic-test-key-0123456789012345");
  checkRecord(JSON.parse(calls[0].body));
  assert.deepEqual(JSON.parse(calls[1].body), { user_id: "customer-42", query: "refund open", limit: 10 });
});

test("legacy and typed downloads both provide v0.3 methods", async () => {
  const calls = [];
  const options = { baseUrl: "https://memory.example", fetch: async (url, init) => {
    calls.push({ url, ...init }); return Response.json({ data: [], id: "synthetic-id", version: 1 });
  } };
  const legacy = new SixteenMemory(options);
  await legacy.ingest({ user_id: "synthetic-user" });
  await legacy.search({ query: "synthetic" });
  assert.equal(calls[0].url, "https://memory.example/v1/ingestions");
  assert.equal(calls[1].url, "https://memory.example/v1/search");
  assert.equal(typeof new StableClient(options).ingest, "function");
  const manifest = JSON.parse(readFileSync(new URL("../public/downloads/manifest.json", import.meta.url)));
  const { version } = JSON.parse(readFileSync(new URL("../../product/sdk/package.json", import.meta.url)));
  assert.equal(manifest.sdk_version, version);
  assert.equal(sdkPackageUrl, "/downloads/" + manifest.package);
  for (const [file, hash] of Object.entries(manifest.sha256)) {
    assert.equal(createHash("sha256").update(readFileSync(new URL("../public/downloads/" + file, import.meta.url))).digest("hex"), hash);
  }
  const spec = JSON.parse(readFileSync(new URL("../public/downloads/openapi.json", import.meta.url)));
  assert.equal(spec.info.version, "0.1.0");
  assert.ok(!Object.keys(spec.paths).some(path => /ingestion|reindex|evidence/.test(path)));
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
