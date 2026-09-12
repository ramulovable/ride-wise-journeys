import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RiderShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { acceptRide, updateRiderRide } from "@/lib/api.functions";
import { subscriptionActive, useAuth } from "@/lib/auth";
import { fetchLocations } from "@/lib/data";
import { formatDateTime, RIDE_STATUS_LABEL, rupees } from "@/lib/format";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/rider/")({ component: RiderDashboard });

function RiderDashboard() {
  useRoleGuard("rider");
  const { user, riderDetails, refresh } = useAuth();
  const qc = useQueryClient();
  const locations = useQuery({
    queryKey: ["locations", "all"],
    queryFn: () => fetchLocations(false),
  });
  const rides = useQuery({
    queryKey: ["rider-rides", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rides")
        .select("*")
        .or(`rider_id.eq.${user!.id},and(rider_id.is.null,status.eq.searching)`)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const vehicles = useQuery({
    queryKey: ["vehicles", user?.id],
    enabled: Boolean(user),
    queryFn: async () => (await supabase.from("rider_vehicles").select("id, vehicle_category_id, vehicle_number, has_ac").eq("rider_id", user!.id).eq("is_active", true)).data ?? [],
  });
  const action = useMutation({
    mutationFn: async ({
      rideId,
      next,
    }: {
      rideId: string;
      next: "accept" | "reject" | "on_the_way" | "arrived" | "started" | "completed";
    }) =>
      next === "accept"
        ? (() => { const ride = rides.data?.find((item) => item.id === rideId); const vehicle = vehicles.data?.find((item) => item.vehicle_category_id === ride?.requested_category_id && (ride?.requested_ac == null || item.has_ac === ride.requested_ac)); if (!vehicle) throw new Error("No eligible active vehicle for this booking."); return acceptRide({ data: { rideId, vehicleId: vehicle.id } }); })()
        : updateRiderRide({ data: { rideId, action: next } }),
    onSuccess: () => {
      toast.success("Ride updated.");
      void qc.invalidateQueries({ queryKey: ["rider-rides"] });
    },
    onError: (e) => toast.error(e.message),
  });
  const eligible = subscriptionActive(riderDetails) && !riderDetails?.is_blocked;
  async function toggleOnline() {
    if (!eligible && !riderDetails?.is_online) {
      toast.error("Admin approval and an active subscription are required.");
      return;
    }
    const { error } = await supabase
      .from("rider_details")
      .update({ is_online: !riderDetails?.is_online })
      .eq("user_id", user!.id);
    if (error) toast.error(error.message);
    else {
      await refresh();
      toast.success(riderDetails?.is_online ? "You are offline." : "You are online.");
    }
  }
  const place = (id: string) => locations.data?.find((x) => x.id === id)?.name ?? "—";
  const active = (rides.data ?? []).filter((r) => !["completed", "cancelled"].includes(r.status) && (r.rider_id === user?.id || (r.rider_id === null && vehicles.data?.some((vehicle) => vehicle.vehicle_category_id === r.requested_category_id && (r.requested_ac == null || vehicle.has_ac === r.requested_ac)))));
  const history = (rides.data ?? []).filter((r) => ["completed", "cancelled"].includes(r.status));
  const nextAction = (status: string) =>
    (
      ({
        requested: "accept",
        searching: "accept",
        accepted: "on_the_way",
        on_the_way: "arrived",
        arrived: "started",
        started: "completed",
      }) as const
    )[status as "requested"];

  return (
    <RiderShell
      title="Driver dashboard"
      subtitle="Manage requests, trip progress and cash earnings."
    >
      <section className="mb-4 rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">Availability</p>
            <p className="text-xs text-muted-foreground">
              {eligible
                ? `Subscription valid until ${riderDetails?.subscription_valid_until}`
                : riderDetails?.is_blocked
                  ? "Account blocked"
                  : "Waiting for approval or subscription"}
            </p>
          </div>
          <Button
            onClick={toggleOnline}
            variant={riderDetails?.is_online ? "destructive" : "default"}
          >
            {riderDetails?.is_online ? "Go offline" : "Go online"}
          </Button>
        </div>
      </section>
      <h2 className="mb-2 font-semibold">Active requests</h2>
      {rides.isSuccess && active.length === 0 ? (
        <EmptyState
          title="No active requests"
          description="New customer requests assigned to your vehicle appear here."
        />
      ) : (
        <div className="space-y-3">
          {active.map((ride) => (
            <article key={ride.id} className="rounded-2xl border bg-card p-4">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {place(ride.from_location_id)} → {place(ride.to_location_id)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(ride.created_at)} · {ride.passengers} passenger(s)
                  </p>
                </div>
                <p className="font-bold text-primary">{rupees(ride.total_fare)}</p>
              </div>
              <Badge className="mt-3" variant="secondary">
                {RIDE_STATUS_LABEL[ride.status] ?? ride.status}
              </Badge>
              <div className="mt-3 flex gap-2">
                {nextAction(ride.status) ? (
                  <Button
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate({ rideId: ride.id, next: nextAction(ride.status)! })
                    }
                  >
                    {ride.status === "requested" || ride.status === "searching"
                      ? "Accept"
                      : ride.status === "started"
                        ? "Complete · Cash received"
                        : `Mark ${RIDE_STATUS_LABEL[nextAction(ride.status)!]}`}
                  </Button>
                ) : null}
                {ride.status === "requested" && ride.rider_id === user?.id ? (
                  <Button
                    variant="outline"
                    onClick={() => action.mutate({ rideId: ride.id, next: "reject" })}
                  >
                    Reject
                  </Button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
      <h2 className="mb-2 mt-6 font-semibold">Earnings & history</h2>
      <div className="mb-3 rounded-xl bg-primary/10 p-4">
        <p className="text-xs text-muted-foreground">Completed cash earnings</p>
        <p className="text-2xl font-bold text-primary">
          {rupees(
            history
              .filter((r) => r.status === "completed")
              .reduce((sum, r) => sum + Number(r.total_fare), 0),
          )}
        </p>
      </div>
      {history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No completed or cancelled rides yet.</p>
      ) : (
        <div className="space-y-2">
          {history.map((ride) => (
            <div
              key={ride.id}
              className="flex justify-between rounded-xl border bg-card p-3 text-sm"
            >
              <span>
                {place(ride.from_location_id)} → {place(ride.to_location_id)}
                <br />
                <span className="text-xs text-muted-foreground">
                  {RIDE_STATUS_LABEL[ride.status]}
                </span>
              </span>
              <strong>{rupees(ride.total_fare)}</strong>
            </div>
          ))}
        </div>
      )}
    </RiderShell>
  );
}
