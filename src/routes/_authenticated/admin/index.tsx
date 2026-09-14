import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/shells";
import { IstClock } from "@/components/IstClock";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { rupees } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/")({ component: AdminDashboard });
function AdminDashboard() {
  useRoleGuard("admin");
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [
        customerRoles,
        adminRoles,
        riderRoles,
        riders,
        pending,
        active,
        rides,
        support,
        completed,
      ] = await Promise.all([
        supabase.from("user_roles").select("user_id").eq("role", "customer"),
        supabase.from("user_roles").select("user_id").eq("role", "admin"),
        supabase.from("user_roles").select("user_id").eq("role", "rider"),
        supabase.from("rider_details").select("user_id", { count: "exact", head: true }),
        supabase
          .from("rider_details")
          .select("user_id", { count: "exact", head: true })
          .eq("is_approved", false),
        supabase
          .from("rider_details")
          .select("user_id", { count: "exact", head: true })
          .eq("is_online", true),
        supabase.from("rides").select("id", { count: "exact", head: true }),
        supabase
          .from("support_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "open"),
        supabase.from("rides").select("total_fare").eq("status", "completed"),
      ]);
      const nonCustomerIds = new Set([
        ...(adminRoles.data ?? []).map((role) => role.user_id),
        ...(riderRoles.data ?? []).map((role) => role.user_id),
      ]);
      return {
        customers: (customerRoles.data ?? []).filter((role) => !nonCustomerIds.has(role.user_id))
          .length,
        riders: riders.count ?? 0,
        pending: pending.count ?? 0,
        active: active.count ?? 0,
        rides: rides.count ?? 0,
        support: support.count ?? 0,
        revenue: (completed.data ?? []).reduce((s, r) => s + Number(r.total_fare), 0),
      };
    },
  });
  const ready = stats.isSuccess;
  const cards = [
    { label: "Customers", value: ready ? stats.data.customers : "—", to: "/admin/customers" },
    { label: "Drivers", value: ready ? stats.data.riders : "—", to: "/admin/riders" },
    { label: "Pending approvals", value: ready ? stats.data.pending : "—", to: "/admin/riders" },
    { label: "Drivers online", value: ready ? stats.data.active : "—", to: "/admin/riders" },
    { label: "Total bookings", value: ready ? stats.data.rides : "—", to: "/admin/rides" },
    { label: "Open support", value: ready ? stats.data.support : "—", to: "/admin/support" },
    {
      label: "Completed cash fares",
      value: ready ? rupees(stats.data.revenue) : "—",
      to: "/admin/rides",
    },
    { label: "Fares & settings", value: "⚙", to: "/admin/fares" },
  ];
  return (
    <AdminShell title="Operations dashboard" subtitle="Live business counters from Shahin Travels.">
      <div className="mx-auto mb-4 max-w-3xl">
        <IstClock />
      </div>
      <div className="mx-auto grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            to={c.to}
            className="flex aspect-square min-h-[7rem] flex-col items-center justify-center gap-2 rounded-2xl border bg-card p-3 text-center shadow-sm transition active:scale-[0.98]"
          >
            <p className="text-2xl font-bold leading-none text-primary sm:text-3xl">{c.value}</p>
            <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
