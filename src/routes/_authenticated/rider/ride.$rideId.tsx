import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RiderShell } from "@/components/shells";
import { Button } from "@/components/ui/button";
import { LiveRideMap, useDriverLocationBroadcast } from "@/components/LiveRideMap";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { updateRiderRide } from "@/lib/api.functions";
import { formatDateTime, RIDE_STATUS_LABEL, rupees } from "@/lib/format";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/rider/ride/$rideId")({
  head: () => ({
    meta: [
      { title: "Live navigation — Shahin Travels driver" },
      {
        name: "description",
        content: "Live route, traffic and trip controls for your active ride.",
      },
      { property: "og:title", content: "Live navigation — Shahin Travels driver" },
      { property: "og:description", content: "Live route, traffic and trip controls." },
    ],
  }),
  component: RiderRideDetail,
});

const NEXT: Record<string, "on_the_way" | "arrived" | "started" | "completed"> = {
  accepted: "on_the_way",
  on_the_way: "arrived",
  arrived: "started",
  started: "completed",
};

function RiderRideDetail() {
  useRoleGuard("rider");
  const { rideId } = Route.useParams();
  const { user } = useAuth();
  const qc = useQueryClient();

  const ride = useQuery({
    queryKey: ["ride", rideId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rides")
        .select("*")
        .eq("id", rideId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });
  const places = useQuery({
    queryKey: ["locations", "all-names"],
    queryFn: async () => (await supabase.from("locations").select("id, name")).data ?? [],
  });

  useEffect(() => {
    const channel = supabase
      .channel(`rider-ride-${rideId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rides", filter: `id=eq.${rideId}` },
        () => void qc.invalidateQueries({ queryKey: ["ride", rideId] }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [rideId, qc]);

  const r = ride.data;
  const live = Boolean(
    r && user && r.rider_id === user.id && !["completed", "cancelled"].includes(r.status),
  );
  const broadcast = useDriverLocationBroadcast(rideId, user?.id ?? null, live);

  const advance = useMutation({
    mutationFn: (action: "on_the_way" | "arrived" | "started" | "completed") =>
      updateRiderRide({ data: { rideId, action } }),
    onSuccess: () => {
      toast.success("Trip updated.");
      void qc.invalidateQueries({ queryKey: ["ride", rideId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const placeName = (id?: string | null) => places.data?.find((p) => p.id === id)?.name ?? "—";
  const next = r ? NEXT[r.status] : undefined;

  return (
    <RiderShell title="Live navigation" subtitle="Follow the route and update trip progress.">
      {!r ? (
        <p className="text-sm text-muted-foreground">Loading trip…</p>
      ) : (
        <div className="space-y-4">
          <LiveRideMap rideId={rideId} active={live} className="h-72 w-full rounded-2xl" />
          {broadcast.denied ? (
            <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive">
              Location access is blocked. Allow location so the customer can track you.
            </p>
          ) : null}

          <section className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm font-semibold text-foreground">
              {placeName(r.from_location_id)} → {placeName(r.to_location_id)}
            </p>
            <p className="text-xs text-muted-foreground">Booked {formatDateTime(r.created_at)}</p>
            <div className="mt-3 flex items-center justify-between">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {RIDE_STATUS_LABEL[r.status] ?? r.status}
              </span>
              <span className="text-lg font-bold text-foreground">{rupees(r.total_fare)}</span>
            </div>
            <p className="mt-1 text-right text-[11px] text-muted-foreground">
              {r.distance_km ? `${r.distance_km} km · ` : ""}cash on completion
            </p>
          </section>

          {next ? (
            <Button
              className="w-full"
              disabled={advance.isPending}
              onClick={() => advance.mutate(next)}
            >
              {next === "completed"
                ? "Complete · Cash received"
                : `Mark ${RIDE_STATUS_LABEL[next]}`}
            </Button>
          ) : null}
        </div>
      )}
    </RiderShell>
  );
}
