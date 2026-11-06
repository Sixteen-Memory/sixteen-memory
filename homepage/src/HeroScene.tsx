import { useEffect, useRef, useState } from "react";

interface Props {
  stage: number;
  paused: boolean;
  label: string;
}

/** GPT Image 2 art with CSS camera drift, NOT a Lux3D model or animation. */
export default function HeroScene({ stage, paused, label }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let inView = true;
    const update = () => setVisible(inView && !document.hidden);
    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        update();
      },
      { threshold: 0.01 }
    );
    observer.observe(root);
    document.addEventListener("visibilitychange", update);
    update();
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return (
    <div
      ref={rootRef}
      className="hero-scene"
      data-paused={paused || !visible}
      data-stage={stage}
      data-provider="gpt-image-2-css-motion"
    >
      <picture className="scene-art">
        <source
          media="(max-width: 640px)"
          srcSet="/assets/memory-field-mobile.webp"
        />
        <img
          src="/assets/memory-field.webp"
          width="1536"
          height="1024"
          alt={label}
          fetchPriority="high"
          decoding="async"
        />
      </picture>
    </div>
  );
}
