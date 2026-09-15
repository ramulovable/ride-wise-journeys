import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { RiderShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchCategories } from "@/lib/data";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/rider/vehicle")({
  head: () => ({
    meta: [
      { title: "My vehicles — Shahin Travels driver" },
      { name: "description", content: "Add your vehicles and download printable booking QR codes." },
      { property: "og:title", content: "My vehicles — Shahin Travels driver" },
      { property: "og:description", content: "Add vehicles and download booking QR codes." },
    ],
  }),
  component: Vehicles,
});

function Vehicles() {
  useRoleGuard("rider");
  const { user } = useAuth();
  const qc = useQueryClient();
  const [category, setCategory] = useState("");
  const [brandName, setBrandName] = useState("");
  const [modelName, setModelName] = useState("");
  const [number, setNumber] = useState("");
  const [hasAc, setHasAc] = useState(false);
  const [saving, setSaving] = useState(false);

  const categories = useQuery({ queryKey: ["categories"], queryFn: () => fetchCategories() });
  const selectedCategory = categories.data?.find((item) => item.id === category);

  const vehicles = useQuery({
    queryKey: ["vehicles", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rider_vehicles")
        .select("*")
        .eq("rider_id", user!.id)
        .order("created_at");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  async function save() {
    if (!category || !brandName.trim() || !modelName.trim() || !number.trim()) {
      toast.error("Enter category, brand, model and vehicle number.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("rider_vehicles").insert({
      rider_id: user!.id,
      vehicle_category_id: category,
      brand_name: brandName.trim(),
      vehicle_model: modelName.trim(),
      vehicle_number: number.trim().toUpperCase(),
      seat_capacity: selectedCategory?.seat_capacity ?? 4,
      is_primary: !vehicles.data?.length,
      has_ac: selectedCategory?.vehicle_class === "four_wheeler" && hasAc,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      setBrandName("");
      setModelName("");
      setNumber("");
      setHasAc(false);
      toast.success("Vehicle added.");
      void qc.invalidateQueries({ queryKey: ["vehicles"] });
    }
  }

  async function patch(id: string, values: { is_active?: boolean; is_primary?: boolean }) {
    const { error } = await supabase
      .from("rider_vehicles")
      .update(values)
      .eq("id", id)
      .eq("rider_id", user!.id);
    if (error) toast.error(error.message);
    else void qc.invalidateQueries({ queryKey: ["vehicles"] });
  }

  function download(id: string, numberValue: string) {
    const svg = document.getElementById(`qr-${id}`);
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${numberValue}-qr.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <RiderShell title="My vehicles" subtitle="Add vehicles and download printable QR codes.">
      <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label>Vehicle category</Label>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Select category</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Brand / Company</Label>
          <Input
            value={brandName}
            placeholder="e.g. Honda"
            onChange={(e) => setBrandName(e.target.value)}
          />
        </div>
        <div>
          <Label>Model name</Label>
          <Input
            value={modelName}
            placeholder="e.g. Activa 6G"
            onChange={(e) => setModelName(e.target.value)}
          />
        </div>
        <div>
          <Label>Vehicle number</Label>
          <Input
            value={number}
            placeholder="BR 07 AB 1234"
            onChange={(e) => setNumber(e.target.value)}
          />
        </div>
        {selectedCategory?.vehicle_class === "four_wheeler" ? (
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={hasAc} onChange={(e) => setHasAc(e.target.checked)} />
            Air conditioned
          </label>
        ) : null}
        <Button className="sm:col-span-2" disabled={saving} onClick={save}>
          {saving ? "Adding…" : "Add vehicle"}
        </Button>
      </section>

      <div className="mt-4 space-y-3">
        {vehicles.isSuccess && vehicles.data.length === 0 ? (
          <EmptyState
            title="No vehicles"
            description="Add your first vehicle to receive matching booking requests."
          />
        ) : (
          vehicles.data?.map((v) => (
            <article
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4"
            >
              <div>
                <p className="font-semibold">{v.vehicle_number}</p>
                <p className="text-xs text-muted-foreground">
                  {[v.brand_name, v.vehicle_model].filter(Boolean).join(" ") || "Model not set"} ·{" "}
                  {v.seat_capacity} seats {v.is_primary ? "· Primary" : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => patch(v.id, { is_active: !v.is_active })}
                  >
                    {v.is_active ? "Deactivate" : "Activate"}
                  </Button>
                  {!v.is_primary ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => patch(v.id, { is_primary: true })}
                    >
                      Make primary
                    </Button>
                  ) : null}
                  <Button size="sm" onClick={() => download(v.id, v.vehicle_number)}>
                    Download QR
                  </Button>
                </div>
              </div>
              <div className="rounded-lg bg-white p-2">
                <QRCodeSVG
                  id={`qr-${v.id}`}
                  value={`${window.location.origin}/vehicle/${v.qr_token}`}
                  size={112}
                />
              </div>
            </article>
          ))
        )}
      </div>
    </RiderShell>
  );
}
