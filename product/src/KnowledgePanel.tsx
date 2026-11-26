import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, errorMessage } from "./api";
import { Dialog } from "./Dialog";
import { useI18n } from "./i18n";
import type { Conversation, ConversationPage, KnowledgeJob, KnowledgePage, WikiPage as PublishedPage, StaleWikiPage } from "../sdk/index.mjs";

export function KnowledgePanel({ userId, canWrite }: { userId: string; canWrite: boolean }) {
  const { lang, t } = useI18n();
  const states: Record<string, string> = {
    running: t("Running", "处理中"),
    review: t("Needs review", "待确认"),
    applied: t("Published", "已发布"),
    stale: t("Stale (source changed)", "来源变化，已失效"),
    replaced: t("Replaced", "已替换"),
    expired: t("Expired", "已过期"),
    rejected: t("Rejected", "已拒绝"),
    failed: t("Failed (no auto-retry)", "失败，不自动重试"),
  };
  const roles = {
    user: t("User", "用户"),
    assistant: t("Assistant (not proof)", "助手（非事实凭证）"),
    system: t("System (verbatim only)", "系统（仅原文）"),
    tool: t("Tool (unverified)", "工具（未独立验证）"),
  };
  const failText = t("Request failed. Please try again.", "请求失败，请稍后重试");
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
    } catch (e) { if (active.current) setError(errorMessage(e, failText)); }
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); } catch (e) { if (active.current) setError(errorMessage(e, failText)); }
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
    <div className="segmented context-tabs" aria-label={t("Knowledge view", "知识视图")}>
      {[["conversations", t("Conversations", "完整会话")], ["wiki", "Wiki"], ["graph", t("Graph", "图谱")]].map(([value, label]) =>
        <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}
    </div>
    {!userId ? <p>{t("Select or enter a user ID first.", "请先选择用户。")}</p> : <>
      <p className="muted">{t("Only explicitly submitted conversations are stored. Transcripts and Wiki pages are reference data, not instructions. Source edits invalidate only dependent pages; unrelated pages stay readable.", "仅保存明确提交的会话。原文与知识页都是参考数据，不是系统指令。来源变更只使依赖它的知识页失效；其他页面继续可读。模型未配置时无法生成或重建知识页。")}</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button className="secondary" disabled={busy} onClick={() => void refresh()}>{t("Refresh knowledge", "刷新知识")}</button>
      {tab === "conversations" && <>
        <form className="context-form" onSubmit={event => { event.preventDefault(); void run(async () => {
          const result = await api.searchConversations({ user_id: userId, query }, call()); if (active.current) setHits(result);
        }); }}><label>{t("Search conversation transcripts", "搜索会话原文")}<input required maxLength={1000} value={query} onChange={e => { setQuery(e.target.value); setHits(null); }} /></label>
          <button className="primary" disabled={busy}>{t("Search conversations", "检索会话")}</button></form>
        {hits && <div aria-live="polite"><p>{lang === "zh" ? `${hits.data.length} 条消息命中` : `${hits.data.length} matching messages`}</p>{hits.data.map(hit => <article className="result" key={`${hit.conversation_id}:${hit.id}`}>
          <header><strong>{hit.title}</strong><small>{roles[hit.role]} · v{hit.conversation_version}</small></header><blockquote>{hit.content}</blockquote>
          <button className="secondary" onClick={() => void open(hit.conversation_id)}>{t("Open conversation", "打开完整会话")}</button></article>)}</div>}
        {canWrite && <details><summary>{t("Add conversation", "新增完整会话")}</summary><form className="context-form" onSubmit={create}>
          <label>{t("Title", "会话标题")}<input required maxLength={200} value={title} onChange={e => { setTitle(e.target.value); renew("create"); }} /></label>
          <label>{t("Expires at (ISO, optional)", "到期时间（ISO，可选）")}<input value={expiry} onChange={e => { setExpiry(e.target.value); renew("create"); }} /></label>
          <label>{t("Messages JSON (up to 32 per batch)", "消息 JSON（每批最多32条）")}<textarea required rows={7} value={raw} onChange={e => { setRaw(e.target.value); renew("create"); }}
            placeholder={lang === "zh" ? '[{"id":"m1","role":"user","content":"请保留限制条件","observed_at":"2026-11-26T00:00:00Z"}]' : '[{"id":"m1","role":"user","content":"Keep all deployment constraints.","observed_at":"2026-11-26T00:00:00Z"}]'} /></label>
          <button className="primary" disabled={busy}>{t("Save transcript", "保存原文")}</button></form></details>}
        <h2>{t("Conversation sources", "会话来源")}</h2>
        {rows.map(row => <article className="result" key={row.id}><header>
          {canWrite && <input type="checkbox" aria-label={t(`Select ${row.title}`, `选择 ${row.title}`)} disabled={busy} checked={selected.includes(row.id)}
            onChange={e => { renew("organize"); setSelected(ids => e.target.checked ? [...ids, row.id] : ids.filter(id => id !== row.id)); }} />}
          <strong>{row.title}</strong><small>v{row.version} · {row.id}</small></header><footer>
            <button className="secondary" onClick={() => void open(row.id)}>{t("Open conversation", "打开完整会话")}</button></footer></article>)}
        {cursor && <button className="secondary" disabled={busy} onClick={() => void run(async () => {
          const result = await api.conversations(userId, cursor, call()); if (active.current) { setRows(old => [...old, ...result.data]); setCursor(result.next_cursor); }
        })}>{t("Load more", "加载更多会话")}</button>}
        {!rows.length && <p className="empty">{t("No conversations yet.", "暂无会话。旧抽取记录不能还原未保存的原文。")}</p>}
        {canWrite && <div className="context-form"><p>{t("Organizing sends selected sources (up to 8 conversations / 40,000 chars) to the configured model. Publishing replaces all Wiki pages for this user without altering original memories.", "整理会将所选完整来源发送给配置的模型，可能产生费用。每次最多8个会话、40000字符，不截断原文。发布将替换此用户全部知识页，请选全需要的来源；不会修改原始记忆。")}</p>
          <label>{t("Mode", "整理模式")}<select value={mode} onChange={e => { setMode(e.target.value as "review" | "auto"); renew("organize"); }}>
            <option value="review">{t("Review before publishing", "先审核，再发布")}</option>
            <option value="auto">{t("Auto-publish when checks pass", "检查通过自动发布，其他情况待审")}</option>
          </select></label>
          <button className="primary" disabled={busy || !selected.length || selected.length > 8} onClick={() => void run(async () => {
            await api.organize({ user_id: userId, request_id: requests.current.organize, conversation_ids: selected, mode }); if (active.current) await refresh();
          })}>{lang === "zh" ? `整理所选会话（${selected.length}）` : `Organize selected (${selected.length})`}</button>
          <button className="secondary" disabled={busy} onClick={() => { renew("organize"); setError(t("New request ID ready. Check prior runs first to avoid duplicate model calls.", "新请求已就绪；请先检查旧任务，避免重复模型费用。")); }}>{t("New request ID", "新建整理请求")}</button></div>}
      </>}
      {tab === "wiki" && <>
        {pages.map(page => <div key={page.slug}><WikiPage page={page} />
          {page.has_conflicts && <p className="context-warning">{t("Unresolved conflicting reports exist. Both sources are preserved for human review.", "存在未确认的冲突报告，已保留各方来源，不会自动选为唯一事实。")}</p>}
          <small>{lang === "zh" ? `${page.sources.length} 条引用来源 · 当前有效` : `${page.sources.length} cited sources · current`}</small>
          {canWrite && <button className="secondary" disabled={busy} onClick={() => { renew("organize"); setRebuild(page); }}>{t(`Rebuild page: ${page.title}`, `重建此页：${page.title}`)}</button>}
        </div>)}
        {!pages.length && <p className="empty">{t("No active Wiki pages yet. Organize sources and approve a candidate to publish.", "暂无有效知识页。请整理会话并审核发布。")}</p>}
        {!!stale.length && <h2>{t("Pages awaiting rebuild", "待重建页面")}</h2>}
        {stale.map(page => <article className="result" key={page.id}><h3>{page.title}</h3><small>{page.slug} · {t("Source changed", "来源已变化")} · {page.stale_at}</small>
          <p>{t("Stale claims and quotes have been removed from active reads. Unrelated pages remain readable.", "旧主张和引用已清除，不再用于回答。无关页面不受影响。")}</p>
          {canWrite && <button className="secondary" disabled={busy} onClick={() => { renew("organize"); setRebuild(page); }}>{t(`Rebuild page: ${page.title}`, `重建此页：${page.title}`)}</button>}
        </article>)}
      </>}
      {tab === "graph" && <><p className="context-summary">{lang === "zh" ? `${graph.nodes.length} 个主题节点 · ${graph.edges.length} 条关联（非通用实体数据库）` : `${graph.nodes.length} topic nodes · ${graph.edges.length} cited edges`}</p>
        {!!graph.nodes.length && <svg className="knowledge-graph" viewBox="0 0 600 400" role="img" aria-label={t("Topic relation graph", "知识主题关联图")}>
          {graph.edges.map((edge, index) => {
            const pos = (slug: string) => { const i = graph.nodes.findIndex(n => n.slug === slug); return { x: 300 + 210 * Math.cos(i * Math.PI * 2 / graph.nodes.length), y: 200 + 135 * Math.sin(i * Math.PI * 2 / graph.nodes.length) }; };
            const a = pos(edge.from), b = pos(edge.to); return <line key={index} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={edge.relation === "conflicts" ? "#b95353" : "#93c5fd"} strokeWidth="2" />;
          })}
          {graph.nodes.map((node, index) => { const x = 300 + 210 * Math.cos(index * Math.PI * 2 / graph.nodes.length), y = 200 + 135 * Math.sin(index * Math.PI * 2 / graph.nodes.length);
            return <g key={node.id}><title>{node.title}</title><circle cx={x} cy={y} r="30" fill="#eff6ff" stroke="#1060f0" /><text x={x} y={y + 4} textAnchor="middle" fontSize="12">{node.title.slice(0, 9)}</text></g>;
          })}</svg>}
        {graph.edges.map((edge, index) => <article className="result" key={index}><p>{edge.from} → {edge.relation} → {edge.to}</p>
          {edge.citations.map((c, i) => <blockquote key={i}>{c.quote}<small className="citation-source">{c.source_key}</small></blockquote>)}</article>)}</>}
      <h2>{t("Organization runs", "整理任务")}</h2>{jobs.map(job => <article className="result" key={job.id}><header><strong>{states[job.state] ?? job.state}</strong><small>{job.id}</small></header>
        <p className="muted">{job.target_slugs ? (lang === "zh" ? `仅替换：${job.target_slugs.join("、")}` : `Targeted rebuild: ${job.target_slugs.join(", ")}`) : t("Full rebuild: replaces all Wiki pages", "完整重建：替换全部知识页")}</p>
        {job.error && <p>{job.error}</p>}
        {!!job.proposal?.unsupported_items?.length && <p className="context-warning">{lang === "zh" ? `模型检查发现 ${job.proposal.unsupported_items.length} 个未充分支持的条目，请逐项核对。` : `${job.proposal.unsupported_items.length} unsupported items flagged during verification; please review carefully.`}</p>}
        {job.proposal?.pages.map(page => <WikiPage key={page.slug} page={page} />)}
        {job.state === "review" && canWrite && <div className="actions">{[true, false].map(approve => <button key={String(approve)} className={approve ? "primary" : "secondary"} disabled={busy}
          onClick={() => void run(async () => { await api.resolveKnowledge(job.id, approve); if (active.current) await refresh(); })}>{approve ? t("Publish Wiki page", "确认发布知识页") : t("Reject candidate", "拒绝并清除候选")}</button>)}</div>}
      </article>)}
    </>}
    {rebuild && <Dialog title={t(`Rebuild ${rebuild.title}`, `重建 ${rebuild.title}`)} close={() => { setRebuild(null); setError(""); }}><div className="form-stack">
      <p>{t("Reads the latest dependent sources and creates a review candidate for this exact page only. Unrelated pages remain untouched.", "读取此页依赖的最新来源，生成候选后由你审核。只替换此页，无关页面不变。旧的跨页关系将移除；需要恢复关系时请一起整理相关页面。")}</p>
      <p>{t("This sends cited sources to the configured model provider. If models are disabled, it returns an explicit error.", "此操作会把来源发送给配置的模型，可能产生费用。模型未启用时返回明确错误，不会伪造知识页。")}</p>
      <ul>{[...new Set(rebuild.sources.map(s => `${s.kind}: ${s.id}`))].map(source => <li key={source}>{source}</li>)}</ul>
      <button className="primary" disabled={busy} onClick={() => void run(async () => {
        await api.organize({ user_id: userId, request_id: requests.current.organize, target_slugs: [rebuild.slug],
          memory_ids: [...new Set(rebuild.sources.filter(s => s.kind === "memory").map(s => s.id))],
          conversation_ids: [...new Set(rebuild.sources.filter(s => s.kind === "conversation").map(s => s.id))], mode: "review" }, call());
        if (active.current) { setRebuild(null); setError(""); await refresh(); }
      })}>{t("Generate review candidate", "生成此页候选（待审核）")}</button>
      {error && <p className="error" role="alert">{error}</p>}
    </div></Dialog>}
    {detail && <Dialog title={detail.title} close={() => { setDetail(null); setConfirmDelete(false); setAppend(""); }}><div className="form-stack">
      <small>{detail.id} · v{detail.version}</small>{detail.messages.map(message => <article key={message.id}><strong>{roles[message.role]}</strong>
        <small> · {message.id} · {message.observed_at}</small><blockquote>{message.content}</blockquote></article>)}
      {detail.next_cursor && <button className="secondary" disabled={busy} onClick={() => void open(detail.id, detail.next_cursor!)}>{t("Load next page", "读取下一页消息")}</button>}
      {canWrite && <><details><summary>{t("Append messages", "追加消息")}</summary><form className="context-form" onSubmit={event => { event.preventDefault(); void run(async () => {
        const updated = await api.appendConversation(detail.id, { request_id: requests.current.append, expected_version: detail.version, messages: JSON.parse(append) });
        renew("append"); if (active.current) { setAppend(""); const fresh = await api.conversation(updated.id, "", call()); if (active.current) setDetail(fresh); await refresh(); }
      }); }}><label>{t("Messages JSON", "追加消息 JSON")}<textarea required rows={5} value={append} onChange={e => { setAppend(e.target.value); renew("append"); }} /></label>
        <button className="primary" disabled={busy}>{t("Confirm append", "确认追加")}</button></form></details>
        {confirmDelete ? <div><p>{t("Deletes the transcript and dependent Wiki pages. Unrelated pages remain intact.", "删除原文及依赖此会话的知识页，不能在控制台恢复。无关页面保留，平台备份保留期另计。")}</p>
          <button className="primary danger-bg" disabled={busy} onClick={() => void run(async () => { await api.deleteConversation(detail.id, detail.version);
            if (active.current) { setDetail(null); setConfirmDelete(false); setHits(null); await refresh(); } })}>{t("Confirm delete", "确认删除会话")}</button>
          <button className="secondary" onClick={() => setConfirmDelete(false)}>{t("Cancel", "取消")}</button></div> : <button className="secondary danger" onClick={() => setConfirmDelete(true)}>{t("Delete conversation", "删除会话")}</button>}</>}
      {error && <p className="error" role="alert">{error}</p>}</div></Dialog>}
  </section>;
}
function WikiPage({ page }: { page: KnowledgePage }) {
  const { lang, t } = useI18n();
  return <article className="result"><h2>{page.title}</h2><small>{page.slug}</small>{page.claims.map((claim, index) => <div className="knowledge-claim" key={index}>
    {claim.status === "conflicted" && <p className="context-warning">{lang === "zh" ? `冲突组 ${claim.conflict_group} · 保留不同报告，等待人工确认` : `Conflict group ${claim.conflict_group} · distinct cited reports preserved`}</p>}<p>{claim.text}</p>
    {claim.citations.map((citation, i) => <details key={i}><summary>{t("View citation", "查看引用")}</summary><blockquote>{citation.quote}<small className="citation-source">{citation.source_key}</small></blockquote></details>)}</div>)}</article>;
}
