import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAppSettings } from "@/lib/settings";
import { isNativeApp, isNewerVersion, nativeAppVersion } from "@/lib/native-permissions";

/** Shows the installed app version and whether it is the latest. Also records it for admin. */
export function AppVersionBadge() {
  const { data: settings } = useAppSettings();
  const [installed, setInstalled] = useState<string | null>(null);
  const [native, setNative] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    setNative(true);
    const v = nativeAppVersion();
    setInstalled(v);
    if (!v) return;
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      void supabase
        .from("profiles")
        .update({ app_version: v, app_version_seen_at: new Date().toISOString() })
        .eq("id", data.user.id);
    });
  }, []);

  const latest = settings?.androidAppVersion?.trim() || "";
  const old = Boolean(installed && latest && isNewerVersion(installed, latest));

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-sm">
      <Smartphone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">
          App version: {native ? (installed ?? "unknown") : "Website"}
        </p>
        <p className="text-xs text-muted-foreground">
          {!native
            ? latest
              ? `Latest app: v${latest}`
              : "Browser me chal raha hai"
            : old
              ? `Purana version — naya v${latest} available hai`
              : "Aapke paas latest version hai"}
        </p>
      </div>
      {native ? (
        <span
          className={
            old
              ? "rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive"
              : "rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary"
          }
        >
          {old ? "Old" : "Current"}
        </span>
      ) : null}
    </div>
  );
}
