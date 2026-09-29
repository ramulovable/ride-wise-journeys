import { useEffect, useState } from "react";
import { BadgeCheck, Hotel, Loader2, Plane, ShieldCheck, TrainFront, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { TrainHub } from "@/components/TrainHub";

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

function isNativeApp() {
  if (typeof window === "undefined") return false;
  const cap = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean; platform?: string };
  }).Capacitor;
  if (!cap) return false;
  if (typeof cap.isNativePlatform === "function") return cap.isNativePlatform();
  return cap.platform === "android" || cap.platform === "ios";
}

async function openInAppBrowser(url: string) {
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({
    url,
    presentationStyle: "fullscreen",
    toolbarColor: "#17804A",
  });
}

export function TravelDesk() {
  const [active, setActive] = useState<{ title: string; url: string } | null>(null);
  const [trainOpen, setTrainOpen] = useState(false);

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
              if (id === "trains") {
                setTrainOpen(true);
                return;
              }
              if (soon) {
                toast.info("Jald shuru hoga — Coming Soon!");
                return;
              }
              if (isNativeApp()) {
                // Native app: open inside Shahin Travels (Chrome Custom Tab), no external browser.
                void openInAppBrowser(url).catch(() => {
                  window.open(url, "_blank", "noopener,noreferrer");
                });
                return;
              }
              // Web: open synchronously inside the click so mobile browsers don't block it.
              window.open(url, "_blank", "noopener,noreferrer");
              setActive({ title, url });
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

      {active ? (
        <RedirectCard
          title={active.title}
          url={active.url}
          onClose={() => setActive(null)}
        />
      ) : null}
    </section>
  );
}

function RedirectCard({
  title,
  url,
  onClose,
}: {
  title: string;
  url: string;
  onClose: () => void;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), 1600);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-bold text-foreground">Shahin Travels Booking Partner</p>
            <p className="text-[11px] text-muted-foreground">{title} • Live ₹ INR rates</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="-mr-2 -mt-2 min-h-9 min-w-9 rounded-full"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-4" />
          </Button>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-xl bg-primary/5 p-3">
          {ready ? (
            <BadgeCheck className="size-5 shrink-0 text-primary" />
          ) : (
            <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
          )}
          <p className="text-xs leading-snug text-foreground">
            {ready
              ? "Booking page naye tab me khul gaya hai. Wahin se search aur payment poora kijiye."
              : "Aapko Shahin Travels ke secure booking partner par le jaaya ja raha hai…"}
          </p>
        </div>

        <ul className="mt-3 space-y-1.5">
          <li className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" /> Secure payment aur instant confirmation
          </li>
          <li className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <BadgeCheck className="size-3.5 text-primary" /> Shahin Travels partner rates — ₹ INR me
          </li>
        </ul>

        <Button
          className="mt-4 w-full"
          onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
        >
          {title} खोलें
        </Button>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Tab apne aap na khule to upar wala button dabaiye
        </p>
      </div>
    </div>
  );
}
