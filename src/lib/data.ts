import { supabase } from "@/integrations/supabase/client";

export type Location = { id: string; name: string; area: string | null; is_active: boolean };
export type VehicleCategory = {
  id: string;
  name: string;
  description: string | null;
  seat_capacity: number;
  is_active: boolean;
  sort_order: number;
};

export async function fetchLocations(activeOnly = true): Promise<Location[]> {
  let q = supabase.from("locations").select("id, name, area, is_active").order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Location[];
}

export async function fetchCategories(activeOnly = true): Promise<VehicleCategory[]> {
  let q = supabase
    .from("vehicle_categories")
    .select("id, name, description, seat_capacity, is_active, sort_order")
    .order("sort_order")
    .order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as VehicleCategory[];
}

export type RiderOffer = {
  riderId: string;
  vehicleId: string;
  name: string;
  mobile: string;
  vehicleName: string;
  vehicleNumber: string | null;
  seatCapacity: number;
  shareFare: number;
  reserveFare: number;
  rating: number | null;
  trips: number;
};

/** Riders who are approved, subscribed, online and price the exact from -> to direction. */
export async function fetchRiderOffers(fromId: string, toId: string): Promise<RiderOffer[]> {
  const { data: fares, error } = await supabase
    .from("rider_route_fares")
    .select("rider_id, vehicle_id, share_fare, reserve_fare")
    .eq("from_location_id", fromId)
    .eq("to_location_id", toId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  const riderIds = (fares ?? []).map((f) => f.rider_id as string);
  if (riderIds.length === 0) return [];

  const today = new Date().toISOString().slice(0, 10);
  const vehicleIds = (fares ?? []).flatMap((fare) => (fare.vehicle_id ? [fare.vehicle_id] : []));
  const [ridersRes, profilesRes, vehiclesRes, categoriesRes, ratingsRes] = await Promise.all([
    supabase
      .from("rider_details")
      .select("user_id, is_approved, is_blocked, is_online, subscription_valid_until")
      .in("user_id", riderIds),
    supabase.from("profiles").select("id, full_name, mobile").in("id", riderIds),
    supabase
      .from("rider_vehicles")
      .select("id, vehicle_category_id, vehicle_number, seat_capacity, is_active")
      .in("id", vehicleIds),
    supabase.from("vehicle_categories").select("id, name"),
    supabase.from("ratings").select("rider_id, stars").in("rider_id", riderIds),
  ]);

  const profiles = new Map((profilesRes.data ?? []).map((p) => [p.id as string, p]));
  const vehicles = new Map(
    (vehiclesRes.data ?? []).map((vehicle) => [vehicle.id as string, vehicle]),
  );
  const categories = new Map(
    (categoriesRes.data ?? []).map((c) => [c.id as string, c.name as string]),
  );
  const ratingsByRider = new Map<string, number[]>();
  for (const r of ratingsRes.data ?? []) {
    const list = ratingsByRider.get(r.rider_id as string) ?? [];
    list.push(Number(r.stars));
    ratingsByRider.set(r.rider_id as string, list);
  }

  const offers: RiderOffer[] = [];
  for (const fare of fares ?? []) {
    const rider = (ridersRes.data ?? []).find((r) => r.user_id === fare.rider_id);
    if (!rider) continue;
    if (!fare.vehicle_id) continue;
    const vehicle = vehicles.get(fare.vehicle_id);
    if (!vehicle?.is_active || !rider.is_approved || !rider.is_online || rider.is_blocked) continue;
    if (!rider.subscription_valid_until || (rider.subscription_valid_until as string) < today)
      continue;
    const profile = profiles.get(fare.rider_id as string);
    const stars = ratingsByRider.get(fare.rider_id as string) ?? [];
    offers.push({
      riderId: fare.rider_id as string,
      vehicleId: fare.vehicle_id,
      name: (profile?.full_name as string) || "Shahin driver",
      mobile: (profile?.mobile as string) || "",
      vehicleName: categories.get(vehicle.vehicle_category_id) ?? "Vehicle",
      vehicleNumber: vehicle.vehicle_number,
      seatCapacity: Number(vehicle.seat_capacity),
      shareFare: Number(fare.share_fare),
      reserveFare: Number(fare.reserve_fare),
      rating: stars.length ? stars.reduce((a, b) => a + b, 0) / stars.length : null,
      trips: stars.length,
    });
  }
  return offers;
}
