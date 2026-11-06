/**
 * Focused, offline documentation checks. No model calls, live credentials,
 * deployment or Markdown rendering service is used.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const excluded = new Set([".git", ".agent", "node_modules", "dist", "dist-worker", "dist-pages", ".local", ".wrangler", ".playwright-cli", "output"]);
const problems = [];
const documents = [];
const parsed = new Map();
let linksChecked = 0;
let languageFilesChecked = 0;

// Repository prose is English. Product localization and multilingual fixtures
// are deliberately outside this documentation-only language guard.
function checkDocumentationLanguage(path, text) {
  languageFilesChecked++;
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    if (/\p{Script=Han}/u.test(lines[index])) {
      problems.push(`${relative(root, path)}:${index + 1}: repository documentation must use English`);
    }
  }
}

async function walk(folder) {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (excluded.has(entry.name) || entry.name.startsWith(".route-build-")) continue;
    const path = resolve(folder, entry.name);
    if (entry.isSymbolicLink()) { problems.push(`${relative(root, path)}: unexpected symlink`); continue; }
    if (entry.isDirectory()) await walk(path);
    else if (entry.isFile() && extname(path) === ".md") documents.push(path);
  }
}
function slug(text) {
  return text.trim().toLowerCase().replace(/<[^>]+>/g, "").replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\p{M}\s_-]/gu, "").replace(/\s/g, "-");
}
async function parse(path) {
  if (parsed.has(path)) return parsed.get(path);
  const original = await readFile(path, "utf8");
  const prose = original.replace(/^(`{3,}|~{3,}).*[\r\n][\s\S]*?^\1\s*$/gm, "");
  const anchors = new Set();
  const counts = new Map();
  for (const match of prose.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const base = slug(match[1]), count = counts.get(base) ?? 0;
    anchors.add(base + (count ? `-${count}` : "")); counts.set(base, count + 1);
  }
  for (const match of prose.matchAll(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/g)) anchors.add(slug(match[1]));
  for (const match of prose.matchAll(/\bid=["']([^"']+)["']/g)) anchors.add(match[1]);
  const references = new Map([...prose.matchAll(/^\[([^\]]+)\]:\s*(\S+)/gm)].map(match => [match[1].toLowerCase(), match[2]]));
  const links = [
    ...[...prose.matchAll(/!?\[[^\]]*\]\(\s*(<[^>]+>|[^\s)]+)(?:\s+["'][^"']*["'])?\s*\)/g)].map(match => match[1].replace(/^<|>$/g, "")),
    ...[...prose.matchAll(/<(?:a|img)\b[^>]*\b(?:href|src)=["']([^"']+)["']/g)].map(match => match[1]),
  ];
  for (const match of prose.matchAll(/!?\[([^\]]+)\]\[([^\]]*)\]/g)) {
    const name = (match[2] || match[1]).toLowerCase();
    if (references.has(name)) links.push(references.get(name));
    else problems.push(`${relative(root, path)}: undefined link reference ${name}`);
  }
  const value = { original, prose, anchors, links };
  parsed.set(path, value); return value;
}
async function checkLink(from, href) {
  if (/^(?:https?:|mailto:|tel:)/i.test(href)) return;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) {
    problems.push(`${relative(root, from)}: unsupported link ${href}`); return;
  }
  let path, anchor;
  try {
    const hash = href.indexOf("#");
    path = decodeURIComponent((hash < 0 ? href : href.slice(0, hash)).split("?")[0]);
    anchor = hash < 0 ? "" : decodeURIComponent(href.slice(hash + 1));
  } catch { problems.push(`${relative(root, from)}: invalid URL encoding`); return; }
  const target = path ? resolve(path.startsWith("/") ? root : dirname(from), path.replace(/^\/+/, "")) : from;
  const rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel)) { problems.push(`${relative(root, from)}: link escapes repository: ${href}`); return; }
  linksChecked++;
  let info;
  try { info = await stat(target); } catch { problems.push(`${relative(root, from)}: missing target ${href}`); return; }
  if (info.isFile() && extname(target) === ".md" && anchor && !(await parse(target)).anchors.has(anchor)) {
    problems.push(`${relative(root, from)}: missing heading ${href}`);
  }
}
await walk(root);
for (const path of documents) {
  const { original, links } = await parse(path);
  checkDocumentationLanguage(path, original);
  for (const link of links) await checkLink(path, link);
}
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
for (const path of documents.filter(path => path === resolve(root, "README.md") || path.startsWith(resolve(root, "docs") + "/"))) {
  const { original } = await parse(path);
  for (const match of original.matchAll(/\bnpm run ([\w:-]+)/g)) {
    if (!packageJson.scripts[match[1]]) problems.push(`${relative(root, path)}: missing root npm script ${match[1]}`);
  }
}
const capabilities = JSON.parse(await readFile(resolve(root, "product/capabilities.json"), "utf8"));
checkDocumentationLanguage(resolve(root, "product/capabilities.json"), JSON.stringify(capabilities));
for (const item of capabilities.items) {
  for (const evidence of item.evidence ?? []) {
    await checkLink(resolve(root, "README.md"), evidence);
  }
}
for (const file of await readdir(resolve(root, "docs/assets"))) {
  if (!file.endsWith(".svg")) continue;
  const text = await readFile(resolve(root, "docs/assets", file), "utf8");
  checkDocumentationLanguage(resolve(root, "docs/assets", file), text);
  if (/<script\b|<foreignObject\b|\son[a-z]+\s*=|(?:href|src)=["'](?:https?:|\/\/|data:)/i.test(text)) {
    problems.push(`docs/assets/${file}: executable or external SVG content`);
  }
}
if (problems.length) {
  console.error(problems.join("\n")); process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "passed", markdown_files: documents.length, local_links_checked: linksChecked, capability_items: capabilities.items.length, language_files_checked: languageFilesChecked, language_guard: "English documentation; no Han-script text", product_localization_checked: false, network_requests: 0, model_calls: 0 }, null, 2));
}
