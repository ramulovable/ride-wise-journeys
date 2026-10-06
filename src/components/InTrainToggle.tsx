import { useEffect, useRef, useState } from "react";
import { Gauge, Loader2, TrainFront } from "lucide-react";

/**
 * "I'm in the train" switch. It only turns ON when the phone's GPS shows real
 * train-like movement (>= MIN_KMH sustained), so a user sitting at home cannot enable it.
 * Speed shown comes from the phone's GPS, never from guesses.
 */
const MIN_KMH = 20;
const CHECK_MS = 25_000;
const MAX_ACC_M = 100;

type Fix = { lat: number; lng: number; t: number; speed: number | null; acc: number };

function distM(a: Fix, b: Fix) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function InTrainToggle({ trainRunning }: { trainRunning: boolean }) {
  const [on, setOn] = useState(false);
  const [checking, setChecking] = useState(false);
  const [msg, setMsg] = useState("");
  const [speed, setSpeed] = useState<number | null>(null);
  const watch = useRef<number | null>(null);
  const fixes = useRef<Fix[]>([]);
  const lastMove = useRef(Date.now());

  const stop = () => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null; fixes.current = [];
  };
  useEffect(() => stop, []);

  const kmhNow = (): number | null => {
    const f = fixes.current;
    const last = f[f.length - 1];
    if (!last) return null;
    if (last.speed != null && last.speed >= 0) return last.speed * 3.6;
    const old = f.find((x) => last.t - x.t >= 5000);
    if (!old) return null;
    return (distM(old, last) / ((last.t - old.t) / 1000)) * 3.6;
  };

  const startWatch = (onFix: () => void) => {
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        if (p.coords.accuracy > MAX_ACC_M) return;
        fixes.current.push({ lat: p.coords.latitude, lng: p.coords.longitude, t: p.timestamp, speed: p.coords.speed, acc: p.coords.accuracy });
        fixes.current = fixes.current.filter((x) => p.timestamp - x.t < 60_000);
        onFix();
      },
      () => { setMsg("Location permission chahiye. Phone ki GPS ON karke dobara koshish kijiye."); setChecking(false); setOn(false); stop(); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  };

  const turnOn = () => {
    if (!("geolocation" in navigator)) { setMsg("Is phone me GPS available nahi hai."); return; }
    setMsg(""); setChecking(true);
    const begin = Date.now();
    const samples: number[] = [];
    startWatch(() => {
      const k = kmhNow();
      if (k != null) samples.push(k);
      if (Date.now() - begin < CHECK_MS) return;
      const moving = samples.filter((s) => s >= MIN_KMH).length;
      if (samples.length >= 3 && moving / samples.length >= 0.6) {
        setChecking(false); setOn(true); lastMove.current = Date.now();
        stop();
        startWatch(() => {
          const s = kmhNow();
          setSpeed(s);
          if (s != null && s >= 5) lastMove.current = Date.now();
          // phone still for 5 min while railway says train is running → user is not on board
          if (trainRunning && Date.now() - lastMove.current > 5 * 60_000) {
            setOn(false); setSpeed(null); stop();
            setMsg("Aapka phone train ke saath move nahi kar raha, isliye 'I'm in train' band ho gaya.");
          }
        });
      } else {
        setChecking(false); stop();
        setMsg("Aap train me nahi lag rahe. Ye button sirf chalti train me safar karte waqt ON hota hai.");
      }
    });
  };

  const toggle = () => {
    if (checking) return;
    if (on) { setOn(false); setSpeed(null); stop(); setMsg(""); return; }
    turnOn();
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><TrainFront className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-extrabold text-foreground">I'm in the train</p>
          <p className="text-[11px] text-muted-foreground">
            {checking ? "GPS se check ho raha hai (25 sec)…" : on ? "Aapke phone ki GPS se real speed" : "Train me hon tabhi ON hoga"}
          </p>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-label="I'm in the train" onClick={toggle}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${on ? "bg-primary" : "bg-muted"}`}>
          {checking ? <Loader2 className="absolute left-3.5 top-1 size-5 animate-spin text-primary" /> : (
            <span className={`absolute top-1 size-5 rounded-full bg-background shadow transition-all ${on ? "left-6" : "left-1"}`} />
          )}
        </button>
      </div>
      {on ? (
        <div className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-primary/10 py-3">
          <Gauge className="size-6 text-primary" />
          <span className="text-3xl font-extrabold text-primary">{speed != null ? Math.round(speed) : "--"}</span>
          <span className="text-sm font-bold text-muted-foreground">km/h live</span>
        </div>
      ) : null}
      {msg ? <p className="mt-2 text-[12px] font-semibold text-destructive">{msg}</p> : null}
    </div>
  );
}
