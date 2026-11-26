import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useI18n } from "./i18n";

export function Dialog({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    return () => { ref.current?.close(); trigger?.focus(); };
  }, []);
  return <dialog ref={ref} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === ref.current) close(); }}>
    <header><h2>{title}</h2><button className="icon-button" aria-label={t("Close", "关闭")} title={t("Close", "关闭")} onClick={close}><X size={18} /></button></header>
    {children}
  </dialog>;
}
