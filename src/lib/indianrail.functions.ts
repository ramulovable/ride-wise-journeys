import { createServerFn } from "@tanstack/react-start";

/**
 * Indian Railways data powered by RapidAPI.
 *  - NTES host  : live running status, train search + full schedule
 *  - IRCTC host : PNR status, trains between stations, seat availability, live at station
 * All handlers return a normalised, UI-ready shape so the client never parses provider JSON.
 */

/* ------------------------------------------------------------------ */
/* shared                                                              */
/* ------------------------------------------------------------------ */

type Res<T> = { success: boolean; data: T | null; error: string };

function fail<T>(error: string): Res<T> {
  return { success: false, data: null, error };
}
function ok<T>(data: T): Res<T> {
  return { success: true, data, error: "" };
}

/** Shown whenever the data provider is out of quota / misconfigured / down. Never names a provider. */
const INTERNAL_MSG = "आंतरिक त्रुटि — ट्रेन सेवा अभी उपलब्ध नहीं है। कृपया थोड़ी देर बाद दोबारा कोशिश करें।";
const QUOTA_MSG = INTERNAL_MSG;

/** Hide any provider / plan / quota wording from users. */
function clean(msg: string): string {
  const m = String(msg ?? "").trim();
  if (!m) return INTERNAL_MSG;
  if (/rapid|railkit|quota|limit|plan|subscri|exceed|api|key|unauthori|forbidden|timed? ?out|configur|upgrade/i.test(m)) {
    return INTERNAL_MSG;
  }
  return m;
}

function headers(host: string, key: string) {
  return { "x-rapidapi-key": key, "x-rapidapi-host": host };
}

async function getJson(host: string, path: string): Promise<{ json?: Record<string, unknown>; error?: string }> {
  const key = process.env["RAPIDAPI_KEY"];
  if (!key) return { error: INTERNAL_MSG };
  try {
    const r = await fetch(`https://${host}${path}`, { headers: headers(host, key) });
    const json = (await r.json()) as Record<string, unknown>;
    const msg = String(json["message"] ?? "");
    if (/exceeded|subscribe/i.test(msg)) return { error: QUOTA_MSG };
    if (r.status === 401 || r.status === 403 || r.status === 429 || r.status >= 500) return { error: QUOTA_MSG };
    return { json };
  } catch {
    return { error: INTERNAL_MSG };
  }
}

const ntesHost = () => process.env["RAPIDAPI_IRCTC_HOST"] ?? "indian-railway-irctc.p.rapidapi.com";
const irctcHost = () => process.env["RAPIDAPI_IRCTC1_HOST"] ?? "irctc1.p.rapidapi.com";

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
function str(o: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return "";
}

/* ------------------------------------------------------------------ */
/* RailKit — primary provider (RapidAPI stays as automatic backup)     */
/* ------------------------------------------------------------------ */

const RK_QUOTA_MSG = INTERNAL_MSG;

/** error = user-safe message; notFound = provider answered but had no record (do not fall back). */
type RkOut = { rows?: Record<string, unknown>[]; obj?: Record<string, unknown>; error?: string; notFound?: boolean };

async function railkit(fn: (sdk: typeof import("railkit")) => Promise<unknown>): Promise<RkOut> {
  const key = process.env["RAILKIT_API_KEY"];
  if (!key) return { error: "" };
  try {
    const sdk = await import("railkit");
    sdk.configure(key);
    const res = (await fn(sdk)) as Record<string, unknown> | null;
    if (!res || typeof res !== "object") return { error: "" };
    if ("success" in res && res["success"] !== true) {
      const e = String(res["error"] ?? "");
      if (/no .*found|not found|invalid pnr|flushed/i.test(e)) return { error: "", notFound: true };
      return { error: /limit|quota|exceed|key|inactive|timed out/i.test(e) ? RK_QUOTA_MSG : "" };
    }
    const payload = ("data" in res ? res["data"] : res) as unknown;
    if (Array.isArray(payload)) return { rows: payload as Record<string, unknown>[] };
    if (payload && typeof payload === "object") return { obj: payload as Record<string, unknown> };
    return { error: "" };
  } catch {
    return { error: "" };
  }
}

function sub(o: Record<string, unknown> | undefined, k: string): Record<string, unknown> {
  const v = o?.[k];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** "30 min" | "00:26" | "1 hr 5 min" | "On Time" → minutes */
function parseDelay(v: string): number {
  const s = String(v ?? "").trim();
  if (!s || /on ?time|right time/i.test(s)) return 0;
  const hm = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  const h = /(\d+)\s*h/i.exec(s);
  const m = /(\d+)\s*m/i.exec(s);
  if (h || m) return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  const n = Number(s.replace(/\D/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** YYYY-MM-DD → DD-MM-YYYY (RailKit date format). */
function dmy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : String(iso ?? "");
}

/** YYYYMMDD → DD-MM-YYYY */
function dmyCompact(c: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(c ?? ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
}

function pickRows(o: Record<string, unknown> | undefined, ...keys: string[]): Record<string, unknown>[] {
  if (!o) return [];
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return [];
}

function num(o: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = o[k];
    if (v !== undefined && v !== null && v !== "") {
      const n = Number(v);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

/** Normalise "14:25:00", "1425" or "14:25" to "14:25". */
function hhmm(v: string): string {
  const s = String(v ?? "").trim();
  const m = /^(\d{1,2}):?(\d{2})/.exec(s);
  if (!m) return "";
  return `${String(m[1]).padStart(2, "0")}:${m[2]}`;
}




/* ------------------------------------------------------------------ */
/* 1. Live running status                                              */
/* ------------------------------------------------------------------ */

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
  message: string;
  updatedAgo: string;
  terminated: boolean;
  currentCode: string;
  currentName: string;
  nextCode: string;
  nextName: string;
  nextEta: string;
  nextSched: string;
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

/** RailKit trackTrain → LiveStatus (uses `timeline` stoppages). */
function mapRkTimeline(o: Record<string, unknown>, trainNo: string): LiveStatus | null {
  const tl = pickRows(o, "timeline");
  const raw = tl.filter((t) => t["type"] === "stoppage");
  if (raw.length === 0) return null;
  const prog = sub(o, "progress");
  const completed = /complet/i.test(str(prog, "journeyStatus"));
  let currentIdx = raw.findIndex((s) => s["status"] === "current");
  if (currentIdx < 0) {
    const lastPassed = raw.map((s) => s["status"] === "passed").lastIndexOf(true);
    currentIdx = lastPassed >= 0 ? lastPassed : 0;
  }
  const terminated = completed || (currentIdx === raw.length - 1 && raw[currentIdx]?.["status"] === "passed");
  let day = 1;
  let prevDate = "";
  const stops: LiveStop[] = raw.map((s, i) => {
    const a = sub(s, "arrival");
    const d = sub(s, "departure");
    const sa = str(a, "scheduled");
    const sd = str(d, "scheduled");
    const dt = /\d{2}-[A-Za-z]{3}/.exec(sa + " " + sd)?.[0] ?? "";
    if (dt && prevDate && dt !== prevDate) day += 1;
    if (dt) prevDate = dt;
    const schedArr = hhmm(sa);
    const schedDep = hhmm(sd);
    const actualArr = hhmm(str(a, "actual"));
    const actualDep = hhmm(str(d, "actual"));
    const delayMin = parseDelay(str(a, "delay")) || parseDelay(str(d, "delay")) ||
      Math.max(0, diffMin(schedArr || schedDep, actualArr || actualDep));
    const haltMin = schedArr && schedDep ? Math.max(0, diffMin(schedArr, schedDep)) : 0;
    const st = String(s["status"] ?? "");
    return {
      code: str(s, "stationCode").toUpperCase(),
      name: str(s, "stationName"),
      serial: i + 1,
      day,
      distanceKm: num(s, "distanceKm"),
      haltMin,
      platform: str(s, "platform"),
      schedArr,
      schedDep,
      actualArr,
      actualDep,
      delayMin,
      state: terminated || st === "passed" || i < currentIdx ? "passed" : i === currentIdx ? "current" : "upcoming",
    };
  });
  const cur = stops[currentIdx] ?? stops[0]!;
  const nxt = !terminated && currentIdx + 1 < stops.length ? stops[currentIdx + 1] : undefined;
  const totalKm = num(o, "totalDistanceKm") || stops[stops.length - 1]!.distanceKm;
  const coveredKm = num(prog, "currentDistanceKm") || cur.distanceKm;
  const speed = num(o, "averageSpeedKmph");
  return {
    trainNo,
    message: stripTags(str(o, "statusNote")),
    updatedAgo: str(o, "lastUpdate"),
    terminated,
    currentCode: str(o, "currentStationCode").toUpperCase() || cur.code,
    currentName: cur.name,
    nextCode: nxt?.code ?? "",
    nextName: nxt?.name ?? "",
    nextEta: nxt ? nxt.actualArr || nxt.schedArr : "",
    nextSched: nxt?.schedArr ?? "",
    nextPlatform: nxt?.platform ?? "",
    distanceToNextKm: nxt ? Math.max(0, nxt.distanceKm - coveredKm) : 0,
    coveredKm,
    totalKm,
    progressPct: num(prog, "percent") || (totalKm > 0 ? Math.round((coveredKm / totalKm) * 100) : 0),
    avgSpeedKmph: speed > 0 && speed < 180 ? Math.round(speed) : 0,
    delayMin: cur.delayMin,
    onTime: cur.delayMin <= 5,
    stops,
  };
}

/** Build a LiveStatus from a RailKit tracking payload (field names vary, so alias widely). */
function mapRkLive(o: Record<string, unknown>, trainNo: string): LiveStatus | null {
  const viaTimeline = mapRkTimeline(o, trainNo);
  if (viaTimeline) return viaTimeline;
  const raw = pickRows(o, "stations", "route", "stationList", "stoppingStations", "schedule", "data");
  if (raw.length === 0) return null;

  const currentCode = str(o, "current_station", "currentStation", "currentStationCode", "last_station_code").toUpperCase();
  const terminated = o["terminated"] === true || /terminat|destination reached|journey completed/i.test(str(o, "status", "statusMessage", "train_status_message"));

  let currentIdx = raw.findIndex(
    (s) => str(s, "stationCode", "station_code", "code").toUpperCase() === currentCode,
  );
  if (currentIdx < 0) {
    const crossed = raw.map((s) => s["crossed"] === true || s["hasArrived"] === true || s["departed"] === true);
    const lastCrossed = crossed.lastIndexOf(true);
    currentIdx = lastCrossed >= 0 ? lastCrossed : terminated ? raw.length - 1 : 0;
  }

  const stops: LiveStop[] = raw.map((s, i) => {
    const schedArr = hhmm(str(s, "arrivalTime", "scheduled_arrival", "schArrivalTime", "sta", "arrival"));
    const schedDep = hhmm(str(s, "departureTime", "scheduled_departure", "schDepartureTime", "std", "departure"));
    const actualArr = hhmm(str(s, "actual_arrival_time", "actualArrival", "actArr", "eta"));
    const actualDep = hhmm(str(s, "actual_departure_time", "actualDeparture", "actDep", "etd"));
    const delayRaw = num(s, "delay", "delayArrival", "arrivalDelay", "delayInArrival");
    return {
      code: str(s, "stationCode", "station_code", "code").toUpperCase(),
      name: str(s, "stationName", "station_name", "name"),
      serial: num(s, "stnSerialNumber", "serial", "sno") || i + 1,
      day: num(s, "dayCount", "day") || 1,
      distanceKm: num(s, "distance", "distanceFromSource", "distance_from_source"),
      haltMin: num(s, "haltTime", "halt", "stopTime"),
      platform: str(s, "expected_platform", "platform", "platformNumber"),
      schedArr,
      schedDep,
      actualArr,
      actualDep,
      delayMin: delayRaw || diffMin(schedArr || schedDep, actualArr || actualDep),
      state: terminated || i < currentIdx ? "passed" : i === currentIdx ? "current" : "upcoming",
    };
  });

  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  const cur = stops[currentIdx] ?? first;
  const nxt = !terminated && currentIdx + 1 < stops.length ? stops[currentIdx + 1] : undefined;
  const totalKm = last.distanceKm || 0;
  const coveredKm = cur.distanceKm || 0;
  const speed = num(o, "speed", "averageSpeed", "avgSpeed");

  return {
    trainNo,
    message: stripTags(str(o, "status", "statusMessage", "train_status_message", "message")),
    updatedAgo: str(o, "updated_at", "lastUpdated", "time_of_availability", "updatedAt"),
    terminated,
    currentCode: cur.code,
    currentName: cur.name,
    nextCode: nxt?.code ?? "",
    nextName: nxt?.name ?? "",
    nextEta: nxt ? nxt.actualArr || nxt.schedArr : "",
    nextSched: nxt?.schedArr ?? "",
    nextPlatform: nxt?.platform ?? "",
    distanceToNextKm: nxt ? Math.max(0, nxt.distanceKm - coveredKm) : 0,
    coveredKm,
    totalKm,
    progressPct: totalKm > 0 ? Math.round((coveredKm / totalKm) * 100) : 0,
    avgSpeedKmph: speed > 0 && speed < 180 ? Math.round(speed) : 0,
    delayMin: cur.delayMin,
    onTime: cur.delayMin <= 5,
    stops,
  };
}

export const railLive = createServerFn({ method: "POST" })
  .inputValidator((input: { trainNo: string; date: string }) => ({
    trainNo: String(input.trainNo ?? "").replace(/\D/g, "").slice(0, 5),
    date: String(input.date ?? "").replace(/\D/g, "").slice(0, 8), // YYYYMMDD
  }))
  .handler(async ({ data }): Promise<Res<LiveStatus>> => {
    if (data.trainNo.length !== 5) return fail("ट्रेन नंबर 5 अंक का होना चाहिए।");
    if (data.date.length !== 8) return fail("यात्रा की तारीख चुनिए।");

    // RailKit first, RapidAPI as automatic backup.
    const rkDate = dmyCompact(data.date);
    const rk = await railkit((sdk) => sdk.trackTrain(data.trainNo, rkDate));
    if (rk.obj) {
      const mapped = mapRkLive(rk.obj, data.trainNo);
      if (mapped) return ok(mapped);
    }
    if (rk.notFound) return fail("इस तारीख के लिए लाइव जानकारी नहीं मिली।");

    const { json, error } = await getJson(
      ntesHost(),
      `/api/trains/v1/train/status?departure_date=${data.date}&isH5=true&client=web&train_number=${data.trainNo}`,
    );
    if (error || !json) return fail(INTERNAL_MSG);

    const status = (json["status"] ?? {}) as Record<string, unknown>;
    if (status["result"] !== "success" || !json["body"]) {
      const msg = (status["message"] ?? {}) as Record<string, unknown>;
      return fail(clean(String(msg["message"] ?? "इस तारीख के लिए लाइव जानकारी नहीं मिली।")));
    }
    const body = json["body"] as Record<string, unknown>;
    const raw = Array.isArray(body["stations"]) ? (body["stations"] as Record<string, unknown>[]) : [];
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
    const nxt = !terminated && currentIdx + 1 < stops.length ? stops[currentIdx + 1] : undefined;

    const totalKm = last.distanceKm || 0;
    const coveredKm = cur.distanceKm || 0;

    const startStamp = parseStamp(
      String(raw[0]?.["actual_departure_date"] ?? ""),
      first.actualDep || first.schedDep,
    );
    const nowStamp = parseStamp(
      String(raw[currentIdx]?.["actual_departure_date"] ?? raw[currentIdx]?.["actual_arrival_date"] ?? ""),
      cur.actualDep || cur.actualArr || cur.schedDep,
    );
    let avgSpeedKmph = 0;
    if (startStamp !== null && nowStamp !== null && nowStamp > startStamp && coveredKm > 0) {
      avgSpeedKmph = Math.round((coveredKm / (nowStamp - startStamp)) * 60);
    }
    if (avgSpeedKmph > 180 || avgSpeedKmph < 0) avgSpeedKmph = 0;

    return ok<LiveStatus>({
      trainNo: data.trainNo,
      message: stripTags(String(body["train_status_message"] ?? "")),
      updatedAgo: String(body["time_of_availability"] ?? ""),
      terminated,
      currentCode: cur.code,
      currentName: cur.name,
      nextCode: nxt?.code ?? "",
      nextName: nxt?.name ?? "",
      nextEta: nxt ? nxt.actualArr || nxt.schedArr : "",
      nextSched: nxt?.schedArr ?? "",
      nextPlatform: nxt?.platform ?? "",
      distanceToNextKm: nxt ? Math.max(0, nxt.distanceKm - coveredKm) : 0,
      coveredKm,
      totalKm,
      progressPct: totalKm > 0 ? Math.round((coveredKm / totalKm) * 100) : 0,
      avgSpeedKmph,
      delayMin: cur.delayMin,
      onTime: cur.delayMin <= 5,
      stops,
    });
  });

/* ------------------------------------------------------------------ */
/* 2. Train search + full schedule                                     */
/* ------------------------------------------------------------------ */

export type ScheduleStop = {
  code: string;
  name: string;
  arrival: string;
  departure: string;
  halt: string;
  distanceKm: number;
  day: number;
};

export type TrainRecord = {
  number: string;
  name: string;
  fromCode: string;
  fromName: string;
  toCode: string;
  toName: string;
  runningOn: string;
  classes: string[];
  type: string;
  schedule: ScheduleStop[];
};

function mapTrain(t: Record<string, unknown>): TrainRecord {
  const sched = Array.isArray(t["schedule"]) ? (t["schedule"] as Record<string, unknown>[]) : [];
  return {
    number: str(t, "trainNumber", "train_number"),
    name: str(t, "trainName", "train_name"),
    fromCode: str(t, "stationFrom", "src_stn_code"),
    fromName: str(t, "origin", "src_stn_name"),
    toCode: str(t, "stationTo", "dstn_stn_code"),
    toName: str(t, "destination", "dstn_stn_name"),
    runningOn: str(t, "runningOn"),
    classes: Array.isArray(t["journeyClasses"]) ? (t["journeyClasses"] as string[]).map(String) : [],
    type: str(t, "train_type", "trainType"),
    schedule: sched.map((s) => ({
      code: str(s, "stationCode"),
      name: str(s, "stationName"),
      arrival: str(s, "arrivalTime"),
      departure: str(s, "departureTime"),
      halt: str(s, "haltTime"),
      distanceKm: Number(s["distance"] ?? 0),
      day: Number(s["dayCount"] ?? 1),
    })),
  };
}

/** RailKit getTrainInfo → TrainRecord with full schedule. */
function mapRkTrainInfo(o: Record<string, unknown>): TrainRecord | null {
  const ti = sub(o, "trainInfo");
  const number = str(ti, "train_no");
  if (!number) return null;
  const rd = str(ti, "running_days");
  return {
    number,
    name: str(ti, "train_name"),
    fromCode: str(ti, "from_stn_code"),
    fromName: str(ti, "from_stn_name"),
    toCode: str(ti, "to_stn_code"),
    toName: str(ti, "to_stn_name"),
    runningOn: /^[01]{7}$/.test(rd) ? DAY_NAMES.filter((_, i) => rd[i] === "1").join(", ") : rd,
    classes: [],
    type: str(ti, "type"),
    schedule: pickRows(o, "route").map((s) => ({
      code: str(s, "stnCode"),
      name: str(s, "stnName"),
      arrival: str(s, "arrival"),
      departure: str(s, "departure"),
      halt: str(s, "halt"),
      distanceKm: num(s, "distance"),
      day: num(s, "day") || 1,
    })),
  };
}

export const railTrainSearch = createServerFn({ method: "POST" })
  .inputValidator((input: { q: string }) => ({ q: String(input.q ?? "").trim().slice(0, 40) }))
  .handler(async ({ data }): Promise<Res<TrainRecord[]>> => {
    if (data.q.length < 2) return fail("कम से कम 2 अक्षर लिखिए।");

    // RailKit first: exact number → full info; name → matches.
    if (/^\d{5}$/.test(data.q)) {
      const rk = await railkit((sdk) => sdk.getTrainInfo(data.q));
      const t = rk.obj ? mapRkTrainInfo(rk.obj) : null;
      if (t) return ok([t]);
    } else if (!/^\d+$/.test(data.q)) {
      const rk = await railkit((sdk) => sdk.trainsByName(data.q));
      const rows = rk.rows ?? pickRows(rk.obj, "trains");
      const list = rows
        .map((r) => ({
          number: str(r, "trainNo", "train_no"),
          name: str(r, "trainName", "train_name"),
          fromCode: "", fromName: "", toCode: "", toName: "",
          runningOn: "", classes: [], type: "", schedule: [],
        }))
        .filter((t) => t.number);
      if (list.length) return ok(list);
    }

    const { json, error } = await getJson(
      ntesHost(),
      `/api/trains-search/v1/train/${encodeURIComponent(data.q)}`,
    );
    if (error || !json) return fail(INTERNAL_MSG);
    const body = Array.isArray(json["body"]) ? (json["body"] as Record<string, unknown>[]) : [];
    const rows: Record<string, unknown>[] = [];
    for (const group of body) {
      if (Array.isArray(group["trains"])) rows.push(...(group["trains"] as Record<string, unknown>[]));
    }
    return ok(rows.map(mapTrain).filter((t) => t.number));
  });

/* ------------------------------------------------------------------ */
/* 3. PNR status                                                       */
/* ------------------------------------------------------------------ */

export type PnrPassenger = {
  serial: number;
  booking: string;
  current: string;
  coach: string;
  berth: string;
  berthType: string;
};

export type PnrStatus = {
  pnr: string;
  trainNo: string;
  trainName: string;
  journeyDate: string;
  fromCode: string;
  fromName: string;
  toCode: string;
  toName: string;
  boardingCode: string;
  boardingName: string;
  departure: string;
  arrival: string;
  travelClass: string;
  quota: string;
  chartPrepared: boolean;
  fare: string;
  headline: string;
  tone: "confirmed" | "rac" | "waiting" | "other";
  passengers: PnrPassenger[];
};

function berthType(s: string): string {
  const v = s.toUpperCase();
  const map: Record<string, string> = {
    LB: "Lower Berth",
    MB: "Middle Berth",
    UB: "Upper Berth",
    SL: "Side Lower",
    SU: "Side Upper",
    SM: "Side Middle",
    WS: "Window Side",
  };
  return map[v] ?? s;
}

function pnrTone(primary: string): { tone: PnrStatus["tone"]; headline: string } {
  const tone: PnrStatus["tone"] = /CNF|CONFIRM/i.test(primary)
    ? "confirmed"
    : /RAC/i.test(primary)
      ? "rac"
      : /WL/i.test(primary)
        ? "waiting"
        : "other";
  const headline =
    tone === "confirmed"
      ? "Confirmed — आपकी सीट पक्की है"
      : tone === "rac"
        ? "RAC — यात्रा कर सकते हैं, सीट साझा"
        : tone === "waiting"
          ? "Waiting List — सीट अभी पक्की नहीं"
          : primary || "स्थिति उपलब्ध";
  return { tone, headline };
}

/** "22 Aug 2026, 04:35:00 pm" → { date: "22 Aug 2026", time: "16:35" } */
function splitStamp(v: string): { date: string; time: string } {
  const s = String(v ?? "").trim();
  if (!s) return { date: "", time: "" };
  const [datePart, timePart = ""] = s.split(",").map((x) => x.trim());
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(timePart);
  if (!m) return { date: datePart ?? s, time: timePart };
  let h = Number(m[1]);
  const ap = (m[3] ?? "").toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return { date: datePart ?? "", time: `${String(h).padStart(2, "0")}:${m[2]}` };
}

function mapRkPnr(o: Record<string, unknown>, pnr: string): PnrStatus {
  const train = sub(o, "train");
  const j = sub(o, "journey");
  const src = sub(j, "source");
  const dst = sub(j, "destination");
  const brd = sub(j, "boardingPoint");
  const booking = sub(o, "booking");
  const dep = splitStamp(str(j, "dateOfJourney"));
  const arr = splitStamp(str(j, "arrivalDate"));
  const passengers: PnrPassenger[] = pickRows(o, "passengers").map((p, i) => {
    const b = sub(p, "booking");
    const c = sub(p, "current");
    const curStatus = str(c, "status") || str(b, "status");
    const coach = str(c, "coach") || str(b, "coach");
    const berthNo = str(c, "berthNo") || str(b, "berthNo");
    const serialRaw = str(p, "serialNumber").replace(/\D/g, "");
    return {
      serial: Number(serialRaw) || i + 1,
      booking: str(b, "details") || [str(b, "status"), str(b, "coach"), str(b, "berthNo")].filter(Boolean).join(" "),
      current: str(c, "details") || curStatus,
      coach: coach && coach !== "null" ? coach : "",
      berth: berthNo && berthNo !== "0" ? berthNo : "",
      berthType: berthType(str(c, "berthCode") || str(b, "berthCode")),
    };
  });
  const { tone, headline } = pnrTone(passengers[0]?.current ?? "");
  const chart = sub(o, "chart");
  const fare = num(booking, "fare", "ticketFare");
  return {
    pnr: str(o, "pnr") || pnr,
    trainNo: str(train, "number"),
    trainName: str(train, "name"),
    journeyDate: dep.date,
    fromCode: str(src, "code"),
    fromName: str(src, "name"),
    toCode: str(dst, "code"),
    toName: str(dst, "name"),
    boardingCode: str(brd, "code") || str(src, "code"),
    boardingName: str(brd, "name") || str(src, "name"),
    departure: dep.time,
    arrival: arr.time,
    travelClass: str(j, "class"),
    quota: str(j, "quota"),
    chartPrepared: /prepared/i.test(str(chart, "status")) && !/not/i.test(str(chart, "status")),
    fare: fare ? String(fare) : "",
    headline,
    tone,
    passengers,
  };
}


export const railPnr = createServerFn({ method: "POST" })
  .inputValidator((input: { pnr: string }) => ({ pnr: String(input.pnr ?? "").replace(/\D/g, "").slice(0, 10) }))
  .handler(async ({ data }): Promise<Res<PnrStatus>> => {
    if (data.pnr.length !== 10) return fail("PNR 10 अंक का होना चाहिए।");

    const rk = await railkit((sdk) => sdk.checkPNRStatus(data.pnr));
    if (rk.obj && (rk.obj["train"] || rk.obj["passengers"])) {
      return ok(mapRkPnr(rk.obj, data.pnr));
    }
    if (rk.notFound) return fail("यह PNR नहीं मिला। नंबर दोबारा जाँचिए।");

    const { json, error } = await getJson(irctcHost(), `/api/v3/getPNRStatus?pnrNumber=${data.pnr}`);
    if (error || !json) return fail(INTERNAL_MSG);
    if (json["status"] !== true || !json["data"]) {
      return fail(clean(String(json["message"] ?? "यह PNR नहीं मिला। नंबर दोबारा जाँचिए।")));
    }
    const d = json["data"] as Record<string, unknown>;
    const list = pickRows(d, "passengerList", "passengers");

    const passengers: PnrPassenger[] = list.map((p, i) => {
      const current = str(p, "currentStatus", "currentStatusNew", "bookingStatus");
      return {
        serial: Number(p["passengerSerialNumber"] ?? i + 1),
        booking: [str(p, "bookingStatus"), str(p, "bookingCoachId"), str(p, "bookingBerthNo")]
          .filter(Boolean)
          .join(" "),
        current,
        coach: str(p, "currentCoachId", "bookingCoachId"),
        berth: str(p, "currentBerthNo", "bookingBerthNo"),
        berthType: berthType(str(p, "currentBerthCode", "bookingBerthCode")),
      };
    });
    const { tone, headline } = pnrTone(passengers[0]?.current ?? "");

    return ok<PnrStatus>({
      pnr: data.pnr,
      trainNo: str(d, "trainNumber"),
      trainName: str(d, "trainName"),
      journeyDate: str(d, "dateOfJourney", "doj"),
      fromCode: str(d, "sourceStation", "boardingPoint"),
      fromName: str(d, "sourceStationName", "boardingStationName"),
      toCode: str(d, "destinationStation", "reservationUpto"),
      toName: str(d, "destinationStationName", "reservationUptoName"),
      boardingCode: str(d, "boardingPoint"),
      boardingName: str(d, "boardingStationName"),
      departure: str(d, "departureTime", "arrivalDate"),
      arrival: str(d, "arrivalTime"),
      travelClass: str(d, "journeyClass"),
      quota: str(d, "quota"),
      chartPrepared: d["chartStatus"] === "Chart Prepared" || d["chartPrepared"] === true,
      fare: str(d, "bookingFare", "ticketFare"),
      headline,
      tone,
      passengers,
    });
  });

/* ------------------------------------------------------------------ */
/* 4. Station search                                                   */
/* ------------------------------------------------------------------ */

export type StationRecord = { code: string; name: string; state: string };

export const railStations = createServerFn({ method: "POST" })
  .inputValidator((input: { q: string }) => ({ q: String(input.q ?? "").trim().slice(0, 40) }))
  .handler(async ({ data }): Promise<Res<StationRecord[]>> => {
    if (data.q.length < 2) return fail("कम से कम 2 अक्षर लिखिए।");

    const rk = await railkit((sdk) => sdk.stationsByName(data.q));
    const rkRows = rk.rows ?? pickRows(rk.obj, "stations", "data");
    if (rkRows.length) {
      return ok(
        rkRows
          .map((r) => ({
            code: str(r, "code", "stationCode", "station_code").toUpperCase(),
            name: str(r, "name", "eng_name", "stationName", "station_name"),
            state: str(r, "state", "state_name"),
          }))
          .filter((s) => s.code),
      );
    }

    const { json, error } = await getJson(
      irctcHost(),
      `/api/v1/searchStation?query=${encodeURIComponent(data.q)}`,
    );
    if (error || !json) return fail(INTERNAL_MSG);
    const rows = Array.isArray(json["data"]) ? (json["data"] as Record<string, unknown>[]) : [];
    return ok(
      rows
        .map((r) => ({
          code: str(r, "code").toUpperCase(),
          name: str(r, "eng_name", "name"),
          state: str(r, "state_name"),
        }))
        .filter((s) => s.code),
    );

  });

/* ------------------------------------------------------------------ */
/* 5. Trains between stations                                          */
/* ------------------------------------------------------------------ */

export type RouteTrain = {
  number: string;
  name: string;
  fromCode: string;
  fromName: string;
  toCode: string;
  toName: string;
  departure: string;
  arrival: string;
  duration: string;
  distanceKm: number;
  runDays: string[];
  type: string;
  pantry: boolean;
};

function mapRouteRow(t: Record<string, unknown>): RouteTrain {
  const days = t["run_days"] ?? t["runDays"] ?? t["running_days"];
  return {
    number: str(t, "train_number", "trainNumber", "number", "train_no", "trainNo"),
    name: str(t, "train_name", "trainName", "name"),
    fromCode: str(t, "from", "from_station_code", "fromStnCode", "source", "src_stn_code").toUpperCase(),
    fromName: str(t, "from_station_name", "fromStationName", "src_stn_name", "source_name"),
    toCode: str(t, "to", "to_station_code", "toStnCode", "destination", "dstn_stn_code").toUpperCase(),
    toName: str(t, "to_station_name", "toStationName", "dstn_stn_name", "destination_name"),
    departure: str(t, "from_std", "departureTime", "departure_time", "dep_time", "departure"),
    arrival: str(t, "to_sta", "arrivalTime", "arrival_time", "arr_time", "arrival"),
    duration: str(t, "duration", "travel_time", "travelTime"),
    distanceKm: Math.round(Number(t["distance"] ?? t["distanceKm"] ?? 0)),
    runDays: Array.isArray(days)
      ? (days as unknown[]).map(String)
      : typeof days === "string" && days
        ? days.split(/[,\s]+/).filter(Boolean)
        : [],
    type: str(t, "train_type", "trainType", "type"),
    pantry: t["has_pantry"] === true || t["pantry"] === true,
  };
}

export const railBetween = createServerFn({ method: "POST" })
  .inputValidator((input: { from: string; to: string; date: string }) => ({
    from: String(input.from ?? "").trim().toUpperCase().slice(0, 8),
    to: String(input.to ?? "").trim().toUpperCase().slice(0, 8),
    date: String(input.date ?? "").trim().slice(0, 10), // YYYY-MM-DD
  }))
  .handler(async ({ data }): Promise<Res<RouteTrain[]>> => {
    if (!data.from || !data.to) return fail("दोनों स्टेशन चुनिए।");

    const rk = await railkit((sdk) =>
      sdk.searchTrainBetweenStations(data.from, data.to, dmy(data.date) || undefined),
    );
    const rkRows = rk.rows ?? pickRows(rk.obj, "trains", "data");
    if (rkRows.length) {
      return ok(
        rkRows.map((t) => {
          const r = mapRouteRow(t);
          const rd = str(t, "running_days");
          return {
            ...r,
            fromCode: r.fromCode || str(t, "from_stn_code", "source_stn_code").toUpperCase() || data.from,
            fromName: r.fromName || str(t, "from_stn_name", "source_stn_name"),
            toCode: r.toCode || str(t, "to_stn_code", "dstn_stn_code").toUpperCase() || data.to,
            toName: r.toName || str(t, "to_stn_name", "dstn_stn_name"),
            departure: r.departure || str(t, "from_time"),
            arrival: r.arrival || str(t, "to_time"),
            runDays: /^[01]{7}$/.test(rd) ? DAY_NAMES.filter((_, i) => rd[i] === "1") : r.runDays,
          };
        }),
      );
    }
    if (rk.notFound) return fail("इन स्टेशनों के बीच कोई सीधी ट्रेन नहीं मिली।");

    const { json, error } = await getJson(
      irctcHost(),
      `/api/v3/trainBetweenStations?fromStationCode=${data.from}&toStationCode=${data.to}&dateOfJourney=${data.date}`,
    );
    if (error || !json) return fail(INTERNAL_MSG);
    if (json["status"] !== true) {
      return fail(clean(String(json["message"] ?? "कोई सीधी ट्रेन नहीं मिली।")));
    }
    const rows = Array.isArray(json["data"]) ? (json["data"] as Record<string, unknown>[]) : [];
    return ok(rows.map(mapRouteRow));

  });

/* ------------------------------------------------------------------ */
/* 6. Seat availability                                                */
/* ------------------------------------------------------------------ */

export type AvailabilityDay = {
  date: string;
  status: string;
  label: string;
  fare: number;
  probability: string;
};

export type ClassAvailability = {
  cls: string;
  ok: boolean;
  error: string;
  days: AvailabilityDay[];
};

const ALLOWED_CLASSES = ["1A", "2A", "3A", "3E", "SL", "2S", "CC", "EC", "FC"];

export const railAvailability = createServerFn({ method: "POST" })
  .inputValidator((input: {
    trainNo: string;
    from: string;
    to: string;
    date: string;
    quota: string;
    classes: string[];
  }) => ({
    trainNo: String(input.trainNo ?? "").replace(/\D/g, "").slice(0, 5),
    from: String(input.from ?? "").trim().toUpperCase().slice(0, 8),
    to: String(input.to ?? "").trim().toUpperCase().slice(0, 8),
    date: String(input.date ?? "").trim().slice(0, 10), // YYYY-MM-DD
    quota: String(input.quota ?? "GN").trim().toUpperCase().slice(0, 4),
    classes: (Array.isArray(input.classes) ? input.classes : [])
      .map((c) => String(c).trim().toUpperCase())
      .filter((c) => ALLOWED_CLASSES.includes(c))
      .slice(0, 8),
  }))
  .handler(async ({ data }): Promise<Res<ClassAvailability[]>> => {
    if (data.trainNo.length !== 5 || !data.from || !data.to || !data.date) {
      return fail("पूरी जानकारी भरिए।");
    }
    const tatkal = tatkalWindowError(data.quota, data.date);
    if (tatkal) return fail(tatkal);

    const list = data.classes.length ? data.classes : ["SL", "3A", "2A"];
    const rkQuota = ["GN", "LD", "SS", "TQ"].includes(data.quota);

    // Primary: RailRadar (all quotas, rolling multi-day calendar).
    const rrKey = process.env["RAILRADAR_API_KEY"];
    if (rrKey) {
      const rr = await Promise.all(
        list.map(async (cls): Promise<ClassAvailability | null> => {
          try {
            const r = await fetch(
              `https://api.railradar.in/v1/trains/${data.trainNo}/seats?from=${data.from}&to=${data.to}` +
                `&date=${data.date}&class=${cls}&quota=${data.quota}`,
              { headers: { Authorization: `Bearer ${rrKey}` } },
            );
            if (r.status === 401 || r.status === 403 || r.status === 429 || r.status >= 500) return null;
            const j = (await r.json()) as { success?: boolean; data?: { calendar?: Record<string, unknown>[] } };
            if (!j.success) return { cls, ok: false, error: "यह क्लास इस ट्रेन में उपलब्ध नहीं है।", days: [] };
            const cal = Array.isArray(j.data?.calendar) ? j.data!.calendar! : [];
            const days = cal.slice(0, 7).map((d) => {
              const s = str(d, "status");
              return { date: str(d, "date"), status: s, label: s, fare: 0, probability: "" };
            });
            return { cls, ok: days.length > 0, error: days.length ? "" : "जानकारी नहीं मिली।", days };
          } catch {
            return null;
          }
        }),
      );
      // Accept partial results: classes not offered in this quota/train are skipped.
      if (rr.every((x) => x) || rr.some((x) => x?.ok)) {
        const rows = rr
          .map((x, i) => x ?? { cls: list[i], ok: false, error: INTERNAL_MSG, days: [] })
          .filter((x) => x.ok || x.error !== "यह क्लास इस ट्रेन में उपलब्ध नहीं है।");
        if (rows.some((x) => x.ok)) return ok(rows);
        if (!["TQ", "PT"].includes(data.quota) || rr.every((x) => x)) return ok(rr as ClassAvailability[]);
      }
    }

    const results = await Promise.all(
      list.map(async (cls): Promise<ClassAvailability> => {
        if (rkQuota) {
          const rk = await railkit((sdk) =>
            sdk.getAvailability(data.trainNo, data.from, data.to, dmy(data.date), cls, data.quota),
          );
          const rkRows = rk.rows ?? pickRows(rk.obj, "availability", "avlDayList", "data");
          if (rkRows.length) {
            const fare = num(sub(rk.obj, "fare"), "totalFare");
            return {
              cls,
              ok: true,
              error: "",
              days: rkRows.slice(0, 6).map((r) => {
                const d = mapAvailabilityDay(r);
                return { ...d, fare: d.fare || fare };
              }),
            };
          }
          if (rk.notFound) return { cls, ok: false, error: "यह क्लास इस ट्रेन में उपलब्ध नहीं है।", days: [] };
        }

        const { json, error } = await getJson(
          irctcHost(),
          `/api/v1/checkSeatAvailability?classType=${cls}&fromStationCode=${data.from}` +
            `&quota=${data.quota}&toStationCode=${data.to}&trainNo=${data.trainNo}&date=${data.date}`,
        );
        if (error || !json || json["status"] !== true) {
          return {
            cls,
            ok: false,
            error: error ? INTERNAL_MSG : clean(String(json?.["message"] ?? "यह क्लास इस ट्रेन में उपलब्ध नहीं है।")),
            days: [],
          };
        }
        const rows = Array.isArray(json["data"]) ? (json["data"] as Record<string, unknown>[]) : [];
        return {
          cls,
          ok: rows.length > 0,
          error: rows.length ? "" : "इस क्लास/कोटा में जानकारी नहीं मिली।",
          days: rows.slice(0, 6).map(mapAvailabilityDay),
        };
      }),
    );
    return ok(results);
  });

function mapAvailabilityDay(r: Record<string, unknown>): AvailabilityDay {
  const pct = r["predictionPercentage"];
  return {
    date: str(r, "availablity_date", "availabilityDate", "date"),
    status: str(r, "availabilityText", "availablity_status", "availabilityStatus", "current_status", "status"),
    label: str(r, "availabilityText", "seat_avl_text", "availablity_status", "status", "text"),
    fare: Number(r["total_fare"] ?? r["ticket_fare"] ?? r["totalFare"] ?? r["fare"] ?? 0) || 0,
    probability:
      pct !== undefined && pct !== null && pct !== ""
        ? `${str(r, "prediction")} (${pct}%)`.trim()
        : str(r, "confirm_probability_percent", "confirmProbability", "prediction"),
  };
}

/**
 * Tatkal opens only one day before the journey (AC 10:00, Non-AC 11:00 IST).
 * Anything further out is outside the Tatkal window.
 */
export function tatkalWindowError(quota: string, isoDate: string): string {
  const q = String(quota ?? "").toUpperCase();
  if (q !== "TQ" && q !== "PT") return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? ""));
  if (!m) return "";
  const journey = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const istNow = new Date(Date.now() + 5.5 * 3600 * 1000);
  const today = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate());
  const days = Math.round((journey - today) / 86400000);
  if (days > 1) {
    return `तत्काल (${q === "PT" ? "Premium Tatkal" : "Tatkal"}) बुकिंग यात्रा से सिर्फ़ 1 दिन पहले खुलती है — AC सुबह 10:00 बजे, Non-AC सुबह 11:00 बजे। आपकी चुनी तारीख ${days} दिन आगे है, इसलिए अभी तत्काल सीट नहीं दिखाई जा सकती।`;
  }
  if (days < 0) return "बीती हुई तारीख के लिए तत्काल सीट नहीं देखी जा सकती।";
  return "";
}


/* ------------------------------------------------------------------ */
/* 7. Live at station                                                  */
/* ------------------------------------------------------------------ */

export type StationBoardTrain = {
  number: string;
  name: string;
  arrival: string;
  departure: string;
  type: string;
  classes: string[];
};

export const railStationBoard = createServerFn({ method: "POST" })
  .inputValidator((input: { code: string; hours: number }) => ({
    code: String(input.code ?? "").trim().toUpperCase().slice(0, 8),
    hours: Math.min(8, Math.max(1, Number(input.hours ?? 4))),
  }))
  .handler(async ({ data }): Promise<Res<StationBoardTrain[]>> => {
    if (!data.code) return fail("स्टेशन चुनिए।");

    const hrs = (data.hours <= 2 ? 2 : data.hours <= 4 ? 4 : 8) as 2 | 4 | 8;
    const rk = await railkit((sdk) => sdk.liveAtStation(data.code, hrs));
    const rkRows = rk.rows ?? pickRows(rk.obj, "trains", "data");
    if (rkRows.length) return ok(rkRows.map(mapBoardRow));

    const { json, error } = await getJson(
      irctcHost(),
      `/api/v3/getLiveStation?fromStationCode=${data.code}&toStationCode=${data.code}&hours=${data.hours}`,
    );
    if (error || !json) return fail(INTERNAL_MSG);
    const rows = Array.isArray(json["data"]) ? (json["data"] as Record<string, unknown>[]) : [];
    return ok(rows.map(mapBoardRow));
  });

function timeOf(t: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = t[k];
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      const s = str(o, "actual", "scheduled");
      if (s) return s;
    } else if (v !== undefined && v !== null && v !== "") return String(v);
  }
  return "";
}

function mapBoardRow(t: Record<string, unknown>): StationBoardTrain {
  const cls = t["classes"];
  return {
    number: str(t, "trainNo", "trainNumber", "train_number", "number"),
    name: str(t, "trainName", "train_name", "name"),
    arrival: timeOf(t, "arrival", "arrivalTime", "arrival_time", "sta"),
    departure: timeOf(t, "departure", "departureTime", "departure_time", "std"),
    type: str(t, "trainType", "train_type", "type"),
    classes: Array.isArray(cls)
      ? (cls as unknown[])
          .map((c) => (typeof c === "string" ? c : str(c as Record<string, unknown>, "value", "code", "class")))
          .filter(Boolean)
      : typeof cls === "string"
        ? cls.split(",").map((c) => c.trim()).filter(Boolean)
        : [],
  };
}

