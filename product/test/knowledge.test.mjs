import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
const result = await build({ entryPoints: ["worker/knowledge-domain.ts"], bundle: true, write: false, format: "esm", platform: "node" });
const { knowledgePlan } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
const sources = [
  { key: "c:1:u", kind: "conversation", id: "1", version: 1, role: "user", text: "Do not refund before approval." },
  { key: "c:1:a", kind: "conversation", id: "1", version: 1, role: "assistant", text: "Refund complete." },
];
const plan = () => ({ pages: [{ slug: "refund", title: "Refund", claims: [{ text: "Approval required", citations: [{ source_key: "c:1:u", quote: "Do not refund before approval." }] }] }], edges: [] });
test("knowledge requires exact permitted-source citations and bounded valid graph edges", () => {
  assert.equal(knowledgePlan(plan(), sources).sources.length, 1);
  const assistant = plan(); assistant.pages[0].claims[0].citations = [{ source_key: "c:1:a", quote: "Refund complete." }];
  assert.throws(() => knowledgePlan(assistant, sources));
  const invented = plan(); invented.pages[0].claims[0].citations[0].quote = "refunded";
  assert.throws(() => knowledgePlan(invented, sources));
  const edge = plan(); edge.edges = [{ from: "refund", to: "unknown", relation: "related", citations: edge.pages[0].claims[0].citations }];
  assert.throws(() => knowledgePlan(edge, sources));
  const duplicate = plan(); duplicate.pages.push(duplicate.pages[0]); assert.throws(() => knowledgePlan(duplicate, sources));
});
