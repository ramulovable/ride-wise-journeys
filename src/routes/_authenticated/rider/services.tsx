import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { RiderShell } from "@/components/shells";
import { TravelDesk } from "@/components/TravelDesk";
import { QuotesStudioCard } from "@/components/QuotesStudioCard";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/rider/services")({
  head: () => ({
    meta: [
      { title: "Other services — Shahin Travels Driver" },
      { name: "description", content: "Train, flight, hotel, e-ticket and quotes for drivers." },
      { property: "og:title", content: "Other services — Shahin Travels Driver" },
      { property: "og:description", content: "Train, flight, hotel, e-ticket and quotes." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RiderServicesPage,
});

function RiderServicesPage() {
  useRoleGuard("rider");
  return (
    <RiderShell title="Other Services" subtitle="Train • Flight • Hotel • E-Ticket">
      <div className="space-y-4">
        <TravelDesk />
        <Link
          to="/rider/eticket"
          className="flex items-center justify-between rounded-2xl border border-border bg-card p-4"
        >
          <span>
            <span className="block text-sm font-semibold text-foreground">E-Ticket Scanner</span>
            <span className="block text-xs text-muted-foreground">Passenger ticket verify karein</span>
          </span>
          <ArrowRight className="h-5 w-5 text-primary" />
        </Link>
        <QuotesStudioCard />
      </div>
    </RiderShell>
  );
}
