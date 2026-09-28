import { useEffect, useRef, useState } from "react";
import { ExternalLink, Hotel, Plane, TrainFront, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

const AFFILIATE = "Allianceid=10768164&SID=332381932&locale=en-IN&curr=INR";

const SERVICES = [
  {
    id: "flights",
    title: "Flight Tickets",
    subtitle: "हवाई टिकट • देश-विदेश",
    url: `https://www.trip.com/flights?${AFFILIATE}&trip_sub1=&trip_sub3=D19998477`,
    Icon: Plane,
    soon: false,
  },
  {
    id: "hotels",
    title: "Hotel Booking",
    subtitle: "होटल बुकिंग • पूरे भारत में",
    url: `https://www.trip.com/hotels?${AFFILIATE}&trip_sub1=&trip_sub3=D19998519`,
    Icon: Hotel,
    soon: false,
  },
  {
    id: "trains",
    title: "Train Tickets",
    subtitle: "ट्रेन टिकट • Indian Railways",
    url: "",
    Icon: TrainFront,
    soon: true,
  },
] as const;

export function TravelDesk() {
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const [openTitle, setOpenTitle] = useState("");

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between px-4 pt-3.5">
        <div>
          <h2 className="text-sm font-bold text-foreground">Shahin Travel Desk</h2>
          <p className="text-[11px] text-muted-foreground">
            Flight, Hotel aur Train — ek hi jagah
          </p>
        </div>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
          Official Partner
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 p-3">
        {SERVICES.map(({ id, title, subtitle, url, Icon, soon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (soon) {
                toast.info("Train booking jald shuru hoga — Coming Soon!");
                return;
              }
              setOpenTitle(title);
              setOpenUrl(url);
            }}
            className="relative flex min-h-28 flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-2 py-3 text-center transition active:scale-[0.98]"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-primary/10">
              <Icon className="size-5 text-primary" />
            </span>
            <span className="text-[12px] font-semibold leading-tight text-foreground">{title}</span>
            <span className="line-clamp-2 text-[10px] leading-tight text-muted-foreground">
              {subtitle}
            </span>
            {soon ? (
              <span className="mt-1 rounded-md border-2 border-destructive bg-destructive px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-destructive-foreground shadow-md">
                Coming Soon
              </span>
            ) : null}
          </button>
        ))}
      </div>

      {openUrl ? (
        <TravelFrame title={openTitle} url={openUrl} onClose={() => setOpenUrl(null)} />
      ) : null}
    </section>
  );
}

function TravelFrame({
  title,
  url,
  onClose,
}: {
  title: string;
  url: string;
  onClose: () => void;
}) {
  const [blocked, setBlocked] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      if (!loaded.current) setBlocked(true);
    }, 6000);
    return () => {
      document.body.style.overflow = original;
      window.clearTimeout(timer);
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center gap-2 border-b border-border bg-card px-3 py-2.5">
        <Button
          variant="ghost"
          size="icon"
          className="min-h-10 min-w-10 rounded-full"
          onClick={onClose}
          aria-label="Close"
        >
          <X className="size-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            Shahin Travels Travel Desk • Secure booking
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="min-h-10 min-w-10 rounded-full text-primary"
          onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
          aria-label="Open in browser"
        >
          <ExternalLink className="size-5" />
        </Button>
      </header>

      <div className="relative flex-1">
        <iframe
          src={url}
          title={title}
          onLoad={() => {
            loaded.current = true;
          }}
          className="h-full w-full border-0"
          allow="geolocation; payment"
        />
        {blocked ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background px-6 text-center">
            <p className="text-sm font-semibold text-foreground">
              Booking page यहाँ नहीं खुल पा रहा
            </p>
            <p className="text-xs text-muted-foreground">
              Search aur payment ke liye page ko naye tab me kholiye. Booking Shahin Travels ke
              partner ke through hi hogi.
            </p>
            <Button onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
              {title} खोलें
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
