import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";

async function load(path) {
  const compiled = await build({ entryPoints: [path], bundle: true, write: false, format: "esm", platform: "node" });
  return import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));
}
const domain = await load("worker/media-domain.ts");
const provider = await load("worker/media-provider.ts");
const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVE"), Buffer.alloc(8)]).toString("base64");
const input = { user_id: "alice", request_id: "media-1", ref: "meeting-1", observed_at: "2026-11-10T00:00:00Z",
  consent: true, media: { mime_type: "audio/wav", data_base64: wav } };

test("media inputs require consent, small local clips and matching signatures", () => {
  assert.equal(domain.mediaInput(input).mode, "review");
  for (const value of [
    { ...input, consent: false },
    { ...input, media: { mime_type: "audio/wav", data_base64: Buffer.from("not wav bytes").toString("base64") } },
    { ...input, media: { ...input.media, url: "https://example.com/meeting.wav" } },
    { ...input, mode: "auto" },
    { ...input, media: { ...input.media, data_base64: "A".repeat(3 * 1024 * 1024) } },
  ]) assert.throws(() => domain.mediaInput(value));
});

test("media candidates remain attributed, grounded additions that require review", () => {
  const value = { complete: true, warnings: ["speaker attribution uncertain"], segments: [
    { id: "s1", start_ms: 1000, end_ms: 2500, speaker: "speaker_1", kind: "speech", text: "We plan to ship on Friday." },
  ], facts: [{ content: "speaker_1 reported a plan to ship on Friday.", fact_key: "project.ship_plan",
    confidence: .82, evidence: [{ segment_id: "s1", quote: "plan to ship on Friday" }] }] };
  const result = domain.mediaDecisions(value, domain.mediaInput(input), "a".repeat(64), "fixture");
  assert.equal(result.decisions[0].action, "add");
  assert.equal(result.decisions[0].needs_review, true);
  assert.match(result.decisions[0].fact.source.text, /not a verified transcript/);
  assert.equal(result.decisions[0].fact.source.media.segments[0].speaker, "speaker_1");
  assert.throws(() => domain.mediaDecisions({ ...value, facts: [{ ...value.facts[0], evidence: [{ segment_id: "s1", quote: "already shipped" }] }] },
    domain.mediaInput(input), "a".repeat(64), "fixture"));
  assert.throws(() => domain.mediaDecisions({ ...value, complete: false }, domain.mediaInput(input), "a".repeat(64), "fixture"));
  const unknown = structuredClone(value); unknown.segments[0].start_ms = null; unknown.segments[0].end_ms = null; unknown.segments[0].speaker = null;
  assert.equal(domain.mediaDecisions(unknown, domain.mediaInput(input), "a".repeat(64), "fixture").media.segments[0].speaker, null);
  unknown.segments[0].end_ms = 20;
  assert.throws(() => domain.mediaDecisions(unknown, domain.mediaInput(input), "a".repeat(64), "fixture"));
});

function sse(parts) {
  return new Response(new ReadableStream({ start(controller) {
    for (const part of parts) controller.enqueue(new TextEncoder().encode(part));
    controller.close();
  } }), { headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
}
test("media SSE parser handles split events and rejects truncation", async () => {
  const json = JSON.stringify({ complete: true, segments: [], facts: [], warnings: [] });
  const chunks = [
    `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: json.slice(0, 10) }, finish_reason: null }] })}\r`,
    `\n\r\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: { content: json.slice(10) }, finish_reason: "stop" }] })}\r\n\r\n`,
    `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 2, completion_tokens: 3 } })}\n\ndata: [DONE]\n\n`,
  ];
  const result = await provider.readMediaStream(sse(chunks));
  assert.equal(result.value.complete, true);
  assert.equal(result.usage.completion_tokens, 3);
  for (const finish_reason of [null, "length", "content_filter"]) {
    await assert.rejects(provider.readMediaStream(sse([`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "{}" }, finish_reason }] })}\n\n`])));
  }
  await assert.rejects(provider.readMediaStream(new Response("private provider error", { status: 503 })), error => !error.message.includes("private"));
});

test("media analysis rejects invented evidence, secrets, invalid segment roles and oversized results", () => {
  const base = { complete: true, segments: [{ id: "s", start_ms: null, end_ms: null, speaker: null, kind: "speech", text: "计划下周发布。" }], facts: [], warnings: [] };
  const prepared = domain.mediaInput(input);
  assert.deepEqual(domain.mediaDecisions(base, prepared, "a".repeat(64), "fixture").decisions, []);
  for (const segments of [
    [base.segments[0], base.segments[0]],
    [{ ...base.segments[0], kind: "visual" }],
    [{ ...base.segments[0], text: "sk-" + "a".repeat(40) }],
    Array.from({ length: 33 }, (_, i) => ({ ...base.segments[0], id: "s" + i })),
  ]) assert.throws(() => domain.mediaDecisions({ ...base, segments }, prepared, "a".repeat(64), "fixture"));
  assert.throws(() => domain.mediaDecisions({ ...base, warnings: ["sk-" + "a".repeat(40)] }, prepared, "a".repeat(64), "fixture"));
});

test("media stream enforces byte limit, full UTF-8 decoding and no truncated completion", async () => {
  const text = JSON.stringify({ text: "计划下周发布" });
  const raw = new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: text }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
  const response = new Response(new ReadableStream({ start(controller) {
    for (const byte of raw) controller.enqueue(Uint8Array.of(byte));
    controller.close();
  } }), { headers: { "Content-Type": "text/event-stream" } });
  assert.equal((await provider.readMediaStream(response)).value.text, "计划下周发布");
  await assert.rejects(provider.readMediaStream(sse([":" + "a".repeat(256 * 1024)])), error => error.code === "media_provider_size");
});
