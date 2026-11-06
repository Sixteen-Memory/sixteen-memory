/** Native Web Animations: visible entrances + scroll-linked editorial choreography.
 * No third-party animation runtime. Not a Lux3D or WebGL animation.
 */
export function createEditorialMotion(
  root: HTMLElement,
  initiallyPaused: boolean
) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const animations: Animation[] = [];
  let paused = initiallyPaused;
  let destroyed = false;
  let frame = 0;

  const portrait = root.querySelector<HTMLElement>(".portrait-image");
  const portraitSettle = root.querySelector<HTMLElement>(".portrait-settle");

  const ease = "cubic-bezier(.16,1,.3,1)";
  function animate(
    el: Element | null,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
    base = 0
  ) {
    if (!el || reduced || destroyed) return;
    const animation = el.animate(keyframes, {
      fill: "both",
      easing: ease,
      ...options,
      delay: (Number(options.delay) || 0) + base
    });
    animations.push(animation);
    if (paused || document.hidden) animation.pause();
  }
  function entranceLetters(scope: Element, heroText = false, base = 0) {
    scope.querySelectorAll<HTMLElement>(".letter").forEach((letter) =>
      animate(
        letter,
        [
          {
            transform: `translateY(${heroText ? ".35em" : ".72em"}) rotate(${heroText ? 0 : 4}deg)`,
            opacity: 0,
            filter: `blur(${heroText ? 10 : 3}px)`
          },
          {
            transform: "translateY(0) rotate(0)",
            opacity: 1,
            filter: "blur(0px)"
          }
        ],
        {
          duration: heroText ? 1300 : 950,
          delay: Number(letter.dataset.delay)
        },
        base
      )
    );
  }
  function reveal(section: Element, base = 0) {
    if (section.hasAttribute("data-revealed")) return;
    section.setAttribute("data-revealed", "true");
    entranceLetters(section, false, base);
    section.querySelectorAll<HTMLElement>(".rise-item").forEach((el, i) =>
      animate(
        el,
        [
          { opacity: 0, transform: "translateY(22px)" },
          { opacity: 1, transform: "translateY(0)" }
        ],
        { duration: 850, delay: 120 + i * 95 },
        base
      )
    );
    section.querySelectorAll(".photo-pill").forEach((el, i) => {
      animate(
        el,
        [
          { opacity: 0, transform: "scale(0)" },
          { opacity: 1, transform: "scale(1.1)", offset: 0.68 },
          { opacity: 1, transform: "scale(1)" }
        ],
        { duration: 950, delay: 260 + i * 350 },
        base
      );
      animate(
        el.querySelector("img"),
        [{ transform: "scale(1.5)" }, { transform: "scale(1)" }],
        { duration: 1700, delay: 260 + i * 350 },
        base
      );
    });
    animate(
      section.querySelector(".emblem-wrap"),
      [
        { opacity: 0, transform: "rotate(-90deg) scale(.6)" },
        { opacity: 1, transform: "rotate(0) scale(1)" }
      ],
      { duration: 1300, delay: 700 },
      base
    );
    animate(
      section.querySelector(".portrait-clip"),
      [{ clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0% 0 0 0)" }],
      { duration: 1200, delay: 160 },
      base
    );
    animate(
      section.querySelector(".portrait-settle"),
      [{ transform: "scale(1.25)" }, { transform: "scale(1)" }],
      { duration: 1500, delay: 160 },
      base
    );
    section.querySelectorAll(".capability-row").forEach((el, i) =>
      animate(
        el,
        [
          { opacity: 0, transform: "translateY(18px)" },
          { opacity: 1, transform: "translateY(0)" }
        ],
        { duration: 700, delay: 450 + i * 110 },
        base
      )
    );
  }
  const sections = [...root.querySelectorAll<HTMLElement>(".reveal-section")];
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) reveal(e.target);
      });
    },
    { threshold: [0, 0.1, 0.2, 0.25, 0.35, 0.5] }
  );
  if (!reduced) root.classList.add("motion-ready");
  sections.forEach((s) => observer.observe(s));
  if (reduced) sections.forEach((s) => s.setAttribute("data-revealed", "true"));
  function update() {
    frame = 0;
    if (destroyed) return;
    const y = window.scrollY;
    if (portrait && !paused && !reduced) {
      const facts = root.querySelector<HTMLElement>(".facts");
      if (!facts) return;
      const view =
        (y + innerHeight - facts.offsetTop) /
        (innerHeight + facts.offsetHeight);
      portrait.style.transform = `translateY(${(Math.max(0, Math.min(1, view)) - 0.5) * 14}%) scale(1.16)`;
    }
  }
  function request() {
    if (!frame) frame = requestAnimationFrame(update);
  }
  function sync() {
    const stop = paused || document.hidden;
    animations.forEach((a) => {
      if (stop && a.playState === "running") a.pause();
      else if (!stop && a.playState === "paused") a.play();
    });
    root.dataset.motionState = reduced
      ? "reduced"
      : paused
        ? "paused"
        : "playing";
    request();
  }
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request);
  document.addEventListener("visibilitychange", sync);
  sync();
  update();
  return {
    setPaused(next: boolean) {
      paused = next;
      sync();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      animations.forEach((a) => a.cancel());
      sections.forEach((section) => section.removeAttribute("data-revealed"));
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", request);
      document.removeEventListener("visibilitychange", sync);

      if (portrait) portrait.style.transform = "";
      if (portraitSettle) portraitSettle.style.transform = "";

      root.classList.remove("motion-ready");
    }
  };
}
