import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Download, Loader2, RefreshCw, Share2 } from "lucide-react";
import { toast } from "sonner";
import { CustomerShell, RiderShell } from "@/components/shells";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import {
  CATEGORIES,
  festivalQuotes,
  festivalState,
  type Quote,
  type QuoteCategory,
} from "@/lib/quotes-library";
import { nextQuotes } from "@/lib/quotes-generator";
import { bgFor, canvasBlob, renderPoster } from "@/lib/quote-poster";

export const Route = createFileRoute("/_authenticated/quotes")({
  head: () => ({
    meta: [
      { title: "Quotes Studio — Shahin Travels" },
      { name: "description", content: "Daily suvichar, shayari and festival wishes with your name and photo." },
      { property: "og:title", content: "Quotes Studio — Shahin Travels" },
      { property: "og:description", content: "Personalised daily quotes and festival posters." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuotesStudio,
});

function QuotesStudio() {
  const { user, role, profile } = useAuth();
  const [cat, setCat] = useState<QuoteCategory>("today");
  const [list, setList] = useState<Quote[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<{ q: Quote; i: number } | null>(null);

  useEffect(() => {
    if (profile?.full_name && !name) setName(profile.full_name);
  }, [profile?.full_name, name]);

  function load(reset: boolean) {
    if (cat === "festival") { setList(festivalQuotes()); return; }
    setList((prev) => {
      const base = reset ? [] : prev;
      const extra = nextQuotes(cat, 12, new Set(base.map((q) => q.id)));
      const fest = reset && cat === "today" ? festivalQuotes().slice(0, festivalState().active.length) : [];
      return [...fest, ...base, ...extra];
    });
  }

  useEffect(() => {
    load(true);
    window.scrollTo?.(0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  const body = (
    <div className="space-y-4 pb-24">
      <div className="rounded-2xl border border-border bg-card p-3">
        <label className="text-xs text-muted-foreground">पोस्टर पर नाम</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="आपका नाम" />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold ${
              cat === c.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => load(true)}>
          <RefreshCw className="mr-1 h-4 w-4" /> नए कोट्स
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {list.map((q, i) => (
          <button
            key={q.id}
            onClick={() => setSelected({ q, i })}
            className="relative aspect-[4/5] overflow-hidden rounded-xl border border-border text-left"
          >
            <img src={bgFor(q.cat, i)} alt="" loading="lazy" width={768} height={1024} className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-foreground/60 via-foreground/30 to-foreground/70" />
            <p className="relative line-clamp-6 whitespace-pre-line p-3 text-center text-[13px] font-bold leading-snug text-background">
              {q.text}
            </p>
            {q.by && <p className="absolute bottom-2 left-2 right-2 truncate text-center text-[11px] text-background/90">— {q.by}</p>}
          </button>
        ))}
      </div>
      {cat !== "festival" && list.length > 0 && (
        <Button variant="outline" className="w-full" onClick={() => load(false)}>
          और नए कोट्स देखें
        </Button>
      )}
      {selected && (
        <PosterSheet
          q={selected.q}
          bg={bgFor(selected.q.cat, selected.i)}
          name={name || profile?.full_name || "Shahin Travels"}
          photo={profile?.photo_url}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );

  if (role === "rider") return <RiderShell title="Quotes Studio">{body}</RiderShell>;
  return <CustomerShell title="Quotes Studio">{body}</CustomerShell>;
}

function PosterSheet({ q, bg, name, photo, onClose }: { q: Quote; bg: string; name: string; photo?: string | null | undefined; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    if (ref.current) renderPoster(ref.current, { text: q.text, by: q.by, bg, name, photo }).then(() => setReady(true));
  }, [q, bg, name, photo]);

  async function getFile() {
    let blob = ref.current ? await canvasBlob(ref.current) : null;
    if (!blob && ref.current) {
      // Photo blocked export — redraw without it.
      await renderPoster(ref.current, { text: q.text, by: q.by, bg, name, photo: null });
      blob = await canvasBlob(ref.current);
    }
    return blob ? new File([blob], `shahin-quote-${Date.now()}.jpg`, { type: "image/jpeg" }) : null;
  }

  async function download() {
    const f = await getFile();
    if (!f) { toast.error("पोस्टर नहीं बन पाया"); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    a.click();
    toast.success("पोस्टर डाउनलोड हो गया");
  }

  async function share() {
    const f = await getFile();
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (f && nav.canShare?.({ files: [f] })) {
      try {
        await nav.share({ files: [f], text: "Shahin Travels • https://shahintravels.app" });
        return;
      } catch {
        return;
      }
    }
    await download();
    window.open(`https://wa.me/?text=${encodeURIComponent(`${q.text}\n\n— ${name}\nShahin Travels: https://shahintravels.app`)}`, "_blank");
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 p-4" onClick={onClose}>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-3" onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          <canvas ref={ref} className="w-full rounded-xl shadow-lg" />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={share} disabled={!ready}>
            <Share2 className="mr-1 h-4 w-4" /> WhatsApp / शेयर
          </Button>
          <Button variant="outline" onClick={download} disabled={!ready}>
            <Download className="mr-1 h-4 w-4" /> डाउनलोड
          </Button>
        </div>
        <Button variant="ghost" onClick={onClose}>बंद करें</Button>
      </div>
    </div>
  );
}
