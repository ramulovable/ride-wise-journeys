import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useBanners, type PromotionalBanner } from "@/lib/banners";

const SLIDE_MS = 4000;

type AdBannerProps = {
  /** Shown when the admin has not uploaded any active banner yet. */
  fallbackTitle?: string;
  fallbackSubtitle?: string;
  className?: string;
};

/**
 * Large landscape advertising banner (16:9) shown on the customer and driver
 * home screens. Pictures come from Admin > Promotional Banners.
 */
export function AdBanner({
  fallbackTitle = "Shahin Travels",
  fallbackSubtitle = "#gowithShahintravels · 🇮🇳 Made for India · ❤️ Pride of Darbhanga",
  className = "",
}: AdBannerProps) {
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

  function open(banner: PromotionalBanner) {
    const url = banner.actionUrl;
    if (!url) return;
    if (/^https?:\/\//i.test(url)) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    void navigate({ to: url });
  }

  if (count === 0) {
    return (
      <section
        className={`flex aspect-[16/9] w-full flex-col items-center justify-center gap-1 rounded-2xl bg-gradient-to-br from-primary to-accent px-5 text-center text-primary-foreground shadow-md ${className}`}
      >
        <p className="text-2xl font-black leading-tight">{fallbackTitle}</p>
        <p className="text-sm font-medium opacity-90">{fallbackSubtitle}</p>
      </section>
    );
  }

  return (
    <section
      className={`select-none ${className}`}
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
      aria-label="Offers and announcements"
    >
      <div className="overflow-hidden rounded-2xl shadow-md">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {items.map((banner) => (
            <button
              key={banner.id}
              type="button"
              onClick={() => open(banner)}
              className="relative flex aspect-[16/9] min-w-full flex-col justify-end overflow-hidden bg-gradient-to-br from-primary to-accent p-4 text-left text-primary-foreground"
              style={
                banner.imageUrl
                  ? {
                      backgroundImage: `linear-gradient(rgba(0,0,0,0) 45%, rgba(0,0,0,.6)), url(${banner.imageUrl})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                    }
                  : undefined
              }
            >
              {banner.badgeText ? (
                <span className="inline-block w-fit rounded-full bg-background/25 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                  {banner.badgeText}
                </span>
              ) : null}
              <p className="mt-1.5 text-lg font-bold leading-tight">{banner.title}</p>
              <p className="mt-1 text-sm opacity-90">{banner.subtitle}</p>
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
              aria-label={`Show banner ${i + 1}`}
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
