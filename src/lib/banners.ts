import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PromotionalBanner = {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string | null;
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

function toBanner(row: BannerRow): PromotionalBanner {
  return {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: row.image_url,
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
  return (data ?? []).map(toBanner);
}

export function useBanners(activeOnly = true) {
  return useQuery({
    queryKey: ["promotional-banners", activeOnly],
    queryFn: () => fetchBanners(activeOnly),
    staleTime: 60_000,
  });
}
