import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const cover = readFileSync(new URL("../src/video-hero.css", import.meta.url), "utf8");
const token = (css, name) => css.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1];

test("all editorial sections share the cover background, type and accent colors", () => {
  assert.equal(token(styles, "paper"), token(cover, "night"));
  assert.equal(token(styles, "ink"), token(cover, "white"));
  assert.equal(token(styles, "body"), token(cover, "muted"));
  assert.equal(token(styles, "rust"), token(cover, "lime"));
  assert.equal(token(styles, "paper-dark"), "#151f32");
  assert.match(styles, /color-scheme:\s*dark/);
  assert.doesNotMatch(styles, /#ece3d1|#e6dcc8|#43282a|#a86438|#241818|rgb\(67 40 42/i);
});

test("warm editorial images are neutralized without filtering the user video", () => {
  for (const selector of [".photo-pill img", ".portrait-image"]) {
    const rule = styles.slice(styles.indexOf(selector));
    assert.match(rule.slice(0, rule.indexOf("}")), /filter:\s*grayscale\(1\)/);
  }
  assert.doesNotMatch(styles, /(?:^|\})\s*(?:img|video)\s*\{[^}]*filter:/);
  assert.match(cover, /\.night-video,[\s\S]*?filter:\s*none;/);
});

test("text and accent contrast stay readable on both dark surfaces", () => {
  const rgb = (hex) => hex.slice(1).match(/../g).map((v) => parseInt(v, 16));
  const luminance = (color) => color
    .map((v) => v / 255)
    .map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05)
    / (Math.min(luminance(a), luminance(b)) + 0.05);
  for (const surface of ["paper", "paper-dark"]) {
    const background = rgb(token(styles, surface));
    const foreground = rgb(token(styles, "ink"));
    const muted = foreground.map((v, i) => v * 0.72 + background[i] * 0.28);
    assert.ok(contrast(foreground, background) >= 7, `${surface}: heading`);
    assert.ok(contrast(muted, background) >= 4.5, `${surface}: body`);
    assert.ok(contrast(rgb(token(styles, "rust")), background) >= 4.5, `${surface}: accent`);
  }
});
