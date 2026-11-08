import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("the selected official logo is shared by the home and document headers", () => {
  const component = readFileSync(new URL("../src/BrandLogo.tsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("../src/VideoHero.tsx", import.meta.url), "utf8");
  const document = readFileSync(new URL("../src/SiteDocument.tsx", import.meta.url), "utf8");
  assert.match(component, /sixteenmemory-official-logo\.png/);
  assert.match(home, /<BrandLogo\/>/);
  assert.match(document, /<BrandLogo\/>/);
  assert.ok(existsSync(new URL("../public/assets/sixteenmemory-official-logo.png", import.meta.url)));
  assert.ok(existsSync(new URL("../public/assets/sixteenmemory-official-icon.png", import.meta.url)));
});
