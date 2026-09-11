import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { fetchLocations } from "@/lib/data";
import { formatDateTime, RIDE_STATUS_LABEL, rupees } from "@/lib/format";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/admin/rides")({ component: Rides });
function Rides() {
  useRoleGuard("admin");
  const locations = useQuery({
    queryKey: ["locations", "all"],
    queryFn: () => fetchLocations(false),
  });
  const rides = useQuery({
    queryKey: ["admin-rides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rides")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const name = (id: string) => locations.data?.find((x) => x.id === id)?.name ?? "—";
  return (
    <AdminShell title="Booking monitor" subtitle="All live and historical bookings.">
      {rides.isSuccess && rides.data.length === 0 ? (
        <EmptyState title="No bookings" description="Customer bookings will appear here." />
      ) : (
        <div className="space-y-2">
          {rides.data?.map((r) => (
            <article key={r.id} className="rounded-xl border bg-card p-4">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {name(r.from_location_id)} → {name(r.to_location_id)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(r.created_at)} · {r.passengers} passenger(s) · {r.booking_type}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-primary">{rupees(r.total_fare)}</p>
                  <p className="text-xs">{RIDE_STATUS_LABEL[r.status] ?? r.status}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
