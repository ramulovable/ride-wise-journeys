import { createServerFn } from "@tanstack/react-start";

/**
 * Live running status powered by the RapidAPI "Indian Railway IRCTC" service.
 * Returns a normalised, UI-ready shape so the client never parses raw provider JSON.
 */

export type LiveStop = {
  code: string;
  name: string;
  serial: number;
  day: number;
  distanceKm: number;
  haltMin: number;
  platform: string;
  schedArr: string;
  schedDep: string;
  actualArr: string;
  actualDep: string;
  delayMin: number;
  state: "passed" | "current" | "upcoming";
};

export type LiveStatus = {
  trainNo: string;
  date: string;
  message: string;
  updatedAgo: string;
  terminated: boolean;
  currentCode: string;
  currentName: string;
  nextCode: string;
  nextName: string;
  nextEta: string;
  nextPlatform: string;
  distanceToNextKm: number;
  coveredKm: number;
  totalKm: number;
  progressPct: number;
  avgSpeedKmph: number;
  delayMin: number;
  onTime: boolean;
  stops: LiveStop[];
};

type Res<T> = { success: boolean; data: T | null; error: string };

function fail<T>(error: string): Res<T> {
  return { success: false, data: null, error };
}

function toMin(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? "").trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function diffMin(scheduled: string, actual: string): number {
  const s = toMin(scheduled);
  const a = toMin(actual);
  if (s === null || a === null) return 0;
  let d = a - s;
  if (d > 720) d -= 1440;
  if (d < -720) d += 1440;
  return d;
}

function stripTags(s: string): string {
  return String(s ?? "").replace(/<[^>]*>/g, "").trim();
}

function parseStamp(date: string, time: string): number | null {
  const d = /^(\d{4})(\d{2})(\d{2})$/.exec(String(date ?? ""));
  const t = toMin(time);
  if (!d || t === null) return null;
  return Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3])) / 60000 + t;
}

type RawStation = Record<string, unknown>;

export const liveTrainStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { trainNo: string; date: string }) => ({
    trainNo: String(input.trainNo ?? "").replace(/\D/g, "").slice(0, 5),
    // expects YYYYMMDD
    date: String(input.date ?? "").replace(/\D/g, "").slice(0, 8),
  }))
  .handler(async ({ data }): Promise<Res<LiveStatus>> => {
    if (data.trainNo.length !== 5) return fail("ट्रेन नंबर 5 अंक का होना चाहिए।");
    if (data.date.length !== 8) return fail("यात्रा की तारीख चुनिए।");

    const key = process.env["RAPIDAPI_KEY"];
    const host = process.env["RAPIDAPI_IRCTC_HOST"] ?? "indian-railway-irctc.p.rapidapi.com";
    if (!key) return fail("ट्रेन सेवा अभी सेट नहीं है।");

    let body: Record<string, unknown>;
    try {
      const url =
        `https://${host}/api/trains/v1/train/status?departure_date=${data.date}` +
        `&isH5=true&client=web&train_number=${data.trainNo}`;
      const r = await fetch(url, {
        headers: { "x-rapidapi-key": key, "x-rapidapi-host": host },
      });
      const json = (await r.json()) as Record<string, unknown>;
      const status = (json["status"] ?? {}) as Record<string, unknown>;
      if (status["result"] !== "success" || !json["body"]) {
        const msg = (status["message"] ?? {}) as Record<string, unknown>;
        return fail(String(msg["message"] ?? "इस तारीख के लिए लाइव जानकारी नहीं मिली।"));
      }
      body = json["body"] as Record<string, unknown>;
    } catch {
      return fail("ट्रेन सेवा अभी उपलब्ध नहीं है। थोड़ी देर बाद कोशिश कीजिए।");
    }

    const raw = Array.isArray(body["stations"]) ? (body["stations"] as RawStation[]) : [];
    if (raw.length === 0) return fail("इस ट्रेन के लिए रूट नहीं मिला।");

    const currentCode = String(body["current_station"] ?? "").toUpperCase();
    const terminated = body["terminated"] === true;
    let currentIdx = raw.findIndex((s) => String(s["stationCode"] ?? "").toUpperCase() === currentCode);
    if (currentIdx < 0) currentIdx = terminated ? raw.length - 1 : 0;

    const stops: LiveStop[] = raw.map((s, i) => {
      const schedArr = String(s["arrivalTime"] ?? "");
      const actualArr = String(s["actual_arrival_time"] ?? "");
      const schedDep = String(s["departureTime"] ?? "");
      const actualDep = String(s["actual_departure_time"] ?? "");
      return {
        code: String(s["stationCode"] ?? "").toUpperCase(),
        name: String(s["stationName"] ?? ""),
        serial: Number(s["stnSerialNumber"] ?? i + 1),
        day: Number(s["dayCount"] ?? 1),
        distanceKm: Number(s["distance"] ?? 0),
        haltMin: Number(s["haltTime"] ?? 0),
        platform: s["expected_platform"] ? String(s["expected_platform"]) : "",
        schedArr,
        schedDep,
        actualArr,
        actualDep,
        delayMin: diffMin(schedArr || schedDep, actualArr || actualDep),
        state: terminated || i < currentIdx ? "passed" : i === currentIdx ? "current" : "upcoming",
      };
    });

    const first = stops[0]!;
    const last = stops[stops.length - 1]!;
    const cur = stops[currentIdx] ?? first;
    const next = stops[Math.min(currentIdx + 1, stops.length - 1)];
    const upcoming = terminated ? undefined : next && next !== cur ? next : undefined;

    const totalKm = last.distanceKm || 0;
    const coveredKm = cur.distanceKm || 0;

    const startStamp = parseStamp(String(raw[0]?.["actual_departure_date"] ?? ""), first.actualDep || first.schedDep);
    const nowStamp = parseStamp(
      String(raw[currentIdx]?.["actual_departure_date"] ?? raw[currentIdx]?.["actual_arrival_date"] ?? ""),
      cur.actualDep || cur.actualArr || cur.schedDep,
    );
    let avgSpeedKmph = 0;
    if (startStamp !== null && nowStamp !== null && nowStamp > startStamp && coveredKm > 0) {
      avgSpeedKmph = Math.round((coveredKm / (nowStamp - startStamp)) * 60);
    }
    if (avgSpeedKmph > 180 || avgSpeedKmph < 0) avgSpeedKmph = 0;

    const delayMin = cur.delayMin;

    return {
      success: true,
      error: "",
      data: {
        trainNo: data.trainNo,
        date: data.date,
        message: stripTags(String(body["train_status_message"] ?? "")),
        updatedAgo: String(body["time_of_availability"] ?? ""),
        terminated,
        currentCode: cur.code,
        currentName: cur.name,
        nextCode: upcoming?.code ?? "",
        nextName: upcoming?.name ?? "",
        nextEta: upcoming ? upcoming.actualArr || upcoming.schedArr : "",
        nextPlatform: upcoming?.platform ?? "",
        distanceToNextKm: upcoming ? Math.max(0, upcoming.distanceKm - coveredKm) : 0,
        coveredKm,
        totalKm,
        progressPct: totalKm > 0 ? Math.round((coveredKm / totalKm) * 100) : 0,
        avgSpeedKmph,
        delayMin,
        onTime: delayMin <= 5,
        stops,
      },
    };
  });
