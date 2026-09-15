import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const BANNER_IMAGE_BUCKET = "promotional-banners";

export type PromotionalBanner = {
  id: string;
  title: string;
  subtitle: string;
  /** Ready-to-render source (signed storage URL, or the original link for legacy rows). */
  imageUrl: string | null;
  /** Exactly what is stored in the database: a storage path or an external URL. */
  imageRef: string | null;
  actionUrl: string | null;
  badgeText: string | null;
  displayOrder: number;
  isActive: boolean;
};

type BannerRow = {
  id: string;
  title: string;
  subtitle: string;
  image_url: string | null;
  action_url: string | null;
  badge_text: string | null;
  display_order: number;
  is_active: boolean;
};

/** Stored values that are already usable as-is (legacy rows, external links). */
export function isExternalImageRef(value: string): boolean {
  return /^(https?:\/\/|data:|\/)/i.test(value);
}

export async function resolveBannerImage(ref: string | null): Promise<string | null> {
  if (!ref) return null;
  if (isExternalImageRef(ref)) return ref;
  const { data } = await supabase.storage
    .from(BANNER_IMAGE_BUCKET)
    .createSignedUrl(ref, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}

async function toBanner(row: BannerRow): Promise<PromotionalBanner> {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: await resolveBannerImage(row.image_url),
    imageRef: row.image_url,
    actionUrl: row.action_url,
    badgeText: row.badge_text,
    displayOrder: row.display_order,
    isActive: row.is_active,
  };
}

export async function fetchBanners(activeOnly: boolean): Promise<PromotionalBanner[]> {
  let query = supabase
    .from("promotional_banners")
    .select("id, title, subtitle, image_url, action_url, badge_text, display_order, is_active")
    .order("display_order", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return Promise.all((data ?? []).map(toBanner));
}

export function useBanners(activeOnly = true) {
  return useQuery({
    queryKey: ["promotional-banners", activeOnly],
    queryFn: () => fetchBanners(activeOnly),
    staleTime: 60_000,
  });
}

/** Uploads a banner picture and returns the storage path to save on the banner row. */
export async function uploadBannerImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Image must be 5 MB or smaller.");
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(BANNER_IMAGE_BUCKET)
    .upload(path, file, { cacheControl: "31536000", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export async function removeBannerImage(ref: string | null): Promise<void> {
  if (!ref || isExternalImageRef(ref)) return;
  await supabase.storage.from(BANNER_IMAGE_BUCKET).remove([ref]);
}
