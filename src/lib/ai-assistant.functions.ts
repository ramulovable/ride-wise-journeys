import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const API = "https://api.liveavatar.com";
const AVATAR_ID = "10ba14ab-3911-4b89-8dfd-86b5ba25876f"; // Emma (Friendly)

function key() {
  const k = process.env["LIVEAVATAR_API_KEY"];
  if (!k) throw new Error("AI assistant is not configured yet.");
  return k;
}

async function la(path: string, init: RequestInit) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "X-API-KEY": key(), "content-type": "application/json", accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`LiveAvatar ${path} failed [${res.status}]: ${text}`);
    let msg = text;
    try {
      msg = JSON.parse(text)?.message ?? text;
    } catch {
      /* keep raw */
    }
    throw new Error(`AI assistant unavailable (${res.status}): ${String(msg).slice(0, 200)}`);
  }
  return JSON.parse(text);
}

const APP_GUIDE = `
SHAHIN TRAVELS APP GUIDE (Darbhanga, Bihar based ride + travel app):
- Login: Indian mobile number + OTP once, then a 4-digit PIN. One mobile = one account.
- Customers: bottom tabs "Ride", "My Bookings", "Wallet", "Travel", "Profile".
  * Ride tab: choose pickup and drop location, pick vehicle (bike/auto/e-rickshaw/car etc.), see fare, book. Rides are paid in CASH to the driver.
  * My Bookings: ride history and live ride tracking; after a driver accepts, the driver's name, vehicle and call button show.
  * Wallet: referral rewards only (not used to pay normal rides).
  * Travel: Travel Desk (train PNR, live train status, train search), E-Ticket (prepaid physical ride ticket), Quotes Studio (personal quote posters with photo).
  * Profile: edit details, photo, language, Help & Support, referral code.
- Drivers (riders): tabs "Home", "Bookings", "Other Services", "Profile".
  * Home: Go Online / Offline button, incoming ride alerts (accept/decline), Rescue and SOS buttons.
  * To go online a driver must be approved, not blocked, and have a valid subscription or commission plan.
  * Profile: Ride Alert Setup (notification permissions), app version, Help & Support, vehicles, QR referral code.
  * Other Services: Travel Desk, E-Ticket scanner, Quotes Studio.
- Fares are calculated by the server (day/night pricing) and fixed when the ride is booked.
- Support: Profile -> Help & Support, or WhatsApp support button.
`;

export const startAssistantSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ path: z.string().max(200), language: z.string().max(10) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: roles }, { data: rides }, { data: cats }] =
      await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId),
        supabase
          .from("rides")
          .select("status, created_at")
          .or(`customer_id.eq.${userId},rider_id.eq.${userId}`)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase.from("vehicle_categories").select("name, seat_capacity").eq("is_active", true),
      ]);

    const name = (profile as { full_name?: string } | null)?.full_name || "friend";
    const roleList = (roles ?? []).map((r: { role: string }) => r.role).join(", ") || "customer";
    const recent = (rides ?? [])
      .map((r: { status: string; created_at: string }) => `${r.status} (${r.created_at.slice(0, 10)})`)
      .join("; ");
    const vehicles = (cats ?? [])
      .map((c: { name: string; seat_capacity: number | null }) => `${c.name} (${c.seat_capacity ?? "?"} seats)`)
      .join(", ");

    const prompt = `You are Ayesha, the warm, caring live video assistant of Shahin Travels. You are female; use feminine Hindi verb forms ("sakti hoon", "karungi").
Sound like a real, kind human on a video call — never robotic. Speak slowly and calmly, in short simple sentences, with natural pauses. Explain things step by step, one step at a time, and check if the user understood before moving on.
Be cheerful and expressive: smile while talking, and if the user says something funny, laugh naturally ("haha") and respond warmly before helping.
ALWAYS reply in the same language the user speaks (Hindi, Urdu, Maithili, Bhojpuri, English, Hinglish, Bengali etc.). Default to simple Hindi.
When guiding, say the exact on-screen button or tab name (e.g. "Ride", "My Bookings", "Wallet", "Travel", "Profile", "Help & Support", "Go Online") so it gets highlighted for the user. Never claim you clicked anything — the user taps it.
Never invent fares, ride status or policies. If unsure, tell them to use Profile -> Help & Support.
Never ask for OTP or PIN.

User: ${name}. Role(s): ${roleList}. Current screen: ${data.path}. App language: ${data.language}.
Recent rides: ${recent || "none"}.
Active vehicle types: ${vehicles || "unknown"}.
${APP_GUIDE}`;

    const ctx = await la("/v1/contexts", {
      method: "POST",
      body: JSON.stringify({
        name: `shahin-${userId.slice(0, 8)}-${Date.now()}`.slice(0, 64),
        prompt,
        opening_text: `Hello! Main Shahin Travels ki AI assistant Ayesha hoon. Ummid hai ki aap acche honge. Bataiye, main aapki kya help kar sakti hoon?`,
      }),
    });
    const contextId: string = ctx.data.id;

    try {
      const tok = await la("/v1/sessions/token", {
        method: "POST",
        body: JSON.stringify({
          mode: "FULL",
          avatar_id: AVATAR_ID,
          avatar_persona: { context_id: contextId, language: "multi" },
        }),
      });
      return { sessionToken: tok.data.session_token as string, contextId };
    } catch (e) {
      await la(`/v1/contexts/${contextId}`, { method: "DELETE" }).catch(() => null);
      throw e;
    }
  });

export const endAssistantSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ contextId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // Only delete contexts this app created for the caller.
    const ctx = await la(`/v1/contexts/${data.contextId}`, { method: "GET" }).catch(() => null);
    const name: string = ctx?.data?.name ?? "";
    if (name.startsWith(`shahin-${context.userId.slice(0, 8)}-`)) {
      await la(`/v1/contexts/${data.contextId}`, { method: "DELETE" }).catch(() => null);
    }
    return { ok: true };
  });
