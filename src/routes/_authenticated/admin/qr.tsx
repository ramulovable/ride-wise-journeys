import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { AdminShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/admin/qr")({ component: Qr });
function Qr() {
  useRoleGuard("admin");
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
  return (
    <AdminShell title="Vehicle QR codes" subtitle="View and print registered vehicle codes.">
      {vehicles.isSuccess && vehicles.data.length === 0 ? (
        <EmptyState
          title="No vehicle QR codes"
          description="Codes appear automatically when drivers add vehicles."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {vehicles.data?.map((v) => (
            <article
              key={v.id}
              className="flex items-center gap-4 rounded-2xl border bg-card p-4 print:border-black"
            >
              <QRCodeSVG value={`${window.location.origin}/vehicle/${v.qr_token}`} size={96} />
              <div>
                <p className="font-semibold">{v.vehicle_number}</p>
                <p className="text-xs text-muted-foreground">
                  {v.vehicle_model || "Model not set"}
                </p>
                <p className="text-xs">{v.is_active ? "Active" : "Inactive"}</p>
                <button
                  className="mt-2 text-xs font-medium text-primary underline"
                  onClick={() => window.print()}
                >
                  Print
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
