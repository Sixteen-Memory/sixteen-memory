import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
const built = await build({entryPoints:["worker/providers.ts"],bundle:true,write:false,format:"esm",platform:"node"});
const { embed, embeddingSignature } = await import("data:text/javascript;base64,"+Buffer.from(built.outputFiles[0].text).toString("base64"));
const env = {
  EMBEDDINGS_ENABLED:"true",EMBEDDING_PROVIDER:"qwen",EMBEDDING_API_STYLE:"dashscope",
  EMBEDDING_DIMENSIONS:"2048",EMBEDDING_BASE_URL:"https://qwen-fixture.test/api/v1",
  EMBEDDING_MODEL:"test-model",EMBEDDING_API_KEY:"test-key",EMBEDDING_REVISION:"1",
};
test("embedding index fingerprint isolates provider, protocol, dimension and revision, not credentials", async () => {
  const signature=await embeddingSignature(env);
  for(const change of [
    {EMBEDDING_API_STYLE:"openai-compatible"},{EMBEDDING_DIMENSIONS:"1024"},
    {EMBEDDING_REVISION:"2"},{EMBEDDING_MODEL:"new-model"},
    {EMBEDDING_BASE_URL:"https://other-qwen-fixture.test/api/v1"},
  ]) assert.notEqual(await embeddingSignature({...env,...change}),signature);
  assert.equal(await embeddingSignature({...env,EMBEDDING_API_KEY:"rotated-key"}),signature);
});
test("native Qwen responses are ordered, dimension checked and normalized; usage retained", async () => {
  const original=globalThis.fetch;let outbound=0;let bad=false;
  globalThis.fetch=async(url,init)=>{
    outbound++;assert.equal(url,"https://qwen-fixture.test/api/v1/services/embeddings/text-embedding/text-embedding");
    assert.equal(init.redirect,"manual");
    const body=JSON.parse(init.body);
    assert.equal(body.parameters.text_type,"query");assert.equal(body.parameters.dimension,2048);
    const n=bad?1024:2048;
    return Response.json({output:{embeddings:[{index:1,embedding:Array(n).fill(2)},{index:0,embedding:Array(n).fill(1)}]},usage:{total_tokens:12}});
  };
  try {
    const result=await embed(env,["问题一","问题二"],"query");
    assert.equal(result.vectors[0].values.length,2048);
    assert.ok(Math.abs(Math.hypot(...result.vectors[0].values)-1)<1e-10);
    assert.equal(result.usage.input_tokens,12);
    assert.equal(result.usage.output_tokens,null);
    bad=true;
    await assert.rejects(embed(env,["问题一","问题二"],"query"),e=>e.code==="embedding_dimension_mismatch");
    assert.equal(outbound,2,"provider errors must not be retried");
  } finally {globalThis.fetch=original;}
});
test("duplicate response indices cannot overwrite missing embeddings", async () => {
  const original=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({data:[{index:0,embedding:Array(1024).fill(1)},{index:0,embedding:Array(1024).fill(2)}]});
  try {
    await assert.rejects(embed({...env,EMBEDDING_API_STYLE:"openai-compatible",EMBEDDING_DIMENSIONS:"1024"},["一","二"]),e=>e.code==="invalid_embedding");
  } finally {globalThis.fetch=original;}
});
