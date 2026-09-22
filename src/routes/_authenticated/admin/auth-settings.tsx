import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/shells";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/admin/auth-settings")({
  head: () => ({
    meta: [
      { title: "Authentication & Onboarding | Shahin Travels Admin" },
      {
        name: "description",
        content:
          "Control SMS code and PIN sign-in rules, app permissions and the languages customers and drivers can choose.",
      },
      { property: "og:title", content: "Authentication & Onboarding | Shahin Travels Admin" },
      {
        property: "og:description",
        content: "SMS code and PIN rules, permission policy and language list.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthSettingsPage,
});

const NUMERIC_KEYS = [
  { key: "otp_enabled", label: "SMS code verification on (1) / off (0)" },
  { key: "pin_login_enabled", label: "PIN login on (1) / off (0)" },
  { key: "pin_length", label: "PIN length (digits)" },
  { key: "otp_expiry_seconds", label: "Code expiry (seconds)" },
  { key: "otp_resend_cooldown_seconds", label: "Resend wait (seconds)" },
  { key: "otp_max_attempts", label: "Wrong code attempts allowed" },
  { key: "max_failed_pin_attempts", label: "Wrong PIN attempts allowed" },
  { key: "pin_lockout_minutes", label: "PIN lockout (minutes)" },
] as const;

function AuthSettingsPage() {
  useRoleGuard("admin");
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const settings = useQuery({
    queryKey: ["auth-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("key, numeric_value")
        .in(
          "key",
          NUMERIC_KEYS.map((item) => item.key),
        );
      return data ?? [];
    },
  });

  const languages = useQuery({
    queryKey: ["admin-languages"],
    queryFn: async () => {
      const { data } = await supabase
        .from("languages")
        .select("code, native_name, english_name, is_active, sort_order")
        .order("sort_order");
      return data ?? [];
    },
  });

  const permissions = useQuery({
    queryKey: ["admin-permission-policies"],
    queryFn: async () => {
      const { data } = await supabase
        .from("permission_policies")
        .select(
          "id, permission_key, display_name, description, required_for, is_mandatory, is_active, sort_order",
        )
        .order("sort_order");
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!settings.data) return;
    setValues(Object.fromEntries(settings.data.map((row) => [row.key, String(row.numeric_value)])));
  }, [settings.data]);

  async function save() {
    for (const item of NUMERIC_KEYS) {
      const value = Number(values[item.key]);
      if (!Number.isFinite(value) || value < 0) {
        toast.error(`Enter a valid value for "${item.label}".`);
        return;
      }
    }
    setBusy(true);
    const results = await Promise.all(
      NUMERIC_KEYS.map((item) =>
        supabase
          .from("app_settings")
          .update({ numeric_value: Number(values[item.key]) })
          .eq("key", item.key),
      ),
    );
    setBusy(false);
    const failed = results.find((result) => result.error);
    if (failed?.error) {
      toast.error(failed.error.message);
      return;
    }
    toast.success("Sign-in settings saved.");
    void qc.invalidateQueries({ queryKey: ["auth-settings"] });
  }

  async function toggleLanguage(code: string, active: boolean) {
    const { error } = await supabase
      .from("languages")
      .update({ is_active: active })
      .eq("code", code);
    if (error) {
      toast.error(error.message);
      return;
    }
    void qc.invalidateQueries({ queryKey: ["admin-languages"] });
    void qc.invalidateQueries({ queryKey: ["languages"] });
  }

  async function updatePolicy(id: string, patch: { is_mandatory?: boolean; is_active?: boolean }) {
    const { error } = await supabase.from("permission_policies").update(patch).eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    void qc.invalidateQueries({ queryKey: ["admin-permission-policies"] });
  }

  return (
    <AdminShell
      title="Authentication & onboarding"
      subtitle="SMS code and PIN rules, app permissions and available languages."
    >
      <div className="max-w-md space-y-4">
        <section className="space-y-3 rounded-2xl border border-border p-4">
          <p className="font-semibold">Sign-in rules</p>
          {NUMERIC_KEYS.map((item) => (
            <div key={item.key} className="space-y-1.5">
              <Label htmlFor={item.key}>{item.label}</Label>
              <Input
                id={item.key}
                type="number"
                value={values[item.key] ?? ""}
                onChange={(e) =>
                  setValues((current) => ({ ...current, [item.key]: e.target.value }))
                }
              />
            </div>
          ))}
          <Button className="w-full" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save sign-in settings"}
          </Button>
        </section>

        <section className="space-y-3 rounded-2xl border border-border p-4">
          <div>
            <p className="font-semibold">Permissions</p>
            <p className="text-xs text-muted-foreground">
              You decide which permissions the app asks for and which are required. The phone's own
              setting always decides whether it is actually allowed.
            </p>
          </div>
          {(permissions.data ?? []).map((policy) => (
            <div key={policy.id} className="space-y-2 rounded-xl border border-border p-3">
              <p className="text-sm font-semibold">{policy.display_name}</p>
              <p className="text-xs text-muted-foreground">{policy.description}</p>
              <p className="text-xs text-muted-foreground">Needed for: {policy.required_for}</p>
              <label className="flex items-center justify-between text-sm">
                <span>Required</span>
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={policy.is_mandatory}
                  onChange={(e) => void updatePolicy(policy.id, { is_mandatory: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between text-sm">
                <span>Shown to users</span>
                <input
                  type="checkbox"
                  className="h-5 w-5"
                  checked={policy.is_active}
                  onChange={(e) => void updatePolicy(policy.id, { is_active: e.target.checked })}
                />
              </label>
            </div>
          ))}
        </section>

        <section className="space-y-2 rounded-2xl border border-border p-4">
          <div>
            <p className="font-semibold">Languages</p>
            <p className="text-xs text-muted-foreground">
              Turn a language on to show it on the welcome screen.
            </p>
          </div>
          {(languages.data ?? []).map((language) => (
            <label
              key={language.code}
              className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-0"
            >
              <span>
                <span className="font-medium">{language.native_name}</span>{" "}
                <span className="text-xs text-muted-foreground">({language.english_name})</span>
              </span>
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={language.is_active}
                onChange={(e) => void toggleLanguage(language.code, e.target.checked)}
              />
            </label>
          ))}
        </section>
      </div>
    </AdminShell>
  );
}
