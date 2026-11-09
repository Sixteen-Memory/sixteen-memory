/** Server-side example. Requires an explicitly configured, user-scoped test key. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SixteenMemory } from "@sixteen-memory/sdk";

const { SIXTEEN_BASE_URL: baseUrl, SIXTEEN_API_KEY: apiKey, SIXTEEN_USER_ID: user_id } = process.env;
if (!baseUrl || !apiKey || !user_id) throw Error("Set SIXTEEN_BASE_URL, SIXTEEN_API_KEY and SIXTEEN_USER_ID.");
const client = new SixteenMemory({ baseUrl, apiKey });
const health = await client.health();
assert.equal(health.model_configured, false, "This no-model example requires disabled providers.");
assert.equal(health.retrieval, "lexical");
const token = "Lifecycle" + randomUUID().replaceAll("-", "");
const saved = await client.add({
  user_id, request_id: randomUUID(), content: token,
  source: { type: "manual", ref: "synthetic-lifecycle", text: token, observed_at: new Date().toISOString() },
  expires_at: new Date(Date.now() + 3600000).toISOString(),
});
try {
  assert.ok((await client.search({ user_id, query: token })).data.some(row => row.id === saved.id));
} finally {
  await client.delete(saved.id, saved.version);
}
assert.equal((await client.search({ user_id, query: token })).data.length, 0);
console.log("PASS: store -> retrieve -> delete -> no stale result");
