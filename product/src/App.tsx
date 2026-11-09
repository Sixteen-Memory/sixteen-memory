import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDownToLine, ArrowRight, BookOpen, Check, ChevronRight, CircleAlert, Clock3, Copy, Database, FileClock, KeyRound, Layers, ListFilter, LogOut, Plus, RefreshCw, Search, ShieldCheck, SquarePen, Trash2, Undo2, X } from "lucide-react";
import { api, errorMessage, type Session, type RetrievalMode } from "./api";
import { Dialog } from "./Dialog";
import { MemoryEditor } from "./MemoryEditor";
import { IngestionPanel } from "./IngestionPanel";
import { ContextPanel } from "./ContextPanel";
import { KnowledgePanel } from "./KnowledgePanel";
import type { AuditRecord, HistoryRecord, KeyRecord, MemoryRecord } from "../worker/domain";

type View = "memories" | "search" | "ingest" | "context" | "knowledge" | "keys" | "requests";
const time = (value: string) => new Date(value).toLocaleString("zh-CN", { hour12: false });
const sourceName = { manual: "人工确认", conversation: "对话", business: "业务事件" };
const actionName: Record<string, string> = { extracted: "自动抽取", superseded: "事实替代", created: "保存", updated: "更新", revoked: "撤销", add: "保存", list: "列表", get: "读取", history: "历史", update: "更新", revoke: "撤销", delete: "删除", search: "检索", export: "导出", keys: "Key 列表", create_key: "创建 Key", revoke_key: "撤销 Key", me: "会话", audit: "请求记录" };

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api.me().then(setSession).catch(() => setSession(null)).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="boot"><Database size={28} /><span>连接中</span></div>;
  return session ? <Console session={session} logout={() => { api.logout().then(() => setSession(null)); }} /> : <Login onLogin={setSession} />;
}

function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { onLogin(await api.login(key)); setKey(""); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <main className="login"><div className="login-brand"><img src="/brand.png" alt="" /><span>sixteenmemory</span></div><form onSubmit={submit}>
    <div className="login-symbol"><ShieldCheck size={26} /></div><h1>记忆控制台</h1><p className="muted">拾陆记忆 · 开发预览</p>
    <label>API Key<input autoFocus type="password" required autoComplete="off" value={key} onChange={e => setKey(e.target.value)} /></label>
    {error && <p className="error" role="alert">{error}</p>}
    <button className="primary" disabled={busy}>{busy ? "连接中" : "进入工作区"}<ArrowRight size={16} /></button>
  </form><small>v0.3.0 · 开发预览</small></main>;
}

function Console({ session, logout }: { session: Session; logout: () => void }) {
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
    } catch (error) { if (version === refreshVersion.current) setError(errorMessage(error)); }
    finally { if (version === refreshVersion.current) setBusy(false); }
  }, [view, userId, filter]);
  useEffect(() => { void refresh(); setSelected(null); }, [refresh]);
  useEffect(() => { setResults([]); setAnswer(""); setSearched(false); }, [userId]);
  useEffect(() => { openVersion.current++; setOpened(null); }, [userId, view]);
  useEffect(() => {
    let active = true; setHistory([]);
    if (selected) api.history(selected.id).then(data => { if (active) setHistory(data); }).catch(error => { if (active) setError(errorMessage(error)); });
    return () => { active = false; };
  }, [selected]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(timer); }, [notice]);
  const done = () => { setSelected(null); setResults([]); setAnswer(""); void refresh(); setNotice("已保存"); };
  async function operation(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError("");
    try { await action(); setNotice(success); }
    catch (error) { setError(errorMessage(error)); throw error; }
    finally { setBusy(false); }
  }
  async function search(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setAnswer(""); setResults([]); setSearched(false);
    try { const result = await api.search(query, userId, searchMode); setResults(result.data); setRetrieval(result.retrieval); setSearched(true); }
    catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function exportData() {
    setBusy(true); setError("");
    try {
      const memories: MemoryRecord[] = []; let next = "";
      do { const page = await api.exportPage({ user_id: userId, status: filter, cursor: next }); memories.push(...page.data); next = page.next_cursor ?? ""; } while (next);
      const url = URL.createObjectURL(new Blob([JSON.stringify({ schema: "sixteen.memory/1", exported_at: new Date().toISOString(), memories }, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = `sixteen-memory-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url); setNotice("已导出");
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setNotice("已复制"); } catch { setError("复制失败"); } }
  async function openMemory(id: string) {
    const version = ++openVersion.current;
    try { const row = await api.get(id); if (version === openVersion.current) setOpened(row); }
    catch (error) { if (version === openVersion.current) setError(errorMessage(error)); }
  }
  const navigation = [
    { id: "memories" as const, name: "记忆", icon: Database },
    { id: "search" as const, name: "检索", icon: Search },
    { id: "context" as const, name: "上下文", icon: Layers },
    { id: "knowledge" as const, name: "知识", icon: BookOpen },
    { id: "ingest" as const, name: "抽取", icon: Plus },
    ...(session.role === "admin" ? [{ id: "keys" as const, name: "API Keys", icon: KeyRound }, { id: "requests" as const, name: "请求记录", icon: FileClock }] : []),
  ];

  return <div className="shell">
    <aside className="sidebar"><div className="brand"><img src="/brand.png" alt="" /><strong>sixteen<span>memory</span></strong></div>
      <div className="workspace"><span className="workspace-icon">16</span><div><strong>{session.project_id}</strong><small>开发预览</small></div></div>
      <nav aria-label="主导航">{navigation.map(item => <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} aria-current={view === item.id ? "page" : undefined} onClick={() => { setView(item.id); setError(""); }}><item.icon size={18} />{item.name}</button>)}</nav>
      <div className="sidebar-bottom"><a className="nav-item" href="/quickstart.html" target="_blank" rel="noreferrer"><BookOpen size={18} />接入文档</a><button className="nav-item" onClick={logout}><LogOut size={18} />退出</button><small>v0.3.0 · 开发预览</small></div>
    </aside>
    <main className="main">
      <header className="topbar"><div className="breadcrumb"><span>{session.project_id}</span><ChevronRight size={14} /><strong>{navigation.find(item => item.id === view)?.name}</strong></div><div className="account-actions"><span className="role"><ShieldCheck size={14} />{session.role === "admin" ? "管理员" : session.role === "write" ? "读写" : "只读"}</span><a className="icon-button mobile-account" href="/quickstart.html" title="接入文档" aria-label="接入文档"><BookOpen size={17} /></a><button className="icon-button mobile-account" onClick={logout} title="退出" aria-label="退出"><LogOut size={17} /></button></div></header>
      <div className="page-heading"><div><p className="eyebrow">WORKSPACE / {view.toUpperCase()}</p><h1>{view === "memories" ? "记忆库" : view === "search" ? "检索" : view === "context" ? "上下文" : view === "knowledge" ? "会话与知识" : view === "ingest" ? "对话抽取" : view === "keys" ? "API Keys" : "请求记录"}</h1></div><div className="actions">
        <button className="icon-button" title="刷新" aria-label="刷新" onClick={() => void refresh()} disabled={busy}><RefreshCw size={18} className={busy ? "spin" : ""} /></button>
        {view === "memories" && <><button className="secondary" onClick={() => void exportData()} disabled={busy}><ArrowDownToLine size={16} />导出</button>{canWrite && <button className="primary" onClick={() => setEditor("new")}><Plus size={17} />新增记忆</button>}</>}
        {view === "keys" && <button className="primary" onClick={() => setKeyForm(true)}><Plus size={17} />创建 Key</button>}
      </div></div>
      {error && <div className="banner error" role="alert"><CircleAlert size={17} /><span>{error}</span><button className="icon-button" aria-label="关闭提示" onClick={() => setError("")}><X size={16} /></button></div>}
      {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
      {(view === "memories" || view === "search" || view === "ingest" || view === "context" || view === "knowledge") && <div className="filters"><ListFilter size={17} /><label className="inline-label">用户<input aria-label="筛选用户" value={userId} disabled={session.role !== "admin"} onChange={e => setUserId(e.target.value)} placeholder="全部用户" /></label>{view === "memories" && <div className="segmented" aria-label="记忆状态">{([["all", "全部"], ["active", "有效"], ["revoked", "已撤销"]] as const).map(([value, label]) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}</div>}</div>}
      {view === "context" && <ContextPanel key={`${userId}:${contextRevision}`} userId={userId} onOpen={id => void openMemory(id)} />}
      {view === "knowledge" && <KnowledgePanel key={`${userId}:${contextRevision}`} userId={userId} canWrite={canWrite} />}
      {view === "memories" && <div className={selected ? "memory-layout with-detail" : "memory-layout"}>
        <section className="memory-list" aria-label="记忆列表"><div className="list-header"><span>内容 / 来源</span><span>状态 / 更新时间</span></div>
          {busy && rows.length === 0 ? <div className="empty">正在读取</div> : rows.length === 0 ? <div className="empty"><Database size={34} /><h2>暂无记忆</h2>{canWrite && <button className="secondary" onClick={() => setEditor("new")}><Plus size={16} />新增记忆</button>}</div> : rows.map(row => <button key={row.id} className={`memory-row ${selected?.id === row.id ? "selected" : ""}`} onClick={() => setSelected(row)}><div><p>{row.content}</p><div className="metadata"><span>{row.user_id}</span><span>{sourceName[row.source.type]}</span><span>{row.source.ref}</span></div></div><div className="row-status"><span className={`status ${row.status}`}>{row.status === "active" ? "有效" : "已撤销"}</span><small>{time(row.updated_at)}</small><small>v{row.version}</small></div></button>)}
          {cursor && <button className="load-more secondary" disabled={busy} onClick={() => { setBusy(true); api.list({ user_id: userId, status: filter, cursor }).then(page => { setRows(prev => [...prev, ...page.data]); setCursor(page.next_cursor); }).catch(error => setError(errorMessage(error))).finally(() => setBusy(false)); }}>加载更多</button>}
          <div className="list-footer">已显示 {rows.length} 条{cursor ? " · 还有更多" : ""}</div>
        </section>
        {selected && <aside className="detail"><header><h2>记忆详情</h2><button className="icon-button" aria-label="关闭详情" title="关闭详情" onClick={() => setSelected(null)}><X size={18} /></button></header>
          <div className="detail-content"><span className={`status ${selected.status}`}>{selected.status === "active" ? "有效" : "已撤销"}</span><p className="memory-text">{selected.content}</p><dl><dt>用户</dt><dd>{selected.user_id}</dd><dt>来源</dt><dd>{sourceName[selected.source.type]} · {selected.source.ref}</dd><dt>来源时间</dt><dd>{time(selected.source.observed_at)}</dd><dt>到期时间</dt><dd>{selected.expires_at ? time(selected.expires_at) : "未设置"}</dd><dt>记忆 ID</dt><dd className="mono">{selected.id}<button className="icon-button" aria-label="复制记忆 ID" title="复制记忆 ID" onClick={() => void copy(selected.id)}><Copy size={14} /></button></dd></dl>
            <h3>来源正文</h3><blockquote>{selected.source.text}</blockquote>
            {canWrite && <div className="detail-actions"><button className="secondary" onClick={() => setEditor(selected)}><SquarePen size={15} />更新</button>{selected.status === "active" && <button className="secondary" onClick={() => { setConfirm("revoke"); setReason(""); }}><Undo2 size={15} />撤销</button>}<button className="icon-button danger" aria-label="删除记忆" title="删除记忆" onClick={() => setConfirm("delete")}><Trash2 size={17} /></button></div>}
            <h3 className="history-title"><Clock3 size={16} />变更历史</h3><ol className="history">{history.map(item => <li key={item.version}><div><strong>{actionName[item.action]}</strong><span>v{item.version}</span></div><small>{time(item.created_at)}</small><p>{item.content}</p><small>{item.reason}</small><details><summary>来源与操作人</summary><p>{item.source.text}</p><small>{item.source.ref} · {item.actor}</small></details></li>)}</ol>
          </div></aside>}
      </div>}
      {view === "ingest" && <IngestionPanel key={userId} userId={userId} canWrite={canWrite} onChanged={() => { setSelected(null); setResults([]); setNotice("记忆状态已更新"); }} />}
      {view === "search" && <section className="search-view"><label>检索模式<select aria-label="检索模式" value={searchMode} onChange={e => { const value = e.target.value; if (value === "lexical" || value === "semantic" || value === "hybrid") setSearchMode(value); setResults([]); setSearched(false); setAnswer(""); }}><option value="lexical">词法</option><option value="semantic">语义（需要模型配置）</option><option value="hybrid">混合（需要模型配置）</option></select></label><form className="search-form" onSubmit={search}><Search size={20} /><input required aria-label="检索问题" value={query} onChange={e => setQuery(e.target.value)} placeholder="查询需要接续的信息" /><button className="primary" disabled={busy}>检索<ArrowRight size={16} /></button></form>
        <div className="search-meta"><span>{searched ? `${results.length} 条结果` : "尚未查询"}</span><span>{(searched ? retrieval : searchMode) === "hybrid" ? "混合检索" : (searched ? retrieval : searchMode) === "semantic" ? "语义检索" : "词法检索"} · 仅有效记忆</span></div>
        {results.map(row => <article className="result" key={row.id}><header><span className="status active">{row.user_id}</span><small>v{row.version} · {sourceName[row.source.type]}</small></header><p>{row.content}</p><footer><span>{row.source.ref}</span><button className="icon-button" title="复制记忆 ID" aria-label="复制记忆 ID" onClick={() => void copy(row.id)}><Copy size={15} /></button></footer></article>)}
        {searched && !results.length && <div className="empty"><Search size={32} /><h2>没有匹配的有效记忆</h2></div>}
        {searched && results.length > 0 && <div className="answer-area"><button className="secondary" disabled={busy} onClick={() => { setBusy(true); setError(""); api.answer(query, userId, searchMode).then(result => setAnswer(result.answer)).catch(error => setError(errorMessage(error))).finally(() => setBusy(false)); }}>生成回答<ArrowRight size={16} /></button>{answer && <div className="answer"><h2>模型回答</h2><p>{answer}</p></div>}</div>}
      </section>}
      {view === "keys" && <section className="table-section"><div className="table-scroll"><table><thead><tr><th>名称</th><th>用户范围</th><th>权限</th><th>状态</th><th>创建时间</th><th /></tr></thead><tbody>{keys.map(key => <tr key={key.id}><td><strong>{key.name}</strong><small className="mono">{key.prefix}...</small></td><td>{key.user_id}</td><td>{key.role === "write" ? "读写" : "读取"}</td><td><span className={`status ${key.revoked_at ? "revoked" : "active"}`}>{key.revoked_at ? "已撤销" : "有效"}</span></td><td>{time(key.created_at)}</td><td>{!key.revoked_at && <button className="icon-button danger" aria-label={`撤销 ${key.name}`} title="撤销 Key" onClick={() => setRevokeKey(key)}><Trash2 size={16} /></button>}</td></tr>)}</tbody></table></div>{!keys.length && <div className="empty"><KeyRound size={32} /><h2>暂无 API Key</h2></div>}</section>}
      {view === "requests" && <section className="table-section"><div className="table-scroll"><table><thead><tr><th>时间</th><th>操作</th><th>状态</th><th>耗时</th><th>操作人</th></tr></thead><tbody>{requests.map(item => <tr key={item.id}><td>{time(item.created_at)}</td><td>{actionName[item.action] ?? item.action}</td><td><span className={`status ${item.status < 400 ? "active" : "revoked"}`}>{item.status}</span></td><td className="mono">{item.duration_ms} ms</td><td className="mono">{item.actor}</td></tr>)}</tbody></table></div>{!requests.length && <div className="empty">暂无请求记录</div>}</section>}
    </main>
    {editor && <MemoryEditor entry={editor === "new" ? undefined : editor} userId={session.user_id ?? userId} close={() => setEditor(null)} saved={done} />}
    {opened && <Dialog title="记忆详情" close={() => setOpened(null)}><div className="form-stack">
      <p>{opened.content}</p><small>{opened.user_id} · v{opened.version} · {opened.status === "active" ? "有效" : "已撤销"}</small>
      <h3>原始依据</h3><blockquote>{opened.source.text}</blockquote><p className="mono">{opened.source.ref}</p>
      {canWrite && <footer><button className="secondary" onClick={() => { setEditor(opened); setOpened(null); }}><SquarePen size={15} />更新</button></footer>}
    </div></Dialog>}
    {confirm && selected && <Dialog title={confirm === "delete" ? "删除记忆" : "撤销记忆"} close={() => setConfirm(null)}><form className="form-stack" onSubmit={event => { event.preventDefault(); void operation(() => confirm === "delete" ? api.delete(selected.id, selected.version) : api.revoke(selected.id, selected.version, reason), confirm === "delete" ? "已删除" : "已撤销").then(() => { setConfirm(null); setSelected(null); void refresh(); }).catch(() => undefined); }}>
      <p>{confirm === "delete" ? "正文、来源、历史和在线检索索引将被删除，无法在控制台恢复。平台备份可能仍处于保留期。" : "撤销后不再参与检索，来源和历史仍保留。"}</p>{confirm === "revoke" && <label>撤销原因<input required value={reason} onChange={e => setReason(e.target.value)} maxLength={500} /></label>}
      {error && <p className="error" role="alert">{error}</p>}<footer><button className="secondary" type="button" onClick={() => setConfirm(null)}>取消</button><button className="primary danger-bg" disabled={busy}>{confirm === "delete" ? "确认删除" : "确认撤销"}</button></footer></form></Dialog>}
    {keyForm && <Dialog title="创建 API Key" close={() => setKeyForm(false)}><form className="form-stack" onSubmit={event => { event.preventDefault(); void operation(async () => { const value = await api.createKey({ name: keyName, user_id: keyUser, role: keyRole }); setNewKey(value.key); setKeyForm(false); setKeyName(""); setKeyUser(""); void refresh(); }, "Key 已创建").catch(() => undefined); }}><label>名称<input required value={keyName} onChange={e => setKeyName(e.target.value)} /></label><label>用户范围<input required value={keyUser} onChange={e => setKeyUser(e.target.value)} /></label><label>权限<select value={keyRole} onChange={e => setKeyRole(e.target.value === "read" ? "read" : "write")}><option value="read">只读</option><option value="write">读写</option></select></label>{error && <p className="error" role="alert">{error}</p>}<footer><button type="button" className="secondary" onClick={() => setKeyForm(false)}>取消</button><button className="primary" disabled={busy}>创建</button></footer></form></Dialog>}
    {newKey && <Dialog title="API Key 已创建" close={() => setNewKey("")}><div className="form-stack"><p>完整密钥仅在这里显示一次。关闭后无法再次查看。</p><code className="key-value">{newKey}</code><footer><button className="secondary" onClick={() => void copy(newKey)}><Copy size={16} />复制</button><button className="primary" onClick={() => setNewKey("")}>完成</button></footer></div></Dialog>}
    {revokeKey && <Dialog title="撤销 API Key" close={() => setRevokeKey(null)}><div className="form-stack"><p>撤销“{revokeKey.name}”后，使用它的请求与登录会话将失效。</p>{error && <p className="error" role="alert">{error}</p>}<footer><button className="secondary" onClick={() => setRevokeKey(null)}>取消</button><button className="primary danger-bg" disabled={busy} onClick={() => void operation(() => api.revokeKey(revokeKey.id), "Key 已撤销").then(() => { setRevokeKey(null); void refresh(); }).catch(() => undefined)}>确认撤销</button></footer></div></Dialog>}
  </div>;
}
