import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
const temp = await mkdtemp(join(tmpdir(), "mem0-adapter-fixture-"));
const original = globalThis.fetch;
let calls = 0;
globalThis.fetch = async (input, init) => {
  const req = new Request(input, init);
  assert.equal(new URL(req.url).hostname, "mem0-fixture.test");
  calls++;
  const body = await req.json();
  if (req.url.endsWith("/embeddings")) {
    const values = Array.isArray(body.input) ? body.input : [body.input];
    return Response.json({ object:"list",data:values.map((_,index)=>({index,object:"embedding",embedding:[1,0,0.2,0.1]})), model:"fixture",usage:{prompt_tokens:1,total_tokens:1} });
  }
  return Response.json({id:"fixture",object:"chat.completion",created:1,model:"fixture",choices:[{index:0,finish_reason:"stop",message:{role:"assistant",content:JSON.stringify({memory:[{id:"0",text:"User lives in Berlin."}]})}}],usage:{prompt_tokens:1,completion_tokens:1,total_tokens:2}});
};
process.env.MEM0_TELEMETRY = "false";
try {
  await import("openai/shims/web");
  const { Memory } = await import("mem0ai/oss");
  const memory = new Memory({
    llm:{provider:"openai",config:{apiKey:"synthetic",baseURL:"https://mem0-fixture.test/v1",model:"fixture",temperature:0}},
    embedder:{provider:"openai",config:{apiKey:"synthetic",baseURL:"https://mem0-fixture.test/v1",model:"fixture"}},
    vectorStore:{provider:"memory",config:{collectionName:"fixture",dbPath:join(temp,"vector.db"),dimension:4}},disableHistory:true,
  });
  const added = await memory.add([{role:"user",content:"I live in Berlin."}],{userId:"fixture"});
  assert.equal(added.results.length,1);
  const found = await memory.search("Where do I live?",{filters:{user_id:"fixture"},topK:10});
  assert.equal(found.results[0].memory,"User lives in Berlin.");
  await memory.deleteAll({userId:"fixture"});
  assert.equal((await memory.getAll({filters:{user_id:"fixture"}})).results.length,0);
  console.log(JSON.stringify({status:"passed",dependency:"mem0ai@3.3.1",fake_provider_calls:calls,real_model_calls:0,evidence:"adapter compatibility only; not a benchmark"}));
} finally {globalThis.fetch=original;await rm(temp,{recursive:true,force:true});}
