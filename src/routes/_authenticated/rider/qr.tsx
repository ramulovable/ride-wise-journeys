import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { RiderShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/rider/qr")({
  head: () => ({
    meta: [
      { title: "Vehicle QR codes — Shahin Travels driver" },
      { name: "description", content: "Printable booking QR codes for each of your vehicles." },
      { property: "og:title", content: "Vehicle QR codes — Shahin Travels driver" },
      { property: "og:description", content: "Printable booking QR codes for your vehicles." },
    ],
  }),
  component: RiderQr,
});

function RiderQr() {
  useRoleGuard("rider");
  const { user } = useAuth();
  const vehicles = useQuery({
    queryKey: ["vehicles", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rider_vehicles")
        .select("id, vehicle_number, qr_token")
        .eq("rider_id", user!.id)
        .order("created_at");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const profile = useQuery({
    queryKey: ["qr-profile", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, my_referral_code")
        .eq("id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  function download(id: string, numberValue: string) {
    const svg = document.getElementById(`qr-page-${id}`);
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${numberValue}-qr.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <RiderShell title="QR codes" subtitle="Let customers scan and book your vehicle.">
      {vehicles.isSuccess && vehicles.data.length === 0 ? (
        <EmptyState title="No vehicles" description="Add a vehicle to get its booking QR code." />
      ) : (
        <div className="space-y-3">
          {(vehicles.data ?? []).map((vehicle) => (
            <article
              key={vehicle.id}
              className="overflow-hidden rounded-3xl border border-border bg-card shadow-lg"
            >
              <div className="bg-primary px-5 py-4 text-primary-foreground">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">Shahin Travels</p>
                <p className="mt-1 text-xl font-bold">{profile.data?.full_name ?? "Driver"}</p>
                <p className="text-sm opacity-90">{vehicle.vehicle_number}</p>
              </div>
              <div className="flex flex-col items-center gap-3 p-5">
                <div className="rounded-2xl border-4 border-primary bg-background p-3">
                  <QRCodeSVG
                    id={`qr-page-${vehicle.id}`}
                    value={`${typeof window === "undefined" ? "https://shahintravels.app" : window.location.origin}/vehicle/${vehicle.qr_token}`}
                    size={180}
                    level="H"
                    marginSize={2}
                  />
                </div>
                <p className="text-center text-sm text-muted-foreground">
                  Scan karein, app download karein aur ride book karein
                </p>
                {profile.data?.my_referral_code ? (
                  <p className="rounded-xl bg-muted px-4 py-1.5 font-mono text-lg font-bold text-foreground">
                    Code: {profile.data.my_referral_code}
                  </p>
                ) : null}
                <Button size="sm" onClick={() => download(vehicle.id, vehicle.vehicle_number)}>
                  Download QR
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </RiderShell>
  );
}
