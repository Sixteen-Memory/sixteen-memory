import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { contactEmail, content } from "../src/content.mjs";

test("both languages cover the same homepage structure", () => {
  assert.deepEqual(Object.keys(content.zh), Object.keys(content.en));
  for (const copy of Object.values(content)) {
    assert.equal(copy.heroTitle.length, 2);
    assert.equal(copy.nav.length, 4);
    assert.equal(copy.lifecycle.steps.length, 4);
    assert.equal(copy.proof.items.length, 4);
    assert.ok(copy.privacyBody.trim());
  }
});

test("brand presentation uses SixteenMemory while addresses remain lowercase", () => {
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  const hero = readFileSync(new URL("../src/VideoHero.tsx", import.meta.url), "utf8");
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const display = `${app}\n${hero}\n${html}\n${JSON.stringify(content)}`;
  assert.match(display, /SixteenMemory/);
  assert.doesNotMatch(display, />sixteenmemory<|拾陆记忆 sixteenmemory|SIXTEENMEMORY|Sixteen Memory/);
  assert.match(display, /sixteenmemory\.com/);
  assert.equal(contactEmail, "support@sixteenmemory.com");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(app, /className="eyebrow brand-label">SixteenMemory/);
  assert.match(css, /\.brand-label\s*\{\s*text-transform:\s*none;/);
});

test("contact uses the existing public mailbox only", () => {
  assert.equal(contactEmail, "support@sixteenmemory.com");
  assert.ok(!JSON.stringify(content).includes("machengyuan@"));
});

test("Cloudflare deploys only the independent static build without DNS routes", () => {
  const config = JSON.parse(
    readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8")
  );
  assert.equal(config.pages_build_output_dir, "./dist");
  assert.equal(config.assets, undefined);
  assert.equal(config.routes, undefined);
  assert.equal(config.main, undefined);
});

test("static art and icons are available and generated imagery has provenance", () => {
  for (const path of [
    "../public/assets/memory-field.webp",
    "../public/assets/memory-field-mobile.webp",
    "../public/assets/memory-foreground.webp",
    "../public/assets/memory-editorial.webp",
    "../public/assets/caveat-600.ttf",
    "../public/assets/favicon.png",
    "../public/assets/inter-latin.woff2"
  ]) {
    assert.ok(existsSync(new URL(path, import.meta.url)), path);
  }
  const manifest = JSON.parse(
    readFileSync(new URL("../asset-provenance.json", import.meta.url), "utf8")
  );
  assert.equal(manifest.landscape.generator, "gpt-image-2");
  assert.equal(manifest.motion.provider, "html5-video-autoplay-scroll-seek");
  assert.equal(manifest.motion.lux3dGenerated, false);
  assert.equal(manifest.videoHero.generatedByThisTask, false);
  assert.ok(Math.abs(manifest.videoHero.measuredDurationSeconds - 193 / 24) < 0.001);
  assert.equal(manifest.archivedLux3d.published, false);
});

test("production preserves canonical metadata and publishes the authorized static build", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.match(
    html,
    /rel="canonical" href="https:\/\/www\.sixteenmemory\.com\/"/
  );
  assert.match(html, /memory16-native-poster\.jpg/);
  assert.doesNotMatch(html, /noindex|nofollow/i);
  assert.doesNotMatch(html, /city-glide/);
  assert.match(html, /content="https:\/\/www\.sixteenmemory\.com\/assets\/memory16-native-poster\.jpg"/);
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts.deploy, /wrangler pages deploy dist --project-name sixteenmemory-homepage --branch main$/);
  const manifest = JSON.parse(readFileSync(new URL("../asset-provenance.json", import.meta.url), "utf8"));
  assert.equal(manifest.release.userAuthorized, true);
});

test("the old split composition and ring renderer are not used", () => {
  const scene = readFileSync(
    new URL("../src/editorial-motion.ts", import.meta.url),
    "utf8"
  );
  const css = readFileSync(
    new URL("../src/styles.css", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(scene, /import\("three"\)|ExtrudeGeometry/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /animation-play-state:\s*paused/);
  assert.doesNotMatch(css, /--acid|#d9f04d/);
});

test("security headers restrict uploads and third-party scripts", () => {
  const headers = readFileSync(
    new URL("../public/_headers", import.meta.url),
    "utf8"
  );
  assert.match(headers, /script-src 'self'/);
  assert.match(headers, /connect-src 'self'/);
  assert.match(headers, /form-action 'none'/);
  assert.match(headers, /frame-ancestors 'none'/);
});

test("lower editorial sections keep real accessible scroll reveals", () => {
  const motion = readFileSync(
    new URL("../src/editorial-motion.ts", import.meta.url),
    "utf8"
  );
  assert.match(motion, /el\.animate\(/);
  assert.match(motion, /IntersectionObserver/);
  assert.match(motion, /e\.isIntersecting\) reveal\(e\.target\)/);
  assert.match(motion, /clipPath/);
  assert.match(motion, /translateY/);
  assert.match(motion, /a\.playState === "paused"/);
  assert.match(motion, /removeAttribute\("data-revealed"\)/);
});
