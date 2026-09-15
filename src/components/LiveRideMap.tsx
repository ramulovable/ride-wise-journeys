import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getRideRouteGeometry } from "@/lib/api.functions";

type LatLng = { lat: number; lng: number };

type GMapObject = { setMap: (map: unknown) => void };
type GMarker = GMapObject & { setPosition: (position: LatLng) => void };
type GMap = { fitBounds: (bounds: GBounds, padding?: number) => void; panTo: (p: LatLng) => void };
type GBounds = { extend: (position: LatLng) => void; isEmpty: () => boolean };
type MapsApi = {
  Map: new (el: HTMLElement, options: Record<string, unknown>) => GMap;
  Marker: new (options: Record<string, unknown>) => GMarker;
  Polyline: new (options: Record<string, unknown>) => GMapObject;
  TrafficLayer: new () => GMapObject;
  LatLngBounds: new () => GBounds;
  SymbolPath: Record<string, unknown>;
  geometry: { encoding: { decodePath: (encoded: string) => Array<{ lat(): number; lng(): number }> } };
};

const BROWSER_KEY = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"] as
  | string
  | undefined;
const TRACKING_ID = import.meta.env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID"] as
  | string
  | undefined;

let mapsPromise: Promise<MapsApi> | null = null;

function loadMaps(): Promise<MapsApi> {
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise<MapsApi>((resolve, reject) => {
    if (!BROWSER_KEY) {
      reject(new Error("Map is not configured yet."));
      return;
    }
    const scope = window as unknown as {
      google?: { maps?: MapsApi };
      initShahinMaps?: () => void;
    };
    if (scope.google?.maps) {
      resolve(scope.google.maps);
      return;
    }
    scope.initShahinMaps = () => {
      if (scope.google?.maps) resolve(scope.google.maps);
      else reject(new Error("Map could not be loaded."));
    };
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${BROWSER_KEY}&libraries=geometry&loading=async&callback=initShahinMaps${
      TRACKING_ID ? `&channel=${TRACKING_ID}` : ""
    }`;
    script.async = true;
    script.onerror = () => reject(new Error("Map could not be loaded."));
    document.head.appendChild(script);
  });
  return mapsPromise;
}

/** Shares the driver's live position for an active ride and stops when the trip ends. */
export function useDriverLocationBroadcast(
  rideId: string,
  riderId: string | null | undefined,
  active: boolean,
) {
  const [denied, setDenied] = useState(false);
  const lastSent = useRef(0);

  useEffect(() => {
    if (!active || !riderId || !("geolocation" in navigator)) return;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastSent.current < 4000) return;
        lastSent.current = now;
        void supabase.from("ride_driver_locations").upsert(
          {
            ride_id: rideId,
            rider_id: riderId,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            heading: position.coords.heading,
            speed: position.coords.speed,
            accuracy: position.coords.accuracy,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "ride_id" },
        );
      },
      () => setDenied(true),
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [rideId, riderId, active]);

  return { denied };
}

function useDriverPosition(rideId: string, enabled: boolean) {
  const [position, setPosition] = useState<LatLng | null>(null);

  const initial = useQuery({
    queryKey: ["ride-driver-location", rideId],
    enabled,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("ride_driver_locations")
        .select("latitude, longitude")
        .eq("ride_id", rideId)
        .maybeSingle();
      return data ?? null;
    },
  });

  useEffect(() => {
    if (initial.data) setPosition({ lat: initial.data.latitude, lng: initial.data.longitude });
  }, [initial.data]);

  useEffect(() => {
    if (!enabled) return;
    const channel = supabase
      .channel(`ride-location-${rideId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ride_driver_locations",
          filter: `ride_id=eq.${rideId}`,
        },
        (payload) => {
          const row = payload.new as { latitude?: number; longitude?: number } | null;
          if (row?.latitude != null && row.longitude != null) {
            setPosition({ lat: row.latitude, lng: row.longitude });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [rideId, enabled]);

  return position;
}

/** High-resolution live navigation map with route, traffic and a moving vehicle marker. */
export function LiveRideMap({
  rideId,
  active,
  className,
}: {
  rideId: string;
  active: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GMap | null>(null);
  const apiRef = useRef<MapsApi | null>(null);
  const driverMarkerRef = useRef<GMarker | null>(null);
  const overlaysRef = useRef<GMapObject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const driver = useDriverPosition(rideId, active);

  const geometry = useQuery({
    queryKey: ["ride-geometry", rideId, driver ? Math.round(driver.lat * 1000) : null],
    queryFn: () =>
      getRideRouteGeometry({
        data: {
          rideId,
          ...(driver ? { driverLat: driver.lat, driverLng: driver.lng } : {}),
        },
      }),
    staleTime: 60_000,
  });

  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then((api) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        apiRef.current = api;
        mapRef.current = new api.Map(containerRef.current, {
          center: { lat: 26.1542, lng: 85.8918 },
          zoom: 13,
          clickableIcons: false,
          disableDefaultUI: false,
          streetViewControl: false,
          mapTypeControl: false,
          gestureHandling: "greedy",
        });
        new api.TrafficLayer().setMap(mapRef.current);
      })
      .catch((loadError: Error) => {
        if (!cancelled) setError(loadError.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const data = geometry.data;

  useEffect(() => {
    const api = apiRef.current;
    const map = mapRef.current;
    if (!api || !map || !data) return;

    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];

    const bounds = new api.LatLngBounds();
    const pickup = { lat: data.pickup.latitude, lng: data.pickup.longitude };
    const drop = { lat: data.drop.latitude, lng: data.drop.longitude };

    const pickupMarker = new api.Marker({
      map,
      position: pickup,
      title: "Pickup",
      label: { text: "P", color: "#ffffff", fontWeight: "600" },
    });
    const dropMarker = new api.Marker({
      map,
      position: drop,
      title: "Destination",
      label: { text: "D", color: "#ffffff", fontWeight: "600" },
    });
    overlaysRef.current.push(pickupMarker, dropMarker);
    bounds.extend(pickup);
    bounds.extend(drop);

    if (data.polyline) {
      const path = api.geometry.encoding
        .decodePath(data.polyline)
        .map((point) => ({ lat: point.lat(), lng: point.lng() }));
      const line = new api.Polyline({
        map,
        path,
        strokeColor: "#16a34a",
        strokeOpacity: 0.9,
        strokeWeight: 5,
      });
      overlaysRef.current.push(line);
      path.forEach((point) => bounds.extend(point));
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, 48);
  }, [data]);

  useEffect(() => {
    const api = apiRef.current;
    const map = mapRef.current;
    if (!api || !map || !driver) return;
    if (!driverMarkerRef.current) {
      driverMarkerRef.current = new api.Marker({
        map,
        position: driver,
        title: "Driver",
        zIndex: 999,
        icon: {
          path: api.SymbolPath["CIRCLE"],
          scale: 8,
          fillColor: "#1d4ed8",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 3,
        },
      });
    } else {
      driverMarkerRef.current.setPosition(driver);
    }
    map.panTo(driver);
  }, [driver]);

  const status = useMemo(() => {
    if (error) return error;
    if (geometry.isError) return "Live route is unavailable right now.";
    if (!driver) return "Waiting for the driver's live location…";
    return null;
  }, [error, geometry.isError, driver]);

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className="h-72 w-full overflow-hidden rounded-2xl border border-border bg-muted"
        role="application"
        aria-label="Live ride map"
      />
      {status ? <p className="mt-2 text-xs text-muted-foreground">{status}</p> : null}
    </div>
  );
}
