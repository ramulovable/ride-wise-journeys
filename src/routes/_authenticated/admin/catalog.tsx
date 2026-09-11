import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/shells";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { fetchCategories, fetchLocations } from "@/lib/data";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/admin/catalog")({ component: Catalog });
function Catalog() {
  useRoleGuard("admin");
  const qc = useQueryClient();
  const [category, setCategory] = useState("");
  const [seats, setSeats] = useState(4);
  const [location, setLocation] = useState("");
  const [area, setArea] = useState("");
  const categories = useQuery({
    queryKey: ["categories", "all"],
    queryFn: () => fetchCategories(false),
  });
  const locations = useQuery({
    queryKey: ["locations", "all"],
    queryFn: () => fetchLocations(false),
  });
  async function addCategory() {
    const { error } = await supabase
      .from("vehicle_categories")
      .insert({ name: category.trim(), seat_capacity: seats });
    if (error) toast.error(error.message);
    else {
      setCategory("");
      void qc.invalidateQueries({ queryKey: ["categories"] });
    }
  }
  async function addLocation() {
    const { error } = await supabase
      .from("locations")
      .insert({ name: location.trim(), area: area.trim() || null });
    if (error) toast.error(error.message);
    else {
      setLocation("");
      setArea("");
      void qc.invalidateQueries({ queryKey: ["locations"] });
    }
  }
  async function toggle(table: "locations" | "vehicle_categories", id: string, value: boolean) {
    const { error } = await supabase.from(table).update({ is_active: value }).eq("id", id);
    if (error) toast.error(error.message);
    else void qc.invalidateQueries();
  }
  return (
    <AdminShell
      title="Catalog"
      subtitle="Manage service locations and vehicle categories without code changes."
    >
      <div className="grid gap-5 md:grid-cols-2">
        <section>
          <h2 className="mb-2 font-semibold">Vehicle categories</h2>
          <div className="mb-3 flex gap-2">
            <Input
              placeholder="E-Rickshaw"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <Input
              className="w-20"
              type="number"
              value={seats}
              onChange={(e) => setSeats(Number(e.target.value))}
            />
            <Button onClick={addCategory}>Add</Button>
          </div>
          <div className="space-y-2">
            {categories.data?.map((x) => (
              <div
                key={x.id}
                className="flex justify-between rounded-xl border bg-card p-3 text-sm"
              >
                <span>
                  {x.name} · {x.seat_capacity} seats
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggle("vehicle_categories", x.id, !x.is_active)}
                >
                  {x.is_active ? "Disable" : "Enable"}
                </Button>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2 className="mb-2 font-semibold">Locations ({locations.data?.length ?? 0})</h2>
          <div className="mb-3 grid grid-cols-[1fr_1fr_auto] gap-2">
            <Input
              placeholder="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <Input
              placeholder="Area / PIN"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
            <Button onClick={addLocation}>Add</Button>
          </div>
          <div className="max-h-[60vh] space-y-2 overflow-auto">
            {locations.data?.map((x) => (
              <div
                key={x.id}
                className="flex justify-between rounded-xl border bg-card p-3 text-sm"
              >
                <span>
                  {x.name}
                  {x.area ? ` · ${x.area}` : ""}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggle("locations", x.id, !x.is_active)}
                >
                  {x.is_active ? "Disable" : "Enable"}
                </Button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
