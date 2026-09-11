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

const riderOfferInput = z
  .object({
    fromLocationId: z.string().uuid(),
    toLocationId: z.string().uuid(),
  })
  .refine((value) => value.fromLocationId !== value.toLocationId, {
    message: "Pickup and drop locations must be different.",
  });

const placeSearchInput = z.object({
  query: z.string().trim().min(2).max(120),
  sessionToken: z.string().uuid(),
});

const placeDetailsInput = z.object({
  placeId: z.string().trim().min(1).max(300),
  sessionToken: z.string().uuid(),
});

const routeDistanceInput = z
  .object({
    fromLocationId: z.string().uuid(),
    toLocationId: z.string().uuid(),
  })
  .refine((value) => value.fromLocationId !== value.toLocationId, {
    message: "Pickup and destination must be different.",
  });

const GOOGLE_MAPS_GATEWAY = "https://connector-gateway.lovable.dev/google_maps";
const placeSearchCache = new Map<string, { expiresAt: number; results: PlaceSuggestion[] }>();

type PlaceSuggestion = { placeId: string; label: string };
type LocationCoordinates = { latitude: number; longitude: number };

function googleHeaders(fieldMask?: string): HeadersInit {
  const lovableApiKey = process.env["LOVABLE_API_KEY"];
  const googleMapsApiKey = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lovableApiKey || !googleMapsApiKey) {
    throw new Error("Location search is not configured yet.");
  }
  return {
    Authorization: `Bearer ${lovableApiKey}`,
    "X-Connection-Api-Key": googleMapsApiKey,
    "Content-Type": "application/json",
    ...(fieldMask ? { "X-Goog-FieldMask": fieldMask } : {}),
  };
}

async function throwGoogleError(response: Response): Promise<never> {
  const body = await response.text();
  if (response.status === 403) {
    let reason = "";
    try {
      const parsed = JSON.parse(body) as { error?: { details?: Array<{ reason?: string }> } };
      reason = parsed.error?.details?.find((detail) => detail.reason)?.reason ?? "";
    } catch {
      // The provider occasionally returns a non-JSON error page.
    }
    if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
      throw new Error(
        "Google Maps server access is restricted. Please update the server key restrictions.",
      );
    }
    if (reason === "API_KEY_SERVICE_BLOCKED") {
      throw new Error("The required Google Maps API is not enabled for this connection.");
    }
  }
  console.error(`Google Maps request failed [${response.status}]: ${body}`);
  throw new Error("Google Maps could not complete this request. Please try again.");
}

export const searchIndiaPlaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => placeSearchInput.parse(data))
  .handler(async ({ data }) => {
    const cacheKey = data.query.toLocaleLowerCase("en-IN");
    const cached = placeSearchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.results;

    const response = await fetch(`${GOOGLE_MAPS_GATEWAY}/places/v1/places:autocomplete`, {
      method: "POST",
      headers: googleHeaders(
        "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
      ),
      body: JSON.stringify({
        input: data.query,
        sessionToken: data.sessionToken,
        includedRegionCodes: ["in"],
      }),
    });
    if (!response.ok) await throwGoogleError(response);
    const payload = (await response.json()) as {
      suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string } } }>;
    };
    const results = (payload.suggestions ?? [])
      .flatMap((suggestion): PlaceSuggestion[] => {
        const placeId = suggestion.placePrediction?.placeId;
        const label = suggestion.placePrediction?.text?.text;
        return placeId && label ? [{ placeId, label }] : [];
      })
      .slice(0, 5);
    placeSearchCache.set(cacheKey, { expiresAt: Date.now() + 5 * 60_000, results });
    return results;
  });

export const selectIndiaPlace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => placeDetailsInput.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const existing = await supabaseAdmin
      .from("locations")
      .select("id, name, area, formatted_address, latitude, longitude, is_active")
      .eq("provider_place_id", data.placeId)
      .maybeSingle();
    if (existing.error) throw new Error("Could not check this location.");
    if (existing.data) return existing.data;

    const detailsUrl = new URL(
      `${GOOGLE_MAPS_GATEWAY}/places/v1/places/${encodeURIComponent(data.placeId)}`,
    );
    detailsUrl.searchParams.set("sessionToken", data.sessionToken);
    const response = await fetch(detailsUrl, {
      headers: googleHeaders("id,displayName,formattedAddress,location,addressComponents"),
    });
    if (!response.ok) await throwGoogleError(response);
    const place = (await response.json()) as {
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
      addressComponents?: Array<{ shortText?: string; types?: string[] }>;
    };
    const country = place.addressComponents?.find((part) => part.types?.includes("country"));
    if (country?.shortText?.toUpperCase() !== "IN") {
      throw new Error("Please select a location in India.");
    }
    const name = place.displayName?.text?.trim();
    const latitude = place.location?.latitude;
    const longitude = place.location?.longitude;
    if (!place.id || !name || !place.formattedAddress || latitude == null || longitude == null) {
      throw new Error("This place does not have enough location details.");
    }

    const { data: saved, error } = await supabaseAdmin
      .from("locations")
      .upsert(
        {
          provider_place_id: place.id,
          name,
          area: place.formattedAddress,
          formatted_address: place.formattedAddress,
          latitude,
          longitude,
          source: "google",
          is_active: true,
        },
        { onConflict: "provider_place_id" },
      )
      .select("id, name, area, formatted_address, latitude, longitude, is_active")
      .single();
    if (error) throw new Error("Could not save this location.");
    return saved;
  });

async function getLocationCoordinates(
  locationId: string,
  supabaseAdmin: SupabaseClient<Database>,
): Promise<LocationCoordinates> {
  const { data: location, error } = await supabaseAdmin
    .from("locations")
    .select("name, area, formatted_address, latitude, longitude")
    .eq("id", locationId)
    .single();
  if (error) throw new Error("Could not load the selected location.");
  if (location.latitude != null && location.longitude != null) {
    return { latitude: Number(location.latitude), longitude: Number(location.longitude) };
  }

  const address =
    location.formatted_address ||
    [location.name, location.area, "Bihar, India"].filter(Boolean).join(", ");
  const geocodeUrl = new URL(`${GOOGLE_MAPS_GATEWAY}/maps/api/geocode/json`);
  geocodeUrl.searchParams.set("address", address);
  geocodeUrl.searchParams.set("components", "country:IN");
  const response = await fetch(geocodeUrl, { headers: googleHeaders() });
  if (!response.ok) await throwGoogleError(response);
  const payload = (await response.json()) as {
    status?: string;
    results?: Array<{ geometry?: { location?: { lat?: number; lng?: number } } }>;
  };
  const point = payload.results?.[0]?.geometry?.location;
  if (payload.status !== "OK" || point?.lat == null || point.lng == null) {
    throw new Error(`Driving distance is unavailable for ${location.name}.`);
  }
  await supabaseAdmin
    .from("locations")
    .update({ latitude: point.lat, longitude: point.lng })
    .eq("id", locationId);
  return { latitude: point.lat, longitude: point.lng };
}

export const getDrivingDistance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => routeDistanceInput.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [origin, destination] = await Promise.all([
      getLocationCoordinates(data.fromLocationId, supabaseAdmin),
      getLocationCoordinates(data.toLocationId, supabaseAdmin),
    ]);
    const response = await fetch(`${GOOGLE_MAPS_GATEWAY}/routes/directions/v2:computeRoutes`, {
      method: "POST",
      headers: googleHeaders("routes.distanceMeters,routes.duration"),
      body: JSON.stringify({
        origin: { location: { latLng: origin } },
        destination: { location: { latLng: destination } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
      }),
    });
    if (!response.ok) await throwGoogleError(response);
    const payload = (await response.json()) as {
      routes?: Array<{ distanceMeters?: number; duration?: string }>;
    };
    const route = payload.routes?.[0];
    if (!route?.distanceMeters) throw new Error("No driving route was found between these places.");
    return {
      distanceKm: Math.round((route.distanceMeters / 1000) * 10) / 10,
      durationMinutes: route.duration
        ? Math.max(1, Math.round(Number.parseFloat(route.duration.replace("s", "")) / 60))
        : null,
    };
  });

/** Returns only the non-sensitive fields needed to compare currently available rides. */
export const getRiderOffers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => riderOfferInput.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date().toISOString().slice(0, 10);

    const { data: fares, error: fareError } = await supabaseAdmin
      .from("rider_route_fares")
      .select("rider_id, vehicle_id, share_fare, reserve_fare")
      .eq("from_location_id", data.fromLocationId)
      .eq("to_location_id", data.toLocationId)
      .eq("is_active", true);
    if (fareError) throw new Error("Could not load available fares.");
    if (!fares?.length) return [];

    const riderIds = [...new Set(fares.map((fare) => fare.rider_id))];
    const vehicleIds = fares.flatMap((fare) => (fare.vehicle_id ? [fare.vehicle_id] : []));
    const [ridersRes, profilesRes, vehiclesRes, categoriesRes, ratingsRes] = await Promise.all([
      supabaseAdmin
        .from("rider_details")
        .select("user_id")
        .in("user_id", riderIds)
        .eq("is_approved", true)
        .eq("is_blocked", false)
        .eq("is_online", true)
        .gte("subscription_valid_until", today),
      supabaseAdmin.from("profiles").select("id, full_name").in("id", riderIds),
      supabaseAdmin
        .from("rider_vehicles")
        .select("id, rider_id, vehicle_category_id, vehicle_number, seat_capacity")
        .in("id", vehicleIds)
        .eq("is_active", true),
      supabaseAdmin.from("vehicle_categories").select("id, name").eq("is_active", true),
      supabaseAdmin.from("ratings").select("rider_id, stars").in("rider_id", riderIds),
    ]);
    if (
      ridersRes.error ||
      profilesRes.error ||
      vehiclesRes.error ||
      categoriesRes.error ||
      ratingsRes.error
    ) {
      throw new Error("Could not load available riders.");
    }

    const availableRiders = new Set((ridersRes.data ?? []).map((rider) => rider.user_id));
    const profiles = new Map((profilesRes.data ?? []).map((profile) => [profile.id, profile]));
    const vehicles = new Map((vehiclesRes.data ?? []).map((vehicle) => [vehicle.id, vehicle]));
    const categories = new Map(
      (categoriesRes.data ?? []).map((category) => [category.id, category.name]),
    );
    const ratings = new Map<string, number[]>();
    for (const rating of ratingsRes.data ?? []) {
      const values = ratings.get(rating.rider_id) ?? [];
      values.push(Number(rating.stars));
      ratings.set(rating.rider_id, values);
    }

    return fares.flatMap((fare) => {
      if (!availableRiders.has(fare.rider_id) || !fare.vehicle_id) return [];
      const vehicle = vehicles.get(fare.vehicle_id);
      if (!vehicle || vehicle.rider_id !== fare.rider_id) return [];
      const values = ratings.get(fare.rider_id) ?? [];
      return [
        {
          riderId: fare.rider_id,
          vehicleId: vehicle.id,
          name: profiles.get(fare.rider_id)?.full_name || "Shahin driver",
          vehicleName: categories.get(vehicle.vehicle_category_id) ?? "Vehicle",
          vehicleNumber: vehicle.vehicle_number,
          seatCapacity: Number(vehicle.seat_capacity),
          shareFare: Number(fare.share_fare),
          reserveFare: Number(fare.reserve_fare),
          rating: values.length
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : null,
          trips: values.length,
        },
      ];
    });
  });

/** Creates a ride. The fare is always recalculated on the server from the rider's own route fares. */
export const createBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => bookingInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rider, error: riderError } = await supabaseAdmin
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
    const { data: vehicle, error: vehicleError } = await supabaseAdmin
      .from("rider_vehicles")
      .select("id, rider_id, vehicle_category_id, seat_capacity, is_active")
      .eq("id", data.vehicleId)
      .eq("rider_id", data.riderId)
      .maybeSingle();
    if (vehicleError) throw new Error(vehicleError.message);
    if (!vehicle?.is_active) throw new Error("This vehicle is no longer available.");
    if (!rider.is_online) throw new Error("This rider is offline right now.");

    const { data: fare, error: fareError } = await supabaseAdmin
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
