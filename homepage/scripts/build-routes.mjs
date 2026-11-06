import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { build } from "esbuild";
import { routeHref, sitePages, siteOrigin, statusDate } from "../src/site-pages.mjs";

const escape = value => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const temporary = await mkdtemp(resolve(".route-build-"));
try {
  await build({ entryPoints: ["scripts/render-pages.tsx"], bundle: true, format: "esm", platform: "node", packages: "external", jsx: "automatic", outfile: join(temporary, "render.mjs") });
  const { renderPage } = await import(pathToFileURL(join(temporary, "render.mjs")).href);
  const base = await readFile("dist/index.html", "utf8");
  for (const page of [...sitePages, { path: "/404", nav: { zh: "页面未找到" }, description: { zh: "地址可能有误，请返回首页继续浏览。" } }]) {
    const title = escape(page.nav.zh + " · SixteenMemory"), description = escape(page.description.zh), canonical = siteOrigin + routeHref(page.path);
    let html = base.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`)
      .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${description}$2`)
      .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/, `$1${title}$2`)
      .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${description}$2`)
      .replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/, `$1${canonical}$2`)
      .replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/, `$1${canonical}$2`)
      .replace(/<link\s+rel="preload"\s+as="image"[^>]*\/?>/, "")
      .replace('<div id="root"></div>', `<div id="root">${renderPage(page.path)}</div>`);
    if (page.path === "/404") html = html.replace("</head>", '<meta name="robots" content="noindex"></head>');
    const file = page.path === "/404" ? "dist/404.html" : join("dist", page.path.slice(1), "index.html");
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, html);
  }
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${["/", ...sitePages.map(page => page.path)].map(path => `  <url><loc>${siteOrigin}${routeHref(path)}</loc><lastmod>${statusDate}</lastmod></url>`).join("\n")}\n</urlset>\n`;
  await writeFile("dist/sitemap.xml", sitemap);
  console.log(`Rendered ${sitePages.length} content pages and 404 with route-specific metadata. No deployment.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
