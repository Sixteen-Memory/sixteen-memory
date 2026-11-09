import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";

test("developer menu renders usable bilingual destinations and an honest MCP state", async () => {
  const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const directory = await mkdtemp(join(root, ".developer-menu-test-"));
  try {
    await build({
      stdin: { contents: 'import React from "react"; import {renderToStaticMarkup} from "react-dom/server"; import Menu from "./src/DeveloperMenu.tsx"; export const render = (language,compact) => renderToStaticMarkup(<Menu language={language} compact={compact}/>);', loader: "tsx", resolveDir: root },
      bundle: true, platform: "node", format: "esm", packages: "external", jsx: "automatic", outfile: join(directory, "render.mjs")
    });
    const { render } = await import(pathToFileURL(join(directory, "render.mjs")).href);
    for (const language of ["zh", "en"]) {
      for (const compact of [false, true]) {
        const html = render(language, compact);
        assert.match(html, /<details class="developer-menu/);
        assert.match(html, /<summary>/);
        assert.doesNotMatch(html, /<details[^>]* open/);
        assert.equal((html.match(/data-entry=/g) ?? []).length, 7);
        assert.equal((html.match(/<a class="developer-menu-entry"/g) ?? []).length, 7);
        assert.match(html, language === "zh" ? /href="\/docs\/#api-reference"/ : /href="\/docs\/\?lang=en#api-reference"/);
        assert.match(html, /data-entry="sdk" href="\/downloads\/sixteen-memory-sdk.mjs" download=""/);
        assert.match(html, /href="https:\/\/console.sixteenmemory.com\/" target="_blank" rel="noreferrer"/);
        assert.match(html, /data-entry="mcp"/);
        assert.doesNotMatch(html, /href="[^"]*mcp|role="menu"|Mem0|SLA|certified|CLI/);
        assert.match(html, language === "zh" ? /7 个只读工具/ : /7 read-only tools/);
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("homepage and content pages share the menu with a real API anchor", async () => {
  const read = path => readFile(new URL(path, import.meta.url), "utf8");
  const [hero, document, css, menu, app] = await Promise.all([
    read("../src/VideoHero.tsx"), read("../src/SiteDocument.tsx"), read("../src/developer-menu.css"), read("../src/DeveloperMenu.tsx"), read("../src/App.tsx")
  ]);
  assert.match(hero, /<DeveloperMenu key=\{item.path\} language=\{language\}/);
  assert.match(hero, /language=\{language\} compact/);
  assert.match(document, /<DeveloperMenu key=\{link.path\}/);
  assert.match(document, /id="api-reference"/);
  assert.match(css, /\.developer-menu\.is-compact \.developer-menu-panel/);
  assert.match(css, /max-height: calc\(100svh - 110px\)/);
  assert.match(menu, /addEventListener\("pointerdown", closeOutside\)/);
  assert.match(menu, /removeEventListener\("pointerdown", closeOutside\)/);
  assert.match(menu, /event.key === "Escape"/);
  assert.match(menu, /event.stopPropagation\(\)/);
  assert.doesNotMatch(menu, /useState|onToggle|aria-expanded/);
  assert.match(css, /\.site-header \.developer-menu-panel \{ left: auto; right: 0; \}/);
  assert.match(app, /getElementById\(window.location.hash.slice\(1\)\)/);
  assert.match(app, /target.scrollIntoView\(\{ behavior: "instant", block: "start" \}\)/);
});
