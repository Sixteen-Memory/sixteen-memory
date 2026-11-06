import { readFile, mkdir, writeFile, appendFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { answerPrompt, boundedContext, digest, score, summarize } from "./core.mjs";
import { fixtureFetch, smokeDataset } from "./fixture-provider.mjs";

// Default is preflight only: no remote calls, no fabricated benchmark results.
const inputFile = process.env.EVAL_DATASET ?? fileURLToPath(new URL("./fixtures.json", import.meta.url));
const simulate = process.argv.includes("--pipeline-smoke");
if (simulate) Object.assign(process.env, {
  EXTRACTION_BASE_URL:"https://fixture.test/v1",EXTRACTION_MODEL:"fixture",EXTRACTION_API_KEY:"synthetic",
  EMBEDDING_BASE_URL:"https://fixture.test/v1",EMBEDDING_MODEL:"fixture",EMBEDDING_API_KEY:"synthetic",
  EVAL_ANSWER_BASE_URL:"https://fixture.test/v1",EVAL_ANSWER_MODEL:"fixture",EVAL_ANSWER_API_KEY:"synthetic",
  EVAL_MAX_CALLS:"80",EVAL_APPROVED:"yes",
  EMBEDDING_PROVIDER:"openai-compatible",EMBEDDING_API_STYLE:"openai-compatible",EMBEDDING_DIMENSIONS:"4",
});
const dataset = simulate ? smokeDataset : JSON.parse(await readFile(inputFile, "utf8"));
if (dataset.schema !== 1 || !Array.isArray(dataset.cases) || dataset.cases.length > 50) throw Error("Invalid dataset");
const runtime = JSON.parse(await readFile(new URL("../wrangler.jsonc", import.meta.url), "utf8"));
const required = ["EXTRACTION_BASE_URL","EXTRACTION_MODEL","EXTRACTION_API_KEY","EMBEDDING_BASE_URL","EMBEDDING_MODEL","EMBEDDING_API_KEY","EVAL_ANSWER_BASE_URL","EVAL_ANSWER_MODEL","EVAL_ANSWER_API_KEY","EVAL_MAX_CALLS"];
const missing = required.filter(key => !process.env[key]);
const embeddingProfile = {
  EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER || runtime.vars.EMBEDDING_PROVIDER,
  EMBEDDING_API_STYLE: process.env.EMBEDDING_API_STYLE || runtime.vars.EMBEDDING_API_STYLE,
  EMBEDDING_DIMENSIONS: process.env.EMBEDDING_DIMENSIONS || runtime.vars.EMBEDDING_DIMENSIONS,
  EMBEDDING_REVISION: process.env.EMBEDDING_REVISION || runtime.vars.EMBEDDING_REVISION,
};
const embeddingDimensions = Number(embeddingProfile.EMBEDDING_DIMENSIONS);
if (!Number.isSafeInteger(embeddingDimensions) || embeddingDimensions < 1 || embeddingDimensions > 2048) throw Error("Invalid evaluation embedding dimensions");
if (embeddingProfile.EMBEDDING_API_STYLE !== "openai-compatible") throw Error("Paired Mem0 evaluation currently requires the same OpenAI-compatible embedding protocol on both sides");
const groups = ["no-memory", "recent", "lexical", "sixteen", "mem0-oss"];
const temperature = process.env.EVAL_TEMPERATURE === undefined ? null : Number(process.env.EVAL_TEMPERATURE);
if (temperature !== null && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) throw Error("Invalid explicitly configured EVAL_TEMPERATURE");
const protocol = {
  dataset: dataset.name, dataset_sha256: digest(dataset), groups, mem0_version: "3.3.1",
  extraction_model: process.env.EXTRACTION_MODEL ?? null, embedding_model: process.env.EMBEDDING_MODEL ?? null,
  answer_model: process.env.EVAL_ANSWER_MODEL ?? null, context_chars: 6000, retrieval_limit: 10,
  answer_max_tokens: 500, temperature, scorer: "substring diagnostic; human audit required",
  embedding_profile: embeddingProfile,
  missing, status: missing.length ? "blocked" : "ready", evidence: "not_run", warnings: ["Synthetic development fixtures are not an independent quality benchmark.", "Mem0 OSS and Platform are different; this protocol does not evaluate Mem0 Platform."],
};
const output = process.env.EVAL_OUTPUT ?? join("output", "eval", new Date().toISOString().replace(/[:.]/g, "-"));
await mkdir(output, { recursive: true });
if (process.argv.includes("--execute") || simulate) await writeFile(join(output, "RUN_LOCK"), new Date().toISOString(), { flag: "wx" });
await writeFile(join(output, "preflight.json"), JSON.stringify(protocol, null, 2));
if (!process.argv.includes("--execute") && !simulate) { console.log(JSON.stringify(protocol, null, 2)); process.exit(0); }
if (missing.length || process.env.EVAL_APPROVED !== "yes") throw Error("Real evaluation blocked: set approved endpoints/keys, call ceiling, and EVAL_APPROVED=yes");
const maxCalls = Number(process.env.EVAL_MAX_CALLS);
if (!Number.isSafeInteger(maxCalls) || maxCalls < 1 || maxCalls > 500) throw Error("EVAL_MAX_CALLS must be 1..500");
const originalFetch = globalThis.fetch;
const nativeFetch = simulate ? fixtureFetch : originalFetch;
const allowed = new Set([process.env.EXTRACTION_BASE_URL, process.env.EMBEDDING_BASE_URL, process.env.EVAL_ANSWER_BASE_URL].map(base => {
  const url = new URL(base); if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw Error("HTTPS provider roots required");
  return url.origin;
}));
let calls = 0; let activeGroup = "setup"; let stopped = false; let failed = false;
const modelUsage = [];
async function gatedFetch(input, init) {
  const request = new Request(input, init);
  if (!allowed.has(new URL(request.url).origin)) throw Error("Unapproved external destination");
  const body = await request.clone().text();
  let wireBody = body;
  if (new URL(request.url).pathname.endsWith("/chat/completions")) {
    const parsed = JSON.parse(body);
    if (temperature === null) delete parsed.temperature; else parsed.temperature = temperature;
    wireBody = JSON.stringify(parsed);
  }
  const key = activeGroup + ":" + digest({ url: request.url, body: wireBody });
  if (stopped || calls >= maxCalls) throw Error("Call ceiling or failed provider; no automatic retries");
  calls++;
  const started = Date.now();
  const response = await nativeFetch(request.url, { method: request.method, headers: request.headers, body: wireBody, signal: AbortSignal.timeout(30000), redirect: "manual" }).catch(error => { stopped = true; throw error; });
  if (!response.ok) stopped = true;
  let usage = null;
  try { usage = (await response.clone().json()).usage ?? null; } catch {}
  const event = { group: activeGroup, request_hash: key, status: response.status, duration_ms: Date.now() - started, usage };
  modelUsage.push(event); await appendFile(join(output, "provider-usage.jsonl"), JSON.stringify(event) + "\n");
  return response;
}
globalThis.fetch = gatedFetch;
process.env.MEM0_TELEMETRY = "false";
await import("openai/shims/web");
const { Memory } = await import("mem0ai/oss");
const root = randomBytes(32).toString("hex");
const bindings = { ...runtime.vars, ...embeddingProfile, ...Object.fromEntries(required.filter(k => !k.startsWith("EVAL_")).map(k => [k, process.env[k]])), EXTRACTION_ENABLED: "true", EMBEDDINGS_ENABLED: "true", ADMIN_KEY: root };
const mf = new Miniflare({
  ...convertV4MiniflareOptions({ workers: [{ name: "evaluation", modules: true, scriptPath: fileURLToPath(new URL("../dist-worker/index.js", import.meta.url)),
    compatibilityDate: runtime.compatibility_date, compatibilityFlags: runtime.compatibility_flags,
    bindings, durableObjects: { PROJECTS: { className: "MemoryProject", useSQLite: true } },
    serviceBindings: { ASSETS: () => new Response("") },
    ratelimits: Object.fromEntries(runtime.ratelimits.map(({name,...v}) => [name,v])),
    outboundService: async request => {
      const response = await gatedFetch(request.url, { method: request.method, headers: Object.fromEntries(request.headers), body: await request.text() });
      return new Response(await response.arrayBuffer(), { status: response.status, headers: Object.fromEntries(response.headers) });
    },
  }] }), resourcePersistencePath: resolve(output, "worker-storage"),
});
async function api(path, body, method = "POST") {
  const response = await mf.dispatchFetch("https://eval.local" + path, { method, headers: { Authorization: "Bearer " + root, "Content-Type": "application/json", "CF-Connecting-IP": randomBytes(6).toString("hex") }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json(); if (!response.ok) throw Error(value.error?.code ?? "api_error"); return value;
}
const rows = [];
try {
  for (const task of dataset.cases) {
    const scope = task.id;
    if (!/^[A-Za-z0-9_-]+$/.test(scope)) throw Error("Unsafe case ID");
    const sourceOnly = task.batches; // Gold/required/forbidden never enter ingest or retrieval.
    const stamped = sourceOnly.map((batch,i) => batch.map(m => ({...m,content:`[Observation date: ${new Date(Date.parse("2026-11-01T09:00:00Z")+i*86400000).toISOString()}] ${m.content}`})));
    activeGroup = "lexical-ingest:" + scope;
    // Raw-message lexical baseline uses the same Worker FTS implementation in an isolated scope.
    for (let i = 0; i < stamped.flat().length; i++) {
      const message = stamped.flat()[i];
      await api("/v1/memories", { user_id: "lex_" + scope, request_id: `raw-${scope}-${i}`, content: `${message.role}: ${message.content}`,
        source: { type: "conversation", ref: `raw-${scope}-${i}`, text: message.content, observed_at: "2026-11-01T09:00:00Z" }, expires_at: null });
    }
    activeGroup = "mem0-setup:" + scope;
    const mem0 = new Memory({
      llm: { provider: "openai", config: { apiKey: process.env.EXTRACTION_API_KEY, baseURL: process.env.EXTRACTION_BASE_URL, model: process.env.EXTRACTION_MODEL, ...(temperature===null?{}:{temperature}), maxTokens: 3500 } },
      embedder: { provider: "openai", config: { apiKey: process.env.EMBEDDING_API_KEY, baseURL: process.env.EMBEDDING_BASE_URL, model: process.env.EMBEDDING_MODEL, embeddingDims: embeddingDimensions } },
      vectorStore: { provider: "memory", config: { collectionName: "eval_" + scope, dbPath: resolve(output, scope + ".db"), dimension: embeddingDimensions } },
      disableHistory: true,
    });
    await mem0.getAll({ filters: { user_id: scope } });
    activeGroup = "sixteen-ingest:" + scope;
    const start = Date.now();
    for (let i = 0; i < sourceOnly.length; i++) {
      const observed = new Date(Date.parse("2026-11-01T09:00:00Z") + i * 86400000).toISOString();
      const job = await api("/v1/ingestions", { user_id: scope, request_id: `${scope}-${i}`, ref: `${scope}-${i}`, observed_at: observed, mode: "auto", messages: stamped[i] });
      if (job.state !== "applied") throw Error("Review required: automated benchmark cannot pretend human approval");

    }
    await appendFile(join(output,"ingest.jsonl"),JSON.stringify({group:"sixteen",case:scope,duration_ms:Date.now()-start})+"\n");
    activeGroup = "mem0-ingest:" + scope;
    const mStart = Date.now();
    for (let i = 0; i < stamped.length; i++) await mem0.add(stamped[i], { userId: scope, metadata: { source: `${scope}-${i}` } });
    if (stopped) throw Error("A provider failure occurred during Mem0 ingestion; its partial result cannot be scored");
    await appendFile(join(output,"ingest.jsonl"),JSON.stringify({group:"mem0-oss",case:scope,duration_ms:Date.now()-mStart})+"\n");
    const raw = stamped.flat().map((m,i) => ({ id:`message-${i}`,content:`${m.role}: ${m.content}` }));
    for (let q = 0; q < task.queries.length; q++) for (const group of groups) {
      activeGroup = group + ":" + scope + ":" + q;
      const t = Date.now(); let memories = [];
      if (group === "recent") memories = raw.slice(-10).reverse();
      if (group === "lexical") memories = (await api("/v1/search", { user_id: "lex_" + scope, query: task.queries[q].query, mode: "lexical", limit: 10 })).data;
      if (group === "sixteen") memories = (await api("/v1/search", { user_id: scope, query: task.queries[q].query, mode: "hybrid", limit: 10 })).data;
      if (group === "mem0-oss") memories = (await mem0.search(task.queries[q].query, { filters: { user_id: scope }, topK: 10 })).results.map(m => ({ id:m.id,content:m.memory }));
      if (stopped) throw Error("A provider failure occurred during retrieval; partial result cannot be scored");
      const retrieval_ms = Date.now()-t;
      const context = boundedContext(memories, protocol.context_chars);
      const response = await gatedFetch(process.env.EVAL_ANSWER_BASE_URL.replace(/\/$/, "") + "/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + process.env.EVAL_ANSWER_API_KEY, "Content-Type":"application/json" }, body: JSON.stringify({
        model: process.env.EVAL_ANSWER_MODEL, ...(temperature===null?{}:{temperature}), max_tokens: 500,
        messages: [{role:"system",content:answerPrompt},{role:"user",content:JSON.stringify({question:task.queries[q].query,evidence:context.memories})}],
      }) });
      const answerData = await response.json();
      if (!response.ok || stopped) throw Error("Provider failed; result is missing, not scored");
      const answer = answerData.choices?.[0]?.finish_reason === "length" ? null : answerData.choices?.[0]?.message?.content ?? null;
      const row = {group,case:scope,query_index:q,context,answer,score:score(answer,task.queries[q]),retrieval_ms,duration_ms:Date.now()-t,usage:answerData.usage??null};
      rows.push(row); await appendFile(join(output,"answers.jsonl"),JSON.stringify(row)+"\n");
    }
  }
} catch (error) {
  failed = true;
  await writeFile(join(output,"failure.json"),JSON.stringify({message:error.message,group:activeGroup,calls},null,2));
  protocol.status = "incomplete"; process.exitCode = 1;
} finally {
  await mf.dispose(); globalThis.fetch = originalFetch;
  const expected = dataset.cases.reduce((n,c)=>n+c.queries.length*groups.length,0);
  const completeRows = [...rows];
  for (const task of dataset.cases) for (let q=0;q<task.queries.length;q++) for (const group of groups) {
    if (!rows.some(r=>r.case===task.id && r.query_index===q && r.group===group)) completeRows.push({group,case:task.id,query_index:q,score:{status:"missing",correct:null}});
  }
  await writeFile(join(output,"report.json"),JSON.stringify({ ...protocol, status: !failed && rows.length===expected?"completed":"incomplete", evidence:simulate?"simulated-pipeline-smoke-not-quality":"real-provider-run", expected, completed:rows.length,calls,real_model_calls:simulate?0:calls,
    summary:simulate?null:summarize(completeRows),reported_usage:simulate?null:modelUsage,estimated_usd:null, note:"No dollar cost is invented without provider prices. Missing results do not become zero scores. Simulated results are not quality evidence. Inspect answers and provenance manually." },null,2));
}
console.log(output);
