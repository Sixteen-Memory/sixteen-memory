type Options = {
  paused: boolean;
  onReady: () => void;
  onError: () => void;
  onBlocked: (blocked: boolean) => void;
};

/** Native looping cover video. Page scrolling only moves to the next section. */
export function createVideoHero(track: HTMLElement, options: Options) {
  const video = track.querySelector<HTMLVideoElement>("video")!;
  const scene = track.querySelector<HTMLElement>(".night-scene")!;
  const mq = matchMedia("(prefers-reduced-motion: reduce)");
  let reduced = mq.matches;
  let paused = options.paused;
  let destroyed = false;
  let failed = false;
  let inView = true;
  let playPending = false;
  let ready = false;
  let readyTimer = 0;

  video.muted = true;
  video.defaultMuted = true;
  video.defaultPlaybackRate = 0.7;
  video.playbackRate = 0.7;
  video.loop = true;
  track.dataset.mode = "ambient";
  track.dataset.transport = "native-stream";

  function showReady() {
    if (ready || destroyed) return;
    ready = true;
    track.dataset.loaded = "true";
    readyTimer = window.setTimeout(() => {
      if (!destroyed) options.onReady();
    }, reduced ? 0 : 350);
  }
  const loaderTimeout = window.setTimeout(() => {
    if (!destroyed) options.onReady();
  }, 3500);
  function play() {
    if (
      destroyed || failed || !video.currentSrc || paused || reduced ||
      !inView || document.hidden || playPending || !video.paused
    ) return;
    playPending = true;
    video.play()
      .then(() => {
        if (!destroyed) options.onBlocked(false);
      })
      .catch((error: DOMException) => {
        if (!destroyed && error.name !== "AbortError") options.onBlocked(true);
      })
      .finally(() => { playPending = false; });
  }
  function sync() {
    if (paused || reduced || document.hidden || !inView) video.pause();
    else play();
    track.dataset.motionState = paused ? "paused" : reduced ? "reduced" : "playing";
  }
  function loaded() {
    video.playbackRate = 0.7;
    track.dataset.buffering = "false";
    showReady();
    sync();
  }
  function waiting() {
    track.dataset.buffering = "true";
  }
  function error() {
    if (destroyed) return;
    failed = true;
    track.dataset.buffering = "false";
    track.dataset.videoFailed = "true";
    options.onError();
  }
  function loadClip(retry = false) {
    track.dataset.buffering = "true";
    if (video.getAttribute("src") !== video.dataset.src) video.src = video.dataset.src!;
    if (retry || video.networkState === 0) video.load();
    if (video.readyState >= 2) loaded();
  }
  function onReducedChange() {
    reduced = mq.matches;
    sync();
  }
  const observer = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    sync();
  }, { threshold: 0.01 });

  observer.observe(scene);
  video.addEventListener("loadeddata", loaded);
  video.addEventListener("canplay", loaded);
  video.addEventListener("playing", loaded);
  video.addEventListener("waiting", waiting);
  video.addEventListener("error", error);
  document.addEventListener("visibilitychange", sync);
  mq.addEventListener("change", onReducedChange);
  loadClip();
  sync();

  return {
    setPaused(next: boolean) {
      paused = next;
      sync();
    },
    playFromGesture() {
      options.onBlocked(false);
      video.play()
        .then(() => options.onBlocked(false))
        .catch(() => options.onBlocked(true));
    },
    retry() {
      failed = false;
      track.dataset.videoFailed = "false";
      loadClip(true);
    },
    destroy() {
      destroyed = true;
      clearTimeout(loaderTimeout);
      clearTimeout(readyTimer);
      video.pause();
      video.removeAttribute("src");
      video.load();
      observer.disconnect();
      video.removeEventListener("loadeddata", loaded);
      video.removeEventListener("canplay", loaded);
      video.removeEventListener("playing", loaded);
      video.removeEventListener("waiting", waiting);
      video.removeEventListener("error", error);
      document.removeEventListener("visibilitychange", sync);
      mq.removeEventListener("change", onReducedChange);
    }
  };
}
