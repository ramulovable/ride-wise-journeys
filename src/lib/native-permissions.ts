/**
 * Talks to the Shahin Travels Android app. Inside the APK the native layer
 * exposes `window.ShahinNative`; in a normal browser it is simply absent.
 */

export type NativeBridge = {
  isNativeApp?: () => boolean;
  notificationsEnabled?: () => boolean;
  overlayEnabled?: () => boolean;
  batteryUnrestricted?: () => boolean;
  requestNotifications?: () => void;
  openNotificationSettings?: () => void;
  requestOverlay?: () => void;
  requestBattery?: () => void;
  openAppSettings?: () => void;
};

export type AlertPermissionKey = "notifications" | "overlay" | "battery";

export type AlertPermissionStatus = Record<AlertPermissionKey, boolean>;

export function nativeBridge(): NativeBridge | null {
  if (typeof window === "undefined") return null;
  const bridge = (window as Window & { ShahinNative?: NativeBridge }).ShahinNative;
  return bridge && typeof bridge === "object" ? bridge : null;
}

/** True when running inside the Shahin Travels Android app. */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  if (nativeBridge()) return true;
  const cap = (
    window as Window & {
      Capacitor?: { isNativePlatform?: () => boolean; platform?: string };
    }
  ).Capacitor;
  if (cap) {
    if (typeof cap.isNativePlatform === "function") return cap.isNativePlatform();
    if (cap.platform && cap.platform !== "web") return true;
  }
  return /ShahinTravelsApp/i.test(window.navigator.userAgent);
}

function safeRead(fn: (() => boolean) | undefined): boolean {
  try {
    return typeof fn === "function" ? Boolean(fn()) : false;
  } catch {
    return false;
  }
}

export function readAlertPermissions(): AlertPermissionStatus {
  const bridge = nativeBridge();
  return {
    notifications: safeRead(bridge?.notificationsEnabled),
    overlay: safeRead(bridge?.overlayEnabled),
    battery: safeRead(bridge?.batteryUnrestricted),
  };
}

export function requestAlertPermission(key: AlertPermissionKey) {
  const bridge = nativeBridge();
  if (!bridge) return;
  try {
    if (key === "notifications") bridge.requestNotifications?.();
    if (key === "overlay") bridge.requestOverlay?.();
    if (key === "battery") bridge.requestBattery?.();
  } catch {
    // The settings screen simply does not open on very old Android builds.
  }
}
