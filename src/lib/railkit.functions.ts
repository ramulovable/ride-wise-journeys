import { createServerFn } from "@tanstack/react-start";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };
type RailResult = { success: boolean; data: Json; error: string };

function fail(error: string): RailResult {
  return { success: false, data: null, error };
}

async function rail<T>(fn: (sdk: typeof import("railkit")) => Promise<T>): Promise<RailResult> {
  const key = process.env["RAILKIT_API_KEY"];
  if (!key) return fail("Train service abhi configure nahi hai.");
  try {
    const sdk = await import("railkit");
    sdk.configure(key);
    const res = (await fn(sdk)) as { success?: boolean; data?: Json; error?: string } | null;
    if (res && typeof res === "object" && "success" in res) {
      return res.success
        ? { success: true, data: (res.data ?? null) as Json, error: "" }
        : fail(String(res.error ?? "Jaankari nahi mili."));
    }
    return { success: true, data: (res ?? null) as Json, error: "" };
  } catch {
    return fail("Train service abhi uplabdh nahi hai. Thodi der baad koshish kijiye.");
  }
}

export const railPnrStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { pnr: string }) => ({ pnr: String(input.pnr ?? "").replace(/\D/g, "") }))
  .handler(async ({ data }) => {
    if (data.pnr.length !== 10) return fail("PNR 10 ank ka hona chahiye.");
    return rail((sdk) => sdk.checkPNRStatus(data.pnr));
  });

export const railLiveStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { trainNo: string; date: string }) => ({
    trainNo: String(input.trainNo ?? "").replace(/\D/g, ""),
    date: input.date ? String(input.date) : "",
  }))
  .handler(async ({ data }) => {
    if (data.trainNo.length !== 5) return fail("Train number 5 ank ka hona chahiye.");
    return rail((sdk) => sdk.trackTrain(data.trainNo, data.date || undefined));
  });

export const railTrainInfo = createServerFn({ method: "POST" })
  .inputValidator((input: { trainNo: string }) => ({ trainNo: String(input.trainNo ?? "").replace(/\D/g, "") }))
  .handler(async ({ data }) => {
    if (data.trainNo.length !== 5) return fail("Train number 5 ank ka hona chahiye.");
    return rail((sdk) => sdk.getTrainInfo(data.trainNo));
  });

export const railTrainsBetween = createServerFn({ method: "POST" })
  .inputValidator((input: { from: string; to: string; date: string }) => ({
    from: String(input.from ?? "").trim().toUpperCase(),
    to: String(input.to ?? "").trim().toUpperCase(),
    date: input.date ? String(input.date) : "",
  }))
  .handler(async ({ data }) => {
    if (!data.from || !data.to) return fail("Dono station chuniye.");
    return rail((sdk) => sdk.searchTrainBetweenStations(data.from, data.to, data.date || undefined));
  });

export const railSeatAvailability = createServerFn({ method: "POST" })
  .inputValidator((input: {
    trainNo: string;
    from: string;
    to: string;
    date: string;
    coach: string;
    quota?: string;
  }) => ({
    trainNo: String(input.trainNo ?? "").replace(/\D/g, ""),
    from: String(input.from ?? "").trim().toUpperCase(),
    to: String(input.to ?? "").trim().toUpperCase(),
    date: String(input.date ?? "").trim(),
    coach: String(input.coach ?? "SL").trim().toUpperCase(),
    quota: String(input.quota ?? "GN").trim().toUpperCase(),
  }))
  .handler(async ({ data }) => {
    if (data.trainNo.length !== 5 || !data.from || !data.to || !data.date) {
      return fail("Poori jaankari bhariye.");
    }
    return rail((sdk) =>
      sdk.getAvailability(data.trainNo, data.from, data.to, data.date, data.coach, data.quota),
    );
  });

export const railLiveAtStation = createServerFn({ method: "POST" })
  .inputValidator((input: { station: string }) => ({
    station: String(input.station ?? "").trim().toUpperCase(),
  }))
  .handler(async ({ data }) => {
    if (!data.station) return fail("Station code daaliye.");
    return rail((sdk) => sdk.liveAtStation(data.station, 4));
  });

export const railStationSearch = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string }) => ({ name: String(input.name ?? "").trim() }))
  .handler(async ({ data }) => {
    if (data.name.length < 2) return fail("Kam se kam 2 akshar likhiye.");
    return rail((sdk) => sdk.stationsByName(data.name));
  });

export const railTrainSearch = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string }) => ({ name: String(input.name ?? "").trim() }))
  .handler(async ({ data }) => {
    if (data.name.length < 2) return fail("Kam se kam 2 akshar likhiye.");
    return rail((sdk) => sdk.trainsByName(data.name));
  });

/** Suggest trains by partial name or exact 5-digit number. */
export const railTrainSuggest = createServerFn({ method: "POST" })
  .inputValidator((input: { q: string }) => ({ q: String(input.q ?? "").trim() }))
  .handler(async ({ data }) => {
    const q = data.q;
    if (q.length < 2) return fail("Kam se kam 2 akshar likhiye.");
    if (/^\d+$/.test(q)) {
      if (q.length < 5) return { success: true, data: [], error: "" };
      return rail((sdk) => sdk.trainByNumber(q.slice(0, 5)));
    }
    return rail((sdk) => sdk.trainsByName(q));
  });

/** Seat availability for every class of one train in a single call. */
export const railSeatAvailabilityAll = createServerFn({ method: "POST" })
  .inputValidator((input: {
    trainNo: string;
    from: string;
    to: string;
    date: string;
    quota?: string;
    classes?: string[];
  }) => ({
    trainNo: String(input.trainNo ?? "").replace(/\D/g, ""),
    from: String(input.from ?? "").trim().toUpperCase(),
    to: String(input.to ?? "").trim().toUpperCase(),
    date: String(input.date ?? "").trim(),
    quota: String(input.quota ?? "GN").trim().toUpperCase(),
    classes: (Array.isArray(input.classes) ? input.classes : ["SL", "3A", "2A"])
      .map((c) => String(c).trim().toUpperCase())
      .filter((c) => ["1A", "2A", "3A", "3E", "SL", "2S", "CC", "EC"].includes(c))
      .slice(0, 8),
  }))
  .handler(async ({ data }) => {
    if (data.trainNo.length !== 5 || !data.from || !data.to || !data.date) {
      return fail("Poori jaankari bhariye.");
    }
    const list = data.classes.length ? data.classes : ["SL", "3A", "2A"];
    const results = await Promise.all(
      list.map(async (coach) => {
        const res = await rail((sdk) =>
          sdk.getAvailability(data.trainNo, data.from, data.to, data.date, coach, data.quota),
        );
        return { coach, success: res.success, data: res.data, error: res.error };
      }),
    );
    return { success: true, data: results as unknown as Json, error: "" };
  });
