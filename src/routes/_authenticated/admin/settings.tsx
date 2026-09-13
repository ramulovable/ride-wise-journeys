import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/shells";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAppSettings } from "@/lib/settings";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  head: () => ({
    meta: [
      { title: "Business Settings | Shahin Travels Admin" },
      {
        name: "description",
        content: "Set the Shahin Travels driver subscription fee and support contact details.",
      },
      { property: "og:title", content: "Business Settings | Shahin Travels Admin" },
      {
        property: "og:description",
        content: "Set the driver subscription fee and support contact details.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  useRoleGuard("admin");
  const qc = useQueryClient();
  const settings = useAppSettings();
  const [fee, setFee] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setFee(String(settings.data.subscriptionFee));
    setPhone(settings.data.supportPhone);
    setEmail(settings.data.supportEmail);
  }, [settings.data]);

  async function save() {
    const feeValue = Number(fee);
    if (!Number.isFinite(feeValue) || feeValue < 0) {
      toast.error("Enter a valid monthly fee.");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(phone.replace(/\D/g, ""))) {
      toast.error("Enter a valid 10-digit support number.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Enter a valid support email address.");
      return;
    }
    setBusy(true);
    const [feeResult, phoneResult, emailResult] = await Promise.all([
      supabase
        .from("app_settings")
        .update({ numeric_value: feeValue })
        .eq("key", "rider_monthly_subscription_fee"),
      supabase
        .from("app_text_settings")
        .update({ value: phone.replace(/\D/g, "") })
        .eq("key", "support_phone"),
      supabase.from("app_text_settings").update({ value: email.trim() }).eq("key", "support_email"),
    ]);
    setBusy(false);
    const error = feeResult.error ?? phoneResult.error ?? emailResult.error;
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Settings saved.");
    void qc.invalidateQueries({ queryKey: ["app-settings"] });
  }

  return (
    <AdminShell
      title="Business settings"
      subtitle="Subscription fee and support contacts used across the app."
    >
      <div className="max-w-md space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fee">Driver monthly subscription fee (₹)</Label>
          <Input id="fee" type="number" value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Support / WhatsApp number</Label>
          <Input
            id="phone"
            inputMode="numeric"
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Support email</Label>
          <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button className="w-full" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </AdminShell>
  );
}
