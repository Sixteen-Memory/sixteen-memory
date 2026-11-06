import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
const load = async entry => {
  const b = await build({entryPoints:[entry],bundle:true,write:false,format:"esm",platform:"node"});
  return import("data:text/javascript;base64,"+Buffer.from(b.outputFiles[0].text).toString("base64"));
};
const { parseFilter, filterSql, searchConstraints } = await load("worker/memory-filter.ts");
const { memoryAttributes, date } = await load("worker/domain.ts");
test("attributes are bounded, typed and reject secrets outside the content", () => {
  const value = memoryAttributes({metadata:{urgent:true,priority:2,nullable:null}, category:"support", event_time:"2026-11-05T12:00:00+08:00"});
  assert.equal(value.event_time,"2026-11-05T04:00:00.000Z");
  assert.deepEqual(value.metadata,{nullable:null,priority:2,urgent:true});
  for (const metadata of [{x:{}},{x:["tag"]},{x:Infinity},{x:"x".repeat(257)},{constructor:"x"},{key:"sk-"+"a".repeat(35)}]) assert.throws(()=>memoryAttributes({metadata}));
  assert.throws(()=>memoryAttributes({valid_from:"2026-11-06T00:00:00Z",valid_to:"2026-11-05T00:00:00Z"}));
  assert.throws(()=>memoryAttributes({category:"sk-"+"a".repeat(35)}));
});
test("dates require real calendar values and explicit timezones", () => {
  for (const v of ["2026-02-29T00:00:00Z","2026-02-30T00:00:00Z","2026-11-05T00:00:00","2026-11-05T24:00:00Z","2026-11-05T00:00:00+14:01","9999-12-31T23:59:59-14:00","0001-01-01T00:00:00+14:00"]) assert.throws(()=>date(v,"test"));
  assert.equal(date("2024-02-29T00:00:00Z","test"),"2024-02-29T00:00:00.000Z");
});
test("filters compile only allowlisted identifiers and bind hostile literal values", () => {
  const f=parseFilter({AND:[{field:"category",op:"eq",value:"x' OR 1=1--"},{field:"metadata.priority",op:"gte",value:3},{NOT:{field:"metadata.suspended",op:"eq",value:true}}]});
  const compiled=filterSql(f);
  assert.ok(!compiled.sql.includes("x' OR"));
  assert.ok(compiled.args.includes("x' OR 1=1--"));
  assert.ok(compiled.args.includes("$.priority"));
  assert.equal(searchConstraints({at:"2026-11-05T08:00:00+08:00"}).at,"2026-11-05T00:00:00.000Z");
  for (const f of [{field:"user_id",op:"eq",value:"other"},{field:"metadata.x') OR 1=1--",op:"eq",value:1},{OR:[]},{field:"metadata.x",op:"gt",value:"2"},{field:"metadata.x",op:"in",value:[]},{field:"category",op:"eq",value:1},{field:"category",op:"eq",value:"x",ignored:true}]) assert.throws(()=>parseFilter(f));
  assert.throws(()=>filterSql(parseFilter({AND:Array.from({length:3},()=>({field:"metadata.x",op:"in",value:Array.from({length:16},(_,i)=>i)}))})));
});
