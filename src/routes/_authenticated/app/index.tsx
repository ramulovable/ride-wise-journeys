import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getNearbyDrivers, nearestPlaceForGps, selectIndiaPlace } from "@/lib/api.functions";
import { NearbyDriversMap } from "@/components/NearbyDriversMap";
import { toast } from "sonner";
import {
  ArrowRight,
  BadgeIndianRupee,
  ClipboardList,
  Clock,
  LifeBuoy,
  LocateFixed,
  Mic,
  Minus,
  Plus,
  RouteIcon,
  Search,
  UserRound,
  Wallet as WalletIcon,
} from "lucide-react";
import { CustomerShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { LocationPicker, useVoiceSearch } from "@/components/LocationPicker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fetchCategories, fetchLocations, type Location } from "@/lib/data";
import { categoryArtwork } from "@/lib/vehicleArt";
import { resolveVehicleImage, useVehicleImages } from "@/lib/vehicleImages";
import { rupees } from "@/lib/format";
import { createBooking, getFareOptions } from "@/lib/api.functions";
import { useRoleGuard } from "@/lib/useRoleGuard";
import watermark from "@/assets/darbhanga-watermark.png";


export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Book a ride — Shahin Travels" },
      {
        name: "description",
        content: "Pick your bike, scooty, auto, e-rickshaw or car and book a cash ride instantly.",
      },
      { property: "og:title", content: "Book a ride — Shahin Travels" },
      {
        property: "og:description",
        content: "Compare live fares in Darbhanga and book a ride in one tap.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BookPage,
});

type Selection = {
  categoryId: string;
  journeyType: "standard" | "share" | "reserve";
  requestedAc: boolean | null;
};

function BookPage() {
  useRoleGuard("customer");
  const navigate = useNavigate();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [note, setNote] = useState("");
  const [booking, setBooking] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedLocations, setSelectedLocations] = useState<Location[]>([]);
  const [destOpen, setDestOpen] = useState(false);
  const [voiceQuery, setVoiceQuery] = useState("");

  const locations = useQuery({ queryKey: ["locations"], queryFn: () => fetchLocations(true) });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => fetchCategories(true) });
  const vehicleImages = useVehicleImages();

  // One-touch mic: speak the destination without opening the search box first.
  const onVoiceText = useCallback((text: string) => {
    setVoiceQuery(text);
    setDestOpen(true);
  }, []);
  const voice = useVoiceSearch(onVoiceText);

  const allLocations = [...(locations.data ?? []), ...selectedLocations].filter(
    (location, index, values) => values.findIndex((item) => item.id === location.id) === index,
  );


  const routeReady = Boolean(fromId && toId && fromId !== toId);
  const quote = useQuery({
    queryKey: ["fare-options", fromId, toId, passengers],
    queryFn: () =>
      getFareOptions({ data: { fromLocationId: fromId, toLocationId: toId, passengers } }),
    enabled: routeReady,
    staleTime: 30 * 60_000,
  });

  const optionByCategory = useMemo(() => {
    const map = new Map<string, NonNullable<typeof quote.data>["options"][number]>();
    (quote.data?.options ?? []).forEach((option) => map.set(option.categoryId, option));
    return map;
  }, [quote.data]);

  function selectLocation(location: Location, target: "from" | "to") {
    setSelectedLocations((current) =>
      current.some((item) => item.id === location.id) ? current : [...current, location],
    );
    if (target === "from") setFromId(location.id);
    else setToId(location.id);
    setSelection(null);
  }

  const pickupLoc = allLocations.find((l) => l.id === fromId) ?? null;
  const dropLoc = allLocations.find((l) => l.id === toId) ?? null;
  const pickupPoint =
    pickupLoc?.latitude != null && pickupLoc?.longitude != null
      ? { lat: Number(pickupLoc.latitude), lng: Number(pickupLoc.longitude) }
      : null;
  const dropPoint =
    dropLoc?.latitude != null && dropLoc?.longitude != null
      ? { lat: Number(dropLoc.latitude), lng: Number(dropLoc.longitude) }
      : null;
  const nearby = useQuery({
    queryKey: ["nearby-drivers", pickupPoint?.lat, pickupPoint?.lng],
    enabled: Boolean(pickupPoint),
    queryFn: () =>
      getNearbyDrivers({ data: { latitude: pickupPoint!.lat, longitude: pickupPoint!.lng } }),
    refetchInterval: 30_000,
  });
  const etaByCategory = useMemo(
    () => new Map((nearby.data?.etas ?? []).map((e) => [e.categoryId, e])),
    [nearby.data],
  );
  const fallbackEta = nearby.data?.fallbackEtaMinutes ?? 5;

  const [locating, setLocating] = useState(false);
  const autoTried = useRef(false);
  const [myPosition, setMyPosition] = useState<{
    lat: number;
    lng: number;
    heading?: number | null;
  } | null>(null);

  // Live blue arrow: follow the phone's own position while the page is open.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        // Ignore very inaccurate or stale readings so the blue arrow never jumps.
        if (typeof pos.coords.accuracy === "number" && pos.coords.accuracy > 150) return;
        if (Date.now() - pos.timestamp > 60_000) return;
        setMyPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          heading: pos.coords.heading,
        });
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  function useMyLocation(silent: boolean) {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      if (!silent) toast.error("इस फ़ोन में GPS उपलब्ध नहीं है।");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const place = await nearestPlaceForGps({
            data: { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
          });
          if (!place) {
            if (!silent) toast.error("आपकी लोकेशन नहीं मिल पाई। कृपया पिकअप सर्च करें।");
            return;
          }
          const loc = await selectIndiaPlace({
            data: { placeId: place.placeId, sessionToken: crypto.randomUUID() },
          });
          selectLocation(
            {
              id: loc.id,
              name: loc.name,
              area: loc.area,
              formattedAddress: loc.formatted_address,
              latitude: loc.latitude,
              longitude: loc.longitude,
              source: "google",
              pinCode: null,
              isActive: loc.is_active,
              label: loc.formatted_address || loc.area || loc.name,
            } as Location,
            "from",
          );
        } catch (error) {
          if (!silent) {
            toast.error(error instanceof Error ? error.message : "GPS से लोकेशन नहीं मिल पाई।");
          }
        } finally {
          setLocating(false);
        }
      },
      (error) => {
        setLocating(false);
        if (silent) return;
        if (error.code === error.PERMISSION_DENIED) {
          toast.error(
            "कृपया ऐप को लोकेशन की अनुमति दें: Settings > Apps > Shahin Travels > Permissions > Location > Allow.",
            { duration: 8000 },
          );
          return;
        }
        if (error.code === error.TIMEOUT) {
          toast.error("लोकेशन मिलने में देर हो रही है। खुले आसमान के नीचे दोबारा कोशिश करें।");
          return;
        }
        toast.error("लोकेशन नहीं मिल पाई। कृपया मोबाइल का GPS ऑन करें।");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    );
  }

  // Auto-fill pickup from GPS once (only if permission is already granted).
  useEffect(() => {
    if (autoTried.current || fromId) return;
    autoTried.current = true;
    const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
    if (!perms?.query) return;
    perms
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (status.state === "granted") useMyLocation(true);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function bookRide() {
    if (!selection) {
      toast.error("Choose a vehicle type first.");
      return;
    }
    setBooking(true);
    try {
      const res = await createBooking({
        data: {
          categoryId: selection.categoryId,
          fromLocationId: fromId,
          toLocationId: toId,
          bookingType: selection.journeyType,
          ...(selection.requestedAc == null ? {} : { requestedAc: selection.requestedAc }),
          passengers,
          pickupNote: note.trim() || undefined,
        },
      });
      toast.success(`Ride requested — ${rupees(res.totalFare)} to pay in cash.`);
      void navigate({ to: "/app/ride/$rideId", params: { rideId: res.rideId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not book this ride.");
    } finally {
      setBooking(false);
    }
  }

  const noLocations = locations.isSuccess && locations.data.length === 0;

  return (
    <CustomerShell title="Shahin Travels" subtitle="आपकी यात्रा, हमारी जिम्मेदारी!">
      <div className="space-y-4">
        {noLocations ? (
          <EmptyState
            title="No locations yet"
            description="The admin has not added any pickup or drop points yet. Please check back soon."
          />
        ) : (
          <>
            {/* Live map with the pickup point on top, exactly like a ride app home. */}
            <section className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="relative">
                <NearbyDriversMap
                  pickup={pickupPoint}
                  drop={dropPoint}
                  drivers={nearby.data?.drivers ?? []}
                  me={myPosition}
                />
                <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
                  <span className="rounded-full bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground shadow-lg">
                    Pickup Point
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1 border-t border-border px-3 py-1.5">
                <div className="min-w-0 flex-1">
                  <LocationPicker
                    locations={allLocations}
                    value={fromId}
                    onChange={(location) => selectLocation(location, "from")}
                    placeholder="Pickup location"
                    trigger={
                      <button
                        type="button"
                        className="flex min-h-11 w-full min-w-0 items-center gap-2 text-left"
                      >
                        <span
                          className="size-3 shrink-0 rounded-full border-[3px] border-primary"
                          aria-hidden="true"
                        />
                        <span className="line-clamp-1 flex-1 text-sm font-medium text-foreground">
                          {pickupLoc?.label ?? "Pickup location चुनें"}
                        </span>
                      </button>
                    }
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="min-h-11 min-w-11 shrink-0 rounded-full text-primary"
                  onClick={() => useMyLocation(false)}
                  disabled={locating}
                  aria-label="Use my current location"
                >
                  <LocateFixed className="size-5" />
                </Button>
              </div>
            </section>

            {/* Big destination search + one-touch mic. */}
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <LocationPicker
                  locations={allLocations}
                  value={toId}
                  onChange={(location) => selectLocation(location, "to")}
                  placeholder="कहाँ जाना है?"
                  open={destOpen}
                  onOpenChange={setDestOpen}
                  seedQuery={voiceQuery}
                  trigger={
                    <button
                      type="button"
                      className="flex h-14 w-full min-w-0 items-center gap-3 rounded-full border border-border bg-card px-4 text-left shadow-sm"
                    >
                      <Search className="size-5 shrink-0 text-foreground" />
                      <span
                        className={`line-clamp-1 flex-1 text-base font-semibold ${
                          dropLoc ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {dropLoc?.label ?? "कहाँ जाना है?"}
                      </span>
                    </button>
                  }
                />
              </div>
              {voice.supported ? (
                <button
                  type="button"
                  onClick={voice.start}
                  aria-label="बोल कर destination खोजें"
                  className={`flex h-14 shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 text-base font-semibold text-accent-foreground shadow-sm ${
                    voice.listening ? "animate-pulse" : ""
                  }`}
                >
                  <Mic className="size-5" />
                  बोलें
                </button>
              ) : null}
            </div>


            {routeReady ? (
            <section className="space-y-3 rounded-2xl border border-border bg-card p-4">


              {routeReady ? (
                <div className="flex min-h-11 items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                  <RouteIcon className="size-4 shrink-0 text-primary" />
                  {quote.isFetching ? (
                    <span className="text-muted-foreground">Calculating driving distance…</span>
                  ) : quote.data ? (
                    <span>
                      <strong>{quote.data.distanceKm} km</strong>
                      {quote.data.durationMinutes
                        ? ` · about ${quote.data.durationMinutes} min by road`
                        : " by road"}
                    </span>
                  ) : (
                    <span className="text-destructive">
                      {quote.error instanceof Error
                        ? quote.error.message
                        : "Driving distance unavailable."}
                    </span>
                  )}
                </div>
              ) : null}

              {fromId && toId && fromId === toId ? (
                <p className="text-xs text-destructive">Pickup and destination cannot be same.</p>
              ) : null}

              <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
                <span className="text-sm text-foreground">Passengers</span>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPassengers((p) => Math.max(1, p - 1))}
                    aria-label="Fewer passengers"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-6 text-center text-sm font-semibold">{passengers}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPassengers((p) => Math.min(12, p + 1))}
                    aria-label="More passengers"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              <Textarea
                placeholder="Landmark or pickup note (optional)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={300}
              />
            </section>
            ) : null}
          </>
        )}


        {routeReady ? (
        <>
        <section>
          <h2 className="mb-2 text-sm font-semibold text-foreground">Choose Vehicle Type</h2>
          {categories.isSuccess && categories.data.length === 0 ? (
            <EmptyState
              title="No vehicle types yet"
              description="The admin has not published any vehicle types yet."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {(categories.data ?? []).map((category) => {
                const option = optionByCategory.get(category.id);
                const availableFares = (option?.fares ?? []).filter((fare) => fare.available);
                const best = availableFares.reduce<(typeof availableFares)[number] | null>(
                  (lowest, fare) =>
                    lowest == null || (fare.fare ?? 0) < (lowest.fare ?? 0) ? fare : lowest,
                  null,
                );
                const selected = selection?.categoryId === category.id;
                const artwork =
                  resolveVehicleImage(vehicleImages.data, { categoryId: category.id }) ||
                  categoryArtwork(category.name, category.vehicle_class);
                const image = vehicleImages.data?.some((item) => item.category_id === category.id)
                  ? artwork
                  : categoryArtwork(category.name, category.vehicle_class);
                const tooManyPassengers = passengers > category.seat_capacity;
                return (
                  <button
                    key={category.id}
                    type="button"
                    disabled={routeReady && (!best || tooManyPassengers)}
                    onClick={() => {
                      if (!best) return;
                      setSelection({
                        categoryId: category.id,
                        journeyType: best.journeyType as Selection["journeyType"],
                        requestedAc: best.requestedAc,
                      });
                    }}
                    className={`flex flex-col items-start gap-1 rounded-2xl border p-3 text-left transition disabled:opacity-60 ${
                      selected ? "border-primary ring-2 ring-primary/40" : "border-border"
                    } bg-card`}
                  >
                    <img
                      src={image}
                      alt={category.name}
                      width={816}
                      height={816}
                      loading="lazy"
                      className="h-16 w-full object-contain"
                    />
                    <span className="text-sm font-semibold text-foreground">{category.name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {category.description || `Up to ${category.seat_capacity} seats`}
                    </span>
                    <span className="mt-1 text-base font-bold text-primary">
                      {!routeReady
                        ? "—"
                        : quote.isFetching
                          ? "…"
                          : best
                            ? rupees(best.fare ?? 0)
                            : "—"}
                    </span>
                    {routeReady && !quote.isFetching && !best ? (
                      <span className="text-[11px] text-muted-foreground">
                        {tooManyPassengers
                          ? `Seats ${category.seat_capacity} only`
                          : ((option?.fares ?? [])[0]?.reason ??
                            "Fare currently unavailable for this vehicle")}
                      </span>
                    ) : null}
                    {etaByCategory.get(category.id) ? (
                      <span className="text-[11px] font-medium text-foreground">
                        {etaByCategory.get(category.id)!.etaMinutes} min door
                      </span>
                    ) : (
                      <span className="text-[11px] font-medium text-muted-foreground">
                        ~{fallbackEta}–{fallbackEta + 2} min door
                      </span>
                    )}
                    {selected && best?.nightPricingApplied ? (
                      <span className="text-[11px] font-medium text-primary">
                        Night fare applied
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}

          {selection && (optionByCategory.get(selection.categoryId)?.fares.length ?? 0) > 1 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {(optionByCategory.get(selection.categoryId)?.fares ?? []).map((fare) => (
                <Button
                  key={`${fare.journeyType}-${fare.requestedAc}`}
                  size="sm"
                  variant={
                    selection.journeyType === fare.journeyType &&
                    selection.requestedAc === fare.requestedAc
                      ? "default"
                      : "outline"
                  }
                  disabled={!fare.available}
                  onClick={() =>
                    setSelection({
                      categoryId: selection.categoryId,
                      journeyType: fare.journeyType as Selection["journeyType"],
                      requestedAc: fare.requestedAc,
                    })
                  }
                  className="capitalize"
                >
                  {fare.journeyType}
                  {fare.requestedAc == null ? "" : fare.requestedAc ? " · AC" : " · Non-AC"}
                  {fare.available ? ` · ${rupees(fare.fare ?? 0)}` : " · N/A"}
                </Button>
              ))}
            </div>
          ) : null}
          <p className="mt-2 text-[11px] text-muted-foreground">Cash payment on completion.</p>
        </section>

        <Button
          size="lg"
          className="h-14 w-full text-base font-semibold"
          disabled={!routeReady || !selection || booking}
          onClick={bookRide}
        >
          Book Ride Now <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
        </>
        ) : (
          <section className="relative overflow-hidden rounded-2xl border border-border bg-card">
            <img
              src={watermark}
              alt=""
              aria-hidden="true"
              width={1024}
              height={1024}
              loading="lazy"
              className="h-64 w-full object-cover opacity-60"
            />
            <div className="pointer-events-none absolute inset-0 flex flex-col justify-center px-5">
              <span className="text-2xl font-extrabold italic tracking-tight text-muted-foreground">
                #gowithShahintravels
              </span>
              <span className="mt-2 text-sm font-medium text-muted-foreground">
                🇮🇳 Made for India
              </span>
              <span className="text-sm font-medium text-muted-foreground">
                ❤️ Pride of Darbhanga
              </span>
            </div>
          </section>
        )}


        <Link
          to="/"
          className="flex items-center justify-between rounded-2xl bg-primary p-4 text-primary-foreground"
        >
          <span>
            <span className="block text-sm font-semibold">Are you a Driver?</span>
            <span className="block text-xs opacity-90">
              Join Shahin Travels and start earning
            </span>
          </span>
          <ArrowRight className="h-5 w-5" />
        </Link>
      </div>
    </CustomerShell>
  );
}
