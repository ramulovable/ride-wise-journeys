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
} from "lucide-react";
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

const RailScene = memo(function RailScene({
  phase, moving, animate, quality, label,
}: { phase: Phase; moving: boolean; animate: boolean; quality: number; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const run = animate && moving && visible;
  const night = phase === "night";
  const [s1, s2, s3] = SKY[phase];
  const speedScale = quality >= 3 ? 1 : quality <= 1 ? 1.6 : 1.25;
  const dur = (base: number) => `${base * speedScale}s`;
  const play = run ? "running" : "paused";

  return (
    <div
      ref={ref}
      role="img"
      aria-label={label}
      className="lj-scene relative h-48 w-full overflow-hidden rounded-2xl"
      style={{ background: `linear-gradient(180deg, ${s1} 0%, ${s2} 55%, ${s3} 100%)` }}
    >
      {night ? (
        <div className="absolute inset-0 opacity-80" style={{
          backgroundImage: "radial-gradient(1px 1px at 20% 20%, #fff, transparent), radial-gradient(1px 1px at 60% 12%, #fff, transparent), radial-gradient(1.5px 1.5px at 82% 28%, #fff, transparent), radial-gradient(1px 1px at 40% 34%, #fff, transparent)",
        }} />
      ) : null}
      <div className="absolute rounded-full" style={{
        width: 34, height: 34, right: "14%", top: phase === "sunset" ? "40%" : "12%",
        background: night ? "#f4f1de" : phase === "sunset" ? "#ffb26b" : "#fff6c9",
        boxShadow: `0 0 40px ${night ? "#f4f1de88" : "#ffd27a"}`,
      }} />

      {/* far hills */}
      <div className="lj-layer absolute bottom-[58px] left-0 h-16 w-[200%]" style={{ animationDuration: dur(60), animationPlayState: play }}>
        <svg viewBox="0 0 800 60" preserveAspectRatio="none" className="h-full w-full">
          <path d="M0 60 L0 35 Q60 5 120 30 T240 25 T360 32 T400 35 L400 60Z M400 60 L400 35 Q460 5 520 30 T640 25 T760 32 T800 35 L800 60Z"
            fill={night ? "#1b2547" : phase === "sunset" ? "#7a5a8a" : "#9cc3a6"} />
        </svg>
      </div>
      {/* trees + fields */}
      <div className="lj-layer absolute bottom-[44px] left-0 h-12 w-[200%]" style={{ animationDuration: dur(22), animationPlayState: play }}>
        <svg viewBox="0 0 800 48" preserveAspectRatio="none" className="h-full w-full">
          <rect y="34" width="800" height="14" fill={night ? "#1d3324" : "#6aa84f"} />
          {Array.from({ length: 16 }).map((_, i) => {
            const x = i * 50 + (i % 3) * 9;
            return (
              <g key={i} fill={night ? "#122418" : "#3f7d3a"}>
                <rect x={x + 6} y={26} width="3" height="10" fill={night ? "#0d1a10" : "#5b4030"} />
                <circle cx={x + 7.5} cy={20} r={i % 2 ? 9 : 7} />
              </g>
            );
          })}
        </svg>
      </div>
      {/* OHE poles + wire */}
      <div className="lj-layer absolute bottom-[34px] left-0 h-24 w-[200%]" style={{ animationDuration: dur(7), animationPlayState: play }}>
        <svg viewBox="0 0 800 96" preserveAspectRatio="none" className="h-full w-full">
          <line x1="0" y1="14" x2="800" y2="14" stroke={night ? "#8892b0" : "#4a4a4a"} strokeWidth="0.8" />
          {Array.from({ length: 8 }).map((_, i) => (
            <g key={i} stroke={night ? "#8892b0" : "#555"}>
              <line x1={i * 100 + 30} y1="8" x2={i * 100 + 30} y2="96" strokeWidth="2.5" />
              <line x1={i * 100 + 30} y1="12" x2={i * 100 + 52} y2="14" strokeWidth="1.2" />
              {i % 4 === 2 ? (
                <g>
                  <rect x={i * 100 + 70} y="46" width="7" height="16" rx="2" fill="#222" stroke="none" />
                  <circle cx={i * 100 + 73.5} cy="51" r="2.2" fill="#2ee66b" stroke="none" />
                  <line x1={i * 100 + 73.5} y1="62" x2={i * 100 + 73.5} y2="96" strokeWidth="1.5" />
                </g>
              ) : null}
            </g>
          ))}
        </svg>
      </div>
      {/* ballast + track */}
      <div className="absolute inset-x-0 bottom-0 h-[38px]" style={{ background: night ? "#2a2a2e" : "#8a7f73" }} />
      <div className="lj-sleepers absolute inset-x-0 bottom-[10px] h-[10px]" style={{ animationDuration: dur(0.6), animationPlayState: play }} />
      <div className="absolute inset-x-0 bottom-[17px] h-[2px]" style={{ background: "#c9c9cf" }} />
      <div className="absolute inset-x-0 bottom-[10px] h-[2px]" style={{ background: "#c9c9cf" }} />

      {/* train (WAP-7 style loco + LHB coaches) */}
      <div className={`absolute bottom-[18px] left-[6%] w-[88%] ${run ? "lj-bob" : ""}`}>
        <svg viewBox="0 0 520 54" className="h-auto w-full drop-shadow-[0_6px_6px_rgba(0,0,0,0.35)]">
          {[0, 1, 2, 3].map((i) => (
            <g key={i} transform={`translate(${i * 104},0)`}>
              <rect x="2" y="10" width="98" height="36" rx="5" fill="#b22a2a" />
              <rect x="2" y="30" width="98" height="5" fill="#f2c94c" />
              {[0, 1, 2, 3, 4].map((w) => (
                <rect key={w} x={10 + w * 18} y="15" width="12" height="10" rx="1.5"
                  fill={night ? "#ffe8a3" : "#cfe3f0"} opacity={night ? 0.95 : 0.9} />
              ))}
              <circle cx="18" cy="48" r="5" fill="#222" /><circle cx="32" cy="48" r="5" fill="#222" />
              <circle cx="70" cy="48" r="5" fill="#222" /><circle cx="84" cy="48" r="5" fill="#222" />
            </g>
          ))}
          <g transform="translate(416,0)">
            <path d="M2 10 H86 Q102 12 102 30 V46 H2Z" fill="#e8e2d0" />
            <rect x="2" y="30" width="100" height="6" fill="#c0392b" />
            <rect x="74" y="15" width="20" height="12" rx="2" fill={night ? "#ffe8a3" : "#9fc4dc"} />
            <rect x="10" y="15" width="40" height="10" rx="1.5" fill="#6b6b6b" />
            <path d="M40 10 L48 2 H62 L70 10" stroke="#333" strokeWidth="1.5" fill="none" />
            <circle cx="18" cy="48" r="5" fill="#222" /><circle cx="34" cy="48" r="5" fill="#222" />
            <circle cx="70" cy="48" r="5" fill="#222" /><circle cx="86" cy="48" r="5" fill="#222" />
            {night ? <circle cx="100" cy="38" r="3" fill="#fffbe0" /> : null}
          </g>
        </svg>
        {night ? <div className="absolute -right-8 bottom-1 h-6 w-24 rounded-full bg-[radial-gradient(ellipse_at_left,rgba(255,250,210,0.55),transparent_70%)]" /> : null}
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
    const ms = Math.max(30, s.intervalSec) * 1000;
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
