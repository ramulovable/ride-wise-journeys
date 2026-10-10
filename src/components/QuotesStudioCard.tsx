import { Link } from "@tanstack/react-router";
import { ChevronRight, Sparkles } from "lucide-react";
import { festivalState } from "@/lib/quotes-library";

export function QuotesStudioCard() {
  const next = festivalState().upcoming[0];
  return (
    <Link
      to="/quotes"
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm"
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Sparkles className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-bold text-foreground">Quotes Studio</p>
        <p className="truncate text-xs text-muted-foreground">
          {next && next.daysLeft <= 2
            ? `${next.name} की शुभकामनाएं — आपके नाम के साथ`
            : "आज का विचार, शायरी व त्योहार पोस्टर"}
        </p>
      </div>
      <ChevronRight className="h-5 w-5 text-muted-foreground" />
    </Link>
  );
}
