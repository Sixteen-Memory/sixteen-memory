import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const hero = readFileSync(new URL("../src/video-hero.css", import.meta.url), "utf8");
const rule = (text, selector) => {
  const start = text.indexOf(`${selector} {`);
  assert.ok(start >= 0, selector);
  return text.slice(start, text.indexOf("}", start));
};

test("body typography stays local while the header has its own licensed typefaces", () => {
  for (const filename of [
    "inter-latin.woff2", "Inter-LICENSE.txt",
    "inter-tight-latin.woff2", "InterTight-LICENSE.txt",
    "caveat-600.ttf", "Caveat-LICENSE.txt",
    "instrument-serif.woff", "instrument-serif-italic.woff", "InstrumentSerif-LICENSE.txt",
    "manrope.woff", "Manrope-LICENSE.txt"
  ]) assert.ok(existsSync(new URL(`../public/assets/${filename}`, import.meta.url)));
  assert.match(css, /font-family:\s*Caveat;[^}]*font-weight:\s*600;/);
  assert.match(css, /--font-ui:\s*Inter,/);
  assert.match(css, /--font-display:\s*"Inter Tight",/);
  assert.match(css, /"PingFang SC",\s*"Microsoft YaHei"/);
  assert.doesNotMatch(css, /Bodoni|Songti|STSong|Georgia|Noto Serif|font-family:[^;]*,\s*serif/);
  assert.doesNotMatch(css + hero, /@import|url\(["']?https:\/\/fonts\./);
});

test("official logo replaces the old typed wordmark while navigation keeps its typography", () => {
  assert.match(rule(hero, ".night-nav"), /font-family:\s*Manrope/);
  assert.match(rule(hero, ".night-nav nav a"), /font-size:\s*13px/);
  const source = readFileSync(new URL("../src/VideoHero.tsx", import.meta.url), "utf8");
  assert.match(source, /<BrandLogo\/>/);
  assert.doesNotMatch(source + hero, /night-wordmark-name|night-wordmark-caption|Sixteen<em>Memory/);
  assert.match(source, /aria-label="SixteenMemory home"/);
});

test("desktop headers place logo first, centered navigation next, and actions last", () => {
  const source = readFileSync(new URL("../src/VideoHero.tsx", import.meta.url), "utf8");
  const header = source.slice(source.indexOf('<header className="night-nav">'), source.indexOf("</header>"));
  assert.ok(header.indexOf('className="night-wordmark"') < header.indexOf("<nav "));
  assert.ok(header.indexOf("<nav ") < header.indexOf('className="night-actions"'));
  assert.match(rule(hero, ".night-nav"), /grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
  assert.match(rule(hero, ".night-wordmark"), /justify-self:\s*start/);
  assert.match(rule(hero, ".night-nav nav"), /justify-self:\s*center/);
  const page = readFileSync(new URL("../src/site-document.css", import.meta.url), "utf8");
  assert.match(rule(page, ".site-header"), /grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/);
  assert.match(rule(page, ".site-header > nav"), /justify-self:\s*center/);
  assert.match(rule(page, ".site-actions"), /justify-self:\s*end/);
});

test("headings use Inter Tight 700 and interface text uses Inter 400 or 500", () => {
  for (const selector of [".statement-title", ".facts-heading h2", ".contact-title", "dialog h2"]) {
    assert.match(rule(css, selector), /font-family:\s*var\(--font-display\)/);
    assert.match(rule(css, selector), /font-weight:\s*700/);
  }
  assert.match(rule(hero, ".night-copy h1"), /font-weight:\s*700/);
  assert.match(rule(hero, ".night-copy h1"), /font-size:\s*88px/);
  assert.match(rule(hero, ".night-copy h1"), /line-height:\s*1\.045455/);
  assert.match(rule(hero, ".night-copy h1"), /letter-spacing:\s*-0\.035em/);
  assert.match(rule(hero, ".night-copy h1 > span + span"), /letter-spacing:\s*-0\.022em/);
  assert.match(rule(hero, ".night-track"), /font-family:\s*var\(--font-ui\)/);
  assert.match(rule(hero, ".night-track"), /font-weight:\s*400/);
  assert.match(rule(hero, ".night-actions > *"), /font-weight:\s*500/);
  assert.match(rule(css, ".memory-panel blockquote"), /font-family:\s*var\(--font-ui\)/);
});

test("Caveat 600 is limited to existing Latin annotations", () => {
  for (const selector of [".chapter-number", ".portrait-wrap figcaption > span:first-child"]) {
    assert.match(rule(css, selector), /font-family:\s*var\(--font-note\)/);
    assert.match(rule(css, selector), /font-weight:\s*600/);
  }
  assert.doesNotMatch(hero, /Caveat|--font-note/);
});
