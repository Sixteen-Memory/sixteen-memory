import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { SixteenMemory } from "../sdk/client.mjs";
import { build } from "esbuild";

const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
const directory = await mkdtemp(join(tmpdir(), "sixteen-media-"));
const owner = "synthetic-media-owner-012345678901234567890";
let calls = 0, malformed = false, outage = false, pause = false, reached, release;
const groups = [];
const run = async (name, action) => { await action(); groups.push(name); console.log("PASS", name); };
const output = { complete: true, warnings: ["Speaker labels are model generated."], segments: [
  { id: "s1", start_ms: 0, end_ms: 1300, speaker: "speaker_1", kind: "speech", text: "We plan to ship on Friday." },
], facts: [{ content: "speaker_1 reported a plan to ship on Friday.", fact_key: "project.ship_plan",
  confidence: .84, evidence: [{ segment_id: "s1", quote: "plan to ship on Friday" }] }] };
const provider = async request => {
  calls++;
  if (outage) return new Response("PRIVATE_PROVIDER_ERROR", { status: 503 });
  const body = await request.json();
  assert.equal(body.stream, true); assert.equal(body.modalities[0], "text");
  const media = body.messages[1].content[0];
  if (media.type === "input_audio") assert.match(media.input_audio.data, /^data:;base64,/);
  else { assert.equal(media.type, "video_url"); assert.match(media.video_url.url, /^data:;base64,/); }
  if (pause) { reached(); await new Promise(resolve => { release = resolve; }); pause = false; }
  const value = structuredClone(output);
  if (media.type === "video_url") {
    value.segments.push({ id: "v1", start_ms: null, end_ms: null, speaker: null, kind: "visual", text: "The slide displays a draft release schedule." });
    value.facts = [{ content: "The video slide displays a draft release schedule.", fact_key: "project.schedule_slide", confidence: .8,
      evidence: [{ segment_id: "v1", quote: "draft release schedule" }] }];
  }
  const text = malformed ? "{" : JSON.stringify(value);
  const events = [
    { choices: [{ index: 0, delta: { content: text.slice(0, 35) }, finish_reason: null }] },
    { choices: [{ index: 0, delta: { content: text.slice(35) }, finish_reason: "stop" }] },
    { choices: [], usage: { prompt_tokens: 10, completion_tokens: 12 } },
  ];
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n",
    { headers: { "Content-Type": "text/event-stream" } });
};
const mf = new Miniflare({
  ...convertV4MiniflareOptions({ workers: [{
    name: "media", modules: true, scriptPath: join(process.cwd(), "dist-worker/index.js"),
    compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
    bindings: { ...config.vars, PROJECT_ID: "media", ADMIN_KEY: owner, MEDIA_ENABLED: "true",
      MEDIA_BASE_URL: "https://fixture.test/v1", MEDIA_MODEL: "fixture-omni", MEDIA_API_KEY: "synthetic" },
    durableObjects: { PROJECTS: { className: "MemoryProject", useSQLite: true } },
    serviceBindings: { ASSETS: () => new Response("") }, outboundService: provider,
    ratelimits: Object.fromEntries(config.ratelimits.map(({ name, ...value }) => [name, value])),
  }] }), resourcePersistencePath: directory, unsafeInspectDurableObjects: true,
});
const api = async (method, path, body, key = owner) => {
  const response = await mf.dispatchFetch("https://fixture.local" + path, { method,
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "CF-Connecting-IP": crypto.randomUUID() },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, body: await response.json() };
};
const ok = async (...args) => { const value = await api(...args); assert.equal(value.status, 200, JSON.stringify(value)); return value.body; };
function makeWav(size = 32000) {
 const b = Buffer.alloc(44 + size); b.write("RIFF"); b.writeUInt32LE(b.length - 8,4); b.write("WAVEfmt ",8);
 b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(8000,24); b.writeUInt32LE(8000,28);
 b.writeUInt16LE(1,32); b.writeUInt16LE(8,34); b.write("data",36); b.writeUInt32LE(size,40); return b;
}
const wav = makeWav().toString("base64");
const input = request_id => ({ user_id: "alice", request_id, ref: "meeting-1", observed_at: "2026-11-10T00:00:00Z",
  consent: true, media: { mime_type: "audio/wav", data_base64: wav } });
let server;

try {
  const health = await ok("GET", "/health"); assert.equal(health.media_ingestion, "assisted");
  const writer = (await ok("POST", "/v1/keys", { name: "writer", role: "write", user_id: "alice" })).key;
  const reader = (await ok("POST", "/v1/keys", { name: "reader", role: "read", user_id: "alice" })).key;
  const before = calls, job = await ok("POST", "/v1/media/ingestions", input("media-1"), writer);
  assert.equal(job.state, "review"); assert.equal(calls, before + 1);
  assert.equal(job.proposal.media.segments[0].speaker, "speaker_1");
  assert.equal(job.proposal.decisions[0].action, "add");
  assert.equal((await ok("POST", "/v1/media/ingestions", input("media-1"), writer)).id, job.id);
  assert.equal(calls, before + 1, "idempotent replay cannot call the provider twice");
  assert.equal((await ok("POST", "/v1/search", { user_id: "alice", query: "Friday" }, reader)).data.length, 0);
  assert.equal((await api("POST", `/v1/ingestions/${job.id}/resolve`, { approve: true }, reader)).status, 403);
  const applied = await ok("POST", `/v1/ingestions/${job.id}/resolve`, { approve: true }, writer);
  const memory = await ok("GET", `/v1/memories/${applied.results[0].memory_id}`, undefined, reader);
  assert.equal(memory.origin, "explicit"); assert.equal(memory.source.media.sha256.length, 64);
  assert.equal(memory.source.media.segments[0].text, "plan to ship on Friday");
  const sql = await mf.unsafeGetDurableObjectStorage("media", "MemoryProject", { name: "media" });
  const rows = await sql.exec("SELECT source FROM memories");
  assert.ok(!JSON.stringify(rows).includes(wav), "raw media cannot be stored");
  assert.equal((await ok("POST", "/v1/search", { user_id: "alice", query: "Friday" }, reader)).data[0].id, memory.id);
  assert.equal((await ok("POST", "/v1/evidence/search", { user_id: "alice", query: "Friday" }, reader)).data[0].source.media.model, "fixture-omni");
  assert.equal((await ok("GET", `/v1/memories/${memory.id}/history`, undefined, reader))[0].source.media.interpretation, "model_generated");
  console.log("PASS audio confirmation, search, evidence, history and idempotency");
  groups.push("audio");
  await run("media provenance survives exact memory updates without retaining the file", async () => {
    const changed = await ok("PATCH", `/v1/memories/${memory.id}`, { content: memory.content, source: memory.source,
      expected_version: memory.version, reason: "Confirmed wording", expires_at: null }, writer);
    assert.equal(changed.source.media.sha256, memory.source.media.sha256);
    memory.version = changed.version;
  });
  await run("video keeps visual provenance, rejects remote inputs and accepts bounded larger clips", async () => {
    const mp4 = await readFile("test/fixtures/media/30min.mp4");
    const video = { ...input("video"), media: { mime_type: "video/mp4", data_base64: mp4.toString("base64") } };
    const job = await ok("POST", "/v1/media/ingestions", video, writer);
    assert.equal(job.proposal.media.mime_type, "video/mp4");
    assert.equal(job.proposal.decisions[0].fact.source.media.segments[0].kind, "visual");
    assert.equal(job.proposal.decisions[0].fact.source.media.segments[0].speaker, null);
    const previous = calls;
    assert.equal((await api("POST", "/v1/media/ingestions", { ...video, ref: "other" }, writer)).status, 409);
    for (const body of [{ ...input("url"), media: { mime_type: "audio/wav", url: "http://127.0.0.1" } },
      { ...input("consent"), consent: false }, { ...input("auto"), mode: "auto" },
      { ...input("signature"), media: { mime_type: "audio/wav", data_base64: mp4.toString("base64") } }]) {
      assert.ok([415, 422].includes((await api("POST", "/v1/media/ingestions", body, writer)).status));
    }
    assert.equal(calls, previous);
    assert.equal((await api("POST", "/v1/ingestions", { ...video, padding: "x".repeat(70000) }, writer)).status, 413);
    assert.equal((await api("POST", "/v1/media/ingestions", { ...video, padding: "a".repeat(10 * 1024 * 1024) }, writer)).status, 413);
    await ok("POST", `/v1/ingestions/${job.id}/resolve`, { approve: false }, writer);
    assert.equal((await ok("GET", `/v1/ingestions/${job.id}`, undefined, reader)).proposal, null);
    assert.equal((await api("POST", "/v1/media/ingestions", video, writer)).status, 410);
  });
  malformed = true;
  const invalid = await api("POST", "/v1/media/ingestions", input("malformed"), writer);
  assert.equal(invalid.status, 502); assert.equal(invalid.body.error.code, "invalid_media_json");
  outage = true; malformed = false;
  const unavailable = await api("POST", "/v1/media/ingestions", input("outage"), writer);
  assert.equal(unavailable.status, 502); assert.ok(!JSON.stringify(unavailable.body).includes("PRIVATE"));
  const beforeDenied = calls;
  assert.equal((await api("POST", "/v1/media/ingestions", input("readonly"), reader)).status, 403);
  assert.equal((await api("POST", "/v1/media/ingestions", { ...input("foreign"), user_id: "bob" }, writer)).status, 404);
  assert.equal(calls, beforeDenied);
  const previousCalls = calls;
  assert.equal((await api("POST", "/v1/media/ingestions", input("malformed"), writer)).status, 409);
  assert.equal(calls, previousCalls);
  outage = false;
  await run("in-flight changes and concurrent same-id requests cannot commit stale facts or spend twice", async () => {
    pause = true;
    const started = new Promise(resolve => { reached = resolve; });
    const pending = api("POST", "/v1/media/ingestions", input("race"), writer);
    await started;
    const before = calls;
    assert.equal((await api("POST", "/v1/media/ingestions", input("race"), writer)).status, 409);
    assert.equal(calls, before);
    await ok("POST", "/v1/memories", { user_id: "alice", request_id: "new-scope-state", content: "Explicit plan change",
      source: { type: "manual", ref: "manual", text: "Explicit plan change", observed_at: input("x").observed_at } }, writer);
    release();
    const result = await pending;
    assert.equal(result.status, 409); assert.equal(result.body.error.code, "scope_changed");
  });
  await run("expiry and memory deletion remove pending media excerpts and cannot resurrect data", async () => {
    const earlier = new Date(Date.now() + 300_000).toISOString();
    const expired = await ok("POST", "/v1/media/ingestions", { ...input("expire"), expires_at: earlier }, writer);
    assert.equal(expired.expires_at, earlier);
    await sql.exec("UPDATE ingest_jobs SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?", expired.id);
    assert.equal((await ok("GET", `/v1/ingestions/${expired.id}`, undefined, reader)).proposal, null);
    const pending = await ok("POST", "/v1/media/ingestions", input("pending-delete"), writer);
    await ok("DELETE", `/v1/memories/${memory.id}`, { expected_version: memory.version }, writer);
    assert.equal((await ok("GET", `/v1/ingestions/${pending.id}`, undefined, reader)).state, "deleted");
    assert.equal((await ok("GET", `/v1/ingestions/${job.id}`, undefined, reader)).state, "deleted");
    assert.equal((await ok("POST", "/v1/search", { user_id: "alice", query: "Friday" }, reader)).data.length, 0);
    assert.equal((await ok("POST", "/v1/evidence/search", { user_id: "alice", query: "Friday" }, reader)).data.length, 0);
    assert.equal((await sql.exec("SELECT count(*) n FROM history WHERE memory_id=?", memory.id))[0].n, 0);
  });
  await run("JS and Python sync/async SDKs complete media store-search-delete through local HTTP", async () => {
    server = createServer(async (req, res) => {
      try {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const response = await mf.dispatchFetch("http://fixture.local" + req.url, { method: req.method,
          headers: { ...req.headers, "CF-Connecting-IP": crypto.randomUUID() },
          ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
        res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
      } catch { res.writeHead(500); res.end("{}"); }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const baseUrl = "http://127.0.0.1:" + server.address().port;
    const client = new SixteenMemory({ baseUrl, apiKey: writer });
    const data = makeWav(100_000).toString("base64");
    const payload = { ...input("sdk-js"), media: { mime_type: "audio/wav", data_base64: data } };
    const job = await client.ingestMedia(payload);
    const result = await client.resolveIngestion(job.id, true);
    const row = await client.get(result.results[0].memory_id);
    assert.equal((await client.search({ user_id: "alice", query: "Friday" })).data[0].id, row.id);
    await client.delete(row.id, row.version);
    const script = `
import asyncio, json, os
from sixteen_memory import SixteenMemory, AsyncSixteenMemory
payload=json.loads(os.environ["TEST_INPUT"])
c=SixteenMemory(os.environ["TEST_BASE"],os.environ["TEST_KEY"])
payload["request_id"]="sdk-python-sync"
j=c.ingest_media(**payload)
assert c.ingestion(j["id"])["state"]=="review"
r=c.resolve_ingestion(j["id"],True)
m=c.get(r["results"][0]["memory_id"])
assert c.search("alice","Friday")["data"][0]["id"]==m["id"]
assert m["source"]["media"]["interpretation"]=="model_generated"
c.delete(m["id"],m["version"])
async def check():
    async with AsyncSixteenMemory(os.environ["TEST_BASE"],os.environ["TEST_KEY"]) as c:
        payload["request_id"]="sdk-python-async"
        j=await c.ingest_media(**payload)
        r=await c.resolve_ingestion(j["id"],True)
        m=await c.get(r["results"][0]["memory_id"])
        assert (await c.search("alice","Friday"))["data"][0]["id"]==m["id"]
        await c.delete(m["id"],m["version"])
asyncio.run(check())
print("PASS Python sync/async media lifecycle")
`;
    const python = process.env.PYTHON_BIN || join(process.cwd(), ".local/python-build-env/bin/python");
    const resultPy = await new Promise(resolve => {
      const child = spawn(python, ["-c", script], { env: { ...process.env, PYTHONPATH: join(process.cwd(), "sdk-python"),
        TEST_BASE: baseUrl, TEST_KEY: writer, TEST_INPUT: JSON.stringify(payload) }, stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
      child.on("error", error => resolve({ code: 1, output: error.message }));
      child.on("close", code => resolve({ code, output }));
    });
    assert.equal(resultPy.code, 0, resultPy.output);
    assert.equal((await client.search({ user_id: "alice", query: "Friday" })).data.length, 0);
    const file = join(directory, "synthetic.wav");
    await writeFile(file, Buffer.from(data, "base64"));
    const example = join(directory, "media-example.mjs");
    await build({ entryPoints: ["examples/media-to-memory.mjs"], outfile: example, bundle: true, platform: "node", format: "esm",
      alias: { "@sixteen-memory/sdk": join(process.cwd(), "sdk/client.mjs") }, logLevel: "silent" });
    for (const [name, command, args, extra] of [
      ["example-js", process.execPath, [example], {}],
      ["example-python", python, [join(process.cwd(), "examples/media-to-memory.py")], {}],
      ["example-async", python, [join(process.cwd(), "examples/media-to-memory.py")], { SIXTEEN_ASYNC: "yes" }],
    ]) {
      const executed = await new Promise(resolve => {
        const child = spawn(command, args, { env: { ...process.env, PYTHONPATH: join(process.cwd(), "sdk-python"),
          SIXTEEN_BASE_URL: baseUrl, SIXTEEN_API_KEY: writer, SIXTEEN_USER_ID: "alice", SIXTEEN_REQUEST_ID: name,
          SIXTEEN_OBSERVED_AT: input("x").observed_at, SIXTEEN_MEDIA_FILE: file, SIXTEEN_MEDIA_CONSENT: "yes", ...extra },
          stdio: ["ignore", "pipe", "pipe"] });
        let output = "";
        child.stdout.on("data", chunk => { output += chunk; }); child.stderr.on("data", chunk => { output += chunk; });
        child.on("error", error => resolve({ code: 1, output: error.message }));
        child.on("close", code => resolve({ code, output }));
      });
      assert.equal(executed.code, 0, executed.output);
      const job = (await client.ingestions("alice")).find(job => job.proposal?.request_id === name);
      assert.equal(job.state, "review");
      await client.resolveIngestion(job.id, false);
    }
  });
  await run("daily budget and revoked keys prevent new provider calls; revoked in-flight jobs cannot commit", async () => {
    const temporary = await ok("POST", "/v1/keys", { name: "temporary", role: "write", user_id: "alice" });
    pause = true;
    const started = new Promise(resolve => { reached = resolve; });
    const pending = api("POST", "/v1/media/ingestions", input("revoke-race"), temporary.key);
    await started;
    await ok("DELETE", `/v1/keys/${temporary.record.id}`);
    release();
    assert.equal((await pending).status, 401);
    const before = calls;
    assert.equal((await api("POST", "/v1/media/ingestions", input("revoked"), temporary.key)).status, 401);
    const day = new Date().toISOString().slice(0, 10);
    await sql.exec("UPDATE model_budget SET reserved=200 WHERE day=?", day);
    const result = await api("POST", "/v1/media/ingestions", input("budget"), writer);
    assert.equal(result.status, 429); assert.equal(result.body.error.code, "model_daily_limit");
    assert.equal(calls, before);
    assert.equal((await sql.exec("SELECT count(*) n FROM ingest_jobs WHERE plan IS NOT NULL"))[0].n, 0);
  });
  assert.equal((await sql.exec("SELECT count(*) n FROM ingest_jobs WHERE state='review'"))[0].n, 0);
  console.log(`PASS ${groups.length} media runtime groups; ${calls} intercepted provider calls, zero external calls`);
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await mf.dispose();
  await rm(directory, { recursive: true, force: true });
}
