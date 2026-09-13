import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeCanvas } from "qrcode.react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAppSettings } from "@/lib/settings";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/admin/qr")({
  head: () => ({
    meta: [
      { title: "Vehicle QR codes | Shahin Travels Admin" },
      {
        name: "description",
        content: "View, print and regenerate Shahin Travels vehicle QR codes.",
      },
      { property: "og:title", content: "Vehicle QR codes | Shahin Travels Admin" },
      {
        property: "og:description",
        content: "View, print and regenerate Shahin Travels vehicle QR codes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Qr,
});

function Qr() {
  useRoleGuard("admin");
  const qc = useQueryClient();
  const settings = useAppSettings();
  const [search, setSearch] = useState("");
  const holders = useRef<Record<string, HTMLDivElement | null>>({});

  const vehicles = useQuery({
    queryKey: ["admin-vehicles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rider_vehicles")
        .select("id,vehicle_number,vehicle_model,qr_token,is_active")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const base = settings.data?.qrBaseUrl ?? "";
  const linkFor = (token: string) => `${base}/${token}`;

  function download(id: string, label: string) {
    const canvas = holders.current[id]?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `shahin-qr-${label}.png`;
    link.click();
  }

  async function regenerate(id: string) {
    const { error } = await supabase
      .from("rider_vehicles")
      .update({ qr_token: crypto.randomUUID() })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("New QR code generated.");
    void qc.invalidateQueries({ queryKey: ["admin-vehicles"] });
  }

  const rows = (vehicles.data ?? []).filter((v) =>
    `${v.vehicle_number} ${v.vehicle_model ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <AdminShell title="Vehicle QR codes" subtitle="View, download, print or regenerate codes.">
      <Input
        className="mb-4"
        placeholder="Search by vehicle number or model"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {rows.length === 0 ? (
        <EmptyState
          title="No vehicle QR codes"
          description="Codes appear automatically when drivers add vehicles."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((v) => (
            <article
              key={v.id}
              className="flex items-center gap-4 rounded-2xl border bg-card p-4 print:border-black"
            >
              <div
                ref={(node) => {
                  holders.current[v.id] = node;
                }}
              >
                <QRCodeCanvas value={linkFor(v.qr_token)} size={96} />
              </div>
              <div>
                <p className="font-semibold">{v.vehicle_number}</p>
                <p className="text-xs text-muted-foreground">
                  {v.vehicle_model || "Model not set"}
                </p>
                <p className="text-xs">{v.is_active ? "Active" : "Inactive"}</p>
                <div className="mt-2 flex flex-wrap gap-2 print:hidden">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => download(v.id, v.vehicle_number)}
                  >
                    Download
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => window.print()}>
                    Print
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => void regenerate(v.id)}>
                    Regenerate
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
