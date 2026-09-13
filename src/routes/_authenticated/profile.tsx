import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { QRCodeCanvas } from "qrcode.react";
import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell, CustomerShell, RiderShell } from "@/components/shells";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useAppSettings } from "@/lib/settings";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My profile — Shahin Travels" },
      { name: "description", content: "Update your Shahin Travels profile details." },
      { property: "og:title", content: "My profile — Shahin Travels" },
      { property: "og:description", content: "Update your Shahin Travels profile details." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, role, user, refresh } = useAuth();
  const [fullName, setFullName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const reviews = useQuery({
    queryKey: ["rider-reviews", user?.id],
    enabled: role === "rider" && Boolean(user),
    queryFn: async () => {
      if (!user) return [];
      const { data: ratings, error } = await supabase
        .from("ratings")
        .select("id, customer_id, stars, comment, created_at")
        .eq("rider_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);

      const customerIds = [...new Set((ratings ?? []).map((rating) => rating.customer_id))];
      if (customerIds.length === 0) return [];
      const { data: customers } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", customerIds);
      const names = new Map((customers ?? []).map((customer) => [customer.id, customer.full_name]));
      return (ratings ?? []).map((rating) => ({
        ...rating,
        customerName: names.get(rating.customer_id) || "Customer",
      }));
    },
  });

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setAddress(profile?.address ?? "");
  }, [profile]);

  async function save() {
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim(), address: address.trim() || null })
      .eq("id", profile.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Profile saved.");
    await refresh();
  }

  const body = (
    <div className="space-y-4">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="p-name">Full name</Label>
          <Input id="p-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-mobile">Mobile number</Label>
          <Input id="p-mobile" value={profile?.mobile ?? ""} readOnly className="bg-muted" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-address">Address</Label>
          <Textarea id="p-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <Button className="w-full" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </Button>
      </section>
      {role === "rider" ? <RiderVehicleQr /> : null}
      {role === "rider" ? <RiderReviews reviews={reviews.data ?? []} /> : null}
    </div>
  );

  if (role === "admin") return <AdminShell title="My profile">{body}</AdminShell>;
  if (role === "rider") return <RiderShell title="My profile">{body}</RiderShell>;
  return <CustomerShell title="My profile">{body}</CustomerShell>;
}

function RiderVehicleQr() {
  const { user } = useAuth();
  const settings = useAppSettings();
  const vehicles = useQuery({
    queryKey: ["my-vehicle-qr", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rider_vehicles")
        .select("id, vehicle_number, qr_token")
        .eq("rider_id", user!.id)
        .eq("is_active", true);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const base = settings.data?.qrBaseUrl ?? "";

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <h2 className="font-semibold">My vehicle QR codes</h2>
      {vehicles.data?.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {vehicles.data.map((vehicle) => (
            <div key={vehicle.id} className="flex items-center gap-3 rounded-xl border p-3">
              <QRCodeCanvas value={`${base}/${vehicle.qr_token}`} size={88} />
              <p className="text-sm font-medium">{vehicle.vehicle_number}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Add an active vehicle to get a QR code.</p>
      )}
    </section>
  );
}

function RiderReviews({
  reviews,
}: {
  reviews: Array<{
    id: string;
    stars: number;
    comment: string | null;
    created_at: string;
    customerName: string;
  }>;
}) {
  const average = reviews.length
    ? reviews.reduce((total, review) => total + review.stars, 0) / reviews.length
    : 0;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Ratings & reviews</h2>
          <p className="text-sm text-muted-foreground">
            {reviews.length} {reviews.length === 1 ? "customer review" : "customer reviews"}
          </p>
        </div>
        <div
          className="flex items-center gap-1 text-lg font-bold"
          aria-label={`${average.toFixed(1)} out of 5 stars`}
        >
          <Star className="fill-primary text-primary" aria-hidden="true" />
          {reviews.length ? average.toFixed(1) : "—"}
        </div>
      </div>

      {reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No customer reviews yet.</p>
      ) : (
        <div className="divide-y divide-border">
          {reviews.map((review) => (
            <article key={review.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium">{review.customerName}</span>
                <span
                  className="flex items-center gap-1"
                  aria-label={`${review.stars} out of 5 stars`}
                >
                  <Star className="fill-primary text-primary" aria-hidden="true" />
                  {review.stars.toFixed(1)}
                </span>
              </div>
              {review.comment ? (
                <p className="text-sm text-muted-foreground">{review.comment}</p>
              ) : null}
              <time className="block text-xs text-muted-foreground" dateTime={review.created_at}>
                {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
                  new Date(review.created_at),
                )}
              </time>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
