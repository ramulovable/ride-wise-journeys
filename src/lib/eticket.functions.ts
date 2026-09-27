import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { calculateDrivingDistance } from "@/lib/api.functions";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

async function admin(): Promise<Any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as Any;
}

async function loadSettings(db: Any) {
  const { data } = await db.from("eticket_settings").select("*").limit(1).maybeSingle();
  return data as Any;
}

async function quote(db: Any, fromId: string, toId: string, passengers: number) {
  if (fromId === toId) throw new Error("Pickup and destination cannot be same.");
  const settings = await loadSettings(db);
  if (!settings?.is_enabled) throw new Error("E-Ticket service abhi band hai.");
  const route = await calculateDrivingDistance(fromId, toId);
  const [{ data: fares }, { data: cats }] = await Promise.all([
    db.from("eticket_fares").select("*").eq("is_active", true),
    db.from("vehicle_categories").select("id,name,seat_capacity,is_active").eq("is_active", true),
  ]);
  const options = (cats ?? [])
    .map((c: Any) => {
      const f = (fares ?? []).find((x: Any) => x.vehicle_category_id === c.id);
      if (!f) return null;
      const perSeat = Math.max(
        Number(f.min_fare),
        Math.round(Number(f.base_fare) + Number(f.per_km_rate) * route.distanceKm),
      );
      return {
        categoryId: c.id as string,
        name: c.name as string,
        seatCapacity: c.seat_capacity as number,
        fare: perSeat * passengers,
        available: passengers <= c.seat_capacity,
      };
    })
    .filter(Boolean) as Array<{ categoryId: string; name: string; seatCapacity: number; fare: number; available: boolean }>;
  return {
    distanceKm: route.distanceKm,
    durationMinutes: route.durationMinutes,
    options,
    insurance: settings.insurance_enabled
      ? {
          charge: Number(settings.insurance_charge),
          provider: settings.insurance_provider as string | null,
        }
      : null,
    settings,
  };
}

const quoteInput = z.object({
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  passengers: z.number().int().min(1).max(10),
});

export const getETicketQuote = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => quoteInput.parse(d))
  .handler(async ({ data }) => {
    const db = await admin();
    const q = await quote(db, data.fromLocationId, data.toLocationId, data.passengers);
    return { distanceKm: q.distanceKm, durationMinutes: q.durationMinutes, options: q.options, insurance: q.insurance };
  });

export const getETicketStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const s = await loadSettings(await admin());
    return { enabled: Boolean(s?.is_enabled) };
  });

function rzpAuth() {
  const id = process.env["RAZORPAY_KEY_ID"];
  const secret = process.env["RAZORPAY_KEY_SECRET"];
  if (!id || !secret) throw new Error("Online payment abhi configure nahi hai.");
  return { id, secret, header: "Basic " + btoa(`${id}:${secret}`) };
}

export const createETicketOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    quoteInput
      .extend({
        categoryId: z.string().uuid(),
        insurance: z.boolean(),
        passengerName: z.string().trim().min(2).max(80),
        pickupLandmark: z.string().trim().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const q = await quote(db, data.fromLocationId, data.toLocationId, data.passengers);
    const opt = q.options.find((o) => o.categoryId === data.categoryId);
    if (!opt || !opt.available) throw new Error("Yeh vehicle is route ke liye available nahi hai.");
    const insuranceCharge = data.insurance && q.insurance ? q.insurance.charge * data.passengers : 0;
    const total = opt.fare + insuranceCharge;
    if (total < 1) throw new Error("Fare set nahi hai. Admin se sampark karein.");
    const { data: profile } = await db.from("profiles").select("mobile").eq("id", context.userId).single();
    const { data: pnr, error: pnrErr } = await db.rpc("generate_eticket_pnr");
    if (pnrErr) throw new Error("PNR generate nahi hua.");
    const { data: ticket, error } = await db
      .from("etickets")
      .insert({
        pnr,
        customer_id: context.userId,
        passenger_name: data.passengerName,
        passenger_mobile: profile?.mobile ?? "",
        from_location_id: data.fromLocationId,
        to_location_id: data.toLocationId,
        vehicle_category_id: data.categoryId,
        passengers: data.passengers,
        pickup_landmark: data.pickupLandmark || null,
        distance_km: q.distanceKm,
        fare_amount: opt.fare,
        insurance_opted: insuranceCharge > 0,
        insurance_charge: insuranceCharge,
        total_amount: total,
        fare_snapshot: {
          vehicle: opt.name,
          distanceKm: q.distanceKm,
          fare: opt.fare,
          insuranceCharge,
          insuranceProvider: q.insurance?.provider ?? null,
          insurancePolicy: q.settings.insurance_policy_number ?? null,
          claimRules: q.settings.insurance_claim_rules ?? null,
        },
        payment_gateway: "razorpay",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const rzp = rzpAuth();
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: { Authorization: rzp.header, "Content-Type": "application/json" },
      body: JSON.stringify({ amount: Math.round(total * 100), currency: "INR", receipt: pnr, notes: { ticket_id: ticket.id } }),
    });
    if (!res.ok) {
      console.error("razorpay order", res.status, await res.text());
      throw new Error("Payment shuru nahi ho paya. Dobara koshish karein.");
    }
    const order = (await res.json()) as { id: string };
    await db.from("etickets").update({ payment_order_id: order.id }).eq("id", ticket.id);
    return { ticketId: ticket.id as string, orderId: order.id, amount: Math.round(total * 100), keyId: rzp.id, pnr, mobile: profile?.mobile ?? "" };
  });

async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const verifyETicketPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ ticketId: z.string().uuid(), orderId: z.string(), paymentId: z.string(), signature: z.string() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: t } = await db.from("etickets").select("id,customer_id,payment_order_id,payment_status").eq("id", data.ticketId).single();
    if (!t || t.customer_id !== context.userId || t.payment_order_id !== data.orderId) throw new Error("Ticket nahi mila.");
    if (t.payment_status === "PAID") return { ok: true };
    const expected = await hmacHex(rzpAuth().secret, `${data.orderId}|${data.paymentId}`);
    if (expected !== data.signature) {
      await db.from("etickets").update({ payment_status: "FAILED" }).eq("id", t.id);
      throw new Error("Payment verify nahi hua.");
    }
    await db
      .from("etickets")
      .update({ payment_status: "PAID", status: "ACTIVE", payment_id: data.paymentId, paid_at: new Date().toISOString() })
      .eq("id", t.id)
      .eq("payment_status", "PENDING");
    return { ok: true };
  });

const SELECT =
  "*, from:locations!etickets_from_location_id_fkey(name,area), to:locations!etickets_to_location_id_fkey(name,area), category:vehicle_categories(name)";

export const listMyETickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await (context.supabase as Any)
      .from("etickets")
      .select(SELECT)
      .or(`customer_id.eq.${context.userId},driver_id.eq.${context.userId}`)
      .neq("payment_status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []) as Any[];
  });

async function requireDriver(db: Any, userId: string) {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId).eq("role", "rider").maybeSingle();
  if (!data) throw new Error("Sirf driver ticket scan kar sakte hain.");
}

export const scanETicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ code: z.string().trim().min(6).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    await requireDriver(db, context.userId);
    const code = data.code.includes("/") ? data.code.split("/").pop()! : data.code;
    const col = /^[0-9a-f-]{36}$/i.test(code) ? "qr_token" : "pnr";
    const { data: t } = await db.from("etickets").select("*").eq(col, col === "pnr" ? code.toUpperCase() : code).maybeSingle();
    if (!t) throw new Error("Ticket nahi mila.");
    if (t.payment_status !== "PAID") throw new Error("Is ticket ka payment nahi hua hai.");
    if (t.status !== "ACTIVE" || t.scanned_at) throw new Error("Yeh ticket pehle hi use ho chuka hai.");
    const { data: vehicle } = await db
      .from("rider_vehicles")
      .select("id,vehicle_category_id")
      .eq("rider_id", context.userId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (vehicle && vehicle.vehicle_category_id !== t.vehicle_category_id) throw new Error("Yeh ticket dusre vehicle type ka hai.");
    const { data: updated } = await db
      .from("etickets")
      .update({ status: "IN_PROGRESS", driver_id: context.userId, vehicle_id: vehicle?.id ?? null, scanned_at: new Date().toISOString() })
      .eq("id", t.id)
      .eq("status", "ACTIVE")
      .is("scanned_at", null)
      .select("id")
      .maybeSingle();
    if (!updated) throw new Error("Yeh ticket pehle hi use ho chuka hai.");
    return { ticketId: t.id as string, pnr: t.pnr as string, passenger: t.passenger_name as string, passengers: t.passengers as number };
  });

export const completeETicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ ticketId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: t } = await db.from("etickets").select("*").eq("id", data.ticketId).single();
    if (!t || t.driver_id !== context.userId) throw new Error("Ticket nahi mila.");
    if (t.status === "COMPLETED") return { ok: true };
    if (t.status !== "IN_PROGRESS") throw new Error("Trip shuru nahi hui hai.");
    const s = await loadSettings(db);
    const fare = Number(t.fare_amount);
    const commission =
      s?.commission_type === "flat"
        ? Math.min(fare, Number(s.commission_value))
        : Math.round(fare * Number(s?.commission_value ?? 0)) / 100;
    await db
      .from("etickets")
      .update({ status: "COMPLETED", completed_at: new Date().toISOString(), commission_amount: commission, driver_net_amount: fare - commission })
      .eq("id", t.id)
      .eq("status", "IN_PROGRESS");
    return { ok: true };
  });
