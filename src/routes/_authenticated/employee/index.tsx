import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmployeeShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime, rupees } from "@/lib/format";
import { employeeApproveDriver, employeeDashboard, employeeTagAcquisition } from "@/lib/field.functions";
import { RangeFilter, Stat } from "@/routes/_authenticated/admin/hq";

export const Route = createFileRoute("/_authenticated/employee/")({
  head: () => ({
    meta: [
      { title: "Field Employee Dashboard | Shahin Travels" },
      { name: "description", content: "Your drivers, customers, renewals, targets, earnings and performance." },
      { property: "og:title", content: "Field Employee Dashboard | Shahin Travels" },
      { property: "og:description", content: "Your drivers, customers, renewals, targets and earnings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmployeeHome,
});

function range(kind: string, c: { from: string; to: string }) {
  const now = new Date();
  const s = new Date(now);
  s.setHours(0, 0, 0, 0);
  if (kind === "today") return { from: s.toISOString(), to: now.toISOString() };
  if (kind === "7d") return { from: new Date(s.getTime() - 6 * 864e5).toISOString(), to: now.toISOString() };
  if (kind === "last") return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(), to: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
  if (kind === "custom") return { from: new Date(`${c.from}T00:00:00`).toISOString(), to: new Date(`${c.to}T23:59:59`).toISOString() };
  return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: now.toISOString() };
}

function EmployeeHome() {
  const qc = useQueryClient();
  const [kind, setKind] = useState("month");
  const d = new Date().toISOString().slice(0, 10);
  const [custom, setCustom] = useState({ from: d, to: d });
  const r = useMemo(() => range(kind, custom), [kind, custom]);
  const q = useQuery({ queryKey: ["emp-dash", r], queryFn: () => employeeDashboard({ data: r }) });
  const [tag, setTag] = useState({ mobile: "", source: "" });
  const tagM = useMutation({
    mutationFn: () => employeeTagAcquisition({ data: { mobile: tag.mobile, source: tag.source || null } }),
    onSuccess: () => { toast.success("Registration linked to you."); setTag({ mobile: "", source: "" }); void qc.invalidateQueries({ queryKey: ["emp-dash"] }); },
    onError: (e) => toast.error(e.message),
  });
  const approve = useMutation({
    mutationFn: (riderId: string) => employeeApproveDriver({ data: { riderId } }),
    onSuccess: () => { toast.success("Driver approved. They can now go online."); void qc.invalidateQueries({ queryKey: ["emp-dash"] }); },
    onError: (e) => toast.error(e.message),
  });

  if (q.isError) return <EmployeeShell title="Field Dashboard"><p className="text-sm text-destructive">{q.error.message}</p></EmployeeShell>;
  const data = q.data;
  const m = data?.metrics;
  const drivers = data?.people.filter((p) => p.isDriver) ?? [];
  const customers = data?.people.filter((p) => !p.isDriver) ?? [];
  const todayStr = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

  return (
    <EmployeeShell title="Field Dashboard" subtitle={data ? `${data.employee.code} · ${data.employee.territory}` : undefined}>
      <div className="space-y-4">
        <RangeFilter kind={kind} setKind={setKind} custom={custom} setCustom={setCustom} />
        <section className="space-y-2 rounded-lg border p-3">
          <h3 className="text-sm font-semibold">Link a new registration you assisted</h3>
          <p className="text-xs text-muted-foreground">Register the driver/customer in the app first (within 3 days, no rides yet), then link it here.</p>
          <div className="flex flex-wrap gap-2">
            <Input className="max-w-[10rem]" placeholder="Mobile" inputMode="numeric" maxLength={10} value={tag.mobile} onChange={(e) => setTag({ ...tag, mobile: e.target.value })} />
            <Input className="max-w-[12rem]" placeholder="Source / campaign" value={tag.source} onChange={(e) => setTag({ ...tag, source: e.target.value })} />
            <Button disabled={tag.mobile.length !== 10 || tagM.isPending} onClick={() => tagM.mutate()}>Link</Button>
          </div>
        </section>
        <Tabs defaultValue="drivers">
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="drivers">My Drivers</TabsTrigger>
            <TabsTrigger value="customers">My Customers</TabsTrigger>
            <TabsTrigger value="renewals">Renewals</TabsTrigger>
            <TabsTrigger value="targets">Targets</TabsTrigger>
            <TabsTrigger value="earnings">Earnings</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
          </TabsList>
          <TabsContent value="drivers" className="space-y-2">
            {drivers.length === 0 ? <EmptyState title="No drivers yet" description="Drivers you add or are assigned will appear here." /> : null}
            {drivers.map((p) => {
              const dd = p.driver;
              const active = dd?.is_approved && !dd.is_blocked && (dd.commission_plan_active || (dd.subscription_valid_until ?? "") >= todayStr);
              return (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-card p-2 text-sm">
                  <div>
                    <p className="font-medium">{p.name || "—"} · {p.mobile}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.acquiredByMe ? "Acquired by you" : ""}{p.acquiredByMe && p.inPortfolio ? " · " : ""}{p.inPortfolio ? "Your portfolio" : ""}
                      {" · "}{dd?.commission_plan_active ? "Commission plan" : `Subscription till ${dd?.subscription_valid_until ?? "—"}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={active ? "secondary" : "outline"}>{!dd?.is_approved ? "Pending approval" : active ? (dd.is_online ? "Online" : "Active") : "Expired"}</Badge>
                    {!dd?.is_approved && data?.employee.canApprove ? (
                      <Button size="sm" onClick={() => approve.mutate(p.id)} disabled={approve.isPending}>Approve</Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </TabsContent>
          <TabsContent value="customers" className="space-y-2">
            {customers.length === 0 ? <EmptyState title="No customers yet" description="Customers you add or are assigned will appear here." /> : null}
            {customers.map((p) => (
              <div key={p.id} className="rounded border bg-card p-2 text-sm">
                <p className="font-medium">{p.name || "—"} · {p.mobile}</p>
                <p className="text-xs text-muted-foreground">Joined {formatDateTime(p.joined)} · {p.acquiredByMe ? "Acquired by you" : "Assigned (service only)"}</p>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="renewals" className="space-y-2">
            {drivers.filter((p) => !p.driver?.commission_plan_active && p.driver?.is_approved && (p.driver?.subscription_valid_until ?? "") <= soon).map((p) => (
              <div key={p.id} className="flex justify-between rounded border bg-card p-2 text-sm">
                <span>{p.name || "—"} · {p.mobile}</span>
                <Badge variant={(p.driver?.subscription_valid_until ?? "") < todayStr ? "destructive" : "outline"}>
                  {(p.driver?.subscription_valid_until ?? "") < todayStr ? "Expired" : "Due"} {p.driver?.subscription_valid_until ?? ""}
                </Badge>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Renewals recorded in this period: {m?.renewals ?? 0}</p>
          </TabsContent>
          <TabsContent value="targets" className="space-y-2">
            {m?.targets.length ? m.targets.map((t) => (
              <div key={t.metric} className="rounded border bg-card p-2 text-sm">
                <div className="flex justify-between"><span>{t.metric.replace(/_/g, " ")}</span><span>{t.actual} / {t.target}</span></div>
                <div className="mt-1 h-2 rounded bg-muted"><div className="h-2 rounded bg-primary" style={{ width: `${Math.min(100, (t.actual / t.target) * 100)}%` }} /></div>
              </div>
            )) : <EmptyState title="No targets this month" description="HQ will set your monthly targets." />}
          </TabsContent>
          <TabsContent value="earnings" className="space-y-2">
            <Stat l="Fixed monthly salary" v={rupees(data?.employee.salary ?? 0)} />
            <Stat l="Commission earned (period)" v={rupees(m?.commissionEarned ?? 0)} />
            {data?.earnings.map((e) => (
              <div key={e.id} className="flex justify-between rounded border bg-card p-2 text-sm">
                <span>{e.txn_type.replace("employee_", "")} · {e.note ?? ""}<span className="block text-xs text-muted-foreground">{formatDateTime(e.created_at)} · {e.reference ?? ""}</span></span>
                <span className="text-right">{rupees(Number(e.amount))}<Badge variant="outline" className="ml-2">{e.status}</Badge></span>
              </div>
            ))}
          </TabsContent>
          <TabsContent value="performance">
            {m ? (
              <div className="grid grid-cols-1 gap-x-4 text-sm sm:grid-cols-2">
                <Stat l="Assigned drivers" v={m.assignedDrivers} /><Stat l="Active drivers" v={`${m.activeDrivers} (baseline ${m.baseline.activeDrivers})`} />
                <Stat l="Expired drivers" v={m.expiredDrivers} /><Stat l="Online now" v={m.onlineDrivers} />
                <Stat l="Assigned customers" v={m.assignedCustomers} /><Stat l="Active customers (30d)" v={`${m.activeCustomers} (baseline ${m.baseline.activeCustomers})`} />
                <Stat l="Dormant customers" v={m.dormantCustomers} /><Stat l="Reactivated" v={m.reactivated} />
                <Stat l="Completed rides" v={m.completedRides} /><Stat l="Repeat customers" v={m.repeatCustomers} />
                <Stat l="Customers who booked" v={m.customersBooked} /><Stat l="Qualified drivers" v={m.qualifiedDrivers} />
                <Stat l="Qualified customers" v={m.qualifiedCustomers} /><Stat l="Performance score" v={m.score} />
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </div>
    </EmployeeShell>
  );
}
