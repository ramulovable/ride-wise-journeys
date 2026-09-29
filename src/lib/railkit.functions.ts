import { createServerFn } from "@tanstack/react-start";

type RailResult = { success: boolean; data?: unknown; error?: string };

async function rail<T>(fn: (sdk: typeof import("railkit")) => Promise<T>): Promise<RailResult> {
  const key = process.env["RAILKIT_API_KEY"];
  if (!key) return { success: false, error: "Train service abhi configure nahi hai." };
  try {
    const sdk = await import("railkit");
    sdk.configure(key);
    const res = (await fn(sdk)) as RailResult;
    if (res && typeof res === "object" && "success" in res) {
      return res.success
        ? { success: true, data: res.data }
        : { success: false, error: String(res.error ?? "Jaankari nahi mili.") };
    }
    return { success: true, data: res };
  } catch {
    return { success: false, error: "Train service abhi uplabdh nahi hai. Thodi der baad koshish kijiye." };
  }
}

export const railPnrStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { pnr: string }) => ({ pnr: String(input.pnr ?? "").replace(/\D/g, "") }))
  .handler(async ({ data }) => {
    if (data.pnr.length !== 10) return { success: false, error: "PNR 10 ank ka hona chahiye." };
    return rail((sdk) => sdk.checkPNRStatus(data.pnr));
  });

export const railLiveStatus = createServerFn({ method: "POST" })
  .inputValidator((input: { trainNo: string; date?: string }) => ({
    trainNo: String(input.trainNo ?? "").replace(/\D/g, ""),
    date: input.date ? String(input.date) : undefined,
  }))
  .handler(async ({ data }) => {
    if (data.trainNo.length !== 5) return { success: false, error: "Train number 5 ank ka hona chahiye." };
    return rail((sdk) => sdk.trackTrain(data.trainNo, data.date));
  });

export const railTrainInfo = createServerFn({ method: "POST" })
  .inputValidator((input: { trainNo: string }) => ({ trainNo: String(input.trainNo ?? "").replace(/\D/g, "") }))
  .handler(async ({ data }) => {
    if (data.trainNo.length !== 5) return { success: false, error: "Train number 5 ank ka hona chahiye." };
    return rail((sdk) => sdk.getTrainInfo(data.trainNo));
  });

export const railTrainsBetween = createServerFn({ method: "POST" })
  .inputValidator((input: { from: string; to: string; date?: string }) => ({
    from: String(input.from ?? "").trim().toUpperCase(),
    to: String(input.to ?? "").trim().toUpperCase(),
    date: input.date ? String(input.date) : undefined,
  }))
  .handler(async ({ data }) => {
    if (!data.from || !data.to) return { success: false, error: "Dono station chuniye." };
    return rail((sdk) => sdk.searchTrainBetweenStations(data.from, data.to, data.date));
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
      return { success: false, error: "Poori jaankari bhariye." };
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
    if (!data.station) return { success: false, error: "Station code daaliye." };
    return rail((sdk) => sdk.liveAtStation(data.station, 4));
  });

export const railStationSearch = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string }) => ({ name: String(input.name ?? "").trim() }))
  .handler(async ({ data }) => {
    if (data.name.length < 2) return { success: false, error: "Kam se kam 2 akshar likhiye." };
    return rail((sdk) => sdk.stationsByName(data.name));
  });

export const railTrainSearch = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string }) => ({ name: String(input.name ?? "").trim() }))
  .handler(async ({ data }) => {
    if (data.name.length < 2) return { success: false, error: "Kam se kam 2 akshar likhiye." };
    return rail((sdk) => sdk.trainsByName(data.name));
  });
