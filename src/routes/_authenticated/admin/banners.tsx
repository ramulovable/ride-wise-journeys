import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { AdminShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useBanners } from "@/lib/banners";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/admin/banners")({
  head: () => ({
    meta: [
      { title: "Promotional Banners | Shahin Travels Admin" },
      {
        name: "description",
        content: "Create, order and activate the promotional banners shown to Shahin Travels customers.",
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

function BannersPage() {
  useRoleGuard("admin");
  const qc = useQueryClient();
  const banners = useBanners(false);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [badge, setBadge] = useState("");
  const [action, setAction] = useState("");
  const [image, setImage] = useState("");
  const [order, setOrder] = useState("");
  const [busy, setBusy] = useState(false);

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["promotional-banners"] });
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
      image_url: image.trim() || null,
      display_order: Number(order) || (banners.data?.length ?? 0) + 1,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTitle("");
    setSubtitle("");
    setBadge("");
    setAction("");
    setImage("");
    setOrder("");
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

  async function remove(id: string) {
    const { error } = await supabase.from("promotional_banners").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Banner deleted.");
      refresh();
    }
  }

  return (
    <AdminShell title="Promotional banners" subtitle="Control the sliding banners customers see.">
      <div className="space-y-4">
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <p className="text-sm font-semibold">Add a banner</p>
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
              <Label htmlFor="b-image">Image URL (optional)</Label>
              <Input id="b-image" value={image} onChange={(e) => setImage(e.target.value)} />
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
          <Button onClick={addBanner} disabled={busy}>
            Add banner
          </Button>
        </section>

        {banners.isSuccess && banners.data.length === 0 ? (
          <EmptyState title="No banners yet" description="Add your first promotional banner above." />
        ) : null}

        <div className="space-y-3">
          {(banners.data ?? []).map((banner) => (
            <article key={banner.id} className="rounded-2xl border border-border bg-card p-4">
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
                    onCheckedChange={(checked) => void patch(banner.id, { is_active: checked })}
                    aria-label="Banner active"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Delete banner"
                    onClick={() => void remove(banner.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <Input
                  defaultValue={banner.title}
                  onBlur={(e) =>
                    e.target.value.trim() && e.target.value !== banner.title
                      ? void patch(banner.id, { title: e.target.value.trim() })
                      : undefined
                  }
                />
                <Input
                  defaultValue={banner.subtitle}
                  onBlur={(e) =>
                    e.target.value !== banner.subtitle
                      ? void patch(banner.id, { subtitle: e.target.value })
                      : undefined
                  }
                />
                <Input
                  defaultValue={String(banner.displayOrder)}
                  inputMode="numeric"
                  onBlur={(e) =>
                    Number(e.target.value) !== banner.displayOrder
                      ? void patch(banner.id, { display_order: Number(e.target.value) || 0 })
                      : undefined
                  }
                />
              </div>
            </article>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
