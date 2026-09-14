import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { AdminShell } from "@/components/shells";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { fetchCategories, fetchLocations } from "@/lib/data";
import { useRoleGuard } from "@/lib/useRoleGuard";

type VehicleClass = "two_wheeler" | "three_wheeler" | "four_wheeler";
type CatalogTable = "vehicle_categories" | "vehicle_brands" | "vehicle_models" | "locations";

const CLASS_LABEL: Record<VehicleClass, string> = {
  two_wheeler: "Two Wheeler",
  three_wheeler: "Three Wheeler",
  four_wheeler: "Four Wheeler",
};
const CLASS_ORDER: VehicleClass[] = ["two_wheeler", "three_wheeler", "four_wheeler"];

type Brand = { id: string; name: string; category_id: string; is_active: boolean };
type Model = {
  id: string;
  name: string;
  brand_id: string;
  seat_capacity: number;
  supports_ac: boolean;
  is_active: boolean;
};

type EditState =
  | { kind: "category"; id: string; name: string; vehicleClass: VehicleClass; seats: number }
  | { kind: "brand"; id: string; name: string; categoryId: string }
  | { kind: "model"; id: string; name: string; brandId: string; seats: number; supportsAc: boolean };

type DeleteState = { table: CatalogTable; id: string; label: string; note: string };

export const Route = createFileRoute("/_authenticated/admin/catalog")({ component: Catalog });

function Catalog() {
  useRoleGuard("admin");
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [seats, setSeats] = useState(4);
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>("three_wheeler");
  const [brand, setBrand] = useState("");
  const [brandCategory, setBrandCategory] = useState("");
  const [model, setModel] = useState("");
  const [modelBrand, setModelBrand] = useState("");
  const [location, setLocation] = useState("");
  const [area, setArea] = useState("");
  const [pinCode, setPinCode] = useState("");
  const [edit, setEdit] = useState<EditState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DeleteState | null>(null);

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
      ((await supabase.from("vehicle_brands").select("*").order("name")).data ?? []) as Brand[],
  });
  const models = useQuery({
    queryKey: ["vehicle-models", "all"],
    queryFn: async () =>
      ((await supabase.from("vehicle_models").select("*").order("name")).data ?? []) as Model[],
  });

  const term = search.trim().toLowerCase();
  const categoryById = useMemo(
    () => new Map((categories.data ?? []).map((item) => [item.id, item])),
    [categories.data],
  );

  function matches(...values: (string | null | undefined)[]) {
    if (!term) return true;
    return values.some((value) => (value ?? "").toLowerCase().includes(term));
  }

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
    const { error } = await supabase.from("locations").insert({
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
  async function toggle(table: CatalogTable, id: string, value: boolean) {
    const { error } = await supabase.from(table).update({ is_active: value }).eq("id", id);
    if (error) toast.error(error.message);
    else void qc.invalidateQueries();
  }

  async function saveEdit() {
    if (!edit) return;
    let error: { message: string } | null = null;
    if (edit.kind === "category") {
      if (!edit.name.trim()) return toast.error("Name is required.");
      ({ error } = await supabase
        .from("vehicle_categories")
        .update({
          name: edit.name.trim(),
          vehicle_class: edit.vehicleClass,
          seat_capacity: edit.seats,
        })
        .eq("id", edit.id));
    } else if (edit.kind === "brand") {
      if (!edit.name.trim() || !edit.categoryId) return toast.error("Name and category required.");
      ({ error } = await supabase
        .from("vehicle_brands")
        .update({ name: edit.name.trim(), category_id: edit.categoryId })
        .eq("id", edit.id));
    } else {
      if (!edit.name.trim() || !edit.brandId) return toast.error("Name and brand required.");
      ({ error } = await supabase
        .from("vehicle_models")
        .update({
          name: edit.name.trim(),
          brand_id: edit.brandId,
          seat_capacity: edit.seats,
          supports_ac: edit.supportsAc,
        })
        .eq("id", edit.id));
    }
    if (error) toast.error(error.message);
    else {
      toast.success("Saved.");
      setEdit(null);
      void qc.invalidateQueries();
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    const { table, id, label } = pendingDelete;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error)
      toast.error(
        `${label} is still in use and cannot be deleted. Disable it instead. (${error.message})`,
      );
    else {
      toast.success(`${label} deleted.`);
      void qc.invalidateQueries();
    }
    setPendingDelete(null);
  }

  return (
    <AdminShell
      title="Catalog"
      subtitle="Manage vehicle types, brands, models and service locations without code changes."
    >
      <div className="mb-4">
        <Input
          placeholder="Search vehicle types, brands, models or locations"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <section>
          <h2 className="mb-2 font-semibold">Vehicle types by class</h2>
          <div className="mb-3 grid grid-cols-[1fr_1fr_auto] gap-2">
            <Input
              placeholder="E-Rickshaw"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
            <select
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={vehicleClass}
              onChange={(e) => setVehicleClass(e.target.value as VehicleClass)}
            >
              {CLASS_ORDER.map((item) => (
                <option key={item} value={item}>
                  {CLASS_LABEL[item]}
                </option>
              ))}
            </select>
            <Input
              className="w-20"
              type="number"
              value={seats}
              onChange={(e) => setSeats(Number(e.target.value))}
            />
            <Button onClick={addCategory}>Add</Button>
          </div>
          <div className="space-y-4">
            {CLASS_ORDER.map((cls) => {
              const items = (categories.data ?? []).filter(
                (item) => item.vehicle_class === cls && matches(item.name),
              );
              if (items.length === 0) return null;
              return (
                <div key={cls}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {CLASS_LABEL[cls]} ({items.length})
                  </p>
                  <div className="space-y-2">
                    {items.map((x) => (
                      <div
                        key={x.id}
                        className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3 text-sm"
                      >
                        <span>
                          {x.name} · {x.seat_capacity} seats
                          {x.is_active ? "" : " · disabled"}
                        </span>
                        <span className="flex shrink-0 gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setEdit({
                                kind: "category",
                                id: x.id,
                                name: x.name,
                                vehicleClass: x.vehicle_class as VehicleClass,
                                seats: x.seat_capacity,
                              })
                            }
                            aria-label={`Edit ${x.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => toggle("vehicle_categories", x.id, !x.is_active)}
                          >
                            {x.is_active ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              setPendingDelete({
                                table: "vehicle_categories",
                                id: x.id,
                                label: x.name,
                                note: "Brands, models and fares linked to this vehicle type must be removed first.",
                              })
                            }
                            aria-label={`Delete ${x.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <h2 className="mb-2 font-semibold">Brands &amp; models</h2>
            <div className="mb-2 flex gap-2">
              <select
                className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
                value={brandCategory}
                onChange={(e) => setBrandCategory(e.target.value)}
              >
                <option value="">Vehicle type</option>
                {(categories.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {CLASS_LABEL[item.vehicle_class as VehicleClass] ?? item.vehicle_class} ·{" "}
                    {item.name}
                  </option>
                ))}
              </select>
              <Input placeholder="Brand" value={brand} onChange={(e) => setBrand(e.target.value)} />
              <Button disabled={!brand.trim() || !brandCategory} onClick={addBrand}>
                Add
              </Button>
            </div>
            <div className="mb-4 flex gap-2">
              <select
                className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm"
                value={modelBrand}
                onChange={(e) => setModelBrand(e.target.value)}
              >
                <option value="">Brand</option>
                {(brands.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {categoryById.get(item.category_id)?.name ?? "—"} · {item.name}
                  </option>
                ))}
              </select>
              <Input placeholder="Model" value={model} onChange={(e) => setModel(e.target.value)} />
              <Button disabled={!model.trim() || !modelBrand} onClick={addModel}>
                Add
              </Button>
            </div>

            <div className="space-y-4">
              {CLASS_ORDER.map((cls) => {
                const classCategories = (categories.data ?? []).filter(
                  (item) => item.vehicle_class === cls,
                );
                const blocks = classCategories
                  .map((cat) => ({
                    cat,
                    catBrands: (brands.data ?? []).filter(
                      (item) =>
                        item.category_id === cat.id &&
                        (matches(item.name, cat.name) ||
                          (models.data ?? []).some(
                            (m) => m.brand_id === item.id && matches(m.name),
                          )),
                    ),
                  }))
                  .filter((block) => block.catBrands.length > 0);
                if (blocks.length === 0) return null;
                return (
                  <div key={cls} className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {CLASS_LABEL[cls]}
                    </p>
                    {blocks.map(({ cat, catBrands }) => (
                      <div key={cat.id} className="rounded-xl border bg-card p-3">
                        <p className="mb-2 text-sm font-semibold">{cat.name}</p>
                        <div className="space-y-3">
                          {catBrands.map((item) => {
                            const brandModels = (models.data ?? []).filter(
                              (m) => m.brand_id === item.id,
                            );
                            return (
                              <div key={item.id} className="rounded-lg border bg-background p-2.5">
                                <div className="flex items-center justify-between gap-2 text-sm">
                                  <span className="font-medium">
                                    {item.name}
                                    {item.is_active ? "" : " · disabled"}
                                  </span>
                                  <span className="flex shrink-0 gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        setEdit({
                                          kind: "brand",
                                          id: item.id,
                                          name: item.name,
                                          categoryId: item.category_id,
                                        })
                                      }
                                      aria-label={`Edit ${item.name}`}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        toggle("vehicle_brands", item.id, !item.is_active)
                                      }
                                    >
                                      {item.is_active ? "Disable" : "Enable"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={() =>
                                        setPendingDelete({
                                          table: "vehicle_brands",
                                          id: item.id,
                                          label: item.name,
                                          note: "Models and vehicles linked to this brand must be removed first.",
                                        })
                                      }
                                      aria-label={`Delete ${item.name}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </span>
                                </div>
                                <div className="mt-2 space-y-1.5">
                                  {brandModels.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">No models yet.</p>
                                  ) : (
                                    brandModels.map((m) => (
                                      <div
                                        key={m.id}
                                        className="flex items-center justify-between gap-2 text-xs"
                                      >
                                        <span>
                                          {m.name} · {m.seat_capacity} seats ·{" "}
                                          {m.supports_ac ? "AC available" : "Non-AC"}
                                          {m.is_active ? "" : " · disabled"}
                                        </span>
                                        <span className="flex shrink-0 gap-1">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                              setEdit({
                                                kind: "model",
                                                id: m.id,
                                                name: m.name,
                                                brandId: m.brand_id,
                                                seats: m.seat_capacity,
                                                supportsAc: m.supports_ac,
                                              })
                                            }
                                            aria-label={`Edit ${m.name}`}
                                          >
                                            <Pencil className="h-3 w-3" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                              toggle("vehicle_models", m.id, !m.is_active)
                                            }
                                          >
                                            {m.is_active ? "Disable" : "Enable"}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="destructive"
                                            onClick={() =>
                                              setPendingDelete({
                                                table: "vehicle_models",
                                                id: m.id,
                                                label: m.name,
                                                note: "Vehicles registered with this model must be removed first.",
                                              })
                                            }
                                            aria-label={`Delete ${m.name}`}
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </span>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
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
            {(locations.data ?? [])
              .filter((x) => matches(x.name, x.area, x.pinCode))
              .map((x) => (
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

      <Dialog open={edit !== null} onOpenChange={(open) => !open && setEdit(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {edit?.kind === "category"
                ? "Edit vehicle type"
                : edit?.kind === "brand"
                  ? "Edit brand"
                  : "Edit model"}
            </DialogTitle>
          </DialogHeader>
          {edit ? (
            <div className="space-y-3">
              <Input
                value={edit.name}
                placeholder="Name"
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
              {edit.kind === "category" ? (
                <>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={edit.vehicleClass}
                    onChange={(e) =>
                      setEdit({ ...edit, vehicleClass: e.target.value as VehicleClass })
                    }
                  >
                    {CLASS_ORDER.map((item) => (
                      <option key={item} value={item}>
                        {CLASS_LABEL[item]}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    value={edit.seats}
                    onChange={(e) => setEdit({ ...edit, seats: Number(e.target.value) })}
                  />
                </>
              ) : null}
              {edit.kind === "brand" ? (
                <select
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={edit.categoryId}
                  onChange={(e) => setEdit({ ...edit, categoryId: e.target.value })}
                >
                  {(categories.data ?? []).map((item) => (
                    <option key={item.id} value={item.id}>
                      {CLASS_LABEL[item.vehicle_class as VehicleClass] ?? item.vehicle_class} ·{" "}
                      {item.name}
                    </option>
                  ))}
                </select>
              ) : null}
              {edit.kind === "model" ? (
                <>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    value={edit.brandId}
                    onChange={(e) => setEdit({ ...edit, brandId: e.target.value })}
                  >
                    {(brands.data ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {categoryById.get(item.category_id)?.name ?? "—"} · {item.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="number"
                    value={edit.seats}
                    onChange={(e) => setEdit({ ...edit, seats: Number(e.target.value) })}
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={edit.supportsAc}
                      onChange={(e) => setEdit({ ...edit, supportsAc: e.target.checked })}
                    />
                    AC available
                  </label>
                </>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.label}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. {pendingDelete?.note} If it is still in use, disable it
              instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminShell>
  );
}
