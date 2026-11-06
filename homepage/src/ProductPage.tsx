import { useState } from "react";
import { ArrowUpRight, Check, Copy, Download, ExternalLink } from "lucide-react";
import { apiHealthUrl, consoleUrl, quickstartUrl, content } from "./content.mjs";

import { snippets, endpoints } from "./developer-examples.mjs";

type Language = "zh" | "en";
type PageCopy = (typeof content)[Language];
type Snippet = "js" | "rest";


function SectionHead({ id, kicker, title, intro }: { id: string; kicker: string; title: string | string[]; intro?: string }) {
  const lines = Array.isArray(title) ? title : [title];
  return <header className="product-heading rise-item"><p className="product-kicker">{kicker}</p><h2 id={id}>{lines.map((line) => <span key={line}>{line}</span>)}</h2>{intro && <p>{intro}</p>}</header>;
}

export default function ProductPage({ language, copy }: { language: Language; copy: PageCopy }) {
  const [tab, setTab] = useState<Snippet>("js");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const c = copy;
  function selectTab(value: Snippet) {
    setTab(value);
    setCopyState("idle");
  }
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(snippets[tab]);
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }
  return <>
    <section className="dev-entry reveal-section" id="developers" aria-labelledby="developers-title">
      <div className="product-shell dev-grid">
        <div>
          <header className="product-heading rise-item"><p className="product-kicker">{c.integration.kicker}</p><h2 id="developers-title">{c.integration.title.map((line: string) => <span key={line}>{line}</span>)}</h2><p>{c.integration.intro}</p></header>
          <div className="dev-links rise-item"><a className="button-primary" href={quickstartUrl} target="_blank" rel="noreferrer">{c.quickstart}<ArrowUpRight size={17}/></a><a className="button-link" href={consoleUrl} target="_blank" rel="noreferrer">{c.console}<ExternalLink size={15}/></a></div>
          <dl className="availability rise-item">{c.integration.labels.map((label, i) => <div key={label}><dt>{label}</dt><dd><i aria-hidden="true" />{c.integration.values[i]}</dd></div>)}</dl>
        </div>
        <div className="code-window rise-item" aria-label={language === "zh" ? "接入代码示例" : "Integration code example"}>
          <div className="code-bar">
            <div role="tablist" aria-label={language === "zh" ? "代码语言" : "Code language"}>
              {c.integration.tabs.map((label, i) => {
                const value: Snippet = i ? "rest" : "js";
                return <button key={value} id={`snippet-${value}`} role="tab" aria-selected={tab === value} aria-controls="snippet-panel" tabIndex={tab === value ? 0 : -1} onClick={() => selectTab(value)} onKeyDown={(event) => {
                  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                  event.preventDefault();
                  const next: Snippet = event.key === "Home" ? "js" : event.key === "End" ? "rest" : value === "js" ? "rest" : "js";
                  selectTab(next);
                  document.getElementById(`snippet-${next}`)?.focus();
                }}>{label}</button>;
              })}
            </div>
            <button className="copy-code" onClick={() => void copyCode()} aria-label={language === "zh" ? "复制代码" : "Copy code"}>{copyState === "copied" ? <Check size={15}/> : <Copy size={15}/>}<span>{copyState === "copied" ? (language === "zh" ? "已复制" : "Copied") : (language === "zh" ? "复制" : "Copy")}</span></button>
          </div>
          <pre id="snippet-panel" role="tabpanel" aria-labelledby={`snippet-${tab}`} tabIndex={0}><code>{snippets[tab]}</code></pre>
          <p className="copy-feedback" role="status">{copyState === "error" ? (language === "zh" ? "复制失败，请选中代码手动复制。" : "Copy failed. Select the code and copy it manually.") : copyState === "copied" ? (language === "zh" ? "代码已复制。" : "Code copied.") : ""}</p>
        </div>
      </div>
    </section>

    <section className="resources reveal-section" id="resources" aria-labelledby="resources-title"><div className="product-shell">
      <SectionHead id="resources-title" kicker={c.resources.kicker} title={c.resources.title} intro={c.resources.intro}/>
      <div className="resource-grid">{c.resources.items.map((item) => <article className={`resource-card rise-item resource-${item.id}`} key={item.id}>
        <div><h3>{item.name}</h3><span>{item.state}</span></div><p>{item.body}</p>
        {item.href ? <a href={item.href} target={item.href.startsWith("http") ? "_blank" : undefined} rel={item.href.startsWith("http") ? "noreferrer" : undefined} download={item.download || undefined}>{item.download ? <Download size={14}/> : <ArrowUpRight size={14}/>} {item.action}</a> : <small>{item.action}</small>}
      </article>)}</div>
    </div></section>

    <section className="api-reference reveal-section" id="api-reference" aria-labelledby="api-title"><div className="product-shell api-layout">
      <SectionHead id="api-title" kicker="REST API / V0.1" title={language === "zh" ? ["当前线上接口，", "按完整使用周期组织。"] : ["The live API,", "organized by lifecycle."]} intro={language === "zh" ? "所有业务接口都需要 Bearer Key。普通 Key 绑定一个用户范围；更新和删除需要当前版本号。" : "Every business endpoint requires a Bearer key. Regular keys are scoped to one user; updates and deletes require the current version."}/>
      <div className="endpoint-list rise-item">{endpoints.map(([method, path, purpose]) => <div key={`${method}${path}`}><span>{method}</span><code>{path}</code><p>{purpose.split(" / ")[language === "zh" ? 0 : 1]}</p></div>)}</div>
      <aside className="api-facts rise-item"><p>{language === "zh" ? "当前发布版本" : "Published version"}</p><strong>v0.1.0 · lexical · explicit</strong><p className="api-limit-note">{language === "zh" ? "以下为接口上限，不代表已验证的生产容量。" : "These are interface limits, not verified production capacity."}</p><ul><li>64 KiB / request</li><li>8,000 chars / content</li><li>10,000 current memories / project</li><li>1–50 search results</li></ul><a href={quickstartUrl} target="_blank" rel="noreferrer">{c.quickstart}<ArrowUpRight size={14}/></a><a href={apiHealthUrl} target="_blank" rel="noreferrer">{language === "zh" ? "查看产品健康接口" : "View product health"}<ExternalLink size={14}/></a></aside>
    </div></section>

    <section className="proof reveal-section" id="product" aria-labelledby="proof-title"><div className="product-shell"><SectionHead id="proof-title" kicker={c.proof.kicker} title={c.proof.title} intro={c.proof.intro}/><div className="proof-list">{c.proof.items.map(([title, body]: string[], i: number) => <article className="proof-row capability-row" key={title}><span>0{i+1}</span><h3>{title}</h3><p>{body}</p></article>)}</div></div></section>

    <section className="lifecycle reveal-section" id="lifecycle" aria-labelledby="lifecycle-title"><div className="product-shell"><SectionHead id="lifecycle-title" kicker={c.lifecycle.kicker} title={c.lifecycle.title} intro={c.lifecycle.intro}/><ol className="lifecycle-list">{c.lifecycle.steps.map(([number, title, body]: string[]) => <li className="capability-row" key={number}><span>{number}</span><h3>{title}</h3><p>{body}</p></li>)}</ol></div></section>

    <section className="usecase reveal-section" id="usecase" aria-labelledby="usecase-title"><div className="product-shell usecase-layout"><div><SectionHead id="usecase-title" kicker={c.usecase.kicker} title={c.usecase.title} intro={c.usecase.intro}/><p className="usecase-note rise-item">{c.usecase.note}</p></div><div className="usecase-visual rise-item"><img src="/assets/agent-roundtable-2d.svg" width="1536" height="1024" alt={language === "zh" ? "15 个 Agent 与一位真人围桌交流的二维插画" : "Flat illustration of fifteen agents and one person talking around a table"}/></div><div className="usecase-cards">{c.usecase.cards.map(([title, body]: string[], i: number) => <article className="capability-row" key={title}><span>0{i+1}</span><h3>{title}</h3><p>{body}</p></article>)}</div></div></section>

    <section className="enterprise reveal-section" id="enterprise" aria-labelledby="enterprise-title"><div className="product-shell"><SectionHead id="enterprise-title" kicker={c.enterprise.kicker} title={c.enterprise.title}/><div className="enterprise-grid">{c.enterprise.items.map(([title, body]: string[]) => <article className="rise-item" key={title}><h3>{title}</h3><p>{body}</p></article>)}</div></div></section>

    <section className="product-status reveal-section" id="status" aria-labelledby="status-title"><div className="product-shell status-layout"><SectionHead id="status-title" kicker={c.status.kicker} title={c.status.title}/><div className="status-column rise-item"><p className="status-label is-live">{c.status.liveTitle}</p><ul>{c.status.live.map((x: string) => <li key={x}><Check size={16}/>{x}</li>)}</ul></div><div className="status-column rise-item"><p className="status-label">{c.status.nextTitle}</p><ul>{c.status.next.map((x: string) => <li key={x}><span aria-hidden="true">—</span>{x}</li>)}</ul><p className="status-boundary">{c.status.boundary}</p></div></div></section>

    <section className="product-cta reveal-section" id="start" aria-labelledby="start-title"><div className="product-shell cta-layout"><SectionHead id="start-title" kicker={c.cta.kicker} title={c.cta.title} intro={c.cta.intro}/><div className="cta-actions rise-item"><a className="button-primary" href={quickstartUrl} target="_blank" rel="noreferrer">{c.quickstart}<ArrowUpRight size={17}/></a><a className="button-link" href={consoleUrl} target="_blank" rel="noreferrer">{c.console}<ExternalLink size={15}/></a></div></div></section>
  </>;
}
