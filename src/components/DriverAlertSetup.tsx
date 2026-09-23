import { useCallback, useEffect, useState } from "react";
import { BatteryCharging, Bell, CheckCircle2, Smartphone, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  type AlertPermissionKey,
  type AlertPermissionStatus,
  isNativeApp,
  readAlertPermissions,
  requestAlertPermission,
} from "@/lib/native-permissions";

const MARK_PREFIX = "shahin.alertPermission.";
const HIDE_KEY = "shahin.alertSetup.hidden";

function readMarks(): AlertPermissionStatus {
  const get = (key: AlertPermissionKey) => {
    try {
      return window.localStorage.getItem(MARK_PREFIX + key) === "1";
    } catch {
      return false;
    }
  };
  return {
    notifications: get("notifications"),
    overlay: get("overlay"),
    battery: get("battery"),
  };
}

function writeMark(key: AlertPermissionKey) {
  try {
    window.localStorage.setItem(MARK_PREFIX + key, "1");
  } catch {
    // Private mode storage is simply unavailable.
  }
}


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
  const [hidden, setHidden] = useState(false);
  const [status, setStatus] = useState<AlertPermissionStatus>({
    notifications: false,
    overlay: false,
    battery: false,
  });

  const refresh = useCallback(() => {
    if (!isNativeApp()) return;
    const live = readAlertPermissions();
    const marks = readMarks();
    setStatus({
      notifications: live.notifications || marks.notifications,
      overlay: live.overlay || marks.overlay,
      battery: live.battery || marks.battery,
    });
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    setNative(true);
    try {
      setHidden(window.localStorage.getItem(HIDE_KEY) === "1");
    } catch {
      // ignore
    }
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

  if (!native || hidden) return null;

  const allDone = ITEMS.every((item) => status[item.key]);
  if (allDone) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(HIDE_KEY, "1");
    } catch {
      // ignore
    }
    setHidden(true);
  };

  return (
    <section className="relative rounded-2xl border border-border bg-card p-4">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hide ride alert setup"
        className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:bg-muted"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <h2 className="text-sm font-semibold text-foreground">Ride alert setup</h2>
      <p className="mt-1 pr-6 text-xs text-muted-foreground">
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
                    writeMark(item.key);
                    setStatus((prev) => ({ ...prev, [item.key]: true }));
                    window.setTimeout(refresh, 1500);
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

