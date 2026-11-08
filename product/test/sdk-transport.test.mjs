import test from "node:test";
import assert from "node:assert/strict";
import { MemoryApiError, MemoryTransportError, SixteenMemory } from "../sdk/client.mjs";

const client = options => new SixteenMemory({ baseUrl: "https://memory.example", ...options });
const transportCode = code => error => error instanceof MemoryTransportError && error.code === code;

test("all typed methods propagate cancellation, and pre-aborted requests never start", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const memory = client({ fetch: async () => { calls++; return Response.json({}); } });
  const call = { signal: controller.signal };
  for (const pending of [
    memory.health(call), memory.me(call), memory.login("synthetic", call), memory.logout(call),
    memory.add({}, call), memory.get("id", call), memory.list({}, call), memory.search({}, call),
    memory.update("id", {}, call), memory.history("id", call), memory.revoke("id", 1, "why", call),
    memory.delete("id", 1, call), memory.exportPage({}, call), memory.answer({}, call),
    memory.keys(call), memory.createKey({}, call), memory.revokeKey("id", call), memory.requests(call),
  ]) await assert.rejects(pending, transportCode("aborted"));
  assert.equal(calls, 0);
});

test("timeouts and caller cancellation reach fetch without exposing causes", async () => {
  const fetch = (_url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("private cause")), { once: true }));
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(client({ timeoutMs: 10, fetch }).get("id"), transportCode("timeout"));
    const controller = new AbortController();
    const pending = client({ fetch }).search({ query: "test" }, { signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, transportCode("aborted"));
  } finally { clearTimeout(keepAlive); }
});

test("request size uses encoded bytes and oversized responses are cancelled", async () => {
  let calls = 0;
  await assert.rejects(client({ fetch: async () => { calls++; return Response.json({}); } }).add({ content: "\u4e2d".repeat(22000) }), transportCode("request_too_large"));
  assert.equal(calls, 0);
  let cancelled = false;
  const fetch = async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(100)); },
    cancel() { cancelled = true; },
  }));
  await assert.rejects(client({ fetch, maxResponseBytes: 32 }).get("id"), transportCode("response_too_large"));
  assert.equal(cancelled, true);
});

test("error codes survive while invalid bodies and redirects are classified", async () => {
  for (const [response, expected, type] of [
    [Response.json({ error: { code: "version_conflict", message: "Changed" } }, { status: 409 }), "version_conflict", MemoryApiError],
    [new Response("upstream html", { status: 502 }), "request_failed", MemoryApiError],
    [new Response("bad json"), "invalid_response", MemoryTransportError],
    [new Response(null, { status: 302, headers: { Location: "https://other.example" } }), "redirect_denied", MemoryApiError],
  ]) {
    let calls = 0;
    await assert.rejects(client({ fetch: async (_url, init) => {
      assert.equal(init.redirect, "manual"); calls++; return response;
    } }).get("id"), error => error instanceof type && error.code === expected);
    assert.equal(calls, 1);
  }
});

test("default response budget supports full memory pages, with correct split UTF-8 decoding", async () => {
  const value = { text: "\u4e2d".repeat(200000) };
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const memory = client({ fetch: async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(bytes.slice(0, 11)); controller.enqueue(bytes.slice(11)); controller.close();
    },
  })) });
  assert.deepEqual(await memory.list(), value);
});
