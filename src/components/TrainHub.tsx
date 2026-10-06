import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowLeftRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Gauge,
  Loader2,
  MapPin,
  Navigation,
  Search,
  Share2,
  Sofa,
  Ticket,
  TicketCheck,
  TrainFront,
  Utensils,
  X,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { InTrainToggle } from "@/components/InTrainToggle";
import { printPnrSlip, type SlipPassengerInfo } from "@/lib/pnr-slip";
import { PnrInsights, pnrPrediction, chanceTone } from "@/components/RailInsights";
import { parseWl, predict, daysUntil, parseJourneyDate } from "@/lib/rail-predict";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { POPULAR_STATIONS, POPULAR_TRAINS, type RailStation } from "@/lib/rail-stations";
import {
  railAvailability,
  railTrainClasses,
  railBetween,
  railLive,
  railPnr,
  railStationBoard,
  railStations,
  railTrainSearch,
  tatkalWindowError,

  type ClassAvailability,
  type LiveStatus,
  type PnrStatus,
  type RouteTrain,
  type StationBoardTrain,
  type TrainRecord,
} from "@/lib/indianrail.functions";

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
  { code: "SS", label: "Senior Citizen / Lower Berth" },
  { code: "HP", label: "Divyang (Handicapped)" },
  { code: "DF", label: "Defence" },
  { code: "YU", label: "Yuva" },
  { code: "HO", label: "Head Quarter / VIP" },
  { code: "DP", label: "Duty Pass" },
  { code: "FT", label: "Foreign Tourist" },
  { code: "PH", label: "Parliament House" },
];

const CLASS_NAMES: Record<string, string> = {
  "1A": "First AC",
  "2A": "Second AC",
  "3A": "Third AC",
  "3E": "AC 3 Economy",
  SL: "Sleeper",
  "2S": "Second Sitting",
  CC: "AC Chair Car",
  EC: "Executive Chair",
  FC: "First Class",
};

const PRIMARY_CLASSES = ["SL", "3A", "2A", "1A"];
const EXTRA_CLASSES = ["3E", "2S", "CC", "EC"];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function ymd(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function compact(d: Date) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
function prettyDate(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function delayText(min: number) {
  if (min <= 0) return "Right Time";
  if (min < 60) return `${min} मिनट लेट`;
  return `${Math.floor(min / 60)} घं ${min % 60} मि लेट`;
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
  const search = useServerFn(railStations);
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
        const res = await search({ data: { q } });
        if (cancelled || !res.success || !res.data) return;
        setRemote(res.data.map((s) => ({ code: s.code, name: s.name })));
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
    return merged.slice(0, 12);
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
  const suggest = useServerFn(railTrainSearch);
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
        if (cancelled || !res.success || !res.data) return;
        setRemote(res.data.map((r) => ({ number: r.number, name: r.name })));
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
      ? POPULAR_TRAINS.filter((t) => t.number.startsWith(q) || t.name.toLowerCase().includes(q))
      : POPULAR_TRAINS.slice(0, 8);
    const merged = [...local];
    for (const r of remote) if (!merged.some((m) => m.number === r.number)) merged.push(r);
    return merged.slice(0, 12);
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

function QuickDates({
  value,
  onChange,
  withYesterday,
}: {
  value: Date;
  onChange: (d: Date) => void;
  withYesterday?: boolean;
}) {
  const opts = withYesterday
    ? [
        { label: "कल (बीता)", days: -1 },
        { label: "आज", days: 0 },
        { label: "कल", days: 1 },
      ]
    : [
        { label: "आज", days: 0 },
        { label: "कल", days: 1 },
        { label: "परसों", days: 2 },
      ];
  return (
    <div className="flex gap-2">
      {opts.map((o) => {
        const d = new Date();
        d.setDate(d.getDate() + o.days);
        const on = ymd(d) === ymd(value);
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
      {loading ? (
        <Loader2 className="size-5 animate-spin" />
      ) : (
        <>
          <Search className="mr-1.5 size-4" /> {label}
        </>
      )}
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

/* ----------------------------- PNR -------------------------------- */

function PnrScreen() {
  const pnrFn = useServerFn(railPnr);
  const [pnr, setPnr] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<PnrStatus | null>(null);

  async function run() {
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await pnrFn({ data: { pnr } });
      if (res.success) setData(res.data);
      else setError(res.error);
    } catch {
      setError("नेटवर्क की दिक्कत है। दोबारा कोशिश कीजिए।");
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
      {data ? <PnrResult d={data} /> : null}
    </div>
  );
}

function PnrResult({ d }: { d: PnrStatus }) {
  const [copied, setCopied] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfErr, setPdfErr] = useState("");
  const [pax, setPax] = useState<SlipPassengerInfo[]>(() => d.passengers.map(() => ({})));
  const setPaxField = (i: number, k: keyof SlipPassengerInfo, val: string) =>
    setPax((prev) => prev.map((p, j) => (j === i ? { ...p, [k]: val } : p)));

  async function downloadPdf() {
    setPdfBusy(true);
    setPdfErr("");
    try {
      await printPnrSlip(d, pax);
    } catch {
      setPdfErr("PDF नहीं बन पाया। दोबारा कोशिश कीजिए।");
    } finally {
      setPdfBusy(false);
    }
  }

  const banner =
    d.tone === "confirmed"
      ? "from-emerald-600 to-green-500"
      : d.tone === "rac"
        ? "from-amber-500 to-orange-500"
        : d.tone === "waiting"
          ? "from-red-600 to-rose-500"
          : "from-slate-600 to-slate-500";

  async function copyPnr() {
    try {
      await navigator.clipboard.writeText(d.pnr);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  async function sharePnr() {
    const text = `PNR ${d.pnr} • ${d.trainNo} ${d.trainName} • ${d.headline}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-3">
      {/* status banner */}
      <div className={`overflow-hidden rounded-2xl bg-gradient-to-r ${banner} p-4 text-white shadow-lg`}>
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-full border-2 border-white/60 bg-white/20">
            <Check className="size-6" />
          </span>
          <div className="flex-1">
            <p className="text-[17px] font-extrabold leading-tight">{d.headline}</p>
            <p className="text-[11px] opacity-90">
              PNR {d.pnr}
              {d.chartPrepared ? " • चार्ट तैयार" : " • चार्ट अभी नहीं बना"}
            </p>
          </div>
        </div>
      </div>

      {/* journey summary */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
          <p className="text-[14px] font-extrabold text-foreground">{d.trainName}</p>
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-extrabold text-primary-foreground">
            {d.trainNo}
          </span>
        </div>
        <div className="flex items-center gap-2 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-[18px] font-extrabold leading-tight text-foreground">{d.fromCode}</p>
            <p className="truncate text-[11px] text-muted-foreground">{d.fromName || "Boarding"}</p>
          </div>
          <div className="flex flex-col items-center px-1 text-muted-foreground">
            <TrainFront className="size-4 text-primary" />
            <div className="my-1 h-px w-12 bg-border" />
            <span className="text-[10px] font-bold">{d.journeyDate}</span>
          </div>
          <div className="min-w-0 flex-1 text-right">
            <p className="text-[18px] font-extrabold leading-tight text-foreground">{d.toCode}</p>
            <p className="truncate text-[11px] text-muted-foreground">{d.toName || "Destination"}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border border-t border-border text-center">
          <Stat label="Class" value={CLASS_NAMES[d.travelClass] ?? d.travelClass ?? "-"} />
          <Stat label="Quota" value={d.quota || "-"} />
          <Stat label="Fare" value={d.fare ? `₹${d.fare}` : "-"} />
        </div>
      </div>

      {/* passengers */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <p className="border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
          Passenger Status
        </p>
        <div className="divide-y divide-border">
          {d.passengers.map((p) => {
            const cnf = /CNF|CONFIRM/i.test(p.current);
            const rac = /RAC/i.test(p.current);
            return (
              <div key={p.serial} className="flex items-center gap-3 p-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[12px] font-extrabold text-primary">
                  {p.serial}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-foreground">
                    Passenger {p.serial}
                    {p.berthType ? (
                      <span className="ml-1 text-[11px] font-medium text-muted-foreground">
                        • {p.berthType}
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[11px] text-muted-foreground">बुकिंग: {p.booking || "-"}</p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                      cnf
                        ? "bg-emerald-100 text-emerald-800"
                        : rac
                          ? "bg-amber-100 text-amber-800"
                          : "bg-red-100 text-red-700"
                    }`}
                  >
                    {p.current || "-"}
                  </span>
                  {(() => {
                    const pr = pnrPrediction(d, p.current, p.booking);
                    return pr ? (
                      <p className={`mt-0.5 text-[11px] font-extrabold ${chanceTone(pr)}`}>{pr.cnf}% Chance</p>
                    ) : null;
                  })()}
                  {p.coach || p.berth ? (
                    <p className="mt-0.5 text-[11px] font-bold text-foreground">
                      {p.coach} {p.berth}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
          {d.passengers.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">यात्री जानकारी उपलब्ध नहीं।</p>
          ) : null}
        </div>
      </div>

      <PnrInsights d={d} />

      {/* coach / berth cards */}
      {d.passengers.some((p) => p.coach) ? (
        <div className="grid grid-cols-3 gap-2">
          {d.passengers
            .filter((p) => p.coach)
            .slice(0, 6)
            .map((p) => (
              <div
                key={`c${p.serial}`}
                className="rounded-2xl border border-border bg-gradient-to-b from-card to-muted/40 p-3 text-center shadow-sm"
              >
                <p className="text-[10px] font-bold uppercase text-muted-foreground">Coach</p>
                <p className="text-[18px] font-extrabold text-foreground">{p.coach}</p>
                <p className="mt-1 text-[10px] font-bold uppercase text-muted-foreground">Seat</p>
                <p className="text-[15px] font-extrabold text-primary">{p.berth || "-"}</p>
              </div>
            ))}
        </div>
      ) : null}

      {d.passengers.length ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <p className="border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
            PDF के लिए यात्री का नाम (वैकल्पिक)
          </p>
          <div className="space-y-2 p-3">
            <p className="text-[11px] text-muted-foreground">
              रेलवे सुरक्षा कारणों से PNR में नाम नहीं भेजता। टिकट से देखकर भरें — खाली छोड़ने पर “Passenger 1” दिखेगा।
            </p>
            {d.passengers.map((p, i) => (
              <div key={p.serial} className="grid grid-cols-[1fr_56px_72px] gap-2">
                <input
                  value={pax[i]?.name ?? ""}
                  onChange={(e) => setPaxField(i, "name", e.target.value.slice(0, 40))}
                  placeholder={`यात्री ${p.serial} का नाम`}
                  className="h-10 rounded-lg border border-input bg-background px-2 text-[13px] text-foreground"
                />
                <input
                  value={pax[i]?.age ?? ""}
                  onChange={(e) => setPaxField(i, "age", e.target.value.replace(/\D/g, "").slice(0, 3))}
                  inputMode="numeric"
                  placeholder="उम्र"
                  className="h-10 rounded-lg border border-input bg-background px-2 text-[13px] text-foreground"
                />
                <select
                  value={pax[i]?.gender ?? ""}
                  onChange={(e) => setPaxField(i, "gender", e.target.value)}
                  className="h-10 rounded-lg border border-input bg-background px-1 text-[13px] text-foreground"
                >
                  <option value="">लिंग</option>
                  <option value="MALE">पुरुष</option>
                  <option value="FEMALE">महिला</option>
                  <option value="TRANSGENDER">अन्य</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Button className="h-12 w-full rounded-xl text-[15px] font-extrabold" disabled={pdfBusy} onClick={downloadPdf}>
        <Download className="mr-1.5 size-4" /> {pdfBusy ? "PDF बन रहा है..." : "Ticket PDF Download"}
      </Button>
      {pdfErr ? <ErrorNote text={pdfErr} /> : null}
      <div className="flex gap-2">
        <Button variant="outline" className="h-11 flex-1 rounded-xl font-bold" onClick={copyPnr}>
          <Copy className="mr-1.5 size-4" /> {copied ? "कॉपी हो गया" : "PNR कॉपी"}
        </Button>
        <Button variant="outline" className="h-11 flex-1 rounded-xl font-bold" onClick={sharePnr}>
          <Share2 className="mr-1.5 size-4" /> शेयर
        </Button>
      </div>
    </div>
  );
}

/* --------------------------- Live status -------------------------- */

function LiveScreen() {
  const liveFn = useServerFn(railLive);
  const [train, setTrain] = useState<TrainOption | null>(null);
  const [date, setDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<LiveStatus | null>(null);

  async function run() {
    if (!train) {
      setError("पहले ट्रेन चुनिए।");
      return;
    }
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await liveFn({ data: { trainNo: train.number, date: compact(date) } });
      if (res.success) setData(res.data);
      else setError(res.error);
    } catch {
      setError("नेटवर्क की दिक्कत है। दोबारा कोशिश कीजिए।");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2.5 rounded-2xl border border-border bg-card p-3">
        <TrainField label="Train" value={train} onChange={setTrain} />
        <DateField value={date} onChange={setDate} />
        <QuickDates value={date} onChange={setDate} withYesterday />
        <SubmitButton loading={loading} onClick={run} label="Check Live Status" />
      </div>
      {error ? <ErrorNote text={error} /> : null}
      {data && train ? (
        <>
          <InTrainToggle trainRunning={!data.terminated && /depart|running|crossed|left/i.test(data.message)} />
          <div className="flex justify-end">
            <Button size="sm" variant="outline" disabled={loading} onClick={run}>
              {loading ? "Refreshing…" : "↻ Refresh"}
            </Button>
          </div>
          <LiveResult d={data} name={train.name} />
        </>
      ) : null}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function LiveResult({ d, name }: { d: LiveStatus; name: string }) {
  return (
    <div className="space-y-3">
      {/* live train position card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-teal-900 to-cyan-800 p-4 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-10 -top-12 size-44 rounded-full bg-cyan-400/20 blur-2xl" />
        <div className="relative flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[16px] font-extrabold">{name || d.trainNo}</p>
            <p className="text-[11px] opacity-80">
              {d.trainNo} • {d.updatedAgo ? `अपडेट ${d.updatedAgo}` : "लाइव"}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold shadow ${
              d.onTime ? "bg-emerald-500 text-white" : "bg-amber-400 text-amber-950"
            }`}
          >
            {delayText(d.delayMin)}
          </span>
        </div>

        {/* 3D style track */}
        <div className="relative mt-5 h-16">
          <div className="absolute inset-x-0 top-9 h-2 rounded-full bg-white/15 shadow-inner" />
          <div
            className="absolute top-9 h-2 rounded-full bg-gradient-to-r from-cyan-300 to-emerald-300 shadow-[0_0_14px_rgba(103,232,249,0.8)]"
            style={{ width: `${Math.max(3, Math.min(100, d.progressPct))}%` }}
          />
          <div
            className="absolute top-0 -translate-x-1/2 transition-all duration-700"
            style={{ left: `${Math.max(5, Math.min(95, d.progressPct))}%` }}
          >
            <span className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-white to-slate-200 text-slate-900 shadow-[0_8px_18px_rgba(0,0,0,0.45)] ring-2 ring-cyan-300/70">
              <TrainFront className="size-6" />
            </span>
            <span className="mx-auto mt-1 block h-3 w-8 rounded-full bg-black/40 blur-[3px]" />
          </div>
          <span className="absolute left-0 top-[52px] text-[10px] font-bold opacity-80">
            {d.stops[0]?.code}
          </span>
          <span className="absolute right-0 top-[52px] text-[10px] font-bold opacity-80">
            {d.stops[d.stops.length - 1]?.code}
          </span>
        </div>

        <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-[12px] font-semibold">
          {d.message || `ट्रेन अभी ${d.currentName} पर है`}
        </p>
      </div>

      {/* live metrics */}
      <div className="grid grid-cols-3 gap-2">
        <Metric icon={<Gauge className="size-4" />} label="औसत रफ़्तार" value={`${d.avgSpeedKmph || "-"} km/h`} />
        <Metric icon={<Navigation className="size-4" />} label="तय दूरी" value={`${d.coveredKm}/${d.totalKm} km`} />
        <Metric icon={<Clock className="size-4" />} label="स्थिति" value={d.onTime ? "Right Time" : `${d.delayMin} मि लेट`} />
      </div>

      {/* next station */}
      {d.nextCode ? (
        <div className="rounded-2xl border border-border bg-card p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            अगला स्टेशन
          </p>
          <div className="mt-1 flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-[12px] font-extrabold text-primary">
              {d.nextCode}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-extrabold text-foreground">{d.nextName}</p>
              <p className="text-[11px] text-muted-foreground">
                {d.distanceToNextKm} km बाकी
                {d.nextPlatform ? ` • प्लेटफॉर्म ${d.nextPlatform}` : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">पहुँचेगी</p>
              <p className="text-[16px] font-extrabold text-primary">{d.nextEta || "--"}</p>
              {d.nextSched && d.nextSched !== d.nextEta ? (
                <p className="text-[10px] text-muted-foreground line-through">{d.nextSched}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* route timeline */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <p className="border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground">
          पूरा रूट • {d.stops.length} स्टेशन
        </p>
        <div className="max-h-[460px] overflow-y-auto p-3">
          {d.stops.map((s, i) => {
            const isLast = i === d.stops.length - 1;
            const dotClass =
              s.state === "passed"
                ? "bg-emerald-500"
                : s.state === "current"
                  ? "bg-cyan-500 ring-4 ring-cyan-500/30 animate-pulse"
                  : "bg-muted-foreground/30";
            const late = s.delayMin > 5;
            return (
              <div key={`${s.code}-${i}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className={`mt-1.5 size-3 shrink-0 rounded-full ${dotClass}`} />
                  {!isLast ? (
                    <span
                      className={`w-0.5 flex-1 ${s.state === "passed" ? "bg-emerald-500/50" : "bg-border"}`}
                    />
                  ) : null}
                </div>
                <div className={`flex-1 ${isLast ? "pb-0" : "pb-4"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        className={`truncate text-[13px] font-bold ${
                          s.state === "current" ? "text-cyan-600" : "text-foreground"
                        }`}
                      >
                        {s.name}{" "}
                        <span className="text-[11px] font-medium text-muted-foreground">({s.code})</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {s.distanceKm} km • दिन {s.day}
                        {s.haltMin ? ` • हाल्ट ${s.haltMin} मि` : ""}
                        {s.platform ? ` • PF ${s.platform}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-[13px] font-extrabold ${late ? "text-amber-600" : "text-emerald-600"}`}>
                        {s.actualArr || s.actualDep || "--"}
                      </p>
                      {(s.schedArr || s.schedDep) &&
                      (s.actualArr || s.actualDep) !== (s.schedArr || s.schedDep) ? (
                        <p className="text-[10px] text-muted-foreground line-through">
                          {s.schedArr || s.schedDep}
                        </p>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">समय पर</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-2.5 text-center">
      <span className="mx-auto mb-1 flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </span>
      <p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="text-[13px] font-extrabold text-foreground">{value}</p>
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

/* --------------------------- Find trains -------------------------- */

function useStationPair() {
  const [from, setFrom] = useState<RailStation | null>(POPULAR_STATIONS[0] ?? null);
  const [to, setTo] = useState<RailStation | null>(null);
  const swap = () => {
    setFrom(to);
    setTo(from);
  };
  return { from, setFrom, to, setTo, swap };
}

function StationPairFields({ from, to, setFrom, setTo, swap }: ReturnType<typeof useStationPair>) {
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

function RouteTrainCard({
  t,
  onPick,
  expanded,
  children,
}: {
  t: RouteTrain;
  onPick?: () => void;
  expanded?: boolean;
  children?: React.ReactNode;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-[14px] font-extrabold text-foreground">{t.name}</p>
        <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-extrabold text-primary-foreground">
          {t.number}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <div>
          <p className="text-[16px] font-extrabold text-foreground">{t.departure}</p>
          <p className="text-[10px] text-muted-foreground">{t.fromCode}</p>
        </div>
        <div className="flex-1 text-center">
          <p className="text-[10px] font-bold text-muted-foreground">{t.duration}</p>
          <div className="my-0.5 h-px bg-border" />
          <p className="text-[10px] text-muted-foreground">{t.distanceKm} km</p>
        </div>
        <div className="text-right">
          <p className="text-[16px] font-extrabold text-foreground">{t.arrival}</p>
          <p className="text-[10px] text-muted-foreground">{t.toCode}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
          {t.type || "EXPRESS"}
        </span>
        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
          {t.runDays.length === 7 ? "रोज़" : t.runDays.join(", ")}
        </span>
        {t.pantry ? (
          <span className="flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
            <Utensils className="size-3" /> Pantry
          </span>
        ) : null}
        {onPick ? (
          <span className="ml-auto flex items-center gap-1 text-[11px] font-bold text-primary">
            {expanded ? "सीट छिपाएँ" : "सीट देखें"}
            <ChevronRight className={`size-3 transition-transform ${expanded ? "rotate-90" : ""}`} />
          </span>
        ) : null}
      </div>
    </>
  );

  if (!onPick) {
    return <div className="w-full rounded-2xl border border-border bg-card p-3 text-left shadow-sm">{body}</div>;
  }

  return (
    <div
      className={`overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition ${
        expanded ? "border-primary/60 ring-1 ring-primary/30" : "border-border"
      }`}
    >
      <button type="button" onClick={onPick} className="w-full p-3 text-left active:scale-[0.99]">
        {body}
      </button>
      {expanded ? <div className="border-t border-border bg-muted/30 p-3">{children}</div> : null}
    </div>
  );
}


function FindTrainsScreen() {
  const betweenFn = useServerFn(railBetween);
  const pair = useStationPair();
  const [date, setDate] = useState(new Date());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<RouteTrain[] | null>(null);

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
        data: { from: pair.from.code, to: pair.to.code, date: ymd(date) },
      });
      if (res.success) setRows(res.data ?? []);
      else setError(res.error);
    } catch {
      setError("नेटवर्क की दिक्कत है। दोबारा कोशिश कीजिए।");
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
            <p className="px-1 text-[12px] font-bold text-muted-foreground">{rows.length} ट्रेनें मिलीं</p>
            {rows.map((t) => (
              <RouteTrainCard key={t.number} t={t} />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

/* ------------------------- Seat availability ---------------------- */

function QuotaSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-1 items-center gap-1.5">
      <span className="text-[12px] font-bold text-muted-foreground">Quota:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-[13px] font-bold text-foreground"
      >
        {QUOTAS.map((q) => (
          <option key={q.code} value={q.code}>
            {q.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SevenDayTable({
  classes,
  rows,
  cls,
  onCls,
  busy,
}: {
  classes: string[];
  rows: ClassAvailability[];
  cls: string;
  onCls: (c: string) => void;
  busy: boolean;
}) {
  const current = rows.find((r) => r.cls === cls);
  const tone = (s: string) =>
    /^AVAILABLE|AVL/i.test(s)
      ? "border-emerald-400 bg-emerald-50 text-emerald-800"
      : /RAC/i.test(s)
        ? "border-amber-400 bg-amber-50 text-amber-800"
        : /WL/i.test(s)
          ? "border-red-300 bg-red-50 text-red-700"
          : "border-border bg-muted text-muted-foreground";
  const fmt = (d: string) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (!m) return d;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      weekday: "short",
    });
  };
  return (
    <div>
      <div className="mb-2 flex flex-wrap justify-center gap-1.5">
        {classes.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onCls(c)}
            className={`min-w-11 rounded-lg border px-3 py-1.5 text-[13px] font-bold transition ${
              c === cls ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      {!current ? (
        <p className="py-3 text-center text-[12px] text-muted-foreground">{busy ? "सीटें देखी जा रही हैं…" : ""}</p>
      ) : !current.ok || !current.days.length ? (
        <p className="rounded-xl bg-muted p-2.5 text-center text-[11px] font-semibold text-muted-foreground">
          {current.error || "इस क्लास में जानकारी नहीं मिली।"}
        </p>
      ) : (
      <div className="overflow-hidden rounded-xl border border-border bg-background">
        <p className="bg-muted py-1.5 text-center text-[12px] font-extrabold text-foreground">
          {CLASS_NAMES[current.cls] ?? current.cls} ({current.cls})
        </p>
        {current.days.map((d) => (
          <div key={d.date} className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
            <span className="text-[12px] font-semibold text-foreground">{fmt(d.date)}</span>
            <span className="flex flex-col items-end">
              <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${tone(d.status)}`}>{d.status || "-"}</span>
              {(() => {
                const wl = parseWl(d.status);
                if (!wl) return null;
                const pr = predict({ currentWl: wl.num, cls: current.cls, quota: wl.quota, daysLeft: daysUntil(parseJourneyDate(d.date)) });
                return (
                  <span className={`mt-0.5 text-[10px] font-extrabold ${chanceTone(pr)}`}>
                    CNF {pr.cnf}% • RAC {pr.rac}%
                  </span>
                );
              })()}
            </span>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

function SeatsScreen() {
  const betweenFn = useServerFn(railBetween);
  const searchFn = useServerFn(railTrainSearch);
  const availFn = useServerFn(railAvailability);
  const classesFn = useServerFn(railTrainClasses);
  const [classesFor, setClassesFor] = useState<Record<string, string[]>>({});

  const [mode, setMode] = useState<"stations" | "train">("stations");
  const pair = useStationPair();
  const [train, setTrain] = useState<TrainOption | null>(null);
  const [date, setDate] = useState(new Date());
  const [quota, setQuota] = useState("GN");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<RouteTrain[] | null>(null);
  const [openNo, setOpenNo] = useState<string | null>(null);
  const [availMap, setAvailMap] = useState<Record<string, ClassAvailability[]>>({});
  const [availError, setAvailError] = useState<Record<string, string>>({});
  const [busyNo, setBusyNo] = useState<string | null>(null);

  const [clsFor, setClsFor] = useState<Record<string, string>>({});

  const tatkalNote = tatkalWindowError(quota, ymd(date));

  function resetResults() {
    setRows(null);
    setOpenNo(null);
    setAvailMap({});
    setAvailError({});
  }

  async function searchTrains() {
    setError("");
    resetResults();
    setLoading(true);
    try {
      if (mode === "stations") {
        if (!pair.from || !pair.to) {
          setError("दोनों स्टेशन चुनिए।");
          return;
        }
        const res = await betweenFn({
          data: { from: pair.from.code, to: pair.to.code, date: ymd(date) },
        });
        if (res.success) setRows(res.data ?? []);
        else setError(res.error);
      } else {
        if (!train) {
          setError("पहले ट्रेन चुनिए।");
          return;
        }
        const res = await searchFn({ data: { q: train.number } });
        if (!res.success || !res.data?.length) {
          setError(res.error || "ट्रेन नहीं मिली।");
          return;
        }
        const t: TrainRecord = res.data[0]!;
        setRows([
          {
            number: t.number,
            name: t.name,
            fromCode: t.fromCode,
            fromName: t.fromName,
            toCode: t.toCode,
            toName: t.toName,
            departure: t.schedule[0]?.departure ?? "",
            arrival: t.schedule[t.schedule.length - 1]?.arrival ?? "",
            duration: "",
            distanceKm: t.schedule[t.schedule.length - 1]?.distanceKm ?? 0,
            runDays: [],
            type: t.type,
            pantry: false,
          },
        ]);
      }
    } catch {
      setError("नेटवर्क की दिक्कत है। दोबारा कोशिश कीजिए।");
    } finally {
      setLoading(false);
    }
  }

  const akey = (no: string, q: string) => `${no}|${q}|${ymd(date)}`;

  async function getClasses(t: RouteTrain): Promise<string[]> {
    if (classesFor[t.number]) return classesFor[t.number]!;
    let list = ["SL", "3A", "2A", "1A"];
    try {
      const res = await classesFn({ data: { trainNo: t.number } });
      if (res.success && res.data?.length) list = res.data;
    } catch {
      /* default */
    }
    const order = ["SL", "3A", "3E", "2A", "1A", "2S", "CC", "EC", "FC"];
    list = [...list].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    setClassesFor((m) => ({ ...m, [t.number]: list }));
    return list;
  }

  async function loadClass(t: RouteTrain, q: string, cls: string) {
    const key = akey(t.number, q);
    setClsFor((m) => ({ ...m, [t.number]: cls }));
    const windowErr = tatkalWindowError(q, ymd(date));
    if (windowErr) {
      setAvailError((m) => ({ ...m, [key]: windowErr }));
      return;
    }
    if (availMap[key]?.some((r) => r.cls === cls)) return;
    setBusyNo(t.number);
    setAvailError((m) => ({ ...m, [key]: "" }));
    try {
      const res = await availFn({
        data: { trainNo: t.number, from: t.fromCode, to: t.toCode, date: ymd(date), quota: q, classes: [cls] },
      });
      if (res.success) {
        setAvailMap((m) => ({
          ...m,
          [key]: [...(m[key] ?? []).filter((r) => r.cls !== cls), ...(res.data ?? [])],
        }));
      } else setAvailError((m) => ({ ...m, [key]: res.error }));
    } catch {
      setAvailError((m) => ({ ...m, [key]: "नेटवर्क की दिक्कत है। दोबारा कोशिश कीजिए।" }));
    } finally {
      setBusyNo(null);
    }
  }

  async function openTrain(t: RouteTrain, q: string) {
    const list = await getClasses(t);
    const cls = clsFor[t.number] && list.includes(clsFor[t.number]!) ? clsFor[t.number]! : list[0]!;
    await loadClass(t, q, cls);
  }

  function togglePick(t: RouteTrain) {
    if (openNo === t.number) {
      setOpenNo(null);
      return;
    }
    setOpenNo(t.number);
    void openTrain(t, quota);
  }

  function changeQuota(q: string) {
    setQuota(q);
    const open = rows?.find((r) => r.number === openNo);
    if (open) void openTrain(open, q);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2 rounded-xl bg-muted p-1">
        {(
          [
            ["stations", "स्टेशन से स्टेशन"],
            ["train", "ट्रेन नंबर से"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setMode(id);
              resetResults();
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

      {rows && rows.length === 0 ? (
        <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">कोई सीधी ट्रेन नहीं मिली।</p>
      ) : null}

      {rows && rows.length > 0 ? (
        <div className="space-y-2.5">
          <p className="px-1 text-[12px] font-bold text-muted-foreground">
            ट्रेन चुनिए — सीटें उसी कार्ड में खुलेंगी
          </p>
          {rows.map((t) => {
            const open = openNo === t.number;
            const avail = availMap[akey(t.number, quota)] ?? [];
            const aErr = availError[akey(t.number, quota)];
            const classes = classesFor[t.number];
            return (
              <RouteTrainCard key={t.number} t={t} expanded={open} onPick={() => togglePick(t)}>
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-lg border border-border bg-background px-2 py-1.5 text-[12px] font-bold text-foreground">
                    {prettyDate(date)}
                  </span>
                  <QuotaSelect value={quota} onChange={changeQuota} />
                  {busyNo === t.number ? <Loader2 className="size-4 animate-spin text-primary" /> : null}
                </div>
                {tatkalNote ? null : (
                  <p className="mb-2 text-center text-[10px] text-muted-foreground">चुनी तारीख से अगले 7 दिन</p>
                )}

                {aErr ? (
                  <p className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-[11px] font-bold text-amber-900">
                    {aErr}
                  </p>
                ) : classes ? (
                  <SevenDayTable
                    classes={classes}
                    rows={avail}
                    cls={clsFor[t.number] ?? classes[0] ?? ""}
                    busy={busyNo === t.number}
                    onCls={(c) => void loadClass(t, quota, c)}
                  />
                ) : (
                  <p className="py-3 text-center text-[12px] text-muted-foreground">सीटें देखी जा रही हैं…</p>
                )}
              </RouteTrainCard>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}


function ClassCard({ row }: { row: ClassAvailability }) {
  const first = row.days[0];
  const label = first?.label ?? "";
  const tone = /AVAILABLE/i.test(label)
    ? "bg-emerald-100 text-emerald-800"
    : /RAC/i.test(label)
      ? "bg-amber-100 text-amber-800"
      : /WAIT/i.test(label)
        ? "bg-red-100 text-red-700"
        : "bg-muted text-muted-foreground";

  return (
    <div className="rounded-xl border border-border bg-background p-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-extrabold text-foreground">{row.cls}</p>
        {first?.fare ? <p className="text-[12px] font-bold text-primary">₹{first.fare}</p> : null}
      </div>
      <p className="text-[10px] text-muted-foreground">{CLASS_NAMES[row.cls] ?? row.cls}</p>
      {row.ok && first ? (
        <>
          <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>
            {first.status}
          </span>
          {first.probability ? (
            <p className="mt-1 text-[10px] text-muted-foreground">
              कन्फर्म होने की संभावना {first.probability}%
            </p>
          ) : null}
        </>
      ) : (
        <span className="mt-1.5 inline-block rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
          उपलब्ध नहीं
        </span>
      )}
    </div>
  );
}

/* -------------------------- Live at station ----------------------- */

function StationScreen() {
  const boardFn = useServerFn(railStationBoard);
  const [station, setStation] = useState<RailStation | null>(POPULAR_STATIONS[0] ?? null);
  const [hours, setHours] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState<StationBoardTrain[] | null>(null);

  async function run() {
    if (!station) {
      setError("स्टेशन चुनिए।");
      return;
    }
    setLoading(true);
    setError("");
    setRows(null);
    try {
      const res = await boardFn({ data: { code: station.code, hours } });
      if (res.success) setRows(res.data ?? []);
      else setError(res.error);
    } catch {
      setError("नेटवर्क की दिक्कत है। दोबारा कोशिश कीजिए।");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2.5 rounded-2xl border border-border bg-card p-3">
        <StationField label="Select Station" value={station} onChange={setStation} />
        <div className="flex gap-2">
          {[2, 4, 8].map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHours(h)}
              className={`rounded-full px-3 py-1 text-[12px] font-bold transition ${
                hours === h ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              अगले {h} घंटे
            </button>
          ))}
        </div>
        <SubmitButton loading={loading} onClick={run} label="Get Live Status" />
      </div>
      {error ? <ErrorNote text={error} /> : null}

      {rows ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="bg-gradient-to-r from-rose-600 to-pink-500 p-3 text-white">
            <p className="text-[15px] font-extrabold">
              {station?.name} ({station?.code})
            </p>
            <p className="text-[11px] opacity-90">अगले {hours} घंटे में {rows.length} ट्रेनें</p>
          </div>
          <div className="divide-y divide-border">
            {rows.map((t, i) => (
              <div key={`${t.number}-${i}`} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-extrabold text-foreground">
                    <span className="mr-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary">
                      {t.number}
                    </span>
                    {t.name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{t.type}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-extrabold text-foreground">{t.arrival || "--"}</p>
                  <p className="text-[10px] text-muted-foreground">प्रस्थान {t.departure || "--"}</p>
                </div>
              </div>
            ))}
            {rows.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">इस समय कोई ट्रेन नहीं है।</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ----------------------------- Time table ------------------------- */

function ScheduleScreen() {
  const searchFn = useServerFn(railTrainSearch);
  const [train, setTrain] = useState<TrainOption | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [data, setData] = useState<TrainRecord | null>(null);

  async function run() {
    if (!train) {
      setError("पहले ट्रेन चुनिए।");
      return;
    }
    setLoading(true);
    setError("");
    setData(null);
    try {
      const res = await searchFn({ data: { q: train.number } });
      if (res.success && res.data?.length) setData(res.data[0]!);
      else setError(res.error || "ट्रेन नहीं मिली।");
    } catch {
      setError("नेटवर्क की दिक्कत है। दोबारा कोशिश कीजिए।");
    } finally {
      setLoading(false);
    }
  }

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
              {data.name} <span className="rounded bg-white/20 px-1.5 text-[12px]">{data.number}</span>
            </p>
            <p className="text-[11px] opacity-90">
              {data.fromName} → {data.toName}
              {data.classes.length ? ` • ${data.classes.join(", ")}` : ""}
            </p>
          </div>
          <div className="divide-y divide-border">
            {data.schedule.map((s, i) => (
              <div key={`${s.code}-${i}`} className="flex items-center gap-3 p-2.5">
                <span className="w-11 shrink-0 rounded-md bg-primary/10 py-1 text-center text-[10px] font-extrabold text-primary">
                  {s.code}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-foreground">{s.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {s.distanceKm} km • दिन {s.day}
                    {s.halt && s.halt !== "--" ? ` • हाल्ट ${s.halt}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[12px] font-extrabold text-foreground">{s.arrival || "--"}</p>
                  <p className="text-[11px] text-muted-foreground">{s.departure || "--"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
