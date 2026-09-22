import { supabase } from "@/integrations/supabase/client";

export type PermissionPolicy = {
  permission_key: string;
  display_name: string;
  description: string;
  required_for: string;
  is_mandatory: boolean;
  sort_order: number;
};

export type PermissionState = "granted" | "denied" | "prompt" | "unsupported";

const PENDING_KEY = "shahin_permission_results";

export async function fetchPermissionPolicies(role: "customer" | "rider"): Promise<PermissionPolicy[]> {
  const { data } = await supabase
    .from("permission_policies")
    .select("permission_key, display_name, description, required_for, is_mandatory, sort_order")
    .eq("is_active", true)
    .order("sort_order");
  return (data ?? []).filter(
    (row) => row.required_for === "all" || row.required_for === role,
  ) as PermissionPolicy[];
}

/** Reads the real operating-system answer; the app never fakes this. */
export async function readPermission(key: string): Promise<PermissionState> {
  if (typeof window === "undefined") return "unsupported";
  if (key === "notifications") {
    if (!("Notification" in window)) return "unsupported";
    const value = Notification.permission;
    return value === "default" ? "prompt" : value;
  }
  if (key === "location") {
    if (!navigator.geolocation) return "unsupported";
    if (!navigator.permissions?.query) return "prompt";
    try {
      const status = await navigator.permissions.query({ name: "geolocation" });
      return status.state as PermissionState;
    } catch {
      return "prompt";
    }
  }
  if (key === "camera" || key === "photos") {
    return "prompt";
  }
  return "unsupported";
}

export async function requestPermission(key: string): Promise<PermissionState> {
  if (typeof window === "undefined") return "unsupported";
  if (key === "notifications") {
    if (!("Notification" in window)) return "unsupported";
    const result = await Notification.requestPermission();
    return result === "default" ? "prompt" : (result as PermissionState);
  }
  if (key === "location") {
    if (!navigator.geolocation) return "unsupported";
    return new Promise<PermissionState>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        () => resolve("granted"),
        (error) => resolve(error.code === error.PERMISSION_DENIED ? "denied" : "prompt"),
        { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 },
      );
    });
  }
  // Camera and photos are requested by the browser at the moment the user picks a file.
  return "prompt";
}

function platform(): string {
  if (typeof navigator === "undefined") return "web";
  return /android/i.test(navigator.userAgent)
    ? "android"
    : /iphone|ipad|ipod/i.test(navigator.userAgent)
      ? "ios"
      : "web";
}

/** Remembers answers given before the account exists, so they can be saved after sign-in. */
export function rememberPermission(key: string, status: PermissionState) {
  if (typeof window === "undefined") return;
  let map: Record<string, string> = {};
  try {
    map = JSON.parse(window.sessionStorage.getItem(PENDING_KEY) ?? "{}") as Record<string, string>;
  } catch {
    map = {};
  }
  map[key] = status;
  window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(map));
}

export async function savePermissionStatus(userId: string, key: string, status: PermissionState) {
  const now = new Date().toISOString();
  await supabase.from("user_permission_status").upsert(
    {
      user_id: userId,
      permission_key: key,
      status,
      platform: platform(),
      last_checked_at: now,
      granted_at: status === "granted" ? now : null,
      denied_at: status === "denied" ? now : null,
    },
    { onConflict: "user_id,permission_key" },
  );
}

/** Saves any answers collected during onboarding, then clears the temporary copy. */
export async function flushPermissionResults(userId: string) {
  if (typeof window === "undefined") return;
  let map: Record<string, string> = {};
  try {
    map = JSON.parse(window.sessionStorage.getItem(PENDING_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return;
  }
  for (const [key, status] of Object.entries(map)) {
    await savePermissionStatus(userId, key, status as PermissionState);
  }
  window.sessionStorage.removeItem(PENDING_KEY);
}
