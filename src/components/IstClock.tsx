import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { getPricingStatus } from "@/lib/api.functions";

function formatIst(date: Date) {
  return date.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function prettyTime(value: string) {
  const [h = "0", m = "00"] = value.split(":");
  const hour = Number(h);
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${m} ${suffix}`;
}

/** Live Indian time with the current fare period. The period always comes from the server. */
export function IstClock() {
  const status = useQuery({
    queryKey: ["pricing-status"],
    queryFn: () => getPricingStatus(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const period = status.data?.period;
  const night = period === "night";
  const nightActive = night && (status.data?.isEnabled ?? false);

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2">
        <span
          className={`flex size-7 items-center justify-center rounded-full ${
            night ? "bg-primary/15 text-primary" : "bg-accent text-accent-foreground"
          }`}
        >
          {night ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold tabular-nums text-foreground">{formatIst(now)}</p>
          <p className="text-[11px] text-muted-foreground">India time (IST)</p>
        </div>
      </div>
      {period ? (
        <div className="text-right leading-tight">
          <p className="text-xs font-semibold text-foreground">
            {night ? "🌙 Night Fare Active" : "☀️ Day Fare Active"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {nightActive
              ? status.data?.pricingMode === "direct_rate" && status.data.nightDirectRate != null
                ? `₹${status.data.nightDirectRate}/km until ${prettyTime(status.data.dayStartTime)}`
                : `${status.data?.nightMultiplier}× until ${prettyTime(status.data?.dayStartTime ?? "05:00")}`
              : night
                ? "Standard prices"
                : `Until ${prettyTime(status.data?.nightStartTime ?? "20:00")}`}
          </p>
        </div>
      ) : null}
    </div>
  );
}
