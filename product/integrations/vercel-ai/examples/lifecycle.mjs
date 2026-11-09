/** Explicit app-owned write/delete; never a model write tool. No model invocation. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { SixteenMemory } from "@sixteen-memory/sdk";
import { createSixteenMemory } from "@sixteen-memory/vercel-ai";

const { SIXTEEN_BASE_URL: baseUrl, SIXTEEN_API_KEY: apiKey, SIXTEEN_USER_ID: userId } = process.env;
if (!baseUrl || !apiKey || !userId) throw Error("Set the three SIXTEEN_* variables using a scoped synthetic test key.");
const client = new SixteenMemory({ baseUrl, apiKey });
const health = await client.health();
assert.equal(health.model_configured, false);
assert.equal(health.retrieval, "lexical");
const memory = createSixteenMemory({ baseUrl, apiKey, userId });
const text = "VercelLifecycle" + randomUUID().replaceAll("-", "");
const saved = await memory.rememberUserMessage({
  role: "user", text, requestId: randomUUID(), ref: "synthetic-lifecycle", observedAt: new Date().toISOString(),
});
try {
  assert.ok((await memory.search(text)).memories.some(row => row.id === saved.id));
} finally {
  await client.delete(saved.id, saved.version);
}
assert.equal((await memory.search(text)).memories.length, 0);
console.log("PASS: Vercel explicit write -> retrieve -> SDK delete -> no stale result");
