import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { CustomerShell } from "@/components/shells";
import { TravelDesk } from "@/components/TravelDesk";
import { QuotesStudioCard } from "@/components/QuotesStudioCard";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/travel")({
  head: () => ({
    meta: [
      { title: "Travel services — Shahin Travels" },
      { name: "description", content: "Train, flight, hotel and e-ticket services in one place." },
      { property: "og:title", content: "Travel services — Shahin Travels" },
      { property: "og:description", content: "Train, flight, hotel and e-ticket services." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TravelPage,
});

function TravelPage() {
  useRoleGuard("customer");
  return (
    <CustomerShell title="Travel" subtitle="Train • Flight • Hotel • E-Ticket">
      <div className="space-y-4">
        <TravelDesk />
        <Link
          to="/app/eticket"
          className="flex items-center justify-between rounded-2xl border border-border bg-card p-4"
        >
          <span>
            <span className="block text-sm font-semibold text-foreground">E-Ticket (Prepaid QR)</span>
            <span className="block text-xs text-muted-foreground">Online pay karke ticket lein</span>
          </span>
          <ArrowRight className="h-5 w-5 text-primary" />
        </Link>
        <QuotesStudioCard />
      </div>
    </CustomerShell>
  );
}
