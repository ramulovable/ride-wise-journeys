import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadFareOptions } from "@/lib/api.functions";
import { ticketOptions } from "@/lib/eticket-pricing";

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
  const route = await loadFareOptions(fromId, toId, passengers);
  const options = ticketOptions(route.options, passengers);
  return {
    distanceKm: route.distanceKm,
    durationMinutes: route.durationMinutes,
    fareCalculatedAt: route.fareCalculatedAt,
    pricingTimezone: route.pricingTimezone,
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
        optionId: z.string().max(100).optional(),
        insurance: z.boolean(),
        passengerName: z.string().trim().min(2).max(80),
        pickupLandmark: z.string().trim().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const q = await quote(db, data.fromLocationId, data.toLocationId, data.passengers);
    const opt = q.options.find((o) => o.categoryId === data.categoryId && (!data.optionId || o.optionId === data.optionId));
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
          ...opt.snapshot,
          fareCalculatedAt: q.fareCalculatedAt,
          timezone: q.pricingTimezone,
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
    const { data: t } = await db
      .from("etickets")
      .select("id,customer_id,payment_order_id,payment_status,total_amount")
      .eq("id", data.ticketId)
      .single();
    if (!t || t.customer_id !== context.userId || t.payment_order_id !== data.orderId) throw new Error("Ticket nahi mila.");
    if (t.payment_status === "PAID") return { ok: true };
    // 1) Checkout signature must be valid.
    const expected = await hmacHex(rzpAuth().secret, `${data.orderId}|${data.paymentId}`);
    if (expected !== data.signature) {
      await db.from("etickets").update({ payment_status: "FAILED" }).eq("id", t.id);
      throw new Error("Payment verify nahi hua.");
    }
    // 2) Double-check with Razorpay API: payment must exist, belong to this
    //    order, be captured, and match the stored total.
    const rzp = rzpAuth();
    const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(data.paymentId)}`, {
      headers: { Authorization: rzp.header },
    });
    if (!res.ok) throw new Error("Payment status confirm nahi hua. Dobara koshish karein.");
    const pay = (await res.json()) as { status: string; order_id: string; amount: number };
    if (pay.order_id !== data.orderId) throw new Error("Payment is order se match nahi karta.");
    if (pay.status !== "captured" && pay.status !== "authorized") {
      throw new Error("Payment abhi successful nahi hua hai.");
    }
    if (pay.amount !== Math.round(Number(t.total_amount) * 100)) {
      throw new Error("Payment amount ticket se match nahi karta.");
    }
    // Idempotent: only transitions PENDING -> PAID.
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

/* ---------------- Direct UPI / QR payment (manual UTR verification) ---------------- */

async function upiConfig(db: Any) {
  const { data } = await db.from("app_text_settings").select("key,value").in("key", ["eticket_upi_id", "eticket_upi_name"]);
  const m = new Map<string, string>((data ?? []).map((r: Any) => [r.key as string, r.value as string]));
  const vpa = (m.get("eticket_upi_id") || "").trim();
  return { vpa, name: (m.get("eticket_upi_name") || "Shahin Travels").trim() };
}

export const getETicketUpiInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const c = await upiConfig(await admin());
    return { enabled: Boolean(c.vpa), vpa: c.vpa, name: c.name };
  });

export const createETicketUpiOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    quoteInput
      .extend({
        categoryId: z.string().uuid(),
        optionId: z.string().max(100).optional(),
        insurance: z.boolean(),
        passengerName: z.string().trim().min(2).max(80),
        pickupLandmark: z.string().trim().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const upi = await upiConfig(db);
    if (!upi.vpa) throw new Error("UPI payment abhi set nahi hai. Admin se sampark karein.");
    const q = await quote(db, data.fromLocationId, data.toLocationId, data.passengers);
    const opt = q.options.find((o) => o.categoryId === data.categoryId && (!data.optionId || o.optionId === data.optionId));
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
        fare_snapshot: { ...opt.snapshot, fareCalculatedAt: q.fareCalculatedAt, timezone: q.pricingTimezone,
          vehicle: opt.name, distanceKm: q.distanceKm, fare: opt.fare, insuranceCharge, upiVpa: upi.vpa,
          insuranceProvider: q.insurance?.provider ?? null, insurancePolicy: q.settings.insurance_policy_number ?? null,
          claimRules: q.settings.insurance_claim_rules ?? null },
        payment_gateway: "upi",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const amount = total.toFixed(2);
    const upiUrl =
      `upi://pay?pa=${encodeURIComponent(upi.vpa)}&pn=${encodeURIComponent(upi.name)}` +
      `&am=${amount}&cu=INR&tn=${encodeURIComponent("ETicket " + pnr)}&tr=${encodeURIComponent(pnr)}`;
    return { ticketId: ticket.id as string, pnr: pnr as string, amount, upiUrl, vpa: upi.vpa, name: upi.name };
  });

export const submitETicketUtr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ ticketId: z.string().uuid(), utr: z.string().trim().regex(/^\d{12}$/, "UTR 12 ank ka hona chahiye.") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await admin();
    const { data: t } = await db.from("etickets").select("id,customer_id,payment_status,payment_gateway,created_at").eq("id", data.ticketId).single();
    if (!t || t.customer_id !== context.userId || t.payment_gateway !== "upi") throw new Error("Ticket nahi mila.");
    if (t.payment_status === "PAID") return { status: "PAID" };
    if (t.payment_status !== "PENDING") throw new Error("Is ticket ka UTR pehle hi bheja ja chuka hai.");
    const { data: dup } = await db.from("etickets").select("id").eq("upi_utr", data.utr).maybeSingle();
    if (dup) throw new Error("Yeh UTR pehle kisi aur ticket me use ho chuka hai. Booking failed.");
    const { error } = await db
      .from("etickets")
      .update({ upi_utr: data.utr, utr_submitted_at: new Date().toISOString(), payment_status: "VERIFYING", payment_id: data.utr })
      .eq("id", t.id)
      .eq("payment_status", "PENDING");
    if (error) throw new Error("UTR save nahi hua. Dobara koshish karein.");
    return { status: "VERIFYING" };
  });

export const adminReviewETicketUpi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ ticketId: z.string().uuid(), approve: z.boolean(), note: z.string().trim().max(200).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await (context.supabase as Any).rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Sirf admin.");
    const db = await admin();
    const patch = data.approve
      ? { payment_status: "PAID", status: "ACTIVE", paid_at: new Date().toISOString(), payment_note: data.note ?? null }
      : { payment_status: "FAILED", status: "CANCELLED", cancelled_at: new Date().toISOString(), payment_note: data.note ?? "UTR match nahi hua" };
    const { error } = await db.from("etickets").update(patch).eq("id", data.ticketId).eq("payment_status", "VERIFYING");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
