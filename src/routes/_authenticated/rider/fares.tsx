import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { RiderShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { fetchLocations } from "@/lib/data";
import { rupees } from "@/lib/format";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/rider/fares")({ component: Fares });
function Fares() {
  useRoleGuard("rider");
  const { user } = useAuth();
  const qc = useQueryClient();
  const [vehicle, setVehicle] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [share, setShare] = useState("");
  const [reserve, setReserve] = useState("");
  const locations = useQuery({ queryKey: ["locations"], queryFn: () => fetchLocations() });
  const vehicles = useQuery({
    queryKey: ["vehicles", user?.id],
    enabled: Boolean(user),
    queryFn: async () =>
      (
        await supabase
          .from("rider_vehicles")
          .select("id, vehicle_number")
          .eq("rider_id", user!.id)
          .eq("is_active", true)
      ).data ?? [],
  });
  const fares = useQuery({
    queryKey: ["fares", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rider_route_fares")
        .select("*")
        .eq("rider_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const name = (id: string) => locations.data?.find((l) => l.id === id)?.name ?? "—";
  async function save() {
    if (!vehicle || !from || !to || from === to || Number(share) <= 0 || Number(reserve) <= 0) {
      toast.error("Complete a valid directional fare.");
      return;
    }
    const { error } = await supabase.from("rider_route_fares").upsert(
      {
        rider_id: user!.id,
        vehicle_id: vehicle,
        from_location_id: from,
        to_location_id: to,
        share_fare: Number(share),
        reserve_fare: Number(reserve),
        is_active: true,
      },
      { onConflict: "rider_id,vehicle_id,from_location_id,to_location_id" },
    );
    if (error) toast.error(error.message);
    else {
      toast.success("Fare saved.");
      void qc.invalidateQueries({ queryKey: ["fares"] });
    }
  }
  async function toggle(id: string, enabled: boolean) {
    await supabase.from("rider_route_fares").update({ is_active: enabled }).eq("id", id);
    void qc.invalidateQueries({ queryKey: ["fares"] });
  }
  const selector = (
    value: string,
    set: (s: string) => void,
    options: { id: string; name: string }[],
    placeholder: string,
  ) => (
    <select
      className="h-9 w-full rounded-md border bg-background px-3 text-sm"
      value={value}
      onChange={(e) => set(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {options.map((x) => (
        <option key={x.id} value={x.id}>
          {x.name}
        </option>
      ))}
    </select>
  );
  return (
    <RiderShell
      title="Routes & fares"
      subtitle="Fares are directional; reserve is a flat trip price."
    >
      <section className="grid gap-3 rounded-2xl border bg-card p-4 sm:grid-cols-2">
        <div>
          <Label>Vehicle</Label>
          {selector(
            vehicle,
            setVehicle,
            (vehicles.data ?? []).map((v) => ({ id: v.id, name: v.vehicle_number })),
            "Select vehicle",
          )}
        </div>
        <div>
          <Label>From</Label>
          {selector(from, setFrom, locations.data ?? [], "Pickup")}
        </div>
        <div>
          <Label>To</Label>
          {selector(to, setTo, locations.data ?? [], "Destination")}
        </div>
        <div>
          <Label>Share fare / passenger</Label>
          <Input type="number" value={share} onChange={(e) => setShare(e.target.value)} />
        </div>
        <div>
          <Label>Reserve fare / trip</Label>
          <Input type="number" value={reserve} onChange={(e) => setReserve(e.target.value)} />
        </div>
        <Button className="self-end" onClick={save}>
          Save route fare
        </Button>
      </section>
      <div className="mt-4 space-y-2">
        {fares.isSuccess && fares.data.length === 0 ? (
          <EmptyState
            title="No route fares"
            description="Add a directional route for one of your vehicles."
          />
        ) : (
          fares.data?.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3"
            >
              <div>
                <p className="text-sm font-semibold">
                  {name(f.from_location_id)} → {name(f.to_location_id)}
                </p>
                <p className="text-xs text-muted-foreground">
                  Share {rupees(f.share_fare)} · Reserve {rupees(f.reserve_fare)}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => toggle(f.id, !f.is_active)}>
                {f.is_active ? "Disable" : "Enable"}
              </Button>
            </div>
          ))
        )}
      </div>
    </RiderShell>
  );
}
