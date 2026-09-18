import { useEffect, useRef, useState } from "react";
import { updateRiderPresence } from "@/lib/dispatch.functions";

/**
 * Sends the driver's real GPS position to the server while they are online so
 * dispatch can match them by distance. Nothing is sent when offline.
 */
export function useRiderPresenceBroadcast(enabled: boolean, minIntervalMs = 15_000) {
  const [denied, setDenied] = useState(false);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const send = (position: GeolocationPosition) => {
      const now = Date.now();
      if (now - lastSent.current < minIntervalMs) return;
      lastSent.current = now;
      void updateRiderPresence({
        data: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy ?? null,
        },
      }).catch(() => undefined);
    };

    const watchId = navigator.geolocation.watchPosition(
      send,
      (error) => {
        if (error.code === error.PERMISSION_DENIED) setDenied(true);
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled, minIntervalMs]);

  return { denied };
}
