import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/shells";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
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
    const { error } = await supabase
      .from("fare_rules")
      .update({ [field]: value === "" ? null : Number(value) })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Fare rule saved.");
      void qc.invalidateQueries({ queryKey: ["fare-rules"] });
    }
  }
  async function addSlab() {
    const rule = rules.data?.find((item) => item.id === ruleId);
    if (!rule || !minKm || !maxKm || !rate) return toast.error("Complete the slab details.");
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
      </div>
    </AdminShell>
  );
}
