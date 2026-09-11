import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Phone, Star } from "lucide-react";
import { CustomerShell } from "@/components/shells";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDateTime, RIDE_FLOW, RIDE_STATUS_LABEL, rupees } from "@/lib/format";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/app/ride/$rideId")({
  head: () => ({
    meta: [
      { title: "Ride status — Shahin Travels" },
      { name: "description", content: "Live status of your Shahin Travels ride." },
      { property: "og:title", content: "Ride status — Shahin Travels" },
      { property: "og:description", content: "Live status of your Shahin Travels ride." },
    ],
  }),
  component: RideDetail,
});

function RideDetail() {
  useRoleGuard("customer");
  const { rideId } = Route.useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");

  const ride = useQuery({
    queryKey: ["ride", rideId],
    queryFn: async () => {
      const { data, error } = await supabase.from("rides").select("*").eq("id", rideId).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const places = useQuery({
    queryKey: ["locations", "all"],
    queryFn: async () => {
      const { data } = await supabase.from("locations").select("id, name");
      return data ?? [];
    },
  });

  const driver = useQuery({
    queryKey: ["driver", ride.data?.rider_id],
    enabled: Boolean(ride.data?.rider_id),
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, mobile")
        .eq("id", ride.data!.rider_id!)
        .maybeSingle();
      return data;
    },
  });

  const rating = useQuery({
    queryKey: ["rating", rideId],
    queryFn: async () => {
      const { data } = await supabase.from("ratings").select("stars").eq("ride_id", rideId).maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    const channel = supabase
      .channel(`ride-${rideId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rides", filter: `id=eq.${rideId}` }, () => {
        void queryClient.invalidateQueries({ queryKey: ["ride", rideId] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [rideId, queryClient]);

  const placeName = (id?: string | null) => places.data?.find((p) => p.id === id)?.name ?? "—";

  async function cancelRide() {
    const { error } = await supabase
      .from("rides")
      .update({ status: "cancelled", cancel_reason: "Cancelled by customer", cancelled_by: user?.id ?? null })
      .eq("id", rideId);
    if (error) return toast.error(error.message);
    toast.success("Ride cancelled.");
    void queryClient.invalidateQueries({ queryKey: ["ride", rideId] });
  }

  async function submitRating() {
    if (!ride.data?.rider_id || stars < 1) return toast.error("Pick a star rating first.");
    const { error } = await supabase.from("ratings").insert({
      ride_id: rideId,
      customer_id: user!.id,
      rider_id: ride.data.rider_id,
      stars,
      comment: comment.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Thanks for rating your driver!");
    void queryClient.invalidateQueries({ queryKey: ["rating", rideId] });
  }

  const r = ride.data;
  const canCancel = r && ["requested", "searching", "accepted", "on_the_way", "arrived"].includes(r.status);

  return (
    <CustomerShell title="Ride status">
      {!r ? (
        <p className="text-sm text-muted-foreground">Loading ride…</p>
      ) : (
        <div className="space-y-4">
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
              {r.booking_type === "share" ? `Share • ${rupees(r.unit_fare)} × ${r.passengers}` : "Reserve • fixed price"} •
              cash on completion
            </p>
          </section>

          {r.status !== "cancelled" ? (
            <section className="rounded-2xl border border-border bg-card p-4">
              <ol className="space-y-2">
                {RIDE_FLOW.map((step) => {
                  const done = RIDE_FLOW.indexOf(r.status as (typeof RIDE_FLOW)[number]) >= RIDE_FLOW.indexOf(step);
                  return (
                    <li key={step} className="flex items-center gap-3 text-sm">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${done ? "bg-primary" : "bg-border"}`}
                        aria-hidden="true"
                      />
                      <span className={done ? "text-foreground" : "text-muted-foreground"}>
                        {RIDE_STATUS_LABEL[step]}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}

          {r.rider_id && driver.data ? (
            <section className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">{driver.data.full_name}</p>
                <p className="text-xs text-muted-foreground">Your driver</p>
              </div>
              <a href={`tel:${driver.data.mobile}`} className="inline-flex items-center gap-2 text-sm text-primary">
                <Phone className="h-4 w-4" /> Call
              </a>
            </section>
          ) : null}

          {canCancel ? (
            <Button variant="outline" className="w-full" onClick={cancelRide}>
              Cancel ride
            </Button>
          ) : null}

          {r.status === "completed" && !rating.data ? (
            <section className="rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-semibold text-foreground">Rate your driver</p>
              <div className="mt-2 flex gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} type="button" onClick={() => setStars(s)} aria-label={`${s} star`}>
                    <Star className={`h-7 w-7 ${s <= stars ? "fill-accent text-accent" : "text-border"}`} />
                  </button>
                ))}
              </div>
              <Textarea
                className="mt-3"
                placeholder="Any feedback? (optional)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <Button className="mt-3 w-full" onClick={submitRating}>
                Submit rating
              </Button>
            </section>
          ) : null}

          {rating.data ? <p className="text-center text-xs text-muted-foreground">You rated this ride.</p> : null}
        </div>
      )}
    </CustomerShell>
  );
}
