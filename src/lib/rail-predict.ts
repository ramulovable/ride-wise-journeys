/**
 * Shahin Pro — railway confirmation estimates.
 * Pure, deterministic heuristics (no historical database): uses WL movement,
 * days left, quota type and class size. Always shown as "अनुमान" (estimate).
 */

export const ADVANCE_FEATURES_FREE = true; // flip later when subscription goes live

const CLASS_K: Record<string, number> = {
  SL: 60, "3A": 40, "3E": 30, "2A": 20, "1A": 8, CC: 40, "2S": 80, EC: 10, FC: 8,
};
const QUOTA_F: Record<string, number> = { GN: 1, RL: 0.5, PQ: 0.35, TQ: 0.3, CK: 0.3, RS: 0.4, NP: 0.6 };

export type WlInfo = { quota: string; num: number } | null;

/** "GNWL 34", "WL/34", "RLWL34/WL20", "RAC 5" → waiting number */
export function parseWl(s: string): WlInfo {
  const v = String(s ?? "").toUpperCase();
  const m = /([A-Z]{0,3})WL\s*\/?\s*(\d+)/.exec(v);
  if (m) return { quota: (m[1] || "GN").slice(0, 2), num: Number(m[2]) };
  return null;
}

export function parseJourneyDate(s: string, year = new Date().getFullYear()): Date | null {
  const v = String(s ?? "").trim();
  if (!v) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(v);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const t = Date.parse(/\d{4}/.test(v) ? v : `${v} ${year}`);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    // "Nov 10" without year that is already past → next year
    if (!/\d{4}/.test(v) && d.getTime() < Date.now() - 86400000 * 2) d.setFullYear(year + 1);
    return d;
  }
  return null;
}

export function daysUntil(d: Date | null): number {
  if (!d) return 7;
  const now = new Date();
  const a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const b = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(0, Math.round((b - a) / 86400000));
}

export type Prediction = {
  cnf: number; // % confirm
  rac: number; // % ends in RAC (not confirm)
  level: "high" | "medium" | "low";
  finalWlEstimate: number; // expected WL left at chart
};

export function predict(opts: {
  currentWl: number;
  bookingWl?: number;
  cls: string;
  quota: string;
  daysLeft: number;
}): Prediction {
  const k = CLASS_K[opts.cls.toUpperCase()] ?? 35;
  const q = QUOTA_F[opts.quota.toUpperCase().slice(0, 2)] ?? 0.8;
  const daysF = Math.min(1.3, 0.6 + opts.daysLeft / 30);
  const moved = opts.bookingWl && opts.bookingWl > opts.currentWl ? (opts.bookingWl - opts.currentWl) / opts.bookingWl : 0;
  const cap = k * q * daysF * (1 + 0.5 * moved);
  const curve = (c: number) => 100 / (1 + Math.pow(Math.max(0, opts.currentWl) / c, 2.2));
  const cnf = Math.round(Math.min(97, Math.max(3, curve(cap))));
  const racOrBetter = Math.round(Math.min(98, Math.max(cnf, curve(cap * 1.35))));
  const rac = Math.max(0, racOrBetter - cnf);
  return {
    cnf,
    rac,
    level: cnf >= 70 ? "high" : cnf >= 40 ? "medium" : "low",
    finalWlEstimate: Math.max(0, Math.round(opts.currentWl - cap)),
  };
}

/** Chart is prepared ~8 hours before the train departs. */
export function chartTime(journey: Date | null, departure: string): Date | null {
  if (!journey) return null;
  const m = /(\d{1,2}):(\d{2})/.exec(departure ?? "");
  const d = new Date(journey);
  d.setHours(m ? Number(m[1]) : 0, m ? Number(m[2]) : 0, 0, 0);
  return new Date(d.getTime() - 8 * 3600 * 1000);
}

export function fmtChart(d: Date): string {
  const day = d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
  return `${day} - ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Typical LHB/ICF rake order. Real order may differ — verify on platform display. */
export function typicalRake(highlightCls?: string): { code: string; kind: string }[] {
  const r: { code: string; kind: string }[] = [{ code: "ENG", kind: "loco" }, { code: "SLR", kind: "slr" }, { code: "GEN", kind: "gen" }, { code: "GEN", kind: "gen" }];
  r.push({ code: "H1", kind: "1A" }, { code: "A1", kind: "2A" }, { code: "A2", kind: "2A" });
  for (let i = 1; i <= 6; i++) r.push({ code: `B${i}`, kind: "3A" });
  if (highlightCls === "3E") for (let i = 1; i <= 2; i++) r.push({ code: `M${i}`, kind: "3E" });
  r.push({ code: "PC", kind: "pantry" });
  for (let i = 1; i <= 7; i++) r.push({ code: `S${i}`, kind: "SL" });
  r.push({ code: "GEN", kind: "gen" }, { code: "GEN", kind: "gen" }, { code: "SLR", kind: "slr" });
  return r;
}

export function bookingTips(p: Prediction, daysLeft: number, quota: string): string[] {
  const t: string[] = [];
  if (p.level === "low") {
    t.push("ओरिजिन (शुरुआती) स्टेशन से टिकट लें — GNWL जल्दी कन्फर्म होता है।");
    if (daysLeft <= 1) t.push("यात्रा से 1 दिन पहले Tatkal (AC 10:00, Non-AC 11:00) आज़माएँ।");
    t.push("दूसरी क्लास या आसपास की तारीख/दूसरी ट्रेन देखें।");
  } else if (p.level === "medium") {
    t.push("RAC मिलने की अच्छी संभावना है — बैकअप के लिए दूसरी ट्रेन देख कर रखें।");
  } else {
    t.push("कन्फर्म होने की अच्छी संभावना — चार्ट बनने तक PNR चेक करते रहें।");
  }
  if (/RL|PQ/.test(quota)) t.push("RLWL/PQWL धीरे खिसकते हैं — GNWL ज़्यादा भरोसेमंद होता है।");
  return t;
}
