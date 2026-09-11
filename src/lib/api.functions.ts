import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const bookingInput = z.object({
  riderId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  bookingType: z.enum(["share", "reserve"]),
  passengers: z.number().int().min(1).max(20),
  pickupNote: z.string().max(300).optional(),
});

/** Creates a ride. The fare is always recalculated on the server from the rider's own route fares. */
export const createBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => bookingInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: rider, error: riderError } = await supabase
      .from("rider_details")
      .select("user_id, is_approved, is_blocked, is_online, subscription_valid_until")
      .eq("user_id", data.riderId)
      .maybeSingle();
    if (riderError) throw new Error(riderError.message);
    if (!rider) throw new Error("This rider is no longer available.");

    const today = new Date().toISOString().slice(0, 10);
    if (
      !rider.is_approved ||
      rider.is_blocked ||
      !rider.subscription_valid_until ||
      rider.subscription_valid_until < today
    ) {
      throw new Error("This rider's subscription is not active.");
    }
    const { data: vehicle, error: vehicleError } = await supabase
      .from("rider_vehicles")
      .select("id, rider_id, vehicle_category_id, seat_capacity, is_active")
      .eq("id", data.vehicleId)
      .eq("rider_id", data.riderId)
      .maybeSingle();
    if (vehicleError) throw new Error(vehicleError.message);
    if (!vehicle?.is_active) throw new Error("This vehicle is no longer available.");
    if (!rider.is_online) throw new Error("This rider is offline right now.");

    const { data: fare, error: fareError } = await supabase
      .from("rider_route_fares")
      .select("share_fare, reserve_fare, is_active")
      .eq("rider_id", data.riderId)
      .eq("vehicle_id", data.vehicleId)
      .eq("from_location_id", data.fromLocationId)
      .eq("to_location_id", data.toLocationId)
      .maybeSingle();
    if (fareError) throw new Error(fareError.message);
    if (!fare || !fare.is_active) throw new Error("This rider does not serve that route.");

    const passengers = data.passengers;
    if (passengers > vehicle.seat_capacity)
      throw new Error("Too many passengers for this vehicle.");

    const unitFare = Number(data.bookingType === "share" ? fare.share_fare : fare.reserve_fare);
    // Reserve is a fixed one-trip price and is never multiplied by passenger count.
    const totalFare = data.bookingType === "share" ? unitFare * passengers : unitFare;

    const { data: ride, error } = await supabase
      .from("rides")
      .insert({
        customer_id: userId,
        rider_id: data.riderId,
        from_location_id: data.fromLocationId,
        to_location_id: data.toLocationId,
        vehicle_category_id: vehicle.vehicle_category_id,
        vehicle_id: vehicle.id,
        booking_type: data.bookingType,
        passengers,
        unit_fare: unitFare,
        total_fare: totalFare,
        status: "requested",
        pickup_note: data.pickupNote ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { rideId: ride.id as string, totalFare };
  });

/** A rider accepts a pending ride. Blocked unless approved with an active subscription and online. */
export const acceptRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ rideId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const today = new Date().toISOString().slice(0, 10);

    const { data: rider } = await supabase
      .from("rider_details")
      .select("is_approved, is_blocked, is_online, subscription_valid_until")
      .eq("user_id", userId)
      .maybeSingle();
    if (
      !rider?.is_approved ||
      rider.is_blocked ||
      !rider.subscription_valid_until ||
      rider.subscription_valid_until < today
    ) {
      throw new Error("Your subscription is not active. Please pay the monthly fee to the admin.");
    }
    if (!rider.is_online) throw new Error("Go online before accepting rides.");

    const { data: updated, error } = await supabase
      .from("rides")
      .update({ rider_id: userId, status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", data.rideId)
      .eq("rider_id", userId)
      .eq("status", "requested")
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) throw new Error("This ride was already taken.");
    return { ok: true };
  });

const rideActionInput = z.object({
  rideId: z.string().uuid(),
  action: z.enum(["reject", "on_the_way", "arrived", "started", "completed"]),
});

export const updateRiderRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => rideActionInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: ride, error: readError } = await context.supabase
      .from("rides")
      .select("id, rider_id, status")
      .eq("id", data.rideId)
      .eq("rider_id", context.userId)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!ride) throw new Error("Ride not found.");

    const expected: Record<typeof data.action, string[]> = {
      reject: ["requested"],
      on_the_way: ["accepted"],
      arrived: ["on_the_way"],
      started: ["arrived"],
      completed: ["started"],
    };
    if (!expected[data.action].includes(ride.status))
      throw new Error("That ride action is no longer available.");

    const now = new Date().toISOString();
    const values =
      data.action === "reject"
        ? {
            status: "cancelled" as const,
            cancel_reason: "Declined by rider",
            cancelled_by: context.userId,
          }
        : data.action === "completed"
          ? { status: "completed" as const, completed_at: now, cash_collected: true }
          : data.action === "started"
            ? { status: "started" as const, started_at: now }
            : { status: data.action };
    const { error } = await context.supabase
      .from("rides")
      .update(values)
      .eq("id", data.rideId)
      .eq("rider_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const adminRiderInput = z.object({ riderId: z.string().uuid() });

async function requireAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  return adminRoleCheck(context.supabase, context.userId);
}

async function adminRoleCheck(supabase: SupabaseClient<Database>, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Admin access required.");
}

export const setRiderApproval = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => adminRiderInput.extend({ approved: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("rider_details")
      .update({ is_approved: data.approved, is_online: false })
      .eq("user_id", data.riderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setRiderBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => adminRiderInput.extend({ blocked: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("rider_details")
      .update({ is_blocked: data.blocked, is_online: false })
      .eq("user_id", data.riderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const recordSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    adminRiderInput
      .extend({
        amount: z.number().nonnegative(),
        months: z.number().int().min(1).max(24),
        note: z.string().max(300).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: detail, error: detailError } = await supabaseAdmin
      .from("rider_details")
      .select("subscription_valid_until")
      .eq("user_id", data.riderId)
      .single();
    if (detailError) throw new Error(detailError.message);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const current = detail.subscription_valid_until
      ? new Date(`${detail.subscription_valid_until}T00:00:00`)
      : today;
    const start = current >= today ? current : today;
    const until = new Date(start);
    until.setMonth(until.getMonth() + data.months);
    const validFrom = today.toISOString().slice(0, 10);
    const validUntil = until.toISOString().slice(0, 10);
    const { error: paymentError } = await supabaseAdmin.from("subscription_payments").insert({
      rider_id: data.riderId,
      amount: data.amount,
      months: data.months,
      valid_from: validFrom,
      valid_until: validUntil,
      note: data.note ?? null,
      recorded_by: context.userId,
    });
    if (paymentError) throw new Error(paymentError.message);
    const { error } = await supabaseAdmin
      .from("rider_details")
      .update({ subscription_valid_until: validUntil })
      .eq("user_id", data.riderId);
    if (error) throw new Error(error.message);
    return { ok: true, validUntil };
  });

export const deleteRiderAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => adminRiderInput.parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    if (data.riderId === context.userId)
      throw new Error("You cannot delete your own admin account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.riderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

