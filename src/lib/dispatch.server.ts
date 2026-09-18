/**
 * Server-only dispatch engine: nearby driver matching and en-route share matching.
 * Every threshold comes from the database (public.dispatch_settings); nothing here
 * is hard-coded business policy.
 */
import type { Database } from "@/integrations/supabase/types";

export type DispatchSettings = Database["public"]["Tables"]["dispatch_settings"]["Row"];

export type Point = { latitude: number; longitude: number };

const GOOGLE_MAPS_GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

/** Only used when no configuration row exists yet; the row is seeded by migration. */
export const DEFAULT_DISPATCH_SETTINGS = {
  id: "default",
  dispatch_enabled: true,
  nearby_dispatch_enabled: true,
  en_route_matching_enabled: true,
  pickup_radius_km: 3,
  route_corridor_km: 1.5,
  max_pickup_detour_km: 3,
  max_additional_minutes: 12,
  max_location_age_seconds: 180,
  max_gps_accuracy_meters: 200,
  dispatch_priority: "combined_matching",
  reserve_exclusive: true,
  max_share_passengers: 0,
  weight_pickup_proximity: 1,
  weight_detour: 1,
  weight_additional_time: 1,
  weight_capacity: 0.5,
  require_location_for_dispatch: false,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
} satisfies DispatchSettings;

export async function loadDispatchSettings(): Promise<DispatchSettings> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("dispatch_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as DispatchSettings | null) ?? DEFAULT_DISPATCH_SETTINGS;
}

/* ------------------------------------------------------------------ geometry */

const EARTH_RADIUS_KM = 6371;
const toRad = (value: number) => (value * Math.PI) / 180;

export function haversineKm(a: Point, b: Point): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Google encoded polyline → coordinate list. */
export function decodePolyline(encoded: string): Point[] {
  const points: Point[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

function segmentDistanceKm(point: Point, a: Point, b: Point) {
  const ax = a.longitude;
  const ay = a.latitude;
  const bx = b.longitude;
  const by = b.latitude;
  const px = point.longitude;
  const py = point.latitude;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared));
  const projected = { latitude: ay + t * dy, longitude: ax + t * dx };
  return { distanceKm: haversineKm(point, projected), t };
}

/** Distance of a point from a path, plus how far along the path the nearest point sits. */
export function projectOnPath(path: Point[], point: Point) {
  if (path.length === 0) return { deviationKm: Number.POSITIVE_INFINITY, alongKm: 0, totalKm: 0 };
  if (path.length === 1) {
    return { deviationKm: haversineKm(path[0]!, point), alongKm: 0, totalKm: 0 };
  }
  let cumulative = 0;
  let best = { deviationKm: Number.POSITIVE_INFINITY, alongKm: 0 };
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const legKm = haversineKm(a, b);
    const { distanceKm, t } = segmentDistanceKm(point, a, b);
    if (distanceKm < best.deviationKm) {
      best = { deviationKm: distanceKm, alongKm: cumulative + legKm * t };
    }
    cumulative += legKm;
  }
  return { ...best, totalKm: cumulative };
}

/* --------------------------------------------------------------- google route */

function googleHeaders(fieldMask?: string): HeadersInit {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const googleMapsApiKey = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lovableApiKey || !googleMapsApiKey) throw new Error("Maps routing is not configured.");
  return {
    Authorization: `Bearer ${lovableApiKey}`,
    "X-Connection-Api-Key": googleMapsApiKey,
    "Content-Type": "application/json",
    ...(fieldMask ? { "X-Goog-FieldMask": fieldMask } : {}),
  };
}

export type RoadRoute = {
  distanceKm: number;
  durationMinutes: number | null;
  path: Point[];
};

/** Real driving route. Returns null when the route service is unavailable. */
export async function roadRoute(
  origin: Point,
  destination: Point,
  intermediates: Point[] = [],
): Promise<RoadRoute | null> {
  try {
    const response = await fetch(`${GOOGLE_MAPS_GATEWAY}/routes/directions/v2:computeRoutes`, {
      method: "POST",
      headers: googleHeaders(
        "routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration",
      ),
      body: JSON.stringify({
        origin: { location: { latLng: origin } },
        destination: { location: { latLng: destination } },
        ...(intermediates.length
          ? { intermediates: intermediates.map((point) => ({ location: { latLng: point } })) }
          : {}),
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
      }),
    });
    if (!response.ok) {
      console.error(`Dispatch route failed [${response.status}]`);
      return null;
    }
    const payload = (await response.json()) as {
      routes?: Array<{
        polyline?: { encodedPolyline?: string };
        distanceMeters?: number;
        duration?: string;
      }>;
    };
    const route = payload.routes?.[0];
    if (!route?.distanceMeters) return null;
    return {
      distanceKm: Math.round(route.distanceMeters / 100) / 10,
      durationMinutes: route.duration
        ? Math.max(1, Math.round(Number.parseFloat(route.duration.replace("s", "")) / 60))
        : null,
      path: route.polyline?.encodedPolyline ? decodePolyline(route.polyline.encodedPolyline) : [],
    };
  } catch (error) {
    console.error("Dispatch route request failed", error);
    return null;
  }
}

/* ------------------------------------------------------------------ locations */

export async function locationPoint(locationId: string | null | undefined): Promise<Point | null> {
  if (!locationId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("locations")
    .select("latitude, longitude")
    .eq("id", locationId)
    .maybeSingle();
  if (data?.latitude == null || data.longitude == null) return null;
  return { latitude: Number(data.latitude), longitude: Number(data.longitude) };
}

/* ------------------------------------------------------------------- presence */

export type PresenceRow = Database["public"]["Tables"]["rider_presence"]["Row"];

export function locationIsUsable(presence: PresenceRow | undefined, settings: DispatchSettings) {
  if (!presence) return false;
  if (presence.current_latitude == null || presence.current_longitude == null) return false;
  if (!presence.last_location_at) return false;
  const ageSeconds = (Date.now() - new Date(presence.last_location_at).getTime()) / 1000;
  if (ageSeconds > settings.max_location_age_seconds) return false;
  if (
    presence.current_accuracy_meters != null &&
    presence.current_accuracy_meters > settings.max_gps_accuracy_meters
  ) {
    return false;
  }
  return true;
}

export function presencePoint(presence: PresenceRow): Point {
  return {
    latitude: Number(presence.current_latitude),
    longitude: Number(presence.current_longitude),
  };
}

/* ------------------------------------------------------------ eligibility core */

type RideRow = Database["public"]["Tables"]["rides"]["Row"];

async function loadRide(rideId: string): Promise<RideRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("rides").select("*").eq("id", rideId).maybeSingle();
  return (data as RideRow | null) ?? null;
}

/** Drivers who are approved, unblocked, subscribed and online right now. */
async function activeDriverIds(): Promise<Set<string>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("rider_details")
    .select("user_id")
    .eq("is_approved", true)
    .eq("is_blocked", false)
    .eq("is_online", true)
    .gte("subscription_valid_until", today);
  return new Set((data ?? []).map((row) => row.user_id));
}

export type NearbyCandidate = {
  riderId: string;
  vehicleId: string;
  pickupDistanceKm: number | null;
  score: number;
};

/**
 * PATH A — free drivers physically near the pickup point, within the
 * admin-configured radius. Falls back to plain eligibility (no distance filter)
 * when a driver has no usable location and settings allow it.
 */
export async function nearbyCandidates(rideId: string): Promise<NearbyCandidate[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const settings = await loadDispatchSettings();
  if (!settings.dispatch_enabled || !settings.nearby_dispatch_enabled) return [];
  const ride = await loadRide(rideId);
  if (!ride?.requested_category_id) return [];

  const [drivers, vehiclesResult, dismissalsResult, presenceResult, pickup] = await Promise.all([
    activeDriverIds(),
    supabaseAdmin
      .from("rider_vehicles")
      .select("id, rider_id, has_ac, seat_capacity")
      .eq("is_active", true)
      .eq("vehicle_category_id", ride.requested_category_id),
    supabaseAdmin.from("ride_dismissals").select("rider_id").eq("ride_id", rideId),
    supabaseAdmin.from("rider_presence").select("*"),
    locationPoint(ride.from_location_id),
  ]);

  const declined = new Set((dismissalsResult.data ?? []).map((row) => row.rider_id));
  const presenceByRider = new Map(
    ((presenceResult.data ?? []) as PresenceRow[]).map((row) => [row.rider_id, row]),
  );
  const busyRiders = new Set(
    ((presenceResult.data ?? []) as PresenceRow[])
      .filter((row) => row.status === "online_on_ride")
      .map((row) => row.rider_id),
  );

  const seen = new Set<string>();
  const candidates: NearbyCandidate[] = [];
  for (const vehicle of vehiclesResult.data ?? []) {
    if (seen.has(vehicle.rider_id)) continue;
    if (!drivers.has(vehicle.rider_id) || declined.has(vehicle.rider_id)) continue;
    if (busyRiders.has(vehicle.rider_id)) continue;
    if (ride.requested_ac != null && vehicle.has_ac !== ride.requested_ac) continue;
    if (ride.passengers > vehicle.seat_capacity) continue;

    const presence = presenceByRider.get(vehicle.rider_id);
    const usable = locationIsUsable(presence, settings);
    let distanceKm: number | null = null;
    if (usable && pickup && presence) {
      distanceKm = haversineKm(presencePoint(presence), pickup);
      if (distanceKm > Number(settings.pickup_radius_km)) continue;
    } else if (settings.require_location_for_dispatch) {
      continue;
    }
    seen.add(vehicle.rider_id);
    candidates.push({
      riderId: vehicle.rider_id,
      vehicleId: vehicle.id,
      pickupDistanceKm: distanceKm == null ? null : Math.round(distanceKm * 100) / 100,
      score:
        (distanceKm ?? Number(settings.pickup_radius_km)) * Number(settings.weight_pickup_proximity),
    });
  }
  return candidates.sort((a, b) => a.score - b.score);
}

export type EnRouteCandidate = {
  riderId: string;
  vehicleId: string;
  activeRideId: string;
  pickupDetourKm: number;
  routeDeviationKm: number;
  additionalMinutes: number | null;
  remainingCapacity: number;
  score: number;
};

/**
 * PATH B — drivers already carrying share passengers whose remaining road route
 * passes the new pickup point, with capacity, detour and extra time inside the
 * admin-configured limits and no backtracking.
 */
export async function enRouteCandidates(rideId: string): Promise<EnRouteCandidate[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const settings = await loadDispatchSettings();
  if (!settings.dispatch_enabled || !settings.en_route_matching_enabled) return [];
  const ride = await loadRide(rideId);
  if (!ride?.requested_category_id) return [];
  if (ride.booking_type !== "share") return [];

  const [pickup, drop] = await Promise.all([
    locationPoint(ride.from_location_id),
    locationPoint(ride.to_location_id),
  ]);
  if (!pickup || !drop) return [];

  const [drivers, activeResult, dismissalsResult, presenceResult] = await Promise.all([
    activeDriverIds(),
    supabaseAdmin
      .from("rides")
      .select("id, rider_id, vehicle_id, booking_type, passengers, to_location_id, status")
      .in("status", ["accepted", "on_the_way", "arrived", "started"])
      .not("rider_id", "is", null),
    supabaseAdmin.from("ride_dismissals").select("rider_id").eq("ride_id", rideId),
    supabaseAdmin.from("rider_presence").select("*"),
  ]);

  const declined = new Set((dismissalsResult.data ?? []).map((row) => row.rider_id));
  const presenceByRider = new Map(
    ((presenceResult.data ?? []) as PresenceRow[]).map((row) => [row.rider_id, row]),
  );

  const activeRides = (activeResult.data ?? []).filter(
    (row) => row.rider_id && drivers.has(row.rider_id) && !declined.has(row.rider_id),
  );
  if (activeRides.length === 0) return [];

  const vehicleIds = [...new Set(activeRides.map((row) => row.vehicle_id).filter(Boolean))] as string[];
  const { data: vehicles } = await supabaseAdmin
    .from("rider_vehicles")
    .select("id, rider_id, vehicle_category_id, has_ac, seat_capacity, is_active")
    .in("id", vehicleIds.length ? vehicleIds : ["00000000-0000-0000-0000-000000000000"]);
  const vehicleById = new Map((vehicles ?? []).map((row) => [row.id, row]));

  // Occupied passengers per vehicle across all of its active rides.
  const occupied = new Map<string, number>();
  for (const row of activeRides) {
    if (!row.vehicle_id) continue;
    occupied.set(row.vehicle_id, (occupied.get(row.vehicle_id) ?? 0) + row.passengers);
  }

  const byRider = new Map<string, (typeof activeRides)[number]>();
  for (const row of activeRides) {
    if (row.rider_id && !byRider.has(row.rider_id)) byRider.set(row.rider_id, row);
  }

  const candidates: EnRouteCandidate[] = [];
  for (const active of byRider.values()) {
    const riderId = active.rider_id!;
    const vehicle = active.vehicle_id ? vehicleById.get(active.vehicle_id) : undefined;
    if (!vehicle?.is_active) continue;
    if (vehicle.vehicle_category_id !== ride.requested_category_id) continue;
    if (ride.requested_ac != null && vehicle.has_ac !== ride.requested_ac) continue;

    // Reserve trips stay exclusive unless the admin allows shared passengers.
    if (active.booking_type !== "share" && settings.reserve_exclusive) continue;

    const capacityCap =
      settings.max_share_passengers > 0
        ? Math.min(settings.max_share_passengers, vehicle.seat_capacity)
        : vehicle.seat_capacity;
    const remainingCapacity = capacityCap - (occupied.get(vehicle.id) ?? 0);
    if (remainingCapacity < ride.passengers) continue;

    const presence = presenceByRider.get(riderId);
    if (!locationIsUsable(presence, settings) || !presence) continue;
    const current = presencePoint(presence);

    const activeDrop = await locationPoint(active.to_location_id);
    if (!activeDrop) continue;

    const baseRoute = await roadRoute(current, activeDrop);
    if (!baseRoute || baseRoute.path.length < 2) continue;

    // Pickup must sit inside the corridor of the REMAINING route (route starts at
    // the driver's current position, so anything that projects onto it is ahead).
    const pickupProjection = projectOnPath(baseRoute.path, pickup);
    if (pickupProjection.deviationKm > Number(settings.route_corridor_km)) continue;

    // Destination compatibility: the new drop must also lie along the same
    // direction of travel, after the pickup point.
    const dropProjection = projectOnPath(baseRoute.path, drop);
    const sameDrop = active.to_location_id === ride.to_location_id;
    if (!sameDrop) {
      if (dropProjection.deviationKm > Number(settings.route_corridor_km)) continue;
      if (dropProjection.alongKm <= pickupProjection.alongKm) continue;
    }

    const detourRoute = await roadRoute(current, sameDrop ? activeDrop : drop, [pickup]);
    if (!detourRoute) continue;
    const pickupDetourKm = Math.round((detourRoute.distanceKm - baseRoute.distanceKm) * 100) / 100;
    if (pickupDetourKm > Number(settings.max_pickup_detour_km)) continue;
    const additionalMinutes =
      detourRoute.durationMinutes != null && baseRoute.durationMinutes != null
        ? detourRoute.durationMinutes - baseRoute.durationMinutes
        : null;
    if (
      additionalMinutes != null &&
      additionalMinutes > Number(settings.max_additional_minutes)
    ) {
      continue;
    }

    candidates.push({
      riderId,
      vehicleId: vehicle.id,
      activeRideId: active.id,
      pickupDetourKm: Math.max(0, pickupDetourKm),
      routeDeviationKm: Math.round(pickupProjection.deviationKm * 100) / 100,
      additionalMinutes,
      remainingCapacity,
      score:
        Math.max(0, pickupDetourKm) * Number(settings.weight_detour) +
        (additionalMinutes ?? 0) * Number(settings.weight_additional_time) -
        remainingCapacity * Number(settings.weight_capacity),
    });
  }
  return candidates.sort((a, b) => a.score - b.score);
}

export type DispatchPlan = {
  settings: DispatchSettings;
  nearby: NearbyCandidate[];
  enRoute: EnRouteCandidate[];
  riderIds: string[];
  enRouteRiderIds: string[];
};

/** Runs both dispatch paths and orders the drivers by the configured priority. */
export async function planDispatch(rideId: string): Promise<DispatchPlan> {
  const settings = await loadDispatchSettings();
  const [nearby, enRoute] = await Promise.all([nearbyCandidates(rideId), enRouteCandidates(rideId)]);
  const nearbyIds = nearby.map((item) => item.riderId);
  const enRouteIds = enRoute.map((item) => item.riderId).filter((id) => !nearbyIds.includes(id));

  let ordered: string[];
  if (settings.dispatch_priority === "en_route_first") ordered = [...enRouteIds, ...nearbyIds];
  else if (settings.dispatch_priority === "nearest_available_first")
    ordered = [...nearbyIds, ...enRouteIds];
  else {
    ordered = [
      ...[
        ...nearby.map((item) => ({ id: item.riderId, score: item.score })),
        ...enRoute
          .filter((item) => !nearbyIds.includes(item.riderId))
          .map((item) => ({ id: item.riderId, score: item.score })),
      ]
        .sort((a, b) => a.score - b.score)
        .map((item) => item.id),
    ];
  }

  return {
    settings,
    nearby,
    enRoute,
    riderIds: [...new Set(ordered)],
    enRouteRiderIds: enRouteIds,
  };
}

/** Stores the en-route evaluation so the driver app and admin can show/verify it. */
export async function recordEnRouteOffers(rideId: string, candidates: EnRouteCandidate[]) {
  if (candidates.length === 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("en_route_matches").upsert(
    candidates.map((item) => ({
      new_ride_id: rideId,
      active_ride_id: item.activeRideId,
      rider_id: item.riderId,
      vehicle_id: item.vehicleId,
      pickup_detour_km: item.pickupDetourKm,
      route_deviation_km: item.routeDeviationKm,
      additional_duration_minutes: item.additionalMinutes,
      compatibility_result: {
        remainingCapacity: item.remainingCapacity,
        score: item.score,
      } as never,
      status: "offered",
    })),
    { onConflict: "new_ride_id,rider_id" },
  );
}
