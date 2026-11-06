import { useEffect, useRef } from "react";
import { BookOpen, Braces, ChevronDown, Code2, Download, KeyRound, Server, ShieldCheck } from "lucide-react";
import { consoleUrl, sdkDownloadUrl } from "./content.mjs";
import { routeHref } from "./site-pages.mjs";

type Language = "zh" | "en";
type Props = { language: Language; compact?: boolean };
type Entry = { id: string; icon: typeof BookOpen; title: string; body: string; href?: string; external?: boolean; download?: boolean; planned?: boolean };

const labels = {
  zh: { trigger: "开发者", planned: "规划中", group: "开发者入口" },
  en: { trigger: "Developers", planned: "Planned", group: "Developer links" }
};

function entries(language: Language): Entry[] {
  const zh = language === "zh";
  return [
    { id: "docs", icon: BookOpen, title: zh ? "接入文档" : "Docs", body: zh ? "从创建凭证到保存和检索" : "From credentials to write and search", href: routeHref("/docs", language) },
    { id: "api", icon: Braces, title: zh ? "API 参考" : "API reference", body: zh ? "接口、字段与错误处理" : "Endpoints, fields and errors", href: routeHref("/docs#api-reference", language) },
    { id: "sdk", icon: Download, title: "JavaScript SDK", body: zh ? "下载无运行依赖的客户端源码" : "Download the dependency-free client source", href: sdkDownloadUrl, download: true },
    { id: "console", icon: KeyRound, title: zh ? "管理控制台" : "Console", body: zh ? "检查记忆、Key 与请求记录" : "Inspect memories, keys and requests", href: consoleUrl, external: true },
    { id: "security", icon: ShieldCheck, title: zh ? "安全与数据" : "Security & data", body: zh ? "权限、来源、删除与备份边界" : "Access, sources, deletion and backups", href: routeHref("/security", language) },
    { id: "status", icon: Server, title: zh ? "产品状态" : "Product status", body: zh ? "区分线上、开发中与规划能力" : "Online, development and planned work", href: routeHref("/status", language) },
    { id: "mcp", icon: Code2, title: "MCP", body: zh ? "只读召回入口尚未上线" : "Read-only recall entry is not live", planned: true }
  ];
}

export default function DeveloperMenu({ language, compact = false }: Props) {
  const root = useRef<HTMLDetailsElement>(null);
  const copy = labels[language];
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const menu = root.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  return <details ref={root} className={`developer-menu${compact ? " is-compact" : ""}`}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false;
    }} onKeyDown={event => {
      if (event.key === "Escape" && event.currentTarget.open) {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.open = false;
        root.current?.querySelector("summary")?.focus();
      }
    }}>
    <summary>{copy.trigger}<ChevronDown size={14} aria-hidden="true" /></summary>
    <div className="developer-menu-panel" aria-label={copy.group}>
      {entries(language).map(entry => {
        const Icon = entry.icon;
        if (entry.planned) return <div className="developer-menu-entry is-planned" key={entry.id} data-entry={entry.id}><Icon size={18} aria-hidden="true"/><span><strong>{entry.title}<small>{copy.planned}</small></strong><em>{entry.body}</em></span></div>;
        return <a className="developer-menu-entry" key={entry.id} data-entry={entry.id} href={entry.href} target={entry.external ? "_blank" : undefined} rel={entry.external ? "noreferrer" : undefined} download={entry.download || undefined} onClick={() => { if (root.current) root.current.open = false; }}><Icon size={18} aria-hidden="true"/><span><strong>{entry.title}</strong><em>{entry.body}</em></span></a>;
      })}
    </div>
  </details>;
}
