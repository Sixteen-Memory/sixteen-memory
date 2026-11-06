import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const source = readFileSync(new URL("../src/VideoHero.tsx", import.meta.url), "utf8");
const controller = readFileSync(new URL("../src/video-hero-controller.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/video-hero.css", import.meta.url), "utf8");

test("cover uses one viewport without a sticky scroll timeline", () => {
  assert.match(css, /\.night-track\s*\{[^}]*height:\s*100svh;/);
  assert.match(css, /\.night-scene\s*\{[^}]*height:\s*100svh;[^}]*position:\s*relative;/);
  assert.doesNotMatch(css, /height:\s*(?:340|420)vh|position:\s*sticky|top:\s*(?:340|420)vh/);
  assert.match(source, /data-provider="native-video"/);
  assert.doesNotMatch(source, /night-clock|scroll-video/);
  assert.equal(existsSync(new URL("../src/hero-timeline.mjs", import.meta.url)), false);
});

test("cover is a native looping local video with permanent poster", () => {
  assert.match(source, /<video/);
  assert.match(source, /src=\{source\}/);
  assert.match(source, /data-src=\{source\}/);
  assert.match(source, /muted/);
  assert.match(source, /playsInline/);
  assert.match(source, /autoPlay/);
  assert.match(source, /loop/);
  assert.ok(source.indexOf('<img className="night-poster"') < source.indexOf("<video"));
  assert.doesNotMatch(source, /failed && <img/);
  for (const name of ["memory16-native.mp4", "memory16-native-poster.jpg", "inter-tight-latin.woff2", "InterTight-LICENSE.txt"])
    assert.ok(existsSync(new URL("../public/assets/" + name, import.meta.url)));
});

test("controller has no page scroll or video seeking behavior", () => {
  for (const obsolete of ["scrollY", "scrollTo", "currentTime =", "video.seeking", "addEventListener(\"scroll\"", "requestAnimationFrame", "recorder", "clipTime", "heroUI"])
    assert.ok(!controller.includes(obsolete), obsolete);
  for (const behavior of ["video.play()", "visibilitychange", "prefers-reduced-motion", "IntersectionObserver", "onBlocked", "onError", "loadClip(true)"])
    assert.ok(controller.includes(behavior), behavior);
  assert.match(controller, /video\.removeAttribute\("src"\)/);
  assert.match(controller, /defaultPlaybackRate = 0\.7/);
  assert.match(controller, /paused \|\| reduced \|\| document.hidden \|\| !inView/);
});

test("screenshot overlay and obsolete cover controls stay removed", () => {
  for (const obsolete of ["night-process", "night-step", "MEMORY IN MOTION", "goToStep", "onStep", "night-controls", "night-skip", "night-scroll-cue", "night-corner", "RotateCcw", "跳过开场"])
    assert.ok(!(source + controller + css).includes(obsolete), obsolete);
  const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /focus-motion-toggle/);
  assert.match(app, /useState\(\s*\(\) => matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches/);
});

test("cover keeps the approved headline typography and native media crop", () => {
  const content = readFileSync(new URL("../src/content.mjs", import.meta.url), "utf8");
  assert.match(content, /heroTitle:\s*\["让 Agent 记得，", "让记忆延续。"\]/);
  assert.match(content, /heroTitle:\s*\["Memory your Agent can use\.", "Continuity across every task\."\]/);
  assert.doesNotMatch(content, /管得住|Control your team/);
  assert.match(css, /\.night-copy\s*\{[^}]*text-align:\s*center/);
  assert.match(css, /@media \(min-width: 901px\) \{\s*\.night-copy h1 \{[^}]*display: flex;[^}]*justify-content: center;[^}]*white-space: nowrap;/);
  assert.match(css, /aspect-ratio:\s*16\s*\/\s*9/);
  assert.match(css, /max-height:\s*80%/);
  assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*?\.night-media\s*\{\s*height:\s*56%;/);
  assert.doesNotMatch(source, /memory16-user-(desktop|mobile)|city-glide/);
});
