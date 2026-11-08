import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import Ajv from "../openapi/node_modules/ajv/dist/2020.js";
import addFormats from "../openapi/node_modules/ajv-formats/dist/index.js";
import { SixteenMemory, MemoryApiError } from "../sdk/client.mjs";

const spec = JSON.parse(await readFile(new URL("../openapi/openapi.json", import.meta.url)));
const ajv = new Ajv({ strict: false, allErrors: true });
addFormats(ajv);
const validators = new Map();
function validate(schema, value, label) {
  const key = JSON.stringify(schema);
  if (!validators.has(key)) validators.set(key, ajv.compile({ ...schema, components: spec.components }));
  const check = validators.get(key);
  assert.ok(check(value), `${label}: ${JSON.stringify(check.errors)}`);
}
const directory = await mkdtemp(join(tmpdir(), "sixteen-openapi-"));
const config = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url)));
const administrator = "synthetic-administrator-key-for-local-openapi-tests";
const covered = new Set();
let runtime;
let outbound = 0;
try {
  const scriptPath = join(directory, "worker.js");
  await build({
    entryPoints: [fileURLToPath(new URL("./fixtures/v010/index.ts", import.meta.url))],
    outfile: scriptPath, bundle: true, format: "esm", platform: "neutral",
    target: "es2022", keepNames: true, external: ["cloudflare:workers", "node:crypto"], logLevel: "silent",
  });
  runtime = new Miniflare({
    ...convertV4MiniflareOptions({
      modules: true, scriptPath, modulesRoot: dirname(scriptPath),
      compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
      bindings: { ...config.vars, PROJECT_ID: "openapi-validation", ADMIN_KEY: administrator },
      serviceBindings: { ASSETS: () => new Response("local fixture") },
      durableObjects: { PROJECTS: { className: "MemoryProject", useSQLite: true } },
      ratelimits: Object.fromEntries(config.ratelimits.map(({ name, ...value }) => [name, value])),
      outboundService: () => { outbound++; return new Response("Provider calls forbidden", { status: 503 }); },
    }),
    resourcePersistencePath: join(directory, "state"),
  });
  const fetch = async (url, init = {}) => {
    const response = await runtime.dispatchFetch(url, {
      ...init, headers: { ...init.headers, "CF-Connecting-IP": crypto.randomUUID() },
    });
    const pathname = new URL(url).pathname;
    const path = Object.keys(spec.paths).find(path => new RegExp("^" + path.replace("{id}", "[^/]+") + "$").test(pathname));
    assert.ok(path, `Undocumented route ${pathname}`);
    const method = (init.method ?? "GET").toLowerCase();
    const operation = spec.paths[path][method];
    assert.ok(operation, `Undocumented method ${method} ${path}`);
    const result = await response.clone().json();
    const schema = operation.responses[response.status]?.content["application/json"].schema;
    assert.ok(schema, `Undocumented status ${response.status}: ${operation.operationId}`);
    validate(schema, result, `${operation.operationId} ${response.status}`);
    if (response.ok) {
      covered.add(operation.operationId);
      if (init.body) validate(operation.requestBody.content["application/json"].schema, JSON.parse(init.body), operation.operationId + " input");
    }
    return response;
  };
  const baseUrl = "https://memory.example";
  const admin = new SixteenMemory({ baseUrl, apiKey: administrator, fetch });
  assert.equal((await admin.health()).version, "0.1.0");
  assert.equal((await admin.me()).role, "admin");
  const writer = await admin.createKey({ name: "Writer", role: "write", user_id: "alice" });
  const reader = await admin.createKey({ name: "Reader", role: "read", user_id: "alice" });
  const client = new SixteenMemory({ baseUrl, apiKey: writer.key, fetch });
  const readonly = new SixteenMemory({ baseUrl, apiKey: reader.key, fetch });
  const source = { type: "manual", ref: "synthetic", text: "Prefers concise replies.", observed_at: "2026-11-01T00:00:00Z" };
  const input = { request_id: "first", user_id: "alice", content: source.text, source };
  const saved = await client.add(input);
  assert.equal(saved.expires_at, null);
  assert.equal((await client.add(input)).id, saved.id);
  const rejects = async (promise, code, status) => assert.rejects(promise, error => error instanceof MemoryApiError && error.code === code && error.status === status);
  await rejects(client.add({ ...input, content: "Different" }), "idempotency_conflict", 409);
  await rejects(readonly.add({ ...input, request_id: "readonly" }), "read_only", 403);
  await rejects(client.search({ query: "replies", user_id: "bob" }), "not_found", 404);
  await rejects(client.search({ query: "replies", limit: 51 }), "invalid_limit", 422);
  await rejects(client.add({ request_id: "missing-source" }), "invalid_field", 422);
  assert.equal((await client.get(saved.id)).id, saved.id);
  assert.equal((await client.search({ query: "concise" })).data[0].id, saved.id);
  assert.deepEqual((await client.search({ query: "!!!" })).data, []);
  assert.equal((await readonly.list()).data[0].id, saved.id);
  let changed = await client.update(saved.id, { content: "Detailed replies.", source, reason: "Correction", expected_version: saved.version });
  await rejects(client.delete(saved.id, saved.version), "version_conflict", 409);
  assert.equal((await client.history(saved.id)).length, 2);
  changed = await client.revoke(saved.id, changed.version, "User request");
  assert.equal((await client.search({ query: "Detailed" })).data.length, 0);
  assert.equal((await client.list({ status: "revoked" })).data[0].id, saved.id);
  assert.equal((await client.exportPage()).data[0].id, saved.id);
  assert.equal((await client.delete(saved.id, changed.version)).backup_cleanup_confirmed, false);
  await rejects(client.get(saved.id), "not_found", 404);
  await rejects(client.add(input), "memory_deleted", 410);
  await rejects(client.answer({ query: "replies" }), "model_not_configured", 503);
  // Provider-dependent success is schema-checked with synthetic data, never a paid request.
  validate(spec.paths["/v1/answer"].post.responses[200].content["application/json"].schema,
    { answer: "Synthetic answer", memories: [], usage: null, model: "fixture" }, "answer synthetic");
  for (let i = 0; i < 51; i++) await client.add({ ...input, request_id: `page-${i}` });
  const first = await client.list();
  assert.equal(first.data.length, 50);
  assert.ok(first.next_cursor);
  const last = await client.list({ cursor: first.next_cursor });
  assert.equal(last.data.length, 1);
  assert.equal(last.next_cursor, null);
  assert.ok(!first.data.some(row => row.id === last.data[0].id));
  assert.equal((await admin.keys()).length, 2);
  assert.ok((await admin.requests()).length > 0);
  const login = await fetch(baseUrl + "/v1/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: writer.key }) });
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal((await fetch(baseUrl + "/v1/me", { headers: { Cookie: cookie } })).status, 200);
  assert.equal((await fetch(baseUrl + "/v1/session", { method: "DELETE", headers: { Cookie: cookie } })).status, 200);
  await admin.revokeKey(reader.record.id);
  await rejects(readonly.me(), "invalid_key", 401);
  const operations = Object.values(spec.paths).flatMap(path => Object.entries(path).filter(([method]) => ["get", "post", "patch", "delete"].includes(method)).map(([, operation]) => operation.operationId));
  assert.deepEqual(operations.filter(id => !covered.has(id)), ["answer"]);
  assert.equal(outbound, 0);
  console.log(JSON.stringify({ status: "passed", runtime_operations: covered.size, provider_dependent_success: "schema-only", pagination: "50 + 1", outbound_calls: outbound }));
} finally {
  await runtime?.dispose();
  await rm(directory, { recursive: true, force: true });
}
