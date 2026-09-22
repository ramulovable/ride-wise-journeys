import { supabase } from "@/integrations/supabase/client";

/**
 * Inside the Shahin Travels Android app, the native layer hands us its Firebase
 * token on `window.__shahinNativePushToken`. Store it against the signed-in user
 * so ride alerts reach the phone even when the app is closed.
 */


async function save(token: string) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return;
  await supabase
    .from("notification_devices")
    .upsert(
      { user_id: auth.user.id, push_token: token, device_type: "android", is_active: true },
      { onConflict: "push_token" },
    );
}

export function listenForNativePushToken(): () => void {
  if (typeof window === "undefined") return () => {};
  const w = window as Window & { __shahinNativePushToken?: string };

  const handle = () => {
    const token = w.__shahinNativePushToken;
    if (token) void save(token);
  };

  handle();
  window.addEventListener("shahin-native-push-token", handle);
  return () => window.removeEventListener("shahin-native-push-token", handle);
}
