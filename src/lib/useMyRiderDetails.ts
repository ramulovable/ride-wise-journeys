import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type RiderDetails } from "@/lib/auth";

/**
 * Live rider_details for the signed-in driver. Falls back to the auth context
 * snapshot until the first fetch resolves, then keeps itself fresh via polling
 * plus a realtime subscription so admin changes (blue tick, approval,
 * subscription) appear without a re-login.
 */
export function useMyRiderDetails(): RiderDetails | null {
  const { user, riderDetails } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id;

  const query = useQuery({
    queryKey: ["my-rider-details", userId],
    enabled: Boolean(userId),
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rider_details")
        .select("*")
        .eq("user_id", userId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as RiderDetails) ?? null;
    },
  });

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`my-rider-details-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rider_details",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ["my-rider-details", userId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, qc]);

  return query.data ?? riderDetails;
}
