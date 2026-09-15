import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { AdminShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import {
  isExternalImageRef,
  removeBannerImage,
  uploadBannerImage,
  useBanners,
  type PromotionalBanner,
} from "@/lib/banners";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/admin/banners")({
  head: () => ({
    meta: [
      { title: "Promotional Banners | Shahin Travels Admin" },
      {
        name: "description",
        content:
          "Upload banner pictures, order and activate the promotions shown to Shahin Travels customers.",
      },
      { property: "og:title", content: "Promotional Banners | Shahin Travels Admin" },
      {
        property: "og:description",
        content: "Manage the sliding promotional banners shown in the app.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BannersPage,
});

type ImagePickerProps = {
  previewUrl: string | null;
  fileName: string | null;
  busy: boolean;
  onPick: (file: File) => void;
  onClear: () => void;
};

function BannerImagePicker({ previewUrl, fileName, busy, onPick, onClear }: ImagePickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="space-y-2 rounded-2xl border border-dashed border-border bg-muted/30 p-3">
      <p className="text-sm font-semibold">Banner image</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(file);
        }}
      />

      {previewUrl ? (
        <div className="space-y-2">
          <div className="relative overflow-hidden rounded-xl bg-muted">
            <img
              src={previewUrl}
              alt="Banner preview"
              className="aspect-[16/7] w-full object-cover"
            />
            {busy ? (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : null}
          </div>
          {fileName ? (
            <p className="truncate text-xs text-muted-foreground">{fileName}</p>
          ) : null}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="mr-1.5 h-4 w-4" /> Replace image
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onClear}>
              Remove image
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="h-24 w-full flex-col gap-1"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <>
              <ImagePlus className="h-6 w-6" />
              <span className="text-sm font-medium">Tap to upload from gallery</span>
              <span className="text-[11px] text-muted-foreground">JPG or PNG, up to 5 MB</span>
            </>
          )}
        </Button>
      )}
    </div>
  );
}

function BannersPage() {
  useRoleGuard("admin");
  const qc = useQueryClient();
  const banners = useBanners(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [badge, setBadge] = useState("");
  const [action, setAction] = useState("");
  const [order, setOrder] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [imageRef, setImageRef] = useState<string | null>(null);
  const [imageUrlField, setImageUrlField] = useState("");
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PromotionalBanner | null>(null);

  useEffect(() => {
    return () => {
      if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview);
    };
  }, [localPreview]);

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["promotional-banners"] });
  }

  async function pickNewImage(file: File) {
    setUploading(true);
    const preview = URL.createObjectURL(file);
    setLocalPreview(preview);
    setFileName(file.name);
    try {
      const path = await uploadBannerImage(file);
      await removeBannerImage(imageRef);
      setImageRef(path);
      toast.success("Image uploaded.");
    } catch (error) {
      setLocalPreview(null);
      setFileName(null);
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function clearNewImage() {
    await removeBannerImage(imageRef);
    setImageRef(null);
    setLocalPreview(null);
    setFileName(null);
  }

  function resetForm() {
    setTitle("");
    setSubtitle("");
    setBadge("");
    setAction("");
    setOrder("");
    setImageRef(null);
    setImageUrlField("");
    setLocalPreview(null);
    setFileName(null);
  }

  async function addBanner() {
    if (!title.trim()) {
      toast.error("Enter a banner title.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("promotional_banners").insert({
      title: title.trim(),
      subtitle: subtitle.trim(),
      badge_text: badge.trim() || null,
      action_url: action.trim() || null,
      image_url: imageRef ?? imageUrlField.trim() ?? null,
      display_order: Number(order) || (banners.data?.length ?? 0) + 1,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    resetForm();
    toast.success("Banner added.");
    refresh();
  }

  async function patch(
    id: string,
    values: Partial<{
      title: string;
      subtitle: string;
      badge_text: string | null;
      action_url: string | null;
      image_url: string | null;
      display_order: number;
      is_active: boolean;
    }>,
  ) {
    const { error } = await supabase.from("promotional_banners").update(values).eq("id", id);
    if (error) toast.error(error.message);
    else refresh();
  }

  async function replaceBannerImage(banner: PromotionalBanner, file: File) {
    try {
      const path = await uploadBannerImage(file);
      const { error } = await supabase
        .from("promotional_banners")
        .update({ image_url: path })
        .eq("id", banner.id);
      if (error) throw new Error(error.message);
      await removeBannerImage(banner.imageRef);
      toast.success("Image updated.");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Upload failed.");
    }
  }

  async function confirmDelete() {
    const banner = pendingDelete;
    setPendingDelete(null);
    if (!banner) return;
    const { error } = await supabase.from("promotional_banners").delete().eq("id", banner.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await removeBannerImage(banner.imageRef);
    toast.success("Banner deleted.");
    refresh();
  }

  return (
    <AdminShell title="Promotional banners" subtitle="Control the sliding banners customers see.">
      <div className="space-y-4">
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Add a banner</p>

          <BannerImagePicker
            previewUrl={localPreview}
            fileName={fileName}
            busy={uploading}
            onPick={(file) => void pickNewImage(file)}
            onClear={() => void clearNewImage()}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="b-title">Title</Label>
              <Input id="b-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-sub">Subtitle</Label>
              <Input id="b-sub" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-badge">Badge</Label>
              <Input id="b-badge" value={badge} onChange={(e) => setBadge(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-action">Action link</Label>
              <Input
                id="b-action"
                placeholder="/referral or https://…"
                value={action}
                onChange={(e) => setAction(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-order">Order</Label>
              <Input
                id="b-order"
                inputMode="numeric"
                value={order}
                onChange={(e) => setOrder(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              className="text-xs font-medium text-muted-foreground underline"
              onClick={() => setAdvanced((v) => !v)}
            >
              {advanced ? "Hide advanced" : "Advanced: enter image URL"}
            </button>
            {advanced ? (
              <Input
                placeholder="https://…"
                value={imageUrlField}
                onChange={(e) => setImageUrlField(e.target.value)}
                disabled={Boolean(imageRef)}
              />
            ) : null}
          </div>

          <Button className="w-full" onClick={() => void addBanner()} disabled={busy || uploading}>
            Add banner
          </Button>
        </section>

        {banners.isSuccess && banners.data.length === 0 ? (
          <EmptyState title="No banners yet" description="Add your first promotional banner above." />
        ) : null}

        <div className="space-y-3">
          {(banners.data ?? []).map((banner) => (
            <BannerCard
              key={banner.id}
              banner={banner}
              onPatch={patch}
              onReplaceImage={replaceBannerImage}
              onDelete={() => setPendingDelete(banner)}
            />
          ))}
        </div>
      </div>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this banner?</AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.title}” and its uploaded picture will be permanently removed from the
              app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminShell>
  );
}

type BannerCardProps = {
  banner: PromotionalBanner;
  onPatch: (
    id: string,
    values: Partial<{
      title: string;
      subtitle: string;
      badge_text: string | null;
      action_url: string | null;
      image_url: string | null;
      display_order: number;
      is_active: boolean;
    }>,
  ) => Promise<void>;
  onReplaceImage: (banner: PromotionalBanner, file: File) => Promise<void>;
  onDelete: () => void;
};

function BannerCard({ banner, onPatch, onReplaceImage, onDelete }: BannerCardProps) {
  const [uploading, setUploading] = useState(false);

  async function pick(file: File) {
    setUploading(true);
    await onReplaceImage(banner, file);
    setUploading(false);
  }

  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {banner.badgeText ? (
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase">
              {banner.badgeText}
            </span>
          ) : null}
          <p className="mt-1 truncate font-semibold text-foreground">{banner.title}</p>
          <p className="truncate text-xs text-muted-foreground">{banner.subtitle}</p>
          {banner.actionUrl ? (
            <p className="truncate text-[11px] text-muted-foreground">{banner.actionUrl}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Switch
            checked={banner.isActive}
            onCheckedChange={(checked) => void onPatch(banner.id, { is_active: checked })}
            aria-label="Banner active"
          />
          <Button variant="ghost" size="icon" aria-label="Delete banner" onClick={onDelete}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <BannerImagePicker
          previewUrl={banner.imageUrl}
          fileName={
            banner.imageRef && !isExternalImageRef(banner.imageRef) ? "Uploaded image" : null
          }
          busy={uploading}
          onPick={(file) => void pick(file)}
          onClear={() => void onPatch(banner.id, { image_url: null })}
        />
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Input
          defaultValue={banner.title}
          onBlur={(e) =>
            e.target.value.trim() && e.target.value !== banner.title
              ? void onPatch(banner.id, { title: e.target.value.trim() })
              : undefined
          }
        />
        <Input
          defaultValue={banner.subtitle}
          onBlur={(e) =>
            e.target.value !== banner.subtitle
              ? void onPatch(banner.id, { subtitle: e.target.value })
              : undefined
          }
        />
        <Input
          defaultValue={String(banner.displayOrder)}
          inputMode="numeric"
          onBlur={(e) =>
            Number(e.target.value) !== banner.displayOrder
              ? void onPatch(banner.id, { display_order: Number(e.target.value) || 0 })
              : undefined
          }
        />
      </div>
    </article>
  );
}
