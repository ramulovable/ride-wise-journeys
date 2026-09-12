import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { getAdminRideAudit } from "@/lib/api.functions";
import { formatDateTime, RIDE_STATUS_LABEL, rupees } from "@/lib/format";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/admin/rides")({
  head: () => ({
    meta: [
      { title: "Ride Audit History | Shahin Travels Admin" },
      {
        name: "description",
        content: "Review complete Shahin Travels booking and ride audit records.",
      },
      { property: "og:title", content: "Ride Audit History | Shahin Travels Admin" },
      {
        property: "og:description",
        content: "Review complete Shahin Travels booking and ride audit records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Rides,
});

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{value}</dd>
    </div>
  );
}

function Rides() {
  useRoleGuard("admin");
  const rides = useQuery({
    queryKey: ["admin-ride-audit"],
    queryFn: () => getAdminRideAudit(),
  });
  return (
    <AdminShell
      title="Ride & audit history"
      subtitle="Complete booking, contact, vehicle and timeline records."
    >
      {rides.isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {rides.error.message}
        </p>
      ) : rides.isSuccess && rides.data.length === 0 ? (
        <EmptyState title="No bookings" description="Customer bookings will appear here." />
      ) : (
        <div className="space-y-4">
          {rides.data?.map((r) => (
            <article key={r.id} className="overflow-hidden rounded-lg border bg-card">
              <header className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {r.fromLocation?.name ?? "Unknown pickup"} →{" "}
                    {r.toLocation?.name ?? "Unknown destination"}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground">Booking {r.id}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-primary">{rupees(r.total_fare)}</p>
                  <Badge variant={r.status === "cancelled" ? "destructive" : "secondary"}>
                    {RIDE_STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </div>
              </header>

              <div className="grid gap-5 p-4 md:grid-cols-2 xl:grid-cols-4">
                <section>
                  <h2 className="mb-2 text-sm font-semibold">Customer</h2>
                  <dl className="space-y-2">
                    <Detail label="Name" value={r.customer?.full_name || "Unnamed customer"} />
                    <Detail label="Mobile" value={r.customer?.mobile ?? "Unavailable"} />
                  </dl>
                </section>
                <section>
                  <h2 className="mb-2 text-sm font-semibold">Driver & vehicle</h2>
                  <dl className="space-y-2">
                    <Detail label="Driver" value={r.rider?.full_name || "Not assigned"} />
                    <Detail label="Mobile" value={r.rider?.mobile ?? "Not assigned"} />
                    <Detail label="Vehicle type" value={r.vehicle?.type ?? "Not assigned"} />
                    <Detail label="Registration" value={r.vehicle?.number ?? "Not assigned"} />
                  </dl>
                </section>
                <section>
                  <h2 className="mb-2 text-sm font-semibold">Route & fare</h2>
                  <dl className="space-y-2">
                    <Detail
                      label="Boarding"
                      value={r.fromLocation?.address || r.fromLocation?.name || "Unavailable"}
                    />
                    <Detail
                      label="Destination"
                      value={r.toLocation?.address || r.toLocation?.name || "Unavailable"}
                    />
                    <Detail
                      label="Ride type"
                      value={
                        r.booking_type === "share"
                          ? "Share"
                          : r.booking_type === "reserve"
                            ? "Reserve"
                            : "Standard"
                      }
                    />
                    <Detail label="Passengers" value={String(r.passengers)} />
                    <Detail label="Fare" value={rupees(r.total_fare)} />
                    <Detail
                      label="Driving distance"
                      value={r.distance_km == null ? "Unavailable" : `${r.distance_km} km`}
                    />
                  </dl>
                </section>
                <section>
                  <h2 className="mb-2 text-sm font-semibold">Audit timeline</h2>
                  <dl className="space-y-2">
                    <Detail label="Booked" value={formatDateTime(r.created_at)} />
                    <Detail label="Accepted" value={formatDateTime(r.accepted_at)} />
                    <Detail label="On the way" value={formatDateTime(r.on_the_way_at)} />
                    <Detail label="Arrived" value={formatDateTime(r.arrived_at)} />
                    <Detail label="Trip started" value={formatDateTime(r.started_at)} />
                    <Detail label="Completed" value={formatDateTime(r.completed_at)} />
                    <Detail label="Cancelled" value={formatDateTime(r.cancelled_at)} />
                    <Detail label="Last status update" value={formatDateTime(r.updated_at)} />
                  </dl>
                </section>
              </div>
              {r.cancel_reason ? (
                <p className="border-t px-4 py-3 text-sm text-destructive">
                  <strong>Cancellation reason:</strong> {r.cancel_reason}
                </p>
              ) : null}
              {r.history.length ? (
                <section className="border-t px-4 py-3">
                  <h2 className="mb-2 text-sm font-semibold">Recorded status events</h2>
                  <ol className="space-y-1 text-xs text-muted-foreground">
                    {r.history.map((event, index) => (
                      <li key={`${event.created_at}-${index}`}>
                        {formatDateTime(event.created_at)} ·{" "}
                        {event.from_status
                          ? `${RIDE_STATUS_LABEL[event.from_status] ?? event.from_status} → `
                          : ""}
                        {RIDE_STATUS_LABEL[event.to_status] ?? event.to_status}
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
