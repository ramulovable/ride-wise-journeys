import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, Car, MapPin, Minus, Plus, RouteIcon } from "lucide-react";
import { CustomerShell } from "@/components/shells";
import { EnablePushButton } from "@/components/EnablePushButton";
import { EmptyState } from "@/components/EmptyState";
import { LocationPicker } from "@/components/LocationPicker";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { fetchLocations, type Location } from "@/lib/data";
import { rupees } from "@/lib/format";
import { createBooking, getFareOptions } from "@/lib/api.functions";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Book a ride — Shahin Travels" },
      {
        name: "description",
        content: "Compare Shahin Travels drivers on your route and book share or reserve.",
      },
      { property: "og:title", content: "Book a ride — Shahin Travels" },
      {
        property: "og:description",
        content: "Compare drivers and fares on your route in Darbhanga.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BookPage,
});

function BookPage() {
  useRoleGuard("customer");
  const navigate = useNavigate();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [passengers, setPassengers] = useState(1);
  const [note, setNote] = useState("");
  const [booking, setBooking] = useState<string | null>(null);
  const [selectedLocations, setSelectedLocations] = useState<Location[]>([]);

  const locations = useQuery({ queryKey: ["locations"], queryFn: () => fetchLocations(true) });
  const allLocations = [...(locations.data ?? []), ...selectedLocations].filter(
    (location, index, values) => values.findIndex((item) => item.id === location.id) === index,
  );
  const quote = useQuery({
    queryKey: ["fare-options", fromId, toId, passengers],
    queryFn: () =>
      getFareOptions({ data: { fromLocationId: fromId, toLocationId: toId, passengers } }),
    enabled: Boolean(fromId && toId && fromId !== toId),
    staleTime: 30 * 60_000,
  });

  function selectLocation(location: Location, target: "from" | "to") {
    setSelectedLocations((current) =>
      current.some((item) => item.id === location.id) ? current : [...current, location],
    );
    if (target === "from") setFromId(location.id);
    else setToId(location.id);
  }

  async function book(
    categoryId: string,
    bookingType: "standard" | "share" | "reserve",
    requestedAc: boolean | null,
  ) {
    setBooking(`${categoryId}-${bookingType}-${requestedAc}`);
    try {
      const res = await createBooking({
        data: {
          categoryId,
          fromLocationId: fromId,
          toLocationId: toId,
          bookingType,
          ...(requestedAc == null ? {} : { requestedAc }),
          passengers,
          pickupNote: note.trim() || undefined,
        },
      });
      toast.success(`Ride requested — ${rupees(res.totalFare)} to pay in cash.`);
      void navigate({ to: "/app/ride/$rideId", params: { rideId: res.rideId } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not book this ride.");
    } finally {
      setBooking(null);
    }
  }

  const noLocations = locations.isSuccess && locations.data.length === 0;

  return (
    <CustomerShell title="Book a ride" subtitle="आपकी यात्रा, हमारी जिम्मेदारी">
      <div className="space-y-4">
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
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <MapPin className="size-3.5" /> Pickup
                </label>
                <LocationPicker
                  locations={allLocations}
                  value={fromId}
                  onChange={(location) => selectLocation(location, "from")}
                  placeholder="Search pickup anywhere in India"
                />
              </div>

              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    setFromId(toId);
                    setToId(fromId);
                  }}
                  aria-label="Swap pickup and drop"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <MapPin className="size-3.5" /> Destination
                </label>
                <LocationPicker
                  locations={allLocations}
                  value={toId}
                  onChange={(location) => selectLocation(location, "to")}
                  placeholder="Search destination anywhere in India"
                />
              </div>

              {fromId && toId && fromId !== toId ? (
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

              <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
                <span className="text-sm text-foreground">Passengers</span>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPassengers((p) => Math.max(1, p - 1))}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-6 text-center text-sm font-semibold">{passengers}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setPassengers((p) => Math.min(12, p + 1))}
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

        {fromId && toId && fromId === toId ? (
          <p className="text-center text-xs text-destructive">
            Pickup and drop cannot be the same.
          </p>
        ) : null}

        {quote.isFetching ? (
          <p className="text-center text-xs text-muted-foreground">Calculating fares…</p>
        ) : null}

        {quote.isSuccess &&
        quote.data.options.every((category) => category.fares.every((fare) => !fare.available)) ? (
          <EmptyState
            title="No fare available"
            description="No eligible driver and configured fare are available for this journey right now."
          />
        ) : null}

        <div className="space-y-3">
          {(quote.data?.options ?? []).map((option) => (
            <article
              key={option.categoryId}
              className="rounded-2xl border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{option.categoryName}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Car className="h-3.5 w-3.5" />
                    {option.vehicleClass.replaceAll("_", " ")}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  Up to {option.seatCapacity} seats
                </span>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {option.fares.map((fare) => (
                  <Button
                    key={`${fare.journeyType}-${fare.requestedAc}`}
                    variant="outline"
                    className="h-auto min-h-20 justify-between p-3 text-left"
                    disabled={
                      !fare.available || booking !== null || passengers > option.seatCapacity
                    }
                    onClick={() =>
                      book(
                        option.categoryId,
                        fare.journeyType as "standard" | "share" | "reserve",
                        fare.requestedAc,
                      )
                    }
                  >
                    <span>
                      <span className="block text-xs capitalize text-muted-foreground">
                        {fare.journeyType}
                        {fare.requestedAc == null ? "" : fare.requestedAc ? " · AC" : " · Non-AC"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {fare.available
                          ? fare.journeyType === "share"
                            ? `${rupees(fare.unitFare ?? 0)} × ${passengers}`
                            : "Cash on completion"
                          : fare.reason}
                      </span>
                    </span>
                    <strong className="text-lg text-primary">
                      {fare.available ? rupees(fare.fare ?? 0) : "—"}
                    </strong>
                  </Button>
                ))}
              </div>
              {passengers > option.seatCapacity ? (
                <p className="mt-2 text-[11px] text-destructive">
                  This vehicle seats {option.seatCapacity}. Reduce passengers to book.
                </p>
              ) : null}
              <p className="mt-2 text-[11px] text-muted-foreground">Cash payment on completion.</p>
            </article>
          ))}
        </div>
      </div>
    </CustomerShell>
  );
}
