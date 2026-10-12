import { supabase } from "@/integrations/supabase/client";
import { registerPushToken } from "@/lib/push-token.functions";

/**
 * Inside the Shahin Travels Android app, the native layer hands us its Firebase
 * token on `window.__shahinNativePushToken`. Store it against the signed-in user
 * so ride alerts reach the phone even when the app is closed.
 *
 * The token is re-saved on every app open, resume, sign-in and session restore,
 * and retried until it succeeds, so a driver's token never goes missing.
 */

const RETRY_DELAY_MS = 3000;
const MAX_ATTEMPTS = 40; // ~2 minutes of retrying per trigger

let lastToken: string | null = null;
let savedFor: string | null = null; // "userId:token" already saved this session
let running = false;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function save(token: string): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return false;
  if (savedFor === `${userId}:${token}`) return true;
  try {
    await registerPushToken({ data: { token, deviceType: "android" } });
  } catch {
    // Fallback: direct save (works when the token already belongs to this user).
    const { error } = await supabase
      .from("notification_devices")
      .upsert(
        { user_id: userId, push_token: token, device_type: "android", is_active: true },
        { onConflict: "push_token" },
      );
    if (error) return false;
  }
  savedFor = `${userId}:${token}`;
  return true;
}

async function attemptSave(token: string) {
  if (running) return;
  running = true;
  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (await save(token)) return;
      await sleep(RETRY_DELAY_MS);
    }
  } finally {
    running = false;
  }
}

/** Re-sends the current token (used when going online, resuming, etc.). */
export function resyncNativePushToken(force = false) {
  const w = typeof window === "undefined" ? undefined : (window as Window & { __shahinNativePushToken?: string });
  const token = w?.__shahinNativePushToken ?? lastToken;
  if (!token) return;
  lastToken = token;
  if (force) savedFor = null;
  void attemptSave(token);
}

export function listenForNativePushToken(): () => void {
  if (typeof window === "undefined") return () => {};

  const handle = () => resyncNativePushToken();

  const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      savedFor = null;
      return;
    }
    if (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED") {
      resyncNativePushToken();
    }
  });

  const onVisible = () => {
    if (document.visibilityState === "visible") resyncNativePushToken(true);
  };

  handle();
  window.addEventListener("shahin-native-push-token", handle);
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    window.removeEventListener("shahin-native-push-token", handle);
    document.removeEventListener("visibilitychange", onVisible);
    authListener.subscription.unsubscribe();
  };
}
