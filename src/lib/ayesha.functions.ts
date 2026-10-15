import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { pnrLookup, liveLookup, railStations, railBetween, railAvailability } from "@/lib/indianrail.functions";

/**
 * Ayesha brain: Gemini is ALWAYS tried first. Groq is used only when Gemini
 * reports its quota is exhausted (HTTP 429), so one reply never mixes engines.
 */
const GEMINI_MODEL = "gemini-3.8-flash";
const GROQ_MODEL = "qwen/qwen3.8-27b";

const APP_GUIDE = `
SHAHIN TRAVELS APP GUIDE (Darbhanga, Bihar based ride + travel app):
- Login: Indian mobile number + OTP once, then a 4-digit PIN. One mobile = one account.
- Customers: bottom tabs "Ride", "My Bookings", "Wallet", "Travel", "Profile".
  * Ride: choose pickup and drop, pick vehicle (Bike, Scooty, E-Rickshaw, Auto, Car), see fare, book. Rides are paid in CASH to the driver.
  * My Bookings: ride history and live tracking; after a driver accepts, driver name, vehicle and call button show.
  * Wallet: referral rewards only.
  * Travel: Travel Desk (train PNR, live train status, train search), E-Ticket, Quotes Studio.
  * Profile: details, photo, language, Help & Support, referral code.
- Drivers: tabs "Home", "Bookings", "Other Services", "Profile".
  * Home: Go Online / Offline, ride alerts (accept/decline), Rescue and SOS.
  * Going online needs approval, not blocked, and a valid subscription or commission plan.
  * Profile: Ride Alert Setup, app version, Help & Support, vehicles, QR referral code.
- Fares are calculated by the server (day/night pricing) and fixed at booking.
`;

const Msg = z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) });

async function buildContext(
  supabase: any,
  userId: string,
  path: string,
  language: string,
) {
  const [{ data: profile }, { data: roles }, { data: rides }, { data: cats }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
    supabase
      .from("rides")
      .select("status, created_at, total_fare, distance_km, pickup_note")
      .or(`customer_id.eq.${userId},rider_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("vehicle_categories").select("name, seat_capacity").eq("is_active", true),
  ]);
  const name = profile?.full_name || "friend";
  const roleList = (roles ?? []).map((r: { role: string }) => r.role).join(", ") || "customer";
  const recent = (rides ?? [])
    .map(
      (r: any) =>
        `${r.status} ${r.total_fare ? "₹" + r.total_fare : ""} ${r.distance_km ? r.distance_km + "km" : ""} (${String(r.created_at).slice(0, 10)})`,
    )
    .join("; ");
  const vehicles = (cats ?? []).map((c: any) => c.name).join(", ");
  const now = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

  return `You are Ayesha, the warm Indian female AI assistant of Shahin Travels, sitting in the Shahin Travels studio. Use feminine Hindi verb forms ("sakti hoon", "karungi").
Sound like a real kind human: short, simple, spoken sentences (max 3-4 sentences per reply, no markdown, no lists, no emojis — your reply is read aloud).
Explain slowly, step by step. Address the user by their first name with "ji" now and then (not in every sentence) to sound personal and professional. If you did not understand the user, politely ask them to repeat or clarify.
Reply in the same language the user speaks (Hindi, Urdu, Maithili, Bhojpuri, English, Hinglish...). Default: simple Hindi in Roman script.
You can chat about anything general (knowledge, advice, travel info, festivals, motivation) like a friendly helper.
For Shahin Travels questions, use ONLY the data below. Never invent fares, ride status, train timings or seat availability.
YOU HAVE LIVE BACKEND ACCESS: the system checks PNR status (10-digit PNR), live train running status (5-digit train number), seat availability (train number + from + to station + date + class) and trains between two stations for you. Ask only for the missing details (e.g. "Apna 10 ankon ka PNR number bataiye", "Kis station se kis station tak?"). When a LIVE DATA block is present below, read it and tell the user the real result clearly — do NOT tell them to check it themselves. Only if LIVE DATA says it failed, apologise and suggest trying again shortly.
Flights and hotels: you do NOT have live flight or hotel data yet. Give general helpful guidance, but never invent prices, timings or availability; say live flight/hotel checking is coming soon.
When guiding, say the exact on-screen button/tab name so it gets highlighted. Never claim you clicked anything. Never ask for OTP or PIN.
Current IST time: ${now}. User: ${name}. Role(s): ${roleList}. Screen: ${path}. App language: ${language}.
Recent rides: ${recent || "none"}. Vehicle types: ${vehicles || "unknown"}.
${APP_GUIDE}`;
}

class QuotaError extends Error {}

type TravelIntent = {
  action: "seats" | "between" | "none";
  train: string;
  from: string;
  to: string;
  date: string;
  cls: string;
};

/** Reads the conversation and pulls out a railway query (Gemini first, Groq only on Gemini quota). */
async function extractIntent(msgs: z.infer<typeof Msg>[]): Promise<TravelIntent | null> {
  const todayIst = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
  const sys = `Extract an Indian railway query from the conversation. Today is ${todayIst} (IST).
Return ONLY compact JSON: {"action":"seats"|"between"|"none","train":"5-digit or empty","from":"station name or code","to":"station name or code","date":"YYYY-MM-DD or empty","cls":"SL|3A|2A|1A|CC|2S|3E or empty"}.
"seats" = user wants seat availability for a train. "between" = user wants trains between two stations. Otherwise "none". Resolve words like aaj/kal/parso to dates.`;
  const convo = msgs.slice(-6);
  let raw = "";
  try {
    raw = await callGemini(sys, convo);
  } catch (e) {
    if (!(e instanceof QuotaError)) return null;
    try {
      raw = await callGroq(sys, convo);
    } catch {
      return null;
    }
  }
  const m = /\{[\s\S]*\}/.exec(raw);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as TravelIntent;
  } catch {
    return null;
  }
}

async function stationCode(q: string): Promise<string> {
  const s = q.trim();
  if (/^[A-Za-z]{2,5}$/.test(s) && s === s.toUpperCase()) return s;
  const r: any = await railStations({ data: { q: s } });
  return r?.success && r.data?.[0]?.code ? String(r.data[0].code) : "";
}

const TRAVEL_WORDS = /seat|sit|berth|availab|khali|kaun.?si.?train|which train|trains? between|se .+ tak|ticket|station/i;

/** Detects PNR / train / seat / route questions and fetches real railway data. */
async function liveData(msgs: z.infer<typeof Msg>[]): Promise<string> {
  const userTurns = msgs.filter((m) => m.role === "user").slice(-2).reverse();
  const latest = userTurns[0]?.content ?? "";
  if (TRAVEL_WORDS.test(latest)) {
    const it = await extractIntent(msgs);
    const date = it?.date || new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
    if (it && it.action !== "none" && it.from && it.to) {
      const [from, to] = await Promise.all([stationCode(it.from), stationCode(it.to)]);
      if (!from || !to) return `Station not found for "${it.from}" or "${it.to}". Ask the user for the exact station name.`;
      if (it.action === "seats" && /^\d{5}$/.test(it.train)) {
        const r: any = await railAvailability({
          data: { trainNo: it.train, from, to, date, quota: "GN", classes: it.cls ? [it.cls] : ["SL", "3A", "2A"] },
        });
        return r.success
          ? `Seat availability train ${it.train} ${from}->${to} on ${date}: ${JSON.stringify(r.data).slice(0, 2500)}`
          : `Seat availability check failed: ${r.error}`;
      }
      const r: any = await railBetween({ data: { from, to, date } });
      if (!r.success) return `Trains between ${from} and ${to} check failed: ${r.error}`;
      const list = (r.data ?? []).slice(0, 8).map((t: any) => `${t.number} ${t.name} dep ${t.departure} arr ${t.arrival} (${t.duration})`);
      return `Trains between ${from} and ${to} on ${date}: ${list.join("; ") || "none found"}`;
    }
    if (it && it.action === "seats") return "User wants seat availability: ask for train number, from station, to station and date (only what is missing).";
    if (it && it.action === "between") return "User wants trains between stations: ask for from and to station (only what is missing).";
  }
  for (const m of userTurns) {
    const digits = m.content.replace(/[\s-]/g, "");
    const pnr = /(?<!\d)(\d{10})(?!\d)/.exec(digits)?.[1];
    if (pnr) {
      const r = await pnrLookup({ pnr });
      return r.success ? `PNR ${pnr}: ${JSON.stringify(r.data).slice(0, 2500)}` : `PNR ${pnr} check failed: ${r.error}`;
    }
    const train = /(?<!\d)(\d{5})(?!\d)/.exec(digits)?.[1];
    if (train) {
      const date = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10).replace(/-/g, "");
      const r = await liveLookup({ trainNo: train, date });
      if (!r.success) return `Live status for train ${train} today failed: ${r.error}`;
      const d: any = r.data;
      const brief = { ...d, stops: undefined, stations: undefined };
      return `Live status train ${train} (today): ${JSON.stringify(brief).slice(0, 2000)}`;
    }
  }
  return "";
}

async function callGemini(system: string, messages: z.infer<typeof Msg>[]) {
  const key = process.env["GEMINI_API_KEY"];
  if (!key) throw new QuotaError("no gemini key");
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: { maxOutputTokens: 600, temperature: 0.8 },
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      { method: "POST", headers: { "x-goog-api-key": key, "content-type": "application/json" }, body },
    );
    if (res.status === 429) throw new QuotaError("gemini quota");
    if (res.status >= 500) {
      await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
      continue;
    }
    const json: any = await res.json();
    if (!res.ok) throw new Error(json?.error?.message ?? `Gemini ${res.status}`);
    const text = (json?.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => p.text ?? "")
      .join("")
      .trim();
    if (text) return text;
    throw new Error("empty");
  }
  throw new QuotaError("gemini busy");
}

async function callGroq(system: string, messages: z.infer<typeof Msg>[]) {
  const key = process.env["GROQ_API_KEY"];
  if (!key) throw new Error("no groq key");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: "system", content: system }, ...messages],
      max_tokens: 800,
    }),
  });
  const json: any = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Groq ${res.status}`);
  return String(json?.choices?.[0]?.message?.content ?? "").trim();
}

export const askAyesha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        path: z.string().max(200),
        language: z.string().max(10),
        messages: z.array(Msg).min(1).max(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    let system = await buildContext(context.supabase, context.userId, data.path, data.language);
    const msgs = data.messages.slice(-16);
    const live = await liveData(msgs);
    if (live) system += `\n\nLIVE DATA (fetched just now from railway backend):\n${live}`;
    const checked = !!live;
    try {
      return { reply: await callGemini(system, msgs), engine: "gemini" as const, checked };
    } catch (e) {
      if (!(e instanceof QuotaError)) {
        console.error("Gemini failed", e);
        return {
          reply: "Maaf kijiye, abhi network thoda dheema hai. Kya aap apni baat ek baar phir se bol sakte hain?",
          engine: "none" as const,
          checked,
        };
      }
    }
    try {
      return { reply: await callGroq(system, msgs), engine: "groq" as const, checked };
    } catch (e) {
      console.error("Groq failed", e);
      return {
        reply: "Maaf kijiye, main abhi thodi busy hoon. Thodi der baad phir se poochhiye.",
        engine: "none" as const,
        checked,
      };
    }
  });

/** Speech-to-text via Groq Whisper (works inside the Android app where browser speech recognition doesn't). */
export const transcribeAyesha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ audio: z.string().max(4_000_000), mime: z.string().max(60) }).parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env["GROQ_API_KEY"];
    if (!key) return { text: "" };
    const bin = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
    const ext = data.mime.includes("mp4") ? "m4a" : data.mime.includes("ogg") ? "ogg" : "webm";
    const form = new FormData();
    form.append("file", new Blob([bin], { type: data.mime }), `speech.${ext}`);
    form.append("model", "whisper-large-v3-turbo");
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}` },
      body: form,
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error("Whisper failed", res.status, json);
      return { text: "" };
    }
    return { text: String(json?.text ?? "").trim() };
  });

/** Real voice audio (MP3) so speech plays on every phone, even without a Hindi voice pack. */
export const speakAyesha = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ text: z.string().min(1).max(3000) }).parse(d))
  .handler(async ({ data }) => {
    const key = process.env["LOVABLE_API_KEY"];
    if (!key) return { audio: "", error: "no key" };
    // Natural Indian female voice (Gemini "Kore"); returns a complete WAV file.
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.1-flash-tts-preview",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Ek garamjoshi bhari, muskurati hui young Indian ladki ki tarah, saaf Indian lehje me, aaram se aur natural tareeke se boliye (jaise ek pyari customer-care helper): ${data.text}`,
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } },
        },
      }),
    });
    if (!res.ok) {
      console.error("Ayesha TTS failed", res.status, await res.text().catch(() => ""));
      return { audio: "", mime: "", error: `tts ${res.status}` };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { audio: btoa(bin), mime: "audio/wav", error: null as string | null };
  });
