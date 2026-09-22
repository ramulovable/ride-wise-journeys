import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { RideAlertSettings } from "@/lib/rideAlerts";

export type RideAlertDetails = {
  rideId: string;
  pickup: string;
  destination: string;
  customerName: string;
  customerMobile: string | null;
  pickupNote: string | null;
  category: string;
  distanceKm: number | null;
  fare: number;
  passengers: number;
  bookedAt: string;
};

/** Repeating alert tone built in the browser, so no audio file is needed. */
function useAlertSound(active: boolean, settings: RideAlertSettings) {
  const contextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const started = Date.now();

    const beep = () => {
      if (cancelled) return;
      if (Date.now() - started > settings.alert_duration_seconds * 1000) return;
      try {
        if (settings.sound_enabled) {
          const Ctor =
            window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (Ctor) {
            const ctx = contextRef.current ?? new Ctor();
            contextRef.current = ctx;
            void ctx.resume();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.value = settings.alert_sound === "siren" ? 1040 : 880;
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
            osc.connect(gain).connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.65);
          }
        }
        if (settings.vibration_enabled && typeof navigator !== "undefined" && navigator.vibrate) {
          navigator.vibrate([400, 200, 400]);
        }
      } catch {
        /* audio blocked until the driver interacts with the page */
      }
    };

    beep();
    const timer = window.setInterval(beep, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(0);
    };
  }, [active, settings]);
}

export function RideAlertOverlay({
  ride,
  settings,
  accepting,
  rejecting,
  onAccept,
  onReject,
  onExpire,
}: {
  ride: RideAlertDetails;
  settings: RideAlertSettings;
  accepting: boolean;
  rejecting: boolean;
  onAccept: () => void;
  onReject: () => void;
  onExpire: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(settings.response_timeout_seconds);
  useAlertSound(!accepting && !rejecting, settings);

  useEffect(() => {
    setSecondsLeft(settings.response_timeout_seconds);
  }, [ride.rideId, settings.response_timeout_seconds]);

  useEffect(() => {
    if (accepting) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          onExpire();
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [ride.rideId, accepting, onExpire]);

  const status = accepting
    ? "Confirming ride…"
    : rejecting
      ? "Passing to the next driver…"
      : `Waiting for your response… ${secondsLeft}s`;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-background p-5">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Shahin Travels
      </p>
      <h2 className="mt-2 text-center text-2xl font-extrabold text-foreground">
        🚖 New ride request
      </h2>

      <div className="mt-5 space-y-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Pickup</p>
          <p className="text-lg font-bold text-foreground">{ride.pickup}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Destination</p>
          <p className="text-lg font-bold text-foreground">{ride.destination}</p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-2xl border border-border bg-card p-4 text-sm">
        <div>
          <dt className="text-[11px] text-muted-foreground">Customer</dt>
          <dd className="font-medium">{ride.customerName}</dd>
        </div>
        <div className="text-right">
          <dt className="text-[11px] text-muted-foreground">Mobile</dt>
          <dd className="font-medium">
            {ride.customerMobile ? (
              <a className="text-primary" href={`tel:${ride.customerMobile}`}>
                {ride.customerMobile}
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted-foreground">Vehicle</dt>
          <dd className="font-medium">{ride.category}</dd>
        </div>
        <div className="text-right">
          <dt className="text-[11px] text-muted-foreground">Distance</dt>
          <dd className="font-medium">
            {ride.distanceKm == null ? "—" : `${Number(ride.distanceKm).toFixed(1)} km`}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] text-muted-foreground">Fare</dt>
          <dd className="text-lg font-bold text-primary">₹{Math.round(ride.fare)}</dd>
        </div>
        <div className="text-right">
          <dt className="text-[11px] text-muted-foreground">Passengers</dt>
          <dd className="font-medium">{ride.passengers}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[11px] text-muted-foreground">Pickup landmark</dt>
          <dd className="font-medium">{ride.pickupNote?.trim() || "—"}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[11px] text-muted-foreground">Booked at</dt>
          <dd className="font-medium">{new Date(ride.bookedAt).toLocaleString("en-IN")}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[11px] text-muted-foreground">Ride ID</dt>
          <dd className="break-all font-mono text-[11px]">{ride.rideId}</dd>
        </div>
      </dl>

      <p className="mt-4 text-center text-sm font-medium text-muted-foreground">{status}</p>

      <div className="mt-4 grid gap-3 pb-6">
        <Button
          className="h-16 bg-emerald-600 text-lg font-bold text-white hover:bg-emerald-700"
          disabled={accepting || rejecting}
          onClick={onAccept}
        >
          🟢 ACCEPT RIDE
        </Button>
        <Button
          variant="destructive"
          className="h-16 text-lg font-bold"
          disabled={accepting || rejecting}
          onClick={onReject}
        >
          🔴 REJECT RIDE
        </Button>
      </div>
    </div>
  );
}
