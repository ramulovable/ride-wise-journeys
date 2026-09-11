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

export const Route = createFileRoute("/_authenticated/rider/vehicle")({ component: Vehicles });
function Vehicles() {
  useRoleGuard("rider");
  const { user } = useAuth();
  const qc = useQueryClient();
  const [category, setCategory] = useState("");
  const [number, setNumber] = useState("");
  const [model, setModel] = useState("");
  const [license, setLicense] = useState("");
  const [seats, setSeats] = useState(4);
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => fetchCategories() });
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
    if (!category || !number.trim())
      return toast.error("Select a category and enter the registration number.");
    const { error } = await supabase.from("rider_vehicles").insert({
      rider_id: user!.id,
      vehicle_category_id: category,
      vehicle_number: number.trim().toUpperCase(),
      vehicle_model: model.trim() || null,
      license_number: license.trim() || null,
      seat_capacity: seats,
      is_primary: !vehicles.data?.length,
    });
    if (error) toast.error(error.message);
    else {
      setNumber("");
      setModel("");
      setLicense("");
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
      <section className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2">
        <div>
          <Label>Category</Label>
          <select
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="">Select</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Registration number</Label>
          <Input value={number} onChange={(e) => setNumber(e.target.value)} />
        </div>
        <div>
          <Label>Model</Label>
          <Input value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div>
          <Label>License number</Label>
          <Input value={license} onChange={(e) => setLicense(e.target.value)} />
        </div>
        <div>
          <Label>Seat capacity</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={seats}
            onChange={(e) => setSeats(Number(e.target.value))}
          />
        </div>
        <Button className="self-end" onClick={save}>
          Add vehicle
        </Button>
      </section>
      <div className="mt-4 space-y-3">
        {vehicles.isSuccess && vehicles.data.length === 0 ? (
          <EmptyState
            title="No vehicles"
            description="Add your first vehicle to create routes and fares."
          />
        ) : (
          vehicles.data?.map((v) => (
            <article
              key={v.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-card p-4"
            >
              <div>
                <p className="font-semibold">{v.vehicle_number}</p>
                <p className="text-xs text-muted-foreground">
                  {v.vehicle_model || "Model not set"} · {v.seat_capacity} seats{" "}
                  {v.is_primary ? "· Primary" : ""}
                </p>
                <div className="mt-3 flex gap-2">
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
