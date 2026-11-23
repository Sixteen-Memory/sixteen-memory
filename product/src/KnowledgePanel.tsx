import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, errorMessage } from "./api";
import { Dialog } from "./Dialog";
import type { Conversation, ConversationPage, KnowledgeJob, KnowledgePage, WikiPage as PublishedPage, StaleWikiPage } from "../sdk/index.mjs";
const states: Record<string, string> = { running: "处理中", review: "待确认", applied: "已发布", stale: "来源变化，已失效", replaced: "已替换", expired: "已过期", rejected: "已拒绝", failed: "失败，不自动重试" };
const roles = { user: "用户", assistant: "助手（非事实凭证）", system: "系统（仅原文）", tool: "工具（未独立验证）" };
export function KnowledgePanel({ userId, canWrite }: { userId: string; canWrite: boolean }) {
  const [tab, setTab] = useState("conversations"), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Conversation[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [pages, setPages] = useState<PublishedPage[]>([]), [stale, setStale] = useState<StaleWikiPage[]>([]), [jobs, setJobs] = useState<KnowledgeJob[]>([]);
  const [rebuild, setRebuild] = useState<PublishedPage | StaleWikiPage | null>(null);
  const [graph, setGraph] = useState<Awaited<ReturnType<typeof api.graph>>>({ nodes: [], edges: [] });
  const [detail, setDetail] = useState<ConversationPage | null>(null), [confirmDelete, setConfirmDelete] = useState(false);
  const [selected, setSelected] = useState<string[]>([]), [mode, setMode] = useState<"review" | "auto">("review");
  const [title, setTitle] = useState(""), [raw, setRaw] = useState(""), [expiry, setExpiry] = useState(""), [append, setAppend] = useState("");
  const [query, setQuery] = useState(""), [hits, setHits] = useState<Awaited<ReturnType<typeof api.searchConversations>> | null>(null);
  const active = useRef(true), controller = useRef(new AbortController());
  const requests = useRef({ create: crypto.randomUUID(), append: crypto.randomUUID(), organize: crypto.randomUUID() });
  const renew = (kind: keyof typeof requests.current) => { requests.current[kind] = crypto.randomUUID(); };
  const call = () => ({ signal: controller.current.signal });
  useEffect(() => { active.current = true; controller.current = new AbortController(); if (userId) void refresh();
    return () => { active.current = false; controller.current.abort(); }; }, []);
  async function refresh() {
    try {
      const [c, p, g, j] = await Promise.all([api.conversations(userId, "", call()), api.wiki(userId, call()), api.graph(userId, call()), api.knowledgeRuns(userId, call())]);
      if (active.current) { setRows(c.data); setCursor(c.next_cursor); setPages(p.data); setStale(p.stale ?? []); setGraph(g); setJobs(j); setSelected(ids => ids.filter(id => c.data.some(r => r.id === id))); }
    } catch (e) { if (active.current) setError(errorMessage(e)); }
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { if (active.current) setError(errorMessage(e)); }
    finally { if (active.current) setBusy(false); }
  }
  async function open(id: string, next = "") {
    await run(async () => {
      const row = await api.conversation(id, next, call());
      if (active.current) setDetail(old => next && old?.id === id && old.version === row.version ? { ...row, messages: [...old.messages, ...row.messages] } : row);
    });
  }
  async function create(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await api.createConversation({ user_id: userId, request_id: requests.current.create, title, messages: JSON.parse(raw), expires_at: expiry || null });
      renew("create"); if (active.current) { setRaw(""); setTitle(""); await refresh(); }
    });
  }
  return <section className="knowledge-panel search-view">
    <div className="segmented context-tabs" aria-label="知识视图">{[["conversations", "完整会话"], ["wiki", "Wiki"], ["graph", "图谱"]].map(([value, label]) =>
      <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div>
    {!userId ? <p>请先选择用户。</p> : <>
      <p className="muted">仅保存明确提交的会话。原文与知识页都是参考数据，不是系统指令。来源变更只使依赖它的知识页失效；其他页面继续可读。模型未配置时无法生成或重建知识页。</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="secondary" disabled={busy} onClick={() => void refresh()}>刷新知识</button>
      {tab === "conversations" && <>
        <form className="context-form" onSubmit={event => { event.preventDefault(); void run(async () => {
          const result = await api.searchConversations({ user_id: userId, query }, call()); if (active.current) setHits(result);
        }); }}><label>搜索会话原文<input required maxLength={1000} value={query} onChange={e => { setQuery(e.target.value); setHits(null); }} /></label>
          <button className="primary" disabled={busy}>检索会话</button></form>
        {hits && <div aria-live="polite"><p>{hits.data.length} 条消息命中</p>{hits.data.map(hit => <article className="result" key={`${hit.conversation_id}:${hit.id}`}>
          <header><strong>{hit.title}</strong><small>{roles[hit.role]} · v{hit.conversation_version}</small></header><blockquote>{hit.content}</blockquote>
          <button className="secondary" onClick={() => void open(hit.conversation_id)}>打开完整会话</button></article>)}</div>}
        {canWrite && <details><summary>新增完整会话</summary><form className="context-form" onSubmit={create}>
          <label>会话标题<input required maxLength={200} value={title} onChange={e => { setTitle(e.target.value); renew("create"); }} /></label>
          <label>到期时间（ISO，可选）<input value={expiry} onChange={e => { setExpiry(e.target.value); renew("create"); }} /></label>
          <label>消息 JSON（每批最多32条）<textarea required rows={7} value={raw} onChange={e => { setRaw(e.target.value); renew("create"); }}
            placeholder={'[{"id":"m1","role":"user","content":"请保留限制条件","observed_at":"2026-11-09T00:00:00Z"}]'} /></label>
          <button className="primary" disabled={busy}>保存原文</button></form></details>}
        <h2>会话来源</h2>
        {rows.map(row => <article className="result" key={row.id}><header>
          {canWrite && <input type="checkbox" aria-label={`选择 ${row.title}`} disabled={busy} checked={selected.includes(row.id)}
            onChange={e => { renew("organize"); setSelected(ids => e.target.checked ? [...ids, row.id] : ids.filter(id => id !== row.id)); }} />}
          <strong>{row.title}</strong><small>v{row.version} · {row.id}</small></header><footer>
            <button className="secondary" onClick={() => void open(row.id)}>打开完整会话</button></footer></article>)}
        {cursor && <button className="secondary" disabled={busy} onClick={() => void run(async () => {
          const result = await api.conversations(userId, cursor, call()); if (active.current) { setRows(old => [...old, ...result.data]); setCursor(result.next_cursor); }
        })}>加载更多会话</button>}
        {!rows.length && <p className="empty">暂无会话。旧抽取记录不能还原未保存的原文。</p>}
        {canWrite && <div className="context-form"><p>整理会将所选完整来源发送给配置的模型，可能产生费用。每次最多8个会话、40000字符，不截断原文。发布将替换此用户全部知识页，请选全需要的来源；不会修改原始记忆。</p>
          <label>整理模式<select value={mode} onChange={e => { setMode(e.target.value as "review" | "auto"); renew("organize"); }}>
            <option value="review">先审核，再发布</option><option value="auto">检查通过自动发布，其他情况待审</option></select></label>
          <button className="primary" disabled={busy || !selected.length || selected.length > 8} onClick={() => void run(async () => {
            await api.organize({ user_id: userId, request_id: requests.current.organize, conversation_ids: selected, mode }); if (active.current) await refresh();
          })}>整理所选会话（{selected.length}）</button>
          <button className="secondary" disabled={busy} onClick={() => { renew("organize"); setError("新请求已就绪；请先检查旧任务，避免重复模型费用。"); }}>新建整理请求</button></div>}
      </>}
      {tab === "wiki" && <>
        {pages.map(page => <div key={page.slug}><WikiPage page={page} />
          {page.has_conflicts && <p className="context-warning">存在未裁定的冲突报告，请保留各方来源，不要自动选为唯一事实。</p>}
          <small>{page.sources.length} 条引用来源 · 当前有效</small>
          {canWrite && <button className="secondary" disabled={busy} onClick={() => { renew("organize"); setRebuild(page); }}>重建此页：{page.title}</button>}
        </div>)}
        {!pages.length && <p className="empty">暂无有效知识页。请整理会话并审核发布。</p>}
        {!!stale.length && <h2>待重建页面</h2>}
        {stale.map(page => <article className="result" key={page.id}><h3>{page.title}</h3><small>{page.slug} · 来源已变化 · {page.stale_at}</small>
          <p>旧主张和引用已清除，不再用于回答。无关页面不受影响。</p>
          {canWrite && <button className="secondary" disabled={busy} onClick={() => { renew("organize"); setRebuild(page); }}>重建此页：{page.title}</button>}
        </article>)}
      </>}
      {tab === "graph" && <><p className="context-summary">{graph.nodes.length} 个主题节点 · {graph.edges.length} 条关联（非通用实体数据库）</p>
        {!!graph.nodes.length && <svg className="knowledge-graph" viewBox="0 0 600 400" role="img" aria-label="知识主题关联图">
          {graph.edges.map((edge, index) => {
            const pos = (slug: string) => { const i = graph.nodes.findIndex(n => n.slug === slug); return { x: 300 + 210 * Math.cos(i * Math.PI * 2 / graph.nodes.length), y: 200 + 135 * Math.sin(i * Math.PI * 2 / graph.nodes.length) }; };
            const a = pos(edge.from), b = pos(edge.to); return <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={edge.relation === "conflicts" ? "#b95353" : "#91a99e"} strokeWidth="2" />;
          })}
          {graph.nodes.map((node, index) => { const x = 300 + 210 * Math.cos(index * Math.PI * 2 / graph.nodes.length), y = 200 + 135 * Math.sin(index * Math.PI * 2 / graph.nodes.length);
            return <g key={node.id}><title>{node.title}</title><circle cx={x} cy={y} r="30" fill="#edf5f1" stroke="#458977" /><text x={x} y={y + 4} textAnchor="middle" fontSize="12">{node.title.slice(0, 9)}</text></g>;
          })}</svg>}
        {graph.edges.map((edge, index) => <article className="result" key={index}><p>{edge.from} → {edge.relation} → {edge.to}</p>
          {edge.citations.map((c, i) => <blockquote key={i}>{c.quote}<small className="citation-source">{c.source_key}</small></blockquote>)}</article>)}</>}
      <h2>整理任务</h2>{jobs.map(job => <article className="result" key={job.id}><header><strong>{states[job.state] ?? job.state}</strong><small>{job.id}</small></header>
        <p className="muted">{job.target_slugs ? `仅替换：${job.target_slugs.join("、")}` : "完整重建：替换全部知识页"}</p>
        {job.error && <p>{job.error}</p>}
        {!!job.proposal?.unsupported_items?.length && <p className="context-warning">模型检查发现 {job.proposal.unsupported_items.length} 个未充分支持的条目，请逐项核对。</p>}
        {job.proposal?.pages.map(page => <WikiPage key={page.slug} page={page} />)}
        {job.state === "review" && canWrite && <div className="actions">{[true, false].map(approve => <button key={String(approve)} className={approve ? "primary" : "secondary"} disabled={busy}
          onClick={() => void run(async () => { await api.resolveKnowledge(job.id, approve); if (active.current) await refresh(); })}>{approve ? "确认发布知识页" : "拒绝并清除候选"}</button>)}</div>}
      </article>)}
    </>}
    {rebuild && <Dialog title={`重建 ${rebuild.title}`} close={() => { setRebuild(null); setError(""); }}><div className="form-stack">
      <p>读取此页依赖的最新来源，生成候选后由你审核。只替换此页，无关页面不变。旧的跨页关系将移除；需要恢复关系时请一起整理相关页面。</p>
      <p>此操作会把来源发送给配置的模型，可能产生费用。模型未启用时返回明确错误，不会伪造知识页。</p>
      <ul>{[...new Set(rebuild.sources.map(s => `${s.kind}: ${s.id}`))].map(source => <li key={source}>{source}</li>)}</ul>
      <button className="primary" disabled={busy} onClick={() => void run(async () => {
        await api.organize({ user_id: userId, request_id: requests.current.organize, target_slugs: [rebuild.slug],
          memory_ids: [...new Set(rebuild.sources.filter(s => s.kind === "memory").map(s => s.id))],
          conversation_ids: [...new Set(rebuild.sources.filter(s => s.kind === "conversation").map(s => s.id))], mode: "review" }, call());
        if (active.current) { setRebuild(null); setError(""); await refresh(); }
      })}>生成此页候选（待审核）</button>
      {error && <p className="error" role="alert">{error}</p>}
    </div></Dialog>}
    {detail && <Dialog title={detail.title} close={() => { setDetail(null); setConfirmDelete(false); setAppend(""); }}><div className="form-stack">
      <small>{detail.id} · v{detail.version}</small>{detail.messages.map(message => <article key={message.id}><strong>{roles[message.role]}</strong>
        <small> · {message.id} · {message.observed_at}</small><blockquote>{message.content}</blockquote></article>)}
      {detail.next_cursor && <button className="secondary" disabled={busy} onClick={() => void open(detail.id, detail.next_cursor!)}>读取下一页消息</button>}
      {canWrite && <><details><summary>追加消息</summary><form className="context-form" onSubmit={event => { event.preventDefault(); void run(async () => {
        const updated = await api.appendConversation(detail.id, { request_id: requests.current.append, expected_version: detail.version, messages: JSON.parse(append) });
        renew("append"); if (active.current) { setAppend(""); const fresh = await api.conversation(updated.id, "", call()); if (active.current) setDetail(fresh); await refresh(); }
      }); }}><label>追加消息 JSON<textarea required rows={5} value={append} onChange={e => { setAppend(e.target.value); renew("append"); }} /></label>
        <button className="primary" disabled={busy}>确认追加</button></form></details>
        {confirmDelete ? <div><p>删除原文及依赖此会话的知识页，不能在控制台恢复。无关页面保留，平台备份保留期另计。</p>
          <button className="primary danger-bg" disabled={busy} onClick={() => void run(async () => { await api.deleteConversation(detail.id, detail.version);
            if (active.current) { setDetail(null); setConfirmDelete(false); setHits(null); await refresh(); } })}>确认删除会话</button>
          <button className="secondary" onClick={() => setConfirmDelete(false)}>取消</button></div> : <button className="secondary danger" onClick={() => setConfirmDelete(true)}>删除会话</button>}</>}
      {error && <p className="error" role="alert">{error}</p>}</div></Dialog>}
  </section>;
}
function WikiPage({ page }: { page: KnowledgePage }) {
  return <article className="result"><h2>{page.title}</h2><small>{page.slug}</small>{page.claims.map((claim, index) => <div className="knowledge-claim" key={index}>
    {claim.status === "conflicted" && <p className="context-warning">冲突组 {claim.conflict_group} · 保留不同报告，未裁定真伪</p>}<p>{claim.text}</p>
    {claim.citations.map((citation, i) => <details key={i}><summary>查看引用</summary><blockquote>{citation.quote}<small className="citation-source">{citation.source_key}</small></blockquote></details>)}</div>)}</article>;
}
