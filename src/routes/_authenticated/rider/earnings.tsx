import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RiderShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDateTime, rupees } from "@/lib/format";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/rider/earnings")({
  head: () => ({
    meta: [
      { title: "Earnings — Shahin Travels driver" },
      { name: "description", content: "Cash earnings credited for your completed trips." },
      { property: "og:title", content: "Earnings — Shahin Travels driver" },
      { property: "og:description", content: "Cash earnings credited for completed trips." },
    ],
  }),
  component: Earnings,
});

function Earnings() {
  useRoleGuard("rider");
  const { user } = useAuth();
  const earnings = useQuery({
    queryKey: ["earning-transactions", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("earning_transactions")
        .select("id, amount, created_at, ride_id")
        .eq("rider_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const total = (earnings.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);

  return (
    <RiderShell title="Earnings" subtitle="Cash collected on completed trips.">
      <div className="mb-4 rounded-2xl bg-primary/10 p-4">
        <p className="text-xs text-muted-foreground">Total earned</p>
        <p className="text-2xl font-bold text-primary">{total ? rupees(total) : "—"}</p>
      </div>
      {earnings.isSuccess && earnings.data.length === 0 ? (
        <EmptyState
          title="No earnings yet"
          description="Earnings appear here once you complete a trip."
        />
      ) : (
        <div className="space-y-2">
          {(earnings.data ?? []).map((row) => (
            <div
              key={row.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-3 text-sm"
            >
              <span className="text-muted-foreground">{formatDateTime(row.created_at)}</span>
              <strong>{rupees(Number(row.amount))}</strong>
            </div>
          ))}
        </div>
      )}
    </RiderShell>
  );
}
