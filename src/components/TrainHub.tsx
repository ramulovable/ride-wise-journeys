import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  CalendarDays,
  ChevronRight,
  Clock,
  Gauge,
  Loader2,
  MapPin,
  Search,
  Sofa,
  Ticket,
  TicketCheck,
  TrainFront,
  X,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { POPULAR_STATIONS, POPULAR_TRAINS, type RailStation } from "@/lib/rail-stations";
import {
  railLiveAtStation,
  railLiveStatus,
  railPnrStatus,
  railSeatAvailabilityAll,
  railStationSearch,
  railTrainInfo,
  railTrainSuggest,
  railTrainsBetween,
} from "@/lib/railkit.functions";

import pnrArt from "@/assets/rail-pnr.jpg";
import liveArt from "@/assets/rail-live.jpg";
import findArt from "@/assets/rail-find.jpg";
import seatsArt from "@/assets/rail-seats.jpg";
import stationArt from "@/assets/rail-station.jpg";
import timetableArt from "@/assets/rail-timetable.jpg";

type ToolId = "pnr" | "live" | "between" | "seats" | "station" | "schedule";

type Tool = {
  id: ToolId;
  title: string;
  sub: string;
  Icon: typeof Ticket;
  gradient: string;
  art: string;
  live?: boolean;
};

const TOOLS: Tool[] = [
  {
    id: "pnr",
    title: "PNR Status",
    sub: "Check your PNR status instantly",
    Icon: TicketCheck,
    gradient: "from-blue-600 to-blue-500",
    art: pnrArt,
  },
  {
    id: "live",
    title: "Live Status",
    sub: "Track your train in real-time",
    Icon: Gauge,
    gradient: "from-teal-600 to-cyan-500",
    art: liveArt,
    live: true,
  },
  {
    id: "between",
    title: "Find Trains",
    sub: "Search trains between stations",
    Icon: Search,
    gradient: "from-violet-600 to-indigo-600",
    art: findArt,
  },
  {
    id: "seats",
    title: "Seat Availability",
    sub: "Check seat availability for your train",
    Icon: Sofa,
    gradient: "from-amber-500 to-orange-500",
    art: seatsArt,
  },
  {
    id: "station",
    title: "Live at Station",
    sub: "Check live status of stations",
    Icon: MapPin,
    gradient: "from-rose-600 to-pink-500",
    art: stationArt,
  },
  {
    id: "schedule",
    title: "Time Table",
    sub: "Check train schedule and timings",
    Icon: CalendarDays,
    gradient: "from-sky-700 to-blue-600",
    art: timetableArt,
  },
];

const QUOTAS: { code: string; label: string }[] = [
  { code: "GN", label: "General" },
  { code: "TQ", label: "Tatkal" },
  { code: "PT", label: "Premium Tatkal" },
  { code: "LD", label: "Ladies" },
  { code: "SS", label: "Senior Citizen" },
  { code: "HP", label: "Divyang" },
  { code: "DF", label: "Defence" },
  { code: "YU", label: "Yuva" },
  { code: "FT", label: "Foreign Tourist" },
  { code: "HO", label: "HO Quota" },
];

const CLASS_NAMES: Record<string, string> = {
  "1A": "First AC",
  "2A": "Second AC",
  "3A": "Third AC",
  "3E": "AC 3 Economy",
  SL: "Sleeper",
  "2S": "Second Sitting",
  CC: "AC Chair Car",
  EC: "Executive Chair Car",
};

const PRIMARY_CLASSES = ["SL", "3A", "2A", "1A"];
const EXTRA_CLASSES = ["3E", "2S", "CC", "EC"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function fmtDate(d: Date) {
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
}
function prettyDate(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function TrainHub({ onClose }: { onClose: () => void }) {
  const [tool, setTool] = useState<ToolId | null>(null);
  const active = TOOLS.find((t) => t.id === tool);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="relative overflow-hidden bg-gradient-to-r from-emerald-800 to-emerald-600 px-4 pb-5 pt-4 text-white">
        <div className="pointer-events-none absolute -right-8 -top-10 size-40 rounded-full bg-white/10" />
        <div className="relative flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 min-h-9 min-w-9 rounded-full text-white hover:bg-white/15"
            onClick={() => (tool ? setTool(null) : onClose())}
            aria-label="Back"
          >
            {tool ? <ArrowLeft className="size-5" /> : <X className="size-5" />}
          </Button>
          <span className="flex size-10 items-center justify-center rounded-full border-2 border-white/60">
            <TrainFront className="size-5" />
          </span>
          <div className="flex-1">
            <p className="text-lg font-extrabold leading-tight">Indian Railways Hub</p>
            <p className="text-[11px] opacity-85">Shahin Travels • Live Railway Information</p>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto bg-muted/30 px-3 pb-10 pt-3">
        {active ? <ToolScreen tool={active} /> : <HubGrid onPick={setTool} />}
      </div>
    </div>
  );
}

function HubGrid({ onPick }: { onPick: (id: ToolId) => void }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onPick(t.id)}
            className={`group relative h-36 overflow-hidden rounded-2xl bg-gradient-to-br ${t.gradient} text-left shadow-lg transition active:scale-[0.98]`}
          >
            <img
              src={t.art}
              alt=""
              loading="lazy"
              width={992}
              height={672}
              className="pointer-events-none absolute inset-y-0 right-0 h-full w-3/5 object-cover opacity-90 [mask-image:linear-gradient(to_right,transparent,black_38%)]"
            />
            <div className="relative flex h-full flex-col justify-between p-3.5">
              <span className="flex size-11 items-center justify-center rounded-full border-2 border-white/60 bg-white/15 backdrop-blur-sm">
                <t.Icon className="size-5 text-white" />
              </span>
              <div>
                <p className="text-[17px] font-extrabold leading-tight text-white drop-shadow">
                  {t.title}
                </p>
                <p className="max-w-[60%] text-[11px] font-medium leading-tight text-white/90">
                  {t.sub}
                </p>
              </div>
            </div>
            <span className="absolute bottom-3.5 right-3.5 flex size-8 items-center justify-center rounded-full bg-white/25 text-white backdrop-blur-sm">
              <ChevronRight className="size-4" />
            </span>
            {t.live ? (
              <span className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-extrabold text-white shadow">
                <span className="size-1.5 animate-pulse rounded-full bg-white" /> Live
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-2xl border-2 border-dashed border-emerald-600/40 bg-emerald-50 p-3 dark:bg-emerald-950/30">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-emerald-800">
          <Ticket className="size-6 text-white" />
        </span>
        <div className="flex-1">
          <p className="text-[15px] font-extrabold text-foreground">IRCTC Ticket Booking</p>
          <p className="text-[11px] text-muted-foreground">Book your train ticket easily</p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-white shadow">
          <Clock className="size-3" /> Coming Soon
        </span>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Shared field widgets                                                */
/* ------------------------------------------------------------------ */

function ScreenHero({ tool }: { tool: Tool }) {
  return (
    <div className={`relative mb-3 overflow-hidden rounded-2xl bg-gradient-to-r ${tool.gradient} p-4`}>
      <img
        src={tool.art}
        alt=""
        loading="lazy"
        width={992}
        height={672}
        className="pointer-events-none absolute inset-y-0 right-0 h-full w-1/2 object-cover opacity-80 [mask-image:linear-gradient(to_right,transparent,black_45%)]"
      />
      <div className="relative flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-full border-2 border-white/60 bg-white/15">
          <tool.Icon className="size-6 text-white" />
        </span>
        <div>
          <p className="text-xl font-extrabold leading-tight text-white drop-shadow">{tool.title}</p>
          <p className="max-w-[70%] text-[11px] font-medium text-white/90">{tool.sub}</p>
        </div>
      </div>
    </div>
  );
}

function FieldShell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

function StationField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: RailStation | null;
  onChange: (s: RailStation | null) => void;
}) {
  const search = useServerFn(railStationSearch);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<RailStation[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRemote([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await search({ data: { name: q } });
        if (cancelled || !res.success) return;
        const rows = Array.isArray(res.data) ? res.data : [];
        setRemote(
          rows
            .map((r) => {
              const o = r as Record<string, unknown>;
              const code = String(o["code"] ?? o["stnCode"] ?? o["station_code"] ?? "").toUpperCase();
              const name = String(o["name"] ?? o["stnName"] ?? o["station_name"] ?? "");
              return { code, name };
            })
            .filter((s) => s.code),
        );
      } catch {
        /* keep offline suggestions */
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, search]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const local = q
      ? POPULAR_STATIONS.filter(
          (s) => s.code.toLowerCase().startsWith(q) || s.name.toLowerCase().includes(q),
        )
      : POPULAR_STATIONS.slice(0, 8);
    const merged = [...local];
    for (const r of remote) if (!merged.some((m) => m.code === r.code)) merged.push(r);
    return merged.slice(0, 10);
  }, [query, remote]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <FieldShell label={label}>
        <div className="flex items-center gap-2">
          <MapPin className="size-4 shrink-0 text-primary" />
          <Input
            value={open ? query : value ? `${value.name} (${value.code})` : query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              onChange(null);
            }}
            onFocus={() => {
              setQuery("");
              setOpen(true);
            }}
            placeholder="स्टेशन नाम या कोड लिखें"
            className="h-8 border-0 bg-transparent px-0 text-[15px] font-bold shadow-none focus-visible:ring-0"
          />
          {value ? (
            <button
              type="button"
              aria-label="Clear"
              onClick={() => {
                onChange(null);
                setQuery("");
              }}
            >
              <X className="size-4 text-muted-foreground" />
            </button>
          ) : null}
        </div>
      </FieldShell>

      {open ? (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-popover shadow-xl">
          {options.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">कोई स्टेशन नहीं मिला</p>
          ) : (
            options.map((s) => (
              <button
                key={s.code}
                type="button"
                className="flex w-full items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-left last:border-0 hover:bg-muted"
                onClick={() => {
                  onChange(s);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="text-[13px] font-semibold text-foreground">{s.name}</span>
                <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-extrabold text-primary">
                  {s.code}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

type TrainOption = { number: string; name: string };

function TrainField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TrainOption | null;
  onChange: (t: TrainOption | null) => void;
}) {
  const suggest = useServerFn(railTrainSuggest);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [remote, setRemote] = useState<TrainOption[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setRemote([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await suggest({ data: { q } });
        if (cancelled || !res.success) return;
        const raw = res.data;
        const rows = Array.isArray(raw) ? raw : raw ? [raw] : [];
        setRemote(
          rows
            .map((r) => {
              const o = r as Record<string, unknown>;
              return {
                number: String(o["number"] ?? o["train_no"] ?? o["trainNo"] ?? "").trim(),
                name: String(o["name"] ?? o["train_name"] ?? o["trainName"] ?? "").trim(),
              };
            })
            .filter((t2) => t2.number),
        );
      } catch {
        /* keep offline suggestions */
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, suggest]);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    const local = q
      ? POPULAR_TRAINS.filter(
          (t) => t.number.startsWith(q) || t.name.toLowerCase().includes(q),
        )
      : POPULAR_TRAINS.slice(0, 8);
    const merged = [...local];
    for (const r of remote) if (!merged.some((m) => m.number === r.number)) merged.push(r);
    return merged.slice(0, 10);
  }, [query, remote]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={boxRef} className="relative">
      <FieldShell label={label}>
        <div className="flex items-center gap-2">
          <TrainFront className="size-4 shrink-0 text-primary" />
          <Input
            value={open ? query : value ? `${value.number} — ${value.name}` : query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              onChange(null);
            }}
            onFocus={() => {
              setQuery("");
              setOpen(true);
            }}
            placeholder="ट्रेन नंबर या नाम लिखें"
            className="h-8 border-0 bg-transparent px-0 text-[15px] font-bold shadow-none focus-visible:ring-0"
          />
        </div>
      </FieldShell>

      {open ? (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-popover shadow-xl">
          {options.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">कोई ट्रेन नहीं मिली</p>
          ) : (
            options.map((t) => (
              <button
                key={t.number}
                type="button"
                className="flex w-full items-center gap-2 border-b border-border/60 px-3 py-2 text-left last:border-0 hover:bg-muted"
                onClick={() => {
                  onChange(t);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="rounded-md bg-primary px-1.5 py-0.5 text-[11px] font-extrabold text-primary-foreground">
                  {t.number}
                </span>
                <span className="text-[13px] font-semibold text-foreground">{t.name}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function DateField({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="w-full text-left">
          <FieldShell label="Date of Journey">
            <div className="flex items-center gap-2 py-1">
              <CalendarDays className="size-4 text-primary" />
              <span className="text-[15px] font-bold text-foreground">{prettyDate(value)}</span>
            </div>
          </FieldShell>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => {
            if (d) onChange(d);
            setOpen(false);
          }}
          className="pointer-events-auto"
        />
      </PopoverContent>
    </Popover>
  );
}

function QuickDates({ value, onChange }: { value: Date; onChange: (d: Date) => void }) {
  const opts = [
    { label: "आज", days: 0 },
    { label: "कल", days: 1 },
    { label: "परसों", days: 2 },
  ];
  return (
    <div className="flex gap-2">
      {opts.map((o) => {
        const d = new Date();
        d.setDate(d.getDate() + o.days);
        const on = fmtDate(d) === fmtDate(value);
        return (
          <button
            key={o.label}
            type="button"
            onClick={() => onChange(d)}
            className={`rounded-full px-3 py-1 text-[12px] font-bold transition ${
              on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SubmitButton({ loading, onClick, label }: { loading: boolean; onClick: () => void; label: string }) {
  return (
    <Button className="h-12 w-full rounded-xl text-[15px] font-extrabold" onClick={onClick} disabled={loading}>
      {loading ? <Loader2 className="size-5 animate-spin" /> : <><Search className="mr-1.5 size-4" /> {label}</>}
    </Button>
  );
}

function ErrorNote({ text }: { text: string }) {
  return (
    <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-semibold text-destructive">
      {text}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Screens                                                             */
/* ------------------------------------------------------------------ */

function ToolScreen({ tool }: { tool: Tool }) {
  return (
    <div>
      <ScreenHero tool={tool} />
      {tool.id === "pnr" ? <PnrScreen /> : null}
      {tool.id === "live" ? <LiveScreen /> : null}
      {tool.id === "between" ? <FindTrainsScreen /> : null}
      {tool.id === "seats" ? <SeatsScreen /> : null}
      {tool.id === "station" ? <StationScreen /> : null}
      {tool.id === "schedule" ? <ScheduleScreen /> : null}
    </div>
  );
}

function PnrScreen() {
  const pnrFn = useServerFn(railPnrStatus);
  const [pnr, setPnr] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  async function run() {
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await pnrFn({ data: { pnr } });
      if (res.success) setData((res.data ?? null) as Record<string, unknown> | null);
      else setError(res.error);
    } catch {
      setError("Network problem. Dobara koshish kijiye.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2.5 rounded-2xl border border-border bg-card p-3">
        <FieldShell label="Enter 10 Digit PNR Number">
          <div className="flex items-center gap-2">
            <TicketCheck className="size-4 text-primary" />
            <Input
              inputMode="numeric"
              value={pnr}
              onChange={(e) => setPnr(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="1234567890"
              className="h-8 border-0 bg-transparent px-0 text-[16px] font-bold tracking-wider shadow-none focus-visible:ring-0"
            />
          </div>
        </FieldShell>
        <SubmitButton loading={loading} onClick={run} label="Check PNR" />
      </div>
      {error ? <ErrorNote text={error} /> : null}
      {data ? <ResultCard title="PNR Details" data={data} /> : null}
    </div>
  );
}

function LiveScreen() {
  const liveFn = useServerFn(railLiveStatus);
  const [train, setTrain] = useState<TrainOption | null>(null);
  const [date, setDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  async function run() {
    if (!train) {
      setError("पहले ट्रेन चुनिए।");
      return;
    }
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await liveFn({ data: { trainNo: train.number, date: fmtDate(date) } });
      if (res.success) setData((res.data ?? null) as Record<string, unknown> | null);
      else setError(res.error);
    } catch {
      setError("Network problem. Dobara koshish kijiye.");
    } finally {
      setLoading(false);
    }
  }

  const timeline = Array.isArray(data?.["timeline"]) ? (data["timeline"] as Record<string, unknown>[]) : [];

  return (
    <div className="space-y-3">
      <div className="space-y-2.5 rounded-2xl border border-border bg-card p-3">
        <TrainField label="Train" value={train} onChange={setTrain} />
        <DateField value={date} onChange={setDate} />
        <QuickDates value={date} onChange={setDate} />
        <SubmitButton loading={loading} onClick={run} label="Check Live Status" />
      </div>
      {error ? <ErrorNote text={error} /> : null}

      {data ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="bg-gradient-to-r from-teal-600 to-cyan-500 p-3 text-white">
            <p className="text-[15px] font-extrabold">
              {String(data["trainName"] ?? train?.name ?? "")}{" "}
              <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[12px]">
                {String(data["trainNo"] ?? train?.number ?? "")}
              </span>
            </p>
            <p className="text-[11px] opacity-90">{String(data["statusNote"] ?? "")}</p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-border border-b border-border text-center">
            <Stat label="Last Update" value={String(data["lastUpdate"] ?? "-")} />
            <Stat label="Avg Speed" value={`${String(data["averageSpeedKmph"] ?? "-")} km/h`} />
            <Stat label="Distance" value={`${String(data["totalDistanceKm"] ?? "-")} km`} />
          </div>
          {timeline.length ? (
            <div className="max-h-[420px] overflow-y-auto p-3">
              {timeline
                .filter((s) => s["type"] === "stoppage")
                .map((s, i) => {
                  const arr = (s["arrival"] ?? {}) as Record<string, unknown>;
                  const dep = (s["departure"] ?? {}) as Record<string, unknown>;
                  const passed = s["status"] === "passed";
                  return (
                    <div key={i} className="flex gap-3 pb-3 last:pb-0">
                      <div className="flex flex-col items-center">
                        <span
                          className={`mt-1 size-3 rounded-full ${passed ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                        />
                        <span className="w-px flex-1 bg-border" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[13px] font-bold text-foreground">
                          {String(s["stationName"] ?? "")}{" "}
                          <span className="text-[11px] text-muted-foreground">
                            ({String(s["stationCode"] ?? "")})
                          </span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          आगमन {String(arr["actual"] ?? arr["scheduled"] ?? "-")} • प्रस्थान{" "}
                          {String(dep["actual"] ?? dep["scheduled"] ?? "-")}
                          {s["platform"] ? ` • PF ${String(s["platform"])}` : ""}
                        </p>
                        {arr["delay"] || dep["delay"] ? (
                          <span
                            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              String(arr["delay"] ?? dep["delay"]).includes("min")
                                ? "bg-amber-100 text-amber-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {String(arr["delay"] || dep["delay"])}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
            </div>
          ) : (
            <div className="p-3">
              <Node value={data} />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-2 py-2">
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="text-[12px] font-bold text-foreground">{value}</p>
    </div>
  );
}

type TrainRow = Record<string, unknown>;

function TrainResultCard({ t, onPick }: { t: TrainRow; onPick?: () => void }) {
  const days = String(t["running_days"] ?? "");
  const daily = days === "1111111";
  return (
    <button
      type="button"
      onClick={onPick}
      className="w-full rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition active:scale-[0.99]"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[14px] font-extrabold text-foreground">
          {String(t["train_name"] ?? t["trainName"] ?? "")}
        </p>
        <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-extrabold text-primary-foreground">
          {String(t["train_no"] ?? t["trainNo"] ?? "")}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {String(t["from_stn_name"] ?? "")} ({String(t["from_stn_code"] ?? "")}) →{" "}
        {String(t["to_stn_name"] ?? "")} ({String(t["to_stn_code"] ?? "")})
      </p>
      <div className="mt-2 flex items-center gap-3">
        <div>
          <p className="text-[15px] font-extrabold text-foreground">{String(t["from_time"] ?? "")}</p>
        </div>
        <div className="flex-1 text-center">
          <p className="text-[10px] text-muted-foreground">{String(t["travel_time"] ?? "")}</p>
          <div className="h-px bg-border" />
          <p className="text-[10px] text-muted-foreground">
            {t["distance"] ? `${String(t["distance"])} km` : ""}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[15px] font-extrabold text-foreground">{String(t["to_time"] ?? "")}</p>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
          {String(t["type"] ?? "EXPRESS")}
        </span>
        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
          {daily ? "Runs Daily" : days}
        </span>
        {onPick ? (
          <span className="ml-auto flex items-center gap-1 text-[11px] font-bold text-primary">
            सीट देखें <ChevronRight className="size-3" />
          </span>
        ) : null}
      </div>
    </button>
  );
}

function useStationPair() {
  const [from, setFrom] = useState<RailStation | null>(POPULAR_STATIONS[0] ?? null);
  const [to, setTo] = useState<RailStation | null>(null);
  const swap = () => {
    setFrom(to);
    setTo(from);
  };
  return { from, setFrom, to, setTo, swap };
}

function StationPairFields({
  from,
  to,
  setFrom,
  setTo,
  swap,
}: ReturnType<typeof useStationPair>) {
  return (
    <>
      <StationField label="From" value={from} onChange={setFrom} />
      <div className="flex justify-center">
        <button
          type="button"
          onClick={swap}
          aria-label="Swap"
          className="-my-1 flex size-8 items-center justify-center rounded-full border border-border bg-card shadow-sm"
        >
          <ArrowLeftRight className="size-4 text-primary" />
        </button>
      </div>
      <StationField label="To" value={to} onChange={setTo} />
    </>
  );
}

function FindTrainsScreen() {
  const betweenFn = useServerFn(railTrainsBetween);
  const pair = useStationPair();
  const [date, setDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<TrainRow[] | null>(null);

  async function run() {
    if (!pair.from || !pair.to) {
      setError("दोनों स्टेशन चुनिए।");
      return;
    }
    setLoading(true);
    setError("");
    setRows(null);
    try {
      const res = await betweenFn({
        data: { from: pair.from.code, to: pair.to.code, date: fmtDate(date) },
      });
      if (res.success) setRows(Array.isArray(res.data) ? (res.data as TrainRow[]) : []);
      else setError(res.error);
    } catch {
      setError("Network problem. Dobara koshish kijiye.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2.5 rounded-2xl border border-border bg-card p-3">
        <StationPairFields {...pair} />
        <DateField value={date} onChange={setDate} />
        <QuickDates value={date} onChange={setDate} />
        <SubmitButton loading={loading} onClick={run} label="Find Trains" />
      </div>
      {error ? <ErrorNote text={error} /> : null}
      {rows ? (
        rows.length === 0 ? (
          <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">कोई सीधी ट्रेन नहीं मिली।</p>
        ) : (
          <div className="space-y-2.5">
            <p className="px-1 text-[12px] font-bold text-muted-foreground">
              {rows.length} ट्रेनें मिलीं
            </p>
            {rows.map((t, i) => (
              <TrainResultCard key={i} t={t} />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

function SeatsScreen() {
  const betweenFn = useServerFn(railTrainsBetween);
  const infoFn = useServerFn(railTrainInfo);
  const availFn = useServerFn(railSeatAvailabilityAll);

  const [mode, setMode] = useState<"stations" | "train">("stations");
  const pair = useStationPair();
  const [train, setTrain] = useState<TrainOption | null>(null);
  const [date, setDate] = useState(new Date());
  const [quota, setQuota] = useState("GN");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<TrainRow[] | null>(null);
  const [picked, setPicked] = useState<{ no: string; name: string; from: string; to: string } | null>(null);
  const [avail, setAvail] = useState<Record<string, unknown>[] | null>(null);
  const [availLoading, setAvailLoading] = useState(false);
  const [showExtra, setShowExtra] = useState(false);

  async function searchTrains() {
    setError("");
    setRows(null);
    setPicked(null);
    setAvail(null);
    setLoading(true);
    try {
      if (mode === "stations") {
        if (!pair.from || !pair.to) {
          setError("दोनों स्टेशन चुनिए।");
          return;
        }
        const res = await betweenFn({
          data: { from: pair.from.code, to: pair.to.code, date: fmtDate(date) },
        });
        if (res.success) setRows(Array.isArray(res.data) ? (res.data as TrainRow[]) : []);
        else setError(res.error);
      } else {
        if (!train) {
          setError("पहले ट्रेन चुनिए।");
          return;
        }
        const res = await infoFn({ data: { trainNo: train.number } });
        if (!res.success) {
          setError(res.error);
          return;
        }
        const info = ((res.data as Record<string, unknown>)?.["trainInfo"] ?? {}) as Record<string, unknown>;
        setRows([info as TrainRow]);
      }
    } catch {
      setError("Network problem. Dobara koshish kijiye.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAvailability(t: TrainRow, extra: boolean) {
    const no = String(t["train_no"] ?? t["trainNo"] ?? "");
    const name = String(t["train_name"] ?? t["trainName"] ?? "");
    const fromCode =
      mode === "stations" && pair.from ? pair.from.code : String(t["from_stn_code"] ?? "");
    const toCode = mode === "stations" && pair.to ? pair.to.code : String(t["to_stn_code"] ?? "");
    setPicked({ no, name, from: fromCode, to: toCode });
    setAvail(null);
    setAvailLoading(true);
    try {
      const res = await availFn({
        data: {
          trainNo: no,
          from: fromCode,
          to: toCode,
          date: fmtDate(date),
          quota,
          classes: extra ? [...PRIMARY_CLASSES, ...EXTRA_CLASSES] : PRIMARY_CLASSES,
        },
      });
      if (res.success) setAvail((res.data as Record<string, unknown>[]) ?? []);
      else setError(res.error);
    } catch {
      setError("Network problem. Dobara koshish kijiye.");
    } finally {
      setAvailLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 rounded-xl bg-muted p-1">
        {([
          ["stations", "स्टेशन से स्टेशन"],
          ["train", "ट्रेन नंबर से"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setMode(id);
              setRows(null);
              setPicked(null);
              setAvail(null);
            }}
            className={`flex-1 rounded-lg py-2 text-[12px] font-bold transition ${
              mode === id ? "bg-card text-foreground shadow" : "text-muted-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-2.5 rounded-2xl border border-border bg-card p-3">
        {mode === "stations" ? (
          <StationPairFields {...pair} />
        ) : (
          <TrainField label="Train" value={train} onChange={setTrain} />
        )}
        <DateField value={date} onChange={setDate} />
        <QuickDates value={date} onChange={setDate} />
        <SubmitButton loading={loading} onClick={searchTrains} label="ट्रेन खोजें" />
      </div>

      {error ? <ErrorNote text={error} /> : null}

      {rows && rows.length > 0 ? (
        <div className="space-y-2.5">
          <p className="px-1 text-[12px] font-bold text-muted-foreground">
            ट्रेन चुनिए — सिर्फ उसी ट्रेन की सीटें दिखेंगी
          </p>
          {rows.map((t, i) => (
            <TrainResultCard key={i} t={t} onPick={() => loadAvailability(t, showExtra)} />
          ))}
        </div>
      ) : null}

      {picked ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-3 text-white">
            <p className="text-[15px] font-extrabold">
              {picked.name} <span className="rounded bg-white/20 px-1.5 text-[12px]">{picked.no}</span>
            </p>
            <p className="text-[11px] opacity-90">
              {picked.from} → {picked.to} • {prettyDate(date)}
            </p>
          </div>

          <div className="border-b border-border p-3">
            <p className="mb-2 text-[11px] font-bold uppercase text-muted-foreground">Quota चुनें</p>
            <div className="flex flex-wrap gap-1.5">
              {QUOTAS.map((q) => (
                <button
                  key={q.code}
                  type="button"
                  onClick={() => {
                    setQuota(q.code);
                    const row = rows?.find(
                      (r) => String(r["train_no"] ?? r["trainNo"] ?? "") === picked.no,
                    );
                    if (row) void loadAvailability(row, showExtra);
                  }}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                    quota === q.code
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>

          <div className="p-3">
            {availLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-5 animate-spin text-primary" />
              </div>
            ) : avail && avail.length ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {avail.map((row, i) => (
                    <ClassAvailabilityCard key={i} row={row} />
                  ))}
                </div>
                {!showExtra ? (
                  <Button
                    variant="outline"
                    className="mt-3 h-10 w-full rounded-xl text-[12px] font-bold"
                    onClick={() => {
                      setShowExtra(true);
                      const row = rows?.find(
                        (r) => String(r["train_no"] ?? r["trainNo"] ?? "") === picked.no,
                      );
                      if (row) void loadAvailability(row, true);
                    }}
                  >
                    और क्लास देखें (2S, CC, EC, 3E)
                  </Button>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">इस ट्रेन के लिए जानकारी नहीं मिली।</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ClassAvailabilityCard({ row }: { row: Record<string, unknown> }) {
  const coach = String(row["coach"] ?? "");
  const ok = row["success"] === true;
  const data = (row["data"] ?? {}) as Record<string, unknown>;
  const fare = (data["fare"] ?? {}) as Record<string, unknown>;
  const list = Array.isArray(data["availability"])
    ? (data["availability"] as Record<string, unknown>[])
    : [];
  const first = list[0];
  const status = first ? String(first["availabilityText"] ?? first["status"] ?? "") : "";
  const state = first ? String(first["status"] ?? "") : "";
  const tone =
    state === "AVAILABLE"
      ? "bg-emerald-100 text-emerald-800"
      : state === "RAC"
        ? "bg-amber-100 text-amber-800"
        : state === "WAITLIST"
          ? "bg-red-100 text-red-700"
          : "bg-muted text-muted-foreground";

  return (
    <div className="rounded-xl border border-border bg-background p-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-extrabold text-foreground">{coach}</p>
        {fare["totalFare"] ? (
          <p className="text-[12px] font-bold text-primary">₹{String(fare["totalFare"])}</p>
        ) : null}
      </div>
      <p className="text-[10px] text-muted-foreground">{CLASS_NAMES[coach] ?? coach}</p>
      {ok && first ? (
        <>
          <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>
            {status}
          </span>
          {first["prediction"] ? (
            <p className="mt-1 text-[10px] text-muted-foreground">{String(first["prediction"])}</p>
          ) : null}
        </>
      ) : (
        <span className="mt-1.5 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
          Not Available
        </span>
      )}
    </div>
  );
}

function StationScreen() {
  const stationFn = useServerFn(railLiveAtStation);
  const [station, setStation] = useState<RailStation | null>(POPULAR_STATIONS[0] ?? null);
  const [tab, setTab] = useState<"all" | "arr" | "dep">("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  async function run() {
    if (!station) {
      setError("स्टेशन चुनिए।");
      return;
    }
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await stationFn({ data: { station: station.code } });
      if (res.success) setData((res.data ?? null) as Record<string, unknown> | null);
      else setError(res.error);
    } catch {
      setError("Network problem. Dobara koshish kijiye.");
    } finally {
      setLoading(false);
    }
  }

  const trains = Array.isArray(data?.["trains"]) ? (data["trains"] as Record<string, unknown>[]) : [];
  const filtered = trains.filter((t) => {
    const dep = (t["departure"] ?? {}) as Record<string, unknown>;
    const arr = (t["arrival"] ?? {}) as Record<string, unknown>;
    if (tab === "arr") return String(arr["actual"] ?? "") !== "SRC";
    if (tab === "dep") return String(dep["actual"] ?? "") !== "DSTN";
    return true;
  });

  return (
    <div className="space-y-3">
      <div className="space-y-2.5 rounded-2xl border border-border bg-card p-3">
        <StationField label="Select Station" value={station} onChange={setStation} />
        <SubmitButton loading={loading} onClick={run} label="Get Live Status" />
      </div>
      {error ? <ErrorNote text={error} /> : null}

      {data ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="bg-gradient-to-r from-rose-600 to-pink-500 p-3 text-white">
            <p className="text-[15px] font-extrabold">
              {station?.name} ({station?.code})
            </p>
            <p className="text-[11px] opacity-90">{String(data["summary"] ?? "")}</p>
          </div>
          <div className="flex gap-2 border-b border-border p-2">
            {([
              ["all", "सभी"],
              ["arr", "Arrivals"],
              ["dep", "Departures"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex-1 rounded-lg py-1.5 text-[12px] font-bold transition ${
                  tab === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="divide-y divide-border">
            {filtered.map((t, i) => {
              const dep = (t["departure"] ?? {}) as Record<string, unknown>;
              const arr = (t["arrival"] ?? {}) as Record<string, unknown>;
              const delayed = Boolean(arr["delayed"] || dep["delayed"]);
              const time = String(dep["actual"] ?? "") !== "DSTN" ? dep["actual"] : arr["actual"];
              return (
                <div key={i} className="flex items-center gap-3 p-3">
                  <div className="flex-1">
                    <p className="text-[13px] font-extrabold text-foreground">
                      <span className="mr-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
                        {String(t["trainNo"] ?? "")}
                      </span>
                      {String(t["trainName"] ?? "")}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {String(t["sourceName"] ?? "")} → {String(t["destName"] ?? "")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-extrabold text-foreground">{String(time ?? "-")}</p>
                    {t["platform"] ? (
                      <p className="text-[10px] font-bold text-muted-foreground">
                        PF {String(t["platform"])}
                      </p>
                    ) : null}
                    <span
                      className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        delayed ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {String(arr["delay"] || dep["delay"] || "On Time")}
                    </span>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">अभी कोई ट्रेन नहीं है।</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ScheduleScreen() {
  const infoFn = useServerFn(railTrainInfo);
  const [train, setTrain] = useState<TrainOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  async function run() {
    if (!train) {
      setError("पहले ट्रेन चुनिए।");
      return;
    }
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await infoFn({ data: { trainNo: train.number } });
      if (res.success) setData((res.data ?? null) as Record<string, unknown> | null);
      else setError(res.error);
    } catch {
      setError("Network problem. Dobara koshish kijiye.");
    } finally {
      setLoading(false);
    }
  }

  const info = (data?.["trainInfo"] ?? {}) as Record<string, unknown>;
  const route = Array.isArray(data?.["route"]) ? (data["route"] as Record<string, unknown>[]) : [];

  return (
    <div className="space-y-3">
      <div className="space-y-2.5 rounded-2xl border border-border bg-card p-3">
        <TrainField label="Train" value={train} onChange={setTrain} />
        <SubmitButton loading={loading} onClick={run} label="View Time Table" />
      </div>
      {error ? <ErrorNote text={error} /> : null}

      {data ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="bg-gradient-to-r from-sky-700 to-blue-600 p-3 text-white">
            <p className="text-[15px] font-extrabold">
              {String(info["train_name"] ?? train?.name ?? "")}{" "}
              <span className="rounded bg-white/20 px-1.5 text-[12px]">
                {String(info["train_no"] ?? train?.number ?? "")}
              </span>
            </p>
            <p className="text-[11px] opacity-90">
              {String(info["from_stn_name"] ?? "")} → {String(info["to_stn_name"] ?? "")} •{" "}
              {String(info["travel_time"] ?? "")}
            </p>
          </div>
          <div className="divide-y divide-border">
            {route.map((s, i) => (
              <div key={i} className="flex items-center gap-3 p-2.5">
                <span className="w-9 rounded-md bg-primary/10 py-1 text-center text-[10px] font-extrabold text-primary">
                  {String(s["stnCode"] ?? "")}
                </span>
                <div className="flex-1">
                  <p className="text-[13px] font-bold text-foreground">{String(s["stnName"] ?? "")}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {String(s["distance"] ?? "0")} km • हाल्ट {String(s["halt"] ?? "-")}
                    {s["platform"] ? ` • PF ${String(s["platform"])}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[12px] font-extrabold text-foreground">
                    {String(s["arrival"] ?? "--")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{String(s["departure"] ?? "--")}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Generic fallback rendering                                          */
/* ------------------------------------------------------------------ */

function ResultCard({ title, data }: { title: string; data: unknown }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border bg-muted/50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="p-3">
        <Node value={data} />
      </div>
    </div>
  );
}

function prettyKey(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

function Node({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined || value === "") return null;

  if (Array.isArray(value)) {
    if (value.length === 0) return <p className="text-xs text-muted-foreground">कोई रिकॉर्ड नहीं मिला।</p>;
    return (
      <div className="space-y-2">
        {value.slice(0, 40).map((item, i) => (
          <div key={i} className="rounded-xl border border-border bg-background p-2.5">
            <Node value={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== null && v !== undefined && v !== "",
    );
    return (
      <div className={depth === 0 ? "space-y-2" : "space-y-1"}>
        {entries.map(([k, v]) => {
          const nested = typeof v === "object";
          return (
            <div key={k} className={nested ? "" : "flex items-start justify-between gap-3"}>
              <span className="text-[11px] font-semibold text-muted-foreground">{prettyKey(k)}</span>
              {nested ? (
                <div className="mt-1">
                  <Node value={v} depth={depth + 1} />
                </div>
              ) : (
                <span className="text-right text-[12px] font-medium text-foreground">{String(v)}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return <span className="text-[12px] font-medium text-foreground">{String(value)}</span>;
}
