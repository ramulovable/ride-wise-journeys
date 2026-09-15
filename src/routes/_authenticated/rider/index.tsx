import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BadgeIndianRupee,
  ChevronRight,
  Clock,
  Crown,
  History,
  LifeBuoy,
  QrCode,
  Route as RouteIcon,
  Star,
  Truck,
  UserRound,
  Wallet,
} from "lucide-react";
import { RiderShell } from "@/components/shells";
import { ProfileAvatar, VerifiedByline, VerifiedTick } from "@/components/ProfileAvatar";
import { EmptyState } from "@/components/EmptyState";
import { EnablePushButton } from "@/components/EnablePushButton";
import { IstClock } from "@/components/IstClock";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { acceptRide, dismissRide, updateRiderRide } from "@/lib/api.functions";
import { subscriptionActive, useAuth } from "@/lib/auth";
import { useMyRiderDetails } from "@/lib/useMyRiderDetails";
import { fetchLocations } from "@/lib/data";
import { formatDate, RIDE_STATUS_LABEL, rupees } from "@/lib/format";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/rider/")({
  head: () => ({
    meta: [
      { title: "Driver dashboard — Shahin Travels" },
      { name: "description", content: "Manage Shahin Travels ride requests, trips and earnings." },
      { property: "og:title", content: "Driver dashboard — Shahin Travels" },
      {
        property: "og:description",
        content: "Manage Shahin Travels ride requests, trips and earnings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    bookingId: typeof search["bookingId"] === "string" ? search["bookingId"] : undefined,
  }),
  component: RiderDashboard,
});

const QUICK_ACTIONS = [
  { to: "/rider/vehicle", label: "My Vehicles", icon: <Truck className="h-5 w-5" /> },
  { to: "/fares", label: "My Routes & Fare", icon: <RouteIcon className="h-5 w-5" /> },
  { to: "/rider/earnings", label: "Earnings", icon: <BadgeIndianRupee className="h-5 w-5" /> },
  { to: "/wallet", label: "Wallet", icon: <Wallet className="h-5 w-5" /> },
  { to: "/rider/qr", label: "QR Code", icon: <QrCode className="h-5 w-5" /> },
  { to: "/rider/rides", label: "Rider History", icon: <History className="h-5 w-5" /> },
  { to: "/profile", label: "Profile", icon: <UserRound className="h-5 w-5" /> },
  { to: "/support", label: "Help & Support", icon: <LifeBuoy className="h-5 w-5" /> },
];

function minutesAgo(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  return `${Math.round(mins / 60)} h ago`;
}

function RiderDashboard() {
  useRoleGuard("rider");
  const { bookingId } = Route.useSearch();
  const { user, profile, refresh } = useAuth();
  const riderDetails = useMyRiderDetails();
  const qc = useQueryClient();

  const locations = useQuery({
    queryKey: ["locations", "all"],
    queryFn: () => fetchLocations(false),
  });
  const rides = useQuery({
    queryKey: ["rider-rides", user?.id],
    enabled: Boolean(user),
    refetchInterval: 20_000,
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
  const dismissals = useQuery({
    queryKey: ["ride-dismissals", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ride_dismissals")
        .select("ride_id")
        .eq("rider_id", user!.id);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const vehicles = useQuery({
    queryKey: ["vehicles", user?.id],
    enabled: Boolean(user),
    queryFn: async () =>
      (
        await supabase
          .from("rider_vehicles")
          .select("id, vehicle_category_id, vehicle_number, has_ac")
          .eq("rider_id", user!.id)
          .eq("is_active", true)
      ).data ?? [],
  });
  const ratings = useQuery({
    queryKey: ["rider-ratings", user?.id],
    enabled: Boolean(user),
    queryFn: async () =>
      (await supabase.from("ratings").select("stars").eq("rider_id", user!.id)).data ?? [],
  });
  const earnings = useQuery({
    queryKey: ["rider-earnings", user?.id],
    enabled: Boolean(user),
    queryFn: async () =>
      (await supabase.from("earning_transactions").select("amount").eq("rider_id", user!.id))
        .data ?? [],
  });

  const action = useMutation({
    mutationFn: async ({
      rideId,
      next,
    }: {
      rideId: string;
      next: "accept" | "on_the_way" | "arrived" | "started" | "completed";
    }) => {
      if (next !== "accept") return updateRiderRide({ data: { rideId, action: next } });
      const ride = rides.data?.find((item) => item.id === rideId);
      const vehicle = vehicles.data?.find(
        (item) =>
          item.vehicle_category_id === ride?.requested_category_id &&
          (ride?.requested_ac == null || item.has_ac === ride.requested_ac),
      );
      if (!vehicle) throw new Error("No eligible active vehicle for this booking.");
      return acceptRide({ data: { rideId, vehicleId: vehicle.id } });
    },
    onSuccess: () => {
      toast.success("Ride updated.");
      void qc.invalidateQueries({ queryKey: ["rider-rides"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const decline = useMutation({
    mutationFn: (rideId: string) => dismissRide({ data: { rideId } }),
    onSuccess: () => {
      toast.success("Request declined.");
      void qc.invalidateQueries({ queryKey: ["ride-dismissals"] });
    },
    onError: (error: Error) => toast.error(error.message),
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
  const dismissedRideIds = new Set((dismissals.data ?? []).map((item) => item.ride_id));
  const active = (rides.data ?? [])
    .filter(
      (r) =>
        !["completed", "cancelled"].includes(r.status) &&
        (r.rider_id === user?.id ||
          (r.rider_id === null &&
            !dismissedRideIds.has(r.id) &&
            vehicles.data?.some(
              (vehicle) =>
                vehicle.vehicle_category_id === r.requested_category_id &&
                (r.requested_ac == null || vehicle.has_ac === r.requested_ac),
            ))),
    )
    .sort((a, b) => Number(b.id === bookingId) - Number(a.id === bookingId));

  const completedCount = (rides.data ?? []).filter((r) => r.status === "completed").length;
  const ratingValues = (ratings.data ?? []).map((row) => row.stars);
  const averageRating = ratingValues.length
    ? (ratingValues.reduce((sum, value) => sum + value, 0) / ratingValues.length).toFixed(1)
    : null;
  const totalEarning = (earnings.data ?? []).reduce((sum, row) => sum + Number(row.amount), 0);

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
  const nextActionLabel = (status: string) => {
    const next = nextAction(status);
    if (!next) return "";
    if (status === "requested" || status === "searching") return "Accept";
    if (status === "started") return "Complete · Cash received";
    return `Mark ${RIDE_STATUS_LABEL[next]}`;
  };

  const stats = [
    { label: "Total Rides", value: completedCount ? String(completedCount) : "—" },
    { label: "Rating", value: averageRating ?? "—" },
    { label: "Total Earning", value: totalEarning ? rupees(totalEarning) : "—" },
    { label: "On Time", value: "—" },
  ];

  return (
    <RiderShell title="Shahin Travels" subtitle="आपकी यात्रा, हमारी जिम्मेदारी!">
      <div className="space-y-4">
        <IstClock />

        <Link
          to="/profile"
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
        >
          <ProfileAvatar path={profile?.photo_url} name={profile?.full_name} size={56} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <span className="truncate">{profile?.full_name || "Driver"}</span>
              {riderDetails?.is_verified ? <VerifiedTick /> : null}
            </p>
            {riderDetails?.is_verified ? <VerifiedByline className="block" /> : null}
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="h-3.5 w-3.5 fill-accent text-accent" />
              {averageRating ?? "—"} ({completedCount} rides)
            </p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Link>

        <section className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span
                className={`size-2.5 rounded-full ${
                  riderDetails?.is_online ? "bg-primary" : "bg-muted-foreground"
                }`}
                aria-hidden="true"
              />
              {riderDetails?.is_online ? "Online" : "Offline"}
            </p>
            <p className="text-xs text-muted-foreground">
              {riderDetails?.is_online
                ? "You are available for rides"
                : eligible
                  ? "Go online to receive requests"
                  : riderDetails?.is_blocked
                    ? "Account blocked"
                    : "Waiting for approval or subscription"}
            </p>
          </div>
          <Switch
            checked={Boolean(riderDetails?.is_online)}
            onCheckedChange={() => void toggleOnline()}
            aria-label="Toggle online status"
          />
        </section>

        <div className="flex justify-end">
          <EnablePushButton />
        </div>

        <section className="grid grid-cols-2 gap-3">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Today&apos;s Bookings</h2>
            <Link to="/rider/rides" className="text-xs text-primary">
              See All
            </Link>
          </div>
          {rides.isSuccess && active.length === 0 ? (
            <EmptyState
              title="No active requests"
              description="New customer requests matching your vehicle appear here."
            />
          ) : (
            <div className="space-y-3">
              {active.map((ride) => (
                <article
                  key={ride.id}
                  className={`rounded-2xl border bg-card p-4 ${
                    ride.id === bookingId
                      ? "border-primary ring-2 ring-primary/40"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <span className="size-2.5 rounded-full bg-primary" aria-hidden="true" />
                        <span className="truncate">{place(ride.from_location_id)}</span>
                      </p>
                      <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <span className="size-2.5 rounded-full bg-destructive" aria-hidden="true" />
                        <span className="truncate">{place(ride.to_location_id)}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{rupees(ride.total_fare)}</p>
                      {ride.distance_km ? (
                        <p className="text-[11px] text-muted-foreground">{ride.distance_km} km</p>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="h-3 w-3" /> {minutesAgo(ride.created_at)} · {ride.passengers}{" "}
                    passenger(s)
                  </p>
                  <Badge className="mt-2" variant="secondary">
                    {RIDE_STATUS_LABEL[ride.status] ?? ride.status}
                  </Badge>
                  <div className="mt-3 flex gap-2">
                    {ride.rider_id === null && ["requested", "searching"].includes(ride.status) ? (
                      <Button
                        className="flex-1 border-destructive text-destructive"
                        variant="outline"
                        disabled={decline.isPending}
                        onClick={() => decline.mutate(ride.id)}
                      >
                        Reject
                      </Button>
                    ) : null}
                    {nextAction(ride.status) ? (
                      <Button
                        className="flex-1"
                        disabled={action.isPending}
                        onClick={() => {
                          const next = nextAction(ride.status);
                          if (next) action.mutate({ rideId: ride.id, next });
                        }}
                      >
                        {nextActionLabel(ride.status)}
                      </Button>
                    ) : null}
                  </div>
                  {ride.rider_id === user?.id ? (
                    <Button asChild variant="ghost" className="mt-2 w-full">
                      <Link to="/rider/ride/$rideId" params={{ rideId: ride.id }}>
                        Open live navigation
                      </Link>
                    </Button>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="grid grid-cols-4 gap-2">
          {QUICK_ACTIONS.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-border bg-card p-3"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                {item.icon}
              </span>
              <span className="text-center text-[10px] leading-tight text-muted-foreground">
                {item.label}
              </span>
            </Link>
          ))}
        </section>

        <section className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
          <span className="flex size-10 items-center justify-center rounded-full bg-accent/20 text-accent-foreground">
            <Crown className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Your Subscription</p>
            <p className="text-xs text-muted-foreground">
              {riderDetails?.subscription_valid_until
                ? `Valid till ${formatDate(riderDetails.subscription_valid_until)}`
                : "No active subscription yet"}
            </p>
          </div>
          <Badge variant={eligible ? "default" : "secondary"}>
            {eligible ? "Active" : "Inactive"}
          </Badge>
        </section>
      </div>
    </RiderShell>
  );
}
