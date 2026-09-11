import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CustomerShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDateTime, RIDE_STATUS_LABEL, rupees } from "@/lib/format";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { fetchLocations } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/app/rides")({
  head: () => ({
    meta: [
      { title: "My rides — Shahin Travels" },
      { name: "description", content: "Your Shahin Travels booking history and live rides." },
      { property: "og:title", content: "My rides — Shahin Travels" },
      { property: "og:description", content: "Your Shahin Travels booking history and live rides." },
    ],
  }),
  component: MyRides,
});

function MyRides() {
  useRoleGuard("customer");
  const { user } = useAuth();

  const locations = useQuery({ queryKey: ["locations", "all"], queryFn: () => fetchLocations(false) });
  const rides = useQuery({
    queryKey: ["my-rides", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rides")
        .select("*")
        .eq("customer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const name = (id: string) => locations.data?.find((l) => l.id === id)?.name ?? "—";

  return (
    <CustomerShell title="My rides">
      {rides.isSuccess && rides.data.length === 0 ? (
        <EmptyState title="No rides yet" description="Your bookings will appear here once you book your first ride." />
      ) : (
        <div className="space-y-3">
          {(rides.data ?? []).map((ride) => (
            <Link
              key={ride.id}
              to="/app/ride/$rideId"
              params={{ rideId: ride.id }}
              className="block rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {name(ride.from_location_id)} → {name(ride.to_location_id)}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(ride.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-primary">{rupees(ride.total_fare)}</p>
                  <p className="text-[11px] capitalize text-muted-foreground">{ride.booking_type}</p>
                </div>
              </div>
              <p className="mt-2 inline-block rounded-full bg-muted px-2.5 py-1 text-[11px] text-foreground">
                {RIDE_STATUS_LABEL[ride.status] ?? ride.status}
              </p>
            </Link>
          ))}
        </div>
      )}
    </CustomerShell>
  );
}
