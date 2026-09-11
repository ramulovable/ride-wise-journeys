import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const bookingInput = z.object({
  riderId: z.string().uuid(),
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  bookingType: z.enum(["share", "reserve"]),
  passengers: z.number().int().min(1).max(20),
  pickupNote: z.string().max(300).optional(),
});

/** Creates a ride. The fare is always recalculated on the server from the rider's own route fares. */
export const createBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => bookingInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: rider, error: riderError } = await supabase
      .from("rider_details")
      .select("user_id, is_approved, is_online, subscription_valid_until, seat_capacity, vehicle_category_id")
      .eq("user_id", data.riderId)
      .maybeSingle();
    if (riderError) throw new Error(riderError.message);
    if (!rider) throw new Error("This rider is no longer available.");

    const today = new Date().toISOString().slice(0, 10);
    if (!rider.is_approved || !rider.subscription_valid_until || rider.subscription_valid_until < today) {
      throw new Error("This rider's subscription is not active.");
    }
    if (!rider.is_online) throw new Error("This rider is offline right now.");

    const { data: fare, error: fareError } = await supabase
      .from("rider_route_fares")
      .select("share_fare, reserve_fare, is_active")
      .eq("rider_id", data.riderId)
      .eq("from_location_id", data.fromLocationId)
      .eq("to_location_id", data.toLocationId)
      .maybeSingle();
    if (fareError) throw new Error(fareError.message);
    if (!fare || !fare.is_active) throw new Error("This rider does not serve that route.");

    const passengers = data.bookingType === "reserve" ? data.passengers : data.passengers;
    if (passengers > rider.seat_capacity) throw new Error("Too many passengers for this vehicle.");

    const unitFare = Number(data.bookingType === "share" ? fare.share_fare : fare.reserve_fare);
    // Reserve is a fixed one-trip price and is never multiplied by passenger count.
    const totalFare = data.bookingType === "share" ? unitFare * passengers : unitFare;

    const { data: ride, error } = await supabase
      .from("rides")
      .insert({
        customer_id: userId,
        rider_id: null,
        from_location_id: data.fromLocationId,
        to_location_id: data.toLocationId,
        vehicle_category_id: rider.vehicle_category_id,
        booking_type: data.bookingType,
        passengers,
        unit_fare: unitFare,
        total_fare: totalFare,
        status: "searching",
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
  .inputValidator((data: unknown) => z.object({ rideId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const today = new Date().toISOString().slice(0, 10);

    const { data: rider } = await supabase
      .from("rider_details")
      .select("is_approved, is_online, subscription_valid_until")
      .eq("user_id", userId)
      .maybeSingle();
    if (!rider?.is_approved || !rider.subscription_valid_until || rider.subscription_valid_until < today) {
      throw new Error("Your subscription is not active. Please pay the monthly fee to the admin.");
    }
    if (!rider.is_online) throw new Error("Go online before accepting rides.");

    const { data: updated, error } = await supabase
      .from("rides")
      .update({ rider_id: userId, status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", data.rideId)
      .is("rider_id", null)
      .in("status", ["requested", "searching"])
      .select("id");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) throw new Error("This ride was already taken.");
    return { ok: true };
  });

/** Creates the default admin account once, if it does not exist yet. */
export const ensureDefaultAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const email = process.env["DEFAULT_ADMIN_EMAIL"];
  const password = process.env["DEFAULT_ADMIN_PASSWORD"];
  if (!email || !password) return { ok: false as const, reason: "not_configured" };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: existingRole } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin").limit(1);
  if (existingRole && existingRole.length > 0) return { ok: true as const, created: false };

  const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let userId = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id;

  if (!userId) {
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Administrator", mobile: "admin", role: "customer" },
    });
    if (error) throw new Error(error.message);
    userId = created.user?.id;
  }
  if (!userId) throw new Error("Could not provision the admin account.");

  await supabaseAdmin.from("profiles").upsert({ id: userId, mobile: email, full_name: "Administrator" });
  await supabaseAdmin.from("user_roles").upsert({ user_id: userId, role: "admin" }, { onConflict: "user_id,role" });

  return { ok: true as const, created: true };
});
