import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Ayesha brain: Gemini is ALWAYS tried first. Groq is used only when Gemini
 * reports its quota is exhausted (HTTP 429), so one reply never mixes engines.
 */
const GEMINI_MODEL = "gemini-3.8-flash";
const GROQ_MODEL = "openai/gpt-oss-120b";

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
For Shahin Travels questions, use ONLY the data below. Never invent fares, ride status, train timings or seat availability; for live train/flight/hotel details guide the user to the "Travel" tab (Travel Desk) and say which button to tap.
When guiding, say the exact on-screen button/tab name so it gets highlighted. Never claim you clicked anything. Never ask for OTP or PIN.
Current IST time: ${now}. User: ${name}. Role(s): ${roleList}. Screen: ${path}. App language: ${language}.
Recent rides: ${recent || "none"}. Vehicle types: ${vehicles || "unknown"}.
${APP_GUIDE}`;
}

class QuotaError extends Error {}

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
  throw new Error("busy");
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
    const system = await buildContext(context.supabase, context.userId, data.path, data.language);
    const msgs = data.messages.slice(-16);
    try {
      return { reply: await callGemini(system, msgs), engine: "gemini" as const };
    } catch (e) {
      if (!(e instanceof QuotaError)) {
        console.error("Gemini failed", e);
        return {
          reply: "Maaf kijiye, abhi network thoda dheema hai. Kya aap apni baat ek baar phir se bol sakte hain?",
          engine: "none" as const,
        };
      }
    }
    try {
      return { reply: await callGroq(system, msgs), engine: "groq" as const };
    } catch (e) {
      console.error("Groq failed", e);
      return {
        reply: "Maaf kijiye, main abhi thodi busy hoon. Thodi der baad phir se poochhiye.",
        engine: "none" as const,
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
    const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini-tts",
        input: data.text,
        voice: "nova",
        response_format: "mp3",
        instructions:
          "Warm, friendly young Indian woman. Speak naturally and slowly in an Indian accent, like a kind customer-care helper.",
      }),
    });
    if (!res.ok) {
      console.error("Ayesha TTS failed", res.status, await res.text().catch(() => ""));
      return { audio: "", error: `tts ${res.status}` };
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { audio: btoa(bin), error: null as string | null };
  });
