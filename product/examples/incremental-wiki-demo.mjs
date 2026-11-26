/**
 * Zero-API-key end-to-end demonstration of SixteenMemory v0.3:
 * 1. Explicit source-linked memories with verbatim evidence
 * 2. Incremental source-linked Wiki generation (deterministic local fixture provider)
 * 3. Source update -> selective stale invalidation (zero stale claims leaked; unrelated page stays live)
 * 4. Multi-source conflict preservation (both cited reports preserved for review)
 * 5. Scoped read-only MCP client verification over Streamable HTTP (/v1/mcp)
 *
 * Runs locally against real Cloudflare Worker + SQLite Durable Object via Miniflare.
 * Uses zero network calls, zero paid model keys, and cleans up temporary SQLite state.
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const productDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workerBundle = join(productDir, "dist-worker/index.js");
if (!existsSync(workerBundle)) {
  console.error("Worker bundle missing. Run `npm run build:product` first.");
  process.exit(1);
}

const folder = await mkdtemp(join(tmpdir(), "sixteen-demo-"));
const config = JSON.parse(await readFile(join(productDir, "wrangler.jsonc"), "utf8"));
const adminKey = "demo-admin-" + crypto.randomUUID();
const userId = "demo-dev";

let fixturePlan = { pages: [], edges: [] };
const fixtureProvider = async (request) => {
  const body = await request.json();
  const input = JSON.parse(body.messages[1].content);
  const value = input.items
    ? { supported: input.items.map(() => true) }
    : {
        pages: fixturePlan.pages.map((page) => ({
          slug: page.slug,
          title: page.title,
          claims: page.sources.map((sourceId) => {
            const src = input.sources.find((item) => item.id === sourceId && item.role !== "assistant");
            assert.ok(src, `Expected source ${sourceId} in organization input`);
            return {
              text: src.text,
              citations: [{ source_key: src.key, quote: src.text }],
              ...(page.conflict ? { status: "conflicted", conflict_group: page.conflict } : {}),
            };
          }),
        })),
        edges: fixturePlan.edges,
      };
  return Response.json({
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(value) } }],
  });
};

const mf = new Miniflare({
  ...convertV4MiniflareOptions({
    workers: [
      {
        name: "sixteen-demo",
        modules: true,
        scriptPath: workerBundle,
        compatibilityDate: config.compatibility_date,
        compatibilityFlags: config.compatibility_flags,
        bindings: {
          ...config.vars,
          PROJECT_ID: "demo",
          ADMIN_KEY: adminKey,
          EXTRACTION_ENABLED: "true",
          EXTRACTION_BASE_URL: "https://fixture.local/v1",
          EXTRACTION_MODEL: "local-fixture",
          EXTRACTION_API_KEY: "demo-fixture-only",
        },
        durableObjects: { PROJECTS: { className: "MemoryProject", useSQLite: true } },
        ratelimits: Object.fromEntries(config.ratelimits.map(({ name, ...rest }) => [name, rest])),
        serviceBindings: { ASSETS: () => new Response("") },
        outboundService: fixtureProvider,
      },
    ],
  }),
  resourcePersistencePath: folder,
});

const api = async (method, path, body, key = adminKey) => {
  const res = await mf.dispatchFetch("https://demo.local" + path, {
    method,
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      "CF-Connecting-IP": "127.0.0.1",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} -> HTTP ${res.status}: ${JSON.stringify(json)}`);
  return json;
};

const makeSource = (ref, text) => ({
  type: "conversation",
  ref,
  text,
  observed_at: "2026-11-26T09:00:00Z",
});

// Thin loopback bridge so the official MCP StreamableHTTP client talks to Miniflare over real HTTP.
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  }
  const upstream = await mf.dispatchFetch(`http://127.0.0.1${req.url}`, {
    method: req.method,
    headers,
    body,
  });
  res.writeHead(upstream.status, Object.fromEntries(upstream.headers.entries()));
  res.end(Buffer.from(await upstream.arrayBuffer()));
});

let mcp;
try {
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log("\n=== SixteenMemory v0.3 Zero-Key Demo (Worker + SQLite DO + MCP) ===\n");

  // 1. Write two source-linked memories
  const deployMem = await api("POST", "/v1/memories", {
    user_id: userId,
    request_id: "demo-mem-deploy-1",
    content: "Production deployments require manual owner approval.",
    source: makeSource("session-101", "Production deployments require manual owner approval."),
  });
  const editorMem = await api("POST", "/v1/memories", {
    user_id: userId,
    request_id: "demo-mem-editor-1",
    content: "Prefers concise diffs with clickable file paths.",
    source: makeSource("session-102", "Prefers concise diffs with clickable file paths."),
  });
  console.log("1) Stored 2 source-linked memories:");
  console.log(`   - ${deployMem.id} (v${deployMem.version}): "${deployMem.content}"`);
  console.log(`   - ${editorMem.id} (v${editorMem.version}): "${editorMem.content}"`);

  // 2. Build two independent source-linked Wiki pages
  fixturePlan = {
    pages: [
      { slug: "deployment-policy", title: "Deployment Policy", sources: [deployMem.id] },
      { slug: "developer-preferences", title: "Developer Preferences", sources: [editorMem.id] },
    ],
    edges: [],
  };
  const run1 = await api("POST", "/v1/knowledge/organize", {
    user_id: userId,
    request_id: "demo-org-initial",
    memory_ids: [deployMem.id, editorMem.id],
    mode: "auto",
  });
  assert.equal(run1.state, "applied");
  const wikiBefore = await api("GET", `/v1/wiki?user_id=${userId}`);
  assert.equal(wikiBefore.data.length, 2);
  console.log(`\n2) Published ${wikiBefore.data.length} source-linked Wiki pages: ${wikiBefore.data.map((p) => p.slug).join(", ")}`);

  // 3. Update deployment policy (v1 -> v2) and verify selective invalidation
  const updatedDeploy = await api("PATCH", `/v1/memories/${deployMem.id}`, {
    expected_version: deployMem.version,
    content: "Production deployments require signed tags and two reviewers.",
    source: makeSource("session-105", "Production deployments require signed tags and two reviewers."),
    reason: "Security policy update",
  });
  const wikiAfterEdit = await api("GET", `/v1/wiki?user_id=${userId}`);
  assert.deepEqual(wikiAfterEdit.data.map((p) => p.slug), ["developer-preferences"]);
  assert.deepEqual(wikiAfterEdit.stale.map((p) => p.slug), ["deployment-policy"]);
  assert.equal(wikiAfterEdit.stale[0].claims, undefined);
  console.log(`\n3) Updated ${deployMem.id} (v${deployMem.version} -> v${updatedDeploy.version}):`);
  console.log(`   - Unrelated page STILL LIVE: ${wikiAfterEdit.data.map((p) => p.slug).join(", ")}`);
  console.log(`   - Dependent page MARKED STALE (0 stale claims leaked): ${wikiAfterEdit.stale.map((p) => p.slug).join(", ")}`);

  // 4. Introduce a conflicting report and rebuild ONLY deployment-policy for review
  const conflictMem = await api("POST", "/v1/memories", {
    user_id: userId,
    request_id: "demo-mem-deploy-conflict",
    content: "Hotfix deployments may proceed with one on-call reviewer.",
    source: makeSource("session-106", "Hotfix deployments may proceed with one on-call reviewer."),
  });
  fixturePlan = {
    pages: [
      {
        slug: "deployment-policy",
        title: "Deployment Policy",
        sources: [updatedDeploy.id, conflictMem.id],
        conflict: "deploy-reviewers",
      },
    ],
    edges: [],
  };
  const conflictRun = await api("POST", "/v1/knowledge/organize", {
    user_id: userId,
    request_id: "demo-org-conflict-rebuild",
    target_slugs: ["deployment-policy"],
    memory_ids: [updatedDeploy.id, conflictMem.id],
    mode: "auto",
  });
  assert.equal(conflictRun.state, "review");
  console.log(`\n4) Conflicting source added -> targeted rebuild stopped in "${conflictRun.state}" state:`);
  console.log(`   - Preserved ${conflictRun.proposal.pages[0].claims.length} cited conflicting claims (never silently overwritten).`);

  // 5. Connect an official MCP client with a read-only user-scoped key
  const readKey = (await api("POST", "/v1/keys", { name: "mcp-reader", role: "read", user_id: userId })).key;
  mcp = new Client({ name: "sixteen-demo-agent", version: "0.3.0" });
  await mcp.connect(
    new StreamableHTTPClientTransport(new URL(`${baseUrl}/v1/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${readKey}` } },
    })
  );
  const tools = await mcp.listTools();
  const wikiListRaw = await mcp.callTool({ name: "list_wiki", arguments: {} });
  const { data: wikiList } = JSON.parse(wikiListRaw.content[0].text);
  assert.deepEqual(wikiList.data.map((p) => p.slug), ["developer-preferences"]);
  assert.deepEqual(wikiList.stale.map((p) => p.slug), ["deployment-policy"]);
  assert.ok(!wikiListRaw.content[0].text.includes("manual owner approval"));
  console.log(`\n5) Verified live MCP (/v1/mcp) with read-only scoped key (${tools.tools.length} tools exposed):`);
  console.log(`   - MCP list_wiki -> current: [${wikiList.data.map((p) => p.slug)}], stale metadata: [${wikiList.stale.map((p) => p.slug)}]`);
  console.log("   - Verified zero outdated claims leaked into agent context.\n");
} finally {
  if (mcp) await mcp.close().catch(() => undefined);
  await new Promise((resolveClose) => server.close(resolveClose));
  await mf.dispose();
  await rm(folder, { recursive: true, force: true });
}
