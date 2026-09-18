import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const presenceInput = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(100000).nullable().optional(),
  vehicleId: z.string().uuid().nullable().optional(),
});

/** A driver's app posts its real GPS position; the server decides the presence state. */
export const updateRiderPresence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => presenceInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();

    const [{ data: rider }, { data: activeRides }] = await Promise.all([
      supabase.from("rider_details").select("is_online, is_blocked").eq("user_id", userId).maybeSingle(),
      supabase
        .from("rides")
        .select("id, vehicle_id")
        .eq("rider_id", userId)
        .in("status", ["accepted", "on_the_way", "arrived", "started"])
        .order("accepted_at", { ascending: true })
        .limit(1),
    ]);

    const active = activeRides?.[0];
    const status = !rider?.is_online || rider.is_blocked
      ? "offline"
      : active
        ? "online_on_ride"
        : "online_available";

    const { error } = await supabase.from("rider_presence").upsert(
      {
        rider_id: userId,
        status,
        current_latitude: data.latitude,
        current_longitude: data.longitude,
        current_accuracy_meters: data.accuracyMeters ?? null,
        active_ride_id: active?.id ?? null,
        active_vehicle_id: active?.vehicle_id ?? data.vehicleId ?? null,
        last_location_at: now,
        last_seen_at: now,
      },
      { onConflict: "rider_id" },
    );
    if (error) throw new Error(error.message);

    await supabase.from("rider_live_locations").insert({
      rider_id: userId,
      vehicle_id: active?.vehicle_id ?? data.vehicleId ?? null,
      latitude: data.latitude,
      longitude: data.longitude,
      accuracy_meters: data.accuracyMeters ?? null,
      recorded_at: now,
    });

    if (active) {
      await supabase
        .from("ride_route_state")
        .update({ current_latitude: data.latitude, current_longitude: data.longitude })
        .eq("ride_id", active.id);
    }

    return { ok: true, status };
  });

/** Current dispatch rules. Readable by any signed-in user; only admins can change them. */
export const getDispatchSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("dispatch_settings")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const settingsInput = z.object({
  id: z.string().uuid(),
  dispatch_enabled: z.boolean(),
  nearby_dispatch_enabled: z.boolean(),
  en_route_matching_enabled: z.boolean(),
  pickup_radius_km: z.number().min(0.1).max(100),
  route_corridor_km: z.number().min(0.1).max(50),
  max_pickup_detour_km: z.number().min(0).max(100),
  max_additional_minutes: z.number().min(0).max(240),
  max_location_age_seconds: z.number().int().min(15).max(3600),
  max_gps_accuracy_meters: z.number().int().min(5).max(5000),
  dispatch_priority: z.enum(["nearest_available_first", "en_route_first", "combined_matching"]),
  reserve_exclusive: z.boolean(),
  max_share_passengers: z.number().int().min(0).max(50),
  weight_pickup_proximity: z.number().min(0).max(100),
  weight_detour: z.number().min(0).max(100),
  weight_additional_time: z.number().min(0).max(100),
  weight_capacity: z.number().min(0).max(100),
  require_location_for_dispatch: z.boolean(),
});

/** Admin: save the dispatch and matching rules. Changes are audit-logged by the database. */
export const updateDispatchSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => settingsInput.parse(data))
  .handler(async ({ data, context }) => {
    const { id, ...values } = data;
    const { error } = await context.supabase.from("dispatch_settings").update(values).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin: live view of every real driver's presence, location and current trip. */
export const getLiveDrivers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: presence, error } = await supabase
      .from("rider_presence")
      .select("*")
      .order("last_seen_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    if (!presence?.length) return [];

    const riderIds = presence.map((row) => row.rider_id);
    const rideIds = presence.map((row) => row.active_ride_id).filter(Boolean) as string[];
    const [profilesResult, vehiclesResult, stateResult, ridesResult] = await Promise.all([
      supabase.from("profiles").select("id, full_name, mobile").in("id", riderIds),
      supabase.from("rider_vehicles").select("id, vehicle_number, seat_capacity").in("rider_id", riderIds),
      rideIds.length
        ? supabase.from("ride_route_state").select("*").in("ride_id", rideIds)
        : Promise.resolve({ data: [] as never[] }),
      rideIds.length
        ? supabase.from("rides").select("id, status, passengers, from_location_id, to_location_id").in("id", rideIds)
        : Promise.resolve({ data: [] as never[] }),
    ]);

    return presence.map((row) => {
      const profile = profilesResult.data?.find((item) => item.id === row.rider_id);
      const vehicle = vehiclesResult.data?.find((item) => item.id === row.active_vehicle_id);
      const state = (stateResult.data as Array<{ ride_id: string; route_progress: number | null; remaining_capacity: number | null; occupied_passenger_count: number | null }> | null)?.find(
        (item) => item.ride_id === row.active_ride_id,
      );
      const ride = (ridesResult.data as Array<{ id: string; status: string; passengers: number }> | null)?.find(
        (item) => item.id === row.active_ride_id,
      );
      return {
        riderId: row.rider_id,
        name: profile?.full_name ?? "Driver",
        mobile: profile?.mobile ?? "",
        status: row.status,
        latitude: row.current_latitude,
        longitude: row.current_longitude,
        accuracyMeters: row.current_accuracy_meters,
        lastLocationAt: row.last_location_at,
        lastSeenAt: row.last_seen_at,
        vehicleNumber: vehicle?.vehicle_number ?? null,
        seatCapacity: vehicle?.seat_capacity ?? null,
        activeRideId: row.active_ride_id,
        activeRideStatus: ride?.status ?? null,
        passengers: state?.occupied_passenger_count ?? ride?.passengers ?? null,
        remainingCapacity: state?.remaining_capacity ?? null,
        routeProgress: state?.route_progress ?? null,
      };
    });
  });
