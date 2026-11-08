import { useEffect, useState, type FormEvent } from "react";
import { api, errorMessage, type IngestionJob } from "./api";

const stateName: Record<string, string> = { running: "处理中", review: "待确认", applied: "已写入", rejected: "已拒绝", deleted: "已清理", expired: "已过期", failed: "失败，不自动重试" };
const actionName = { add: "新增", merge: "合并依据", supersede: "替代旧状态" };
export function IngestionPanel({ userId, canWrite, onChanged }: { userId: string; canWrite: boolean; onChanged: () => void }) {
  const [content, setContent] = useState("");
  const [ref, setRef] = useState("");
  const [mode, setMode] = useState<"review" | "auto">("review");
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [observedAt, setObservedAt] = useState(() => new Date().toISOString());
  const [reindexCursor, setReindexCursor] = useState("");
  const [indexStatus, setIndexStatus] = useState("");
  const refresh = async () => { if (userId) setJobs(await api.ingestions(userId)); };
  useEffect(() => { let active = true; setJobs([]); setError(""); setIndexStatus(""); setReindexCursor(""); setRequestId(crypto.randomUUID()); if (userId) api.ingestions(userId).then(v => { if (active) setJobs(v); }).catch(e => { if (active) setError(errorMessage(e)); }); return () => { active = false; }; }, [userId]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const messages = JSON.parse(content);
      if (!Array.isArray(messages)) throw new Error("消息必须是JSON数组");
      await api.ingest({ user_id: userId, request_id: requestId, ref, observed_at: observedAt, messages, mode });
      setRequestId(crypto.randomUUID()); await refresh(); onChanged();
    } catch (e) { setError(errorMessage(e)); await refresh().catch(() => undefined); }
    finally { setBusy(false); }
  }
  return <section className="ingestion-panel form-stack">
    <p>将对话中的长期事实提取为候选记忆。用户消息可作为依据，助手消息只作上下文。内容会发送给管理员配置的模型供应商；模型未配置时不会伪造结果。</p>
    {!userId ? <p role="status">先填写一个用户标识，再开始抽取或审核。</p> : <>
      {canWrite && <form className="form-stack" onSubmit={submit}>
        <label>对话发生时间（ISO）<input required value={observedAt} onChange={e => { setObservedAt(e.target.value); setRequestId(crypto.randomUUID()); }} /></label>
        <label>来源标识<input required maxLength={300} value={ref} onChange={e => { setRef(e.target.value); setRequestId(crypto.randomUUID()); }} placeholder="session-001" /></label>
        <label>对话消息 JSON<textarea required rows={7} value={content} onChange={e => { setContent(e.target.value); setRequestId(crypto.randomUUID()); }} placeholder={'[{"id":"m1","role":"user","content":"请用中文与我沟通"}]'} /></label>
        <label>写入模式<select value={mode} onChange={e => { setMode(e.target.value === "auto" ? "auto" : "review"); setRequestId(crypto.randomUUID()); }}><option value="review">先审阅，再确认写入（推荐）</option><option value="auto">符合规则自动写入，冲突仍需确认</option></select></label>
        <div className="actions"><button className="primary" disabled={busy || !userId}>{busy ? "处理中…" : "提取记忆"}</button><button type="button" className="secondary" disabled={busy} onClick={() => { setRequestId(crypto.randomUUID()); setError("已切换到新请求。请先检查旧任务是否已完成，避免重复调用模型。"); }}>新建请求标识</button></div>
      </form>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions"><h2>导入与待确认记录</h2><button className="secondary" disabled={busy} onClick={() => void refresh().catch(e => setError(errorMessage(e)))}>刷新导入记录</button></div>
      {jobs.map(job => <article className="result" key={job.id}><header><strong>{stateName[job.state] ?? job.state}</strong><small>{job.id}</small></header>
        {job.proposal?.decisions.map((d, i) => <div className="proposal-fact" key={i}><strong>{actionName[d.action]}</strong><p>{d.fact.content}</p><blockquote>{d.fact.source.text}</blockquote><small>{d.reason}{d.target_id ? ` · 目标 ${d.target_id} v${d.target_version}` : ""}</small></div>)}
        {job.state === "review" && canWrite && <div className="actions"><button className="primary" disabled={busy} onClick={() => { setBusy(true); setError(""); api.resolveIngestion(job.id, true).then(async () => { await refresh(); onChanged(); }).catch(e => setError(errorMessage(e))).finally(() => setBusy(false)); }}>确认这批变更</button><button className="secondary" disabled={busy} onClick={() => { setBusy(true); api.resolveIngestion(job.id, false).then(refresh).catch(e => setError(errorMessage(e))).finally(() => setBusy(false)); }}>拒绝并清除候选</button></div>}
        {job.results.length > 0 && <small>{job.results.length}项操作已完成</small>}
      </article>)}
      {!jobs.length && <p>暂无导入记录</p>}
      {canWrite && <div className="form-stack"><h2>语义索引</h2><p>语义Embedding使用管理员配置的千问模型。已有显式记忆不会自动重算；每次处理最多8条。改变模型、接口、维度或修订号后需从头重建。此操作会将记忆内容发送给配置的阿里云工作空间。</p><div className="actions"><button className="secondary" disabled={busy} onClick={() => { setBusy(true); setError(""); api.reindex(userId, reindexCursor).then(v => { setReindexCursor(v.next_cursor ?? ""); setIndexStatus(`本批完成 ${v.indexed} 条${v.next_cursor ? "，可继续下一批" : "，已到末尾"}`); }).catch(e => setError(errorMessage(e))).finally(() => setBusy(false)); }}>{reindexCursor ? "处理下一批索引" : "从头重建一批索引"}</button><span role="status">{indexStatus}</span></div></div>}
    </>}
  </section>;
}
