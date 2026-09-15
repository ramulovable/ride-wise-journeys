let registered = false;

/**
 * Registers the app's service worker on page load so the browser can offer
 * the native "Install app" prompt (beforeinstallprompt requires an active
 * service worker). The push module later re-registers the same worker with
 * Firebase config query params, which simply updates this registration.
 */
export function registerAppServiceWorker() {
  if (registered || typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  registered = true;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/firebase-messaging-sw.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}
