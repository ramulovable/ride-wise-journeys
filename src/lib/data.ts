import { supabase } from "@/integrations/supabase/client";
import { getRiderOffers } from "@/lib/api.functions";

export type Location = {
  id: string;
  name: string;
  area: string | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  source: "preset" | "google";
  isActive: boolean;
  label: string;
};
export type VehicleCategory = {
  id: string;
  name: string;
  description: string | null;
  seat_capacity: number;
  is_active: boolean;
  sort_order: number;
};

export async function fetchLocations(activeOnly = true): Promise<Location[]> {
  let q = supabase
    .from("locations")
    .select("id, name, area, formatted_address, latitude, longitude, source, is_active")
    .order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((location) => ({
    id: location.id,
    name: location.name,
    area: location.area,
    formattedAddress: location.formatted_address,
    latitude: location.latitude,
    longitude: location.longitude,
    source: location.source as "preset" | "google",
    isActive: location.is_active,
    label:
      location.source === "google"
        ? location.formatted_address || location.area || location.name
        : location.area
          ? `${location.name} · ${location.area}`
          : location.name,
  }));
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
  return getRiderOffers({ data: { fromLocationId: fromId, toLocationId: toId } });
}
