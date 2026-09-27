import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Minus, Plus, ShieldCheck, Ticket } from "lucide-react";
import { CustomerShell } from "@/components/shells";
import { LocationPicker } from "@/components/LocationPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchLocations, type Location } from "@/lib/data";
import { rupees } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useRoleGuard } from "@/lib/useRoleGuard";
import {
  createETicketOrder,
  getETicketQuote,
  getETicketStatus,
  listMyETickets,
  verifyETicketPayment,
} from "@/lib/eticket.functions";

export const Route = createFileRoute("/_authenticated/app/eticket")({
  head: () => ({
    meta: [
      { title: "E-Ticket — Shahin Travels" },
      { name: "description", content: "Prepaid E-Ticket with secure QR for e-rickshaw, auto, bike, scooty and car." },
      { property: "og:title", content: "E-Ticket — Shahin Travels" },
      { property: "og:description", content: "Book a prepaid QR ride ticket online." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ETicketPage,
});

type RzpWindow = Window & { Razorpay?: new (o: Record<string, unknown>) => { open: () => void; on: (e: string, cb: () => void) => void } };

function loadRazorpay() {
  return new Promise<boolean>((resolve) => {
    if ((window as RzpWindow).Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

const statusLabel: Record<string, string> = {
  ACTIVE: "PAID · Valid",
  IN_PROGRESS: "Trip chal rahi hai",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

function ETicketPage() {
  useRoleGuard("customer");
  const qc = useQueryClient();
  const { profile } = useAuth() as unknown as { profile?: { full_name?: string } };
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [picked, setPicked] = useState<Location[]>([]);
  const [passengers, setPassengers] = useState(1);
  const [categoryId, setCategoryId] = useState("");
  const [insurance, setInsurance] = useState(false);
  const [name, setName] = useState(profile?.full_name ?? "");
  const [landmark, setLandmark] = useState("");
  const [paying, setPaying] = useState(false);

  const status = useQuery({ queryKey: ["eticket-status"], queryFn: () => getETicketStatus() });
  const locations = useQuery({ queryKey: ["locations"], queryFn: () => fetchLocations(true) });
  const tickets = useQuery({ queryKey: ["my-etickets"], queryFn: () => listMyETickets() });
  const all = [...(locations.data ?? []), ...picked].filter((l, i, a) => a.findIndex((x) => x.id === l.id) === i);
  const ready = Boolean(fromId && toId && fromId !== toId);
  const quote = useQuery({
    queryKey: ["eticket-quote", fromId, toId, passengers],
    queryFn: () => getETicketQuote({ data: { fromLocationId: fromId, toLocationId: toId, passengers } }),
    enabled: ready && status.data?.enabled === true,
  });
  const selected = quote.data?.options.find((o) => o.categoryId === categoryId);
  const insCharge = insurance && quote.data?.insurance ? quote.data.insurance.charge * passengers : 0;
  const total = (selected?.fare ?? 0) + insCharge;

  function pick(l: Location, t: "from" | "to") {
    setPicked((c) => (c.some((x) => x.id === l.id) ? c : [...c, l]));
    if (t === "from") setFromId(l.id);
    else setToId(l.id);
    setCategoryId("");
  }

  async function pay() {
    if (!selected) { toast.error("Vehicle chunein."); return; }
    if (name.trim().length < 2) { toast.error("Passenger ka naam likhein."); return; }
    setPaying(true);
    try {
      const ok = await loadRazorpay();
      if (!ok) throw new Error("Payment page load nahi hua. Internet check karein.");
      const order = await createETicketOrder({
        data: {
          fromLocationId: fromId,
          toLocationId: toId,
          passengers,
          categoryId,
          insurance,
          passengerName: name.trim(),
          pickupLandmark: landmark.trim() || undefined,
        },
      });
      const Rzp = (window as RzpWindow).Razorpay!;
      const rzp = new Rzp({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: "INR",
        name: "Shahin Travels",
        description: `E-Ticket ${order.pnr}`,
        prefill: { name: name.trim(), contact: order.mobile },
        theme: { color: "#16a34a" },
        handler: async (r: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
          try {
            await verifyETicketPayment({
              data: { ticketId: order.ticketId, orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature },
            });
            toast.success(`Ticket confirm! PNR ${order.pnr}`);
            setCategoryId("");
            void qc.invalidateQueries({ queryKey: ["my-etickets"] });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Payment verify nahi hua.");
          } finally {
            setPaying(false);
          }
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      rzp.on("payment.failed", () => {
        toast.error("Payment fail ho gaya.");
        setPaying(false);
      });
      rzp.open();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment shuru nahi hua.");
      setPaying(false);
    }
  }

  return (
    <CustomerShell title="E-Ticket" subtitle="Prepaid QR ride ticket">
      <div className="space-y-4">
        {status.data && !status.data.enabled ? (
          <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
            E-Ticket service jald shuru hogi.
          </p>
        ) : (
          <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <LocationPicker
              locations={all}
              value={fromId}
              onChange={(l) => pick(l, "from")}
              placeholder="Boarding point"
              trigger={
                <button type="button" className="flex h-12 w-full items-center rounded-xl border border-border px-3 text-left text-sm">
                  {all.find((l) => l.id === fromId)?.label ?? "Boarding point चुनें"}
                </button>
              }
            />
            <LocationPicker
              locations={all}
              value={toId}
              onChange={(l) => pick(l, "to")}
              placeholder="Destination"
              trigger={
                <button type="button" className="flex h-12 w-full items-center rounded-xl border border-border px-3 text-left text-sm">
                  {all.find((l) => l.id === toId)?.label ?? "Destination चुनें"}
                </button>
              }
            />
            <div className="flex items-center justify-between rounded-xl bg-muted px-3 py-2">
              <span className="text-sm">Passengers</span>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={() => setPassengers((p) => Math.max(1, p - 1))} aria-label="Fewer">
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <span className="w-6 text-center font-semibold">{passengers}</span>
                <Button variant="outline" size="icon" onClick={() => setPassengers((p) => Math.min(10, p + 1))} aria-label="More">
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {ready ? (
              quote.isFetching ? (
                <p className="text-sm text-muted-foreground">Fare nikal rahe hain…</p>
              ) : quote.error ? (
                <p className="text-sm text-destructive">{(quote.error as Error).message}</p>
              ) : quote.data ? (
                <>
                  <p className="text-xs text-muted-foreground">{quote.data.distanceKm} km by road</p>
                  <div className="grid grid-cols-2 gap-2">
                    {quote.data.options.map((o) => (
                      <button
                        key={o.categoryId}
                        type="button"
                        disabled={!o.available}
                        onClick={() => setCategoryId(o.categoryId)}
                        className={`rounded-xl border p-3 text-left disabled:opacity-50 ${
                          categoryId === o.categoryId ? "border-primary ring-2 ring-primary/40" : "border-border"
                        }`}
                      >
                        <span className="block text-sm font-semibold">{o.name}</span>
                        <span className="block text-base font-bold text-primary">{rupees(o.fare)}</span>
                        {!o.available ? <span className="text-[11px]">Seats {o.seatCapacity} only</span> : null}
                      </button>
                    ))}
                    {quote.data.options.length === 0 ? (
                      <p className="col-span-2 text-sm text-muted-foreground">Admin ne abhi fare set nahi kiya hai.</p>
                    ) : null}
                  </div>
                  {quote.data.insurance ? (
                    <label className="flex items-start gap-2 rounded-xl border border-border p-3 text-sm">
                      <input type="checkbox" checked={insurance} onChange={(e) => setInsurance(e.target.checked)} className="mt-1" />
                      <span>
                        <ShieldCheck className="mr-1 inline size-4 text-primary" />
                        Trip insurance lein — {rupees(quote.data.insurance.charge)} / passenger
                        {quote.data.insurance.provider ? ` (${quote.data.insurance.provider})` : ""}
                      </span>
                    </label>
                  ) : null}
                  <Input placeholder="Passenger ka naam" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
                  <Input placeholder="Landmark (optional)" value={landmark} onChange={(e) => setLandmark(e.target.value)} maxLength={200} />
                  <Button size="lg" className="h-14 w-full text-base font-semibold" disabled={!selected || paying} onClick={pay}>
                    {paying ? "Processing…" : `Pay ${rupees(total)} & Get Ticket`}
                  </Button>
                </>
              ) : null
            ) : null}
          </section>
        )}

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Mere E-Tickets</h2>
          {(tickets.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Abhi koi ticket nahi hai.</p>
          ) : null}
          {(tickets.data ?? []).map((t) => (
            <article key={t.id} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="flex items-center justify-between bg-primary px-4 py-2 text-primary-foreground">
                <span className="flex items-center gap-2 text-sm font-bold">
                  <Ticket className="size-4" /> Shahin Travels E-Ticket
                </span>
                <span className="text-xs font-semibold">{statusLabel[t.status] ?? t.status}</span>
              </div>
              <div className="flex gap-4 p-4">
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <p className="text-lg font-extrabold tracking-widest">PNR {t.pnr}</p>
                  <p>{t.passenger_name} · {t.passengers} pax · {t.category?.name}</p>
                  <p className="text-muted-foreground">
                    {t.from?.name} → {t.to?.name}
                  </p>
                  {t.pickup_landmark ? <p className="text-xs text-muted-foreground">Landmark: {t.pickup_landmark}</p> : null}
                  <p className="font-bold text-primary">Paid {rupees(Number(t.total_amount))}</p>
                  {t.insurance_opted ? (
                    <p className="text-xs">
                      Insured{t.fare_snapshot?.insuranceProvider ? ` · ${t.fare_snapshot.insuranceProvider}` : ""}
                      {t.fare_snapshot?.insurancePolicy ? ` · Policy ${t.fare_snapshot.insurancePolicy}` : ""}
                    </p>
                  ) : null}
                </div>
                {t.status === "ACTIVE" ? (
                  <div className="shrink-0 rounded-lg bg-background p-2">
                    <QRCodeSVG value={t.qr_token} size={104} />
                  </div>
                ) : null}
              </div>
              {t.insurance_opted && t.fare_snapshot?.claimRules ? (
                <p className="whitespace-pre-line border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
                  Claim: {t.fare_snapshot.claimRules}
                </p>
              ) : null}
              <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
                Driver ko QR dikhayein. Ticket sirf ek baar valid hai.
              </p>
            </article>
          ))}
        </section>
      </div>
    </CustomerShell>
  );
}
