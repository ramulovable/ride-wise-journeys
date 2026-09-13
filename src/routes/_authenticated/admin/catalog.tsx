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
  const [vehicleClass, setVehicleClass] = useState<
    "two_wheeler" | "three_wheeler" | "four_wheeler"
  >("three_wheeler");
  const [brand, setBrand] = useState("");
  const [brandCategory, setBrandCategory] = useState("");
  const [model, setModel] = useState("");
  const [modelBrand, setModelBrand] = useState("");
  const [location, setLocation] = useState("");
  const [area, setArea] = useState("");
  const [pinCode, setPinCode] = useState("");
  const categories = useQuery({
    queryKey: ["categories", "all"],
    queryFn: () => fetchCategories(false),
  });
  const locations = useQuery({
    queryKey: ["locations", "all"],
    queryFn: () => fetchLocations(false),
  });
  const brands = useQuery({
    queryKey: ["vehicle-brands", "all"],
    queryFn: async () =>
      (await supabase.from("vehicle_brands").select("*").order("name")).data ?? [],
  });
  const models = useQuery({
    queryKey: ["vehicle-models", "all"],
    queryFn: async () =>
      (await supabase.from("vehicle_models").select("*").order("name")).data ?? [],
  });
  async function addCategory() {
    const { error } = await supabase
      .from("vehicle_categories")
      .insert({ name: category.trim(), seat_capacity: seats, vehicle_class: vehicleClass });
    if (error) toast.error(error.message);
    else {
      setCategory("");
      void qc.invalidateQueries({ queryKey: ["categories"] });
    }
  }
  async function addBrand() {
    const { error } = await supabase
      .from("vehicle_brands")
      .insert({ name: brand.trim(), category_id: brandCategory });
    if (error) toast.error(error.message);
    else {
      setBrand("");
      void qc.invalidateQueries({ queryKey: ["vehicle-brands"] });
    }
  }
  async function addModel() {
    const { error } = await supabase
      .from("vehicle_models")
      .insert({ name: model.trim(), brand_id: modelBrand, seat_capacity: seats });
    if (error) toast.error(error.message);
    else {
      setModel("");
      void qc.invalidateQueries({ queryKey: ["vehicle-models"] });
    }
  }
  async function addLocation() {
    const { error } = await supabase
      .from("locations")
      .insert({
        name: location.trim(),
        area: area.trim() || null,
        pin_code: pinCode.trim() || null,
      });
    if (error) toast.error(error.message);
    else {
      setLocation("");
      setArea("");
      setPinCode("");
      void qc.invalidateQueries({ queryKey: ["locations"] });
    }
  }
  async function toggle(
    table: "locations" | "vehicle_categories" | "vehicle_brands" | "vehicle_models",
    id: string,
    value: boolean,
  ) {
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
          <div className="mb-3 grid grid-cols-[1fr_1fr_auto] gap-2">
            <Input
              placeholder="E-Rickshaw"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={vehicleClass}
              onChange={(e) => setVehicleClass(e.target.value as typeof vehicleClass)}
            >
              <option value="two_wheeler">Two Wheeler</option>
              <option value="three_wheeler">Three Wheeler</option>
              <option value="four_wheeler">Four Wheeler</option>
            </select>
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
                  {x.name} · {x.vehicle_class.replaceAll("_", " ")} · {x.seat_capacity} seats
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
        <section className="space-y-4">
          <div>
            <h2 className="mb-2 font-semibold">Vehicle brands</h2>
            <div className="mb-3 flex gap-2">
              <select
                className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
                value={brandCategory}
                onChange={(e) => setBrandCategory(e.target.value)}
              >
                <option value="">Category</option>
                {categories.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <Input placeholder="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
              <Button disabled={!brand.trim() || !brandCategory} onClick={addBrand}>
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {brands.data?.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between rounded-xl border bg-card p-3 text-sm"
                >
                  <span>{item.name}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggle("vehicle_brands", item.id, !item.is_active)}
                  >
                    {item.is_active ? "Disable" : "Enable"}
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h2 className="mb-2 font-semibold">Vehicle models</h2>
            <div className="mb-3 flex gap-2">
              <select
                className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
                value={modelBrand}
                onChange={(e) => setModelBrand(e.target.value)}
              >
                <option value="">Brand</option>
                {brands.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
              <Input placeholder="Model" value={model} onChange={(e) => setModel(e.target.value)} />
              <Button disabled={!model.trim() || !modelBrand} onClick={addModel}>
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {models.data?.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between rounded-xl border bg-card p-3 text-sm"
                >
                  <span>{item.name}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggle("vehicle_models", item.id, !item.is_active)}
                  >
                    {item.is_active ? "Disable" : "Enable"}
                  </Button>
                </div>
              ))}
            </div>
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
            <Input placeholder="Area" value={area} onChange={(e) => setArea(e.target.value)} />
            <Input
              className="w-24"
              placeholder="PIN"
              inputMode="numeric"
              maxLength={6}
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value.replace(/\D/g, ""))}
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
                  {x.pinCode ? ` · PIN ${x.pinCode}` : ""}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => toggle("locations", x.id, !x.isActive)}
                >
                  {x.isActive ? "Disable" : "Enable"}
                </Button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
