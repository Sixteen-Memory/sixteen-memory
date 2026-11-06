import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { consoleUrl, content, contactEmail, quickstartUrl } from "./content.mjs";
import { createEditorialMotion } from "./editorial-motion";
import VideoHero from "./VideoHero";
import ProductPage from "./ProductPage";
import SiteDocument, { SiteMap } from "./SiteDocument";
import { normalizePath, pageForPath, routeHref, siteOrigin, sitePages } from "./site-pages.mjs";

type Language = keyof typeof content;

function useLanguage() {
  const [language, setLanguage] = useState<Language>(() => new URLSearchParams(window.location.search).get("lang") === "en" ? "en" : "zh");
  function toggleLanguage() {
    const next = language === "zh" ? "en" : "zh";
    const url = new URL(window.location.href);
    if (next === "en") url.searchParams.set("lang", "en"); else url.searchParams.delete("lang");
    window.history.replaceState(null, "", url);
    setLanguage(next);
  }
  return { language, toggleLanguage };
}
function DocumentApp({ path }: { path: string }) {
  const { language, toggleLanguage } = useLanguage();
  const selected = pageForPath(path);
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    const pageName = selected?.nav[language] ?? (language === "zh" ? "页面未找到" : "Page not found");
    document.title = `${pageName} · SixteenMemory`;
    const description = selected?.description[language] ?? "";
    for (const selector of ['meta[name="description"]', 'meta[property="og:description"]']) document.querySelector(selector)?.setAttribute("content", description);
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", document.title);
    document.querySelector('meta[property="og:url"]')?.setAttribute("content", siteOrigin + routeHref(path));
    document.querySelector('link[rel="canonical"]')?.setAttribute("href", siteOrigin + routeHref(path));
    document.getElementById("main")?.setAttribute("tabindex", "-1");
  }, [language, path]);
  useEffect(() => {
    const target = document.getElementById(window.location.hash.slice(1));
    if (!target) return;
    const frame = requestAnimationFrame(() => target.scrollIntoView({ behavior: "instant", block: "start" }));
    return () => cancelAnimationFrame(frame);
  }, [language, path]);
  return <SiteDocument page={selected} language={language} onLanguage={toggleLanguage}/>;
}
export default function App() {
  const path = normalizePath(window.location.pathname);
  return path === "/" ? <HomePage/> : <DocumentApp path={path}/>;
}
function HomePage() {
  const { language, toggleLanguage } = useLanguage();
  const [paused, setPaused] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [privacy, setPrivacy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const motion = useRef<ReturnType<typeof createEditorialMotion> | null>(null);
  const c = content[language];
  const zh = language === "zh";

  useEffect(() => {
    document.documentElement.lang = zh ? "zh-CN" : "en";
    document.title = zh
      ? "拾陆记忆 SixteenMemory · Agent 记忆 API 与开发工具"
      : "SixteenMemory · Memory API & developer tools";
    if (!page.current) return;
    motion.current = createEditorialMotion(page.current, paused);
    return () => {
      motion.current?.destroy();
      motion.current = null;
    };
  }, [language]);
  useEffect(() => {
    motion.current?.setPaused(paused);
  }, [paused]);
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setPaused(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (privacy && !dialog.current?.open) dialog.current?.showModal();
    else if (!privacy && dialog.current?.open) dialog.current?.close();
  }, [privacy]);
  return (
    <div className="editorial-root" data-paused={paused}>
      <a className="skip-link" href="#main">
        {c.skip}
      </a>
      <button
        className="focus-motion-toggle"
        aria-pressed={paused}
        onClick={() => setPaused(!paused)}
      >
        {paused
          ? zh
            ? "播放背景动画"
            : "Play background animation"
          : zh
            ? "暂停背景动画"
            : "Pause background animation"}
      </button>
      <div className="film-grain" aria-hidden="true" />
      <div className="page-flow" ref={page} key={language}>
        <VideoHero
          language={language}
          paused={paused}
          onLanguage={toggleLanguage}
          copy={c}
        />

        <main id="main">
          <ProductPage language={language} copy={c} />
          <section className="home-explore" aria-labelledby="explore-title"><div className="product-shell"><div><p className="product-kicker">EXPLORE THE PRODUCT</p><h2 id="explore-title">{zh ? "从产品到接入，逐步了解。" : "From product to integration."}</h2><p>{zh ? "查看功能、开发文档和部署方式。线上可用与开发中的能力，都有明确说明。" : "Explore features, docs and deployment, with online and development capabilities clearly separated."}</p></div><nav aria-label={zh ? "网站页面" : "Website pages"}>{sitePages.map(item => <a key={item.path} href={routeHref(item.path, language)}>{item.nav[language]}<ArrowUpRight size={16}/></a>)}</nav></div></section>
        </main>
        <footer id="contact" className="contact">
          <p className="eyebrow">
            {zh
              ? "下一次对话，从这里开始"
              : "A BETTER BEGINNING FOR WHAT COMES NEXT"}
          </p>
          <a className="contact-title" href={`mailto:${contactEmail}`}>
            {zh ? "讨论你的接入场景。" : "DISCUSS YOUR INTEGRATION."}
            <ArrowUpRight />
          </a>
          <div className="footer-product-links">
            <a href={quickstartUrl} target="_blank" rel="noreferrer">{c.quickstart}<ArrowUpRight size={14}/></a>
            <a href={consoleUrl} target="_blank" rel="noreferrer">{c.console}<ArrowUpRight size={14}/></a>
            <a href={routeHref("/integrations", language)}>{zh ? "API、SDK 与 MCP" : "API, SDK & MCP"}<ArrowUpRight size={14}/></a>
          </div>
          <a className="contact-email" href={`mailto:${contactEmail}`}>
            {contactEmail}
          </a>
          <SiteMap language={language}/>
          <div className="footer-line">
            <span>
              © {new Date().getFullYear()} SixteenMemory ·{" "}
              {zh ? "拾陆记忆" : "KEEP WHAT MATTERS"}
            </span>
            <button onClick={() => setPrivacy(true)}>{c.privacy}</button>
          </div>
        </footer>
      </div>
      <dialog
        ref={dialog}
        onCancel={() => setPrivacy(false)}
        onClose={() => setPrivacy(false)}
        aria-labelledby="privacy-title"
      >
        <button
          className="dialog-close"
          onClick={() => setPrivacy(false)}
          aria-label={c.close}
        >
          <X size={22} />
        </button>
        <p className="eyebrow brand-label">SixteenMemory / PRIVACY</p>
        <h2 id="privacy-title">{c.privacyTitle}</h2>
        <p>{c.privacyBody}</p>
        <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
      </dialog>
    </div>
  );
}
