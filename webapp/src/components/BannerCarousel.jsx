import { useEffect, useRef, useState } from "react";

/**
 * Carrousel de bannières : glissement au doigt + défilement automatique (réglable dans l'admin).
 * Le défilement se met en pause quand on touche le carrousel ou que l'onglet est caché.
 */
export default function BannerCarousel({ banners, autoplay = true, interval = 4, label = "Promotions" }) {
  const trackRef = useRef(null);
  const [index, setIndex] = useState(0);
  const paused = useRef(false);
  const resumeTimer = useRef(null);

  const goTo = (i) => {
    const el = trackRef.current;
    if (!el || !banners.length) return;
    const n = (i + banners.length) % banners.length;
    const slide = el.children[n];
    if (slide) el.scrollTo({ left: slide.offsetLeft - el.offsetLeft - 16, behavior: "smooth" });
  };

  useEffect(() => {
    if (!autoplay || banners.length < 2) return undefined;
    const ms = Math.max(2, Number(interval) || 4) * 1000;
    const timer = setInterval(() => {
      if (!paused.current && !document.hidden) goTo(index + 1);
    }, ms);
    return () => clearInterval(timer);
  }, [autoplay, interval, banners.length, index]); // eslint-disable-line react-hooks/exhaustive-deps

  const pause = () => {
    paused.current = true;
    clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => { paused.current = false; }, 6000);
  };

  const onScroll = (e) => {
    const el = e.currentTarget;
    const w = el.children[0]?.offsetWidth || el.clientWidth;
    setIndex(Math.round(el.scrollLeft / (w + 10)));
  };

  if (!banners.length) return null;
  return (
    <div className="banners-wrap" aria-label={label} aria-roledescription="carrousel">
      <div className="banners" ref={trackRef} onScroll={onScroll} onTouchStart={pause} onMouseEnter={pause} onWheel={pause}>
        {banners.map((b) => (
          <button
            key={b.id}
            onClick={() => { if (b.link) window.open(b.link, "_blank", "noopener,noreferrer"); }}
            style={{ cursor: b.link ? "pointer" : "default" }}
            aria-label={b.title || "Bannière"}
          >
            <img src={b.image} alt={b.title || "Bannière"} loading="lazy" />
          </button>
        ))}
      </div>
      {banners.length > 1 && (
        <div className="banner-dots" role="tablist">
          {banners.map((b, i) => (
            <button key={b.id} className={i === index ? "is-active" : ""} onClick={() => { pause(); goTo(i); }} aria-label={`Bannière ${i + 1}`} aria-selected={i === index} />
          ))}
        </div>
      )}
    </div>
  );
}
