// ============= Full file contents =============

import { supabase } from "@/integrations/supabase/client";

/**
 * Inside the Shahin Travels Android app, the native layer hands us its Firebase
 * token on `window.__shahinNativePushToken`. Store it against the signed-in user
 * so ride alerts reach the phone even when the app is closed.
 *
 * The native layer publishes the token while the app is still starting, which
 * can be before the login session is restored. Retry until the session exists,
 * and save again as soon as the user signs in.
 */

const MAX_SAVE_ATTEMPTS = 5;
const RETRY_DELAY_MS = 2000;

let lastToken: string | null = null;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function save(token: string): Promise<boolean> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { error } = await supabase
    .from("notification_devices")
    .upsert(
      { user_id: auth.user.id, push_token: token, device_type: "android", is_active: true },
      { onConflict: "push_token" },
    );
  return !error;
}

/** Keeps trying until the session is ready so an early token is never lost. */
async function attemptSave(token: string) {
  for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt++) {
    if (await save(token)) return;
    await sleep(RETRY_DELAY_MS);
  }
}

function currentToken(): string | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { __shahinNativePushToken?: string };
  return w.__shahinNativePushToken ?? null;
}

export function listenForNativePushToken(): () => void {
  if (typeof window === "undefined") return () => {};
  const w = window as Window & { __shahinNativePushToken?: string };

  const handle = () => {
    const token = w.__shahinNativePushToken;
    if (!token) return;
    lastToken = token;
    void attemptSave(token);
  };

  // When the user signs in (or the session restores) after the token arrived,
  // save it then — this is the path that previously lost the token.
  const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
    if (event !== "SIGNED_IN" || !lastToken) return;
    void attemptSave(lastToken);
  });

  handle();
  window.addEventListener("shahin-native-push-token", handle);
  return () => {
    window.removeEventListener("shahin-native-push-token", handle);
    authListener.subscription.unsubscribe();
  };
}
