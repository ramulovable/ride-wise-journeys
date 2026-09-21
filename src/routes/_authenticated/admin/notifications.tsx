import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { listBroadcasts, sendBroadcast } from "@/lib/broadcast.functions";
import { formatDateTime } from "@/lib/format";
import { useRoleGuard } from "@/lib/useRoleGuard";

const AUDIENCE_LABEL: Record<string, string> = {
  all: "Everyone",
  customers: "Customers only",
  riders: "Drivers only",
};

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications | Shahin Travels Admin" },
      { name: "description", content: "Ride request alerts sent to Shahin Travels drivers." },
      { property: "og:title", content: "Notifications | Shahin Travels Admin" },
      {
        property: "og:description",
        content: "Ride request alerts sent to Shahin Travels drivers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  useRoleGuard("admin");

  const devices = useQuery({
    queryKey: ["admin-devices"],
    queryFn: async () => {
      const { count } = await supabase
        .from("notification_devices")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);
      return count ?? 0;
    },
  });

  const history = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, delivered, created_at, ride_id")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  return (
    <AdminShell title="Notifications" subtitle="Alerts sent when customers book a ride.">
      <div className="mb-4 rounded-2xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">Drivers with alerts switched on</p>
        <p className="text-2xl font-bold">{devices.data ?? 0}</p>
      </div>

      {history.isSuccess && history.data.length === 0 ? (
        <EmptyState
          title="No notifications yet"
          description="Alerts appear here once customers start booking rides."
        />
      ) : (
        <div className="space-y-2">
          {history.data?.map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-card p-3">
              <p className="text-sm font-medium">{row.title}</p>
              <p className="text-sm text-muted-foreground">{row.body}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(row.created_at)} · {row.delivered ? "Sent" : "In app only"}
              </p>
            </article>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
