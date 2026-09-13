import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useBanners, type PromotionalBanner } from "@/lib/banners";

const SLIDE_MS = 3500;

const THEMES = [
  "from-primary/90 to-primary",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-sky-500 to-indigo-600",
];

export function PromoCarousel() {
  const banners = useBanners(true);
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchStart = useRef<number | null>(null);
  const items = banners.data ?? [];
  const count = items.length;

  useEffect(() => {
    if (paused || count < 2) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % count), SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [paused, count]);

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [index, count]);

  if (count === 0) return null;

  function open(banner: PromotionalBanner) {
    const url = banner.actionUrl;
    if (!url) return;
    if (/^https?:\/\//i.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    void navigate({ to: url });
  }

  return (
    <section
      className="select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        setPaused(true);
        touchStart.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        setPaused(false);
        const start = touchStart.current;
        const end = e.changedTouches[0]?.clientX ?? null;
        touchStart.current = null;
        if (start == null || end == null) return;
        const delta = end - start;
        if (Math.abs(delta) < 40) return;
        setIndex((i) => (delta < 0 ? (i + 1) % count : (i - 1 + count) % count));
      }}
      aria-roledescription="carousel"
      aria-label="Promotions"
    >
      <div className="overflow-hidden rounded-2xl">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {items.map((banner, i) => (
            <button
              key={banner.id}
              type="button"
              onClick={() => open(banner)}
              className={`relative min-w-full overflow-hidden bg-gradient-to-br p-4 text-left text-primary-foreground ${
                THEMES[i % THEMES.length]
              }`}
              style={
                banner.imageUrl
                  ? {
                      backgroundImage: `linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)), url(${banner.imageUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : undefined
              }
            >
              {banner.badgeText ? (
                <span className="inline-block rounded-full bg-background/25 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  {banner.badgeText}
                </span>
              ) : null}
              <p className="mt-1.5 text-base font-bold leading-tight">{banner.title}</p>
              <p className="mt-1 text-xs opacity-90">{banner.subtitle}</p>
            </button>
          ))}
        </div>
      </div>

      {count > 1 ? (
        <div className="mt-2 flex justify-center gap-1.5">
          {items.map((banner, i) => (
            <button
              key={banner.id}
              type="button"
              aria-label={`Show promotion ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/40"
              }`}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
