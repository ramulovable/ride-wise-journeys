import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Clock,
  Flag,
  Gauge,
  MapPin,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  TrainFront,
  WifiOff,
  AlertTriangle,
  Volume2,
  VolumeX,
} from "lucide-react";
import sceneBg from "@/assets/lj-bg2.jpg";
import sceneGrass from "@/assets/lj-grass2.webp";
import scenePlatform from "@/assets/lj-platform.jpg";
import sceneTrain from "@/assets/lj-train.webp";
import type { LiveStatus, LiveStop } from "@/lib/indianrail.functions";
import { useLiveTrainSettings, type LiveTrainSettings } from "@/lib/live-train-settings";

type Res<T> = { success: boolean; data?: T | null; error?: string };

/* ------------------------------------------------------------------ */
/* trainAnimationEngine — position derived only from API data          */
/* ------------------------------------------------------------------ */

function istNowMin(): number {
  const d = new Date(Date.now() + 5.5 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
}
function toMin(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

type UiState =
  | "RUNNING" | "AT_STATION" | "NOT_STARTED" | "COMPLETED" | "CANCELLED" | "UNAVAILABLE";

/** Configurable mapping: provider message keywords → UI status. */
const STATUS_RULES: Array<[RegExp, UiState]> = [
  [/cancel/i, "CANCELLED"],
  [/terminat|reached destination|journey completed|arrived at destination/i, "COMPLETED"],
  [/not (yet )?started|yet to start/i, "NOT_STARTED"],
  [/arrived|at station|halt/i, "AT_STATION"],
  [/departed|running|crossed|left/i, "RUNNING"],
];
const STATUS_LABEL: Record<UiState, string> = {
  RUNNING: "Running", AT_STATION: "At Station", NOT_STARTED: "Not Started",
  COMPLETED: "Completed", CANCELLED: "Cancelled", UNAVAILABLE: "Data Unavailable",
};

type Engine = {
  state: UiState;
  prev: LiveStop | undefined;
  cur: LiveStop | undefined;
  next: LiveStop | undefined;
  dest: LiveStop | undefined;
  /** 0..1 overall route position */
  routePos: number;
  /** 0..1 within current segment (only when estimated from timestamps) */
  segFrac: number | null;
  moving: boolean;
};

function computeEngine(d: LiveStatus): Engine {
  const stops = d.stops;
  const ci = stops.findIndex((s) => s.state === "current");
  const cur = ci >= 0 ? stops[ci] : undefined;
  const prev = ci > 0 ? stops[ci - 1] : undefined;
  const next = d.nextCode ? stops.find((s) => s.code === d.nextCode) : undefined;
  const dest = stops[stops.length - 1];

  let state: UiState = "UNAVAILABLE";
  for (const [re, st] of STATUS_RULES) if (re.test(d.message)) { state = st; break; }
  if (d.terminated) state = "COMPLETED";
  if (state === "UNAVAILABLE" && cur) {
    state = cur.actualDep || ci === 0 ? (next ? "RUNNING" : "AT_STATION") : cur.actualArr ? "AT_STATION" : "RUNNING";
  }

  const total = d.totalKm || dest?.distanceKm || 0;
  let pos = total > 0 ? d.coveredKm / total : d.progressPct / 100;
  let segFrac: number | null = null;
  if (state === "RUNNING" && cur && next && total > 0) {
    const dep = toMin(cur.actualDep || cur.schedDep);
    const arr = toMin(next.actualArr || next.schedArr);
    if (dep !== null && arr !== null) {
      let span = arr - dep;
      if (span <= 0) span += 1440;
      let el = istNowMin() - dep;
      if (el < -60) el += 1440;
      if (span > 0 && span < 1440) {
        segFrac = Math.max(0, Math.min(0.97, el / span));
        pos = (cur.distanceKm + segFrac * (next.distanceKm - cur.distanceKm)) / total;
      }
    }
  }
  if (state === "COMPLETED") pos = 1;
  return {
    state, prev, cur, next, dest,
    routePos: Math.max(0, Math.min(1, pos || 0)),
    segFrac,
    moving: state === "RUNNING",
  };
}

/** Parse provider "updated X min ago"-style text to minutes; null if unknown. */
function parseAgeMin(s: string): number | null {
  if (!s) return null;
  const h = /(\d+)\s*(h|hr|hour)/i.exec(s);
  const m = /(\d+)\s*(m|min)/i.exec(s);
  if (h || m) return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  if (/just now|few sec/i.test(s)) return 0;
  return null;
}

function delayLabel(min: number) {
  if (min === 0) return "On Time";
  if (min < 0) return `${Math.abs(min)} min early`;
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m late` : `${min} min late`;
}
function fmtStamp(ts: number) {
  return new Date(ts).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    hour12: false, timeZone: "Asia/Kolkata",
  });
}
function etaCountdown(t: string): string {
  const a = toMin(t);
  if (a === null) return "";
  let diff = a - istNowMin();
  if (diff < -60) diff += 1440;
  if (diff <= 0) return "";
  diff = Math.round(diff);
  return diff >= 60 ? `~${Math.floor(diff / 60)}h ${diff % 60}m` : `~${diff} min`;
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

type Phase = "day" | "sunset" | "night";
function phaseNow(): Phase {
  const h = new Date(Date.now() + 5.5 * 3600_000).getUTCHours();
  if (h >= 19 || h < 5) return "night";
  if (h >= 17 || h < 7) return "sunset";
  return "day";
}

const SKY: Record<Phase, [string, string, string]> = {
  day: ["#7cc4ef", "#cfe9f7", "#eef7e4"],
  sunset: ["#3b3a6e", "#f08a5d", "#fbd38d"],
  night: ["#060b1f", "#14204a", "#25305a"],
};

/** Synthesised train audio (wheel rumble, rail-joint clacks tied to speed, horn on departure). Starts only after a tap. */
function useTrainSound(on: boolean, moving: boolean, speed: number, atStation: boolean) {
  const ref = useRef<{ ctx: AudioContext; gain: GainNode; amb: GainNode; horn: () => void } | null>(null);
  const live = useRef({ moving, speed });
  live.current = { moving, speed };
  useEffect(() => {
    if (!on) return;
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new AC();
    const master = ctx.createGain(); master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor(); master.connect(comp).connect(ctx.destination);
    const gain = ctx.createGain(); gain.gain.value = 0; gain.connect(master);
    const amb = ctx.createGain(); amb.gain.value = 0; amb.connect(master);
    const noise = (sec: number, brown: boolean) => {
      const b = ctx.createBuffer(2, ctx.sampleRate * sec, ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let l = 0;
        for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; l = brown ? (l + 0.02 * w) / 1.02 : w; d[i] = brown ? l * 3.5 : w * 0.3; } }
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; return s;
    };
    const rum = noise(3, true); const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 320;
    rum.connect(lp).connect(gain); rum.start();
    const hiss = noise(3, false); const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2200; bp.Q.value = 0.6;
    const hg = ctx.createGain(); hg.gain.value = 0.25; hiss.connect(bp).connect(hg).connect(gain); hiss.start();
    const crowd = noise(3, false); const cf = ctx.createBiquadFilter(); cf.type = "bandpass"; cf.frequency.value = 700; cf.Q.value = 0.4;
    crowd.connect(cf).connect(amb); crowd.start();
    const clack = (t: number, pan: number) => {
      const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(gain);
      [0, 0.11].forEach((o) => {
        const s = noise(0.1, false); const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 900; f.Q.value = 3;
        const g = ctx.createGain(); g.gain.setValueAtTime(1.4, t + o); g.gain.exponentialRampToValueAtTime(0.001, t + o + 0.07);
        s.connect(f).connect(g).connect(p); s.start(t + o); s.stop(t + o + 0.08);
        const osc = ctx.createOscillator(); const og = ctx.createGain(); osc.frequency.value = 85;
        og.gain.setValueAtTime(0.5, t + o); og.gain.exponentialRampToValueAtTime(0.001, t + o + 0.1);
        osc.connect(og).connect(p); osc.start(t + o); osc.stop(t + o + 0.12);
      });
    };
    let next = ctx.currentTime + 0.3; let side = -0.6;
    const sched = window.setInterval(() => {
      const { moving: m, speed: v } = live.current;
      if (!m) { next = ctx.currentTime + 0.3; return; }
      const gap = Math.max(0.35, 13 / ((v || 55) / 3.6)); // 13m rail lengths
      while (next < ctx.currentTime + 0.25) { clack(next, side); side = -side; next += gap; }
    }, 100);
    const horn = () => {
      const t = ctx.currentTime; const hg2 = ctx.createGain(); hg2.connect(master);
      hg2.gain.setValueAtTime(0, t); hg2.gain.linearRampToValueAtTime(0.18, t + 0.08); hg2.gain.setValueAtTime(0.18, t + 1.1); hg2.gain.linearRampToValueAtTime(0, t + 1.4);
      [311, 370, 466].forEach((f) => { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.connect(hg2); o.start(t); o.stop(t + 1.5); });
    };
    ref.current = { ctx, gain, amb, horn };
    void ctx.resume();
    return () => { clearInterval(sched); void ctx.close(); ref.current = null; };
  }, [on]);
  const wasMoving = useRef(moving);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const t = c.ctx.currentTime;
    c.gain.gain.cancelScheduledValues(t); c.gain.gain.linearRampToValueAtTime(moving ? 0.55 : 0, t + (moving ? 3 : 4));
    c.amb.gain.linearRampToValueAtTime(atStation ? 0.08 : 0, t + 2);
    if (moving && !wasMoving.current) c.horn();
    wasMoving.current = moving;
  }, [moving, atStation, on]);
}

const BASE_PX_PER_KMH = 7; // foreground (track) pixels per second per km/h

const RailScene = memo(function RailScene({
  phase, moving, animate, label, atStation, stationName, platform, speed, updated, live, sound, onSound,
}: {
  phase: Phase; moving: boolean; animate: boolean; quality: number; label: string;
  atStation: boolean; stationName: string; platform: string; speed: number; updated: string; live: boolean;
  sound: boolean; onSound: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const poleRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const grassRef = useRef<HTMLDivElement>(null);
  const trainRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const run = moving && !atStation;
  const target = run ? (speed > 0 ? speed : 55) : 0;
  useTrainSound(sound, run, target, atStation);

  // physics loop: velocity eases toward target (smooth departure/braking), layers scroll by parallax depth
  const tgt = useRef(target); tgt.current = animate ? target : 0;
  useEffect(() => {
    if (!visible) return;
    let raf = 0, last = performance.now(), v = 0, x = 0, t = 0;
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now; t += dt;
      v += (tgt.current - v) * (1 - Math.exp(-0.6 * dt));
      if (v < 0.05 && tgt.current === 0) v = 0;
      x += v * BASE_PX_PER_KMH * dt;
      if (bgRef.current) bgRef.current.style.backgroundPositionX = `${-x * 0.06}px`;
      if (poleRef.current) poleRef.current.style.backgroundPositionX = `${-x * 0.55}px`;
      if (trackRef.current) trackRef.current.style.backgroundPositionX = `${-x * 0.9}px`;
      if (grassRef.current) grassRef.current.style.backgroundPositionX = `${-x * 1.5}px`;
      if (trainRef.current) {
        const a = Math.min(v / 60, 1);
        trainRef.current.style.transform = `translate3d(0,${(Math.sin(t * 13) * 0.6 + Math.sin(t * 5.3) * 0.4) * a}px,0)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [visible]);

  const grade = phase === "night" ? "brightness(0.45) saturate(0.8) hue-rotate(15deg)" : phase === "day" ? "saturate(1.05) brightness(1.05) hue-rotate(-8deg)" : undefined;

  return (
    <div ref={ref} role="img" aria-label={label}
      className="relative h-56 w-full overflow-hidden rounded-2xl bg-black shadow-xl sm:h-72">
      <div className="absolute inset-0" style={{ filter: grade }}>
        {atStation ? (
          <img src={scenePlatform} alt="" width={1920} height={640} className="absolute inset-0 h-full w-full object-cover object-bottom" />
        ) : (
          <>
            <div ref={bgRef} className="absolute inset-x-0 top-0 h-[78%] bg-repeat-x"
              style={{ backgroundImage: `url(${sceneBg})`, backgroundSize: "auto 100%", backgroundPositionY: "70%" }} />
            {/* catenary masts + contact wire */}
            <div ref={poleRef} className="absolute inset-x-0 top-[8%] h-[62%] bg-repeat-x opacity-90"
              style={{ backgroundImage: "linear-gradient(90deg, transparent 0 96%, #2b2b2b 96% 97.4%, #555 97.4% 98%, transparent 98%), linear-gradient(180deg, transparent 0 9%, #3a3a3a 9% 10%, transparent 10% 13%, #222 13% 13.6%, transparent 13.6%)", backgroundSize: "260px 100%, 100% 100%" }} />
            {/* ballast + sleepers + rails */}
            <div ref={trackRef} className="absolute inset-x-0 bottom-0 h-[30%] bg-repeat-x"
              style={{ backgroundImage: "linear-gradient(180deg, transparent 0 22%, #9a9a9a 22% 25%, #4a4a4a 25% 27%, transparent 27%), repeating-linear-gradient(90deg, #6d5a49 0 9px, transparent 9px 22px), radial-gradient(circle at 30% 40%, #8a8378 0 1.5px, transparent 2px), radial-gradient(circle at 70% 70%, #5e5850 0 1.5px, transparent 2px), linear-gradient(180deg, #7a7166, #4e473f)", backgroundSize: "100% 100%, 22px 30%, 7px 7px, 9px 9px, 100% 100%", backgroundPositionY: "0, 36%, 0, 0, 0" }} />
          </>
        )}
        {/* the train — fixed in frame, world moves past (tracking shot) */}
        <div ref={trainRef} className={`absolute will-change-transform ${atStation ? "bottom-[13%] h-[28%]" : "bottom-[22%] h-[30%]"}`}
          style={{ right: "-6%", aspectRatio: "1920 / 158" }}>
          <img src={sceneTrain} alt="" width={1920} height={158} className="h-full w-full drop-shadow-[0_6px_6px_rgba(0,0,0,0.5)]" />
          <span className="absolute right-[0.6%] top-[40%] size-[0.5%] rounded-full bg-amber-100 shadow-[0_0_12px_6px_rgba(255,240,180,0.7)]" />
        </div>
        {!atStation ? (
          <div ref={grassRef} className="pointer-events-none absolute inset-x-0 -bottom-[4%] h-[34%] bg-repeat-x"
            style={{ backgroundImage: `url(${sceneGrass})`, backgroundSize: "auto 100%", filter: "blur(1.2px) brightness(0.8)" }} />
        ) : null}
      </div>
      {/* cinematic grade */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_55%,rgba(0,0,0,0.5))]" />
      {phase === "sunset" ? <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-orange-300/20 to-transparent mix-blend-overlay" /> : null}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-black/50 to-transparent" />

      {atStation && stationName ? (
        <div className="absolute left-1/2 top-[10%] w-[46%] -translate-x-1/2 rounded-sm border-2 border-black/80 bg-[#f5c518] px-1 py-1 text-center text-black shadow-lg">
          <p className="truncate text-[12px] font-black uppercase leading-tight sm:text-sm">{stationName}</p>
          {platform ? <p className="text-[9px] font-bold sm:text-[11px]">Platform {platform}</p> : null}
        </div>
      ) : null}

      <div className="absolute left-3 top-10 rounded-xl bg-black/55 px-2.5 py-1 text-white backdrop-blur">
        <p className="flex items-center gap-1.5 text-[11px] font-extrabold">
          <span className={`size-2 rounded-full ${live ? "animate-pulse bg-emerald-400" : "bg-amber-400"}`} />
          {atStation ? "Stopped at station" : run ? "Train in Motion" : "Halted"}
        </p>
      </div>
      {speed > 0 ? (
        <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-xl bg-black/55 px-2.5 py-1.5 text-white backdrop-blur">
          <Gauge className="size-4" />
          <div><p className="text-[9px] opacity-80">Avg speed</p><p className="text-[13px] font-extrabold leading-none">{speed} km/h</p></div>
        </div>
      ) : null}
      <button type="button" onClick={onSound} aria-label={sound ? "Mute train sound" : "Play train sound"}
        className="absolute bottom-3 left-3 flex size-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur active:scale-95">
        {sound ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
      </button>
      <div className="absolute bottom-3 right-3 rounded-xl bg-black/55 px-2.5 py-1 text-right text-white backdrop-blur">
        <p className="text-[9px] opacity-80">Last railway data update</p>
        <p className="text-[11px] font-bold">{updated}</p>
      </div>
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Main component (liveTrainStatusService UI)                          */
/* ------------------------------------------------------------------ */

export function LiveJourney({
  initial, name, fetcher,
}: { initial: LiveStatus; name: string; fetcher: () => Promise<unknown> }) {
  const { data: cfg } = useLiveTrainSettings();
  const s: LiveTrainSettings | undefined = cfg;
  const [data, setData] = useState(initial);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [refreshErr, setRefreshErr] = useState("");
  const [justUpdated, setJustUpdated] = useState(false);
  const [online, setOnline] = useState(true);
  const [showRoute, setShowRoute] = useState(false);
  const [sound, setSound] = useState(false);
  const [event, setEvent] = useState<string>("");
  const [, tick] = useState(0);
  const lastCode = useRef(initial.currentCode);

  useEffect(() => { setData(initial); setFetchedAt(Date.now()); lastCode.current = initial.currentCode; }, [initial]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // one lightweight 30s ticker for interpolation + ages
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) tick((n) => n + 1); }, 30_000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    if (!navigator.onLine) { setOnline(false); return; }
    setRefreshing(true); setRefreshErr("");
    try {
      const res = (await fetcher()) as Res<LiveStatus>;
      if (res.success && res.data && Array.isArray(res.data.stops) && res.data.stops.length > 0) {
        const nd = res.data;
        if (nd.currentCode && nd.currentCode !== lastCode.current) {
          const st = nd.stops.find((x) => x.code === nd.currentCode);
          setEvent(st?.actualDep ? `DEPARTED • ${st.name}` : `ARRIVED AT • ${st?.name ?? nd.currentName}`);
          setTimeout(() => setEvent(""), 6000);
          lastCode.current = nd.currentCode;
        }
        setData(nd); setFetchedAt(Date.now()); setJustUpdated(true);
        setTimeout(() => setJustUpdated(false), 4000);
      } else {
        setRefreshErr("Unable to refresh live train status");
      }
    } catch {
      setRefreshErr("Unable to refresh live train status");
    } finally {
      setRefreshing(false);
    }
  }, [fetcher, refreshing]);

  // auto refresh (DB-configured), paused when app hidden
  useEffect(() => {
    if (!s || !s.autoRefresh || data.terminated) return;
    const ms = Math.max(1, s.intervalSec) * 1000;
    const id = setInterval(() => { if (!document.hidden && navigator.onLine) void refresh(); }, ms);
    const onVis = () => { if (!document.hidden && Date.now() - fetchedAt > ms) void refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [s, data.terminated, refresh, fetchedAt]);

  const eng = useMemo(() => computeEngine(data), [data, fetchedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const providerAge = parseAgeMin(data.updatedAgo);
  const ageMin = Math.round((Date.now() - fetchedAt) / 60000) + (providerAge ?? 0);
  const stale = !!s && ageMin >= s.staleMin;
  const isLive = online && !stale && !refreshErr && eng.state !== "COMPLETED" && eng.state !== "CANCELLED";
  const phase: Phase = s && !s.dayNight ? "day" : phaseNow();
  const on = (k: keyof LiveTrainSettings) => !s || s[k] === 1;
  const remainingKm = data.totalKm > 0 ? Math.max(0, data.totalKm - data.coveredKm) : null;
  const delayKnown = !!eng.cur && (eng.cur.actualArr || eng.cur.actualDep);

  if (s && s.enabled === 0) {
    return <p className="rounded-xl border border-border bg-card p-4 text-center text-sm text-muted-foreground">Live train status is currently unavailable.</p>;
  }

  return (
    <div className="space-y-3">
      {/* header */}
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
        <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground"><TrainFront className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-extrabold uppercase tracking-tight text-foreground">{name || "Train"}</p>
          <p className="text-[11px] text-muted-foreground">{data.trainNo} • Shahin Travels • Live Railway Information</p>
        </div>
        {isLive ? (
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-extrabold text-emerald-600">
            <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>
            LIVE
          </span>
        ) : null}
      </div>

      {/* banners */}
      {!online ? (
        <Banner icon={<WifiOff className="size-4" />} tone="warn" title="You are offline" body="Showing the last available train status. It may not be current." />
      ) : null}
      {refreshErr ? (
        <Banner icon={<AlertTriangle className="size-4" />} tone="err" title={refreshErr}
          body={`Last successful update: ${fmtStamp(fetchedAt)}`} action={{ label: "↻ Try Again", onClick: refresh }} />
      ) : null}
      {stale && online && !refreshErr ? (
        <Banner icon={<Clock className="size-4" />} tone="warn" title="Live data may be delayed" body={`Data is about ${ageMin} min old.`} />
      ) : null}

      {/* hero scene */}
      <div className="relative">
        <RailScene
          phase={phase}
          moving={eng.moving && isLive}
          animate={on("animation")}
          quality={s?.quality ?? 2}
          label={`${name} ${STATUS_LABEL[eng.state]}${eng.cur ? ` near ${eng.cur.name}` : ""}`}
          atStation={!eng.moving && !!eng.cur}
          stationName={eng.cur?.name ?? ""}
          platform={eng.cur?.platform ?? ""}
          speed={on("showSpeed") ? data.avgSpeedKmph : 0}
          updated={providerAge != null ? (providerAge < 1 ? "just now" : `${providerAge} min ago`) : fmtStamp(fetchedAt)}
          live={isLive}
          sound={sound}
          onSound={() => setSound((v) => !v)}
        />
        <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-background/80 px-2.5 py-1 text-[11px] font-extrabold text-foreground backdrop-blur">
          {STATUS_LABEL[eng.state]}{on("showDelay") && delayKnown ? ` • ${delayLabel(data.delayMin)}` : ""}
        </div>
        {event ? (
          <div className="absolute inset-x-6 top-1/3 animate-fade-in rounded-xl bg-background/90 px-3 py-2 text-center text-[13px] font-extrabold text-foreground shadow-lg backdrop-blur">
            ● {event}
          </div>
        ) : null}
      </div>

      {/* route progress */}
      <RouteProgress eng={eng} />

      {/* location cards */}
      {eng.cur ? (
        <InfoCard label="LIVE LOCATION" icon={<MapPin className="size-4" />} accent>
          <p className="text-[16px] font-extrabold text-foreground">{eng.cur.name} ({eng.cur.code})</p>
          <p className="text-[11px] text-muted-foreground">
            {eng.cur.actualDep ? `Departed at ${eng.cur.actualDep}` : eng.cur.actualArr ? `Arrived at ${eng.cur.actualArr}` : ""}
            {eng.segFrac !== null && eng.next ? ` • Estimated between ${eng.cur.code} → ${eng.next.code}` : ""}
          </p>
          {data.message ? <p className="mt-1 text-[11px] font-semibold text-foreground/80">{data.message}</p> : null}
        </InfoCard>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {on("showNext") && eng.next ? (
          <InfoCard label="NEXT STATION" icon={<Navigation className="size-4" />}>
            <p className="text-[15px] font-extrabold text-foreground">{eng.next.name} ({eng.next.code})</p>
            <dl className="mt-1 grid grid-cols-2 gap-x-2 text-[11px]">
              {on("showEta") && data.nextEta ? (<><dt className="text-muted-foreground">ETA</dt><dd className="font-bold text-primary">{data.nextEta}{etaCountdown(data.nextEta) ? ` (${etaCountdown(data.nextEta)})` : ""}</dd></>) : null}
              {data.distanceToNextKm > 0 ? (<><dt className="text-muted-foreground">Distance</dt><dd className="font-bold">{data.distanceToNextKm} km</dd></>) : null}
              {data.nextPlatform ? (<><dt className="text-muted-foreground">Platform</dt><dd className="font-bold">{data.nextPlatform}</dd></>) : null}
            </dl>
          </InfoCard>
        ) : null}
        {on("showPrev") && eng.prev ? (
          <InfoCard label="PREVIOUS" icon={<Clock className="size-4" />}>
            <p className="text-[14px] font-bold text-foreground">{eng.prev.name} ({eng.prev.code})</p>
            {eng.prev.actualDep || eng.prev.schedDep ? (
              <p className="text-[11px] text-muted-foreground">Departed {eng.prev.actualDep || eng.prev.schedDep}{eng.prev.actualDep ? "" : " (sched.)"}</p>
            ) : null}
          </InfoCard>
        ) : null}
        {eng.dest ? (
          <InfoCard label="DESTINATION" icon={<Flag className="size-4" />}>
            <p className="text-[14px] font-bold text-foreground">{eng.dest.name} ({eng.dest.code})</p>
            <p className="text-[11px] text-muted-foreground">
              {eng.dest.actualArr || eng.dest.schedArr ? `Expected ${eng.dest.actualArr || eng.dest.schedArr} • Day ${eng.dest.day}` : ""}
              {on("showRemaining") && remainingKm !== null ? ` • ${remainingKm} km left` : ""}
            </p>
          </InfoCard>
        ) : null}
      </div>

      {/* metric cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {on("showSpeed") && data.avgSpeedKmph > 0 ? <Stat icon={<Gauge className="size-4" />} label="Average Speed" value={`${data.avgSpeedKmph} km/h`} /> : null}
        {on("showTravelled") && data.totalKm > 0 ? <Stat icon={<RouteIcon className="size-4" />} label="Distance Travelled" value={`${data.coveredKm} km`} /> : null}
        {on("showRemaining") && remainingKm !== null ? <Stat icon={<RouteIcon className="size-4" />} label="Distance Remaining" value={`${remainingKm} km`} /> : null}
        <Stat icon={<TrainFront className="size-4" />} label="Current Status" value={STATUS_LABEL[eng.state]} />
        {on("showDelay") && delayKnown ? <Stat icon={<Clock className="size-4" />} label="Delay" value={delayLabel(data.delayMin)} tone={data.delayMin > 5 ? "warn" : "ok"} /> : null}
        {on("showNext") && eng.next ? <Stat icon={<Navigation className="size-4" />} label="Next Station" value={eng.next.code} /> : null}
      </div>

      {/* refresh + last updated */}
      <div className="rounded-2xl border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Last updated</p>
            <p className="text-[13px] font-bold text-foreground" aria-live="polite">
              {refreshing ? "Updating live status..." : justUpdated ? "Updated just now" : fmtStamp(fetchedAt)}
            </p>
            {data.updatedAgo ? <p className="text-[10px] text-muted-foreground">Provider: {data.updatedAgo}</p> : null}
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing || !online}
            aria-label={refreshing ? "Updating live status" : "Refresh live status"}
            aria-busy={refreshing}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-primary px-4 text-[13px] font-extrabold text-primary-foreground shadow transition active:scale-95 disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Updating..." : "Refresh Live Status"}
          </button>
        </div>
      </div>

      {/* full route */}
      {on("showTimeline") ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <button
            type="button"
            onClick={() => setShowRoute((v) => !v)}
            aria-expanded={showRoute}
            className="flex h-12 w-full items-center justify-between px-3 text-[13px] font-extrabold text-foreground"
          >
            View Full Route • {data.stops.length} stations
            <ChevronDown className={`size-4 transition-transform ${showRoute ? "rotate-180" : ""}`} />
          </button>
          {showRoute ? (
            <ol className="max-h-[480px] overflow-y-auto border-t border-border p-3">
              {data.stops.map((st, i) => (
                <li key={`${st.code}-${i}`} className="flex items-start gap-3 py-1.5">
                  <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold ${
                    st.state === "passed" ? "bg-emerald-500 text-white" : st.state === "current" ? "bg-primary text-primary-foreground ring-4 ring-primary/25" : "border border-border text-muted-foreground"
                  }`}>{st.state === "passed" ? "✓" : st.state === "current" ? "●" : "○"}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-[13px] font-bold ${st.state === "current" ? "text-primary" : "text-foreground"}`}>{st.name} <span className="text-[11px] font-medium text-muted-foreground">({st.code})</span></p>
                    <p className="text-[10px] text-muted-foreground">{st.distanceKm} km • Day {st.day}{st.platform ? ` • PF ${st.platform}` : ""}</p>
                  </div>
                  <div className="shrink-0 text-right text-[11px]">
                    <p className="font-bold text-foreground">{st.actualArr || st.schedArr || "—"} / {st.actualDep || st.schedDep || "—"}</p>
                    {(st.actualArr || st.actualDep) ? <p className={st.delayMin > 5 ? "text-amber-600" : "text-emerald-600"}>{delayLabel(st.delayMin)}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RouteProgress({ eng }: { eng: Engine }) {
  const pct = eng.routePos * 100;
  const marks = [eng.prev, eng.cur, eng.next].filter(Boolean) as LiveStop[];
  return (
    <div className="rounded-2xl border border-border bg-card px-3 pb-3 pt-4">
      <div className="relative h-10">
        <div className="absolute inset-x-0 top-4 h-1.5 rounded-full bg-muted" />
        <div className="absolute left-0 top-4 h-1.5 rounded-full bg-primary transition-[width] duration-1000 ease-out" style={{ width: `${pct}%` }} />
        <div className="absolute top-0 -translate-x-1/2 transition-[left] duration-1000 ease-out" style={{ left: `${Math.min(96, Math.max(4, pct))}%` }}>
          <span className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-primary/20"><TrainFront className="size-4" /></span>
        </div>
      </div>
      <div className="mt-1 flex justify-between gap-1 text-[10px]">
        <span className="font-bold text-muted-foreground">START</span>
        <span className="truncate text-center text-muted-foreground">{marks.map((m) => m.code).join(" → ")}</span>
        <span className="font-bold text-muted-foreground">END</span>
      </div>
      <p className="mt-1 text-center text-[10px] text-muted-foreground">
        {Math.round(pct)}% of route{eng.segFrac !== null ? " • position estimated from live timings" : ""}
      </p>
    </div>
  );
}

function InfoCard({ label, icon, children, accent }: { label: string; icon: React.ReactNode; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-2xl border p-3 shadow-sm ${accent ? "border-primary/30 bg-primary/5" : "border-border bg-card"}`}>
      <p className="mb-1 flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wide text-muted-foreground"><span className="text-primary">{icon}</span>{label}</p>
      {children}
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-xl border border-border bg-card p-2.5">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground"><span className="text-primary">{icon}</span>{label}</p>
      <p className={`mt-0.5 text-[15px] font-extrabold ${tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-600" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function Banner({ icon, title, body, tone, action }: { icon: React.ReactNode; title: string; body: string; tone: "warn" | "err"; action?: { label: string; onClick: () => void } }) {
  return (
    <div role="status" className={`flex items-start gap-2 rounded-xl border p-3 text-[12px] ${tone === "err" ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-amber-500/40 bg-amber-500/10 text-amber-700"}`}>
      {icon}
      <div className="min-w-0 flex-1"><p className="font-extrabold">{title}</p><p className="opacity-90">{body}</p></div>
      {action ? <button type="button" onClick={action.onClick} className="h-9 rounded-lg bg-background px-3 font-bold text-foreground">{action.label}</button> : null}
    </div>
  );
}
