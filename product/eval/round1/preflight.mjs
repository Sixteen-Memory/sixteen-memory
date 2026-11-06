import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const sets=await Promise.all(["dev","validation"].map(async split=>{
  const raw=await readFile(new URL(`${split}.json`,import.meta.url));
  const value=JSON.parse(raw);
  assert.equal(value.schema,1);assert.equal(value.cases.length,12);
  for(const row of value.cases){
    assert.ok(row.category && row.rubric && row.review_policy);
    assert.ok(row.batches.flat().every(m=>["user","assistant"].includes(m.role)&&m.content));
    assert.ok(row.queries.every(q=>q.query&&q.required.length));
  }
  return {split,cases:value.cases,sha256:createHash("sha256").update(raw).digest("hex")};
}));
assert.equal(new Set(sets.flatMap(s=>s.cases.map(c=>c.id))).size,24);
const result={
  status:"fixture_protocol_valid",date:"2026-11-05",splits:sets.map(({split,cases,sha256})=>({split,count:cases.length,sha256})),
  real_model_calls:0,effectiveness:"not_run",independent_validation:false,
  blockers:["Approved extraction and Qwen embedding credentials + request/financial budget required.","Same-author synthetic split is not an independent blind test.","Current paired runner stops at review; reviewed cases need separate human protocol, never automatic gold-based approval."],
};
if(process.argv.includes("--write"))await writeFile(new URL("preflight.json",import.meta.url),JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(result,null,2));
