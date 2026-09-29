import { useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
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
import {
  railLiveAtStation,
  railLiveStatus,
  railPnrStatus,
  railSeatAvailability,
  railTrainInfo,
  railTrainsBetween,
} from "@/lib/railkit.functions";

type ToolId = "pnr" | "live" | "between" | "seats" | "station" | "schedule";

const TOOLS: {
  id: ToolId;
  title: string;
  hindi: string;
  Icon: typeof Ticket;
  gradient: string;
}[] = [
  { id: "pnr", title: "PNR Status", hindi: "पीएनआर स्थिति", Icon: TicketCheck, gradient: "from-emerald-500 to-teal-600" },
  { id: "live", title: "Live Status", hindi: "ट्रेन कहाँ है", Icon: Gauge, gradient: "from-sky-500 to-blue-700" },
  { id: "between", title: "Find Trains", hindi: "स्टेशन से स्टेशन", Icon: Search, gradient: "from-violet-500 to-indigo-700" },
  { id: "seats", title: "Seat Availability", hindi: "सीट उपलब्धता", Icon: Sofa, gradient: "from-amber-500 to-orange-600" },
  { id: "station", title: "Live at Station", hindi: "स्टेशन पर ट्रेनें", Icon: MapPin, gradient: "from-rose-500 to-pink-600" },
  { id: "schedule", title: "Time Table", hindi: "ट्रेन शेड्यूल", Icon: CalendarDays, gradient: "from-cyan-500 to-emerald-600" },
];

function todayDDMMYYYY() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

export function TrainHub({ onClose }: { onClose: () => void }) {
  const [tool, setTool] = useState<ToolId | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="relative overflow-hidden bg-gradient-to-br from-primary to-emerald-700 px-4 pb-6 pt-4 text-primary-foreground">
        <div className="pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-16 left-10 size-40 rounded-full bg-white/5" />
        <div className="relative flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="-ml-2 min-h-9 min-w-9 rounded-full text-primary-foreground hover:bg-white/15"
            onClick={() => (tool ? setTool(null) : onClose())}
            aria-label="Back"
          >
            {tool ? <ArrowLeft className="size-5" /> : <X className="size-5" />}
          </Button>
          <div className="flex-1">
            <p className="flex items-center gap-1.5 text-base font-extrabold leading-tight">
              <TrainFront className="size-5" /> Indian Railways Hub
            </p>
            <p className="text-[11px] opacity-80">Shahin Travels • Live Railway Information</p>
          </div>
        </div>
      </header>

      <div className="-mt-4 flex-1 overflow-y-auto rounded-t-3xl bg-background px-4 pb-10 pt-4">
        {tool ? (
          <ToolPanel tool={tool} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {TOOLS.map(({ id, title, hindi, Icon, gradient }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTool(id)}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition active:scale-[0.98]"
                >
                  <span
                    className={`mb-2 flex size-11 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-md`}
                  >
                    <Icon className="size-5 text-white" />
                  </span>
                  <span className="block text-[13px] font-bold leading-tight text-foreground">
                    {title}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">{hindi}</span>
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/40 p-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-slate-500 to-slate-700 shadow-md">
                <Ticket className="size-5 text-white" />
              </span>
              <div className="flex-1">
                <p className="text-[13px] font-bold text-foreground">IRCTC Ticket Booking</p>
                <p className="text-[11px] text-muted-foreground">ट्रेन टिकट बुकिंग</p>
              </div>
              <span className="rounded-md border-2 border-destructive bg-destructive px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-destructive-foreground shadow-md">
                Coming Soon
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ToolPanel({ tool }: { tool: ToolId }) {
  const meta = TOOLS.find((t) => t.id === tool)!;
  const pnrFn = useServerFn(railPnrStatus);
  const liveFn = useServerFn(railLiveStatus);
  const betweenFn = useServerFn(railTrainsBetween);
  const seatsFn = useServerFn(railSeatAvailability);
  const stationFn = useServerFn(railLiveAtStation);
  const infoFn = useServerFn(railTrainInfo);

  const [fields, setFields] = useState<Record<string, string>>({ date: todayDDMMYYYY(), coach: "SL" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let res: { success: boolean; data?: unknown; error?: string };
      if (tool === "pnr") res = await pnrFn({ data: { pnr: fields["pnr"] ?? "" } });
      else if (tool === "live")
        res = await liveFn({ data: { trainNo: fields["trainNo"] ?? "", date: fields["date"] } });
      else if (tool === "between")
        res = await betweenFn({
          data: { from: fields["from"] ?? "", to: fields["to"] ?? "", date: fields["date"] },
        });
      else if (tool === "seats")
        res = await seatsFn({
          data: {
            trainNo: fields["trainNo"] ?? "",
            from: fields["from"] ?? "",
            to: fields["to"] ?? "",
            date: fields["date"] ?? "",
            coach: fields["coach"] ?? "SL",
            quota: "GN",
          },
        });
      else if (tool === "station") res = await stationFn({ data: { station: fields["from"] ?? "" } });
      else res = await infoFn({ data: { trainNo: fields["trainNo"] ?? "" } });

      if (res.success) setResult(res.data);
      else setError(res.error ?? "Jaankari nahi mili.");
    } catch {
      setError("Network problem. Dobara koshish kijiye.");
    } finally {
      setLoading(false);
    }
  }

  const inputs: { key: string; label: string; placeholder: string }[] =
    tool === "pnr"
      ? [{ key: "pnr", label: "PNR Number", placeholder: "10 ank ka PNR" }]
      : tool === "live"
        ? [
            { key: "trainNo", label: "Train Number", placeholder: "जैसे 12565" },
            { key: "date", label: "Date (DD-MM-YYYY)", placeholder: todayDDMMYYYY() },
          ]
        : tool === "between"
          ? [
              { key: "from", label: "From Station Code", placeholder: "DBG" },
              { key: "to", label: "To Station Code", placeholder: "NDLS" },
              { key: "date", label: "Date (DD-MM-YYYY)", placeholder: todayDDMMYYYY() },
            ]
          : tool === "seats"
            ? [
                { key: "trainNo", label: "Train Number", placeholder: "12565" },
                { key: "from", label: "From Code", placeholder: "DBG" },
                { key: "to", label: "To Code", placeholder: "NDLS" },
                { key: "date", label: "Date (DD-MM-YYYY)", placeholder: todayDDMMYYYY() },
                { key: "coach", label: "Class (SL/3A/2A/1A/CC)", placeholder: "SL" },
              ]
            : tool === "station"
              ? [{ key: "from", label: "Station Code", placeholder: "DBG" }]
              : [{ key: "trainNo", label: "Train Number", placeholder: "12565" }];

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${meta.gradient} shadow-md`}
        >
          <meta.Icon className="size-5 text-white" />
        </span>
        <div>
          <p className="text-sm font-bold text-foreground">{meta.title}</p>
          <p className="text-[11px] text-muted-foreground">{meta.hindi}</p>
        </div>
      </div>

      <div className="space-y-2.5 rounded-2xl border border-border bg-card p-3">
        {inputs.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">
              {f.label}
            </span>
            <Input
              value={fields[f.key] ?? ""}
              onChange={set(f.key)}
              placeholder={f.placeholder}
              className="h-11 rounded-xl"
              autoCapitalize="characters"
            />
          </label>
        ))}
        <Button className="h-11 w-full rounded-xl font-bold" onClick={run} disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : "Check करें"}
        </Button>
      </div>

      {error ? (
        <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}

      {result != null ? <ResultView data={result} /> : null}
    </div>
  );
}

function ResultView({ data }: { data: unknown }) {
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border bg-muted/50 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Result
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
    if (value.length === 0) return <p className="text-xs text-muted-foreground">Koi record nahi mila.</p>;
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
