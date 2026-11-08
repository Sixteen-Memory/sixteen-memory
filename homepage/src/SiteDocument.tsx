import { useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, ChevronRight, Code2, Copy, Database, Fingerprint, Layers3, Search, ShieldCheck } from "lucide-react";
import { consoleUrl, contactEmail, quickstartUrl, sdkDownloadUrl, sdkPackageUrl, openapiUrl } from "./content.mjs";
import { endpoints, snippets } from "./developer-examples.mjs";
import { capabilities, primaryNavigation, routeHref, sitePages, states, statusDate } from "./site-pages.mjs";
import DeveloperMenu from "./DeveloperMenu";
import BrandLogo from "./BrandLogo";

type Language = "zh" | "en";
type Page = (typeof sitePages)[number];
type Pair = { zh: string; en: string };
export function StateBadge({ state, language }: { state: keyof typeof states; language: Language }) {
  return <span className={`state-badge state-${state}`}><i aria-hidden="true" />{states[state][language]}</span>;
}
export function SiteHeader({ language, path, onLanguage }: { language: Language; path: string; onLanguage?: () => void }) {
  const zh = language === "zh";
  const links = (compact = false) => primaryNavigation.map(link => link.path === "/docs" ? <DeveloperMenu key={link.path} language={language} compact={compact}/> : <a key={link.path} href={routeHref(link.path, language)}
    aria-current={path === link.path || (link.path === "/product/memory" && path.startsWith("/product/")) ? "page" : undefined}>{link[language]}</a>);
  return <header className="site-header">
    <a className="site-logo" href={routeHref("/", language)} aria-label="SixteenMemory home"><BrandLogo/></a>
    <nav aria-label={zh ? "主导航" : "Main navigation"}>{links()}</nav>
    <div className="site-actions">
      <button className="site-language" onClick={onLanguage} aria-label={zh ? "Switch to English" : "切换至中文"}>{zh ? "EN" : "中"}</button>
      <a className="site-console" href={consoleUrl} target="_blank" rel="noreferrer">{zh ? "控制台" : "Console"}<ArrowUpRight size={14} /></a>
      <details className="site-mobile-menu"><summary>{zh ? "菜单" : "Menu"}</summary><div onClick={event => {
        if ((event.target as Element).closest("a")) event.currentTarget.closest("details")?.removeAttribute("open");
      }} onKeyDown={event => {
        if (event.key === "Escape") { const details = event.currentTarget.closest("details"); details?.removeAttribute("open"); details?.querySelector("summary")?.focus(); }
      }}>{links(true)}<a href={routeHref("/security", language)}>{zh ? "安全" : "Security"}</a><a href={routeHref("/deployment", language)}>{zh ? "部署" : "Deployment"}</a><a href={routeHref("/usage", language)}>{zh ? "试用与用量" : "Access and usage"}</a></div></details>
    </div>
  </header>;
}
export function SiteMap({ language }: { language: Language }) {
  const zh = language === "zh";
  return <div className="site-map">
    <div><BrandLogo/><span>{zh ? "记住重要信息，延续每一次任务。" : "Keep what matters. Continue the work."}</span></div>
    {[
      { title: zh ? "产品" : "Product", paths: ["/product/memory", "/product/retrieval", "/status"] },
      { title: zh ? "开发" : "Build", paths: ["/docs", "/integrations", "/usage"] },
      { title: zh ? "信任与部署" : "Trust and deployment", paths: ["/security", "/deployment"] }
    ].map(group => <nav key={group.title} aria-label={group.title}><strong>{group.title}</strong>{group.paths.map(path => <a key={path} href={routeHref(path, language)}>{sitePages.find(page => page.path === path)!.nav[language]}</a>)}</nav>)}
  </div>;
}
function MemoryPreview({ language, kind }: { language: Language; kind: string }) {
  const zh = language === "zh";
  const groups: Record<string, { icon: typeof Database; tag: string; title: string; rows: [string, string][] }> = {
    memory: { icon: Database, tag: "MEMORY / 0042", title: zh ? "一次更新，保留来处。" : "A change. Its source retained.", rows: [[zh ? "当前信息" : "Current", zh ? "偏好以中文沟通" : "Prefers Chinese communication"], [zh ? "来源" : "Source", "conversation / session-42"], [zh ? "版本" : "Version", "v2 → history preserved"]] },
    retrieval: { icon: Search, tag: "RETRIEVAL / SCOPED", title: zh ? "先找到，再继续。" : "Find it. Then continue.", rows: [["query", zh ? "客户偏好怎样沟通？" : "How does the customer prefer to communicate?"], ["user_id", "customer-42"], ["result", zh ? "内容 + 来源 + 版本" : "Content + source + version"]] },
    integrations: { icon: Code2, tag: "YOUR APPLICATION", title: zh ? "已有的工作流，多一份记忆。" : "Your workflow. With memory.", rows: [["01", "Your Agent"], ["02", "REST / JavaScript"], ["03", "SixteenMemory API"]] },
    docs: { icon: BookOpen, tag: "QUICKSTART / V0.1", title: zh ? "从保存到再次找到。" : "From saved to found again.", rows: [["POST", "/v1/memories"], ["POST", "/v1/search"], ["GET", "/v1/memories/:id/history"]] },
    security: { icon: ShieldCheck, tag: "SCOPE / EVIDENCE / CONTROL", title: zh ? "让范围可见，让操作明确。" : "Visible scope. Explicit actions.", rows: [[zh ? "谁能访问" : "Who", zh ? "用户范围 + Key 权限" : "User scope + key role"], [zh ? "从何而来" : "Where from", zh ? "应用提交的来源" : "Application-provided source"], [zh ? "如何管理" : "Control", zh ? "更新 / 停用 / 删除" : "Update / deactivate / delete"]] },
    deployment: { icon: Layers3, tag: "SEPARATE DEPLOYMENTS", title: zh ? "网站与服务，各自推进。" : "Website and service. Separately.", rows: [["01", "Website / static Pages"], ["02", "Console / management UI"], ["03", "Memory API / Worker + SQLite"]] },
    usage: { icon: Fingerprint, tag: "DEVELOPER PREVIEW", title: zh ? "从一个用户范围开始。" : "Start with one user scope.", rows: [[zh ? "访问" : "Access", zh ? "管理员分配 Key" : "Administrator-issued key"], [zh ? "数据" : "Data", zh ? "先使用合成数据" : "Synthetic data first"], [zh ? "下一步" : "Next", zh ? "讨论具体业务场景" : "Discuss a specific use case"]] },
    status: { icon: Layers3, tag: `AS OF ${statusDate}`, title: zh ? "线上与开发，清楚分开。" : "Online and development. Distinct.", rows: [[zh ? "线上" : "Online", "v0.1.0 / explicit / lexical"], [zh ? "开发版本" : "Development", "v0.2.1 / not published"], [zh ? "这张页面" : "This page", zh ? "功能说明，非实时监控" : "Availability, not live monitoring"]] }
  };
  const data = groups[kind]; const Icon = data.icon;
  return <aside className="page-preview" aria-label={zh ? "产品结构示意" : "Product structure illustration"}>
    <div className="preview-top"><span><i />{data.tag}</span><Icon size={19}/></div>
    <div className="preview-orbit" aria-hidden="true"><div/><div/><Icon size={35}/><span className="orbit-node node-one"/><span className="orbit-node node-two"/></div>
    <h2>{data.title}</h2>
    <dl>{data.rows.map(([key, value]) => <div key={key + value}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
    <p className="preview-caption">{zh ? "界面示意 · 不连接账户或真实数据" : "Illustration · no account or live data connection"}</p>
  </aside>;
}
function CodeExample({ language }: { language: Language }) {
  const [tab, setTab] = useState<"js" | "rest">("js");
  const [notice, setNotice] = useState("");
  const zh = language === "zh";
  return <div className="docs-code code-window">
    <div className="code-bar"><div role="tablist" aria-label={zh ? "示例语言" : "Example language"}>{(["js", "rest"] as const).map((key, index) => <button key={key} role="tab" id={`docs-${key}`} aria-controls="docs-code-panel" aria-selected={tab === key} tabIndex={tab === key ? 0 : -1}
      onClick={() => { setTab(key); setNotice(""); }} onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const next = event.key === "Home" ? "js" : event.key === "End" ? "rest" : tab === "js" ? "rest" : "js";
        setTab(next); setNotice(""); document.getElementById(`docs-${next}`)?.focus();
      }}>{index ? "REST API" : "JavaScript"}</button>)}</div>
      <button className="copy-code" aria-label={zh ? "复制代码" : "Copy code"} onClick={async () => {
        try { await navigator.clipboard.writeText(snippets[tab]); setNotice(zh ? "已复制" : "Copied"); }
        catch { setNotice(zh ? "复制失败，请手动选择代码。" : "Copy failed. Please select the code manually."); }
      }}><Copy size={14}/>{zh ? "复制" : "Copy"}</button>
    </div>
    <pre id="docs-code-panel" role="tabpanel" aria-labelledby={`docs-${tab}`} tabIndex={0}><code>{snippets[tab]}</code></pre>
    <p className="copy-feedback" role="status">{notice}</p>
  </div>;
}
function DocsExtras({ id, language }: { id: string; language: Language }) {
  const zh = language === "zh";
  if (id === "getting-started") return <>
    <div className="page-inline-links"><a href={sdkPackageUrl} download>{zh ? "下载类型化 SDK" : "Download typed SDK"}<ArrowDown size={15}/></a><a href={openapiUrl} download>OpenAPI 3.1<ArrowDown size={15}/></a><a href={sdkDownloadUrl} download>{zh ? "旧版 JS 源码" : "Legacy JS source"}<ArrowDown size={15}/></a><a href={quickstartUrl} target="_blank" rel="noreferrer">Quickstart<ArrowUpRight size={15}/></a></div>
    <pre className="docs-install"><code>{`npm install https://www.sixteenmemory.com${sdkPackageUrl}\n\nimport { SixteenMemory, type Memory } from "@sixteen-memory/sdk";`}</code></pre>
    <CodeExample language={language}/>
    <div className="endpoint-list docs-endpoints" id="api-reference">{endpoints.map(([method, path, purpose]) => <div key={method + path}><span>{method}</span><code>{path}</code><p>{purpose.split(" / ")[zh ? 0 : 1]}</p></div>)}</div>
  </>;
  if (id === "request-fields") return <div className="docs-table-wrap"><table className="docs-table"><thead><tr><th>{zh ? "字段" : "Field"}</th><th>{zh ? "含义" : "Meaning"}</th></tr></thead><tbody>{[
    ["user_id", zh ? "Key 允许访问的用户标识" : "The user identifier permitted by the key"],
    ["request_id", zh ? "新增请求的唯一标识；同请求重试保持不变" : "Unique create request ID; preserve it when repeating the same request"],
    ["content", zh ? "要保存的记忆正文，最多 8,000 字符" : "Memory content, up to 8,000 characters"],
    ["source", zh ? "type、ref、text、observed_at：来源类型、标识、正文和时间" : "type, ref, text, observed_at: source type, reference, text and timestamp"],
    ["expires_at", zh ? "可选到期时间；不设置时为 null" : "Optional expiry timestamp; null when not set"],
    ["expected_version", zh ? "更新、停用或删除时提供当前版本" : "Current version for update, deactivation or deletion"]
  ].map(([field, meaning]) => <tr key={field}><td><code>{field}</code></td><td>{meaning}</td></tr>)}</tbody></table></div>;
  return <div className="docs-error-list">{[
    ["401", zh ? "检查凭证是否缺失、无效或已退出。" : "Check for a missing, invalid or signed-out credential."],
    ["403 / 404", zh ? "确认角色与用户范围；不要尝试绕过权限。" : "Confirm role and user scope; do not bypass access checks."],
    ["409", zh ? "重新读取当前版本，或检查请求 ID 是否用于不同内容。" : "Read the current version or check whether the request ID was used for different content."],
    ["422", zh ? "按字段说明检查内容、来源、标识和日期格式。" : "Check content, source, identifiers and date format."],
    ["429", zh ? "按 Retry-After 等待，降低请求频率。" : "Respect Retry-After and reduce request frequency."],
    ["503", zh ? "服务或模型配置暂不可用，先检查配置和服务状态。" : "Service or model configuration is unavailable; inspect configuration and service status."]
  ].map(([code, text]) => <div key={code}><code>{code}</code><p>{text}</p></div>)}</div>;
}
function Integrations({ language }: { language: Language }) {
  const zh = language === "zh";
  return <div className="integration-cards">{[
    { icon: Code2, name: "REST API", detail: zh ? "从应用服务端调用，不绑定 Agent 框架。" : "Call from your application server without an agent-framework dependency.", href: routeHref("/docs", language), action: zh ? "查看文档" : "Read docs" },
    { icon: Code2, name: "TypeScript / JavaScript SDK", detail: zh ? "类型化请求和响应，无运行时依赖。通过官网下载包安装，尚未发布到 npm 注册表。" : "Typed requests and responses with no runtime dependencies. Install the website package; not published to the npm registry.", href: sdkPackageUrl, action: zh ? "下载 SDK" : "Download SDK", download: true },
    { icon: BookOpen, name: "OpenAPI 3.1", detail: zh ? "线上 v0.1 的字段、权限、错误和分页说明。不包含尚未上线的智能接口。" : "Fields, permissions, errors and pagination for online v0.1. Unreleased intelligence endpoints are excluded.", href: openapiUrl, action: zh ? "下载规范" : "Download specification", download: true },
    { icon: Database, name: zh ? "管理控制台" : "Management console", detail: zh ? "检查记忆、来源、版本、Key 与请求记录。" : "Inspect memories, sources, versions, keys and request records.", href: consoleUrl, action: zh ? "打开控制台" : "Open console" }
  ].map(entry => <article key={entry.name}><entry.icon size={24}/><h3>{entry.name}</h3><p>{entry.detail}</p><a href={entry.href} download={entry.download || undefined} target={entry.href.startsWith("https:") ? "_blank" : undefined} rel={entry.href.startsWith("https:") ? "noreferrer" : undefined}>{entry.action}<ArrowUpRight size={15}/></a></article>)}</div>;
}
function Availability({ language }: { language: Language }) {
  const [filter, setFilter] = useState("all");
  const zh = language === "zh";
  return <>
    <div className="availability-controls" aria-label={zh ? "筛选功能状态" : "Filter feature availability"}>{["all", "live", "local", "planned"].map(state => <button key={state} aria-pressed={filter === state} onClick={() => setFilter(state)}>{state === "all" ? zh ? "全部" : "All" : states[state as keyof typeof states][language]}<span>{state === "all" ? capabilities.length : capabilities.filter(c => c.state === state).length}</span></button>)}</div>
    <p className="sr-only" role="status">{zh ? "显示" : "Showing"} {capabilities.filter(c => filter === "all" || c.state === filter).length} {zh ? "项能力" : "capabilities"}</p>
    <div className="capability-list">{capabilities.filter(c => filter === "all" || c.state === filter).map(item => <article key={item.id}><StateBadge state={item.state as keyof typeof states} language={language}/><h3><a href={routeHref(item.path, language)}>{item.title[language]}<ArrowUpRight size={15}/></a></h3><p>{item.detail[language]}</p></article>)}</div>
  </>;
}
function DocumentFooter({ language }: { language: Language }) {
  const zh = language === "zh";
  return <footer className="document-footer"><div className="document-footer-cta"><p className="product-kicker">BUILD WITH MEMORY</p><h2>{zh ? "下一次对话，不必从零开始。" : "The next conversation need not start from zero."}</h2><a className="button-primary" href={routeHref("/docs", language)}>{zh ? "开始接入" : "Start building"}<ArrowRight size={16}/></a><a className="button-link" href={`mailto:${contactEmail}`}>{zh ? "讨论接入场景" : "Discuss your use case"}<ArrowUpRight size={16}/></a></div><SiteMap language={language}/><div className="document-footer-bottom"><span>© {new Date().getFullYear()} SixteenMemory</span><span>{zh ? "无注册表单 · 无第三方分析脚本" : "No signup form · no third-party analytics"}</span><a href={`mailto:${contactEmail}`}>{contactEmail}</a></div></footer>;
}
export default function SiteDocument({ page, language, onLanguage }: { page?: Page; language: Language; onLanguage?: () => void }) {
  const zh = language === "zh";
  if (!page) return <div className="site-document"><SiteHeader language={language} path="" onLanguage={onLanguage}/><main id="main" className="not-found"><p className="product-kicker">404 / NOT FOUND</p><h1>{zh ? "这段记忆还不存在。" : "This page is not here."}</h1><p>{zh ? "地址可能有误，或页面已移动。" : "The address may be incorrect or the page may have moved."}</p><a className="button-primary" href={routeHref("/", language)}>{zh ? "返回首页" : "Back home"}<ArrowRight size={16}/></a></main><DocumentFooter language={language}/></div>;
  return <div className={`site-document document-${page.kind}`}>
    <a className="skip-link" href="#main">{zh ? "跳至正文" : "Skip to content"}</a>
    <SiteHeader language={language} path={page.path} onLanguage={onLanguage}/>
    <main id="main">
      <div className="page-hero">
        <div className="page-hero-copy"><div className="page-breadcrumb"><a href={routeHref("/", language)}>{zh ? "首页" : "Home"}</a><ChevronRight size={12}/><span>{page.nav[language]}</span></div>
          <p className="product-kicker">{page.kicker}</p><h1>{page.title[language].split("\n").map(line => <span key={line}>{line}</span>)}</h1><p className="page-intro">{page.description[language]}</p>
          <div className="page-hero-actions"><a className="button-primary" href={page.kind === "docs" ? "#getting-started" : routeHref("/docs", language)}>{zh ? "开始接入" : "Start building"}<ArrowRight size={16}/></a><a className="button-link" href={page.kind === "status" ? "#availability" : routeHref("/status", language)}>{zh ? "查看功能状态" : "Check availability"}<ArrowUpRight size={15}/></a></div>
        </div><MemoryPreview language={language} kind={page.kind}/>
      </div>
      <div className="page-body"><aside className="page-outline"><p>{zh ? "本页内容" : "ON THIS PAGE"}</p><nav aria-label={zh ? "本页内容" : "On this page"}>{page.sections.map((section, i) => <a key={section.id} href={`#${section.id}`}><span>0{i + 1}</span>{section.title[language].replace(/[。.]$/, "")}</a>)}</nav><div><a className="state-badge" href={routeHref("/status", language)}>{zh ? "查看产品状态" : "View availability"}<ArrowUpRight size={12}/></a><small>{zh ? "线上 v0.1.0 · 开发 v0.2.1" : "Online v0.1.0 · dev v0.2.1"}</small></div></aside>
        <div className="page-sections">{page.sections.map(section => <section className="document-section" id={section.id} key={section.id} aria-labelledby={`${section.id}-title`}>
          <h2 id={`${section.id}-title`}>{section.title[language]}</h2><p className="section-intro">{section.body[language]}</p>
          {section.items.length > 0 && <div className="document-cards">{section.items.map((entry: { title: Pair; body: Pair; state?: string }) => <article key={entry.title.en}>{entry.state && <StateBadge state={entry.state as keyof typeof states} language={language}/>}<h3>{entry.title[language]}</h3><p>{entry.body[language]}</p></article>)}</div>}
          {page.kind === "docs" && <DocsExtras id={section.id} language={language}/>}
          {page.kind === "integrations" && section.id === "available-tools" && <Integrations language={language}/>}
          {page.kind === "status" && section.id === "availability" && <Availability language={language}/>}
          {page.kind === "deployment" && section.id === "architecture" && <div className="deployment-flow">{["Website", "Console", "Memory API"].map((name, i) => <div key={name}><span>0{i+1}</span><strong>{name}</strong><small>{["Static Pages", "Management UI", "Worker + SQLite"][i]}</small></div>)}</div>}
          {page.kind === "usage" && section.id === "access" && <div className="page-inline-links"><a href={`mailto:${contactEmail}`}>{contactEmail}<ArrowUpRight size={16}/></a><a href={consoleUrl} target="_blank" rel="noreferrer">{zh ? "打开控制台" : "Open console"}<ArrowUpRight size={16}/></a></div>}
          {page.kind === "security" && section.id === "data-path" && <details className="document-note"><summary>{zh ? "这个网站如何使用数据？" : "How does this website use data?"}</summary><p>{zh ? "本网站没有注册表单，也不加载第三方分析脚本。托管服务商可能为运行与安全记录必要访问日志。语言选择仅保留在当前页面 URL。控制台和 API 是独立产品服务。" : "This site has no signup forms or third-party analytics. The hosting provider may retain essential operational and security access logs. Language choice is kept only in the page URL. The console and API are separate product services."}</p></details>}
        </section>)}</div>
      </div>
      <section className="related-pages" aria-labelledby="related-title"><p className="product-kicker">{zh ? "继续了解" : "KEEP EXPLORING"}</p><h2 id="related-title">{zh ? "把下一步接起来。" : "Connect the next step."}</h2><div>{page.related.map(path => { const next = sitePages.find(page => page.path === path)!; return <a href={routeHref(path, language)} key={path}><span>{next.nav[language]}</span><ArrowUpRight size={21}/><p>{next.description[language]}</p></a>; })}</div></section>
    </main>
    <DocumentFooter language={language}/>
  </div>;
}
