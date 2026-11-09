import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
const directory = await mkdtemp(join(tmpdir(), "sixteen-python-"));
const admin = "synthetic-python-owner-" + crypto.randomUUID();
let outbound = 0;
const mf = new Miniflare({
  ...convertV4MiniflareOptions({ workers: [{
    name: "python", modules: true, scriptPath: join(process.cwd(), "dist-worker/index.js"),
    compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
    bindings: { ...config.vars, ADMIN_KEY: admin, PROJECT_ID: "python" },
    durableObjects: { PROJECTS: { className: "MemoryProject", useSQLite: true } },
    serviceBindings: { ASSETS: () => new Response("") },
    ratelimits: Object.fromEntries(config.ratelimits.map(({ name, ...v }) => [name, v])),
    outboundService: () => { outbound++; throw Error("External access forbidden"); },
  }] }), resourcePersistencePath: directory,
});
const server = createServer(async (req, res) => {
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const response = await mf.dispatchFetch("http://local.test" + req.url, { method: req.method,
      headers: { ...req.headers, "CF-Connecting-IP": crypto.randomUUID() }, ...(chunks.length ? { body: Buffer.concat(chunks) } : {}) });
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end("{}"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
try {
  const response = await mf.dispatchFetch("http://local.test/v1/keys", { method: "POST", headers: { Authorization: "Bearer " + admin, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "python", role: "write", user_id: "python-user" }) });
  const key = (await response.json()).key;
  const script = `
import os, json, uuid
from sixteen_memory import SixteenMemory, MemoryAPIError
c=SixteenMemory(os.environ["TEST_BASE"], os.environ["TEST_KEY"])
u="python-user"
m=c.add(user_id=u,request_id="p1",content="Python memory",source={"type":"manual","ref":"python","text":"Exact PythonNeedle condition.","observed_at":"2026-11-01T00:00:00Z"})
assert c.context(u,"PythonNeedle")["memories"][0]["id"]==m["id"]
assert c.search_evidence(u,"PythonNeedle")["data"][0]["memory_id"]==m["id"]
conversation=c.create_conversation(user_id=u,request_id="c1",title="Python runtime",messages=[{"id":"m1","role":"user","content":"ConversationNeedle","observed_at":"2026-11-01T00:00:00Z"}])
updated=c.append_conversation(conversation["id"],request_id="c2",expected_version=1,messages=[{"id":"m2","role":"assistant","content":"Unverified","observed_at":"2026-11-01T00:00:01Z"}])
assert len(c.conversation(conversation["id"])["messages"])==2
assert c.search_conversations(u,"ConversationNeedle")["data"][0]["conversation_id"]==conversation["id"]
assert c.wiki(u)["data"]==[]
assert c.graph(u)["edges"]==[]
try: c.search_conversations("other","ConversationNeedle")
except MemoryAPIError as e: assert e.status==404
else: raise AssertionError("scope leak")
c.delete_conversation(conversation["id"],updated["version"])
assert c.search_conversations(u,"ConversationNeedle")["data"]==[]
c.delete(m["id"],m["version"])
print(json.dumps({"python_worker_runtime":"passed","memory_and_conversation_deleted":True}))
`;
  const exit = await new Promise(resolve => {
    const process = spawn(globalThis.process.env.PYTHON_BIN || "python3", ["-c", script], { stdio: ["ignore", "pipe", "pipe"],
      env: { ...globalThis.process.env, PYTHONPATH: join(globalThis.process.cwd(), "sdk-python"), TEST_BASE: "http://127.0.0.1:" + server.address().port, TEST_KEY: key } });
    let output = ""; process.stdout.on("data", chunk => { output += chunk; }); process.stderr.on("data", chunk => { output += chunk; });
    process.on("error", () => resolve({ status: 1, output: "Python could not start" }));
    process.on("close", status => resolve({ status, output }));
  });
  assert.equal(exit.status, 0, exit.output); assert.equal(outbound, 0); console.log(exit.output.trim());
} finally { await new Promise(resolve => server.close(resolve)); await mf.dispose(); await rm(directory, { recursive: true, force: true }); }
