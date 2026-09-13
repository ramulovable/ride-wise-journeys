import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { fetchCategories } from "@/lib/data";
import { useRoleGuard } from "@/lib/useRoleGuard";
import {
  VEHICLE_IMAGE_BUCKET,
  VEHICLE_IMAGE_FALLBACK,
  fetchVehicleImages,
} from "@/lib/vehicleImages";

export const Route = createFileRoute("/_authenticated/admin/vehicle-images")({
  head: () => ({
    meta: [
      { title: "Vehicle images | Shahin Travels Admin" },
      {
        name: "description",
        content: "Upload and map vehicle pictures to categories, brands and models.",
      },
      { property: "og:title", content: "Vehicle images | Shahin Travels Admin" },
      {
        property: "og:description",
        content: "Upload and map vehicle pictures to categories, brands and models.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VehicleImagesPage,
});

function VehicleImagesPage() {
  useRoleGuard("admin");
  const qc = useQueryClient();
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [modelId, setModelId] = useState("");
  const [variantId, setVariantId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const categories = useQuery({
    queryKey: ["categories", "all"],
    queryFn: () => fetchCategories(false),
  });
  const brands = useQuery({
    queryKey: ["vehicle-brands", "all"],
    queryFn: async () =>
      (await supabase.from("vehicle_brands").select("id, name, category_id").order("name")).data ??
      [],
  });
  const models = useQuery({
    queryKey: ["vehicle-models", "all"],
    queryFn: async () =>
      (await supabase.from("vehicle_models").select("id, name, brand_id").order("name")).data ?? [],
  });
  const variants = useQuery({
    queryKey: ["vehicle-variants", "all"],
    queryFn: async () =>
      (await supabase.from("vehicle_variants").select("id, name, model_id").order("name")).data ??
      [],
  });
  const images = useQuery({
    queryKey: ["vehicle-images", false],
    queryFn: () => fetchVehicleImages(false),
  });

  const labelFor = (row: {
    category_id: string | null;
    brand_id: string | null;
    model_id: string | null;
    variant_id: string | null;
  }) => {
    if (row.variant_id)
      return variants.data?.find((v) => v.id === row.variant_id)?.name ?? "Variant";
    if (row.model_id) return models.data?.find((m) => m.id === row.model_id)?.name ?? "Model";
    if (row.brand_id) return brands.data?.find((b) => b.id === row.brand_id)?.name ?? "Brand";
    return categories.data?.find((c) => c.id === row.category_id)?.name ?? "Category";
  };

  async function upload() {
    if (!file) {
      toast.error("Choose an image first.");
      return;
    }
    if (!categoryId && !brandId && !modelId && !variantId) {
      toast.error("Choose what this picture is for.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be 5 MB or smaller.");
      return;
    }
    setBusy(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${crypto.randomUUID()}.${ext}`;
    const upload = await supabase.storage.from(VEHICLE_IMAGE_BUCKET).upload(path, file);
    if (upload.error) {
      setBusy(false);
      toast.error(upload.error.message);
      return;
    }
    const { error } = await supabase.from("vehicle_images").insert({
      category_id: categoryId || null,
      brand_id: brandId || null,
      model_id: modelId || null,
      variant_id: variantId || null,
      image_path: path,
      is_primary: true,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Image saved.");
    setFile(null);
    void qc.invalidateQueries({ queryKey: ["vehicle-images"] });
  }

  async function setPrimary(id: string) {
    const row = images.data?.find((image) => image.id === id);
    if (!row) return;
    const siblings = (images.data ?? []).filter(
      (image) =>
        image.id !== id &&
        image.category_id === row.category_id &&
        image.brand_id === row.brand_id &&
        image.model_id === row.model_id &&
        image.variant_id === row.variant_id,
    );
    await Promise.all(
      siblings.map((image) =>
        supabase.from("vehicle_images").update({ is_primary: false }).eq("id", image.id),
      ),
    );
    const { error } = await supabase
      .from("vehicle_images")
      .update({ is_primary: true })
      .eq("id", id);
    if (error) toast.error(error.message);
    else void qc.invalidateQueries({ queryKey: ["vehicle-images"] });
  }

  async function toggleActive(id: string, next: boolean) {
    const { error } = await supabase
      .from("vehicle_images")
      .update({ is_active: next })
      .eq("id", id);
    if (error) toast.error(error.message);
    else void qc.invalidateQueries({ queryKey: ["vehicle-images"] });
  }

  async function remove(id: string, path: string) {
    const { error } = await supabase.from("vehicle_images").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.storage.from(VEHICLE_IMAGE_BUCKET).remove([path]);
    void qc.invalidateQueries({ queryKey: ["vehicle-images"] });
  }

  const selectClass =
    "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";

  return (
    <AdminShell title="Vehicle images" subtitle="Pictures shown across booking and driver screens.">
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Category</Label>
            <select
              className={selectClass}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">Not set</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Brand</Label>
            <select
              className={selectClass}
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
            >
              <option value="">Not set</option>
              {brands.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Model</Label>
            <select
              className={selectClass}
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
            >
              <option value="">Not set</option>
              {models.data?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Variant</Label>
            <select
              className={selectClass}
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
            >
              <option value="">Not set</option>
              {variants.data?.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vi-file">Picture (max 5 MB)</Label>
          <Input
            id="vi-file"
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <Button className="w-full" disabled={busy} onClick={() => void upload()}>
          {busy ? "Uploading…" : "Upload image"}
        </Button>
      </section>

      <div className="mt-4">
        {images.isSuccess && images.data.length === 0 ? (
          <EmptyState
            title="No vehicle images yet"
            description="Upload pictures to show them on booking and driver screens."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {images.data?.map((image) => (
              <article
                key={image.id}
                className="flex gap-3 rounded-2xl border border-border bg-card p-3"
              >
                <img
                  src={image.url ?? VEHICLE_IMAGE_FALLBACK}
                  alt={`${labelFor(image)} vehicle`}
                  className="h-20 w-28 rounded-lg object-cover"
                  loading="lazy"
                />
                <div className="flex-1 space-y-1 text-sm">
                  <p className="font-medium">{labelFor(image)}</p>
                  <p className="text-xs text-muted-foreground">
                    {image.is_primary ? "Primary" : "Alternate"} ·{" "}
                    {image.is_active ? "Active" : "Hidden"}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {image.is_primary ? null : (
                      <Button size="sm" variant="outline" onClick={() => void setPrimary(image.id)}>
                        Set primary
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void toggleActive(image.id, !image.is_active)}
                    >
                      {image.is_active ? "Hide" : "Show"}
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => void remove(image.id, image.image_path)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
