import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { apiHealthUrl, consoleUrl, content, quickstartUrl, sdkPackageUrl } from "../src/content.mjs";

const source = readFileSync(new URL("../src/ProductPage.tsx", import.meta.url), "utf8");
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/product-page.css", import.meta.url), "utf8");

test("new structure leads from developer integration to product, use case, control and status", () => {
  for (const id of ["developers", "resources", "api-reference", "product", "lifecycle", "usecase", "enterprise", "status", "start"])
    assert.match(source, new RegExp(`id="${id}"`), id);
  for (const id of ["developers-title", "resources-title", "api-title", "proof-title", "lifecycle-title", "usecase-title", "enterprise-title", "status-title", "start-title"])
    assert.match(source, new RegExp(`id="${id}"`), id);
  assert.ok(source.indexOf('id="developers"') < source.indexOf('id="resources"'));
  assert.ok(source.indexOf('id="resources"') < source.indexOf('id="product"'));
  assert.ok(source.indexOf('id="product"') < source.indexOf('id="usecase"'));
  assert.ok(source.indexOf('id="usecase"') < source.indexOf('id="status"'));
  assert.match(app, /<ProductPage language=\{language\} copy=\{c\}/);
  assert.doesNotMatch(app, /<MemoryWorkflow|className="statement/);
});

test("developer links use the real console, quickstart and public health endpoint", () => {
  assert.equal(consoleUrl, "https://console.sixteenmemory.com/");
  assert.equal(quickstartUrl, "https://console.sixteenmemory.com/quickstart");
  assert.equal(apiHealthUrl, "https://console.sixteenmemory.com/health");
  for (const name of ["consoleUrl", "quickstartUrl", "apiHealthUrl"]) assert.ok(source.includes(name));
  const examples = readFileSync(new URL("../src/developer-examples.mjs", import.meta.url), "utf8");
  assert.match(examples, /baseUrl: "https:\/\/console\.sixteenmemory\.com"/);
  assert.doesNotMatch(source, /mem0\.ai|MemoryClient|pip install mem0ai/i);
});

test("developer surface includes API, docs, SDK, console, request records and truthful MCP status", () => {
  for (const copy of Object.values(content)) {
    assert.equal(copy.resources.items.length, 6);
    const names = copy.resources.items.map(item => item.name).join(" ");
    assert.match(names, /REST API/i);
    assert.match(names, /API (文档|docs)/i);
    assert.match(names, /JavaScript SDK/i);
    assert.match(names, /(管理控制台|Console)/i);
    assert.match(names, /(请求记录|Request records)/i);
    assert.match(names, /MCP/i);
  }
  assert.match(content.zh.resources.items.at(-1).state, /只读.*OAuth/);
  assert.match(content.en.resources.items.at(-1).state, /Read-only.*OAuth/);
  for (const copy of Object.values(content)) {
    const mcp = copy.resources.items.find(item => item.id === "mcp");
    assert.equal(mcp.href, quickstartUrl);
    assert.match(mcp.body, /Bearer|bearer/);
    assert.ok(copy.resources.items.filter(item => item.id !== "mcp").every(item => item.href && item.action));
    assert.equal(copy.resources.items.find(item => item.id === "sdk").href, sdkPackageUrl);
  }
  assert.match(source, /id="resources"/);
  assert.match(source, /resource-grid/);
});

test("copy separates online capabilities from work that is still needed", () => {
  assert.deepEqual(Object.keys(content.zh), Object.keys(content.en));
  for (const copy of Object.values(content)) {
    assert.equal(copy.proof.items.length, 4);
    assert.equal(copy.lifecycle.steps.length, 4);
    assert.equal(copy.usecase.cards.length, 3);
    assert.equal(copy.enterprise.items.length, 3);
    assert.equal(copy.status.live.length, 4);
    assert.equal(copy.resources.items.length, 6);
    assert.equal(copy.status.next.length, 4);
  }
  assert.match(content.zh.status.next.join(" "), /模型|MCP|身份|备份|Mem0|客户/);
  assert.match(content.zh.status.boundary, /没有公开客户结果/);
  assert.match(content.en.status.boundary, /no public customer results/i);
  assert.doesNotMatch(content.zh.resources.intro + content.en.resources.intro, /Mem0|值得学|should/);
  assert.doesNotMatch(JSON.stringify(content), /SOC 2|HIPAA|GDPR|150,000|62,590|领先|行业第一|生产就绪/i);
});

test("responsive code example and local roundtable remain accessible", () => {
  assert.match(source, /role="tablist"/);
  assert.match(source, /aria-selected=\{tab === value\}/);
  assert.match(source, /navigator\.clipboard/);
  assert.match(source, /agent-roundtable-2d\.svg/);
  assert.ok(existsSync(new URL("../public/assets/agent-roundtable-2d.svg", import.meta.url)));
  assert.match(css, /@media \(max-width: 900px\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /overflow: auto/);
  assert.doesNotMatch(css, /url\(["']?https?:\/\//);
  assert.doesNotMatch(source, /code-note|先下载 SDK|Download the SDK beside|Node\.js 20|SIXTEEN_API_KEY|customer-42/);
  assert.doesNotMatch(css, /\.code-note/);
});


test("navigation exposes the public site framework on mobile and provides direct Quickstart access", () => {
  const hero = readFileSync(new URL("../src/VideoHero.tsx", import.meta.url), "utf8");
  assert.match(hero, /className="mobile-navigation"/);
  assert.match(hero, /<summary/);
  assert.match(hero, /className="night-contact" href=\{quickstartUrl\}/);
  assert.match(hero, /primaryNavigation\.map/);
  assert.match(hero, /routeHref\("\/security"/);
  assert.match(css, /\.resource-grid \{ grid-template-columns: 1fr;/);
});

test("stable download matches the SDK and examples import the packaged client", () => {
  const sdk = readFileSync(new URL("../public/downloads/sixteen-memory-client.mjs", import.meta.url), "utf8");
  assert.equal(sdk, readFileSync(new URL("../../product/sdk/client.mjs", import.meta.url), "utf8"));
  const examples = readFileSync(new URL("../src/developer-examples.mjs", import.meta.url), "utf8");
  assert.match(examples, /from "@sixteen-memory\/sdk"/);
  assert.doesNotMatch(examples, /\/api\/v1|api\.sixteenmemory\.com|sdk\/index/);
  assert.match(source, /download=\{item.download/);
  assert.match(source, /copyState === "error"/);
  assert.match(source, /aria-controls="snippet-panel"/);
  assert.match(source, /role="tabpanel"/);
});
