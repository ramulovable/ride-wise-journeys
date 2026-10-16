import { useEffect, useState } from "react";
import { getFareOptions } from "@/lib/api.functions";

// Real saved places: Nista → Bharwara. Fares come live from the app's fare engine.
const FROM_ID = "cd75d7c4-6be3-407f-ba22-28fad795fc1a";
const TO_ID = "4d14db43-c273-4777-b7c4-fa00e365e42c";
const SHOWN = ["Bike", "Scooty", "E-Rickshaw", "Auto", "Car"];

type Row = { name: string; fare: number | null };

/** Ride-booking tutorial that plays inside the studio LED screen behind Ayesha. */
export function LedBookingGuide() {
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    getFareOptions({ data: { fromLocationId: FROM_ID, toLocationId: TO_ID, passengers: 1 } } as never)
      .then((q: any) => {
        const list: Row[] = (q?.options ?? [])
          .filter((o: any) => SHOWN.includes(o.categoryName))
          .map((o: any) => {
            const vals = (o.fares ?? []).map((f: any) => f.fare).filter((f: any) => typeof f === "number");
            return { name: o.categoryName, fare: vals.length ? Math.min(...vals) : null };
          });
        setRows(list);
      })
      .catch(() => setRows([]));
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setStep((s) => (s + 1) % 6), 2200);
    return () => window.clearInterval(t);
  }, []);

  const pick = rows.find((r) => r.name === "Bike") ?? rows[0];
  return (
    <div className="led-guide pointer-events-none absolute overflow-hidden rounded-md">
      <div className="flex h-full flex-col gap-[3%] p-[3%] text-[clamp(6px,1.6vw,11px)] leading-tight">
        <div className="font-bold text-primary">Shahin Travels · Ride book karein</div>
        <div className={`led-field ${step >= 1 ? "led-on" : ""}`}>🟢 Boarding: {step >= 1 ? "Nista" : "…"}</div>
        <div className={`led-field ${step >= 2 ? "led-on" : ""}`}>🔴 Destination: {step >= 2 ? "Bharwara" : "…"}</div>
        <div className="grid flex-1 grid-cols-3 gap-[3%]">
          {step >= 3
            ? rows.slice(0, 6).map((r) => (
                <div key={r.name} className={`led-veh ${step >= 4 && r === pick ? "led-pick" : ""}`}>
                  <span className="block truncate">{r.name}</span>
                  <b>{r.fare != null ? `₹${r.fare}` : "—"}</b>
                </div>
              ))
            : null}
        </div>
        <div className={`led-book ${step >= 5 ? "led-press" : ""}`}>
          {step >= 5 ? "✓ Ride booked!" : "Book Ride"}
        </div>
      </div>
    </div>
  );
}
