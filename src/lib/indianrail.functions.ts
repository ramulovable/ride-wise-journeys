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

const QUOTA_MSG =
  "इस महीने की ट्रेन डेटा लिमिट पूरी हो गई है। RapidAPI पर प्लान अपग्रेड करने के बाद यह फिर चलने लगेगा।";

function headers(host: string, key: string) {
  return { "x-rapidapi-key": key, "x-rapidapi-host": host };
}

async function getJson(host: string, path: string): Promise<{ json?: Record<string, unknown>; error?: string }> {
  const key = process.env["RAPIDAPI_KEY"];
  if (!key) return { error: "ट्रेन सेवा अभी सेट नहीं है।" };
  try {
    const r = await fetch(`https://${host}${path}`, { headers: headers(host, key) });
    const json = (await r.json()) as Record<string, unknown>;
    const msg = String(json["message"] ?? "");
    if (/exceeded/i.test(msg)) return { error: QUOTA_MSG };
    if (r.status === 403 || r.status === 429) return { error: QUOTA_MSG };
    return { json };
  } catch {
    return { error: "ट्रेन सेवा अभी उपलब्ध नहीं है। थोड़ी देर बाद कोशिश कीजिए।" };
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

const RK_QUOTA_MSG =
  "RailKit की इस महीने की लिमिट पूरी हो गई है। प्लान बढ़ाने के बाद यह फिर चलने लगेगा।";

type RkOut = { rows?: Record<string, unknown>[]; obj?: Record<string, unknown>; error?: string };

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
      return { error: /limit exceeded|quota/i.test(e) ? RK_QUOTA_MSG : "" };
    }
    const payload = ("data" in res ? res["data"] : res) as unknown;
    if (Array.isArray(payload)) return { rows: payload as Record<string, unknown>[] };
    if (payload && typeof payload === "object") return { obj: payload as Record<string, unknown> };
    return { error: "" };
  } catch {
    return { error: "" };
  }
}

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

export const railLive = createServerFn({ method: "POST" })
  .inputValidator((input: { trainNo: string; date: string }) => ({
    trainNo: String(input.trainNo ?? "").replace(/\D/g, "").slice(0, 5),
    date: String(input.date ?? "").replace(/\D/g, "").slice(0, 8), // YYYYMMDD
  }))
  .handler(async ({ data }): Promise<Res<LiveStatus>> => {
    if (data.trainNo.length !== 5) return fail("ट्रेन नंबर 5 अंक का होना चाहिए।");
    if (data.date.length !== 8) return fail("यात्रा की तारीख चुनिए।");

    const { json, error } = await getJson(
      ntesHost(),
      `/api/trains/v1/train/status?departure_date=${data.date}&isH5=true&client=web&train_number=${data.trainNo}`,
    );
    if (error || !json) return fail(error ?? "जानकारी नहीं मिली।");

    const status = (json["status"] ?? {}) as Record<string, unknown>;
    if (status["result"] !== "success" || !json["body"]) {
      const msg = (status["message"] ?? {}) as Record<string, unknown>;
      return fail(String(msg["message"] ?? "इस तारीख के लिए लाइव जानकारी नहीं मिली।"));
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

export const railTrainSearch = createServerFn({ method: "POST" })
  .inputValidator((input: { q: string }) => ({ q: String(input.q ?? "").trim().slice(0, 40) }))
  .handler(async ({ data }): Promise<Res<TrainRecord[]>> => {
    if (data.q.length < 2) return fail("कम से कम 2 अक्षर लिखिए।");
    const { json, error } = await getJson(
      ntesHost(),
      `/api/trains-search/v1/train/${encodeURIComponent(data.q)}`,
    );
    if (error || !json) return fail(error ?? "जानकारी नहीं मिली।");
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

export const railPnr = createServerFn({ method: "POST" })
  .inputValidator((input: { pnr: string }) => ({ pnr: String(input.pnr ?? "").replace(/\D/g, "").slice(0, 10) }))
  .handler(async ({ data }): Promise<Res<PnrStatus>> => {
    if (data.pnr.length !== 10) return fail("PNR 10 अंक का होना चाहिए।");

    let d: Record<string, unknown> | undefined;
    let list: Record<string, unknown>[] = [];

    const rk = await railkit((sdk) => sdk.checkPNRStatus(data.pnr));
    if (rk.obj) {
      d = rk.obj;
      list = pickRows(rk.obj, "passengerList", "passengers", "passenger");
    }

    if (!d) {
      const { json, error } = await getJson(irctcHost(), `/api/v3/getPNRStatus?pnrNumber=${data.pnr}`);
      if (error || !json) return fail(rk.error || error || "जानकारी नहीं मिली।");
      if (json["status"] !== true || !json["data"]) {
        return fail(rk.error || String(json["message"] ?? "यह PNR नहीं मिला। नंबर दोबारा जाँचिए।"));
      }
      d = json["data"] as Record<string, unknown>;
      list = pickRows(d, "passengerList", "passengers");
    }


    const passengers: PnrPassenger[] = list.map((p, i) => {
      const current = str(p, "currentStatus", "currentStatusNew", "bookingStatus");
      const coach = str(p, "currentCoachId", "bookingCoachId");
      const berth = str(p, "currentBerthNo", "bookingBerthNo");
      return {
        serial: Number(p["passengerSerialNumber"] ?? i + 1),
        booking: [str(p, "bookingStatus"), str(p, "bookingCoachId"), str(p, "bookingBerthNo")]
          .filter(Boolean)
          .join(" "),
        current,
        coach,
        berth,
        berthType: berthType(str(p, "currentBerthCode", "bookingBerthCode")),
      };
    });

    const primary = passengers[0]?.current ?? "";
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
    if (error || !json) return fail(rk.error || error || "जानकारी नहीं मिली।");
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
    if (rkRows.length) return ok(rkRows.map(mapRouteRow));

    const { json, error } = await getJson(
      irctcHost(),
      `/api/v3/trainBetweenStations?fromStationCode=${data.from}&toStationCode=${data.to}&dateOfJourney=${data.date}`,
    );
    if (error || !json) return fail(rk.error || error || "जानकारी नहीं मिली।");
    if (json["status"] !== true) {
      return fail(rk.error || String(json["message"] ?? "कोई सीधी ट्रेन नहीं मिली।"));
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
    const out: ClassAvailability[] = [];

    for (const cls of list) {
      if (rkQuota) {
        const rk = await railkit((sdk) =>
          sdk.getAvailability(data.trainNo, data.from, data.to, dmy(data.date), cls, data.quota),
        );
        const rkRows = rk.rows ?? pickRows(rk.obj, "availability", "avlDayList", "data");
        if (rkRows.length) {
          out.push({
            cls,
            ok: true,
            error: "",
            days: rkRows.slice(0, 6).map(mapAvailabilityDay),
          });
          continue;
        }
      }

      const { json, error } = await getJson(
        irctcHost(),
        `/api/v1/checkSeatAvailability?classType=${cls}&fromStationCode=${data.from}` +
          `&quota=${data.quota}&toStationCode=${data.to}&trainNo=${data.trainNo}&date=${data.date}`,
      );
      if (error || !json || json["status"] !== true) {
        out.push({ cls, ok: false, error: error ?? String(json?.["message"] ?? "उपलब्ध नहीं"), days: [] });
        continue;
      }
      const rows = Array.isArray(json["data"]) ? (json["data"] as Record<string, unknown>[]) : [];
      out.push({
        cls,
        ok: rows.length > 0,
        error: rows.length ? "" : "इस क्लास/कोटा में जानकारी नहीं मिली।",
        days: rows.slice(0, 6).map(mapAvailabilityDay),
      });
    }
    return ok(out);
  });

function mapAvailabilityDay(r: Record<string, unknown>): AvailabilityDay {
  return {
    date: str(r, "availablity_date", "availabilityDate", "date", "avlDayList"),
    status: str(r, "availablity_status", "availabilityStatus", "current_status", "status", "avlDayStatus"),
    label: str(r, "seat_avl_text", "availablity_status", "status", "text"),
    fare: Number(r["total_fare"] ?? r["ticket_fare"] ?? r["totalFare"] ?? r["fare"] ?? 0),
    probability: str(r, "confirm_probability_percent", "confirmProbability", "prediction"),
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
    if (error || !json) return fail(rk.error || error || "जानकारी नहीं मिली।");
    const rows = Array.isArray(json["data"]) ? (json["data"] as Record<string, unknown>[]) : [];
    return ok(rows.map(mapBoardRow));
  });

function mapBoardRow(t: Record<string, unknown>): StationBoardTrain {
  const cls = t["classes"];
  return {
    number: str(t, "trainNumber", "train_number", "number"),
    name: str(t, "trainName", "train_name", "name"),
    arrival: str(t, "arrivalTime", "arrival_time", "sta", "arrival"),
    departure: str(t, "departureTime", "departure_time", "std", "departure"),
    type: str(t, "trainType", "train_type", "type"),
    classes: Array.isArray(cls)
      ? (cls as unknown[])
          .map((c) => (typeof c === "string" ? c : str(c as Record<string, unknown>, "value", "code", "class")))
          .filter(Boolean)
      : [],
  };
}

