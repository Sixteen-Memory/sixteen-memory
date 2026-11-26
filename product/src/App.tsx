import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowRight, BookOpen, Check, ChevronRight, CircleAlert, Clock3, Copy, Database, FileClock, Globe, KeyRound, Layers, ListFilter, LogOut, Plus, RefreshCw, Search, ShieldCheck, SquarePen, Trash2, Undo2, X } from "lucide-react";
import { api, errorMessage, type Session, type RetrievalMode } from "./api";
import { Dialog } from "./Dialog";
import { I18nProvider, useI18n } from "./i18n";
import { MemoryEditor } from "./MemoryEditor";
import { IngestionPanel } from "./IngestionPanel";
import { ContextPanel } from "./ContextPanel";
import { KnowledgePanel } from "./KnowledgePanel";
import type { AuditRecord, HistoryRecord, KeyRecord, MemoryRecord } from "../worker/domain";

type View = "memories" | "search" | "ingest" | "context" | "knowledge" | "keys" | "requests";

export function App() {
  return <I18nProvider><AppShell /></I18nProvider>;
}

function AppShell() {
  const { t } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.me().then(setSession).catch(() => setSession(null)).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="boot"><Database size={28} /><span>{t("Connecting...", "连接中")}</span></div>;
  return session ? <Console session={session} logout={() => { api.logout().then(() => setSession(null)); }} /> : <Login onLogin={setSession} />;
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const { lang, toggle, t } = useI18n();
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { onLogin(await api.login(key)); setKey(""); }
    catch (error) { setError(errorMessage(error, t("Sign in failed. Please check your API key.", "登录失败，请检查 API Key"))); }
    finally { setBusy(false); }
  }
  return <main className="login">
    <div className="login-bar">
      <div className="login-brand"><img src="/brand.png" alt="" /><span>SixteenMemory</span></div>
      <button type="button" className="secondary lang-btn" onClick={toggle} aria-label={t("Switch language", "切换语言")}><Globe size={14} />{lang === "zh" ? "EN" : "中文"}</button>
    </div>
    <form onSubmit={submit}>
      <div className="login-symbol"><ShieldCheck size={26} /></div>
      <h1>{t("Memory Console", "记忆控制台")}</h1>
      <p className="muted">{t("Source-linked memory workspace", "拾陆记忆 · 来源可追溯工作区")}</p>
      <label>API Key<input autoFocus type="password" required autoComplete="off" value={key} onChange={e => setKey(e.target.value)} placeholder={t("Paste ADMIN_KEY or user-scoped key", "输入 ADMIN_KEY 或用户 Key")} /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="primary" disabled={busy}>{busy ? t("Connecting...", "连接中") : t("Sign in", "进入工作区")}<ArrowRight size={16} /></button>
    </form>
    <small>v0.3.0 · Apache-2.0</small>
  </main>;
}

function Console({ session, logout }: { session: Session; logout: () => void }) {
  const { lang, toggle, t, formatTime } = useI18n();
  const sourceName = { manual: t("Manual", "人工确认"), conversation: t("Conversation", "对话"), business: t("Business", "业务事件") };
  const actionName: Record<string, string> = {
    extracted: t("Extracted", "自动抽取"), superseded: t("Superseded", "事实替代"), created: t("Created", "保存"),
    updated: t("Updated", "更新"), revoked: t("Revoked", "撤销"), add: t("Add", "保存"), list: t("List", "列表"),
    get: t("Get", "读取"), history: t("History", "历史"), update: t("Update", "更新"), revoke: t("Revoke", "撤销"),
    delete: t("Delete", "删除"), search: t("Search", "检索"), export: t("Export", "导出"), keys: t("Keys", "Key 列表"),
    create_key: t("Create key", "创建 Key"), revoke_key: t("Revoke key", "撤销 Key"), me: t("Session", "会话"), audit: t("Requests", "请求记录"),
  };
  const failText = t("Request failed. Please try again.", "请求失败，请稍后重试");
  const [view, setView] = useState<View>("memories");
  const [userId, setUserId] = useState(session.user_id ?? "");
  const [filter, setFilter] = useState<"all" | "active" | "revoked">("all");
  const [rows, setRows] = useState<MemoryRecord[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<MemoryRecord | null>(null);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [editor, setEditor] = useState<MemoryRecord | "new" | null>(null);
  const [confirm, setConfirm] = useState<"delete" | "revoke" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<(MemoryRecord & { score: number })[]>([]);
  const [searched, setSearched] = useState(false);
  const [searchMode, setSearchMode] = useState<RetrievalMode>("lexical");
  const [retrieval, setRetrieval] = useState("lexical");
  const [answer, setAnswer] = useState("");
  const [keys, setKeys] = useState<KeyRecord[]>([]);
  const [requests, setRequests] = useState<AuditRecord[]>([]);
  const [keyForm, setKeyForm] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyUser, setKeyUser] = useState("");
  const [keyRole, setKeyRole] = useState<"read" | "write">("write");
  const [newKey, setNewKey] = useState("");
  const [revokeKey, setRevokeKey] = useState<KeyRecord | null>(null);
  const [opened, setOpened] = useState<MemoryRecord | null>(null);
  const [contextRevision, setContextRevision] = useState(0);
  const refreshVersion = useRef(0);
  const openVersion = useRef(0);
  const canWrite = session.role !== "read";

  const refresh = useCallback(async () => {
    const version = ++refreshVersion.current;
    setBusy(true); setError("");
    try {
      if (view === "memories") {
        const page = await api.list({ user_id: userId, status: filter });
        if (version !== refreshVersion.current) return;
        setRows(page.data); setCursor(page.next_cursor);
      } else if (view === "keys") { const data = await api.keys(); if (version === refreshVersion.current) setKeys(data); }
      else if (view === "requests") { const data = await api.requests(); if (version === refreshVersion.current) setRequests(data); }
      else if (view === "context" || view === "knowledge") setContextRevision(value => value + 1);
    } catch (error) { if (version === refreshVersion.current) setError(errorMessage(error, failText)); }
    finally { if (version === refreshVersion.current) setBusy(false); }
  }, [view, userId, filter]);
  useEffect(() => { void refresh(); setSelected(null); }, [refresh]);
  useEffect(() => { setResults([]); setAnswer(""); setSearched(false); }, [userId]);
  useEffect(() => { openVersion.current++; setOpened(null); }, [userId, view]);
  useEffect(() => {
    let active = true; setHistory([]);
    if (selected) api.history(selected.id).then(data => { if (active) setHistory(data); }).catch(error => { if (active) setError(errorMessage(error, failText)); });
    return () => { active = false; };
  }, [selected]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(timer); }, [notice]);
  const done = () => { setSelected(null); setResults([]); setAnswer(""); void refresh(); setNotice(t("Saved", "已保存")); };
  async function operation(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError("");
    try { await action(); setNotice(success); }
    catch (error) { setError(errorMessage(error, failText)); throw error; }
    finally { setBusy(false); }
  }
  async function search(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setAnswer(""); setResults([]); setSearched(false);
    try { const result = await api.search(query, userId, searchMode); setResults(result.data); setRetrieval(result.retrieval); setSearched(true); }
    catch (error) { setError(errorMessage(error, failText)); }
    finally { setBusy(false); }
  }
  async function exportData() {
    setBusy(true); setError("");
    try {
      const memories: MemoryRecord[] = []; let next = "";
      do { const page = await api.exportPage({ user_id: userId, status: filter, cursor: next }); memories.push(...page.data); next = page.next_cursor ?? ""; } while (next);
      const url = URL.createObjectURL(new Blob([JSON.stringify({ schema: "sixteen.memory/1", exported_at: new Date().toISOString(), memories }, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `sixteen-memory-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); setNotice(t("Exported", "已导出"));
    } catch (error) { setError(errorMessage(error, failText)); }
    finally { setBusy(false); }
  }
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setNotice(t("Copied", "已复制")); } catch { setError(t("Copy failed", "复制失败")); } }
  async function openMemory(id: string) {
    const version = ++openVersion.current;
    try { const row = await api.get(id); if (version === openVersion.current) setOpened(row); }
    catch (error) { if (version === openVersion.current) setError(errorMessage(error, failText)); }
  }
  const navigation = [
    { id: "memories" as const, name: t("Memories", "记忆"), icon: Database },
    { id: "search" as const, name: t("Search", "检索"), icon: Search },
    { id: "context" as const, name: t("Context", "上下文"), icon: Layers },
    { id: "knowledge" as const, name: t("Knowledge", "知识"), icon: BookOpen },
    { id: "ingest" as const, name: t("Ingest", "抽取"), icon: Plus },
    ...(session.role === "admin" ? [{ id: "keys" as const, name: "API Keys", icon: KeyRound }, { id: "requests" as const, name: t("Requests", "请求记录"), icon: FileClock }] : []),
  ];
  const heading = view === "memories" ? t("Memories", "记忆库")
    : view === "search" ? t("Search", "检索")
    : view === "context" ? t("Context & Evidence", "上下文")
    : view === "knowledge" ? t("Conversations & Wiki", "会话与知识")
    : view === "ingest" ? t("Memory Ingestion", "记忆导入")
    : view === "keys" ? "API Keys"
    : t("Request Log", "请求记录");

  return <div className="shell">
    <aside className="sidebar"><div className="brand"><img src="/brand.png" alt="" /><strong>Sixteen<span>Memory</span></strong></div>
      <div className="workspace"><span className="workspace-icon">16</span><div><strong>{session.project_id}</strong><small>{t("Open Source", "开源版本")}</small></div></div>
      <nav aria-label={t("Main navigation", "主导航")}>{navigation.map(item => <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} aria-current={view === item.id ? "page" : undefined} onClick={() => { setView(item.id); setError(""); }}><item.icon size={18} />{item.name}</button>)}</nav>
      <div className="sidebar-bottom">
        <button className="nav-item" onClick={toggle}><Globe size={18} />{lang === "zh" ? "English" : "简体中文"}</button>
        <a className="nav-item" href="/quickstart.html" target="_blank" rel="noreferrer"><BookOpen size={18} />{t("API Quickstart", "接入文档")}</a>
        <button className="nav-item" onClick={logout}><LogOut size={18} />{t("Sign out", "退出")}</button>
        <small>v0.3.0 · Apache-2.0</small>
      </div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb"><span>{session.project_id}</span><ChevronRight size={14} /><strong>{navigation.find(item => item.id === view)?.name}</strong></div><div className="account-actions"><span className="role"><ShieldCheck size={14} />{session.role === "admin" ? t("Admin", "管理员") : session.role === "write" ? t("Read/Write", "读写") : t("Read-only", "只读")}</span><button className="icon-button mobile-account" onClick={toggle} title={t("Switch language", "切换语言")} aria-label={t("Switch language", "切换语言")}><Globe size={17} /></button><a className="icon-button mobile-account" href="/quickstart.html" title={t("API Quickstart", "接入文档")} aria-label={t("API Quickstart", "接入文档")}><BookOpen size={17} /></a><button className="icon-button mobile-account" onClick={logout} title={t("Sign out", "退出")} aria-label={t("Sign out", "退出")}><LogOut size={17} /></button></div></header>
      <div className="page-heading"><div><p className="eyebrow">WORKSPACE / {view.toUpperCase()}</p><h1>{heading}</h1></div><div className="actions">
        <button className="icon-button" title={t("Refresh", "刷新")} aria-label={t("Refresh", "刷新")} onClick={() => void refresh()} disabled={busy}><RefreshCw size={18} className={busy ? "spin" : ""} /></button>
        {view === "memories" && <><button className="secondary" onClick={() => void exportData()} disabled={busy}><ArrowDownToLine size={16} />{t("Export", "导出")}</button>{canWrite && <button className="primary" onClick={() => setEditor("new")}><Plus size={17} />{t("Add memory", "新增记忆")}</button>}</>}
        {view === "keys" && <button className="primary" onClick={() => setKeyForm(true)}><Plus size={17} />{t("Create key", "创建 Key")}</button>}
      </div></div>
      {error && <div className="banner error" role="alert"><CircleAlert size={17} /><span>{error}</span><button className="icon-button" aria-label={t("Dismiss error", "关闭提示")} onClick={() => setError("")}><X size={16} /></button></div>}
      {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
      {(view === "memories" || view === "search" || view === "ingest" || view === "context" || view === "knowledge") && <div className="filters"><ListFilter size={17} /><label className="inline-label">{t("User", "用户")}<input aria-label={t("Filter by user", "筛选用户")} value={userId} disabled={session.role !== "admin"} onChange={e => setUserId(e.target.value)} placeholder={t("All users", "全部用户")} /></label>{view === "memories" && <div className="segmented" aria-label={t("Memory status", "记忆状态")}>{([["all", t("All", "全部")], ["active", t("Active", "有效")], ["revoked", t("Revoked", "已撤销")]] as const).map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>}</div>}
      {view === "context" && <ContextPanel key={`${userId}:${contextRevision}`} userId={userId} onOpen={id => void openMemory(id)} />}
      {view === "knowledge" && <KnowledgePanel key={`${userId}:${contextRevision}`} userId={userId} canWrite={canWrite} />}
      {view === "memories" && <div className={selected ? "memory-layout with-detail" : "memory-layout"}>
        <section className="memory-list" aria-label={t("Memory list", "记忆列表")}><div className="list-header"><span>{t("CONTENT / SOURCE", "内容 / 来源")}</span><span>{t("STATUS / UPDATED", "状态 / 更新时间")}</span></div>
          {busy && rows.length === 0 ? <div className="empty">{t("Loading...", "正在读取")}</div> : rows.length === 0 ? <div className="empty"><Database size={34} /><h2>{t("No memories yet", "暂无记忆")}</h2>{canWrite && <button className="secondary" onClick={() => setEditor("new")}><Plus size={16} />{t("Add memory", "新增记忆")}</button>}</div> : rows.map(row => <button key={row.id} className={`memory-row ${selected?.id === row.id ? "selected" : ""}`} onClick={() => setSelected(row)}><div><p>{row.content}</p><div className="metadata"><span>{row.user_id}</span><span>{sourceName[row.source.type]}</span><span>{row.source.ref}</span></div></div><div className="row-status"><span className={`status ${row.status}`}>{row.status === "active" ? t("Active", "有效") : t("Revoked", "已撤销")}</span><small>{formatTime(row.updated_at)}</small><small>v{row.version}</small></div></button>)}
          {cursor && <button className="load-more secondary" disabled={busy} onClick={() => { setBusy(true); api.list({ user_id: userId, status: filter, cursor }).then(page => { setRows(prev => [...prev, ...page.data]); setCursor(page.next_cursor); }).catch(error => setError(errorMessage(error, failText))).finally(() => setBusy(false)); }}>{t("Load more", "加载更多")}</button>}
          <div className="list-footer">{lang === "zh" ? `已显示 ${rows.length} 条${cursor ? " · 还有更多" : ""}` : `Showing ${rows.length} records${cursor ? " · more available" : ""}`}</div>
        </section>
        {selected && <aside className="detail"><header><h2>{t("Memory details", "记忆详情")}</h2><button className="icon-button" aria-label={t("Close details", "关闭详情")} title={t("Close details", "关闭详情")} onClick={() => setSelected(null)}><X size={18} /></button></header>
          <div className="detail-content"><span className={`status ${selected.status}`}>{selected.status === "active" ? t("Active", "有效") : t("Revoked", "已撤销")}</span><p className="memory-text">{selected.content}</p><dl><dt>{t("User", "用户")}</dt><dd>{selected.user_id}</dd><dt>{t("Source", "来源")}</dt><dd>{sourceName[selected.source.type]} · {selected.source.ref}</dd><dt>{t("Observed at", "来源时间")}</dt><dd>{formatTime(selected.source.observed_at)}</dd><dt>{t("Expires", "到期时间")}</dt><dd>{selected.expires_at ? formatTime(selected.expires_at) : t("None", "未设置")}</dd><dt>{t("Memory ID", "记忆 ID")}</dt><dd className="mono">{selected.id}<button className="icon-button" aria-label={t("Copy memory ID", "复制记忆 ID")} title={t("Copy memory ID", "复制记忆 ID")} onClick={() => void copy(selected.id)}><Copy size={14} /></button></dd></dl>
            <h3>{t("Verbatim source", "来源正文")}</h3><blockquote>{selected.source.text}</blockquote>
            {canWrite && <div className="detail-actions"><button className="secondary" onClick={() => setEditor(selected)}><SquarePen size={15} />{t("Update", "更新")}</button>{selected.status === "active" && <button className="secondary" onClick={() => { setConfirm("revoke"); setReason(""); }}><Undo2 size={15} />{t("Revoke", "撤销")}</button>}<button className="icon-button danger" aria-label={t("Delete memory", "删除记忆")} title={t("Delete memory", "删除记忆")} onClick={() => setConfirm("delete")}><Trash2 size={17} /></button></div>}
            <h3 className="history-title"><Clock3 size={16} />{t("Version history", "变更历史")}</h3><ol className="history">{history.map(item => <li key={item.version}><div><strong>{actionName[item.action] ?? item.action}</strong><span>v{item.version}</span></div><small>{formatTime(item.created_at)}</small><p>{item.content}</p><small>{item.reason}</small><details><summary>{t("Source & actor", "来源与操作人")}</summary><p>{item.source.text}</p><small>{item.source.ref} · {item.actor}</small></details></li>)}</ol>
          </div></aside>}
      </div>}
      {view === "ingest" && <IngestionPanel key={userId} userId={userId} canWrite={canWrite} onChanged={() => { setSelected(null); setResults([]); setNotice(t("Memories updated", "记忆状态已更新")); }} />}
      {view === "search" && <section className="search-view"><label>{t("Retrieval mode", "检索模式")}<select aria-label={t("Retrieval mode", "检索模式")} value={searchMode} onChange={e => { const value = e.target.value; if (value === "lexical" || value === "semantic" || value === "hybrid") setSearchMode(value); setResults([]); setSearched(false); setAnswer(""); }}><option value="lexical">{t("Lexical (FTS5)", "词法")}</option><option value="semantic">{t("Semantic (requires embedding config)", "语义（需要模型配置）")}</option><option value="hybrid">{t("Hybrid (requires embedding config)", "混合（需要模型配置）")}</option></select></label><form className="search-form" onSubmit={search}><Search size={20} /><input required aria-label={t("Search query", "检索问题")} value={query} onChange={e => setQuery(e.target.value)} placeholder={t("Search active memories...", "查询需要接续的信息")} /><button className="primary" disabled={busy}>{t("Search", "检索")}<ArrowRight size={16} /></button></form>
        <div className="search-meta"><span>{searched ? (lang === "zh" ? `${results.length} 条结果` : `${results.length} results`) : t("Ready to search", "尚未查询")}</span><span>{(searched ? retrieval : searchMode) === "hybrid" ? t("Hybrid search", "混合检索") : (searched ? retrieval : searchMode) === "semantic" ? t("Semantic search", "语义检索") : t("Lexical search", "词法检索")} · {t("Active memories only", "仅有效记忆")}</span></div>
        {results.map(row => <article className="result" key={row.id}><header><span className="status active">{row.user_id}</span><small>v{row.version} · {sourceName[row.source.type]}</small></header><p>{row.content}</p><footer><span>{row.source.ref}</span><button className="icon-button" title={t("Copy memory ID", "复制记忆 ID")} aria-label={t("Copy memory ID", "复制记忆 ID")} onClick={() => void copy(row.id)}><Copy size={15} /></button></footer></article>)}
        {searched && !results.length && <div className="empty"><Search size={32} /><h2>{t("No matching active memories", "没有匹配的有效记忆")}</h2></div>}
        {searched && results.length > 0 && <div className="answer-area"><button className="secondary" disabled={busy} onClick={() => { setBusy(true); setError(""); api.answer(query, userId, searchMode).then(result => setAnswer(result.answer)).catch(error => setError(errorMessage(error, failText))).finally(() => setBusy(false)); }}>{t("Generate grounded answer", "生成回答")}<ArrowRight size={16} /></button>{answer && <div className="answer"><h2>{t("Model answer", "模型回答")}</h2><p>{answer}</p></div>}</div>}
      </section>}
      {view === "keys" && <section className="table-section"><div className="table-scroll"><table><thead><tr><th>{t("Name", "名称")}</th><th>{t("User scope", "用户范围")}</th><th>{t("Role", "权限")}</th><th>{t("Status", "状态")}</th><th>{t("Created", "创建时间")}</th><th /></tr></thead><tbody>{keys.map(key => <tr key={key.id}><td><strong>{key.name}</strong><small className="mono">{key.prefix}...</small></td><td>{key.user_id}</td><td>{key.role === "write" ? t("Read/Write", "读写") : t("Read", "读取")}</td><td><span className={`status ${key.revoked_at ? "revoked" : "active"}`}>{key.revoked_at ? t("Revoked", "已撤销") : t("Active", "有效")}</span></td><td>{formatTime(key.created_at)}</td><td>{!key.revoked_at && <button className="icon-button danger" aria-label={t(`Revoke ${key.name}`, `撤销 ${key.name}`)} title={t("Revoke key", "撤销 Key")} onClick={() => setRevokeKey(key)}><Trash2 size={16} /></button>}</td></tr>)}</tbody></table></div>{!keys.length && <div className="empty"><KeyRound size={32} /><h2>{t("No API keys yet", "暂无 API Key")}</h2></div>}</section>}
      {view === "requests" && <section className="table-section"><div className="table-scroll"><table><thead><tr><th>{t("Time", "时间")}</th><th>{t("Action", "操作")}</th><th>{t("Status", "状态")}</th><th>{t("Latency", "耗时")}</th><th>{t("Actor", "操作人")}</th></tr></thead><tbody>{requests.map(item => <tr key={item.id}><td>{formatTime(item.created_at)}</td><td>{actionName[item.action] ?? item.action}</td><td><span className={`status ${item.status < 400 ? "active" : "revoked"}`}>{item.status}</span></td><td className="mono">{item.duration_ms} ms</td><td className="mono">{item.actor}</td></tr>)}</tbody></table></div>{!requests.length && <div className="empty">{t("No request logs yet", "暂无请求记录")}</div>}</section>}
    </main>
    {editor && <MemoryEditor entry={editor === "new" ? undefined : editor} userId={session.user_id ?? userId} close={() => setEditor(null)} saved={done} />}
    {opened && <Dialog title={t("Memory details", "记忆详情")} close={() => setOpened(null)}><div className="form-stack">
      <p>{opened.content}</p><small>{opened.user_id} · v{opened.version} · {opened.status === "active" ? t("Active", "有效") : t("Revoked", "已撤销")}</small>
      <h3>{t("Verbatim source", "原始依据")}</h3><blockquote>{opened.source.text}</blockquote><p className="mono">{opened.source.ref}</p>
      {canWrite && <footer><button className="secondary" onClick={() => { setEditor(opened); setOpened(null); }}><SquarePen size={15} />{t("Update", "更新")}</button></footer>}
    </div></Dialog>}
    {confirm && selected && <Dialog title={confirm === "delete" ? t("Delete memory", "删除记忆") : t("Revoke memory", "撤销记忆")} close={() => setConfirm(null)}><form className="form-stack" onSubmit={event => { event.preventDefault(); void operation(() => confirm === "delete" ? api.delete(selected.id, selected.version) : api.revoke(selected.id, selected.version, reason), confirm === "delete" ? t("Deleted", "已删除") : t("Revoked", "已撤销")).then(() => { setConfirm(null); setSelected(null); void refresh(); }).catch(() => undefined); }}>
      <p>{confirm === "delete" ? t("Removes content, source, history, and online search indexes. Cannot be undone in the console.", "正文、来源、历史和在线检索索引将被删除，无法在控制台恢复。平台备份可能仍处于保留期。") : t("Excludes the record from retrieval while preserving its source and version history.", "撤销后不再参与检索，来源和历史仍保留。")}</p>{confirm === "revoke" && <label>{t("Reason", "撤销原因")}<input required value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></label>}
      {error && <p className="error" role="alert">{error}</p>}<footer><button className="secondary" type="button" onClick={() => setConfirm(null)}>{t("Cancel", "取消")}</button><button className="primary danger-bg" disabled={busy}>{confirm === "delete" ? t("Confirm delete", "确认删除") : t("Confirm revoke", "确认撤销")}</button></footer></form></Dialog>}
    {keyForm && <Dialog title={t("Create API Key", "创建 API Key")} close={() => setKeyForm(false)}><form className="form-stack" onSubmit={event => { event.preventDefault(); void operation(async () => { const value = await api.createKey({ name: keyName, user_id: keyUser, role: keyRole }); setNewKey(value.key); setKeyForm(false); setKeyName(""); setKeyUser(""); void refresh(); }, t("Key created", "Key 已创建")).catch(() => undefined); }}><label>{t("Name", "名称")}<input required value={keyName} onChange={e => setKeyName(e.target.value)} /></label><label>{t("User scope", "用户范围")}<input required value={keyUser} onChange={e => setKeyUser(e.target.value)} /></label><label>{t("Role", "权限")}<select value={keyRole} onChange={e => setKeyRole(e.target.value === "read" ? "read" : "write")}><option value="read">{t("Read-only", "只读")}</option><option value="write">{t("Read/Write", "读写")}</option></select></label>{error && <p className="error" role="alert">{error}</p>}<footer><button type="button" className="secondary" onClick={() => setKeyForm(false)}>{t("Cancel", "取消")}</button><button className="primary" disabled={busy}>{t("Create", "创建")}</button></footer></form></Dialog>}
    {newKey && <Dialog title={t("API Key created", "API Key 已创建")} close={() => setNewKey("")}><div className="form-stack"><p>{t("Copy this secret now—it is only shown once.", "完整密钥仅在这里显示一次。关闭后无法再次查看。")}</p><code className="key-value">{newKey}</code><footer><button className="secondary" onClick={() => void copy(newKey)}><Copy size={16} />{t("Copy", "复制")}</button><button className="primary" onClick={() => setNewKey("")}>{t("Done", "完成")}</button></footer></div></Dialog>}
    {revokeKey && <Dialog title={t("Revoke API Key", "撤销 API Key")} close={() => setRevokeKey(null)}><div className="form-stack"><p>{lang === "zh" ? `撤销“${revokeKey.name}”后，使用它的请求与登录会话将失效。` : `Revoking "${revokeKey.name}" immediately invalidates all API requests and sessions using it.`}</p>{error && <p className="error" role="alert">{error}</p>}<footer><button className="secondary" onClick={() => setRevokeKey(null)}>{t("Cancel", "取消")}</button><button className="primary danger-bg" disabled={busy} onClick={() => void operation(() => api.revokeKey(revokeKey.id), t("Key revoked", "Key 已撤销")).then(() => { setRevokeKey(null); void refresh(); }).catch(() => undefined)}>{t("Confirm revoke", "确认撤销")}</button></footer></div></Dialog>}
  </div>;
}
