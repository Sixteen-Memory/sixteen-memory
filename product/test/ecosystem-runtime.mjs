/**
 * Installed JS/adapter archives and Python wheel -> loopback HTTP -> actual
 * Worker/SQLite. Only synthetic keys/data; no provider traffic or production.
 * Behavioral assertions and unmet P1 capabilities are reported separately.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { SixteenMemory as Development } from "../sdk/index.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const product = fileURLToPath(new URL("../", import.meta.url));
const folder = await mkdtemp(join(tmpdir(), "sixteen-ecosystem-"));
const python = process.env.PYTHON_BIN || "python3";
const wheel = resolve(process.env.PYTHON_WHEEL || join(product, "sdk-python/dist/sixteen_memory-0.3.0-py3-none-any.whl"));
const config = JSON.parse(await readFile(join(product, "wrangler.jsonc"), "utf8"));
const administrator = "synthetic-ecosystem-" + crypto.randomUUID(), user = "ecosystem";
const checks = [], probes = {};
let mf, server, mcp, outbound = 0, requests = 0, success = false;
const run = (command, args, extra = {}) => new Promise((resolveRun, reject) => {
  const child = spawn(command, args, { cwd: folder, env: { ...process.env, PIP_NO_INDEX: "1", PIP_DISABLE_PIP_VERSION_CHECK: "1", ...extra },
    stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout += chunk; });
  child.stderr.on("data", chunk => { stderr += chunk; });
  const timer = setTimeout(() => child.kill("SIGKILL"), 120000);
  child.on("error", error => { clearTimeout(timer); reject(error); });
  child.on("close", code => { clearTimeout(timer); code === 0 ? resolveRun(stdout) : reject(Error(`${command} exited ${code}: ${stderr}\n${stdout}`)); });
});
async function allPages(fetch) {
  const rows = [], sizes = [], seen = new Set();
  let cursor;
  do {
    const page = await fetch(cursor);
    rows.push(...page.data); sizes.push(page.data.length); cursor = page.next_cursor;
    if (cursor) { assert.ok(!seen.has(cursor)); seen.add(cursor); }
  } while (cursor);
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  return { rows, sizes };
}
try {
  const archives = [];
  for (const path of ["sdk", "integrations/vercel-ai"]) {
    const [pack] = JSON.parse(await run("npm", ["pack", join(product, path), "--json", "--ignore-scripts", "--pack-destination", folder]));
    archives.push(join(folder, pack.filename));
  }
  await writeFile(join(folder, "package.json"), JSON.stringify({ private: true, type: "module" }));
  await run("npm", ["install", "--offline", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org",
    ...archives, "ai@7.0.165", "zod@4.6.7"]);
  await run(python, ["-m", "venv", join(folder, "venv")]);
  const isolatedPython = join(folder, "venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  await run(isolatedPython, ["-m", "pip", "install", "--no-index", "--no-deps", wheel]);
  const installed = await import(pathToFileURL(join(folder, "node_modules/@sixteen-memory/sdk/client.mjs")));
  const adapter = await import(pathToFileURL(join(folder, "node_modules/@sixteen-memory/vercel-ai/dist/index.js")));
  const { SixteenMemory, MemoryApiError, MemoryTransportError } = installed;
  checks.push("fresh offline installation of JS SDK, adapter and Python wheel");

  mf = new Miniflare({
    ...convertV4MiniflareOptions({ workers: [{
      name: "ecosystem", modules: true, scriptPath: join(product, "dist-worker/index.js"),
      compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
      bindings: { ...config.vars, PROJECT_ID: "ecosystem", ADMIN_KEY: administrator },
      durableObjects: { PROJECTS: { className: "MemoryProject", useSQLite: true } },
      serviceBindings: { ASSETS: () => new Response("") },
      ratelimits: Object.fromEntries(config.ratelimits.map(({ name, ...value }) => [name, value])),
      outboundService: () => { outbound++; throw Error("No external provider access"); },
    }] }), resourcePersistencePath: join(folder, "state"), unsafeInspectDurableObjects: true,
  });
  server = createServer(async (req, res) => {
    try {
      requests++;
      if (req.url.startsWith("/probe/")) {
        const mode = req.url.split("/")[2]; probes[mode] = (probes[mode] || 0) + 1;
        if (mode === "slow") { await new Promise(resolveDelay => setTimeout(resolveDelay, 180)); res.end("{}"); return; }
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { code: mode === "error" ? "version_conflict" : "PRIVATE_SENTINEL_INVALID",
          message: "PRIVATE_SENTINEL_MESSAGE" } })); return;
      }
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const response = await mf.dispatchFetch("http://worker.test" + req.url, {
        method: req.method, headers: { ...req.headers, "CF-Connecting-IP": crypto.randomUUID() },
        ...(chunks.length ? { body: Buffer.concat(chunks) } : {}),
      });
      res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500); res.end("{}"); }
  });
  await new Promise(resolveListen => server.listen(0, "127.0.0.1", resolveListen));
  const baseUrl = "http://127.0.0.1:" + server.address().port;
  const admin = new SixteenMemory({ baseUrl, apiKey: administrator });
  const writer = await admin.createKey({ name: "synthetic writer", role: "write", user_id: user });
  const reader = await admin.createKey({ name: "synthetic reader", role: "read", user_id: user });
  const client = new SixteenMemory({ baseUrl, apiKey: writer.key });
  const read = new SixteenMemory({ baseUrl, apiKey: reader.key });
  const dev = new Development({ baseUrl, apiKey: writer.key });
  const source = { type: "manual", ref: "ecosystem", text: "EcosystemNeedle", observed_at: "2026-11-09T00:00:00Z" };
  assert.equal((await admin.health()).version, "0.3.0", "report the actual current Worker, not the older fixture label");
  const input = { user_id: user, request_id: "js-new-user", content: "EcosystemNeedle", source };
  const saved = await client.add(input);
  assert.equal((await client.add(input)).id, saved.id);
  assert.equal((await client.search({ user_id: user, query: "EcosystemNeedle" })).data[0].id, saved.id);
  const apiCode = (status, code) => error => error instanceof MemoryApiError && error.status === status && error.code === code;
  await assert.rejects(read.add({ ...input, request_id: "denied" }), apiCode(403, "read_only"));
  await assert.rejects(client.search({ user_id: "other", query: "EcosystemNeedle" }), apiCode(404, "not_found"));
  const updated = await client.update(saved.id, { content: "Changed", source, expected_version: saved.version, reason: "Explicit test" });
  await assert.rejects(client.delete(saved.id, saved.version), apiCode(409, "version_conflict"));
  await client.delete(saved.id, updated.version);
  assert.deepEqual((await client.search({ user_id: user, query: "EcosystemNeedle" })).data, []);
  await assert.rejects(client.add(input), apiCode(410, "memory_deleted"));
  checks.push("installed JS write/search/update/conflict/delete, retry tombstone, read-only and scope");

  for (let i = 0; i < 51; i++) await client.add({ ...input, request_id: "page-" + i, category: i < 26 ? "keep" : "other" });
  const listed = await allPages(cursor => client.list({ user_id: user, cursor }));
  const exported = await allPages(cursor => client.exportPage({ user_id: user, cursor }));
  assert.deepEqual(listed.sizes, [50, 1]); assert.deepEqual(exported.sizes, [50, 1]);
  assert.deepEqual(listed.rows.map(row => row.id), exported.rows.map(row => row.id));
  const filter = { field: "category", op: "eq", value: "keep" };
  assert.equal((await dev.list({ user_id: user, filter })).data.length, 26);
  assert.equal((await dev.exportPage({ user_id: user, filter })).data.length, 26);
  checks.push("JS memory/export pagination 50+1 and development filters");

  const env = { TEST_BASE: baseUrl, TEST_KEY: writer.key, TEST_USER: user };
  const py = JSON.parse(await run(isolatedPython, ["-I", join(product, "test/ecosystem-python.py")], env));
  assert.deepEqual(py.memory_ids, listed.rows.map(row => row.id));
  checks.push("installed Python lifecycle and same JS-written memory/export pages");
  checks.push("installed Python conversation lists 50+1 and messages 32+32+1");
  const convs = await allPages(cursor => dev.conversations(user, cursor));
  assert.deepEqual(convs.sizes, [50, 1]);
  const messages = []; let cursor = "";
  do {
    const page = await dev.conversation(py.conversation_id, cursor);
    messages.push(...page.messages); cursor = page.next_cursor;
  } while (cursor);
  assert.deepEqual(messages.map(m => m.id), Array.from({ length: 65 }, (_, i) => "m" + i));
  checks.push("development JS reads Python-written conversations without omissions");

  const memory = adapter.createSixteenMemory({ baseUrl, apiKey: writer.key, userId: user });
  const event = { role: "user", requestId: "adapter-event", ref: "synthetic", text: "AdapterNeedle", observedAt: source.observed_at };
  const explicit = await memory.rememberUserMessage(event);
  assert.equal((await memory.search("AdapterNeedle")).memories[0].id, explicit.id);
  await client.delete(explicit.id, explicit.version);
  assert.equal((await memory.search("AdapterNeedle")).memories.length, 0);
  checks.push("installed Vercel adapter explicit write/search then shared SDK delete, no stale cache");

  mcp = new Client({ name: "ecosystem-offline-test", version: "1" });
  await mcp.connect(new StreamableHTTPClientTransport(new URL("/v1/mcp", baseUrl), {
    requestInit: { headers: { Authorization: "Bearer " + reader.key } },
  }));
  const tools = (await mcp.listTools()).tools;
  assert.equal(tools.length, 7); assert.ok(tools.every(tool => tool.annotations.readOnlyHint));
  const found = await mcp.callTool({ name: "search_conversations", arguments: { query: "ConversationNeedle" } });
  assert.ok(JSON.parse(found.content[0].text).data.data.length);
  assert.equal((await mcp.callTool({ name: "search_conversations", arguments: { query: "ConversationNeedle", user_id: "other" } })).isError, true);
  checks.push("official MCP client: seven read-only tools, scoped retrieval and spoof rejection");

  const normalized = value => value.replaceAll("_", "").toLowerCase();
  const packagedMethods = Object.getOwnPropertyNames(SixteenMemory.prototype).filter(name => name !== "constructor" && name !== "request");
  const developmentMethods = [...new Set([...packagedMethods, ...Object.getOwnPropertyNames(Development.prototype).filter(name => name !== "constructor")])];
  const pythonNames = new Set(py.findings.public_methods.map(normalized));
  const methodsPresent = methods => new Set(methods.map(normalized));
  const interfaces = {
    packaged_js_methods: packagedMethods,
    development_js_methods: developmentMethods,
    python_user_methods_missing_from_packaged_js: py.findings.public_methods.filter(name => !methodsPresent(packagedMethods).has(normalized(name))),
    python_user_methods_missing_from_development_js: py.findings.public_methods.filter(name => !methodsPresent(developmentMethods).has(normalized(name))),
    js_only_methods: packagedMethods.filter(name => !pythonNames.has(normalized(name))),
    note: "Admin/session helpers differ intentionally; a matching method name does not establish parameter or response parity.",
  };
  assert.deepEqual(interfaces.python_user_methods_missing_from_development_js, []);
  const jsFindings = { packaged_context: typeof client.context === "function", packaged_conversations: typeof client.conversations === "function" };
  for (const mode of ["error", "invalid-code"]) {
    try { await new SixteenMemory({ baseUrl: baseUrl + "/probe/" + mode, apiKey: writer.key }).me(); assert.fail(); }
    catch (error) { assert.ok(error instanceof MemoryApiError); jsFindings[mode] = { code: error.code, synthetic_message_exposed: error.message.includes("PRIVATE_SENTINEL") }; }
  }
  try { await new SixteenMemory({ baseUrl: baseUrl + "/probe/slow", apiKey: writer.key, timeoutMs: 50 }).me(); assert.fail(); }
  catch (error) { assert.ok(error instanceof MemoryTransportError); jsFindings.timeout_code = error.code; }
  const abort = new AbortController(); abort.abort(); const beforeAbort = requests;
  await assert.rejects(client.me({ signal: abort.signal }), error => error.code === "aborted");
  assert.equal(requests, beforeAbort);
  let unsafeAccepted = false;
  try { new SixteenMemory({ baseUrl: "http://non-loopback.invalid", apiKey: "synthetic" }); unsafeAccepted = true; } catch {}
  jsFindings.non_https_config_accepted_without_request = unsafeAccepted;
  // Reproduce inherited JS APIError text exposure separately from the adapter's sanitization.
  const guarded = adapter.createSixteenMemory({ baseUrl: baseUrl + "/probe/error", apiKey: writer.key, userId: user });
  try { await guarded.search("test"); assert.fail(); }
  catch (error) { assert.ok(!String(error).includes("PRIVATE_SENTINEL")); }
  checks.push("error/timeout differences characterized; JS pre-abort no request; adapter error text sanitized");
  assert.deepEqual(probes, { slow: 3, error: 3, "invalid-code": 2 });

  await run(process.execPath, [join(product, "examples/customer-continuity.mjs")], {
    SIXTEEN_BASE_URL: baseUrl, SIXTEEN_API_KEY: writer.key, SIXTEEN_USER_ID: "ecosystem",
  });
  checks.push("existing repository customer-continuity example runs against loopback and cleans up");
  for (const row of convs.rows) await dev.deleteConversation(row.id, row.version);
  for (const row of listed.rows) await client.delete(row.id, row.version);
  await run(isolatedPython, ["-I", join(product, "test/ecosystem-python.py")], { ...env, TEST_PHASE: "verify_cleanup" });
  await admin.revokeKey(writer.record.id); await admin.revokeKey(reader.record.id);
  await mcp.close(); mcp = undefined;
  const sql = await mf.unsafeGetDurableObjectStorage("ecosystem", "MemoryProject", { name: "ecosystem" });
  const cleanup = {};
  for (const table of ["memories", "history", "memory_evidence", "vectors", "conversations", "conversation_messages", "wiki_pages", "knowledge_edges"]) {
    cleanup[table] = (await sql.exec(`SELECT count(*) n FROM ${table}`))[0].n;
    assert.equal(cleanup[table], 0);
  }
  assert.equal((await sql.exec("SELECT count(*) n FROM api_keys WHERE revoked_at IS NULL"))[0].n, 0);
  assert.equal(outbound, 0);
  const gaps = [];
  if (!py.findings.native_async_export && !py.findings.coroutine_methods.length) gaps.push("Python native async is absent");
  if (!jsFindings.packaged_context || !jsFindings.packaged_conversations) gaps.push("Packaged JS lacks newer Python/source-JS methods");
  if (!py.findings.list_filter_supported || !py.findings.export_filter_supported) gaps.push("Python list/export lack development filters");
  if (py.findings.timeout_code !== jsFindings.timeout_code) gaps.push("Python and JS classify timeouts differently");
  if (jsFindings.error.synthetic_message_exposed || jsFindings["invalid-code"].code === "PRIVATE_SENTINEL_INVALID") {
    gaps.push("Base JS retains server error messages and arbitrary codes; Python and adapter sanitize");
  }
  if (jsFindings.non_https_config_accepted_without_request) gaps.push("Base JS accepts non-HTTPS external base URLs at construction");
  const report = {
    status: "behavioral_checks_passed_p1_not_certified", checks, worker_version: (await admin.health()).version,
    python_version: py.python_version, js: jsFindings, python: py.findings, interfaces, cleanup,
    gaps, mcp: { authentication_tested: "existing scoped bearer key", tools: tools.map(tool => tool.name), all_read_only: true,
      oauth_tested: false, controlled_writes_tested: false },
    limits: ["Manual pagination tested; no automated pagination API claim", "Independent new-user onboarding not observed",
      "Documentation completeness and additional Python version support require separate review",
      "Synthetic provider errors, not a production credential disclosure", "Cold registry/network installation not tested"],
    provider_calls: outbound, production_requests: 0, total_loopback_requests: requests,
  };
  if (process.env.ECOSYSTEM_REPORT) {
    const destination = resolve(process.env.ECOSYSTEM_REPORT);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, JSON.stringify(report, null, 2) + "\n");
  }
  console.log(JSON.stringify(report, null, 2)); success = true;
} finally {
  await mcp?.close().catch(() => undefined);
  if (server) { server.closeAllConnections(); await new Promise(resolveClose => server.close(resolveClose)); }
  await mf?.dispose();
  await rm(folder, { recursive: true, force: true });
  if (!success) console.error("Local acceptance interrupted; temporary install/SQLite removed. No production requests.");
}
