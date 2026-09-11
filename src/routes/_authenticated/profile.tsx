import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell, CustomerShell, RiderShell } from "@/components/shells";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My profile — Shahin Travels" },
      { name: "description", content: "Update your Shahin Travels profile details." },
      { property: "og:title", content: "My profile — Shahin Travels" },
      { property: "og:description", content: "Update your Shahin Travels profile details." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { profile, role, refresh } = useAuth();
  const [fullName, setFullName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setAddress(profile?.address ?? "");
  }, [profile]);

  async function save() {
    if (!profile) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: fullName.trim(), address: address.trim() || null })
      .eq("id", profile.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Profile saved.");
    await refresh();
  }

  const body = (
    <div className="space-y-4">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="p-name">Full name</Label>
          <Input id="p-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-mobile">Mobile number</Label>
          <Input id="p-mobile" value={profile?.mobile ?? ""} readOnly className="bg-muted" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-address">Address</Label>
          <Textarea id="p-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <Button className="w-full" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </Button>
      </section>
    </div>
  );

  if (role === "admin") return <AdminShell title="My profile">{body}</AdminShell>;
  if (role === "rider") return <RiderShell title="My profile">{body}</RiderShell>;
  return <CustomerShell title="My profile">{body}</CustomerShell>;
}
