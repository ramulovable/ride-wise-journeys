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
import { listBroadcasts, namesForUsers, searchNotifyUsers, sendBroadcast } from "@/lib/broadcast.functions";
import { formatDateTime } from "@/lib/format";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { useRideAlertSettings, type RideAlertSettings } from "@/lib/rideAlerts";

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
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"all" | "customers" | "riders" | "person">("all");
  const [query, setQuery] = useState("");
  const [person, setPerson] = useState<{ id: string; name: string; role: string } | null>(null);
  const people = useQuery({
    queryKey: ["notify-search", query],
    queryFn: () => searchNotifyUsers({ data: { q: query } }),
    enabled: audience === "person" && query.trim().length >= 2 && !person,
  });

  const broadcasts = useQuery({ queryKey: ["admin-broadcasts"], queryFn: () => listBroadcasts() });

  const send = useMutation({
    mutationFn: () =>
      sendBroadcast({
        data: {
          title: title.trim(),
          body: body.trim(),
          audience,
          userId: audience === "person" ? person?.id : undefined,
          actionPath: "/notifications",
        },
      }),
    onSuccess: (result) => {
      toast.success(`Sent to ${result.recipients} people (${result.delivered} phone alerts).`);
      setTitle("");
      setBody("");
      setPerson(null);
      setQuery("");
      void qc.invalidateQueries({ queryKey: ["admin-broadcasts"] });
      void qc.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const personIds = (broadcasts.data ?? [])
    .map((b) => (b.audience.startsWith("person:") ? b.audience.slice(7) : null))
    .filter((x): x is string => Boolean(x));
  const personNames = useQuery({
    queryKey: ["broadcast-person-names", personIds.join(",")],
    queryFn: () => namesForUsers({ data: { ids: personIds } }),
    enabled: personIds.length > 0,
  });
  const audienceText = (a: string) =>
    a.startsWith("person:") ? `Personal · ${personNames.data?.[a.slice(7)] ?? "one person"}` : (AUDIENCE_LABEL[a] ?? a);

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

      <section className="mb-4 space-y-3 rounded-2xl border border-border bg-card p-4">
        <p className="font-semibold">Send an announcement</p>
        <div className="space-y-1.5">
          <Label htmlFor="bc-audience">Send to</Label>
          <select
            id="bc-audience"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={audience}
            onChange={(e) => setAudience(e.target.value as typeof audience)}
          >
            <option value="all">Everyone (customers + drivers)</option>
            <option value="customers">Customers only</option>
            <option value="riders">Drivers only</option>
            <option value="person">One person (name se chunein)</option>
          </select>
        </div>
        {audience === "person" ? (
          <div className="space-y-1.5">
            <Label htmlFor="bc-person">Customer ya driver</Label>
            {person ? (
              <div className="flex items-center justify-between rounded-md border border-input bg-muted px-3 py-2 text-sm">
                <span>
                  {person.name} · {person.role}
                </span>
                <button type="button" className="text-xs font-medium text-primary" onClick={() => setPerson(null)}>
                  Change
                </button>
              </div>
            ) : (
              <>
                <Input
                  id="bc-person"
                  value={query}
                  placeholder="Name ya mobile number likhein"
                  onChange={(e) => setQuery(e.target.value)}
                />
                {people.data?.length ? (
                  <ul className="max-h-60 divide-y divide-border overflow-auto rounded-md border border-border">
                    {people.data.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => setPerson({ id: p.id, name: p.full_name || p.mobile, role: p.role })}
                        >
                          {p.photo_url ? (
                            <img src={p.photo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <span className="h-8 w-8 rounded-full bg-muted" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">{p.full_name || "No name"}</span>
                            <span className="block text-xs text-muted-foreground">
                              {p.mobile} · {p.role} · {p.hasPhone ? "Phone alert on" : "In-app only"}
                            </span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : query.trim().length >= 2 && people.isSuccess ? (
                  <p className="text-xs text-muted-foreground">Koi user nahi mila.</p>
                ) : null}
              </>
            )}
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="bc-title">Title</Label>
          <Input
            id="bc-title"
            value={title}
            maxLength={80}
            placeholder="Today's update"
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bc-body">Message</Label>
          <Textarea
            id="bc-body"
            value={body}
            maxLength={500}
            rows={3}
            placeholder="Write the message people will see."
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
        <Button
          className="w-full"
          disabled={
            send.isPending ||
            title.trim().length < 2 ||
            body.trim().length < 2 ||
            (audience === "person" && !person)
          }
          onClick={() => send.mutate()}
        >
          {send.isPending ? "Sending…" : "Send now"}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Everyone gets it inside the app; people who switched on alerts also get a phone
          notification.
        </p>
      </section>

      {(broadcasts.data?.length ?? 0) > 0 ? (
        <section className="mb-4 space-y-2">
          <p className="text-sm font-semibold">Announcements sent</p>
          {broadcasts.data?.map((row) => (
            <article key={row.id} className="rounded-2xl border border-border bg-card p-3">
              <p className="text-sm font-medium">{row.title}</p>
              <p className="text-sm text-muted-foreground">{row.body}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(row.created_at)} · {audienceText(row.audience)} ·{" "}
                {row.recipient_count} people · {row.delivered_count} phone alerts
              </p>
            </article>
          ))}
        </section>
      ) : null}

      <RideAlertSettingsSection />

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

function RideAlertSettingsSection() {
  const qc = useQueryClient();
  const settings = useRideAlertSettings();
  const row = settings.data;

  async function update(patch: Partial<RideAlertSettings>) {
    if (!row?.id) return;
    const { error } = await supabase.from("ride_alert_settings").update(patch).eq("id", row.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Ride alert settings saved.");
      void qc.invalidateQueries({ queryKey: ["ride-alert-settings"] });
    }
  }

  if (!row) return null;

  const toggles: Array<[keyof RideAlertSettings, string]> = [
    ["full_screen_enabled", "Show full-screen alert to drivers"],
    ["sound_enabled", "Play alert sound"],
    ["vibration_enabled", "Vibrate the phone"],
  ];
  const numbers: Array<[keyof RideAlertSettings, string]> = [
    ["alert_duration_seconds", "Sound / vibration length (seconds)"],
    ["response_timeout_seconds", "Driver response time (seconds)"],
    ["max_riders_notified", "Drivers alerted per booking"],
    ["retry_interval_seconds", "Gap before the next driver (seconds)"],
  ];

  return (
    <section className="mb-4 space-y-3 rounded-2xl border border-border bg-card p-4">
      <p className="font-semibold">New ride alert for drivers</p>
      {toggles.map(([key, label]) => (
        <label key={key} className="flex items-center justify-between gap-3 text-sm">
          <span>{label}</span>
          <input
            type="checkbox"
            className="h-5 w-5"
            checked={Boolean(row[key])}
            onChange={(e) => void update({ [key]: e.target.checked } as Partial<RideAlertSettings>)}
          />
        </label>
      ))}
      <div className="grid grid-cols-2 gap-3">
        {numbers.map(([key, label]) => (
          <div key={key} className="space-y-1.5">
            <Label htmlFor={`ra-${key}`}>{label}</Label>
            <Input
              id={`ra-${key}`}
              type="number"
              defaultValue={String(row[key])}
              onBlur={(e) => {
                const value = Number(e.target.value);
                if (!Number.isFinite(value) || value < 1) return;
                if (value === Number(row[key])) return;
                void update({ [key]: Math.round(value) } as Partial<RideAlertSettings>);
              }}
            />
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ra-sound">Alert tone</Label>
        <select
          id="ra-sound"
          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          value={row.alert_sound}
          onChange={(e) => void update({ alert_sound: e.target.value })}
        >
          <option value="chime">Chime</option>
          <option value="siren">Siren</option>
        </select>
      </div>
    </section>
  );
}
