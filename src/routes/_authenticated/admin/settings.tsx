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
        content:
          "Set the Shahin Travels subscription fee, referral reward, withdrawal limits and support contacts.",
      },
      { property: "og:title", content: "Business Settings | Shahin Travels Admin" },
      {
        property: "og:description",
        content: "Set the subscription fee, referral reward, withdrawal limits and contacts.",
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
  const [reward, setReward] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [pushTitle, setPushTitle] = useState("");
  const [pushBody, setPushBody] = useState("");
  const [referralEnabled, setReferralEnabled] = useState(true);
  const [referralMax, setReferralMax] = useState("");
  const [referralCondition, setReferralCondition] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteMessage, setInviteMessage] = useState("");
  const [copyToast, setCopyToast] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setFee(String(settings.data.subscriptionFee));
    setPhone(settings.data.supportPhone);
    setEmail(settings.data.supportEmail);
    setReward(String(settings.data.referralReward));
    setMinAmount(String(settings.data.withdrawalMin));
    setMaxAmount(String(settings.data.withdrawalMax));
    setQrUrl(settings.data.qrBaseUrl);
    setPushTitle(settings.data.pushTitle);
    setPushBody(settings.data.pushBody);
    setReferralEnabled(settings.data.referralEnabled);
    setReferralMax(String(settings.data.referralMaxPerUser));
    setReferralCondition(settings.data.referralCondition);
    setInviteUrl(settings.data.referralInviteUrl);
    setInviteMessage(settings.data.referralInviteMessage);
    setCopyToast(settings.data.referralCopyToast);
  }, [settings.data]);

  async function save() {
    const numbers: Array<[string, number, string]> = [
      ["rider_monthly_subscription_fee", Number(fee), "monthly fee"],
      ["referral_reward_amount", Number(reward), "referral reward"],
      ["withdrawal_min_amount", Number(minAmount), "minimum withdrawal"],
      ["withdrawal_max_amount", Number(maxAmount), "maximum withdrawal"],
      ["referral_program_enabled", referralEnabled ? 1 : 0, "referral switch"],
      ["referral_max_per_user", Number(referralMax), "referral limit"],
    ];
    for (const [, value, label] of numbers) {
      if (!Number.isFinite(value) || value < 0) {
        toast.error(`Enter a valid ${label}.`);
        return;
      }
    }
    if (Number(maxAmount) < Number(minAmount)) {
      toast.error("Maximum withdrawal must be at least the minimum.");
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
    if (!/^https?:\/\/\S+$/.test(qrUrl.trim())) {
      toast.error("Enter a valid QR link starting with https://");
      return;
    }
    if (!pushTitle.trim() || !pushBody.trim()) {
      toast.error("Notification title and message cannot be empty.");
      return;
    }

    setBusy(true);
    const texts: Array<[string, string]> = [
      ["support_phone", phone.replace(/\D/g, "")],
      ["support_email", email.trim()],
      ["qr_base_url", qrUrl.trim().replace(/\/$/, "")],
      ["push_title_template", pushTitle.trim()],
      ["push_body_template", pushBody.trim()],
    ];
    const results = await Promise.all([
      ...numbers.map(([key, value]) =>
        supabase.from("app_settings").update({ numeric_value: value }).eq("key", key),
      ),
      ...texts.map(([key, value]) =>
        supabase.from("app_text_settings").update({ value }).eq("key", key),
      ),
    ]);
    setBusy(false);
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      toast.error(failed.error.message);
      return;
    }
    toast.success("Settings saved.");
    void qc.invalidateQueries({ queryKey: ["app-settings"] });
  }

  return (
    <AdminShell
      title="Business settings"
      subtitle="Fees, rewards, withdrawals, QR link and support contacts."
    >
      <div className="max-w-md space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="fee">Driver monthly subscription fee (₹)</Label>
          <Input id="fee" type="number" value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reward">Referral reward per side (₹)</Label>
          <Input
            id="reward"
            type="number"
            value={reward}
            onChange={(e) => setReward(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="min">Minimum withdrawal (₹)</Label>
            <Input
              id="min"
              type="number"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="max">Maximum withdrawal (₹)</Label>
            <Input
              id="max"
              type="number"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
            />
          </div>
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
        <div className="space-y-1.5">
          <Label htmlFor="qr">QR link base</Label>
          <Input id="qr" value={qrUrl} onChange={(e) => setQrUrl(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pt">Ride alert title</Label>
          <Input id="pt" value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pb">Ride alert message</Label>
          <Input id="pb" value={pushBody} onChange={(e) => setPushBody(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            You can use {"{pickup}"}, {"{drop}"}, {"{distance}"} and {"{fare}"}.
          </p>
        </div>
        <Button className="w-full" onClick={() => void save()} disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
      </div>
    </AdminShell>
  );
}
