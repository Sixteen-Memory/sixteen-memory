import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
const built = await build({entryPoints:["worker/embedding-config.ts"],bundle:true,write:false,format:"esm",platform:"node"});
const { embeddingOptions, embeddingRequest } = await import("data:text/javascript;base64,"+Buffer.from(built.outputFiles[0].text).toString("base64"));
test("Qwen embedding profile pins dimensions and distinguishes query/document in native protocol", () => {
  const env = {EMBEDDING_PROVIDER:"qwen",EMBEDDING_API_STYLE:"dashscope",EMBEDDING_DIMENSIONS:"1024"};
  assert.deepEqual(embeddingOptions(env),{provider:"qwen",apiStyle:"dashscope",dimensions:1024,maxBatch:10});
  assert.deepEqual(embeddingRequest(env,"configured-qwen-model",["问题"],"query"),{
    path:"/services/embeddings/text-embedding/text-embedding",
    body:{model:"configured-qwen-model",input:{texts:["问题"]},parameters:{dimension:1024,text_type:"query",output_type:"dense"}},
  });
  assert.equal(embeddingRequest(env,"configured-qwen-model",["材料"],"document").body.parameters.text_type,"document");
});
test("Qwen OpenAI-compatible profile uses documented dimensions without invented text_type", () => {
  const request=embeddingRequest({EMBEDDING_PROVIDER:"qwen",EMBEDDING_API_STYLE:"openai-compatible",EMBEDDING_DIMENSIONS:"1536"},"configured-qwen-model",["文本"],"query");
  assert.deepEqual(request,{path:"/embeddings",body:{model:"configured-qwen-model",input:["文本"],encoding_format:"float",dimensions:1536}});
  assert.ok(!("text_type" in request.body));
});
test("invalid Qwen dimensions, purposes and batches fail before provider calls", () => {
  for(const dimensions of ["0","63","4096","nope"]) assert.throws(()=>embeddingOptions({EMBEDDING_PROVIDER:"qwen",EMBEDDING_DIMENSIONS:dimensions}));
  assert.throws(()=>embeddingRequest({EMBEDDING_PROVIDER:"qwen"},"model",Array(11).fill("x"),"document"));
  assert.throws(()=>embeddingRequest({EMBEDDING_PROVIDER:"qwen"},"model",["x"],"other"));
});
