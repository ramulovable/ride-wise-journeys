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
import { adminReviewETicketUpi } from "@/lib/eticket.functions";

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

        <UpiAdmin />
      </div>
    </AdminShell>
  );
}

function UpiAdmin() {
  const qc = useQueryClient();
  const [vpa, setVpa] = useState("");
  const [payee, setPayee] = useState("Shahin Travels");
  const cfg = useQuery({
    queryKey: ["eticket-upi-admin"],
    queryFn: async () => {
      const { data } = await supabase.from("app_text_settings").select("key,value").in("key", ["eticket_upi_id", "eticket_upi_name"]);
      return new Map((data ?? []).map((r) => [r.key, r.value]));
    },
  });
  useEffect(() => {
    if (!cfg.data) return;
    setVpa(cfg.data.get("eticket_upi_id") ?? "");
    setPayee(cfg.data.get("eticket_upi_name") || "Shahin Travels");
  }, [cfg.data]);
  const pending = useQuery({
    queryKey: ["eticket-utr-pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etickets" as never)
        .select("id,pnr,passenger_name,passenger_mobile,total_amount,upi_utr,utr_submitted_at,created_at")
        .eq("payment_status", "VERIFYING")
        .order("utr_submitted_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Array<{ id: string; pnr: string; passenger_name: string; passenger_mobile: string; total_amount: number; upi_utr: string; utr_submitted_at: string; created_at: string }>;
    },
    refetchInterval: 15000,
  });

  async function saveUpi() {
    if (vpa && !/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(vpa.trim())) { toast.error("Sahi UPI ID daalein (jaise name@okaxis)."); return; }
    const { error } = await supabase.from("app_text_settings").upsert(
      [
        { key: "eticket_upi_id", value: vpa.trim() },
        { key: "eticket_upi_name", value: payee.trim() || "Shahin Travels" },
      ] as never,
      { onConflict: "key" },
    );
    if (error) { toast.error(error.message); return; }
    toast.success("UPI ID save ho gaya.");
    void qc.invalidateQueries({ queryKey: ["eticket-upi-admin"] });
  }

  async function review(id: string, approve: boolean) {
    try {
      await adminReviewETicketUpi({ data: { ticketId: id, approve } });
      toast.success(approve ? "Ticket confirm ho gaya." : "Booking failed mark ho gaya.");
      void qc.invalidateQueries({ queryKey: ["eticket-utr-pending"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update nahi hua.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-border p-3">
        <p className="font-semibold">Direct UPI / QR payment</p>
        <div className="space-y-1.5"><Label>Aapka UPI ID</Label><Input placeholder="name@okaxis" value={vpa} onChange={(e) => setVpa(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Payee name</Label><Input value={payee} onChange={(e) => setPayee(e.target.value)} /></div>
        <p className="text-xs text-muted-foreground">Khali chhodne par customers ko UPI option nahi dikhega.</p>
        <Button className="w-full" onClick={() => void saveUpi()}>Save UPI ID</Button>
      </div>
      <div className="space-y-2 rounded-2xl border border-border p-3">
        <p className="font-semibold">UTR verification ({pending.data?.length ?? 0})</p>
        <p className="text-xs text-muted-foreground">Apne bank/UPI app me UTR, amount aur time milaayein, phir Confirm ya Reject karein.</p>
        {(pending.data ?? []).map((t) => (
          <div key={t.id} className="space-y-1 rounded-xl bg-muted/40 p-3 text-sm">
            <p className="font-bold">PNR {t.pnr} · ₹{Number(t.total_amount)}</p>
            <p>UTR <span className="font-mono font-semibold">{t.upi_utr}</span></p>
            <p className="text-xs text-muted-foreground">{t.passenger_name} · {t.passenger_mobile} · {new Date(t.utr_submitted_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
            <div className="flex gap-2 pt-1">
              <Button size="sm" className="flex-1" onClick={() => void review(t.id, true)}>Confirm</Button>
              <Button size="sm" variant="destructive" className="flex-1" onClick={() => void review(t.id, false)}>Reject</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
