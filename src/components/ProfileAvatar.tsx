import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Camera, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const BUCKET = "profile-photos";

/** Turns a stored profile photo path into a temporary viewable link. */
export function useAvatarUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ["avatar-url", path],
    enabled: Boolean(path),
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      if (!path) return null;
      if (path.startsWith("http")) return path;
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
      return data?.signedUrl ?? null;
    },
  });
}

export function VerifiedTick({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <BadgeCheck
      className={`shrink-0 fill-[#1d9bf0] text-white ${className}`}
      aria-label="Verified driver"
    />
  );
}

export function ProfileAvatar({
  path,
  url,
  name,
  size = 56,
  className = "",
}: {
  path?: string | null | undefined;
  url?: string | null | undefined;
  name?: string | null | undefined;
  size?: number | undefined;
  className?: string | undefined;
}) {
  const signed = useAvatarUrl(path ?? null);
  const src = url ?? signed.data ?? null;
  const initial = (name ?? "S").trim().slice(0, 1).toUpperCase();

  if (src) {
    return (
      <img
        src={src}
        alt={name ? `${name} profile photo` : "Profile photo"}
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className={`rounded-full object-cover ${className}`}
        loading="lazy"
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size }}
      className={`flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ${className}`}
      aria-hidden="true"
    >
      {initial}
    </span>
  );
}

/** Lets the signed-in user pick, replace or remove their profile photo. */
export function ProfilePhotoManager() {
  const { profile, user, refresh } = useAuth();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function upload(file: File) {
    if (!user) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    setBusy(true);
    const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${user.id}/profile-${Date.now()}.${extension}`;
    const uploaded = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (uploaded.error) {
      setBusy(false);
      toast.error("The photo could not be uploaded. Please try again.");
      return;
    }
    const { error } = await supabase.from("profiles").update({ photo_url: path }).eq("id", user.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["avatar-url"] });
    await refresh();
    toast.success("Profile photo updated.");
  }

  async function removePhoto() {
    if (!user || !profile?.photo_url) return;
    setBusy(true);
    if (!profile.photo_url.startsWith("http")) {
      await supabase.storage.from(BUCKET).remove([profile.photo_url]);
    }
    const { error } = await supabase.from("profiles").update({ photo_url: null }).eq("id", user.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await qc.invalidateQueries({ queryKey: ["avatar-url"] });
    await refresh();
    toast.success("Profile photo removed.");
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative rounded-full"
        aria-label="Change profile photo"
      >
        <ProfileAvatar path={profile?.photo_url} name={profile?.full_name} size={72} />
        <span className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground">
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Camera className="h-3.5 w-3.5" />
          )}
        </span>
      </button>
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">Profile photo</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
            {profile?.photo_url ? "Change photo" : "Upload photo"}
          </Button>
          {profile?.photo_url ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void removePhoto()}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Remove photo
            </Button>
          ) : null}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
