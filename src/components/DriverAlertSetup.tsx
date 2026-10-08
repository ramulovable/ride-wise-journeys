import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BatteryCharging, Bell, CheckCircle2, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  type AlertPermissionKey,
  type AlertPermissionStatus,
  isNativeApp,
  nativeBridge,
  readAlertPermissions,
  requestAlertPermission,
} from "@/lib/native-permissions";

const ITEMS: {
  key: AlertPermissionKey;
  title: string;
  description: string;
  hint: string;
  icon: typeof Bell;
}[] = [
  {
    key: "notifications",
    title: "Ride notifications",
    description: "Nayi ride ka alert aur ringtone milegi.",
    hint: "Setting khulne par 'Allow notifications' ON karein.",
    icon: Bell,
  },
  {
    key: "overlay",
    title: "Appear on lock screen",
    description: "Ride aane par screen apne aap on hokar Accept/Decline dikhega.",
    hint: "'Display over other apps' ON karein. Redmi/Vivo/Oppo me 'Pop-up windows in background' aur 'Show on lock screen' bhi ON karein.",
    icon: Smartphone,
  },
  {
    key: "battery",
    title: "Background running",
    description: "Phone lock hone par bhi app band nahi hogi.",
    hint: "'Allow' / 'Unrestricted' chunein.",
    icon: BatteryCharging,
  },
];

/**
 * Shown only inside the Android app. Status comes only from the phone itself,
 * so a permission shows "Allowed" only after it is really switched on.
 */
export function DriverAlertSetup() {
  const [native, setNative] = useState(false);
  const [status, setStatus] = useState<AlertPermissionStatus>({
    notifications: false,
    overlay: false,
    battery: false,
  });

  const refresh = useCallback(() => {
    if (!isNativeApp()) return;
    setStatus(readAlertPermissions());
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    setNative(true);
    // Clear old "allowed" marks from earlier app versions.
    try {
      for (const k of ["notifications", "overlay", "battery"]) {
        window.localStorage.removeItem("shahin.alertPermission." + k);
      }
      window.localStorage.removeItem("shahin.alertSetup.hidden");
    } catch {
      // ignore
    }
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 2000);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, [refresh]);

  if (!native) return null;

  const allDone = ITEMS.every((item) => status[item.key]);

  if (allDone) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-xs font-medium text-primary">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        Ride alert: teeno permission chalu hain
      </div>
    );
  }

  const open = (key: AlertPermissionKey) => {
    requestAlertPermission(key);
    if (key === "notifications") {
      // If Android does not show its popup (denied earlier), open the exact settings page.
      window.setTimeout(() => {
        if (!readAlertPermissions().notifications && document.visibilityState === "visible") {
          try {
            nativeBridge()?.openNotificationSettings?.();
          } catch {
            // ignore
          }
        }
      }, 1200);
    }
  };

  return (
    <section className="rounded-2xl border-2 border-destructive/40 bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
        Ride alert setup adhoora hai
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Jab tak teeno ON nahi honge, lock screen par ride nahi dikhegi. Button dabane par phone ki wahi setting khulegi.
      </p>
      <ul className="mt-3 space-y-3">
        {ITEMS.map((item) => {
          const done = status[item.key];
          const Icon = item.icon;
          return (
            <li key={item.key} className="flex items-start gap-3">
              <span className="mt-0.5 rounded-full bg-muted p-2">
                <Icon className="h-4 w-4 text-foreground" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
                {!done ? <p className="mt-0.5 text-[11px] text-destructive">{item.hint}</p> : null}
              </div>
              {done ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Allowed
                </span>
              ) : (
                <Button size="sm" variant="destructive" onClick={() => open(item.key)}>
                  Allow
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
