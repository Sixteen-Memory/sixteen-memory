/**
 * Local-only, bounded real-provider pilot. Never imported by the product Worker.
 * Reads a private config path supplied by the operator; no provider hostname,
 * real model ID or credential is copied into product bindings or public artifacts.
 */
import assert from "node:assert/strict";
import { readFile, writeFile, appendFile, mkdir, lstat } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

const configPath = process.env.PRIVATE_TEST_CONFIG;
if (!configPath || process.env.PRIVATE_TEST_APPROVED !== "yes") throw Error("Private config and explicit local-test approval required");
const permissions = await lstat(configPath);
if (!permissions.isFile() || permissions.isSymbolicLink() || (permissions.mode & 0o077)) throw Error("Private config must be a regular 0600 file");
const config = JSON.parse(await readFile(configPath, "utf8"));
const endpoint = new URL(config.endpoint);
if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw Error("Approved HTTPS endpoint required; credentials must never appear in URLs");
const secretStat = await lstat(config.credential_file);
if (!secretStat.isFile() || secretStat.isSymbolicLink() || (secretStat.mode & 0o077)) throw Error("Credential source must be a regular private file");
const lines = (await readFile(config.credential_file, "utf8")).split("\n");
const line = lines.find(l => l.startsWith(config.credential_field + "="));
const key = line?.slice(config.credential_field.length + 1).trim().replace(/^['"]|['"]$/g, "");
if (!key) throw Error("Credential missing");
const maxCalls = Number(config.pilot_max_calls ?? 7);
if (!Number.isSafeInteger(maxCalls) || maxCalls < 1 || maxCalls > 7) throw Error("Pilot cap is at most 7 additional requests");
const output = resolve(dirname(configPath), "pilot-" + new Date().toISOString().replace(/[:.]/g, "-"));
await mkdir(output, { recursive: true, mode: 0o700 });
await writeFile(join(output, "RUN_LOCK"), "no implicit resume\n", { flag: "wx", mode: 0o600 });
const runtime = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const owner = randomBytes(32).toString("hex");
let stopped = false; let calls = 0; let stage = "setup";
const ledger = []; const steps = []; const jobs = [];
const inputAt = "2026-11-01T09:00:00.000Z";
const changedAt = "2026-11-02T09:00:00.000Z";
const checkedAt = "2026-11-03T09:00:00.000Z";
const alias = "private-local-test-model";
function redacted(error) {
  let message = String(error?.message ?? error);
  for (const value of [key, config.endpoint, config.model, config.credential_file]) message = message.split(value).join("[private]");
  return message.replace(/https?:\/\/\S+/g, "[endpoint]").slice(0, 600);
}
async function transport(request) {
  const url = new URL(request.url);
  if (url.origin !== "https://private-test.invalid" || url.pathname !== "/v1/chat/completions") throw Error("Unexpected test outbound destination; embeddings unavailable");
  if (stopped || calls >= maxCalls) throw Error("Pilot budget exhausted or previous failure; no retries");
  const body = await request.json();
  if (body.model !== alias) throw Error("Unexpected model alias");
  body.model = config.model;
  body.stream = false;
  // Match an operator-approved provider profile without guessing model support.
  if (config.omit_temperature) delete body.temperature;
  const started = Date.now();
  const event = { call: ++calls, stage, started_at: new Date().toISOString(),
    request_sha256: createHash("sha256").update(JSON.stringify(body)).digest("hex"),
    max_output_tokens: body.max_tokens ?? body.max_completion_tokens };
  await appendFile(join(output, "requests.started.jsonl"), JSON.stringify(event) + "\n", { mode: 0o600 });
  try {
    const response = await fetch(endpoint, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(config.timeout_ms ?? 60000),
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json", "X-TT-LOGID": "sixteen-private-" + randomBytes(8).toString("hex") }, body: JSON.stringify(body) });
    const raw = await response.text();
    event.status = response.status;
    event.duration_ms = Date.now() - started;
    if (raw.includes(key)) throw Error("Credential echo");
    if (!response.ok) throw Error("Provider HTTP " + response.status);
    const value = JSON.parse(raw);
    event.model_matches = value.model === config.model || config.allowed_model_ids?.includes(value.model) === true;
    if (!event.model_matches) throw Error("Returned model differs from the explicitly approved model");
    event.finish_reason = value.choices?.[0]?.finish_reason;
    if (event.finish_reason !== "stop") throw Error("Incomplete provider output");
    event.usage = value.usage ?? null;
    const content = value.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) throw Error("Missing final content");
    if (body.response_format?.type === "json_object") JSON.parse(content);
    // Keep actual output private for case review; exact provider/model/config never
    // enters logs or the local Worker return value.
    await writeFile(join(output, `response-${calls}.json`), JSON.stringify({ ...event, content }, null, 2), { mode: 0o600 });
    ledger.push(event);
    return Response.json({ model: alias, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content } }], usage: value.usage ?? null });
  } catch (error) {
    stopped = true; event.duration_ms = Date.now() - started; event.error = redacted(error); ledger.push(event);
    return Response.json({ error: { code: "private_pilot_failed", message: event.error } }, { status: 502 });
  }
}
const mf = new Miniflare({
  ...convertV4MiniflareOptions({ workers: [{ name: "private-pilot", modules: true, scriptPath: fileURLToPath(new URL("../dist-worker/index.js", import.meta.url)),
    compatibilityDate: runtime.compatibility_date, compatibilityFlags: runtime.compatibility_flags,
    bindings: { ...runtime.vars, ADMIN_KEY: owner, PROJECT_ID: "private-pilot",
      EXTRACTION_ENABLED: "true", EXTRACTION_BASE_URL: "https://private-test.invalid/v1", EXTRACTION_MODEL: alias, EXTRACTION_API_KEY: "local-placeholder-not-a-secret",
      EMBEDDINGS_ENABLED: "false", MODEL_BASE_URL: "https://private-test.invalid/v1", MODEL_NAME: alias, MODEL_API_KEY: "local-placeholder-not-a-secret" },
    durableObjects: { PROJECTS: { className: "MemoryProject", useSQLite: true } },
    serviceBindings: { ASSETS: () => new Response("") },
    ratelimits: Object.fromEntries(runtime.ratelimits.map(({name,...v})=>[name,v])),
    outboundService: transport,
  }] }), resourcePersistencePath: join(output, "sqlite"),
});
async function api(path, body, method = "POST") {
  const response = await mf.dispatchFetch("https://pilot.local" + path, { method, headers: { Authorization: "Bearer " + owner, "Content-Type": "application/json", "CF-Connecting-IP": randomBytes(8).toString("hex") }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json();
  if (!response.ok) throw Error(value.error?.code ?? `HTTP ${response.status}`);
  return value;
}
const input = (request_id, content, observed_at, assistant) => ({
  user_id: "synthetic-pilot-user", request_id, ref: request_id, observed_at, mode: "auto",
  messages: [{ id: "m1", role: "user", content }, ...(assistant ? [{id:"m2",role:"assistant",content:assistant}] : [])],
});
let result = { status: "incomplete", real_model_calls: 0, retries: 0, embeddings: "not_tested_no_configuration", mem0_comparison: "not_run", tests: steps };
try {
  stage = "first-extraction";
  const first = await api("/v1/ingestions", input("synthetic-first", "我目前住在杭州。后续请一直用中文与我沟通。", inputAt));
  jobs.push(first);
  await writeFile(join(output,"jobs.json"),JSON.stringify(jobs,null,2),{mode:0o600});
  assert.equal(first.state, "applied", "First extraction requires human review; do not auto-approve");
  const firstRows = (await api("/v1/memories?user_id=synthetic-pilot-user", null, "GET")).data;
  assert.ok(firstRows.some(m => m.content.includes("杭州")));
  assert.ok(firstRows.some(m => m.content.includes("中文")));
  steps.push({ name:"extract-city-and-language", status:"passed", memories:firstRows.length });
  const beforeRepeat = calls;
  await api("/v1/ingestions", input("synthetic-first", "我目前住在杭州。后续请一直用中文与我沟通。", inputAt));
  assert.equal(calls,beforeRepeat);steps.push({name:"idempotent-replay-no-model",status:"passed"});
  stage = "change-of-fact";
  const change = await api("/v1/ingestions", input("synthetic-change", "地址更新：我已经从杭州搬到南京，现在住在南京。", changedAt));
  jobs.push(change);await writeFile(join(output,"jobs.json"),JSON.stringify(jobs,null,2),{mode:0o600});
  if (change.state === "review") {
    // A review is evidence of safe withholding, NOT proof of automatic replacement.
    assert.equal(change.results.length,0);
    assert.ok(change.proposal.decisions.some(d=>d.needs_review));
    steps.push({name:"change-held-for-review",status:"passed",automatic_replacement:"not_passed"});
    result.status = "partial";
    result.automatic_replacement = "requires_review";
    result.answer_model_test = "not_run_after_review";
    result.assistant_claim_test = "not_run_after_review";
    throw Error("SAFE_REVIEW_REQUIRED");
  }
  assert.equal(change.state,"applied","Unexpected ingestion state");
  const rows = (await api("/v1/memories?user_id=synthetic-pilot-user", null, "GET")).data;
  const changed = rows.find(m=>m.content.includes("南京"));
  assert.ok(changed,"No updated city found");
  const cityHistory = await api(`/v1/memories/${changed.id}/history`,null,"GET");
  assert.ok(cityHistory.some(h=>h.content.includes("杭州")),"Prior city must remain in history, not disappear");
  assert.ok(!rows.some(m=>m.id!==changed.id&&m.content.includes("住在杭州")),"Stale current city remains active");
  steps.push({name:"new-city-current-old-city-history",status:"passed",version:changed.version});
  if (config.scope === "extraction-and-update") {
    const found = await api("/v1/search",{user_id:"synthetic-pilot-user",query:"住在 沟通 中文",mode:"lexical",limit:10});
    assert.ok(found.data.some(m=>m.content.includes("南京")));
    assert.ok(found.data.some(m=>m.content.includes("中文")));
    steps.push({name:"cross-session-lexical-recall",status:"passed"});
    result.answer_model_test = "not_run_budget";
    result.assistant_claim_test = "not_run_budget";
    await writeFile(join(output,"final-memories.json"),JSON.stringify(rows,null,2),{mode:0o600});
    result.status = "passed";
  } else {
  stage = "unsupported-assistant-claim";
  const uncertain = await api("/v1/ingestions", input("synthetic-refund","我申请了退款，但还没有收到业务系统的完成确认。",checkedAt,"退款已经完成了。"));
  jobs.push(uncertain);await writeFile(join(output,"jobs.json"),JSON.stringify(jobs,null,2),{mode:0o600});
  const all = (await api("/v1/memories?user_id=synthetic-pilot-user",null,"GET")).data;
  const claim = all.filter(m=>m.content.includes("退款"));
  assert.ok(!claim.some(m=>/退款(?:已经|已)完成/.test(m.content)&&!/(未|没有|尚|不|无法|不能)/.test(m.content)),"Unsupported assistant outcome stored");
  steps.push({name:"assistant-not-business-evidence",status:"passed",ingest_state:uncertain.state,refund_memories:claim.length});
  stage = "evidence-based-answer";
  const answer = await api("/v1/answer",{user_id:"synthetic-pilot-user",query:"我现在住在哪个城市？应当用什么语言和我沟通？",mode:"lexical",limit:10});
  assert.ok(answer.answer.includes("南京")); assert.ok(answer.answer.includes("中文"));
  steps.push({name:"cross-session-answer",status:"passed",answer:answer.answer});
  await writeFile(join(output,"final-memories.json"),JSON.stringify(all,null,2),{mode:0o600});
  result.status = "passed";
  }
} catch (error) {
  if (error.message !== "SAFE_REVIEW_REQUIRED") { result.error = redacted(error); result.failed_stage = stage; process.exitCode = 1; }
} finally {
  // Bound local cleanup only; no production data or credentials are read.
  const cleanup = [];
  try {
    const rows = (await api("/v1/memories?user_id=synthetic-pilot-user",null,"GET")).data;
    for(const row of rows) { await api(`/v1/memories/${row.id}`,{expected_version:row.version},"DELETE");cleanup.push(row.id); }
    result.synthetic_memories_remaining=(await api("/v1/memories?user_id=synthetic-pilot-user",null,"GET")).data.length;
  } catch(error) {result.cleanup_error=redacted(error);}
  await mf.dispose();
  result={...result,real_model_calls:calls,ledger,deleted_local_records:cleanup.length,output};
  await writeFile(join(output,"report.json"),JSON.stringify(result,null,2),{mode:0o600});
  console.log(JSON.stringify(result,null,2));
}
