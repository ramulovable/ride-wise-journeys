import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const bookingInput = z.object({
  categoryId: z.string().uuid(),
  fromLocationId: z.string().uuid(),
  toLocationId: z.string().uuid(),
  bookingType: z.enum(["standard", "share", "reserve"]),
  requestedAc: z.boolean().optional(),
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

const fareOptionsInput = z
  .object({
    fromLocationId: z.string().uuid(),
    toLocationId: z.string().uuid(),
    passengers: z.number().int().min(1).max(20),
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
const drivingDistanceCache = new Map<
  string,
  { expiresAt: number; result: { distanceKm: number; durationMinutes: number | null } }
>();

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

    const preset = await supabaseAdmin
      .from("locations")
      .select("id, name, area, formatted_address, latitude, longitude, is_active")
      .eq("source", "preset")
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (preset.error) throw new Error("Could not match this location.");
    if (preset.data) {
      const { data: matched, error: matchError } = await supabaseAdmin
        .from("locations")
        .update({
          provider_place_id: place.id,
          formatted_address: place.formattedAddress,
          latitude,
          longitude,
        })
        .eq("id", preset.data.id)
        .select("id, name, area, formatted_address, latitude, longitude, is_active")
        .single();
      if (matchError) throw new Error("Could not match this location.");
      return matched;
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
    return calculateDrivingDistance(data.fromLocationId, data.toLocationId);
  });

async function calculateDrivingDistance(fromLocationId: string, toLocationId: string) {
  const cacheKey = `${fromLocationId}:${toLocationId}`;
  const cached = drivingDistanceCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.result;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [origin, destination] = await Promise.all([
    getLocationCoordinates(fromLocationId, supabaseAdmin),
    getLocationCoordinates(toLocationId, supabaseAdmin),
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
  const result = {
    distanceKm: Math.round((route.distanceMeters / 1000) * 10) / 10,
    durationMinutes: route.duration
      ? Math.max(1, Math.round(Number.parseFloat(route.duration.replace("s", "")) / 60))
      : null,
  };
  drivingDistanceCache.set(cacheKey, { expiresAt: Date.now() + 60 * 60_000, result });
  return result;
}

type FareRuleRow = Database["public"]["Tables"]["fare_rules"]["Row"];
type FareSlabRow = Database["public"]["Tables"]["fare_slabs"]["Row"];

function calculateRuleFare(
  rule: FareRuleRow,
  slabs: FareSlabRow[],
  distanceKm: number,
  passengers: number,
) {
  if (rule.rate_per_km != null) {
    const includedKm = Number(rule.included_km ?? distanceKm);
    const regularKm = Math.min(distanceKm, includedKm);
    const extraKm = Math.max(0, distanceKm - includedKm);
    const unitFare =
      Number(rule.rate_per_km) * regularKm +
      Number(rule.extra_km_rate ?? rule.rate_per_km) * extraKm;
    return { unitFare, totalFare: unitFare, pricingMode: "per_km", slab: null };
  }
  const active = slabs
    .filter((slab) => slab.is_active)
    .sort((a, b) => Number(a.min_km) - Number(b.min_km));
  const slab = active.find(
    (item) => distanceKm >= Number(item.min_km) && distanceKm <= Number(item.max_km),
  );
  if (slab) {
    const unitFare =
      slab.pricing_mode === "per_km" ? Number(slab.rate) * distanceKm : Number(slab.rate);
    return {
      unitFare,
      totalFare: rule.journey_type === "share" ? unitFare * passengers : unitFare,
      pricingMode: slab.pricing_mode,
      slab: { minKm: Number(slab.min_km), maxKm: Number(slab.max_km), rate: Number(slab.rate) },
    };
  }
  const last = active.at(-1);
  if (!last || distanceKm <= Number(last.max_km) || rule.extra_km_rate == null) return null;
  const base =
    last.pricing_mode === "per_km" ? Number(last.rate) * Number(last.max_km) : Number(last.rate);
  const unitFare = base + (distanceKm - Number(last.max_km)) * Number(rule.extra_km_rate);
  return {
    unitFare,
    totalFare: rule.journey_type === "share" ? unitFare * passengers : unitFare,
    pricingMode: `${last.pricing_mode}_plus_extra`,
    slab: { minKm: Number(last.min_km), maxKm: Number(last.max_km), rate: Number(last.rate) },
  };
}

async function loadFareOptions(fromLocationId: string, toLocationId: string, passengers: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const route = await calculateDrivingDistance(fromLocationId, toLocationId);
  const today = new Date().toISOString().slice(0, 10);
  const [categoriesResult, rulesResult, slabsResult, ridersResult, vehiclesResult] =
    await Promise.all([
      supabaseAdmin
        .from("vehicle_categories")
        .select("id, name, seat_capacity, vehicle_class")
        .eq("is_active", true),
      supabaseAdmin.from("fare_rules").select("*").eq("is_active", true),
      supabaseAdmin.from("fare_slabs").select("*").eq("is_active", true),
      supabaseAdmin
        .from("rider_details")
        .select("user_id")
        .eq("is_approved", true)
        .eq("is_blocked", false)
        .eq("is_online", true)
        .gte("subscription_valid_until", today),
      supabaseAdmin
        .from("rider_vehicles")
        .select("id, rider_id, vehicle_category_id, seat_capacity, has_ac")
        .eq("is_active", true),
    ]);
  if (
    categoriesResult.error ||
    rulesResult.error ||
    slabsResult.error ||
    ridersResult.error ||
    vehiclesResult.error
  )
    throw new Error("Could not calculate available fares.");
  const eligibleRiders = new Set((ridersResult.data ?? []).map((rider) => rider.user_id));
  const rules = rulesResult.data ?? [];
  const slabs = slabsResult.data ?? [];
  return {
    ...route,
    options: (categoriesResult.data ?? []).map((category) => {
      const matchingVehicles = (vehiclesResult.data ?? []).filter(
        (vehicle) =>
          vehicle.vehicle_category_id === category.id &&
          eligibleRiders.has(vehicle.rider_id) &&
          passengers <= vehicle.seat_capacity,
      );
      const journeyTypes =
        category.vehicle_class === "three_wheeler" ? ["share", "reserve"] : ["standard"];
      const acOptions = category.vehicle_class === "four_wheeler" ? [true, false] : [null];
      const fares = journeyTypes.flatMap((journeyType) =>
        acOptions.map((requestedAc) => {
          const acOption = requestedAc == null ? "any" : requestedAc ? "ac" : "non_ac";
          const rule = rules.find(
            (item) =>
              item.vehicle_class === category.vehicle_class &&
              item.journey_type === journeyType &&
              item.ac_option === acOption,
          );
          const hasVehicle = matchingVehicles.some(
            (vehicle) => requestedAc == null || vehicle.has_ac === requestedAc,
          );
          const calculated = rule
            ? calculateRuleFare(
                rule,
                slabs.filter((slab) => slab.fare_rule_id === rule.id),
                route.distanceKm,
                passengers,
              )
            : null;
          return {
            journeyType,
            requestedAc,
            available: Boolean(hasVehicle && calculated),
            fare: calculated?.totalFare ?? null,
            unitFare: calculated?.unitFare ?? null,
            reason: hasVehicle ? "Fare currently unavailable" : "No driver available",
            ruleId: rule?.id ?? null,
            calculation: calculated,
          };
        }),
      );
      return {
        categoryId: category.id,
        categoryName: category.name,
        vehicleClass: category.vehicle_class,
        seatCapacity: category.seat_capacity,
        fares,
      };
    }),
  };
}

export const getFareOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => fareOptionsInput.parse(data))
  .handler(async ({ data }) =>
    loadFareOptions(data.fromLocationId, data.toLocationId, data.passengers),
  );

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

/** Creates an unassigned broadcast ride with an immutable server-calculated fare snapshot. */
export const createBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => bookingInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: customerProfile, error: customerError } = await supabase
      .from("profiles")
      .select("is_blocked")
      .eq("id", userId)
      .single();
    if (customerError) throw new Error(customerError.message);
    if (customerProfile.is_blocked) {
      throw new Error("This customer account is blocked. Please contact support.");
    }

    const quote = await loadFareOptions(data.fromLocationId, data.toLocationId, data.passengers);
    const category = quote.options.find((item) => item.categoryId === data.categoryId);
    const option = category?.fares.find(
      (item) =>
        item.journeyType === data.bookingType && item.requestedAc === (data.requestedAc ?? null),
    );
    if (!category || !option?.available || option.fare == null || option.unitFare == null)
      throw new Error(option?.reason ?? "Fare currently unavailable");
    const snapshot = {
      ruleId: option.ruleId,
      vehicleClass: category.vehicleClass,
      categoryName: category.categoryName,
      journeyType: data.bookingType,
      requestedAc: data.requestedAc ?? null,
      distanceKm: quote.distanceKm,
      durationMinutes: quote.durationMinutes,
      unitFare: option.unitFare,
      totalFare: option.fare,
      passengers: data.passengers,
      calculation: option.calculation,
    };

    const { data: ride, error } = await supabase
      .from("rides")
      .insert({
        customer_id: userId,
        rider_id: null,
        from_location_id: data.fromLocationId,
        to_location_id: data.toLocationId,
        vehicle_category_id: data.categoryId,
        vehicle_id: null,
        requested_category_id: data.categoryId,
        requested_vehicle_class: category.vehicleClass,
        requested_ac: data.requestedAc ?? null,
        distance_km: quote.distanceKm,
        duration_minutes: quote.durationMinutes,
        fare_snapshot: snapshot,
        booking_type: data.bookingType,
        passengers: data.passengers,
        unit_fare: option.unitFare,
        total_fare: option.fare,
        status: "searching",
        pickup_note: data.pickupNote ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    return { rideId: ride.id as string, totalFare: option.fare };
  });

/** A rider accepts a pending ride. Blocked unless approved with an active subscription and online. */
export const acceptRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) =>
    z.object({ rideId: z.string().uuid(), vehicleId: z.string().uuid() }).parse(data),
  )
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

    const { data: updated, error } = await supabase.rpc("accept_broadcast_ride", {
      _ride_id: data.rideId,
      _vehicle_id: data.vehicleId,
    });
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("Booking is no longer available");
    return { ok: true };
  });

const rideActionInput = z.object({
  rideId: z.string().uuid(),
  action: z.enum(["on_the_way", "arrived", "started", "completed"]),
});

export const updateRiderRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => rideActionInput.parse(data))
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase.rpc("advance_rider_ride", {
      _ride_id: data.rideId,
      _action: data.action,
    });
    if (error) throw new Error(error.message);
    if (!updated) throw new Error("That ride action is no longer available.");
    return { ok: true };
  });

const adminRiderInput = z.object({ riderId: z.string().uuid() });
const adminCustomerInput = z.object({ customerId: z.string().uuid() });

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

export const getAdminCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [rolesResult, profilesResult, ridesResult] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, mobile, created_at, is_blocked")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("rides").select("customer_id"),
    ]);
    if (rolesResult.error || profilesResult.error || ridesResult.error) {
      throw new Error("Could not load customers.");
    }
    const rolesByUser = new Map<string, Set<string>>();
    for (const role of rolesResult.data ?? []) {
      const roles = rolesByUser.get(role.user_id) ?? new Set<string>();
      roles.add(role.role);
      rolesByUser.set(role.user_id, roles);
    }
    const rideCounts = new Map<string, number>();
    for (const ride of ridesResult.data ?? []) {
      rideCounts.set(ride.customer_id, (rideCounts.get(ride.customer_id) ?? 0) + 1);
    }
    return (profilesResult.data ?? [])
      .filter((profile) => {
        const roles = rolesByUser.get(profile.id);
        return roles?.has("customer") && !roles.has("admin") && !roles.has("rider");
      })
      .map((profile) => ({
        ...profile,
        totalRides: rideCounts.get(profile.id) ?? 0,
      }));
  });

export const setCustomerBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => adminCustomerInput.extend({ blocked: z.boolean() }).parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: customerRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", data.customerId)
      .eq("role", "customer")
      .maybeSingle();
    if (roleError || !customerRole) throw new Error("Customer account not found.");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_blocked: data.blocked })
      .eq("id", data.customerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getAdminRideAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rides, error: ridesError } = await supabaseAdmin
      .from("rides")
      .select("*")
      .order("created_at", { ascending: false });
    if (ridesError) throw new Error("Could not load booking history.");
    if (!rides?.length) return [];

    const profileIds = [
      ...new Set(
        rides.flatMap((ride) => [ride.customer_id, ...(ride.rider_id ? [ride.rider_id] : [])]),
      ),
    ];
    const locationIds = [
      ...new Set(rides.flatMap((ride) => [ride.from_location_id, ride.to_location_id])),
    ];
    const vehicleIds = [
      ...new Set(rides.flatMap((ride) => (ride.vehicle_id ? [ride.vehicle_id] : []))),
    ];
    const [profilesResult, locationsResult, vehiclesResult, categoriesResult, historyResult] =
      await Promise.all([
        supabaseAdmin.from("profiles").select("id, full_name, mobile").in("id", profileIds),
        supabaseAdmin
          .from("locations")
          .select("id, name, formatted_address, area")
          .in("id", locationIds),
        vehicleIds.length
          ? supabaseAdmin
              .from("rider_vehicles")
              .select("id, vehicle_category_id, vehicle_number, vehicle_model")
              .in("id", vehicleIds)
          : Promise.resolve({ data: [], error: null }),
        supabaseAdmin.from("vehicle_categories").select("id, name"),
        supabaseAdmin
          .from("ride_status_history")
          .select("ride_id, from_status, to_status, actor_id, reason, created_at")
          .in(
            "ride_id",
            rides.map((ride) => ride.id),
          )
          .order("created_at"),
      ]);
    if (
      profilesResult.error ||
      locationsResult.error ||
      vehiclesResult.error ||
      categoriesResult.error ||
      historyResult.error
    ) {
      throw new Error("Could not load complete booking details.");
    }
    const profiles = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile]));
    const locations = new Map(
      (locationsResult.data ?? []).map((location) => [location.id, location]),
    );
    const vehicles = new Map((vehiclesResult.data ?? []).map((vehicle) => [vehicle.id, vehicle]));
    const categories = new Map(
      (categoriesResult.data ?? []).map((category) => [category.id, category.name]),
    );

    return rides.map((ride) => {
      const vehicle = ride.vehicle_id ? vehicles.get(ride.vehicle_id) : undefined;
      const from = locations.get(ride.from_location_id);
      const to = locations.get(ride.to_location_id);
      return {
        ...ride,
        customer: profiles.get(ride.customer_id) ?? null,
        rider: ride.rider_id ? (profiles.get(ride.rider_id) ?? null) : null,
        vehicle: vehicle
          ? {
              number: vehicle.vehicle_number,
              model: vehicle.vehicle_model,
              type: categories.get(vehicle.vehicle_category_id) ?? "Vehicle",
            }
          : null,
        fromLocation: from
          ? { name: from.name, address: from.formatted_address || from.area }
          : null,
        toLocation: to ? { name: to.name, address: to.formatted_address || to.area } : null,
        history: (historyResult.data ?? []).filter((entry) => entry.ride_id === ride.id),
      };
    });
  });

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
