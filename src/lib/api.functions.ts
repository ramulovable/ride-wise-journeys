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
type DayNightConfigRow = Database["public"]["Tables"]["day_night_pricing_config"]["Row"];
type DayNightOverrideRow = Database["public"]["Tables"]["day_night_vehicle_overrides"]["Row"];

export const PRICING_TIMEZONE = "Asia/Kolkata";

/** Used only when no configuration row exists yet. */
const DEFAULT_DAY_NIGHT_CONFIG = {
  id: "default",
  is_enabled: true,
  day_start_time: "05:00:00",
  night_start_time: "20:00:00",
  pricing_mode: "multiplier",
  night_multiplier: 2,
  night_direct_rate: null,
  applies_to_per_km: true,
  applies_to_share: true,
  applies_to_reserve: true,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
} satisfies DayNightConfigRow;


const istFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: PRICING_TIMEZONE,
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Current wall-clock time in Indian Standard Time as HH:MM:SS — never the client clock. */
function istTimeString(now = new Date()) {
  return istFormatter.format(now);
}

function toSeconds(value: string) {
  const [h = "0", m = "0", s = "0"] = value.split(":");
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
}

/** Day window runs dayStart → nightStart; everything else (incl. past midnight) is night. */
export function resolvePricingPeriod(
  config: Pick<DayNightConfigRow, "day_start_time" | "night_start_time">,
  now = new Date(),
): "day" | "night" {
  const current = toSeconds(istTimeString(now));
  const dayStart = toSeconds(config.day_start_time);
  const nightStart = toSeconds(config.night_start_time);
  if (dayStart === nightStart) return "day";
  if (dayStart < nightStart) return current >= dayStart && current < nightStart ? "day" : "night";
  // Inverted configuration: day window itself crosses midnight.
  return current >= dayStart || current < nightStart ? "day" : "night";
}

type NightSettings = {
  enabled: boolean;
  pricingMode: "multiplier" | "direct_rate";
  multiplier: number;
  directRate: number | null;
};

function effectiveNightSettings(
  config: DayNightConfigRow,
  override: DayNightOverrideRow | undefined,
): NightSettings {
  const base: NightSettings = {
    enabled: config.is_enabled,
    pricingMode: config.pricing_mode === "direct_rate" ? "direct_rate" : "multiplier",
    multiplier: Number(config.night_multiplier),
    directRate: config.night_direct_rate == null ? null : Number(config.night_direct_rate),
  };
  if (!override || !override.is_active) return base;
  return {
    enabled: config.is_enabled && override.is_enabled,
    pricingMode: override.pricing_mode === "direct_rate" ? "direct_rate" : "multiplier",
    multiplier:
      override.night_multiplier == null ? base.multiplier : Number(override.night_multiplier),
    directRate:
      override.night_direct_rate == null ? base.directRate : Number(override.night_direct_rate),
  };
}

function appliesToJourney(config: DayNightConfigRow, journeyType: string) {
  if (journeyType === "share") return config.applies_to_share;
  if (journeyType === "reserve") return config.applies_to_reserve;
  return config.applies_to_per_km;
}

type BaseCalculation = ReturnType<typeof calculateRuleFare>;

/** Layers night pricing on top of an already calculated base fare. */
function applyDayNight(
  base: NonNullable<BaseCalculation>,
  options: {
    period: "day" | "night";
    config: DayNightConfigRow;
    settings: NightSettings;
    journeyType: string;
    distanceKm: number;
    passengers: number;
  },
) {
  const { period, config, settings, journeyType, distanceKm, passengers } = options;
  const baseUnitFare = base.unitFare;
  const active =
    period === "night" && settings.enabled && appliesToJourney(config, journeyType);

  let unitFare = baseUnitFare;
  let multiplierUsed: number | null = null;
  let nightRateOverride: number | null = null;

  if (active) {
    if (settings.pricingMode === "direct_rate" && settings.directRate != null) {
      nightRateOverride = settings.directRate;
      unitFare = settings.directRate * distanceKm;
    } else {
      multiplierUsed = settings.multiplier;
      unitFare = baseUnitFare * settings.multiplier;
    }
  }

  unitFare = Math.round(unitFare * 100) / 100;
  const totalFare =
    Math.round((journeyType === "share" ? unitFare * passengers : unitFare) * 100) / 100;

  return {
    ...base,
    unitFare,
    totalFare,
    baseUnitFare,
    baseFare: Math.round((journeyType === "share" ? baseUnitFare * passengers : baseUnitFare) * 100) / 100,
    pricingPeriod: period,
    nightPricingApplied: active,
    nightPricingMode: active ? settings.pricingMode : null,
    multiplierUsed,
    nightRateOverride,
  };
}





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
  const [
    categoriesResult,
    rulesResult,
    slabsResult,
    ridersResult,
    vehiclesResult,
    configResult,
    overridesResult,
  ] = await Promise.all([
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
    supabaseAdmin
      .from("day_night_pricing_config")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin.from("day_night_vehicle_overrides").select("*").eq("is_active", true),
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
  const config = configResult.data ?? DEFAULT_DAY_NIGHT_CONFIG;
  const overrides = overridesResult.data ?? [];
  const calculatedAt = new Date();
  const period = resolvePricingPeriod(config, calculatedAt);
  return {
    ...route,
    pricingPeriod: period,
    pricingTimezone: PRICING_TIMEZONE,
    fareCalculatedAt: calculatedAt.toISOString(),
    options: (categoriesResult.data ?? []).map((category) => {
      const matchingVehicles = (vehiclesResult.data ?? []).filter(
        (vehicle) =>
          vehicle.vehicle_category_id === category.id &&
          eligibleRiders.has(vehicle.rider_id) &&
          passengers <= vehicle.seat_capacity,
      );
      const settings = effectiveNightSettings(
        config,
        overrides.find((item) => item.vehicle_category_id === category.id),
      );
      const journeyTypes = category.vehicle_class === "three_wheeler" ? ["share"] : ["standard"];
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
          const baseCalculated = rule
            ? calculateRuleFare(
                rule,
                slabs.filter((slab) => slab.fare_rule_id === rule.id),
                route.distanceKm,
                passengers,
              )
            : null;
          const calculated = baseCalculated
            ? applyDayNight(baseCalculated, {
                period,
                config,
                settings,
                journeyType,
                distanceKm: route.distanceKm,
                passengers,
              })
            : null;
          return {
            journeyType,
            requestedAc,
            available: Boolean(hasVehicle && calculated),
            fare: calculated?.totalFare ?? null,
            unitFare: calculated?.unitFare ?? null,
            baseFare: calculated?.baseFare ?? null,
            pricingPeriod: period,
            nightPricingApplied: calculated?.nightPricingApplied ?? false,
            multiplierUsed: calculated?.multiplierUsed ?? null,
            nightRateOverride: calculated?.nightRateOverride ?? null,
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
      base_fare: option.baseFare,
      pricing_period: option.pricingPeriod,
      pricing_mode: option.nightRateOverride != null ? "direct_rate" : "multiplier",
      multiplier_used: option.multiplierUsed,
      night_rate_override: option.nightRateOverride,
      distance_km: quote.distanceKm,
      vehicle_category: category.categoryName,
      final_fare: option.fare,
      timezone: PRICING_TIMEZONE,
      fare_calculated_at: quote.fareCalculatedAt,
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

    await notifyEligibleRiders(ride.id as string, {
      distanceKm: quote.distanceKm,
      fare: option.fare,
      categoryName: category.categoryName,
    });

    return { rideId: ride.id as string, totalFare: option.fare };
  });

/** Sends and records ride alerts for every eligible driver. Never blocks the booking. */
async function notifyEligibleRiders(
  rideId: string,
  info: { distanceKm: number | null; fare: number; categoryName: string },
) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const riderIds = await eligibleRiderIds(rideId);
    if (riderIds.length === 0) return;

    const { data: ride } = await supabaseAdmin
      .from("rides")
      .select("from_location_id, to_location_id")
      .eq("id", rideId)
      .maybeSingle();
    const { data: places } = await supabaseAdmin
      .from("locations")
      .select("id, name")
      .in("id", [ride?.from_location_id, ride?.to_location_id].filter(Boolean) as string[]);
    const nameOf = (id: string | null | undefined) =>
      places?.find((place) => place.id === id)?.name ?? "—";

    const [{ data: textRows }] = await Promise.all([
      supabaseAdmin.from("app_text_settings").select("key, value"),
    ]);
    const text = new Map((textRows ?? []).map((row) => [row.key, row.value]));
    const pickup = nameOf(ride?.from_location_id);
    const drop = nameOf(ride?.to_location_id);
    const fill = (template: string) =>
      template
        .replaceAll("{pickup}", pickup)
        .replaceAll("{drop}", drop)
        .replaceAll("{distance}", info.distanceKm == null ? "—" : String(info.distanceKm))
        .replaceAll("{fare}", String(info.fare))
        .replaceAll("{category}", info.categoryName);
    const title = fill(text.get("push_title_template") || "New ride request");
    const body = fill(
      text.get("push_body_template") || "{pickup} to {drop} · {distance} km · Rs {fare}",
    );
    const path = `/rider?bookingId=${rideId}`;
    const payloadData = {
      bookingId: rideId,
      pickup,
      drop,
      distanceKm: info.distanceKm,
      fare: info.fare,
      category: info.categoryName,
      path,
    };

    await deliverPush({
      userIds: riderIds,
      rideId,
      title,
      body,
      path,
      payloadData,
    });
  } catch (pushError) {
    console.error("Ride alert dispatch failed", pushError);
  }
}

/**
 * Records notifications and delivers high-priority background pushes through the
 * Firebase Cloud Messaging connector gateway. Inactive/unknown tokens are deactivated.
 */
async function deliverPush(args: {
  userIds: string[];
  rideId: string;
  title: string;
  body: string;
  path: string;
  payloadData: Record<string, unknown>;
}) {
  const { userIds, rideId, title, body, path, payloadData } = args;
  if (userIds.length === 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: inserted } = await supabaseAdmin
    .from("notifications")
    .insert(
      userIds.map((userId) => ({
        user_id: userId,
        ride_id: rideId,
        title,
        body,
        channel: "push",
        data: payloadData as never,
        delivered: false,
      })),
    )
    .select("id, user_id");

  const lovableKey = process.env["LOVABLE_API_KEY"];
  const fcmKey = process.env["FIREBASE_MESSAGING_API_KEY"];
  if (!lovableKey || !fcmKey) return;

  const { data: devices } = await supabaseAdmin
    .from("notification_devices")
    .select("user_id, push_token")
    .eq("is_active", true)
    .in("user_id", userIds);
  if (!devices?.length) return;

  await Promise.all(
    devices.map(async (device) => {
      const response = await fetch(
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
              token: device.push_token,
              notification: { title, body },
              data: { path, bookingId: rideId, title, body },
              android: {
                priority: "HIGH",
                notification: {
                  sound: "default",
                  default_vibrate_timings: false,
                  vibrate_timings: ["0s", "0.5s", "0.3s", "0.5s"],
                  channel_id: "ride_alerts",
                  notification_priority: "PRIORITY_MAX",
                },
              },
              apns: {
                headers: { "apns-priority": "10" },
                payload: { aps: { sound: "default", "interruption-level": "time-sensitive" } },
              },
              webpush: {
                headers: { Urgency: "high", TTL: "600" },
                notification: {
                  title,
                  body,
                  icon: "/favicon.png",
                  badge: "/favicon.png",
                  vibrate: [0, 500, 300, 500],
                  requireInteraction: true,
                  renotify: true,
                  tag: `ride-${rideId}`,
                },
                fcm_options: { link: path },
              },
            },
          }),
        },
      );
      if (response.ok) {
        const row = inserted?.find((item) => item.user_id === device.user_id);
        if (row) {
          await supabaseAdmin.from("notifications").update({ delivered: true }).eq("id", row.id);
        }
        return;
      }
      const errorBody = await response.text();
      console.error(`Push send failed [${response.status}]: ${errorBody}`);
      if (response.status === 404 || response.status === 400) {
        await supabaseAdmin
          .from("notification_devices")
          .update({ is_active: false })
          .eq("push_token", device.push_token);
      }
    }),
  );
}

/** Sends the customer a background alert whenever their ride moves to a new stage. */
async function notifyCustomerRideUpdate(rideId: string, stage: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ride } = await supabaseAdmin
      .from("rides")
      .select("customer_id, rider_id, vehicle_id")
      .eq("id", rideId)
      .maybeSingle();
    if (!ride?.customer_id) return;

    const [{ data: driver }, { data: vehicle }] = await Promise.all([
      ride.rider_id
        ? supabaseAdmin.from("profiles").select("full_name").eq("id", ride.rider_id).maybeSingle()
        : Promise.resolve({ data: null }),
      ride.vehicle_id
        ? supabaseAdmin
            .from("rider_vehicles")
            .select("vehicle_number, vehicle_model")
            .eq("id", ride.vehicle_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const driverName = driver?.full_name ?? "Your driver";
    const vehicleLabel = [vehicle?.vehicle_model, vehicle?.vehicle_number]
      .filter(Boolean)
      .join(" · ");
    const copy: Record<string, { title: string; body: string }> = {
      accepted: {
        title: "Ride Accepted! 🚗",
        body: `Driver ${driverName} has accepted your ride.${
          vehicleLabel ? ` Vehicle: ${vehicleLabel}.` : ""
        }`,
      },
      on_the_way: {
        title: "Driver on the way 🛣️",
        body: `${driverName} is heading to your pickup point.`,
      },
      arrived: {
        title: "Driver has arrived 📍",
        body: `${driverName} is waiting at your pickup point.`,
      },
      started: { title: "Ride started 🚀", body: "Your trip has begun. Have a safe journey!" },
      completed: {
        title: "Ride completed ✅",
        body: "Cash payment received. Thanks for riding with Shahin Travels!",
      },
    };
    const message = copy[stage];
    if (!message) return;
    const path = `/app/ride/${rideId}`;
    await deliverPush({
      userIds: [ride.customer_id],
      rideId,
      title: message.title,
      body: message.body,
      path,
      payloadData: { bookingId: rideId, stage, driverName, vehicle: vehicleLabel, path },
    });
  } catch (error) {
    console.error("Customer ride alert failed", error);
  }
}


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
    await notifyCustomerRideUpdate(data.rideId, "accepted");
    return { ok: true };
  });

/** Hides a pending broadcast only for the authenticated rider who declined it. */
export const dismissRide = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ rideId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: ride, error: rideError } = await context.supabase
      .from("rides")
      .select("id, rider_id, status")
      .eq("id", data.rideId)
      .maybeSingle();
    if (rideError) throw new Error(rideError.message);
    if (!ride || ride.rider_id !== null || !["requested", "searching"].includes(ride.status)) {
      throw new Error("Booking is no longer available");
    }

    const { error } = await context.supabase
      .from("ride_dismissals")
      .upsert(
        { rider_id: context.userId, ride_id: data.rideId },
        { onConflict: "rider_id,ride_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);

    const remaining = await countEligibleRiders(data.rideId);
    if (remaining === 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("rides")
        .update({ status: "no_rider_available" })
        .eq("id", data.rideId)
        .is("rider_id", null)
        .in("status", ["requested", "searching"]);
      return { ok: true, redispatched: false };
    }
    return { ok: true, redispatched: true };
  });

/** Counts online, eligible drivers with a matching vehicle who have not declined this booking. */
async function countEligibleRiders(rideId: string) {
  return (await eligibleRiderIds(rideId)).length;
}

/** Online, approved, subscribed drivers with a matching vehicle who have not declined. */
async function eligibleRiderIds(rideId: string): Promise<string[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const today = new Date().toISOString().slice(0, 10);
  const { data: ride } = await supabaseAdmin
    .from("rides")
    .select("requested_category_id, requested_ac, passengers")
    .eq("id", rideId)
    .maybeSingle();
  if (!ride?.requested_category_id) return [];

  const [ridersResult, vehiclesResult, dismissalsResult] = await Promise.all([
    supabaseAdmin
      .from("rider_details")
      .select("user_id")
      .eq("is_approved", true)
      .eq("is_blocked", false)
      .eq("is_online", true)
      .gte("subscription_valid_until", today),
    supabaseAdmin
      .from("rider_vehicles")
      .select("rider_id, has_ac, seat_capacity")
      .eq("is_active", true)
      .eq("vehicle_category_id", ride.requested_category_id),
    supabaseAdmin.from("ride_dismissals").select("rider_id").eq("ride_id", rideId),
  ]);
  const eligible = new Set((ridersResult.data ?? []).map((rider) => rider.user_id));
  const declined = new Set((dismissalsResult.data ?? []).map((row) => row.rider_id));
  return [
    ...new Set(
      (vehiclesResult.data ?? [])
        .filter(
          (vehicle) =>
            eligible.has(vehicle.rider_id) &&
            !declined.has(vehicle.rider_id) &&
            (ride.requested_ac == null || vehicle.has_ac === ride.requested_ac) &&
            ride.passengers <= vehicle.seat_capacity,
        )
        .map((vehicle) => vehicle.rider_id),
    ),
  ];
}

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
    await notifyCustomerRideUpdate(data.rideId, data.action);
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

export const deleteCustomerAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => adminCustomerInput.parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    if (data.customerId === context.userId)
      throw new Error("You cannot delete your own account.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: customerRole, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", data.customerId)
      .eq("role", "customer")
      .maybeSingle();
    if (roleError || !customerRole) throw new Error("Customer account not found.");

    const uid = data.customerId;
    const { data: rideRows } = await supabaseAdmin
      .from("rides")
      .select("id")
      .eq("customer_id", uid);
    const rideIds = (rideRows ?? []).map((r) => r.id);
    if (rideIds.length) {
      await supabaseAdmin.from("ride_status_history").delete().in("ride_id", rideIds);
      await supabaseAdmin.from("ride_dismissals").delete().in("ride_id", rideIds);
      await supabaseAdmin.from("notifications").delete().in("ride_id", rideIds);
      await supabaseAdmin.from("ratings").delete().in("ride_id", rideIds);
      await supabaseAdmin.from("earning_transactions").delete().in("ride_id", rideIds);
      await supabaseAdmin.from("rides").delete().in("id", rideIds);
    }
    await supabaseAdmin.from("notifications").delete().eq("user_id", uid);
    await supabaseAdmin.from("notification_devices").delete().eq("user_id", uid);
    await supabaseAdmin.from("ratings").delete().eq("customer_id", uid);
    await supabaseAdmin.from("support_requests").delete().eq("user_id", uid);
    await supabaseAdmin.from("withdrawal_requests").delete().eq("user_id", uid);
    await supabaseAdmin.from("wallet_transactions").delete().eq("user_id", uid);
    await supabaseAdmin.from("wallet_accounts").delete().eq("user_id", uid);
    await supabaseAdmin.from("referral_transactions").delete().eq("user_id", uid);
    await supabaseAdmin.from("referrals").delete().eq("referred_user_id", uid);
    await supabaseAdmin.from("referrals").delete().eq("referrer_user_id", uid);
    await supabaseAdmin.from("referral_codes").delete().eq("user_id", uid);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", uid);
    await supabaseAdmin.from("profiles").delete().eq("id", uid);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(uid);
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

/** Driver, vehicle and contact details for a booking, visible to that booking's customer only. */
export const getRideDriverDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((data: unknown) => z.object({ rideId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: ride, error } = await context.supabase
      .from("rides")
      .select("id, customer_id, rider_id, vehicle_id")
      .eq("id", data.rideId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ride || ride.customer_id !== context.userId) throw new Error("Booking not found.");
    if (!ride.rider_id) return null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [profileResult, vehicleResult] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("full_name, mobile, photo_url")
        .eq("id", ride.rider_id)
        .maybeSingle(),
      ride.vehicle_id
        ? supabaseAdmin
            .from("rider_vehicles")
            .select(
              "vehicle_number, vehicle_model, has_ac, seat_capacity, vehicle_category_id, brand_id, model_id",
            )
            .eq("id", ride.vehicle_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    const vehicle = vehicleResult.data;
    const [categoryResult, brandResult, modelResult] = await Promise.all([
      vehicle?.vehicle_category_id
        ? supabaseAdmin
            .from("vehicle_categories")
            .select("name")
            .eq("id", vehicle.vehicle_category_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      vehicle?.brand_id
        ? supabaseAdmin
            .from("vehicle_brands")
            .select("name")
            .eq("id", vehicle.brand_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      vehicle?.model_id
        ? supabaseAdmin
            .from("vehicle_models")
            .select("name")
            .eq("id", vehicle.model_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    let photoUrl: string | null = null;
    const photoPath = profileResult.data?.photo_url;
    if (photoPath && !photoPath.startsWith("http")) {
      const signed = await supabaseAdmin.storage
        .from("profile-photos")
        .createSignedUrl(photoPath, 60 * 60);
      photoUrl = signed.data?.signedUrl ?? null;
    } else if (photoPath) {
      photoUrl = photoPath;
    }

    return {
      name: profileResult.data?.full_name || "Shahin driver",
      mobile: profileResult.data?.mobile ?? null,
      photoUrl,
      vehicle: vehicle
        ? {
            number: vehicle.vehicle_number,
            type: categoryResult.data?.name ?? "Vehicle",
            brand: brandResult.data?.name ?? null,
            model: modelResult.data?.name ?? vehicle.vehicle_model,
            hasAc: vehicle.has_ac,
            seatCapacity: vehicle.seat_capacity,
          }
        : null,
    };
  });
