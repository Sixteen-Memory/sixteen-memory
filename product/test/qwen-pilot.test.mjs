import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

test("Qwen preflight reads selected profile without leaking credentials and refuses unapproved execution", async () => {
  const dir = await mkdtemp(join(tmpdir(), "qwen-pilot-preflight-"));
  const credential = "synthetic-preflight-credential-never-send";
  const credentialFile = join(dir, "bailian.json");
  const configFile = join(dir, "settings.json");
  const settings = {
    bailian_config_file: credentialFile, profile: "synthetic",
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    text_model: "test-text", embedding_model: "test-embedding",
    embedding_dimensions: 1024, max_calls: 14, max_cost_cny: 0.1,
    text_input_per_million: 0.15, text_output_per_million: 1.5, embedding_input_per_million: 0.5,
  };
  const env = { ...process.env, QWEN_PILOT_CONFIG: configFile };
  delete env.QWEN_PILOT_APPROVED;
  delete env.QWEN_PILOT_APPROVED_MAX_COST_CNY;
  const run = (args = [], extra = {}) => spawnSync(process.execPath, [resolve("eval/qwen-provider-pilot.mjs"), ...args], { env: { ...env, ...extra }, encoding: "utf8", timeout: 20000 });
  try {
    await writeFile(credentialFile, JSON.stringify({ synthetic: { api_key: credential } }), { mode: 0o600 });
    await writeFile(configFile, JSON.stringify(settings), { mode: 0o600 });
    const ready = run();
    assert.equal(ready.status, 0, ready.stderr);
    assert.equal(JSON.parse(ready.stdout).status, "ready_pending_cost_approval");
    assert.ok(!(ready.stdout + ready.stderr).includes(credential));
    const output = JSON.parse(ready.stdout).output;
    assert.deepEqual(await readdir(output), ["preflight.json"]);
    assert.ok(!(await readFile(join(output, "preflight.json"), "utf8")).includes(credential));
    const denied = run(["--execute"]);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /explicit cost approval/);
    const mismatch = run(["--execute"], { QWEN_PILOT_APPROVED: "yes", QWEN_PILOT_APPROVED_MAX_COST_CNY: "1" });
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /exactly match/);
    await writeFile(configFile, JSON.stringify({ ...settings, base_url: "https://unapproved.example/v1" }), { mode: 0o600 });
    assert.notEqual(run().status, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Qwen local pilot runs the actual Worker through intercepted fixture responses, with no network", async () => {
  const dir = await mkdtemp(join(tmpdir(), "qwen-pilot-fixture-"));
  const credentialFile = join(dir, "bailian.json");
  const configFile = join(dir, "settings.json");
  const preload = join(dir, "fake-fetch.mjs");
  const credential = "synthetic-fixture-key";
  const settings = {
    bailian_config_file: credentialFile, profile: "synthetic",
    base_url: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    text_model: "fixture-text", embedding_model: "fixture-embedding",
    embedding_dimensions: 1024, max_calls: 14, max_cost_cny: 0.1,
    text_input_per_million: 0.15, text_output_per_million: 1.5, embedding_input_per_million: 0.5,
  };
  await writeFile(credentialFile, JSON.stringify({ synthetic: { api_key: credential } }), { mode: 0o600 });
  await writeFile(configFile, JSON.stringify(settings), { mode: 0o600 });
  await writeFile(preload, `
    import assert from "node:assert/strict";
    globalThis.fetch = async (url, init) => {
      assert.equal(new URL(url).origin, "https://dashscope.aliyuncs.com");
      assert.equal(init.redirect, "manual");
      assert.equal(init.headers.Authorization, "Bearer synthetic-fixture-key");
      if (process.env.FIXTURE_ERROR === "http") return Response.json({error:"synthetic failure"}, {status:429});
      const body = JSON.parse(init.body);
      const usage = process.env.FIXTURE_ERROR === "usage" ? null : {prompt_tokens:20,completion_tokens:10};
      if (String(url).endsWith("/embeddings")) {
        assert.ok(!("stream" in body));
        assert.equal(body.dimensions,1024);
        return Response.json({model:body.model,usage:{prompt_tokens:10,total_tokens:10},
          data:body.input.map((_,index)=>({index,embedding:[1,...Array(1023).fill(0)]}))});
      }
      assert.equal(body.enable_thinking,false);
      let content;
      const p=JSON.parse(body.messages[1].content);
      if (p.items) {
        content=JSON.stringify({supported:p.items.map(()=>true)});
      } else if (p.sources) {
        const source=p.sources.find(s=>s.role==="user");
        content=JSON.stringify({pages:[{slug:"policy",title:"Policy",claims:[{text:source.text,citations:[{source_key:source.key,quote:source.text}]}]}],edges:[]});
      } else if (p.messages) {
        const message=p.messages[0].content;
        const fact=(value,key)=>({content:value,fact_key:key,confidence:.99,evidence:[{message_id:"m1",quote:message}]});
        const facts=message.includes("退款")?[fact("用户申请退款，尚未确认完成","user.refund_status")]:
          message.includes("南京")?[fact("用户常住南京","user.home_city")]:
          [fact("用户常住杭州","user.home_city"),fact("用户偏好中文沟通","user.preferred_language")];
        content=JSON.stringify({facts});
      } else if (p.facts) {
        content=JSON.stringify({decisions:p.facts.map((f,fact_index)=>{
          const old=p.existing.find(x=>x.fact_key===f.fact_key);
          return {fact_index,action:old?"supersede":"add",target_id:old?.id??null,
            reason:"固定测试响应",supported:true,confidence:.99};
        })});
      } else {
        content="用户常住南京，使用中文沟通。["+p.evidence.map(x=>x.id).join(",")+"]";
      }
      return Response.json({model:body.model,usage,choices:[{finish_reason:"stop",message:{content}}]});
    };
  `);
  const env = { ...process.env, QWEN_PILOT_CONFIG: configFile, QWEN_PILOT_APPROVED: "yes", QWEN_PILOT_APPROVED_MAX_COST_CNY: "0.1" };
  const run = (extra, args = []) => spawnSync(process.execPath, ["--import", pathToFileURL(preload).href, resolve("eval/qwen-provider-pilot.mjs"), "--execute", ...args], {
    env: { ...env, ...extra }, encoding: "utf8", timeout: 30000,
  });
  try {
    const completed = run({});
    assert.equal(completed.status, 0, completed.stderr + completed.stdout);
    const result = JSON.parse(completed.stdout);
    assert.equal(result.status, "passed");
    assert.equal(result.real_provider_calls, 14); // Intercepted calls, no actual cloud traffic.
    assert.equal(result.synthetic_memories_remaining, 0);
    assert.equal(result.usage_complete, true);
    assert.equal(result.steps.length, 5);
    assert.ok(!completed.stdout.includes(credential));
    const knowledge = run({}, ["--knowledge"]);
    assert.equal(knowledge.status, 0, knowledge.stderr + knowledge.stdout);
    const knowledgeResult = JSON.parse(knowledge.stdout);
    assert.equal(knowledgeResult.real_provider_calls, 6);
    assert.equal(knowledgeResult.status, "requires_independent_quality_review");
    assert.equal(knowledgeResult.steps.length, 3);
    assert.ok(knowledgeResult.steps.every(step => step.state === "applied" && step.pages.length === 1));
    for (const mode of ["http", "usage"]) {
      const failed = run({ FIXTURE_ERROR: mode });
      assert.notEqual(failed.status, 0);
      const report = JSON.parse(failed.stdout);
      assert.equal(report.real_provider_calls, 1, "no request after provider failure");
      assert.equal(report.usage_complete, false);
      assert.equal(report.reported_usage_cost_cny, null);
      assert.equal(report.synthetic_memories_remaining, 0);
    }
    await writeFile(configFile, JSON.stringify({ ...settings, max_cost_cny: 0.00001 }), { mode: 0o600 });
    const capped = run({ QWEN_PILOT_APPROVED_MAX_COST_CNY: "0.00001" });
    assert.notEqual(capped.status, 0);
    assert.equal(JSON.parse(capped.stdout).real_provider_calls, 0, "reserve before the first paid request");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
