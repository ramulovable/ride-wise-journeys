import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RiderShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchLocations } from "@/lib/data";
import { formatDateTime, RIDE_STATUS_LABEL, rupees } from "@/lib/format";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/rider/rides")({
  head: () => ({
    meta: [
      { title: "Ride history — Shahin Travels driver" },
      { name: "description", content: "All your completed and cancelled Shahin Travels trips." },
      { property: "og:title", content: "Ride history — Shahin Travels driver" },
      { property: "og:description", content: "All your completed and cancelled trips." },
    ],
  }),
  component: RiderRides,
});

function RiderRides() {
  useRoleGuard("rider");
  const { user } = useAuth();
  const locations = useQuery({
    queryKey: ["locations", "all"],
    queryFn: () => fetchLocations(false),
  });
  const rides = useQuery({
    queryKey: ["rider-history", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rides")
        .select("*")
        .eq("rider_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const place = (id: string) => locations.data?.find((x) => x.id === id)?.name ?? "—";

  return (
    <RiderShell title="My bookings" subtitle="Every trip you have taken.">
      {rides.isSuccess && rides.data.length === 0 ? (
        <EmptyState title="No trips yet" description="Accepted trips will be listed here." />
      ) : (
        <div className="space-y-2">
          {(rides.data ?? []).map((ride) => (
            <article
              key={ride.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {place(ride.from_location_id)} → {place(ride.to_location_id)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDateTime(ride.created_at)} ·{" "}
                  {RIDE_STATUS_LABEL[ride.status] ?? ride.status}
                </p>
              </div>
              <strong className="text-primary">{rupees(ride.total_fare)}</strong>
            </article>
          ))}
        </div>
      )}
    </RiderShell>
  );
}
