import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RangeFilter, Stat } from "@/components/HqUi";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { formatDateTime, rupees } from "@/lib/format";
import {
  adminAssignDriverPlan,
  adminAssignPortfolio,
  adminCreateEmployee,
  adminDeleteEmployee,
  adminDecideLedger,
  adminEvaluateEvents,
  adminListEmployees,
  adminListLedger,
  adminListPlans,
  adminListRulesTargets,
  adminPerformance,
  adminRecordSalary,
  adminSavePlan,
  adminSaveRule,
  adminSetAcquisition,
  adminSetTarget,
  adminUpdateEmployee,
} from "@/lib/field.functions";

export const Route = createFileRoute("/_authenticated/admin/hq")({
  head: () => ({
    meta: [
      { title: "Founder HQ | Shahin Travels" },
      { name: "description", content: "Manage field employees, portfolios, targets, commissions and performance." },
      { property: "og:title", content: "Founder HQ | Shahin Travels" },
      { property: "og:description", content: "Field employees, portfolios, targets, commissions and performance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Hq,
});

const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
const num = (v: string) => (v.trim() === "" ? null : Number(v));

function Hq() {
  useRoleGuard("admin");
  return (
    <AdminShell title="Founder HQ" subtitle="Field employees, portfolios, targets, commissions and performance.">
      <Tabs defaultValue="employees">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="employees">Field Employees</TabsTrigger>
          <TabsTrigger value="portfolios">Portfolios</TabsTrigger>
          <TabsTrigger value="plans">Driver Plans</TabsTrigger>
          <TabsTrigger value="targets">Targets & Rules</TabsTrigger>
          <TabsTrigger value="commissions">Commissions</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
        </TabsList>
        <TabsContent value="employees"><Employees /></TabsContent>
        <TabsContent value="portfolios"><Portfolios /></TabsContent>
        <TabsContent value="plans"><Plans /></TabsContent>
        <TabsContent value="targets"><TargetsRules /></TabsContent>
        <TabsContent value="commissions"><Commissions /></TabsContent>
        <TabsContent value="performance"><Performance /></TabsContent>
        <TabsContent value="reports"><Reports /></TabsContent>
      </Tabs>
    </AdminShell>
  );
}

function useEmployees() {
  return useQuery({ queryKey: ["hq-employees"], queryFn: () => adminListEmployees() });
}

function EmployeeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const emps = useEmployees();
  return (
    <select className={sel} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select employee</option>
      {emps.data?.filter((e) => e.status === "active").map((e) => (
        <option key={e.id} value={e.id}>{e.full_name || e.mobile} · {e.employee_code}</option>
      ))}
    </select>
  );
}

type Emp = Awaited<ReturnType<typeof adminListEmployees>>[number];

function Employees() {
  const qc = useQueryClient();
  const emps = useEmployees();
  const [editing, setEditing] = useState<Emp | "new" | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => adminDeleteEmployee({ data: { id } }),
    onSuccess: () => { toast.success("Employee deleted."); void qc.invalidateQueries({ queryKey: ["hq-employees"] }); },
    onError: (err) => toast.error(err.message),
  });
  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <p className="text-sm text-muted-foreground">No public signup. The person must first register in the app, then add them here by mobile.</p>
        <Button size="sm" onClick={() => setEditing("new")}>Add employee</Button>
      </div>
      {editing ? (
        <EmployeeForm
          emp={editing === "new" ? null : editing}
          all={emps.data ?? []}
          onDone={() => {
            setEditing(null);
            void qc.invalidateQueries({ queryKey: ["hq-employees"] });
          }}
        />
      ) : null}
      {emps.data?.length === 0 ? <EmptyState title="No field employees" description="Add your first employee." /> : null}
      {emps.data?.map((e) => (
        <article key={e.id} className="rounded-lg border bg-card p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">{e.full_name || "Unnamed"} <span className="font-mono text-xs text-muted-foreground">{e.employee_code}</span></p>
              <p className="text-xs text-muted-foreground">{e.designation} · {e.territory} · {e.mobile} · Salary {rupees(Number(e.monthly_salary))}/mo</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={e.status === "active" ? "secondary" : "destructive"}>{e.status}</Badge>
              {e.can_approve_drivers ? <Badge variant="outline">Can approve drivers</Badge> : null}
              <Button size="sm" variant="outline" onClick={() => setEditing(e)}>Edit</Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={del.isPending}
                onClick={() => {
                  if (window.confirm(`Delete ${e.full_name || "this employee"} (${e.employee_code})? This cannot be undone.`)) del.mutate(e.id);
                }}
              >
                Delete
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <Link to="/admin/verify-employee/$token" params={{ token: e.verification_token }}>ID record</Link>
              </Button>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function EmployeeForm({ emp, all, onDone }: { emp: Emp | null; all: Emp[]; onDone: () => void }) {
  const [f, setF] = useState({
    mobile: emp?.mobile ?? "",
    designation: emp?.designation ?? "Field Growth Executive",
    territory: emp?.territory ?? "",
    reporting_manager_id: emp?.reporting_manager_id ?? "",
    monthly_salary: String(emp?.monthly_salary ?? ""),
    can_approve_drivers: emp?.can_approve_drivers ?? false,
    commission_plan_note: emp?.commission_plan_note ?? "",
    incentives_start_date: emp?.incentives_start_date ?? "",
    status: emp?.status ?? "active",
  });
  const save = useMutation({
    mutationFn: async () => {
      const base = {
        designation: f.designation,
        territory: f.territory,
        reporting_manager_id: f.reporting_manager_id || null,
        monthly_salary: Number(f.monthly_salary || 0),
        can_approve_drivers: f.can_approve_drivers,
        commission_plan_note: f.commission_plan_note || null,
        incentives_start_date: f.incentives_start_date || null,
      };
      if (emp) return adminUpdateEmployee({ data: { ...base, id: emp.id, status: f.status as "active" } });
      return adminCreateEmployee({ data: { ...base, mobile: f.mobile } });
    },
    onSuccess: () => {
      toast.success(emp ? "Employee updated." : "Employee created with a new unique ID.");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: e.target.value });
  return (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2">
      <div><Label>Registered mobile</Label><Input value={f.mobile} onChange={set("mobile")} disabled={!!emp} inputMode="numeric" maxLength={10} /></div>
      <div><Label>Designation</Label><Input value={f.designation} onChange={set("designation")} /></div>
      <div><Label>Territory / Area</Label><Input value={f.territory} onChange={set("territory")} placeholder="e.g. Darbhanga Town" /></div>
      <div><Label>Reporting manager</Label>
        <select className={sel} value={f.reporting_manager_id} onChange={set("reporting_manager_id")}>
          <option value="">None (reports to Founder)</option>
          {all.filter((x) => x.id !== emp?.id).map((x) => <option key={x.id} value={x.id}>{x.full_name || x.mobile} · {x.employee_code}</option>)}
        </select>
      </div>
      <div><Label>Monthly fixed salary (₹)</Label><Input value={f.monthly_salary} onChange={set("monthly_salary")} inputMode="decimal" /></div>
      <div><Label>Incentives start date (baseline)</Label><Input type="date" value={f.incentives_start_date} onChange={set("incentives_start_date")} /></div>
      <div className="sm:col-span-2"><Label>Commission plan note</Label><Input value={f.commission_plan_note} onChange={set("commission_plan_note")} /></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.can_approve_drivers} onChange={(e) => setF({ ...f, can_approve_drivers: e.target.checked })} /> Allowed to approve drivers</label>
      {emp ? (
        <div><Label>Status</Label>
          <select className={sel} value={f.status} onChange={set("status")}>
            {["active", "suspended", "inactive", "exited"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground sm:col-span-2">Blue Verified Tick permission is Founder-only and is never given to employees.</p>
      <div className="flex gap-2 sm:col-span-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

function Portfolios() {
  const [emp, setEmp] = useState("");
  const [mobiles, setMobiles] = useState("");
  const [acq, setAcq] = useState({ mobile: "", emp: "", source: "" });
  const assign = useMutation({
    mutationFn: () =>
      adminAssignPortfolio({ data: { employeeId: emp, mobiles: mobiles.split(/[\s,]+/).filter((m) => /^[6-9]\d{9}$/.test(m)) } }),
    onSuccess: (r) => {
      toast.success(`Assigned ${r.assigned}. ${r.skipped.length ? `Skipped: ${r.skipped.join(", ")}` : ""}`);
      setMobiles("");
    },
    onError: (e) => toast.error(e.message),
  });
  const setAcquisition = useMutation({
    mutationFn: () => adminSetAcquisition({ data: { mobile: acq.mobile, employeeId: acq.emp, source: acq.source || null } }),
    onSuccess: () => toast.success("Original acquirer recorded permanently."),
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="space-y-6">
      <section className="space-y-2 rounded-lg border p-3">
        <h3 className="font-semibold">Assign existing drivers / customers to a portfolio manager</h3>
        <p className="text-xs text-muted-foreground">A baseline snapshot (active status and last-30-day rides) is saved at assignment. Original acquisition credit never changes. Customers are not owned by employees.</p>
        <EmployeeSelect value={emp} onChange={setEmp} />
        <textarea className="min-h-24 w-full rounded-md border bg-background p-2 text-sm" placeholder="Registered mobile numbers, separated by comma or new line" value={mobiles} onChange={(e) => setMobiles(e.target.value)} />
        <Button disabled={!emp || !mobiles.trim() || assign.isPending} onClick={() => assign.mutate()}>Assign / reassign</Button>
      </section>
      <section className="space-y-2 rounded-lg border p-3">
        <h3 className="font-semibold">Record original acquirer (one time, permanent)</h3>
        <Input placeholder="Mobile" value={acq.mobile} onChange={(e) => setAcq({ ...acq, mobile: e.target.value })} />
        <EmployeeSelect value={acq.emp} onChange={(v) => setAcq({ ...acq, emp: v })} />
        <Input placeholder="Source / campaign (optional)" value={acq.source} onChange={(e) => setAcq({ ...acq, source: e.target.value })} />
        <Button disabled={!acq.mobile || !acq.emp} onClick={() => setAcquisition.mutate()}>Save attribution</Button>
      </section>
    </div>
  );
}

function Plans() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["hq-plans"], queryFn: () => adminListPlans() });
  const blank = { name: "", plan_type: "subscription" as "subscription" | "commission", city: "", vehicle_category_id: "", rider_id: "", monthly_fee: "", grace_days: "3", commission_type: "percent" as "percent" | "fixed", commission_value: "", min_commission: "", max_commission: "", effective_from: new Date().toISOString().slice(0, 10), effective_to: "" };
  const [f, setF] = useState(blank);
  const [assign, setAssign] = useState({ mobile: "", planId: "" });
  const save = useMutation({
    mutationFn: () =>
      adminSavePlan({
        data: {
          name: f.name, plan_type: f.plan_type, city: f.city || null, vehicle_category_id: f.vehicle_category_id || null, rider_id: null,
          monthly_fee: f.plan_type === "subscription" ? num(f.monthly_fee) : null, grace_days: Number(f.grace_days || 0),
          commission_type: f.plan_type === "commission" ? f.commission_type : null,
          commission_value: f.plan_type === "commission" ? num(f.commission_value) : null,
          min_commission: num(f.min_commission), max_commission: num(f.max_commission),
          effective_from: f.effective_from, effective_to: f.effective_to || null, is_active: true,
        },
      }),
    onSuccess: () => { toast.success("Plan saved."); setF(blank); void qc.invalidateQueries({ queryKey: ["hq-plans"] }); },
    onError: (e) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: (p: NonNullable<typeof q.data>["plans"][number]) => {
      const { created_at: _a, updated_at: _b, created_by: _c, ...rest } = p;
      return adminSavePlan({ data: { ...rest, monthly_fee: rest.monthly_fee == null ? null : Number(rest.monthly_fee), commission_value: rest.commission_value == null ? null : Number(rest.commission_value), min_commission: rest.min_commission == null ? null : Number(rest.min_commission), max_commission: rest.max_commission == null ? null : Number(rest.max_commission), commission_type: rest.commission_type as "percent" | null, plan_type: rest.plan_type as "subscription", is_active: !p.is_active } });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hq-plans"] }),
    onError: (e) => toast.error(e.message),
  });
  const assignM = useMutation({
    mutationFn: () => adminAssignDriverPlan({ data: { mobile: assign.mobile, planId: assign.planId || null } }),
    onSuccess: () => toast.success("Driver plan updated."),
    onError: (e) => toast.error(e.message),
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-4">
      <section className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
        <h3 className="font-semibold sm:col-span-3">New monetization plan</h3>
        <div><Label>Name</Label><Input value={f.name} onChange={set("name")} /></div>
        <div><Label>Type</Label><select className={sel} value={f.plan_type} onChange={set("plan_type")}><option value="subscription">Subscription</option><option value="commission">Commission per ride</option></select></div>
        <div><Label>City (blank = all)</Label><Input value={f.city} onChange={set("city")} /></div>
        <div><Label>Vehicle category</Label><select className={sel} value={f.vehicle_category_id} onChange={set("vehicle_category_id")}><option value="">All</option>{q.data?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        {f.plan_type === "subscription" ? (
          <>
            <div><Label>Monthly fee (₹)</Label><Input value={f.monthly_fee} onChange={set("monthly_fee")} inputMode="decimal" /></div>
            <div><Label>Grace days</Label><Input value={f.grace_days} onChange={set("grace_days")} inputMode="numeric" /></div>
          </>
        ) : (
          <>
            <div><Label>Commission type</Label><select className={sel} value={f.commission_type} onChange={set("commission_type")}><option value="percent">% of fare</option><option value="fixed">Fixed ₹ per ride</option></select></div>
            <div><Label>Value</Label><Input value={f.commission_value} onChange={set("commission_value")} inputMode="decimal" /></div>
            <div><Label>Min ₹ (optional)</Label><Input value={f.min_commission} onChange={set("min_commission")} /></div>
            <div><Label>Max ₹ (optional)</Label><Input value={f.max_commission} onChange={set("max_commission")} /></div>
          </>
        )}
        <div><Label>Effective from</Label><Input type="date" value={f.effective_from} onChange={set("effective_from")} /></div>
        <div><Label>Effective to</Label><Input type="date" value={f.effective_to} onChange={set("effective_to")} /></div>
        <div className="sm:col-span-3"><Button disabled={!f.name || save.isPending} onClick={() => save.mutate()}>Save plan</Button></div>
      </section>
      <section className="space-y-2 rounded-lg border p-3">
        <h3 className="font-semibold">Put a driver on a plan</h3>
        <p className="text-xs text-muted-foreground">Commission plan lets the driver go online without a monthly subscription; a commission entry is recorded on each completed ride. Subscription drivers keep using the existing cash subscription flow.</p>
        <Input placeholder="Driver mobile" value={assign.mobile} onChange={(e) => setAssign({ ...assign, mobile: e.target.value })} />
        <select className={sel} value={assign.planId} onChange={(e) => setAssign({ ...assign, planId: e.target.value })}>
          <option value="">No plan (default subscription)</option>
          {q.data?.plans.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name} · {p.plan_type}</option>)}
        </select>
        <Button disabled={!assign.mobile} onClick={() => assignM.mutate()}>Apply</Button>
      </section>
      {q.data?.plans.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-card p-3 text-sm">
          <div>
            <p className="font-semibold">{p.name} <Badge variant="outline">{p.plan_type}</Badge></p>
            <p className="text-xs text-muted-foreground">
              {p.plan_type === "subscription" ? `${rupees(Number(p.monthly_fee ?? 0))}/month · ${p.grace_days} grace days` : `${p.commission_type === "percent" ? `${p.commission_value}%` : rupees(Number(p.commission_value ?? 0))} per ride${p.min_commission != null ? ` · min ${rupees(Number(p.min_commission))}` : ""}${p.max_commission != null ? ` · max ${rupees(Number(p.max_commission))}` : ""}`}
              {" · "}{p.city || "All cities"} · from {p.effective_from}{p.effective_to ? ` to ${p.effective_to}` : ""}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => toggle.mutate(p)}>{p.is_active ? "Deactivate" : "Activate"}</Button>
        </div>
      ))}
    </div>
  );
}

const EVENT_LABELS: Record<string, string> = {
  new_driver: "New driver (approved)",
  qualified_driver: "Qualified driver",
  new_customer: "New customer",
  qualified_customer: "Qualified customer (first completed ride)",
  driver_renewal: "Driver renewal (portfolio)",
  customer_reactivation: "Customer reactivation",
  performance_bonus: "Ride/portfolio performance bonus",
  target_bonus: "Target bonus",
  quality_bonus: "Quality/compliance bonus",
};
const METRICS = ["new_drivers", "qualified_drivers", "new_customers", "qualified_customers", "renewals", "reactivations", "completed_rides", "portfolio_active"] as const;

function TargetsRules() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["hq-rules"], queryFn: () => adminListRulesTargets() });
  const emps = useEmployees();
  const [r, setR] = useState({ event_type: "qualified_driver" as keyof typeof EVENT_LABELS, amount: "", min_completed_rides: "0", require_kyc: true, require_monetization: true, dormant_days: "30", territory: "" });
  const [t, setT] = useState({ employeeId: "", month: new Date().toISOString().slice(0, 7), metric: "new_drivers" as (typeof METRICS)[number], target_value: "", slabs: "" });
  const saveRule = useMutation({
    mutationFn: () => adminSaveRule({ data: { event_type: r.event_type as "new_driver", amount: Number(r.amount), min_completed_rides: Number(r.min_completed_rides), require_kyc: r.require_kyc, require_monetization: r.require_monetization, dormant_days: Number(r.dormant_days), territory: r.territory || null, is_active: true } }),
    onSuccess: () => { toast.success("Rule saved."); void qc.invalidateQueries({ queryKey: ["hq-rules"] }); },
    onError: (e) => toast.error(e.message),
  });
  const toggleRule = useMutation({
    mutationFn: (x: NonNullable<typeof q.data>["rules"][number]) => adminSaveRule({ data: { id: x.id, event_type: x.event_type as "new_driver", amount: Number(x.amount), min_completed_rides: x.min_completed_rides, require_kyc: x.require_kyc, require_monetization: x.require_monetization, dormant_days: x.dormant_days, territory: x.territory, is_active: !x.is_active } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hq-rules"] }),
  });
  const saveTarget = useMutation({
    mutationFn: () => adminSetTarget({ data: { employeeId: t.employeeId, month: t.month, metric: t.metric, target_value: Number(t.target_value), slabs: t.slabs.split(",").map((s) => s.trim()).filter(Boolean).map((s) => { const [p, b] = s.split(":"); return { percent: Number(p), bonus: Number(b) }; }) } }),
    onSuccess: () => { toast.success("Target saved."); void qc.invalidateQueries({ queryKey: ["hq-rules"] }); },
    onError: (e) => toast.error(e.message),
  });
  const empName = (id: string) => emps.data?.find((e) => e.id === id)?.full_name ?? id.slice(0, 8);
  return (
    <div className="space-y-4">
      <section className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
        <h3 className="font-semibold sm:col-span-3">Compensation rule (paid only on qualified events)</h3>
        <div className="sm:col-span-2"><Label>Event</Label><select className={sel} value={r.event_type} onChange={(e) => setR({ ...r, event_type: e.target.value as "new_driver" })}>{Object.entries(EVENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div><Label>Amount (₹)</Label><Input value={r.amount} onChange={(e) => setR({ ...r, amount: e.target.value })} inputMode="decimal" /></div>
        <div><Label>Min completed rides</Label><Input value={r.min_completed_rides} onChange={(e) => setR({ ...r, min_completed_rides: e.target.value })} /></div>
        <div><Label>Dormant days (reactivation)</Label><Input value={r.dormant_days} onChange={(e) => setR({ ...r, dormant_days: e.target.value })} /></div>
        <div><Label>Territory (blank = all)</Label><Input value={r.territory} onChange={(e) => setR({ ...r, territory: e.target.value })} /></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={r.require_kyc} onChange={(e) => setR({ ...r, require_kyc: e.target.checked })} /> Require KYC + vehicle</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={r.require_monetization} onChange={(e) => setR({ ...r, require_monetization: e.target.checked })} /> Require subscription/commission active</label>
        <div className="sm:col-span-3"><Button disabled={!r.amount} onClick={() => saveRule.mutate()}>Save rule</Button></div>
      </section>
      {q.data?.rules.map((x) => (
        <div key={x.id} className="flex items-center justify-between rounded border p-2 text-sm">
          <span>{EVENT_LABELS[x.event_type]} · {rupees(Number(x.amount))} · min rides {x.min_completed_rides}{x.require_kyc ? " · KYC" : ""}{x.require_monetization ? " · plan active" : ""}{x.territory ? ` · ${x.territory}` : ""}</span>
          <Button size="sm" variant="outline" onClick={() => toggleRule.mutate(x)}>{x.is_active ? "Disable" : "Enable"}</Button>
        </div>
      ))}
      <section className="grid gap-2 rounded-lg border p-3 sm:grid-cols-3">
        <h3 className="font-semibold sm:col-span-3">Monthly target</h3>
        <div><Label>Employee</Label><EmployeeSelect value={t.employeeId} onChange={(v) => setT({ ...t, employeeId: v })} /></div>
        <div><Label>Month</Label><Input type="month" value={t.month} onChange={(e) => setT({ ...t, month: e.target.value })} /></div>
        <div><Label>Metric</Label><select className={sel} value={t.metric} onChange={(e) => setT({ ...t, metric: e.target.value as "new_drivers" })}>{METRICS.map((m) => <option key={m} value={m}>{m.replace(/_/g, " ")}</option>)}</select></div>
        <div><Label>Target</Label><Input value={t.target_value} onChange={(e) => setT({ ...t, target_value: e.target.value })} inputMode="numeric" /></div>
        <div className="sm:col-span-2"><Label>Slabs & accelerators (percent:bonus, e.g. 80:500, 100:1500, 120:3000)</Label><Input value={t.slabs} onChange={(e) => setT({ ...t, slabs: e.target.value })} /></div>
        <div className="sm:col-span-3"><Button disabled={!t.employeeId || !t.target_value} onClick={() => saveTarget.mutate()}>Save target</Button></div>
      </section>
      {q.data?.targets.map((x) => (
        <div key={x.id} className="rounded border p-2 text-sm">{empName(x.employee_id)} · {x.month.slice(0, 7)} · {x.metric.replace(/_/g, " ")}: {x.target_value} {Array.isArray(x.slabs) && x.slabs.length ? `· slabs ${JSON.stringify(x.slabs)}` : ""}</div>
      ))}
    </div>
  );
}

function Commissions() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["hq-ledger"], queryFn: () => adminListLedger() });
  const [sal, setSal] = useState({ employeeId: "", amount: "", type: "employee_salary" as "employee_salary" | "employee_bonus", note: "" });
  const evaluate = useMutation({
    mutationFn: () => adminEvaluateEvents(),
    onSuccess: (r) => { toast.success(`${r.created} new qualified event(s) found.`); void qc.invalidateQueries({ queryKey: ["hq-ledger"] }); },
    onError: (e) => toast.error(e.message),
  });
  const decide = useMutation({
    mutationFn: (v: { id: string; status: "approved" | "paid" | "rejected" | "collected" }) => {
      const reference = v.status === "paid" || v.status === "collected" ? window.prompt("Payment reference / UTR") : null;
      return adminDecideLedger({ data: { ...v, reference } });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hq-ledger"] }),
    onError: (e) => toast.error(e.message),
  });
  const salary = useMutation({
    mutationFn: () => adminRecordSalary({ data: { employeeId: sal.employeeId, amount: Number(sal.amount), type: sal.type, note: sal.note } }),
    onSuccess: () => { toast.success("Recorded for approval."); void qc.invalidateQueries({ queryKey: ["hq-ledger"] }); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => evaluate.mutate()} disabled={evaluate.isPending}>{evaluate.isPending ? "Checking…" : "Check qualified events now"}</Button>
        <span className="text-xs text-muted-foreground">Creates pending commissions only for events meeting your rules. Each event is paid once.</span>
      </div>
      <section className="grid gap-2 rounded-lg border p-3 sm:grid-cols-4">
        <EmployeeSelect value={sal.employeeId} onChange={(v) => setSal({ ...sal, employeeId: v })} />
        <select className={sel} value={sal.type} onChange={(e) => setSal({ ...sal, type: e.target.value as "employee_salary" })}><option value="employee_salary">Salary</option><option value="employee_bonus">Bonus</option></select>
        <Input placeholder="Amount ₹" value={sal.amount} onChange={(e) => setSal({ ...sal, amount: e.target.value })} />
        <Input placeholder="Note (e.g. Oct 2026 salary)" value={sal.note} onChange={(e) => setSal({ ...sal, note: e.target.value })} />
        <Button className="sm:col-span-4" disabled={!sal.employeeId || !sal.amount || !sal.note} onClick={() => salary.mutate()}>Record salary / bonus</Button>
      </section>
      <p className="text-xs text-muted-foreground">Ledger entries cannot be edited or deleted. Amounts are permanent; only status moves forward with your approval.</p>
      {q.data?.ledger.length === 0 ? <EmptyState title="No transactions yet" description="Commissions, salaries and ride commissions will appear here." /> : null}
      {q.data?.ledger.map((l) => (
        <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded border bg-card p-2 text-sm">
          <div>
            <p className="font-medium">{l.txn_type.replace(/_/g, " ")} · {rupees(Number(l.amount))} <Badge variant="outline">{l.status}</Badge></p>
            <p className="text-xs text-muted-foreground">{formatDateTime(l.created_at)} · {l.user_label} · Ref {l.reference ?? "—"} · {l.note ?? ""}{l.approved_at ? ` · decided ${formatDateTime(l.approved_at)}` : ""}</p>
          </div>
          {["pending", "approved"].includes(l.status) ? (
            <div className="flex gap-1">
              {l.status === "pending" ? <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: l.id, status: "approved" })}>Approve</Button> : null}
              <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: l.id, status: l.txn_type === "ride_commission" ? "collected" : "paid" })}>{l.txn_type === "ride_commission" ? "Collected" : "Paid"}</Button>
              <Button size="sm" variant="ghost" onClick={() => decide.mutate({ id: l.id, status: "rejected" })}>Reject</Button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function rangeFor(kind: string, custom: { from: string; to: string }) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = now.toISOString();
  if (kind === "today") return { from: start.toISOString(), to: end };
  if (kind === "7d") return { from: new Date(start.getTime() - 6 * 864e5).toISOString(), to: end };
  if (kind === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), to: end };
  if (kind === "last") return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString(), to: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
  return { from: new Date(`${custom.from}T00:00:00`).toISOString(), to: new Date(`${custom.to}T23:59:59`).toISOString() };
}

function Performance() {
  const emps = useEmployees();
  const [kind, setKind] = useState("month");
  const d = new Date().toISOString().slice(0, 10);
  const [custom, setCustom] = useState({ from: d, to: d });
  const [territory, setTerritory] = useState("");
  const range = useMemo(() => rangeFor(kind, custom), [kind, custom]);
  const q = useQuery({ queryKey: ["hq-perf", range, territory], queryFn: () => adminPerformance({ data: { ...range, territory: territory || null } }) });
  const territories = [...new Set((emps.data ?? []).map((e) => e.territory))];
  return (
    <div className="space-y-3">
      <RangeFilter kind={kind} setKind={setKind} custom={custom} setCustom={setCustom} />
      <select className={`${sel} max-w-xs`} value={territory} onChange={(e) => setTerritory(e.target.value)}>
        <option value="">All territories</option>
        {territories.map((t) => <option key={t}>{t}</option>)}
      </select>
      {q.isError ? <p className="text-sm text-destructive">{q.error.message}</p> : null}
      {q.data?.length === 0 ? <EmptyState title="No employees" description="Add field employees to see performance." /> : null}
      {q.data?.map((m, i) => (
        <article key={m.employeeId} className="rounded-lg border bg-card p-3 text-sm">
          <div className="mb-2 flex items-center justify-between">
            <p className="font-semibold">#{i + 1} {m.name || "—"} <span className="font-mono text-xs text-muted-foreground">{m.employeeCode}</span> · {m.territory}</p>
            <Badge>Score {m.score}</Badge>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
            <Stat l="Drivers added" v={m.driversAdded} /><Stat l="Qualified drivers" v={m.qualifiedDrivers} />
            <Stat l="Active drivers" v={`${m.activeDrivers} (base ${m.baseline.activeDrivers})`} /><Stat l="Customers added" v={m.customersAdded} />
            <Stat l="Qualified customers" v={m.qualifiedCustomers} /><Stat l="Customers who booked" v={m.customersBooked} />
            <Stat l="Completed rides" v={m.completedRides} /><Stat l="Repeat customers" v={m.repeatCustomers} />
            <Stat l="Driver renewals" v={m.renewals} /><Stat l="Subscription collection" v={rupees(m.subscriptionCollection)} />
            <Stat l="Commission generated" v={rupees(m.commissionGenerated)} /><Stat l="Target achievement" v={m.achievement == null ? "No target" : `${m.achievement}%`} />
            <Stat l="Salary" v={rupees(m.salary)} /><Stat l="Commission earned" v={rupees(m.commissionEarned)} />
            <Stat l="Total employee cost" v={rupees(m.totalCost)} /><Stat l="Reactivated" v={m.reactivated} />
          </div>
        </article>
      ))}
    </div>
  );
}

function Reports() {
  const q = useQuery({ queryKey: ["hq-ledger"], queryFn: () => adminListLedger() });
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Blue Verified Tick audit</h3>
      <p className="text-xs text-muted-foreground">Only the Founder can grant or remove the tick. Every change is logged automatically.</p>
      {q.data?.tickAudit.length === 0 ? <EmptyState title="No tick changes yet" description="Grants and removals will appear here." /> : null}
      {q.data?.tickAudit.map((a) => (
        <div key={a.id} className="rounded border p-2 text-sm">
          {formatDateTime(a.created_at)} · {a.new_value ? "Granted" : "Removed"} for {a.driver_label} · by {a.actor_label}
        </div>
      ))}
    </div>
  );
}
