import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function pushTo(admin: Admin, userIds: string[], title: string, body: string, data: Record<string, string>) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const fcmKey = process.env["FIREBASE_MESSAGING_API_KEY"];
  if (userIds.length === 0) return 0;
  await admin.from("notifications").insert(
    userIds.map((id) => ({ user_id: id, title, body, channel: "push", data: data as never, delivered: false })),
  );
  if (!lovableKey || !fcmKey) return 0;
  const { data: devices } = await admin
    .from("notification_devices")
    .select("push_token")
    .eq("is_active", true)
    .in("user_id", userIds);
  let delivered = 0;
  await Promise.all(
    (devices ?? []).map(async (d) => {
      try {
        const res = await fetch(
          "https://connector-gateway.lovable.dev/firebase_messaging/v1/projects/_/messages:send",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": fcmKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token: d.push_token,
                data: { ...data, title, body },
                android: { priority: "HIGH", ttl: "600s" },
                webpush: { headers: { Urgency: "high" }, notification: { title, body, icon: "/favicon.png" } },
              },
            }),
          },
        );
        if (res.ok) delivered += 1;
        else if (res.status === 404 || res.status === 400)
          await admin.from("notification_devices").update({ is_active: false }).eq("push_token", d.push_token);
      } catch (e) {
        console.error("rescue push failed", e);
      }
    }),
  );
  return delivered;
}

async function sendSms(numbers: string[], message: string) {
  const key = process.env["FAST2SMS_API_KEY"];
  const tens = numbers.map((n) => n.replace(/\D/g, "").slice(-10)).filter((n) => n.length === 10);
  if (!key || tens.length === 0) return { sent: 0, error: key ? "No valid numbers" : "SMS not configured" };
  try {
    const res = await fetch("https://www.fast2sms.com/dev/bulkV2", {
      method: "POST",
      headers: { authorization: key, "Content-Type": "application/json" },
      body: JSON.stringify({ route: "q", message, language: "unicode", numbers: tens.join(",") }),
    });
    const body = (await res.json().catch(() => ({}))) as { return?: boolean; message?: unknown };
    if (!res.ok || body.return === false) return { sent: 0, error: String(body.message ?? res.status) };
    return { sent: tens.length, error: null };
  } catch (e) {
    return { sent: 0, error: String(e) };
  }
}

const createInput = z.object({
  kind: z.enum(["rescue", "sos"]),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  note: z.string().trim().max(300).optional(),
});

/** Driver: raise a Rescue request (admin + all drivers) or SOS (also family contacts). */
export const raiseRescue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => createInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isRider } = await supabase.rpc("has_role", { _user_id: userId, _role: "rider" });
    if (!isRider) throw new Error("Only drivers can send a rescue request.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: activeRide } = await supabaseAdmin
      .from("rides")
      .select("id")
      .eq("rider_id", userId)
      .in("status", ["accepted", "on_the_way", "arrived", "started"])
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: req, error } = await supabaseAdmin
      .from("rescue_requests")
      .insert({
        driver_id: userId,
        kind: data.kind,
        ride_id: activeRide?.id ?? null,
        latitude: data.latitude,
        longitude: data.longitude,
        note: data.note || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { data: me } = await supabaseAdmin.from("profiles").select("full_name, mobile").eq("id", userId).maybeSingle();
    const { data: veh } = await supabaseAdmin
      .from("rider_vehicles")
      .select("vehicle_number")
      .eq("rider_id", userId)
      .eq("is_primary", true)
      .maybeSingle();
    const name = me?.full_name || "Driver";
    const vehicle = veh?.vehicle_number ?? "";

    const { data: roleRows } = await supabaseAdmin.from("user_roles").select("user_id").in("role", ["admin", "rider"]);
    const targets = Array.from(new Set((roleRows ?? []).map((r) => r.user_id))).filter((id) => id !== userId);
    const title = data.kind === "sos" ? "🚨 SOS EMERGENCY" : "🚨 Rescue request";
    const body = `${name}${vehicle ? ` (${vehicle})` : ""} ko madad chahiye. Tap karke details dekhein.`;
    const speech = `सावधान! सावधान! शाहीन ट्रैवल्स। ड्राइवर ${name} मुसीबत में हैं और उन्हें तुरंत मदद चाहिए। रेस्क्यू रिक्वेस्ट देखने के लिए स्क्रीन दबाएं।`;
    const delivered = await pushTo(supabaseAdmin, targets, title, body, {
      type: "rescue",
      rescue_id: req.id,
      path: `/rescue/${req.id}`,
      speech,
    });

    let sms: { sent: number; error: string | null } = { sent: 0, error: null };
    if (data.kind === "sos") {
      const { data: contacts } = await supabaseAdmin
        .from("driver_emergency_contacts")
        .select("phone")
        .eq("driver_id", userId);
      const map =
        data.latitude != null && data.longitude != null
          ? ` Location: https://maps.google.com/?q=${data.latitude},${data.longitude}`
          : "";
      sms = await sendSms(
        (contacts ?? []).map((c) => c.phone),
        `SOS! ${name} (${me?.mobile ?? ""}) musibat me hain, turant sampark karein.${map} - Shahin Travels`,
      );
    }
    return { id: req.id, notified: targets.length, delivered, smsSent: sms.sent, smsError: sms.error };
  });

/** Driver/admin: full details of a rescue request. */
export const getRescue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: isRider }, { data: isAdmin }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "rider" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);
    if (!isRider && !isAdmin) throw new Error("Not allowed.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r, error } = await supabaseAdmin.from("rescue_requests").select("*").eq("id", data.id).maybeSingle();
    if (error || !r) throw new Error("Rescue request not found.");
    const [{ data: driver }, { data: veh }, { data: responses }] = await Promise.all([
      supabaseAdmin.from("profiles").select("full_name, mobile, photo_url, address").eq("id", r.driver_id).maybeSingle(),
      supabaseAdmin.from("rider_vehicles").select("vehicle_number, vehicle_model, brand_name").eq("rider_id", r.driver_id).eq("is_primary", true).maybeSingle(),
      supabaseAdmin.from("rescue_responses").select("responder_id, response, created_at").eq("request_id", r.id),
    ]);
    let ride: null | {
      from: string;
      to: string;
      status: string;
      passenger: { full_name: string; mobile: string; photo_url: string | null; address: string | null } | null;
    } = null;
    if (r.ride_id) {
      const { data: rd } = await supabaseAdmin
        .from("rides")
        .select("status, customer_id, from_location_id, to_location_id")
        .eq("id", r.ride_id)
        .maybeSingle();
      if (rd) {
        const [{ data: locs }, { data: cust }] = await Promise.all([
          supabaseAdmin.from("locations").select("id, name").in("id", [rd.from_location_id, rd.to_location_id]),
          supabaseAdmin.from("profiles").select("full_name, mobile, photo_url, address").eq("id", rd.customer_id).maybeSingle(),
        ]);
        const nm = (id: string) => locs?.find((l) => l.id === id)?.name ?? "";
        ride = { from: nm(rd.from_location_id), to: nm(rd.to_location_id), status: rd.status, passenger: cust ?? null };
      }
    }
    const ids = (responses ?? []).map((x) => x.responder_id);
    const { data: names } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, full_name, mobile").in("id", ids)
      : { data: [] as { id: string; full_name: string; mobile: string }[] };
    return {
      request: r,
      driver,
      vehicle: veh,
      ride,
      myResponse: (responses ?? []).find((x) => x.responder_id === userId)?.response ?? null,
      isOwner: r.driver_id === userId,
      isAdmin: Boolean(isAdmin),
      responses: (responses ?? []).map((x) => ({
        ...x,
        name: names?.find((n) => n.id === x.responder_id)?.full_name ?? "Driver",
        mobile: names?.find((n) => n.id === x.responder_id)?.mobile ?? "",
      })),
    };
  });

/** Driver/admin: accept or reject; the owner or admin can mark it resolved. */
export const respondRescue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) =>
    z.object({ id: z.string().uuid(), action: z.enum(["accepted", "rejected", "resolved"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const [{ data: isRider }, { data: isAdmin }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "rider" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
    ]);
    if (!isRider && !isAdmin) throw new Error("Not allowed.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r } = await supabaseAdmin.from("rescue_requests").select("driver_id, status").eq("id", data.id).maybeSingle();
    if (!r) throw new Error("Rescue request not found.");
    if (data.action === "resolved") {
      if (r.driver_id !== userId && !isAdmin) throw new Error("Only the driver or admin can close this.");
      await supabaseAdmin.from("rescue_requests").update({ status: "resolved", resolved_at: new Date().toISOString() }).eq("id", data.id);
      return { ok: true };
    }
    if (r.status !== "open") throw new Error("This rescue request is already closed.");
    await supabaseAdmin
      .from("rescue_responses")
      .upsert({ request_id: data.id, responder_id: userId, response: data.action }, { onConflict: "request_id,responder_id" });
    if (data.action === "accepted") {
      const { data: me } = await supabaseAdmin.from("profiles").select("full_name, mobile").eq("id", userId).maybeSingle();
      await pushTo(supabaseAdmin, [r.driver_id], "Madad aa rahi hai", `${me?.full_name ?? "Ek driver"} (${me?.mobile ?? ""}) aapki madad ke liye aa rahe hain.`, {
        path: `/rescue/${data.id}`,
      });
    }
    return { ok: true };
  });

/** Open rescue requests (drivers + admin). */
export const listOpenRescues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("rescue_requests")
      .select("id, driver_id, kind, created_at, status")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(20);
    const rows = (data ?? []).filter((r) => r.driver_id !== context.userId);
    if (rows.length === 0) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: names } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", rows.map((r) => r.driver_id));
    return rows.map((r) => ({ ...r, name: names?.find((n) => n.id === r.driver_id)?.full_name ?? "Driver" }));
  });

/** Admin: full customer profile with ride and wallet summary. */
export const getAdminCustomerDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Only admins can view this.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: profile }, { data: rides }, { data: balance }, { data: referredBy }, { data: referred }, { data: devices }] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("*").eq("id", data.id).maybeSingle(),
        supabaseAdmin
          .from("rides")
          .select("id, status, total_fare, created_at, from_location_id, to_location_id, booking_type")
          .eq("customer_id", data.id)
          .order("created_at", { ascending: false })
          .limit(200),
        supabaseAdmin.rpc("wallet_balance", { _user_id: data.id }),
        supabaseAdmin.from("referrals").select("referrer_user_id, code, status").eq("referred_user_id", data.id).maybeSingle(),
        supabaseAdmin.from("referrals").select("id").eq("referrer_user_id", data.id),
        supabaseAdmin.from("notification_devices").select("device_type, is_active, updated_at").eq("user_id", data.id),
      ]);
    if (!profile) throw new Error("Customer not found.");
    const list = rides ?? [];
    const locIds = Array.from(new Set(list.slice(0, 15).flatMap((r) => [r.from_location_id, r.to_location_id])));
    const { data: locs } = locIds.length
      ? await supabaseAdmin.from("locations").select("id, name").in("id", locIds)
      : { data: [] as { id: string; name: string }[] };
    let referrerName: string | null = null;
    if (referredBy?.referrer_user_id) {
      const { data: rp } = await supabaseAdmin.from("profiles").select("full_name, mobile").eq("id", referredBy.referrer_user_id).maybeSingle();
      referrerName = rp ? `${rp.full_name || "—"} (${rp.mobile})` : null;
    }
    const nm = (id: string) => locs?.find((l) => l.id === id)?.name ?? "—";
    return {
      profile,
      stats: {
        total: list.length,
        completed: list.filter((r) => r.status === "completed").length,
        cancelled: list.filter((r) => r.status === "cancelled").length,
        spent: list.filter((r) => r.status === "completed").reduce((s, r) => s + Number(r.total_fare || 0), 0),
      },
      wallet: Number(balance ?? 0),
      referrerName,
      referredCount: referred?.length ?? 0,
      phoneAlerts: (devices ?? []).some((d) => d.is_active),
      recent: list.slice(0, 15).map((r) => ({ ...r, from: nm(r.from_location_id), to: nm(r.to_location_id) })),
    };
  });
