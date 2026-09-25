import { useEffect, useRef, useState } from "react";
import { LocateFixed } from "lucide-react";
import { loadMaps } from "@/components/LiveRideMap";

type Point = { lat: number; lng: number };
type MePoint = { lat: number; lng: number; heading?: number | null };
type MapObj = { setMap: (m: unknown) => void };
type MarkerObj = MapObj & {
  setPosition: (p: Point) => void;
  setIcon?: (icon: unknown) => void;
};

/** Small live map on customer home: pickup, drop, route line and nearby drivers. */
export function NearbyDriversMap({
  pickup,
  drop,
  drivers,
  me,
}: {
  pickup: Point | null;
  drop: Point | null;
  drivers: Point[];
  me?: MePoint | null;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  type Api = Awaited<ReturnType<typeof loadMaps>>;
  const mapRef = useRef<InstanceType<Api["Map"]> | null>(null);
  const apiRef = useRef<Awaited<ReturnType<typeof loadMaps>> | null>(null);
  const overlays = useRef<MapObj[]>([]);
  const meMarker = useRef<MarkerObj | null>(null);
  const haloMarker = useRef<MarkerObj | null>(null);
  const lastMe = useRef<Point | null>(null);
  const lastHeading = useRef(0);
  const centeredOnMe = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then((api) => {
        if (cancelled || !ref.current || mapRef.current) return;
        apiRef.current = api;
        mapRef.current = new api.Map(ref.current, {
          center: pickup ?? (me ? { lat: me.lat, lng: me.lng } : { lat: 26.1542, lng: 85.8918 }),
          zoom: 15,
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

  // Live blue arrow for the customer's own position; moves as the phone moves.
  useEffect(() => {
    const api = apiRef.current;
    const map = mapRef.current;
    if (!ready || !api || !map) return;
    if (!me) {
      meMarker.current?.setMap(null);
      haloMarker.current?.setMap(null);
      meMarker.current = null;
      haloMarker.current = null;
      return;
    }
    const position = { lat: me.lat, lng: me.lng };
    const prev = lastMe.current;
    let rotation = lastHeading.current;
    if (typeof me.heading === "number" && !Number.isNaN(me.heading)) {
      rotation = me.heading;
    } else if (prev && (prev.lat !== position.lat || prev.lng !== position.lng)) {
      const toRad = Math.PI / 180;
      const dLng = (position.lng - prev.lng) * toRad;
      const y = Math.sin(dLng) * Math.cos(position.lat * toRad);
      const x =
        Math.cos(prev.lat * toRad) * Math.sin(position.lat * toRad) -
        Math.sin(prev.lat * toRad) * Math.cos(position.lat * toRad) * Math.cos(dLng);
      rotation = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    }
    lastHeading.current = rotation;
    lastMe.current = position;
    const arrowIcon = {
      path: api.SymbolPath["FORWARD_CLOSED_ARROW"],
      scale: 5,
      fillColor: "#2563eb",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 2,
      rotation,
    };
    if (!haloMarker.current) {
      haloMarker.current = new api.Marker({
        map,
        position,
        clickable: false,
        zIndex: 18,
        icon: {
          path: api.SymbolPath["CIRCLE"],
          scale: 14,
          fillColor: "#2563eb",
          fillOpacity: 0.15,
          strokeColor: "#2563eb",
          strokeOpacity: 0.3,
          strokeWeight: 1,
        },
      }) as MarkerObj;
    } else {
      haloMarker.current.setPosition(position);
    }
    if (!meMarker.current) {
      meMarker.current = new api.Marker({
        map,
        position,
        title: "You are here",
        zIndex: 20,
        icon: arrowIcon,
      }) as MarkerObj;
    } else {
      meMarker.current.setPosition(position);
      meMarker.current.setIcon?.(arrowIcon);
    }
    if (!centeredOnMe.current && !pickup && !drop) {
      centeredOnMe.current = true;
      map.panTo(position);
    }
  }, [ready, me?.lat, me?.lng, me?.heading, pickup, drop]);

  if (error) return null;
  return (
    <div className="relative">
      <div ref={ref} className="h-44 w-full overflow-hidden rounded-xl border border-border" />
      {me ? (
        <button
          type="button"
          onClick={() => mapRef.current?.panTo({ lat: me.lat, lng: me.lng })}
          aria-label="Center map on my location"
          className="absolute bottom-2 right-2 rounded-full border border-border bg-card p-2 shadow-sm"
        >
          <LocateFixed className="size-4 text-primary" />
        </button>
      ) : null}
    </div>
  );
}
