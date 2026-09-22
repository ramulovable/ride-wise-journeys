import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeftRight,
  ArrowRight,
  BadgeIndianRupee,
  ClipboardList,
  LifeBuoy,
  Minus,
  Plus,
  RouteIcon,
  UserRound,
} from "lucide-react";
import { CustomerShell } from "@/components/shells";
import { EnablePushButton } from "@/components/EnablePushButton";
import { EmptyState } from "@/components/EmptyState";
import { IstClock } from "@/components/IstClock";
import { LocationPicker } from "@/components/LocationPicker";
import { PromoCarousel } from "@/components/PromoCarousel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fetchCategories, fetchLocations, type Location } from "@/lib/data";
import { categoryArtwork } from "@/lib/vehicleArt";
import { resolveVehicleImage, useVehicleImages } from "@/lib/vehicleImages";
import { rupees } from "@/lib/format";
import { createBooking, getFareOptions } from "@/lib/api.functions";
import { useRoleGuard } from "@/lib/useRoleGuard";

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

  const locations = useQuery({ queryKey: ["locations"], queryFn: () => fetchLocations(true) });
  const categories = useQuery({ queryKey: ["categories"], queryFn: () => fetchCategories(true) });
  const vehicleImages = useVehicleImages();

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
        <PromoCarousel />
        <IstClock />

        <div className="flex justify-end">
          <EnablePushButton label="Turn on ride updates" doneLabel="Ride updates on" />
        </div>

        <section className="rounded-2xl border border-border bg-card p-4">
          {noLocations ? (
            <EmptyState
              title="No locations yet"
              description="The admin has not added any pickup or drop points yet. Please check back soon."
            />
          ) : (
            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex flex-col items-center pt-3">
                  <span className="size-3 rounded-full bg-primary" aria-hidden="true" />
                  <span
                    className="my-1 w-px flex-1 border-l border-dashed border-border"
                    aria-hidden="true"
                  />
                  <span className="size-3 rounded-full bg-destructive" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <p className="text-[11px] font-medium uppercase text-muted-foreground">
                      Pickup location
                    </p>
                    <LocationPicker
                      locations={allLocations}
                      value={fromId}
                      onChange={(location) => selectLocation(location, "from")}
                      placeholder="Search pickup anywhere in India"
                    />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium uppercase text-muted-foreground">
                      Destination
                    </p>
                    <LocationPicker
                      locations={allLocations}
                      value={toId}
                      onChange={(location) => selectLocation(location, "to")}
                      placeholder="Search destination anywhere in India"
                    />
                  </div>
                </div>
                <div className="flex items-center">
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full"
                    onClick={() => {
                      setFromId(toId);
                      setToId(fromId);
                      setSelection(null);
                    }}
                    aria-label="Swap pickup and destination"
                  >
                    <ArrowLeftRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

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
            </div>
          )}
        </section>

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

        <section className="grid grid-cols-5 gap-2">
          {[
            { to: "/app/rides", label: "My Rides", icon: <ClipboardList className="h-5 w-5" /> },
            {
              to: "/fares",
              label: "Fare Details",
              icon: <BadgeIndianRupee className="h-5 w-5" />,
            },
            { to: "/wallet", label: "Wallet", icon: <WalletIcon className="h-5 w-5" /> },
            { to: "/support", label: "Help & Support", icon: <LifeBuoy className="h-5 w-5" /> },
            { to: "/profile", label: "My Profile", icon: <UserRound className="h-5 w-5" /> },
          ].map((item) => (
            <Link key={item.to} to={item.to} className="flex flex-col items-center gap-1.5">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                {item.icon}
              </span>
              <span className="text-center text-[11px] text-muted-foreground">{item.label}</span>
            </Link>
          ))}
        </section>

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
