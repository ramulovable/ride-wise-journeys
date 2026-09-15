import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CustomerShell, RiderShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { IstClock } from "@/components/IstClock";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { rupees } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/fares")({
  head: () => ({
    meta: [
      { title: "Fare details — Shahin Travels" },
      { name: "description", content: "Current per-kilometre rates, slabs and night pricing." },
      { property: "og:title", content: "Fare details — Shahin Travels" },
      { property: "og:description", content: "Current rates, slabs and night pricing." },
    ],
  }),
  component: FareDetails,
});

const CLASS_LABEL: Record<string, string> = {
  two_wheeler: "Bike & Scooty",
  three_wheeler: "Auto & E-Rickshaw",
  four_wheeler: "Car",
};

function FareDetails() {
  const { role } = useAuth();
  const Shell = role === "rider" ? RiderShell : CustomerShell;

  const rules = useQuery({
    queryKey: ["public-fare-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fare_rules")
        .select("id, vehicle_class, journey_type, ac_option, rate_per_km, included_km, extra_km_rate")
        .eq("is_active", true)
        .order("vehicle_class");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const slabs = useQuery({
    queryKey: ["public-fare-slabs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fare_slabs")
        .select("id, fare_rule_id, min_km, max_km, pricing_mode, rate")
        .eq("is_active", true)
        .order("min_km");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  return (
    <Shell title="Fare details" subtitle="Live rates used to price every booking.">
      <div className="space-y-4">
        <IstClock />
        {rules.isSuccess && rules.data.length === 0 ? (
          <EmptyState
            title="No fares published"
            description="Fares have not been configured yet. Please check back soon."
          />
        ) : (
          (rules.data ?? []).map((rule) => {
            const ruleSlabs = (slabs.data ?? []).filter((slab) => slab.fare_rule_id === rule.id);
            return (
              <section key={rule.id} className="rounded-2xl border border-border bg-card p-4">
                <p className="text-sm font-semibold text-foreground">
                  {CLASS_LABEL[rule.vehicle_class] ?? rule.vehicle_class}
                </p>
                <p className="text-xs capitalize text-muted-foreground">
                  {rule.journey_type} journey
                  {rule.ac_option === "any" ? "" : ` · ${rule.ac_option.replace("_", "-")}`}
                </p>
                {rule.rate_per_km != null ? (
                  <p className="mt-2 text-sm">
                    <strong>{rupees(Number(rule.rate_per_km))}</strong> per km
                    {rule.included_km ? ` · first ${rule.included_km} km included` : ""}
                    {rule.extra_km_rate
                      ? ` · extra km ${rupees(Number(rule.extra_km_rate))}`
                      : ""}
                  </p>
                ) : null}
                {ruleSlabs.length ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {ruleSlabs.map((slab) => (
                      <li key={slab.id} className="flex justify-between">
                        <span className="text-muted-foreground">
                          {slab.min_km}–{slab.max_km} km
                        </span>
                        <strong>
                          {rupees(Number(slab.rate))}
                          {slab.pricing_mode === "per_km" ? " / km" : ""}
                        </strong>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })
        )}
        <p className="text-xs text-muted-foreground">
          Night pricing follows the India time shown above. All rides are cash on completion.
        </p>
      </div>
    </Shell>
  );
}
