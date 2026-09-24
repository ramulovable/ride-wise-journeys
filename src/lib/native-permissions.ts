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
  appVersionName?: () => string;
  openExternal?: (url: string) => void;
  installUpdate?: (url: string) => void;
  updateState?: () => string;
  updateProgress?: () => number;
};

/** True when the app can download and install the update by itself. */
export function supportsInAppUpdate(): boolean {
  return typeof nativeBridge()?.installUpdate === "function";
}

/** Starts the in-app update download; falls back to a browser download. */
export function startInAppUpdate(url: string) {
  const bridge = nativeBridge();
  try {
    if (bridge?.installUpdate) {
      bridge.installUpdate(url);
      return;
    }
    if (bridge?.openExternal) bridge.openExternal(url);
    else window.open(url, "_blank", "noopener");
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

export function readUpdateProgress(): { state: string; progress: number } {
  const bridge = nativeBridge();
  try {
    return {
      state: bridge?.updateState?.() ?? "idle",
      progress: Number(bridge?.updateProgress?.() ?? 0),
    };
  } catch {
    return { state: "idle", progress: 0 };
  }
}

/** Version of the installed Android app, or null in a browser. */
export function nativeAppVersion(): string | null {
  const bridge = nativeBridge();
  try {
    const version = bridge?.appVersionName?.();
    return version ? String(version) : null;
  } catch {
    return null;
  }
}

/** Compares "1.0.10" style versions. Returns true when b is newer than a. */
export function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string) =>
    v
      .trim()
      .split(".")
      .map((part) => Number.parseInt(part.replace(/\D/g, ""), 10) || 0);
  const a = parse(current);
  const b = parse(latest);
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (right > left) return true;
    if (right < left) return false;
  }
  return false;
}

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
