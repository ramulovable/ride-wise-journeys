import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, ChevronRight } from "lucide-react";
import { getMyEmployeeStatus } from "@/lib/field.functions";

/** Shows a Field Employee Dashboard link only to active field employees. */
export function EmployeeEntry() {
  const q = useQuery({ queryKey: ["my-employee-status"], queryFn: () => getMyEmployeeStatus(), staleTime: 60_000 });
  if (!q.data) return null;
  if (q.data.status !== "active")
    return <p className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">Your field employee account is {q.data.status}.</p>;
  return (
    <Link to="/employee" className="flex items-center justify-between rounded-2xl border border-border bg-card p-4">
      <span className="flex items-center gap-3">
        <Briefcase className="h-5 w-5 text-primary" />
        <span className="block text-sm font-semibold text-foreground">Field Employee Dashboard</span>
      </span>
      <ChevronRight className="h-5 w-5 text-muted-foreground" />
    </Link>
  );
}
