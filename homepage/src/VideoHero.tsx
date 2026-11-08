import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Play } from "lucide-react";
import { createVideoHero } from "./video-hero-controller";
import { content, consoleUrl, quickstartUrl } from "./content.mjs";
import { primaryNavigation, routeHref } from "./site-pages.mjs";
import DeveloperMenu from "./DeveloperMenu";
import BrandLogo from "./BrandLogo";
import "./video-hero.css";

type Props = {
  language: "zh" | "en";
  paused: boolean;
  onLanguage: () => void;
  copy: (typeof content)["zh" | "en"];
};
const videoCopy = {
  zh: {
    loading: "正在进入记忆现场",
    fallback: "视频暂时无法加载，已显示封面图",
    retry: "重试视频",
    autoplay: "点击播放封面视频"
  },
  en: {
    loading: "ENTERING THE MEMORY FIELD",
    fallback: "Video unavailable. Showing the cover image.",
    retry: "Retry video",
    autoplay: "Play cover video"
  }
};
export default function VideoHero({ language, paused, onLanguage, copy }: Props) {
  const root = useRef<HTMLElement>(null);
  const control = useRef<ReturnType<typeof createVideoHero> | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const source = "/assets/memory16-native.mp4";
  const poster = "/assets/memory16-native-poster.jpg";
  const c = { ...videoCopy[language], ...copy };
  useEffect(() => {
    if (!root.current) return;
    control.current = createVideoHero(root.current, {
      paused,
      onReady: () => setReady(true),
      onError: () => {
        setFailed(true);
        setReady(true);
      },
      onBlocked: setBlocked
    });
    return () => {
      control.current?.destroy();
      control.current = null;
    };
  }, []);
  useEffect(() => {
    control.current?.setPaused(paused);
  }, [paused]);
  function retry() {
    setFailed(false);
    setBlocked(false);
    control.current?.retry();
  }
  return (
    <section
      className="night-track"
      id="top"
      ref={root}
      aria-labelledby="hero-title"
      data-provider="native-video"
      data-artwork="user-memory16-preview"
      data-motion-paused={paused}
    >
      <div className="night-scene">
        <div className="night-media" aria-hidden="true">
          <img className="night-poster" src={poster} alt="" />
          <video
            className="night-video"
            src={source}
            data-src={source}
            poster={poster}
            muted
            loop
            playsInline
            preload="auto"
            autoPlay={!paused}
            aria-hidden="true"
            tabIndex={-1}
            hidden={failed}
          />
          <div className="night-shade" aria-hidden="true" />
        </div>
        <header className="night-nav">
          <a
            href="#top"
            className="night-wordmark"
            aria-label="SixteenMemory home"
          >
            <BrandLogo/>
          </a>
          <nav aria-label={language === "zh" ? "主导航" : "Main navigation"}>
            {primaryNavigation.map(item => item.path === "/docs" ? <DeveloperMenu key={item.path} language={language}/> : <a key={item.path} href={routeHref(item.path, language)}>{item[language]}</a>)}
          </nav>
          <div className="night-actions">
            <button
              className="night-language"
              onClick={onLanguage}
              aria-label={
                language === "zh" ? "Switch to English" : "切换至中文"
              }
            >
              {language === "zh" ? "EN" : "中"}
            </button>
            <a className="night-contact" href={quickstartUrl} target="_blank" rel="noreferrer">
              {c.quickstart}
              <ArrowUpRight size={14} />
            </a>
            <details className="mobile-navigation">
              <summary aria-label={language === "zh" ? "打开导航菜单" : "Open navigation menu"}>{language === "zh" ? "菜单" : "Menu"}</summary>
              <div onClick={(event) => {
                if ((event.target as Element).closest("a")) event.currentTarget.closest("details")?.removeAttribute("open");
              }} onKeyDown={(event) => {
                if (event.key === "Escape") {
                  const details = event.currentTarget.closest("details");
                  details?.removeAttribute("open");
                  details?.querySelector("summary")?.focus();
                }
              }}>
                {primaryNavigation.map(item => item.path === "/docs" ? <DeveloperMenu key={item.path} language={language} compact/> : <a key={item.path} href={routeHref(item.path, language)}>{item[language]}</a>)}
                <a href={routeHref("/security", language)}>{language === "zh" ? "安全" : "Security"}</a>
                <a href={routeHref("/deployment", language)}>{language === "zh" ? "部署" : "Deployment"}</a>
                <a href={routeHref("/usage", language)}>{language === "zh" ? "试用与用量" : "Access and usage"}</a>
                <a href={quickstartUrl} target="_blank" rel="noreferrer">{c.quickstart}</a>
                <a href={consoleUrl} target="_blank" rel="noreferrer">{c.console}</a>
              </div>
            </details>
          </div>
        </header>
        <div className="night-copy-perspective">
          <div className="night-copy">
            <p className="night-eyebrow">{c.eyebrow}</p>
            <h1 id="hero-title">
              {c.heroTitle.map((line: string) => (
                <span key={line}>{line}</span>
              ))}
            </h1>
            <p className="night-intro">{c.heroIntro}</p>
            <a className="hero-tools-link" href="#resources">{language === "zh" ? "浏览 API、SDK 与 MCP" : "Explore API, SDK & MCP"}<ArrowUpRight size={15}/></a>
          </div>
        </div>
        {(failed || blocked) && (
          <div className="night-play-fallback" role="status">
            <span>{failed ? c.fallback : ""}</span>
            <button
              onClick={
                failed ? retry : () => control.current?.playFromGesture()
              }
            >
              <Play size={14} />
              {failed ? c.retry : c.autoplay}
            </button>
          </div>
        )}
        <div
          className={`night-loader ${ready ? "is-ready" : ""}`}
          aria-hidden="true"
        >
          <div className="night-loader-orbit">
            <span />
            <span />
            <div className="night-loader-mark">
              {Array.from({ length: 6 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    rotate: `${i * 60}deg`,
                    transform: "translateY(-19px)"
                  }}
                />
              ))}
              <b>›</b>
            </div>
          </div>
          <p>{c.loading}</p>
        </div>
      </div>
    </section>
  );
}
