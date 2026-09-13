import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type VehicleImage = {
  id: string;
  category_id: string | null;
  brand_id: string | null;
  model_id: string | null;
  variant_id: string | null;
  image_path: string;
  is_primary: boolean;
  is_active: boolean;
};

export type VehicleImageWithUrl = VehicleImage & { url: string | null };

export const VEHICLE_IMAGE_BUCKET = "vehicle-images";
/** Inline neutral vehicle silhouette used when no picture is configured. */
export const VEHICLE_IMAGE_FALLBACK =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64"><rect width="96" height="64" rx="10" fill="#e9eef5"/><path d="M18 40h60l-6-14a6 6 0 0 0-5.6-4H29.6A6 6 0 0 0 24 26z" fill="#9aa8bd"/><circle cx="30" cy="44" r="6" fill="#6b7a90"/><circle cx="66" cy="44" r="6" fill="#6b7a90"/></svg>`,
  );

async function signedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from(VEHICLE_IMAGE_BUCKET)
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export async function fetchVehicleImages(activeOnly = true): Promise<VehicleImageWithUrl[]> {
  let query = supabase
    .from("vehicle_images")
    .select("id, category_id, brand_id, model_id, variant_id, image_path, is_primary, is_active")
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: false });
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as VehicleImage[];
  return Promise.all(rows.map(async (row) => ({ ...row, url: await signedUrl(row.image_path) })));
}

export function useVehicleImages(activeOnly = true) {
  return useQuery({
    queryKey: ["vehicle-images", activeOnly],
    queryFn: () => fetchVehicleImages(activeOnly),
    staleTime: 5 * 60_000,
  });
}

export type VehicleImageTarget = {
  categoryId?: string | null;
  brandId?: string | null;
  modelId?: string | null;
  variantId?: string | null;
};

/** Variant → model → brand → category → built-in fallback. Never returns a broken source. */
export function resolveVehicleImage(
  images: VehicleImageWithUrl[] | undefined,
  target: VehicleImageTarget,
): string {
  if (!images?.length) return VEHICLE_IMAGE_FALLBACK;
  const pick = (predicate: (image: VehicleImageWithUrl) => boolean) => {
    const matches = images.filter((image) => predicate(image) && image.url);
    return matches.find((image) => image.is_primary) ?? matches[0];
  };
  const found =
    (target.variantId ? pick((i) => i.variant_id === target.variantId) : undefined) ??
    (target.modelId ? pick((i) => i.model_id === target.modelId) : undefined) ??
    (target.brandId ? pick((i) => i.brand_id === target.brandId) : undefined) ??
    (target.categoryId ? pick((i) => i.category_id === target.categoryId) : undefined);
  return found?.url ?? VEHICLE_IMAGE_FALLBACK;
}
