import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/shells";
import { Badge } from "@/components/ui/badge";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { adminVerifyEmployee } from "@/lib/field.functions";

export const Route = createFileRoute("/_authenticated/admin/verify-employee/$token")({
  head: () => ({
    meta: [
      { title: "Verify Employee ID | Shahin Travels HQ" },
      { name: "description", content: "HQ verification of a Shahin Travels field employee ID card." },
      { property: "og:title", content: "Verify Employee ID | Shahin Travels HQ" },
      { property: "og:description", content: "HQ verification of a field employee ID card." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Verify,
});

function Verify() {
  useRoleGuard("admin");
  const { token } = Route.useParams();
  const q = useQuery({ queryKey: ["verify-emp", token], queryFn: () => adminVerifyEmployee({ data: { token } }) });
  return (
    <AdminShell title="Employee verification">
      {q.isLoading ? <p className="text-sm text-muted-foreground">Checking…</p> : null}
      {q.isError ? <p className="text-sm text-destructive">{q.error.message}</p> : null}
      {q.isSuccess && !q.data ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-4 font-semibold text-destructive">INVALID — no employee matches this ID card.</p>
      ) : null}
      {q.data ? (
        <div className="space-y-3 rounded-lg border bg-card p-4 text-sm">
          <div className="flex items-center gap-4">
            {q.data.photo ? <img src={q.data.photo} alt="" className="h-24 w-20 rounded object-cover" /> : null}
            <div>
              <p className="text-lg font-semibold">{q.data.full_name}</p>
              <p className="font-mono">{q.data.employee_code}</p>
              <Badge variant={q.data.status === "active" ? "secondary" : "destructive"} className="mt-1">
                {q.data.status === "active" ? "VALID · ACTIVE" : `NOT ACTIVE · ${q.data.status.toUpperCase()}`}
              </Badge>
            </div>
          </div>
          <p>Designation: {q.data.designation}</p>
          <p>Territory: {q.data.territory}</p>
          <p>Mobile: {q.data.mobile}</p>
          <p>Joined: {q.data.joining_date}</p>
          <p>DOB: {q.data.date_of_birth ?? "—"}</p>
          <p>Address: {q.data.address ?? "—"}</p>
        </div>
      ) : null}
    </AdminShell>
  );
}
