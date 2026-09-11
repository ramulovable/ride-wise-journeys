import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, Car, Minus, Plus, Star } from "lucide-react";
import { CustomerShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fetchLocations, fetchRiderOffers, type RiderOffer } from "@/lib/data";
import { rupees } from "@/lib/format";
import { createBooking } from "@/lib/api.functions";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/app/")({
  head: () => ({
    meta: [
      { title: "Book a ride — Shahin Travels" },
      { name: "description", content: "Compare Shahin Travels drivers on your route and book share or reserve." },
      { property: "og:title", content: "Book a ride — Shahin Travels" },
      { property: "og:description", content: "Compare drivers and fares on your route in Darbhanga." },
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

  const locations = useQuery({ queryKey: ["locations"], queryFn: () => fetchLocations(true) });
  const offers = useQuery({
    queryKey: ["offers", fromId, toId],
    queryFn: () => fetchRiderOffers(fromId, toId),
    enabled: Boolean(fromId && toId && fromId !== toId),
  });

  async function book(offer: RiderOffer, bookingType: "share" | "reserve") {
    setBooking(`${offer.riderId}-${bookingType}`);
    try {
      const res = await createBooking({
        data: {
          riderId: offer.riderId,
          fromLocationId: fromId,
          toLocationId: toId,
          bookingType,
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
        <section className="rounded-2xl border border-border bg-card p-4">
          {noLocations ? (
            <EmptyState
              title="No locations yet"
              description="The admin has not added any pickup or drop points yet. Please check back soon."
            />
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Pickup</label>
                <Select value={fromId} onValueChange={setFromId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select pickup point" />
                  </SelectTrigger>
                  <SelectContent>
                    {(locations.data ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <label className="text-xs font-medium text-muted-foreground">Drop</label>
                <Select value={toId} onValueChange={setToId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select drop point" />
                  </SelectTrigger>
                  <SelectContent>
                    {(locations.data ?? []).map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
                <span className="text-sm text-foreground">Passengers</span>
                <div className="flex items-center gap-3">
                  <Button variant="outline" size="icon" onClick={() => setPassengers((p) => Math.max(1, p - 1))}>
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-6 text-center text-sm font-semibold">{passengers}</span>
                  <Button variant="outline" size="icon" onClick={() => setPassengers((p) => Math.min(12, p + 1))}>
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
          <p className="text-center text-xs text-destructive">Pickup and drop cannot be the same.</p>
        ) : null}

        {offers.isFetching ? <p className="text-center text-xs text-muted-foreground">Finding drivers…</p> : null}

        {offers.isSuccess && offers.data.length === 0 ? (
          <EmptyState
            title="No driver available on this route"
            description="No online driver has set a fare for this direction yet. Try another route or check again shortly."
          />
        ) : null}

        <div className="space-y-3">
          {(offers.data ?? []).map((offer) => (
            <article key={offer.riderId} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-foreground">{offer.name}</p>
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Car className="h-3.5 w-3.5" />
                    {offer.vehicleName}
                    {offer.vehicleNumber ? ` • ${offer.vehicleNumber}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Star className="h-3.5 w-3.5 fill-accent text-accent" />
                  {offer.rating ? `${offer.rating.toFixed(1)} (${offer.trips})` : "New"}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={booking !== null || passengers > offer.seatCapacity}
                  onClick={() => book(offer, "share")}
                  className="rounded-xl border border-border p-3 text-left transition hover:border-primary disabled:opacity-50"
                >
                  <p className="text-xs text-muted-foreground">Share (per seat)</p>
                  <p className="text-lg font-bold text-primary">{rupees(offer.shareFare)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    Total {rupees(offer.shareFare * passengers)} for {passengers}
                  </p>
                </button>
                <button
                  type="button"
                  disabled={booking !== null || passengers > offer.seatCapacity}
                  onClick={() => book(offer, "reserve")}
                  className="rounded-xl border border-border p-3 text-left transition hover:border-accent disabled:opacity-50"
                >
                  <p className="text-xs text-muted-foreground">Reserve (whole trip)</p>
                  <p className="text-lg font-bold text-accent">{rupees(offer.reserveFare)}</p>
                  <p className="text-[11px] text-muted-foreground">Fixed price, any passengers</p>
                </button>
              </div>
              {passengers > offer.seatCapacity ? (
                <p className="mt-2 text-[11px] text-destructive">
                  This vehicle seats {offer.seatCapacity}. Reduce passengers to book.
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
