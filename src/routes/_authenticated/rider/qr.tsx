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
              className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4"
            >
              <div>
                <p className="font-semibold text-foreground">{vehicle.vehicle_number}</p>
                <Button
                  size="sm"
                  className="mt-2"
                  onClick={() => download(vehicle.id, vehicle.vehicle_number)}
                >
                  Download QR
                </Button>
              </div>
              <div className="rounded-lg bg-white p-2">
                <QRCodeSVG
                  id={`qr-page-${vehicle.id}`}
                  value={`${typeof window === "undefined" ? "https://shahintravels.app" : window.location.origin}/vehicle/${vehicle.qr_token}`}
                  size={112}
                />
              </div>
            </article>
          ))}
        </div>
      )}
    </RiderShell>
  );
}
