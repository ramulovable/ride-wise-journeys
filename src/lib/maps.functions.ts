import { createServerFn } from "@tanstack/react-start";

/**
 * Returns the browser Google Maps key used to render maps.
 * Prefers the customer's own referrer-restricted key (custom domain) and
 * falls back to the platform-managed key (works on *.lovable.app).
 * Browser keys are public by design; protection comes from the HTTP
 * referrer restrictions configured in Google Cloud.
 */
export const getMapsBrowserKey = createServerFn({ method: "GET" }).handler(async () => {
  const custom = process.env["GOOGLE_MAPS_CUSTOM_BROWSER_KEY"];
  if (custom) return { key: custom, trackingId: null as string | null };
  return {
    key: (process.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"] as string) ?? null,
    trackingId: (process.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID"] as string) ?? null,
  };
});
