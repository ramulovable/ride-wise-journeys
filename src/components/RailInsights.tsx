import { useState } from "react";
import { Clock, Lightbulb, Sparkles, TrainFront, TrendingUp } from "lucide-react";
import type { PnrStatus } from "@/lib/indianrail.functions";
import {
  ADVANCE_FEATURES_FREE,
  bookingTips,
  chartTime,
  daysUntil,
  fmtChart,
  parseJourneyDate,
  parseWl,
  predict,
  typicalRake,
  type Prediction,
} from "@/lib/rail-predict";

export function ProBadge() {
  return (
    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-extrabold text-primary-foreground">
      PRO{ADVANCE_FEATURES_FREE ? " • अभी फ्री" : ""}
    </span>
  );
}

export function chanceTone(p: Prediction) {
  return p.level === "high" ? "text-emerald-700" : p.level === "medium" ? "text-amber-700" : "text-red-600";
}

export function pnrPrediction(d: PnrStatus, current: string, booking: string): Prediction | null {
  const cur = parseWl(current);
  if (!cur) return null;
  const bk = parseWl(booking);
  return predict({
    currentWl: cur.num,
    bookingWl: bk?.num,
    cls: d.travelClass,
    quota: cur.quota || d.quota,
    daysLeft: daysUntil(parseJourneyDate(d.journeyDate)),
  });
}

export function PnrInsights({ d }: { d: PnrStatus }) {
  const [showTrend, setShowTrend] = useState(false);
  const [showRake, setShowRake] = useState(false);
  const journey = parseJourneyDate(d.journeyDate);
  const days = daysUntil(journey);
  const first = d.passengers[0];
  const pred = first ? pnrPrediction(d, first.current, first.booking) : null;
  const chart = chartTime(journey, d.departure);
  const cur = first ? parseWl(first.current) : null;
  const bk = first ? parseWl(first.booking) : null;
  const myCoaches = new Set(d.passengers.map((p) => p.coach).filter(Boolean));

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
          <p className="flex items-center gap-1.5 text-[12px] font-extrabold text-foreground">
            <Sparkles className="size-4 text-primary" /> Shahin Pro Insights
          </p>
          <ProBadge />
        </div>

        {pred ? (
          <div className="m-3 rounded-2xl bg-foreground p-4 text-center text-background">
            <p className="text-[11px] font-bold opacity-80">Confirmation Prediction Chances</p>
            <p className="mx-auto mt-2 inline-block rounded-xl bg-background px-5 py-2 text-[20px] font-extrabold">
              <span className={chanceTone(pred)}>{pred.cnf}% Chance</span>
            </p>
            <p className="mt-2 text-[11px] opacity-80">RAC की संभावना ~{pred.rac}% • अनुमान</p>
          </div>
        ) : !d.chartPrepared && d.tone === "confirmed" ? (
          <p className="p-3 text-[12px] font-semibold text-emerald-700">आपकी सीट कन्फर्म है — प्रेडिक्शन की ज़रूरत नहीं।</p>
        ) : null}

        <div className="grid grid-cols-2 gap-2 p-3 pt-0">
          <button
            type="button"
            onClick={() => setShowTrend((v) => !v)}
            className="rounded-xl border border-border bg-background p-3 text-center"
          >
            <TrendingUp className="mx-auto size-5 text-primary" />
            <p className="mt-1 text-[11px] text-muted-foreground">WL Trends</p>
            <p className="text-[12px] font-extrabold text-primary underline">Check WL Trends</p>
          </button>
          <div className="rounded-xl border border-border bg-background p-3 text-center">
            <Clock className="mx-auto size-5 text-primary" />
            <p className="mt-1 text-[11px] text-muted-foreground">Estimated Chart Preparation</p>
            <p className="text-[12px] font-extrabold text-foreground">
              {d.chartPrepared ? "चार्ट तैयार" : chart ? fmtChart(chart) : "-"}
            </p>
          </div>
        </div>

        {showTrend ? (
          <div className="space-y-2 border-t border-border p-3 text-[12px]">
            {cur && bk ? (
              <>
                <div className="flex items-center justify-between font-bold">
                  <span>बुकिंग WL {bk.num}</span>
                  <span>अभी WL {cur.num}</span>
                  <span>चार्ट पर ~{pred && pred.finalWlEstimate > 0 ? `WL ${pred.finalWlEstimate}` : "CNF/RAC"}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary"
                    style={{ width: `${Math.min(100, Math.round(((bk.num - cur.num) / Math.max(1, bk.num)) * 100))}%` }}
                  />
                </div>
                <p className="text-muted-foreground">
                  अब तक {Math.max(0, bk.num - cur.num)} वेटिंग आगे खिसकी ({Math.round(((bk.num - cur.num) / Math.max(1, bk.num)) * 100)}%)।
                  यात्रा में {days} दिन बाकी हैं — आमतौर पर आख़िरी 7 दिनों और चार्टिंग के समय सबसे ज़्यादा कैंसिलेशन होते हैं।
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">वेटिंग टिकट होने पर यहाँ मूवमेंट ट्रेंड दिखेगा।</p>
            )}
            {pred
              ? bookingTips(pred, days, cur?.quota ?? d.quota).map((t) => (
                  <p key={t} className="flex gap-1.5 text-foreground">
                    <Lightbulb className="size-4 shrink-0 text-amber-500" /> {t}
                  </p>
                ))
              : null}
            <p className="text-[10px] text-muted-foreground">
              प्रतिशत WL मूवमेंट, बचे दिन, कोटा और क्लास के आधार पर अनुमान है — रेलवे की गारंटी नहीं।
            </p>
          </div>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <button
          type="button"
          onClick={() => setShowRake((v) => !v)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-left"
        >
          <span className="flex items-center gap-1.5 text-[13px] font-extrabold text-foreground">
            <TrainFront className="size-4 text-primary" /> Coach Position / बोगी कहाँ है
          </span>
          <span className="text-[11px] font-bold text-primary">{showRake ? "बंद करें" : "देखें"}</span>
        </button>
        {showRake ? <CoachRack cls={d.travelClass} mine={myCoaches} /> : null}
      </div>
    </div>
  );
}

const KIND_LABEL: Record<string, string> = {
  loco: "इंजन", slr: "गार्ड/SLR", gen: "जनरल", "1A": "1A", "2A": "2A", "3A": "3A", "3E": "3E", SL: "Sleeper", pantry: "पैंट्री",
};

export function CoachRack({ cls, mine }: { cls?: string; mine?: Set<string> }) {
  const rake = typicalRake(cls);
  const counts = rake.reduce<Record<string, number>>((a, c) => ((a[c.kind] = (a[c.kind] ?? 0) + 1), a), {});
  return (
    <div className="border-t border-border p-3">
      <div className="flex gap-1 overflow-x-auto pb-2">
        {rake.map((c, i) => {
          const hit = mine?.has(c.code) || (!mine?.size && cls && c.kind === cls);
          return (
            <div
              key={`${c.code}${i}`}
              className={`flex min-w-[44px] flex-col items-center rounded-lg border px-1.5 py-2 text-[11px] font-extrabold ${
                hit
                  ? "border-primary bg-primary text-primary-foreground shadow-lg"
                  : c.kind === "loco"
                    ? "border-border bg-foreground text-background"
                    : "border-border bg-muted text-foreground"
              }`}
            >
              <span>{c.code}</span>
              <span className="text-[9px] font-semibold opacity-70">{i}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {Object.entries(counts).map(([k, n]) => (
          <span key={k} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-foreground">
            {KIND_LABEL[k] ?? k}: {n}
          </span>
        ))}
      </div>
      {mine?.size ? (
        <p className="mt-2 text-[12px] font-bold text-primary">आपकी बोगी: {[...mine].join(", ")}</p>
      ) : null}
      <p className="mt-1 text-[10px] text-muted-foreground">
        यह सामान्य रैक क्रम है; असली क्रम ट्रेन/दिन के हिसाब से बदल सकता है — प्लेटफ़ॉर्म के कोच डिस्प्ले से मिलान करें।
      </p>
    </div>
  );
}
