import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/shells";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { rupees } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/")({ component: AdminDashboard });
function AdminDashboard() {
  useRoleGuard("admin");
  const stats = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const [customers, riders, pending, active, rides, support, completed] = await Promise.all([
        supabase
          .from("user_roles")
          .select("user_id", { count: "exact", head: true })
          .eq("role", "customer"),
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
      return {
        customers: customers.count ?? 0,
        riders: riders.count ?? 0,
        pending: pending.count ?? 0,
        active: active.count ?? 0,
        rides: rides.count ?? 0,
        support: support.count ?? 0,
        revenue: (completed.data ?? []).reduce((s, r) => s + Number(r.total_fare), 0),
      };
    },
  });
  const cards = [
    { label: "Customers", value: stats.data?.customers ?? "—", to: "/admin/customers" },
    { label: "Drivers", value: stats.data?.riders ?? "—", to: "/admin/riders" },
    { label: "Pending approvals", value: stats.data?.pending ?? "—", to: "/admin/riders" },
    { label: "Drivers online", value: stats.data?.active ?? "—", to: "/admin/riders" },
    { label: "Total bookings", value: stats.data?.rides ?? "—", to: "/admin/rides" },
    { label: "Open support", value: stats.data?.support ?? "—", to: "/admin/support" },
    {
      label: "Completed cash fares",
      value: stats.data ? rupees(stats.data.revenue) : "—",
      to: "/admin/rides",
    },
  ];
  return (
    <AdminShell title="Operations dashboard" subtitle="Live business counters from Shahin Travels.">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.label} to={c.to} className="rounded-2xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="mt-2 text-2xl font-bold text-primary">{c.value}</p>
          </Link>
        ))}
      </div>
    </AdminShell>
  );
}
