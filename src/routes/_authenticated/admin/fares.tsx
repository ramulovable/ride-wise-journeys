import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/shells";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/admin/fares")({
  head: () => ({
    meta: [
      { title: "Fare Management | Shahin Travels Admin" },
      { name: "description", content: "Configure centralized Shahin Travels vehicle fares." },
      { property: "og:title", content: "Fare Management | Shahin Travels Admin" },
      {
        property: "og:description",
        content: "Configure centralized Shahin Travels vehicle fares.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FareManagement,
});

function FareManagement() {
  useRoleGuard("admin");
  const qc = useQueryClient();
  const [ruleId, setRuleId] = useState("");
  const [minKm, setMinKm] = useState("");
  const [maxKm, setMaxKm] = useState("");
  const [rate, setRate] = useState("");
  const rules = useQuery({
    queryKey: ["fare-rules"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fare_rules").select("*").order("vehicle_class");
      if (error) throw error;
      return (data ?? []).filter(
        (rule) => !(rule.vehicle_class === "three_wheeler" && rule.journey_type === "reserve"),
      );
    },
  });
  const history = useQuery({
    queryKey: ["fare-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fare_rule_history")
        .select("id, table_name, action, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
  const slabs = useQuery({
    queryKey: ["fare-slabs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fare_slabs").select("*").order("min_km");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function updateRule(
    id: string,
    field: "rate_per_km" | "included_km" | "extra_km_rate",
    value: string,
  ) {
    const numericValue = value === "" ? null : Number(value);
    const changes =
      field === "rate_per_km"
        ? { rate_per_km: numericValue }
        : field === "included_km"
          ? { included_km: numericValue }
          : { extra_km_rate: numericValue };
    const { error } = await supabase.from("fare_rules").update(changes).eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Fare rule saved.");
      void qc.invalidateQueries({ queryKey: ["fare-rules"] });
    }
  }
  async function addSlab() {
    const rule = rules.data?.find((item) => item.id === ruleId);
    if (!rule || !minKm || !maxKm || !rate) {
      toast.error("Complete the slab details.");
      return;
    }
    const { error } = await supabase.from("fare_slabs").insert({
      fare_rule_id: ruleId,
      min_km: Number(minKm),
      max_km: Number(maxKm),
      rate: Number(rate),
      pricing_mode: rule.journey_type === "share" ? "flat_per_passenger" : "per_km",
    });
    if (error) toast.error(error.message);
    else {
      setMinKm("");
      setMaxKm("");
      setRate("");
      toast.success("Fare slab added.");
      void qc.invalidateQueries({ queryKey: ["fare-slabs"] });
    }
  }
  async function toggleSlab(id: string, isActive: boolean) {
    const { error } = await supabase
      .from("fare_slabs")
      .update({ is_active: !isActive })
      .eq("id", id);
    if (error) toast.error(error.message);
    else void qc.invalidateQueries({ queryKey: ["fare-slabs"] });
  }

  return (
    <AdminShell
      title="Fare management"
      subtitle="Central prices used for every new customer booking."
    >
      <div className="space-y-5">
        <DayNightSection />

        <ThreeWheelerReserveSection />

        <section className="grid gap-3 md:grid-cols-2">
          {rules.data?.map((rule) => (
            <article key={rule.id} className="rounded-lg border bg-card p-4">
              <div className="mb-3">
                <h2 className="font-semibold capitalize">
                  {rule.vehicle_class.replaceAll("_", " ")} ·{" "}
                  {rule.journey_type.replaceAll("_", " ")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {rule.ac_option === "any"
                    ? "All vehicles"
                    : rule.ac_option === "ac"
                      ? "AC"
                      : "Non-AC"}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label>
                  <Label>₹ / km</Label>
                  <Input
                    type="number"
                    defaultValue={rule.rate_per_km ?? ""}
                    onBlur={(e) => void updateRule(rule.id, "rate_per_km", e.target.value)}
                  />
                </label>
                <label>
                  <Label>Limit km</Label>
                  <Input
                    type="number"
                    defaultValue={rule.included_km ?? ""}
                    onBlur={(e) => void updateRule(rule.id, "included_km", e.target.value)}
                  />
                </label>
                <label>
                  <Label>Extra ₹/km</Label>
                  <Input
                    type="number"
                    defaultValue={rule.extra_km_rate ?? ""}
                    onBlur={(e) => void updateRule(rule.id, "extra_km_rate", e.target.value)}
                  />
                </label>
              </div>
              {rule.vehicle_class === "four_wheeler" && rule.rate_per_km == null ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Fare currently unavailable for this vehicle.
                </p>
              ) : null}
              <div className="mt-3 space-y-2">
                {slabs.data
                  ?.filter((slab) => slab.fare_rule_id === rule.id)
                  .map((slab) => (
                    <div
                      key={slab.id}
                      className="flex items-center justify-between rounded-md bg-muted p-2 text-sm"
                    >
                      <span>
                        {slab.min_km}–{slab.max_km} km · ₹{slab.rate}
                        {slab.pricing_mode === "flat_per_passenger" ? "/passenger" : "/km"}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void toggleSlab(slab.id, slab.is_active)}
                      >
                        {slab.is_active ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  ))}
              </div>
            </article>
          ))}
        </section>
        <section className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 font-semibold">Add distance slab</h2>
          <div className="grid gap-2 sm:grid-cols-4">
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={ruleId}
              onChange={(e) => setRuleId(e.target.value)}
            >
              <option value="">Fare rule</option>
              {rules.data
                ?.filter((rule) => rule.vehicle_class === "three_wheeler")
                .map((rule) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.journey_type}
                  </option>
                ))}
            </select>
            <Input
              type="number"
              placeholder="From km"
              value={minKm}
              onChange={(e) => setMinKm(e.target.value)}
            />
            <Input
              type="number"
              placeholder="To km"
              value={maxKm}
              onChange={(e) => setMaxKm(e.target.value)}
            />
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Rate ₹"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
              <Button onClick={() => void addSlab()}>Add</Button>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Fare change history</h2>
          {history.isSuccess && history.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">No fare changes recorded yet.</p>
          ) : (
            <ol className="max-h-80 space-y-2 overflow-auto text-xs">
              {history.data?.map((entry) => (
                <li key={entry.id} className="rounded-lg border bg-card p-2">
                  <span className="font-medium">
                    {entry.table_name === "fare_rules" ? "Fare rule" : "Distance slab"}{" "}
                    {entry.action === "insert"
                      ? "added"
                      : entry.action === "update"
                        ? "changed"
                        : "removed"}
                  </span>
                  <span className="ml-1 text-muted-foreground">
                    {formatDateTime(entry.created_at)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </AdminShell>
  );
}

type ConfigRow = {
  id: string;
  is_enabled: boolean;
  day_start_time: string;
  night_start_time: string;
  pricing_mode: string;
  night_multiplier: number;
  night_direct_rate: number | null;
  applies_to_per_km: boolean;
  applies_to_share: boolean;
  applies_to_reserve: boolean;
};

function DayNightSection() {
  const qc = useQueryClient();
  const [overrideCategory, setOverrideCategory] = useState("");

  const config = useQuery({
    queryKey: ["day-night-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("day_night_pricing_config")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as ConfigRow | null;
    },
  });
  const categories = useQuery({
    queryKey: ["vehicle-categories-basic"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vehicle_categories")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const overrides = useQuery({
    queryKey: ["day-night-overrides"],
    queryFn: async () => {
      const { data, error } = await supabase.from("day_night_vehicle_overrides").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  async function saveConfig(changes: Partial<ConfigRow>) {
    const row = config.data;
    if (!row) return;
    const { error } = await supabase
      .from("day_night_pricing_config")
      .update(changes)
      .eq("id", row.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Day/Night pricing saved.");
      void qc.invalidateQueries({ queryKey: ["day-night-config"] });
      void qc.invalidateQueries({ queryKey: ["fare-history"] });
    }
  }

  async function addOverride() {
    if (!overrideCategory) {
      toast.error("Choose a vehicle category.");
      return;
    }
    const { error } = await supabase
      .from("day_night_vehicle_overrides")
      .insert({ vehicle_category_id: overrideCategory });
    if (error) toast.error(error.message);
    else {
      setOverrideCategory("");
      toast.success("Override added.");
      void qc.invalidateQueries({ queryKey: ["day-night-overrides"] });
    }
  }

  async function updateOverride(
    id: string,
    changes: {
      is_enabled?: boolean;
      pricing_mode?: string;
      night_multiplier?: number | null;
      night_direct_rate?: number | null;
    },
  ) {
    const { error } = await supabase
      .from("day_night_vehicle_overrides")
      .update(changes)
      .eq("id", id);
    if (error) toast.error(error.message);
    else void qc.invalidateQueries({ queryKey: ["day-night-overrides"] });
  }

  async function removeOverride(id: string) {
    const { error } = await supabase.from("day_night_vehicle_overrides").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Override removed.");
      void qc.invalidateQueries({ queryKey: ["day-night-overrides"] });
    }
  }

  const row = config.data;

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Day / Night pricing</h2>
          <p className="text-xs text-muted-foreground">
            All times are Indian Standard Time. Night runs from the night start to the day start.
          </p>
        </div>
        {row ? (
          <Button
            size="sm"
            variant={row.is_enabled ? "default" : "outline"}
            onClick={() => void saveConfig({ is_enabled: !row.is_enabled })}
          >
            {row.is_enabled ? "On" : "Off"}
          </Button>
        ) : null}
      </div>

      {!row ? (
        <p className="text-sm text-muted-foreground">Loading pricing settings…</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <label>
              <Label>Day starts</Label>
              <Input
                type="time"
                defaultValue={row.day_start_time.slice(0, 5)}
                onBlur={(e) => void saveConfig({ day_start_time: e.target.value })}
              />
            </label>
            <label>
              <Label>Night starts</Label>
              <Input
                type="time"
                defaultValue={row.night_start_time.slice(0, 5)}
                onBlur={(e) => void saveConfig({ night_start_time: e.target.value })}
              />
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <label>
              <Label>Pricing style</Label>
              <select
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={row.pricing_mode}
                onChange={(e) => void saveConfig({ pricing_mode: e.target.value })}
              >
                <option value="multiplier">Multiplier</option>
                <option value="direct_rate">Direct night rate</option>
              </select>
            </label>
            <label>
              <Label>Night multiplier</Label>
              <Input
                type="number"
                step="0.1"
                defaultValue={row.night_multiplier}
                onBlur={(e) => void saveConfig({ night_multiplier: Number(e.target.value) })}
              />
            </label>
            <label>
              <Label>Night ₹ / km</Label>
              <Input
                type="number"
                defaultValue={row.night_direct_rate ?? ""}
                onBlur={(e) =>
                  void saveConfig({
                    night_direct_rate: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ["applies_to_per_km", "Per-km fares"],
                ["applies_to_share", "Share fares"],
                ["applies_to_reserve", "Reserve fares"],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                size="sm"
                variant={row[key] ? "default" : "outline"}
                onClick={() => void saveConfig({ [key]: !row[key] })}
              >
                {label}: {row[key] ? "On" : "Off"}
              </Button>
            ))}
          </div>

          <div className="space-y-2 border-t pt-3">
            <h3 className="text-sm font-semibold">Vehicle overrides</h3>
            {overrides.data?.length ? (
              overrides.data.map((item) => (
                <div key={item.id} className="rounded-md bg-muted p-2 text-sm">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {categories.data?.find((c) => c.id === item.vehicle_category_id)?.name ??
                        "Vehicle"}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={item.is_enabled ? "default" : "outline"}
                        onClick={() =>
                          void updateOverride(item.id, { is_enabled: !item.is_enabled })
                        }
                      >
                        {item.is_enabled ? "On" : "Off"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void removeOverride(item.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <select
                      className="h-9 rounded-md border bg-background px-3 text-sm"
                      value={item.pricing_mode}
                      onChange={(e) =>
                        void updateOverride(item.id, { pricing_mode: e.target.value })
                      }
                    >
                      <option value="multiplier">Multiplier</option>
                      <option value="direct_rate">Direct night rate</option>
                    </select>
                    <Input
                      type="number"
                      step="0.1"
                      placeholder="Multiplier"
                      defaultValue={item.night_multiplier ?? ""}
                      onBlur={(e) =>
                        void updateOverride(item.id, {
                          night_multiplier: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                    <Input
                      type="number"
                      placeholder="Night ₹/km"
                      defaultValue={item.night_direct_rate ?? ""}
                      onBlur={(e) =>
                        void updateOverride(item.id, {
                          night_direct_rate: e.target.value === "" ? null : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground">
                No vehicle overrides. All vehicles use the settings above.
              </p>
            )}
            <div className="flex gap-2">
              <select
                className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
                value={overrideCategory}
                onChange={(e) => setOverrideCategory(e.target.value)}
              >
                <option value="">Add override for…</option>
                {categories.data
                  ?.filter(
                    (category) =>
                      !overrides.data?.some((item) => item.vehicle_category_id === category.id),
                  )
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
              <Button onClick={() => void addOverride()}>Add</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
