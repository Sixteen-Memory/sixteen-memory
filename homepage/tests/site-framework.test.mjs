import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { capabilities, pageForPath, primaryNavigation, routeHref, sitePages } from "../src/site-pages.mjs";

const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
const document = readFileSync(new URL("../src/SiteDocument.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/site-document.css", import.meta.url), "utf8");
const build = readFileSync(new URL("../scripts/build-routes.mjs", import.meta.url), "utf8");

test("website framework has eight bilingual public routes with one matching page", () => {
  assert.deepEqual(sitePages.map(page => page.path), [
    "/product/memory", "/product/retrieval", "/integrations", "/docs",
    "/security", "/deployment", "/usage", "/status"
  ]);
  assert.equal(new Set(sitePages.map(page => page.path)).size, 8);
  for (const page of sitePages) {
    assert.equal(pageForPath(page.path), page);
    assert.ok(page.nav.zh && page.nav.en && page.title.zh && page.title.en);
    assert.ok(page.sections.length >= 2);
    assert.ok(page.related.length >= 3);
  }
  assert.equal(pageForPath("/missing"), undefined);
  assert.equal(routeHref("/security", "en"), "/security/?lang=en");
  assert.equal(routeHref("/docs"), "/docs/");
  assert.equal(routeHref("/docs/", "en"), "/docs/?lang=en");
  assert.equal(routeHref("/docs#errors", "en"), "/docs/?lang=en#errors");
});

test("capability language separates online, development and planned work", () => {
  assert.deepEqual([...new Set(capabilities.map(item => item.state))].sort(), ["live", "local", "planned"]);
  assert.equal(capabilities.filter(item => item.state === "live").length, 4);
  assert.equal(capabilities.filter(item => item.state === "local").length, 3);
  assert.equal(capabilities.filter(item => item.state === "planned").length, 3);
  assert.match(capabilities.find(item => item.id === "semantic").detail.zh, /尚未完成真实模型效果检查/);
  assert.match(capabilities.find(item => item.id === "filters").detail.zh, /不是历史快照/);
  assert.match(capabilities.find(item => item.id === "profile").detail.zh, /没有开放接口/);
  assert.doesNotMatch(JSON.stringify(capabilities), /SOC 2|HIPAA|GDPR|生产就绪|行业第一|客户提升|SLA 99/i);
});

test("navigation, documents and home page connect the new structure", () => {
  assert.equal(primaryNavigation.length, 4);
  assert.match(app, /pageForPath\(path\)/);
  assert.match(app, /<SiteDocument page=\{selected\}/);
  assert.match(app, /sitePages\.map/);
  assert.match(document, /className="site-header"/);
  assert.match(document, /className="site-map"/);
  assert.match(document, /className="availability-controls"/);
  assert.match(document, /<CodeExample language=\{language\}/);
  assert.match(document, /className="not-found"/);
  assert.doesNotMatch(document, /API_KEY|sk-/);
});

test("build emits independent route HTML, sitemap and a noindex 404", () => {
  assert.match(build, /renderPage\(page\.path\)/);
  assert.match(build, /dist\/404\.html|\"dist\/404\.html\"/);
  assert.match(build, /sitemap\.xml/);
  assert.match(build, /name="robots" content="noindex"/);
  assert.match(build, /route-specific metadata/);
});

test("framework has explicit responsive and overflow rules", () => {
  assert.match(css, /@media \(max-width: 800px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /\.page-body \{ width: calc\(100% - 40px\); grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.page-outline, \.page-sections, \.document-section \{ position: static; min-width: 0;/);
  assert.match(css, /\.docs-table-wrap \{ overflow: auto;/);
  assert.match(css, /\.site-mobile-menu \{ display: none;/);
  assert.doesNotMatch(css, /url\(["']?https?:\/\//);
});

test("required existing assets and generated-page sources remain present", () => {
  for (const file of [
    "../public/assets/memory16-native.mp4", "../public/assets/memory16-native-poster.jpg",
    "../public/assets/agent-roundtable-2d.svg", "../scripts/render-pages.tsx",
    "../src/SiteDocument.tsx", "../src/site-document.css"
  ]) assert.ok(existsSync(new URL(file, import.meta.url)), file);
});
