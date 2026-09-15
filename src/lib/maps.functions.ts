import { createServerFn } from "@tanstack/react-start";

/**
 * Returns the customer's own referrer-restricted Google Maps browser key
 * (restricted to shahintravels.app) when configured. Returns null otherwise,
 * so the client falls back to the platform-managed key that works on
 * *.lovable.app domains. Browser keys are public by design; protection comes
 * from the HTTP referrer restrictions configured in Google Cloud.
 */
export const getMapsBrowserKey = createServerFn({ method: "GET" }).handler(async () => {
  return { key: process.env["GOOGLE_MAPS_CUSTOM_BROWSER_KEY"] ?? null };
});
