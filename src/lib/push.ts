import { initializeApp, getApps } from "firebase/app";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { supabase } from "@/integrations/supabase/client";

const appId = import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_APP_ID"] as
  | string
  | undefined;
const vapidKey = import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_VAPID_KEY"] as
  | string
  | undefined;

const firebaseConfig = {
  apiKey: import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_WEB_API_KEY"] as
    | string
    | undefined,
  projectId: import.meta.env["VITE_LOVABLE_CONNECTOR_FIREBASE_MESSAGING_PROJECT_ID"] as
    | string
    | undefined,
  appId,
  messagingSenderId: appId?.split(":")[1] ?? "",
};

export type PushResult =
  | { status: "registered" }
  | { status: "not-configured" | "unsupported" | "open-in-new-tab" | "denied" | "error" };

/** Registers this browser for ride-request alerts. Must be called from a click handler. */
export async function enablePush(): Promise<PushResult> {
  if (
    !firebaseConfig.apiKey ||
    !firebaseConfig.projectId ||
    !appId ||
    !vapidKey ||
    !firebaseConfig.messagingSenderId
  ) {
    return { status: "not-configured" };
  }
  if (typeof window === "undefined" || !("Notification" in window) || !(await isSupported())) {
    return { status: "unsupported" };
  }
  if (window.top !== window.self) return { status: "open-in-new-tab" };

  const permission =
    Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") return { status: "denied" };

  try {
    const query = new URLSearchParams(
      firebaseConfig as unknown as Record<string, string>,
    ).toString();
    const registration = await navigator.serviceWorker.register(
      `/firebase-messaging-sw.js?${query}`,
    );
    const app = getApps()[0] ?? initializeApp(firebaseConfig as Record<string, string>);
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: registration });
    if (!token) return { status: "denied" };

    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { status: "error" };
    const { error } = await supabase
      .from("notification_devices")
      .upsert(
        { user_id: auth.user.id, push_token: token, device_type: "web", is_active: true },
        { onConflict: "push_token" },
      );
    if (error) return { status: "error" };
    return { status: "registered" };
  } catch {
    return { status: "error" };
  }
}

export const PUSH_MESSAGE: Record<PushResult["status"], string> = {
  registered: "Ride alerts are on for this device.",
  "not-configured": "Ride alerts are not set up yet. In-app requests still work.",
  unsupported: "This browser cannot show ride alerts.",
  "open-in-new-tab": "Open the app in its own browser tab to turn on ride alerts.",
  denied: "Alerts are blocked. Allow notifications for this site in your browser settings.",
  error: "Could not turn on ride alerts. Please try again.",
};
