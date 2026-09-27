import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/shells";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { fetchCategories } from "@/lib/data";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/admin/etickets")({
  head: () => ({
    meta: [
      { title: "E-Ticket Settings | Shahin Travels Admin" },
      { name: "description", content: "Configure prepaid E-Ticket fares, driver commission and trip insurance." },
      { property: "og:title", content: "E-Ticket Settings | Shahin Travels Admin" },
      { property: "og:description", content: "Prepaid E-Ticket fares, commission and insurance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ETicketAdmin,
});

type Settings = {
  id: string;
  is_enabled: boolean;
  commission_type: string;
  commission_value: number;
  insurance_enabled: boolean;
  insurance_charge: number;
  insurance_provider: string | null;
  insurance_policy_number: string | null;
  insurance_claim_rules: string | null;
};
type Fare = { vehicle_category_id: string; base_fare: number; per_km_rate: number; min_fare: number; is_active: boolean };

function ETicketAdmin() {
  useRoleGuard("admin");
  const qc = useQueryClient();
  const settingsQ = useQuery({
    queryKey: ["eticket-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("eticket_settings" as never).select("*").limit(1).single();
      if (error) throw new Error(error.message);
      return data as unknown as Settings;
    },
  });
  const cats = useQuery({ queryKey: ["categories-all"], queryFn: () => fetchCategories(true) });
  const faresQ = useQuery({
    queryKey: ["eticket-fares"],
    queryFn: async () => {
      const { data, error } = await supabase.from("eticket_fares" as never).select("*");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Fare[];
    },
  });

  const [s, setS] = useState<Settings | null>(null);
  const [fares, setFares] = useState<Record<string, Fare>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (settingsQ.data) setS(settingsQ.data); }, [settingsQ.data]);
  useEffect(() => {
    if (!cats.data) return;
    const map: Record<string, Fare> = {};
    for (const c of cats.data) {
      const f = faresQ.data?.find((x) => x.vehicle_category_id === c.id);
      map[c.id] = f ?? { vehicle_category_id: c.id, base_fare: 0, per_km_rate: 0, min_fare: 0, is_active: false };
    }
    setFares(map);
  }, [cats.data, faresQ.data]);

  const setFare = (id: string, patch: Partial<Fare>) => setFares((m) => ({ ...m, [id]: { ...(m[id] as Fare), ...patch } }));

  async function save() {
    if (!s) return;
    if (s.commission_type === "percent" && s.commission_value > 100) { toast.error("Commission cannot exceed 100%."); return; }
    setBusy(true);
    const { id, ...rest } = s;
    const r1 = await supabase.from("eticket_settings" as never).update({
      ...rest,
      commission_value: Number(rest.commission_value),
      insurance_charge: Number(rest.insurance_charge),
    } as never).eq("id", id);
    const rows = Object.values(fares).map((f) => ({
      vehicle_category_id: f.vehicle_category_id,
      base_fare: Number(f.base_fare) || 0,
      per_km_rate: Number(f.per_km_rate) || 0,
      min_fare: Number(f.min_fare) || 0,
      is_active: f.is_active,
    }));
    const r2 = await supabase.from("eticket_fares" as never).upsert(rows as never, { onConflict: "vehicle_category_id" });
    setBusy(false);
    const err = r1.error ?? r2.error;
    if (err) { toast.error(err.message); return; }
    toast.success("E-Ticket settings saved.");
    void qc.invalidateQueries({ queryKey: ["eticket-settings"] });
    void qc.invalidateQueries({ queryKey: ["eticket-fares"] });
  }

  if (!s) return <AdminShell title="E-Ticket"><p className="text-sm text-muted-foreground">Loading…</p></AdminShell>;

  return (
    <AdminShell title="E-Ticket (Physical Ride)" subtitle="Prepaid tickets — online payment only. Cash rides are unaffected.">
      <div className="max-w-2xl space-y-5">
        <label className="flex items-center justify-between rounded-2xl border border-border p-3 text-sm font-semibold">
          <span>E-Ticket service active</span>
          <input type="checkbox" className="h-5 w-5" checked={s.is_enabled} onChange={(e) => setS({ ...s, is_enabled: e.target.checked })} />
        </label>

        <div className="space-y-3 rounded-2xl border border-border p-3">
          <p className="font-semibold">Driver commission</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ctype">Type</Label>
              <select id="ctype" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={s.commission_type} onChange={(e) => setS({ ...s, commission_type: e.target.value })}>
                <option value="percent">Percent (%)</option>
                <option value="flat">Flat (₹ per ticket)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cval">Value</Label>
              <Input id="cval" type="number" min={0} value={s.commission_value} onChange={(e) => setS({ ...s, commission_value: e.target.value as unknown as number })} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Driver gets ticket fare minus commission, only after the trip is completed.</p>
        </div>

        <div className="space-y-3 rounded-2xl border border-border p-3">
          <p className="font-semibold">Fare per vehicle</p>
          {(cats.data ?? []).map((c) => {
            const f = fares[c.id];
            if (!f) return null;
            return (
              <div key={c.id} className="space-y-2 rounded-xl bg-muted/40 p-3">
                <label className="flex items-center justify-between text-sm font-medium">
                  <span>{c.name}</span>
                  <input type="checkbox" className="h-5 w-5" checked={f.is_active} onChange={(e) => setFare(c.id, { is_active: e.target.checked })} />
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1"><Label className="text-xs">Base ₹</Label><Input type="number" value={f.base_fare} onChange={(e) => setFare(c.id, { base_fare: e.target.value as unknown as number })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Per km ₹</Label><Input type="number" value={f.per_km_rate} onChange={(e) => setFare(c.id, { per_km_rate: e.target.value as unknown as number })} /></div>
                  <div className="space-y-1"><Label className="text-xs">Minimum ₹</Label><Input type="number" value={f.min_fare} onChange={(e) => setFare(c.id, { min_fare: e.target.value as unknown as number })} /></div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-3 rounded-2xl border border-border p-3">
          <label className="flex items-center justify-between font-semibold">
            <span>Trip insurance</span>
            <input type="checkbox" className="h-5 w-5" checked={s.insurance_enabled} onChange={(e) => setS({ ...s, insurance_enabled: e.target.checked })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Charge per ticket (₹)</Label><Input type="number" value={s.insurance_charge} onChange={(e) => setS({ ...s, insurance_charge: e.target.value as unknown as number })} /></div>
            <div className="space-y-1.5"><Label>Provider</Label><Input placeholder="Acko / Go Digit" value={s.insurance_provider ?? ""} onChange={(e) => setS({ ...s, insurance_provider: e.target.value })} /></div>
          </div>
          <div className="space-y-1.5"><Label>Master policy number</Label><Input value={s.insurance_policy_number ?? ""} onChange={(e) => setS({ ...s, insurance_policy_number: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label>Claim rules &amp; process (printed on ticket)</Label>
            <textarea className="min-h-28 w-full rounded-md border border-input bg-background p-3 text-sm" value={s.insurance_claim_rules ?? ""} onChange={(e) => setS({ ...s, insurance_claim_rules: e.target.value })} />
          </div>
        </div>

        <Button className="w-full" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save E-Ticket settings"}</Button>
      </div>
    </AdminShell>
  );
}
