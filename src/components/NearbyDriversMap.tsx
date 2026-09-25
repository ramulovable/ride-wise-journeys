import { useEffect, useRef, useState } from "react";
import { loadMaps } from "@/components/LiveRideMap";

type Point = { lat: number; lng: number };
type MapObj = { setMap: (m: unknown) => void };

/** Small live map on customer home: pickup, drop, route line and nearby drivers. */
export function NearbyDriversMap({
  pickup,
  drop,
  drivers,
}: {
  pickup: Point | null;
  drop: Point | null;
  drivers: Point[];
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  type Api = Awaited<ReturnType<typeof loadMaps>>;
  const mapRef = useRef<InstanceType<Api["Map"]> | null>(null);
  const apiRef = useRef<Awaited<ReturnType<typeof loadMaps>> | null>(null);
  const overlays = useRef<MapObj[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then((api) => {
        if (cancelled || !ref.current || mapRef.current) return;
        apiRef.current = api;
        mapRef.current = new api.Map(ref.current, {
          center: pickup ?? { lat: 26.1542, lng: 85.8918 },
          zoom: 14,
          disableDefaultUI: true,
          gestureHandling: "cooperative",
        });
        setReady(true);
      })
      .catch(() => setError(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const api = apiRef.current;
    const map = mapRef.current;
    if (!ready || !api || !map) return;
    overlays.current.forEach((o) => o.setMap(null));
    overlays.current = [];
    const bounds = new api.LatLngBounds();
    if (pickup) {
      overlays.current.push(
        new api.Marker({ map, position: pickup, label: { text: "P", color: "white" }, zIndex: 10 }),
      );
      bounds.extend(pickup);
    }
    if (drop) {
      overlays.current.push(
        new api.Marker({ map, position: drop, label: { text: "D", color: "white" }, zIndex: 10 }),
      );
      bounds.extend(drop);
    }
    if (pickup && drop) {
      overlays.current.push(
        new api.Polyline({
          map,
          path: [pickup, drop],
          geodesic: true,
          strokeOpacity: 0,
          icons: [
            {
              icon: { path: "M 0,-1 0,1", strokeOpacity: 0.9, strokeColor: "#1d4ed8", scale: 3 },
              offset: "0",
              repeat: "12px",
            },
          ],
        }),
      );
    }
    drivers.forEach((d) => {
      overlays.current.push(
        new api.Marker({
          map,
          position: d,
          title: "Driver nearby",
          label: { text: "🚗", fontSize: "18px" },
          icon: { path: api.SymbolPath["CIRCLE"], scale: 0 },
        }),
      );
      if (!drop) bounds.extend(d);
    });
    if (!bounds.isEmpty()) {
      if (pickup && !drop && drivers.length === 0) map.panTo(pickup);
      else map.fitBounds(bounds, 40);
    }
  }, [ready, pickup?.lat, pickup?.lng, drop?.lat, drop?.lng, drivers]);

  if (error) return null;
  return <div ref={ref} className="h-44 w-full overflow-hidden rounded-xl border border-border" />;
}
