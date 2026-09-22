import { useCallback, useEffect, useState } from "react";
import { BatteryCharging, Bell, CheckCircle2, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  type AlertPermissionKey,
  type AlertPermissionStatus,
  isNativeApp,
  readAlertPermissions,
  requestAlertPermission,
} from "@/lib/native-permissions";

const ITEMS: {
  key: AlertPermissionKey;
  title: string;
  description: string;
  icon: typeof Bell;
}[] = [
  {
    key: "notifications",
    title: "Ride notifications",
    description: "Nayi ride ka alert aur ringtone milegi.",
    icon: Bell,
  },
  {
    key: "overlay",
    title: "Appear on lock screen",
    description: "Ride aane par screen apne aap on hokar Accept/Decline dikhega.",
    icon: Smartphone,
  },
  {
    key: "battery",
    title: "Background running",
    description: "Phone lock hone par bhi app band nahi hogi.",
    icon: BatteryCharging,
  },
];

/**
 * Shown only inside the Shahin Travels Android app. Walks the driver through
 * the three phone settings a call-style lock screen ride alert needs.
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
    refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 3000);
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
      <section className="flex items-center gap-2 rounded-2xl border border-primary/30 bg-primary/10 p-3">
        <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
        <p className="text-sm font-medium text-foreground">
          Ride alerts fully active — lock screen par bhi call jaisi ring aayegi.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground">Ride alert setup</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Teeno allow karne ke baad phone lock hone par bhi ride aate hi screen on ho jayegi.
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
              </div>
              {done ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Allowed
                </span>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    requestAlertPermission(item.key);
                    window.setTimeout(refresh, 1200);
                  }}
                >
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
