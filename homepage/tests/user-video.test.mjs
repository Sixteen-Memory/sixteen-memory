import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

test("user video is unchanged and belongs to the current authorized release", () => {
  const manifest = JSON.parse(readFileSync(new URL("../asset-provenance.json", import.meta.url)));
  assert.ok(Math.abs(manifest.videoHero.measuredDurationSeconds - 193 / 24) < 0.001);
  assert.equal(manifest.videoHero.sourceUnmodified, true);
  assert.equal(manifest.release.userAuthorized, true);
  assert.match(manifest.release.status, /^(prepared|deployed)$/);
  const video = readFileSync(new URL("../public/assets/memory16-native.mp4", import.meta.url));
  assert.equal(createHash("sha256").update(video).digest("hex"), "eeb325e5da041f2c505f580f45eeaddd5883dc41deca47f834729c2f5ddc8f4f");
});

test("production source uses one local encoding and no retired footage", () => {
  const source = readFileSync(new URL("../src/VideoHero.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/video-hero.css", import.meta.url), "utf8");
  assert.match(source, /const source = "\/assets\/memory16-native\.mp4"/);
  assert.match(source, /data-artwork="user-memory16-preview"/);
  assert.match(source, /className="night-media"/);
  assert.doesNotMatch(source, /city-glide|norva-reference-restored|memory16-user-(desktop|mobile)/);
  for (const retired of ["city-glide-desktop.mp4", "city-glide-mobile.mp4", "city-glide-poster.jpg", "bodoni-moda-11-500.ttf"])
    assert.equal(existsSync(new URL(`../public/assets/${retired}`, import.meta.url)), false);
  const palette = { night: "#0f1626", white: "#f4f6fa", muted: "rgb(244 246 250 / 0.72)", lime: "#c6ff2e", cyan: "#3fd8ff" };
  for (const [token, expected] of Object.entries(palette)) {
    const values = [...css.matchAll(new RegExp(`--${token}:\\s*([^;]+);`, "g"))].map(match => match[1]);
    assert.deepEqual(values, [expected], token);
  }
});
