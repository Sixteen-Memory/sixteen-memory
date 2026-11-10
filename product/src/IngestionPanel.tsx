import { useEffect, useState, type FormEvent } from "react";
import { FileAudio, FileVideo, MessageSquare, Upload } from "lucide-react";
import { api, errorMessage, type IngestionJob } from "./api";
import type { MediaMime } from "../sdk/index.mjs";
import type { MediaUpload } from "../sdk/service-types";

const stateName: Record<string, string> = { running: "处理中", review: "待确认", applied: "已写入", rejected: "已拒绝", deleted: "已清理", expired: "已过期", failed: "失败，不自动重试" };
const actionName = { add: "新增", merge: "合并依据", supersede: "替代旧状态" };
export function IngestionPanel({ userId, canWrite, onChanged }: { userId: string; canWrite: boolean; onChanged: () => void }) {
  const [content, setContent] = useState("");
  const [ref, setRef] = useState("");
  const [mode, setMode] = useState<"review" | "auto">("review");
  const [inputKind, setInputKind] = useState<"text" | "audio" | "video">("text");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputVersion, setFileInputVersion] = useState(0);
  const [consent, setConsent] = useState(false);
  const [jobs, setJobs] = useState<IngestionJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [observedAt, setObservedAt] = useState(() => new Date().toISOString());
  const [reindexCursor, setReindexCursor] = useState("");
  const [indexStatus, setIndexStatus] = useState("");
  const [upload, setUpload] = useState<MediaUpload | null>(null);
  const [mediaEnabled, setMediaEnabled] = useState(false);
  const refresh = async () => { if (userId) setJobs(await api.ingestions(userId)); };
  useEffect(() => { let active = true; setJobs([]); setError(""); setIndexStatus(""); setReindexCursor(""); setRequestId(crypto.randomUUID()); if (userId) api.ingestions(userId).then(v => { if (active) setJobs(v); }).catch(e => { if (active) setError(errorMessage(e)); }); return () => { active = false; }; }, [userId]);
  useEffect(() => { void api.health().then(value => setMediaEnabled(value.media_upload?.enabled === true)).catch(() => setMediaEnabled(false)); }, []);
  useEffect(() => {
    if (!upload || !["queued", "running"].includes(upload.state)) return;
    const timer = setInterval(() => { void api.mediaUpload(upload.id).then(async next => { setUpload(next); await refresh(); }).catch(e => setError(errorMessage(e))); }, 5000);
    return () => clearInterval(timer);
  }, [upload?.id, upload?.state]);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (inputKind === "text") {
        const messages = JSON.parse(content);
        if (!Array.isArray(messages)) throw new Error("消息必须是JSON数组");
        await api.ingest({ user_id: userId, request_id: requestId, ref, observed_at: observedAt, messages, mode });
      } else {
        if (!file || !consent) throw new Error("请选择文件并确认媒体处理授权");
        if (file.size > 500 * 1024 * 1024) throw new Error("文件不能超过500 MiB");
        const extension = file.name.split(".").pop()?.toLowerCase();
        const mime: MediaMime | undefined = extension === "wav" && inputKind === "audio" ? "audio/wav" :
          extension === "mp3" && inputKind === "audio" ? "audio/mpeg" : extension === "mp4" && inputKind === "video" ? "video/mp4" : undefined;
        if (!mime) throw new Error("音频请选择WAV或MP3，视频请选择MP4");
        let next = await api.uploadMedia({ user_id: userId, request_id: requestId, ref, observed_at: observedAt,
          mime_type: mime, size_bytes: file.size, consent: true, mode: "review" }, file);
        setUpload(next);
        setFile(null); setConsent(false); setFileInputVersion(value => value + 1);
      }
      setRequestId(crypto.randomUUID()); await refresh(); onChanged();
    } catch (e) { setError(errorMessage(e)); await refresh().catch(() => undefined); }
    finally { setBusy(false); }
  }
  return <section className="ingestion-panel form-stack">
    <h2>Anything to Memory</h2>
    {!userId ? <p role="status">先填写一个用户标识，再开始抽取或审核。</p> : <>
      {canWrite && <form className="form-stack" onSubmit={submit}>
        <div className="segmented" aria-label="输入类型">
          {([["text", "文本", MessageSquare], ["audio", "音频", FileAudio], ["video", "视频", FileVideo]] as const).map(([value, label, Icon]) =>
            <button type="button" key={value} disabled={busy} aria-pressed={inputKind === value} onClick={() => {
              setInputKind(value); setFile(null); setConsent(false); setRequestId(crypto.randomUUID());
            }}><Icon size={16} />{label}</button>)}
        </div>
        <label>来源发生时间（ISO）<input required value={observedAt} onChange={e => { setObservedAt(e.target.value); setRequestId(crypto.randomUUID()); }} /></label>
        <label>来源标识<input required maxLength={inputKind === "text" ? 300 : 100} value={ref} onChange={e => { setRef(e.target.value); setRequestId(crypto.randomUUID()); }} placeholder="session-001" /></label>
        {inputKind === "text" ? <>
          <label>对话消息 JSON<textarea required rows={7} value={content} onChange={e => { setContent(e.target.value); setRequestId(crypto.randomUUID()); }} placeholder={'[{"id":"m1","role":"user","content":"请用中文与我沟通"}]'} /></label>
          <label>写入模式<select value={mode} onChange={e => { setMode(e.target.value === "auto" ? "auto" : "review"); setRequestId(crypto.randomUUID()); }}><option value="review">先审阅，再确认写入（推荐）</option><option value="auto">符合规则自动写入，冲突仍需确认</option></select></label>
        </> : <>
          <p>支持30分钟以内、最多500 MiB的录音或视频。分片上传到私有临时存储，完成后后台处理；候选仍需人工确认。</p>
          {!mediaEnabled && <p role="status">当前服务器尚未启用音视频模型与大文件存储，暂不能上传。代码功能已提供，需管理员完成配置。</p>}
          <label>{inputKind === "audio" ? "音频文件 · WAV / MP3 · ≤ 30分钟 / 500 MiB" : "视频文件 · MP4 · ≤ 30分钟 / 500 MiB"}
            <input key={`${inputKind}-${fileInputVersion}`} type="file" required disabled={busy} accept={inputKind === "audio" ? ".wav,.mp3" : ".mp4"}
              onChange={e => { setFile(e.target.files?.[0] ?? null); setConsent(false); setRequestId(crypto.randomUUID()); }} /></label>
          <label className="inline-label"><input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} />
            我有权处理此媒体，并同意将文件发送给管理员配置的模型供应商。</label>
        </>}
        <div className="actions"><button className="primary" disabled={busy || !userId || (inputKind !== "text" && (!file || !consent || !mediaEnabled))}><Upload size={16} />{busy ? "上传处理中…" : "提取记忆"}</button><button type="button" className="secondary" disabled={busy} onClick={() => { setRequestId(crypto.randomUUID()); setError("已切换到新请求。请先检查旧任务是否已完成，避免重复调用模型。"); }}>新建请求标识</button></div>
        {upload && <div role="status"><p>上传 {Math.round(upload.received_bytes / upload.size_bytes * 100)}% · {upload.state} {upload.error ?? ""}</p><small>{upload.id}</small>
          {!["processed", "cancelled", "failed", "expired"].includes(upload.state) && <button type="button" className="secondary" disabled={busy} onClick={() => { void api.cancelMediaUpload(upload.id).then(setUpload).catch(e => setError(errorMessage(e))); }}>取消并清理媒体</button>}
        </div>}
      </form>}
      {error && <p className="error" role="alert">{error}</p>}
      <div className="actions"><h2>导入与待确认记录</h2><button className="secondary" disabled={busy} onClick={() => void refresh().catch(e => setError(errorMessage(e)))}>刷新导入记录</button></div>
      {jobs.map(job => <article className="result" key={job.id}><header><strong>{stateName[job.state] ?? job.state}</strong><small>{job.id}</small></header>
        {job.proposal?.media && <div className="proposal-fact">
          <strong>媒体解读 · {job.proposal.media.mime_type}</strong>
          <p>模型：{job.proposal.media.model} · 说话人和时间段未经独立核实</p>
          {job.proposal.media.warnings.map((warning, i) => <p key={i} role="status">{warning}</p>)}
          <details><summary>查看解读片段（{job.proposal.media.segments.length}）</summary>
            {job.proposal.media.segments.map(s => <blockquote key={s.id}><small>{s.start_ms == null ? "时间未知" : `${s.start_ms / 1000}–${s.end_ms! / 1000}秒`} · {s.speaker ?? "说话人未知"} · {s.kind === "speech" ? "语音" : "画面"}</small><p>{s.text}</p></blockquote>)}
          </details>
        </div>}
        {job.proposal?.decisions.map((d, i) => <div className="proposal-fact" key={i}><strong>{actionName[d.action]}</strong><p>{d.fact.content}</p><blockquote>{d.fact.source.text}</blockquote><small>{d.reason}{d.target_id ? ` · 目标 ${d.target_id} v${d.target_version}` : ""}</small></div>)}
        {job.state === "review" && canWrite && <div className="actions"><button className="primary" disabled={busy} onClick={() => { setBusy(true); setError(""); api.resolveIngestion(job.id, true).then(async () => { await refresh(); onChanged(); }).catch(e => setError(errorMessage(e))).finally(() => setBusy(false)); }}>确认这批变更</button><button className="secondary" disabled={busy} onClick={() => { setBusy(true); api.resolveIngestion(job.id, false).then(refresh).catch(e => setError(errorMessage(e))).finally(() => setBusy(false)); }}>拒绝并清除候选</button></div>}
        {job.results.length > 0 && <small>{job.results.length}项操作已完成</small>}
      </article>)}
      {!jobs.length && <p>暂无导入记录</p>}
      {canWrite && <div className="form-stack"><h2>语义索引</h2><p>语义Embedding使用管理员配置的千问模型。已有显式记忆不会自动重算；每次处理最多8条。改变模型、接口、维度或版本号后需从头重建。此操作会将记忆内容发送给配置的阿里云工作空间。</p><div className="actions"><button className="secondary" disabled={busy} onClick={() => { setBusy(true); setError(""); api.reindex(userId, reindexCursor).then(v => { setReindexCursor(v.next_cursor ?? ""); setIndexStatus(`本批完成 ${v.indexed} 条${v.next_cursor ? "，可继续下一批" : "，已到末尾"}`); }).catch(e => setError(errorMessage(e))).finally(() => setBusy(false)); }}>{reindexCursor ? "处理下一批索引" : "从头重建一批索引"}</button><span role="status">{indexStatus}</span></div></div>}
    </>}
  </section>;
}
