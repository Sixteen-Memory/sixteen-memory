import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
const built = await build({entryPoints:["worker/generation-options.ts"],bundle:true,write:false,format:"esm",platform:"node"});
const { generationOptions } = await import("data:text/javascript;base64,"+Buffer.from(built.outputFiles[0].text).toString("base64"));
test("provider profiles do not force unsupported temperature or infer private models", () => {
  assert.deepEqual(generationOptions(100),{max_tokens:100});
  assert.deepEqual(generationOptions(100,"max_completion_tokens"),{max_completion_tokens:100});
  assert.deepEqual(generationOptions(100,"max_tokens","disabled"),{max_tokens:100,enable_thinking:false});
  assert.deepEqual(generationOptions(100,"max_tokens","enabled"),{max_tokens:100,enable_thinking:true});
  assert.throws(()=>generationOptions(100,"unknown"));
  assert.throws(()=>generationOptions(100,"max_tokens","maybe"));
});
