import assert from "node:assert/strict";
import { test } from "node:test";
import { boundedContext, score, summarize } from "../eval/core.mjs";
test("evaluation never truncates evidence and missing results are not zeros", () => {
  assert.equal(boundedContext([{id:"1",content:"x".repeat(100)}],10).memories.length,0);
  assert.equal(score(null,{required:["x"],forbidden:[]}).correct,null);
  assert.equal(score("x",{required:["x"],forbidden:["x"]}).correct,false);
  assert.equal(summarize([{group:"g",score:{status:"missing",correct:null}}]).g.accuracy,null);
});
