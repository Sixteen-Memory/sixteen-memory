import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "zh";
const STORAGE_KEY = "sixteen.console.lang";

function detectLang(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "zh") return saved;
  } catch {
    // Ignore restricted storage environments.
  }
  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("zh")) {
    return "zh";
  }
  return "en";
}

interface I18nValue {
  lang: Lang;
  setLang: (next: Lang) => void;
  toggle: () => void;
  t: (en: string, zh: string) => string;
  formatTime: (value: string) => string;
  formatDate: (value: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = lang === "zh" ? "SixteenMemory · 记忆控制台" : "SixteenMemory · Memory Console";
  }, [lang]);

  const setLang = (next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore restricted storage environments.
    }
  };

  const value: I18nValue = {
    lang,
    setLang,
    toggle: () => setLang(lang === "zh" ? "en" : "zh"),
    t: (en, zh) => (lang === "zh" ? zh : en),
    formatTime: (iso) => new Date(iso).toLocaleString(lang === "zh" ? "zh-CN" : "en-US", { hour12: false }),
    formatDate: (iso) => new Date(iso).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US"),
  };

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
