import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { getLiveDrivers } from "@/lib/dispatch.functions";
import { formatDateTime } from "@/lib/format";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/admin/live-drivers")({
  head: () => ({
    meta: [
      { title: "Live Drivers | Shahin Travels Admin" },
      {
        name: "description",
        content: "Monitor real driver locations, presence, active trips and free seats.",
      },
      { property: "og:title", content: "Live Drivers | Shahin Travels Admin" },
      {
        property: "og:description",
        content: "Real driver locations, presence, active trips and free seats.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LiveDriversPage,
});

const STATUS_LABEL: Record<string, string> = {
  offline: "Offline",
  online_available: "Online · available",
  online_on_ride: "On a trip",
};

function LiveDriversPage() {
  useRoleGuard("admin");
  const drivers = useQuery({
    queryKey: ["live-drivers"],
    queryFn: () => getLiveDrivers(),
    refetchInterval: 10_000,
  });

  return (
    <AdminShell title="Live drivers" subtitle="Real GPS presence, active trips and free seats.">
      {drivers.isSuccess && (drivers.data?.length ?? 0) === 0 ? (
        <EmptyState
          title="No driver locations yet"
          description="Locations appear here as soon as drivers go online with location enabled."
        />
      ) : (
        <div className="space-y-3">
          {drivers.data?.map((driver) => (
            <article key={driver.riderId} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{driver.name}</p>
                  <p className="text-xs text-muted-foreground">{driver.mobile}</p>
                </div>
                <Badge variant={driver.status === "offline" ? "secondary" : "default"}>
                  {STATUS_LABEL[driver.status] ?? driver.status}
                </Badge>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <div>
                  Location:{" "}
                  {driver.latitude == null || driver.longitude == null
                    ? "—"
                    : `${Number(driver.latitude).toFixed(5)}, ${Number(driver.longitude).toFixed(5)}`}
                </div>
                <div className="text-right">
                  Accuracy:{" "}
                  {driver.accuracyMeters == null ? "—" : `${Math.round(driver.accuracyMeters)} m`}
                </div>
                <div>
                  Updated: {driver.lastLocationAt ? formatDateTime(driver.lastLocationAt) : "—"}
                </div>
                <div className="text-right">Vehicle: {driver.vehicleNumber ?? "—"}</div>
                <div>Trip: {driver.activeRideStatus ?? "—"}</div>
                <div className="text-right">
                  Passengers: {driver.passengers ?? 0}
                  {driver.remainingCapacity == null ? "" : ` · ${driver.remainingCapacity} free`}
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
