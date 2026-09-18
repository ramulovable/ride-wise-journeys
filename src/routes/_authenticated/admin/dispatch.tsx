import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminShell } from "@/components/shells";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { getDispatchSettings, updateDispatchSettings } from "@/lib/dispatch.functions";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/admin/dispatch")({
  head: () => ({
    meta: [
      { title: "Dispatch & Matching | Shahin Travels Admin" },
      {
        name: "description",
        content:
          "Control nearby driver dispatch, en-route share matching, radius, detour and GPS rules.",
      },
      { property: "og:title", content: "Dispatch & Matching | Shahin Travels Admin" },
      {
        property: "og:description",
        content: "Nearby dispatch radius, en-route share matching and GPS freshness rules.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DispatchSettingsPage,
});

type Form = {
  id: string;
  dispatch_enabled: boolean;
  nearby_dispatch_enabled: boolean;
  en_route_matching_enabled: boolean;
  reserve_exclusive: boolean;
  require_location_for_dispatch: boolean;
  dispatch_priority: "nearest_available_first" | "en_route_first" | "combined_matching";
  pickup_radius_km: string;
  route_corridor_km: string;
  max_pickup_detour_km: string;
  max_additional_minutes: string;
  max_location_age_seconds: string;
  max_gps_accuracy_meters: string;
  max_share_passengers: string;
  weight_pickup_proximity: string;
  weight_detour: string;
  weight_additional_time: string;
  weight_capacity: string;
};

const NUMBER_FIELDS: Array<{ key: keyof Form; label: string }> = [
  { key: "pickup_radius_km", label: "Pickup radius (km)" },
  { key: "route_corridor_km", label: "Maximum distance from active route (km)" },
  { key: "max_pickup_detour_km", label: "Maximum en-route pickup detour (km)" },
  { key: "max_additional_minutes", label: "Maximum additional travel time (minutes)" },
  { key: "max_location_age_seconds", label: "Maximum location age (seconds)" },
  { key: "max_gps_accuracy_meters", label: "Maximum GPS accuracy (metres)" },
  { key: "max_share_passengers", label: "Maximum share passengers (0 = vehicle capacity)" },
  { key: "weight_pickup_proximity", label: "Weight: pickup proximity" },
  { key: "weight_detour", label: "Weight: detour" },
  { key: "weight_additional_time", label: "Weight: additional time" },
  { key: "weight_capacity", label: "Weight: free capacity" },
];

const SWITCHES: Array<{ key: keyof Form; label: string; hint: string }> = [
  { key: "dispatch_enabled", label: "Dispatch engine", hint: "Master switch for all matching." },
  {
    key: "nearby_dispatch_enabled",
    label: "Nearby driver dispatch",
    hint: "Send new bookings to free drivers near the pickup point.",
  },
  {
    key: "en_route_matching_enabled",
    label: "En-route share matching",
    hint: "Offer share bookings to drivers already travelling that way.",
  },
  {
    key: "reserve_exclusive",
    label: "Reserve trips stay exclusive",
    hint: "Never add extra passengers to a reserve trip.",
  },
  {
    key: "require_location_for_dispatch",
    label: "Require live location",
    hint: "Drivers without a fresh GPS position receive no requests.",
  },
];

const PRIORITIES: Array<{ value: Form["dispatch_priority"]; label: string }> = [
  { value: "nearest_available_first", label: "Nearest available driver first" },
  { value: "en_route_first", label: "En-route driver first" },
  { value: "combined_matching", label: "Combined matching (weighted)" },
];

function DispatchSettingsPage() {
  useRoleGuard("admin");
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["dispatch-settings"], queryFn: () => getDispatchSettings() });
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const row = settings.data;
    if (!row) return;
    setForm({
      id: row.id,
      dispatch_enabled: row.dispatch_enabled,
      nearby_dispatch_enabled: row.nearby_dispatch_enabled,
      en_route_matching_enabled: row.en_route_matching_enabled,
      reserve_exclusive: row.reserve_exclusive,
      require_location_for_dispatch: row.require_location_for_dispatch,
      dispatch_priority: row.dispatch_priority as Form["dispatch_priority"],
      pickup_radius_km: String(row.pickup_radius_km),
      route_corridor_km: String(row.route_corridor_km),
      max_pickup_detour_km: String(row.max_pickup_detour_km),
      max_additional_minutes: String(row.max_additional_minutes),
      max_location_age_seconds: String(row.max_location_age_seconds),
      max_gps_accuracy_meters: String(row.max_gps_accuracy_meters),
      max_share_passengers: String(row.max_share_passengers),
      weight_pickup_proximity: String(row.weight_pickup_proximity),
      weight_detour: String(row.weight_detour),
      weight_additional_time: String(row.weight_additional_time),
      weight_capacity: String(row.weight_capacity),
    });
  }, [settings.data]);

  async function save() {
    if (!form) return;
    const numbers = NUMBER_FIELDS.map((field) => Number(form[field.key]));
    if (numbers.some((value) => !Number.isFinite(value) || value < 0)) {
      toast.error("Every value must be a number of 0 or more.");
      return;
    }
    setBusy(true);
    try {
      await updateDispatchSettings({
        data: {
          id: form.id,
          dispatch_enabled: form.dispatch_enabled,
          nearby_dispatch_enabled: form.nearby_dispatch_enabled,
          en_route_matching_enabled: form.en_route_matching_enabled,
          reserve_exclusive: form.reserve_exclusive,
          require_location_for_dispatch: form.require_location_for_dispatch,
          dispatch_priority: form.dispatch_priority,
          pickup_radius_km: Number(form.pickup_radius_km),
          route_corridor_km: Number(form.route_corridor_km),
          max_pickup_detour_km: Number(form.max_pickup_detour_km),
          max_additional_minutes: Number(form.max_additional_minutes),
          max_location_age_seconds: Math.round(Number(form.max_location_age_seconds)),
          max_gps_accuracy_meters: Math.round(Number(form.max_gps_accuracy_meters)),
          max_share_passengers: Math.round(Number(form.max_share_passengers)),
          weight_pickup_proximity: Number(form.weight_pickup_proximity),
          weight_detour: Number(form.weight_detour),
          weight_additional_time: Number(form.weight_additional_time),
          weight_capacity: Number(form.weight_capacity),
        },
      });
      toast.success("Dispatch rules saved.");
      void qc.invalidateQueries({ queryKey: ["dispatch-settings"] });
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminShell
      title="Dispatch & matching"
      subtitle="Nearby driver radius, en-route share rules and GPS quality limits."
    >
      {!form ? (
        <p className="text-sm text-muted-foreground">Loading rules…</p>
      ) : (
        <div className="max-w-md space-y-4">
          <section className="space-y-3 rounded-2xl border border-border p-3">
            {SWITCHES.map((item) => (
              <label key={String(item.key)} className="flex items-start justify-between gap-3">
                <span>
                  <span className="block text-sm font-medium text-foreground">{item.label}</span>
                  <span className="block text-xs text-muted-foreground">{item.hint}</span>
                </span>
                <Switch
                  checked={Boolean(form[item.key])}
                  onCheckedChange={(checked) => setForm({ ...form, [item.key]: checked })}
                  aria-label={item.label}
                />
              </label>
            ))}
          </section>

          <div className="space-y-1.5">
            <Label htmlFor="priority">Dispatch priority</Label>
            <select
              id="priority"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.dispatch_priority}
              onChange={(event) =>
                setForm({
                  ...form,
                  dispatch_priority: event.target.value as Form["dispatch_priority"],
                })
              }
            >
              {PRIORITIES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {NUMBER_FIELDS.map((field) => (
            <div key={String(field.key)} className="space-y-1.5">
              <Label htmlFor={String(field.key)}>{field.label}</Label>
              <Input
                id={String(field.key)}
                type="number"
                value={String(form[field.key])}
                onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
              />
            </div>
          ))}

          <Button className="w-full" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save dispatch rules"}
          </Button>
        </div>
      )}
    </AdminShell>
  );
}
