import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { convertV4MiniflareOptions, Miniflare } from "miniflare";

const temp = await mkdtemp(join(process.cwd(), ".local/sixteen-migration-"));
await mkdir(join(temp, "old"));

const baseline = process.env.MIGRATION_BASELINE ? resolve(process.env.MIGRATION_BASELINE) : "test/fixtures/v010/index.ts";
await build({ entryPoints: [baseline], bundle: true, platform: "neutral", format: "esm", target: "es2022", keepNames: true, external: ["cloudflare:workers", "node:crypto"], outfile: join(temp, "old.js") });
const config = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
const owner = "synthetic-migration-owner-12345678901234567890";
const make = scriptPath => new Miniflare({
  ...convertV4MiniflareOptions({ workers: [{ name: "migration", modules: true, scriptPath,
    compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
    bindings: { ...config.vars, ADMIN_KEY: owner }, serviceBindings: { ASSETS: () => new Response("") },
    durableObjects: { PROJECTS: { className: "MemoryProject", useSQLite: true } },
    ratelimits: Object.fromEntries(config.ratelimits.map(({name,...v})=>[name,v])),
  }] }), resourcePersistencePath: join(temp, "storage"),
});
let mf;
const call = async (path, body, method = "POST") => {
  const response = await mf.dispatchFetch("https://migration.test" + path, {method,headers:{Authorization:"Bearer "+owner,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal(response.status,200);return response.json();
};
try {
  mf = make(join(temp, "old.js"));
  const old = await call("/v1/memories", {user_id:"u",request_id:"old1",content:"升级前的原始数据",source:{type:"manual",ref:"fixture",text:"升级前的原始数据",observed_at:"2026-11-04T09:00:00Z"},expires_at:null});
  await mf.dispose();
  mf = make(join(process.cwd(), "dist-worker/index.js"));
  const migrated = await call(`/v1/memories/${old.id}`,null,"GET");
  assert.equal(migrated.content,old.content);assert.deepEqual(migrated.source,old.source);assert.equal(migrated.origin,"explicit");
  assert.deepEqual(migrated.metadata,{});assert.equal(migrated.category,null);assert.equal(migrated.event_time,null);
  assert.equal((await call(`/v1/memories/${old.id}/history`,null,"GET")).length,1);
  const updated = await call(`/v1/memories/${old.id}`,{...old,content:"升级后更新",expected_version:1,reason:"迁移检查"},"PATCH");
  assert.equal(updated.version,2);
  await call(`/v1/memories/${old.id}`,{expected_version:2},"DELETE");
  console.log(`PASS: ${process.env.MIGRATION_BASELINE ? "selected baseline" : "v0.1.0"} real SQLite state migrates to v0.2.1; source/history survive with attribute defaults and CRUD continues.`);
} finally { if(mf)await mf.dispose();await rm(temp,{recursive:true,force:true}); }
