import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CustomerShell, RiderShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Shahin Travels" },
      { name: "description", content: "Your Shahin Travels ride alerts and updates." },
      { property: "og:title", content: "Notifications — Shahin Travels" },
      { property: "og:description", content: "Your ride alerts and updates." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user, role } = useAuth();
  const Shell = role === "rider" ? RiderShell : CustomerShell;
  const list = useQuery({
    queryKey: ["my-notifications", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  return (
    <Shell title="Notifications" subtitle="Ride alerts sent to you.">
      {list.isSuccess && list.data.length === 0 ? (
        <EmptyState title="No notifications" description="Ride alerts will appear here." />
      ) : (
        <div className="space-y-2">
          {(list.data ?? []).map((item) => (
            <article key={item.id} className="rounded-2xl border border-border bg-card p-3">
              <p className="text-sm font-semibold text-foreground">{item.title}</p>
              <p className="text-sm text-muted-foreground">{item.body}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {formatDateTime(item.created_at)}
              </p>
            </article>
          ))}
        </div>
      )}
    </Shell>
  );
}
