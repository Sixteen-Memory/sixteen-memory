import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
const compiled = await build({ entryPoints: ["worker/intelligence-domain.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { validateVector, cosine, extractedFacts, maintenanceDecisions } = await import("data:text/javascript;base64," + Buffer.from(compiled.outputFiles[0].text).toString("base64"));

const source = { type: "conversation", ref: "fixture", observed_at: "2026-11-04T09:00:00Z", text: "我住在柏林" };
const input = { user_id: "u", ref: "fixture", observed_at: source.observed_at, messages: [{ id: "m1", role: "user", content: "我住在柏林" }, { id: "m2", role: "assistant", content: "已经退款" }], expires_at: null };
test("embeddings are normalized and invalid vectors never enter the index", () => {
  const v = validateVector({ model: "test", values: [3, 4] });
  assert.deepEqual(v.values, [0.6, 0.8]); assert.equal(cosine(v.values, v.values), 1);
  for (const values of [[], [0, 0], [Infinity], ["a"], Array(2049).fill(1)]) assert.throws(() => validateVector({ model: "test", values }));
  assert.equal(validateVector({ model: "test", values: Array(2048).fill(1) }).values.length, 2048);
  assert.throws(() => cosine([1], [1, 2]));
});
test("extractor output requires verbatim user evidence, never assistant claims", () => {
  const fact = { content: "用户住在柏林", fact_key: "user.home_city", confidence: 0.99, evidence: [{ message_id: "m1", quote: "我住在柏林" }] };
  assert.equal(extractedFacts({ facts: [fact] }, input)[0].source.text, "[m1] 我住在柏林");
  assert.throws(() => extractedFacts({ facts: [{ ...fact, evidence: [{ message_id: "m1", quote: "不存在" }] }] }, input));
  assert.throws(() => extractedFacts({ facts: [{ ...fact, evidence: [{ message_id: "m2", quote: "已经退款" }] }] }, input));
  assert.throws(() => extractedFacts({ facts: Array(9).fill(fact) }, input));
  assert.throws(() => extractedFacts({ facts: [{ ...fact, confidence: NaN }] }, input));
});
test("automatic replacement cannot cross targets or overwrite explicit corrections", () => {
  const facts = [{ content: "用户住在柏林", fact_key: "user.home_city", source, confidence: 0.99 }];
  const target = { id: "old", content: "用户住在巴黎", fact_key: "user.home_city", source: { ...source, observed_at: "2026-11-03T09:00:00Z" }, origin: "explicit", version: 1 };
  const decision = { fact_index: 0, action: "supersede", target_id: "old", reason: "更新地址", confidence: 0.99, supported: true };
  assert.equal(maintenanceDecisions(facts, [target], { decisions: [decision] }, [])[0].needs_review, true);
  assert.equal(maintenanceDecisions(facts, [{ ...target, origin: "extracted" }], { decisions: [decision] }, [])[0].needs_review, false);
  assert.equal(maintenanceDecisions(facts, [{ ...target, origin: "extracted", source }], { decisions: [decision] }, [])[0].needs_review, true);
  assert.throws(() => maintenanceDecisions(facts, [], { decisions: [decision] }, []));
  assert.equal(maintenanceDecisions(facts, [target], { decisions: [{ ...decision, action: "add", supported: false }] }, [])[0].needs_review, true);
  assert.equal(maintenanceDecisions(facts, [{ ...target, origin: "extracted" }], { decisions: [{ ...decision, action: "add" }] }, [])[0].needs_review, true);
});
test("reviewed residence aliases normalize but physical location and other entities do not", () => {
  const fact={content:"用户住在柏林",fact_key:"user.current_residence_city",confidence:0.99,evidence:[{message_id:"m1",quote:"我住在柏林"}]};
  const facts=extractedFacts({facts:[fact]},input);
  assert.equal(facts[0].fact_key,"user.home_city");
  const candidate={id:"old",content:"用户住在巴黎",fact_key:"user.residence_city",source:{...source,observed_at:"2026-11-03T09:00:00Z"},origin:"extracted",version:1};
  const d={fact_index:0,action:"supersede",target_id:"old",reason:"明确迁居",confidence:.99,supported:true};
  assert.equal(maintenanceDecisions(facts,[candidate],{decisions:[d]},[])[0].needs_review,false);
  for(const key of ["user.current_city","person.alice.home_city","user.birth_city","user.relocation_history"]) {
    const unknown=extractedFacts({facts:[{...fact,fact_key:key}]},input);
    assert.equal(unknown[0].fact_key,key);
    assert.ok(maintenanceDecisions(unknown,[candidate],{decisions:[d]},[])[0].review_reasons.includes("unregistered_slot"));
  }
  assert.throws(()=>extractedFacts({facts:[fact,{...fact,fact_key:"user.home_city"}]},input));
  assert.throws(()=>maintenanceDecisions(facts,[candidate],{decisions:[{...d,fact_index:null}]},[]));
  const duplicate={...candidate,id:"old2"};
  assert.ok(maintenanceDecisions(facts,[candidate,duplicate],{decisions:[d]},[])[0].review_reasons.includes("ambiguous_slot_candidates"));
});
