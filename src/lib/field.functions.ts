import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type Ctx = { supabase: SupabaseClient<Database>; userId: string };
type Admin = SupabaseClient<Database>;

const uuid = z.string().uuid();
const today = () => new Date().toISOString().slice(0, 10);

/** Founder / Super Admin only. Employees never hold the admin role. */
async function requireFounder(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!data) throw new Error("Founder access required.");
}

async function requireEmployee(ctx: Ctx) {
  const { data } = await ctx.supabase
    .from("field_employees")
    .select("*")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!data) throw new Error("Field employee access required.");
  if (data.status !== "active") throw new Error("Your employee account is not active.");
  return data;
}

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function rolesOf(db: Admin, ids: string[]) {
  const map = new Map<string, Set<string>>();
  if (!ids.length) return map;
  const { data } = await db.from("user_roles").select("user_id, role").in("user_id", ids);
  for (const r of data ?? []) {
    const s = map.get(r.user_id) ?? new Set<string>();
    s.add(r.role);
    map.set(r.user_id, s);
  }
  return map;
}

function driverActive(rd: {
  is_approved: boolean;
  is_blocked: boolean;
  subscription_valid_until: string | null;
  commission_plan_active: boolean;
} | undefined) {
  if (!rd || !rd.is_approved || rd.is_blocked) return false;
  return rd.commission_plan_active || (!!rd.subscription_valid_until && rd.subscription_valid_until >= today());
}

/* ============================== FOUNDER: EMPLOYEES ============================== */

export const adminListEmployees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFounder(context);
    const db = await admin();
    const { data: emps, error } = await db
      .from("field_employees")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const ids = (emps ?? []).map((e) => e.user_id);
    const { data: profiles } = ids.length
      ? await db.from("profiles").select("id, full_name, mobile, photo_url").in("id", ids)
      : { data: [] };
    const pm = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (emps ?? []).map((e) => ({
      ...e,
      full_name: pm.get(e.user_id)?.full_name ?? "",
      mobile: pm.get(e.user_id)?.mobile ?? "",
    }));
  });

export const adminFindUserByMobile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ mobile: z.string().regex(/^[6-9]\d{9}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireFounder(context);
    const db = await admin();
    const { data: p } = await db
      .from("profiles")
      .select("id, full_name, mobile, acquired_by_employee_id, portfolio_manager_id, created_at")
      .eq("mobile", data.mobile)
      .maybeSingle();
    if (!p) return null;
    const roles = await rolesOf(db, [p.id]);
    return { ...p, roles: [...(roles.get(p.id) ?? [])] };
  });

const employeeFields = z.object({
  designation: z.string().trim().min(2).max(60),
  territory: z.string().trim().min(2).max(80),
  reporting_manager_id: uuid.nullable(),
  monthly_salary: z.number().min(0).max(10_000_000),
  can_approve_drivers: z.boolean(),
  commission_plan_note: z.string().max(500).nullable(),
  incentives_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

export const adminCreateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    employeeFields.extend({ mobile: z.string().regex(/^[6-9]\d{9}$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireFounder(context);
    const db = await admin();
    const { data: p } = await db.from("profiles").select("id").eq("mobile", data.mobile).maybeSingle();
    if (!p) throw new Error("No Shahin Travels account with this mobile. Ask the person to register in the app first.");
    const roles = await rolesOf(db, [p.id]);
    if (roles.get(p.id)?.has("admin")) throw new Error("Founder/admin accounts cannot be field employees.");
    const { mobile: _m, ...fields } = data;
    const { data: row, error } = await db
      .from("field_employees")
      .insert({ ...fields, user_id: p.id, employee_code: "pending", created_by: context.userId })
      .select("id, employee_code")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("This person is already a field employee.");
      throw new Error(error.message);
    }
    await db.from("admin_audit_logs").insert({
      actor_id: context.userId,
      action: "employee_created",
      target_type: "field_employees",
      target_id: row.id,
      details: { employee_code: row.employee_code, territory: data.territory },
    });
    return row;
  });

export const adminUpdateEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    employeeFields
      .extend({ id: uuid, status: z.enum(["active", "suspended", "inactive", "exited"]) })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireFounder(context);
    const db = await admin();
    const { id, ...fields } = data;
    if (fields.reporting_manager_id === id) throw new Error("An employee cannot report to themselves.");
    const { error } = await db.from("field_employees").update(fields).eq("id", id);
    if (error) throw new Error(error.message);
    await db.from("admin_audit_logs").insert({
      actor_id: context.userId,
      action: "employee_updated",
      target_type: "field_employees",
      target_id: id,
      details: fields,
    });
    return { ok: true };
  });

/** Founder deletes an employee. Blocked when money/acquisition history exists (use "exited" instead). */
export const adminDeleteEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireFounder(context);
    const db = await admin();
    const id = data.id;
    const [led, ev, acq] = await Promise.all([
      db.from("financial_ledger").select("id", { count: "exact", head: true }).eq("employee_id", id),
      db.from("employee_qualified_events").select("id", { count: "exact", head: true }).eq("employee_id", id),
      db.from("profiles").select("id", { count: "exact", head: true }).eq("acquired_by_employee_id", id),
    ]);
    if ((led.count ?? 0) + (ev.count ?? 0) + (acq.count ?? 0) > 0) {
      throw new Error("This employee has salary/commission or acquisition history, so they cannot be deleted. Set status to Exited instead.");
    }
    const { data: emp } = await db.from("field_employees").select("*").eq("id", id).single();
    if (!emp) throw new Error("Employee not found.");
    await db.from("profiles").update({ portfolio_manager_id: null }).eq("portfolio_manager_id", id);
    await db.from("field_employees").update({ reporting_manager_id: null }).eq("reporting_manager_id", id);
    await db.from("portfolio_assignments").delete().eq("employee_id", id);
    await db.from("employee_targets").delete().eq("employee_id", id);
    const { error } = await db.from("field_employees").delete().eq("id", id);
    if (error) throw new Error(error.message);
    await db.from("admin_audit_logs").insert({
      actor_id: context.userId,
      action: "employee_deleted",
      target_type: "field_employees",
      target_id: id,
      details: { employee_code: emp.employee_code, user_id: emp.user_id },
    });
    return { ok: true };
  });

/** Founder verifies an employee QR. */
export const adminVerifyEmployee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await requireFounder(context);
    const db = await admin();
    const { data: e } = await db
      .from("field_employees")
      .select("*")
      .eq("verification_token", data.token)
      .maybeSingle();
    if (!e) return null;
    const { data: p } = await db
      .from("profiles")
      .select("full_name, mobile, photo_url, address, date_of_birth")
      .eq("id", e.user_id)
      .maybeSingle();
    let photo: string | null = null;
    if (p?.photo_url) {
      photo = p.photo_url.startsWith("http")
        ? p.photo_url
        : ((await db.storage.from("profile-photos").createSignedUrl(p.photo_url, 600)).data?.signedUrl ?? null);
    }
    return { ...e, ...p, photo };
  });

/* ============================== FOUNDER: PORTFOLIOS ============================== */

export const adminAssignPortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employeeId: uuid, mobiles: z.array(z.string().regex(/^[6-9]\d{9}$/)).min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireFounder(context);
    const db = await admin();
    const { data: emp } = await db.from("field_employees").select("id, status").eq("id", data.employeeId).single();
    if (!emp || emp.status !== "active") throw new Error("Employee is not active.");
    const { data: profiles } = await db.from("profiles").select("id, mobile").in("mobile", data.mobiles);
    const found = profiles ?? [];
    const ids = found.map((p) => p.id);
    const roles = await rolesOf(db, ids);
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const [{ data: rides }, { data: rds }] = await Promise.all([
      ids.length
        ? db
            .from("rides")
            .select("customer_id, rider_id")
            .eq("status", "completed")
            .gte("completed_at", since)
            .or(`customer_id.in.(${ids.join(",")}),rider_id.in.(${ids.join(",")})`)
        : Promise.resolve({ data: [] as { customer_id: string; rider_id: string | null }[] }),
      ids.length
        ? db
            .from("rider_details")
            .select("user_id, is_approved, is_blocked, subscription_valid_until, commission_plan_active")
            .in("user_id", ids)
        : Promise.resolve({ data: [] as never[] }),
    ]);
    const rdMap = new Map((rds ?? []).map((r) => [r.user_id, r]));
    let assigned = 0;
    const skipped: string[] = data.mobiles.filter((m) => !found.some((p) => p.mobile === m));
    for (const p of found) {
      const r = roles.get(p.id);
      if (!r || r.has("admin")) {
        skipped.push(p.mobile);
        continue;
      }
      const type = r.has("rider") ? "driver" : "customer";
      const count = (rides ?? []).filter((x) =>
        type === "driver" ? x.rider_id === p.id : x.customer_id === p.id,
      ).length;
      const rd = rdMap.get(p.id);
      await db
        .from("portfolio_assignments")
        .update({ ended_at: new Date().toISOString() })
        .eq("user_id", p.id)
        .is("ended_at", null);
      await db.from("portfolio_assignments").insert({
        user_id: p.id,
        subject_type: type,
        employee_id: data.employeeId,
        assigned_by: context.userId,
        baseline_rides_30d: count,
        baseline_active: type === "driver" ? driverActive(rd) : count > 0,
        baseline_subscription_until: rd?.subscription_valid_until ?? null,
      });
      await db.from("profiles").update({ portfolio_manager_id: data.employeeId }).eq("id", p.id);
      assigned++;
    }
    await db.from("admin_audit_logs").insert({
      actor_id: context.userId,
      action: "portfolio_assigned",
      target_type: "field_employees",
      target_id: data.employeeId,
      details: { assigned, skipped },
    });
    return { assigned, skipped };
  });

/** Founder sets the original acquirer once (permanent). */
export const adminSetAcquisition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ mobile: z.string().regex(/^[6-9]\d{9}$/), employeeId: uuid, source: z.string().max(80).nullable() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireFounder(context);
    const db = await admin();
    const [{ data: p }, { data: e }] = await Promise.all([
      db.from("profiles").select("id, acquired_by_employee_id, created_at").eq("mobile", data.mobile).maybeSingle(),
      db.from("field_employees").select("id, territory").eq("id", data.employeeId).single(),
    ]);
    if (!p) throw new Error("Account not found.");
    if (p.acquired_by_employee_id) throw new Error("Acquisition is already recorded and cannot be changed.");
    const { error } = await db
      .from("profiles")
      .update({
        acquired_by_employee_id: e!.id,
        acquisition_date: p.created_at,
        acquisition_territory: e!.territory,
        acquisition_source: data.source,
      })
      .eq("id", p.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================== FOUNDER: PLANS ============================== */

const planInput = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(2).max(80),
  plan_type: z.enum(["subscription", "commission"]),
  city: z.string().max(80).nullable(),
  vehicle_category_id: uuid.nullable(),
  rider_id: uuid.nullable(),
  monthly_fee: z.number().min(0).nullable(),
  grace_days: z.number().int().min(0).max(60),
  commission_type: z.enum(["percent", "fixed"]).nullable(),
  commission_value: z.number().min(0).nullable(),
  min_commission: z.number().min(0).nullable(),
  max_commission: z.number().min(0).nullable(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effective_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  is_active: z.boolean(),
});

export const adminListPlans = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFounder(context);
    const db = await admin();
    const [plans, cats] = await Promise.all([
      db.from("driver_monetization_plans").select("*").order("created_at", { ascending: false }),
      db.from("vehicle_categories").select("id, name").eq("is_active", true),
    ]);
    return { plans: plans.data ?? [], categories: cats.data ?? [] };
  });

export const adminSavePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => planInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireFounder(context);
    if (data.plan_type === "subscription" && data.monthly_fee == null) throw new Error("Set the monthly fee.");
    if (data.plan_type === "commission" && (!data.commission_type || data.commission_value == null))
      throw new Error("Set the commission type and value.");
    const db = await admin();
    const { id, ...row } = data;
    const res = id
      ? await db.from("driver_monetization_plans").update(row).eq("id", id)
      : await db.from("driver_monetization_plans").insert({ ...row, created_by: context.userId });
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

/** Founder puts a driver on a plan. Commission plan activates online eligibility without a subscription. */
export const adminAssignDriverPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ mobile: z.string().regex(/^[6-9]\d{9}$/), planId: uuid.nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireFounder(context);
    const db = await admin();
    const { data: p } = await db.from("profiles").select("id").eq("mobile", data.mobile).maybeSingle();
    if (!p) throw new Error("Driver not found.");
    let commission = false;
    if (data.planId) {
      const { data: plan } = await db.from("driver_monetization_plans").select("plan_type, is_active").eq("id", data.planId).single();
      if (!plan?.is_active) throw new Error("Plan is not active.");
      commission = plan.plan_type === "commission";
    }
    const { error, count } = await db
      .from("rider_details")
      .update({ monetization_plan_id: data.planId, commission_plan_active: commission }, { count: "exact" })
      .eq("user_id", p.id);
    if (error) throw new Error(error.message);
    if (!count) throw new Error("This account is not a driver.");
    await db.from("admin_audit_logs").insert({
      actor_id: context.userId,
      action: "driver_plan_assigned",
      target_type: "rider_details",
      target_id: p.id,
      details: { plan_id: data.planId, commission },
    });
    return { ok: true };
  });

/* ============================== FOUNDER: RULES & TARGETS ============================== */

const ruleInput = z.object({
  id: uuid.optional(),
  event_type: z.enum([
    "new_driver",
    "qualified_driver",
    "new_customer",
    "qualified_customer",
    "driver_renewal",
    "customer_reactivation",
    "performance_bonus",
    "target_bonus",
    "quality_bonus",
  ]),
  amount: z.number().min(0),
  min_completed_rides: z.number().int().min(0),
  require_kyc: z.boolean(),
  require_monetization: z.boolean(),
  dormant_days: z.number().int().min(1).max(365),
  territory: z.string().max(80).nullable(),
  is_active: z.boolean(),
});

export const adminListRulesTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFounder(context);
    const db = await admin();
    const [rules, targets] = await Promise.all([
      db.from("compensation_rules").select("*").order("created_at", { ascending: false }),
      db.from("employee_targets").select("*").order("month", { ascending: false }).limit(500),
    ]);
    return { rules: rules.data ?? [], targets: targets.data ?? [] };
  });

export const adminSaveRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ruleInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireFounder(context);
    const db = await admin();
    const { id, ...row } = data;
    const res = id
      ? await db.from("compensation_rules").update(row).eq("id", id)
      : await db.from("compensation_rules").insert(row);
    if (res.error) throw new Error(res.error.message);
    return { ok: true };
  });

export const adminSetTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        employeeId: uuid,
        month: z.string().regex(/^\d{4}-\d{2}$/),
        metric: z.enum([
          "new_drivers",
          "qualified_drivers",
          "new_customers",
          "qualified_customers",
          "renewals",
          "reactivations",
          "completed_rides",
          "portfolio_active",
        ]),
        target_value: z.number().int().min(1),
        slabs: z.array(z.object({ percent: z.number().min(1).max(500), bonus: z.number().min(0) })).max(10),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireFounder(context);
    const db = await admin();
    const { error } = await db.from("employee_targets").upsert(
      {
        employee_id: data.employeeId,
        month: `${data.month}-01`,
        metric: data.metric,
        target_value: data.target_value,
        slabs: data.slabs,
      },
      { onConflict: "employee_id,month,metric" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================== METRICS ENGINE ============================== */

type Range = { from: string; to: string };

async function computeMetrics(db: Admin, employeeIds: string[], range: Range) {
  const { data: emps } = await db.from("field_employees").select("*").in("id", employeeIds);
  const { data: scoped } = await db
    .from("profiles")
    .select("id, full_name, mobile, created_at, acquired_by_employee_id, acquisition_date, portfolio_manager_id")
    .or(
      `acquired_by_employee_id.in.(${employeeIds.join(",")}),portfolio_manager_id.in.(${employeeIds.join(",")})`,
    );
  const people = scoped ?? [];
  const ids = people.map((p) => p.id);
  const roles = await rolesOf(db, ids);
  const empty = { data: [] as never[] };
  const [rdRes, ridesRes, subsRes, ledgerRes, eventsRes, assignRes, targetsRes] = await Promise.all([
    ids.length
      ? db
          .from("rider_details")
          .select("user_id, is_approved, is_blocked, is_online, subscription_valid_until, commission_plan_active")
          .in("user_id", ids)
      : Promise.resolve(empty),
    ids.length
      ? db
          .from("rides")
          .select("id, customer_id, rider_id, status, created_at, completed_at, total_fare")
          .gte("created_at", new Date(Date.parse(range.from) - 90 * 864e5).toISOString())
          .or(`customer_id.in.(${ids.join(",")}),rider_id.in.(${ids.join(",")})`)
      : Promise.resolve(empty),
    ids.length
      ? db
          .from("subscription_payments")
          .select("id, rider_id, amount, created_at")
          .in("rider_id", ids)
          .gte("created_at", range.from)
          .lte("created_at", range.to)
      : Promise.resolve(empty),
    db
      .from("financial_ledger")
      .select("employee_id, txn_type, amount, status, created_at")
      .in("employee_id", employeeIds)
      .gte("created_at", range.from)
      .lte("created_at", range.to),
    db
      .from("employee_qualified_events")
      .select("employee_id, event_type, qualified_at")
      .in("employee_id", employeeIds)
      .gte("qualified_at", range.from)
      .lte("qualified_at", range.to),
    db.from("portfolio_assignments").select("*").in("employee_id", employeeIds).is("ended_at", null),
    db
      .from("employee_targets")
      .select("*")
      .in("employee_id", employeeIds)
      .eq("month", `${range.from.slice(0, 7)}-01`),
  ]);
  const rd = new Map((rdRes.data ?? []).map((r) => [r.user_id, r]));
  const rides = ridesRes.data ?? [];
  const inRange = (d: string | null) => !!d && d >= range.from && d <= range.to;

  return (emps ?? []).map((e) => {
    const isDriver = (id: string) => roles.get(id)?.has("rider") ?? false;
    const acquired = people.filter((p) => p.acquired_by_employee_id === e.id);
    const portfolio = people.filter((p) => p.portfolio_manager_id === e.id);
    const scope = new Set([...acquired, ...portfolio].map((p) => p.id));
    const drivers = [...scope].filter(isDriver);
    const customers = [...scope].filter((id) => !isDriver(id));
    const driversAdded = acquired.filter((p) => isDriver(p.id) && inRange(p.acquisition_date ?? p.created_at)).length;
    const customersAdded = acquired.filter((p) => !isDriver(p.id) && inRange(p.acquisition_date ?? p.created_at)).length;
    const completed = rides.filter(
      (r) => r.status === "completed" && inRange(r.completed_at) && (scope.has(r.customer_id) || (r.rider_id && scope.has(r.rider_id))),
    );
    const bookedCustomers = new Set(
      rides.filter((r) => inRange(r.created_at) && customers.includes(r.customer_id)).map((r) => r.customer_id),
    );
    const custRideCount = new Map<string, number>();
    for (const r of completed) if (customers.includes(r.customer_id)) custRideCount.set(r.customer_id, (custRideCount.get(r.customer_id) ?? 0) + 1);
    const repeat = [...custRideCount.values()].filter((n) => n >= 2).length;
    const activeDrivers = drivers.filter((id) => driverActive(rd.get(id))).length;
    const expiredDrivers = drivers.filter((id) => {
      const r = rd.get(id);
      return r?.is_approved && !driverActive(r);
    }).length;
    const onlineDrivers = drivers.filter((id) => rd.get(id)?.is_online).length;
    const since30 = new Date(Date.now() - 30 * 864e5).toISOString();
    const active30 = new Set(
      rides.filter((r) => r.status === "completed" && (r.completed_at ?? "") >= since30).map((r) => r.customer_id),
    );
    const activeCustomers = customers.filter((id) => active30.has(id)).length;
    const subs = (subsRes.data ?? []).filter((s) => portfolio.some((p) => p.id === s.rider_id) || acquired.some((p) => p.id === s.rider_id));
    const ledger = (ledgerRes.data ?? []).filter((l) => l.employee_id === e.id);
    const events = (eventsRes.data ?? []).filter((x) => x.employee_id === e.id);
    const cnt = (t: string) => events.filter((x) => x.event_type === t).length;
    const commissionGenerated = ledger.filter((l) => l.txn_type === "ride_commission").reduce((a, l) => a + Number(l.amount), 0);
    const earned = ledger
      .filter((l) => ["employee_commission", "employee_bonus"].includes(l.txn_type) && l.status !== "rejected")
      .reduce((a, l) => a + Number(l.amount), 0);
    const assigns = (assignRes.data ?? []).filter((a) => a.employee_id === e.id);
    const baselineActiveDrivers = assigns.filter((a) => a.subject_type === "driver" && a.baseline_active).length;
    const baselineActiveCustomers = assigns.filter((a) => a.subject_type === "customer" && a.baseline_active).length;
    const baselineRides = assigns.reduce((a, x) => a + x.baseline_rides_30d, 0);
    const actual: Record<string, number> = {
      new_drivers: driversAdded,
      qualified_drivers: cnt("qualified_driver"),
      new_customers: customersAdded,
      qualified_customers: cnt("qualified_customer"),
      renewals: subs.length,
      reactivations: cnt("customer_reactivation"),
      completed_rides: completed.length,
      portfolio_active: activeDrivers + activeCustomers,
    };
    const targets = (targetsRes.data ?? [])
      .filter((t) => t.employee_id === e.id)
      .map((t) => ({ metric: t.metric, target: t.target_value, actual: actual[t.metric] ?? 0, slabs: t.slabs }));
    const achievement = targets.length
      ? Math.round(targets.reduce((a, t) => a + Math.min(150, (t.actual / t.target) * 100), 0) / targets.length)
      : null;
    const score = Math.round(
      cnt("qualified_driver") * 10 +
        cnt("qualified_customer") * 4 +
        subs.length * 5 +
        cnt("customer_reactivation") * 3 +
        completed.length * 0.5 +
        Math.max(0, activeDrivers - baselineActiveDrivers) * 4 +
        (achievement ?? 0) * 0.3,
    );
    return {
      employeeId: e.id,
      employeeCode: e.employee_code,
      territory: e.territory,
      status: e.status,
      salary: Number(e.monthly_salary),
      driversAdded,
      qualifiedDrivers: cnt("qualified_driver"),
      assignedDrivers: drivers.length,
      activeDrivers,
      expiredDrivers,
      onlineDrivers,
      customersAdded,
      qualifiedCustomers: cnt("qualified_customer"),
      assignedCustomers: customers.length,
      activeCustomers,
      dormantCustomers: customers.length - activeCustomers,
      reactivated: cnt("customer_reactivation"),
      customersBooked: bookedCustomers.size,
      completedRides: completed.length,
      repeatCustomers: repeat,
      renewals: subs.length,
      subscriptionCollection: subs.reduce((a, s) => a + Number(s.amount), 0),
      commissionGenerated,
      commissionEarned: earned,
      totalCost: Number(e.monthly_salary) + earned,
      targets,
      achievement,
      score,
      baseline: {
        activeDrivers: baselineActiveDrivers,
        activeCustomers: baselineActiveCustomers,
        rides30d: baselineRides,
      },
      drivers,
      customers,
    };
  });
}

const rangeInput = z.object({
  from: z.string().min(10),
  to: z.string().min(10),
  territory: z.string().max(80).nullable().optional(),
});

export const adminPerformance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rangeInput.parse(d))
  .handler(async ({ data, context }) => {
    await requireFounder(context);
    const db = await admin();
    let q = db.from("field_employees").select("id, user_id, territory");
    if (data.territory) q = q.eq("territory", data.territory);
    const { data: emps } = await q;
    if (!emps?.length) return [];
    const metrics = await computeMetrics(db, emps.map((e) => e.id), data);
    const { data: profiles } = await db.from("profiles").select("id, full_name").in("id", emps.map((e) => e.user_id));
    const nameOf = new Map(emps.map((e) => [e.id, profiles?.find((p) => p.id === e.user_id)?.full_name ?? ""]));
    return metrics
      .map(({ drivers: _d, customers: _c, ...m }) => ({ ...m, name: nameOf.get(m.employeeId) ?? "" }))
      .sort((a, b) => b.score - a.score);
  });

/* ============================== QUALIFIED EVENT EVALUATION ============================== */

export const adminEvaluateEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFounder(context);
    const db = await admin();
    const now = today();
    const [{ data: rules }, { data: emps }] = await Promise.all([
      db.from("compensation_rules").select("*").eq("is_active", true).lte("effective_from", now),
      db.from("field_employees").select("*").eq("status", "active"),
    ]);
    const activeRules = (rules ?? []).filter((r) => !r.effective_to || r.effective_to >= now);
    const eligibleEmps = (emps ?? []).filter((e) => !e.incentives_start_date || e.incentives_start_date <= now);
    if (!activeRules.length || !eligibleEmps.length) return { created: 0 };
    const empIds = eligibleEmps.map((e) => e.id);
    const { data: people } = await db
      .from("profiles")
      .select("id, created_at, acquired_by_employee_id, acquisition_date, portfolio_manager_id")
      .or(`acquired_by_employee_id.in.(${empIds.join(",")}),portfolio_manager_id.in.(${empIds.join(",")})`);
    const ids = (people ?? []).map((p) => p.id);
    if (!ids.length) return { created: 0 };
    const roles = await rolesOf(db, ids);
    const [{ data: rds }, { data: vehicles }, { data: rides }, { data: subs }, { data: assigns }] = await Promise.all([
      db
        .from("rider_details")
        .select("user_id, is_approved, is_blocked, subscription_valid_until, commission_plan_active, license_number")
        .in("user_id", ids),
      db.from("rider_vehicles").select("rider_id").eq("is_active", true).in("rider_id", ids),
      db
        .from("rides")
        .select("customer_id, rider_id, completed_at")
        .eq("status", "completed")
        .or(`customer_id.in.(${ids.join(",")}),rider_id.in.(${ids.join(",")})`),
      db.from("subscription_payments").select("id, rider_id, created_at").in("rider_id", ids),
      db.from("portfolio_assignments").select("*").in("employee_id", empIds).is("ended_at", null),
    ]);
    const rd = new Map((rds ?? []).map((r) => [r.user_id, r]));
    const hasVehicle = new Set((vehicles ?? []).map((v) => v.rider_id));
    const completedBy = (id: string, driver: boolean) =>
      (rides ?? []).filter((r) => (driver ? r.rider_id === id : r.customer_id === id));

    const rows: { employee_id: string; event_type: string; subject_id: string; period_key: string; rule_id: string; amount: number; note: string }[] = [];
    const ruleFor = (type: string, territory: string) =>
      activeRules.find((r) => r.event_type === type && (!r.territory || r.territory === territory));

    for (const e of eligibleEmps) {
      const start = e.incentives_start_date ?? e.joining_date;
      for (const p of people ?? []) {
        const driver = roles.get(p.id)?.has("rider") ?? false;
        const done = completedBy(p.id, driver);
        if (p.acquired_by_employee_id === e.id && (p.acquisition_date ?? p.created_at).slice(0, 10) >= start) {
          if (driver) {
            const d = rd.get(p.id);
            const kyc = !!d?.license_number && hasVehicle.has(p.id);
            const nd = ruleFor("new_driver", e.territory);
            if (nd && d?.is_approved && (!nd.require_kyc || kyc))
              rows.push({ employee_id: e.id, event_type: "new_driver", subject_id: p.id, period_key: "once", rule_id: nd.id, amount: Number(nd.amount), note: "New driver approved" });
            const qd = ruleFor("qualified_driver", e.territory);
            if (qd && d?.is_approved && (!qd.require_kyc || kyc) && (!qd.require_monetization || driverActive(d)) && done.length >= qd.min_completed_rides)
              rows.push({ employee_id: e.id, event_type: "qualified_driver", subject_id: p.id, period_key: "once", rule_id: qd.id, amount: Number(qd.amount), note: "Qualified driver" });
          } else {
            const nc = ruleFor("new_customer", e.territory);
            if (nc && done.length >= nc.min_completed_rides)
              rows.push({ employee_id: e.id, event_type: "new_customer", subject_id: p.id, period_key: "once", rule_id: nc.id, amount: Number(nc.amount), note: "New customer" });
            const qc = ruleFor("qualified_customer", e.territory);
            if (qc && done.length >= Math.max(1, qc.min_completed_rides))
              rows.push({ employee_id: e.id, event_type: "qualified_customer", subject_id: p.id, period_key: "once", rule_id: qc.id, amount: Number(qc.amount), note: "Qualified customer (completed ride)" });
          }
        }
        if (p.portfolio_manager_id === e.id) {
          const a = (assigns ?? []).find((x) => x.user_id === p.id && x.employee_id === e.id);
          const since = a ? a.assigned_at : start;
          if (driver) {
            const rr = ruleFor("driver_renewal", e.territory);
            if (rr)
              for (const s of (subs ?? []).filter((s) => s.rider_id === p.id && s.created_at >= since && s.created_at.slice(0, 10) >= start))
                rows.push({ employee_id: e.id, event_type: "driver_renewal", subject_id: p.id, period_key: s.id, rule_id: rr.id, amount: Number(rr.amount), note: "Driver renewal" });
          } else {
            const rr = ruleFor("customer_reactivation", e.territory);
            if (rr && a && !a.baseline_active) {
              const after = done.filter((r) => (r.completed_at ?? "") >= since).sort((x, y) => (x.completed_at ?? "").localeCompare(y.completed_at ?? ""));
              const first = after[0];
              if (first) {
                const gapStart = new Date(Date.parse(first.completed_at!) - rr.dormant_days * 864e5).toISOString();
                const prior = done.some((r) => (r.completed_at ?? "") < first.completed_at! && (r.completed_at ?? "") >= gapStart);
                if (!prior)
                  rows.push({ employee_id: e.id, event_type: "customer_reactivation", subject_id: p.id, period_key: a.id, rule_id: rr.id, amount: Number(rr.amount), note: "Dormant customer reactivated" });
              }
            }
          }
        }
      }
    }

    let created = 0;
    for (const r of rows) {
      const { data: ev, error } = await db
        .from("employee_qualified_events")
        .insert({ employee_id: r.employee_id, event_type: r.event_type, subject_id: r.subject_id, period_key: r.period_key, rule_id: r.rule_id, amount: r.amount })
        .select("id")
        .single();
      if (error) continue; // already qualified earlier (unique)
      created++;
      if (r.amount > 0) {
        const { data: led } = await db
          .from("financial_ledger")
          .insert({
            txn_type: "employee_commission",
            amount: r.amount,
            employee_id: r.employee_id,
            user_id: r.subject_id,
            status: "pending",
            reference: `EVT-${ev.id.slice(0, 8)}`,
            note: r.note,
            created_by: context.userId,
          })
          .select("id")
          .single();
        if (led) await db.from("employee_qualified_events").update({ ledger_id: led.id }).eq("id", ev.id);
      }
    }
    return { created };
  });

/* ============================== FOUNDER: LEDGER ============================== */

export const adminListLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireFounder(context);
    const db = await admin();
    const [{ data: rows }, { data: audit }] = await Promise.all([
      db.from("financial_ledger").select("*").order("created_at", { ascending: false }).limit(300),
      db.from("verified_tick_audit").select("*").order("created_at", { ascending: false }).limit(200),
    ]);
    const ids = [
      ...new Set([
        ...(rows ?? []).map((r) => r.user_id),
        ...(audit ?? []).flatMap((a) => [a.driver_id, a.actor_id]),
      ].filter(Boolean) as string[]),
    ];
    const { data: profiles } = ids.length ? await db.from("profiles").select("id, full_name, mobile").in("id", ids) : { data: [] };
    const nm = new Map((profiles ?? []).map((p) => [p.id, `${p.full_name || "—"} (${p.mobile})`]));
    return {
      ledger: (rows ?? []).map((r) => ({ ...r, user_label: r.user_id ? nm.get(r.user_id) ?? "" : "" })),
      tickAudit: (audit ?? []).map((a) => ({
        ...a,
        driver_label: nm.get(a.driver_id) ?? a.driver_id,
        actor_label: a.actor_id ? nm.get(a.actor_id) ?? a.actor_id : "system",
      })),
    };
  });

export const adminDecideLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: uuid, status: z.enum(["approved", "paid", "rejected", "collected"]), reference: z.string().max(120).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireFounder(context);
    const db = await admin();
    const { data: cur } = await db.from("financial_ledger").select("status").eq("id", data.id).single();
    if (!cur) throw new Error("Entry not found.");
    if (["paid", "rejected", "collected"].includes(cur.status)) throw new Error("This entry is already closed.");
    const { error } = await db
      .from("financial_ledger")
      .update({
        status: data.status,
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
        ...(data.reference ? { reference: data.reference } : {}),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await db.from("admin_audit_logs").insert({
      actor_id: context.userId,
      action: `ledger_${data.status}`,
      target_type: "financial_ledger",
      target_id: data.id,
      details: { reference: data.reference },
    });
    return { ok: true };
  });

export const adminRecordSalary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ employeeId: uuid, amount: z.number().positive(), type: z.enum(["employee_salary", "employee_bonus"]), note: z.string().min(2).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireFounder(context);
    const db = await admin();
    const { error } = await db.from("financial_ledger").insert({
      txn_type: data.type,
      amount: data.amount,
      employee_id: data.employeeId,
      status: "pending",
      note: data.note,
      reference: `${data.type === "employee_salary" ? "SAL" : "BON"}-${Date.now().toString(36).toUpperCase()}`,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============================== EMPLOYEE PORTAL ============================== */

export const getMyEmployeeStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("field_employees")
      .select("id, status")
      .eq("user_id", context.userId)
      .maybeSingle();
    return data ?? null;
  });

export const getMyIdCard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: e } = await context.supabase
      .from("field_employees")
      .select("employee_code, designation, territory, status, joining_date, verification_token")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!e) throw new Error("Field employee access required.");
    const { data: p } = await context.supabase
      .from("profiles")
      .select("full_name, photo_url, address, date_of_birth, mobile")
      .eq("id", context.userId)
      .maybeSingle();
    return { ...e, ...p };
  });

export const employeeDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rangeInput.parse(d))
  .handler(async ({ data, context }) => {
    const me = await requireEmployee(context);
    const db = await admin();
    const [m] = await computeMetrics(db, [me.id], data);
    const ids = [...(m?.drivers ?? []), ...(m?.customers ?? [])];
    const [{ data: profiles }, { data: rds }, { data: pay }] = await Promise.all([
      ids.length ? db.from("profiles").select("id, full_name, mobile, created_at, acquired_by_employee_id, portfolio_manager_id").in("id", ids) : Promise.resolve({ data: [] as never[] }),
      m?.drivers.length
        ? db.from("rider_details").select("user_id, is_approved, is_blocked, is_online, subscription_valid_until, commission_plan_active, license_number").in("user_id", m.drivers)
        : Promise.resolve({ data: [] as never[] }),
      db
        .from("financial_ledger")
        .select("id, txn_type, amount, status, reference, note, created_at")
        .eq("employee_id", me.id)
        .in("txn_type", ["employee_salary", "employee_commission", "employee_bonus"])
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    const rd = new Map((rds ?? []).map((r) => [r.user_id, r]));
    const people = (profiles ?? []).map((p) => ({
      id: p.id,
      name: p.full_name,
      mobile: p.mobile,
      joined: p.created_at,
      acquiredByMe: p.acquired_by_employee_id === me.id,
      inPortfolio: p.portfolio_manager_id === me.id,
      driver: rd.get(p.id) ?? null,
      isDriver: m?.drivers.includes(p.id) ?? false,
    }));
    const { drivers: _d, customers: _c, ...metrics } = m!;
    return {
      employee: { code: me.employee_code, territory: me.territory, canApprove: me.can_approve_drivers, salary: Number(me.monthly_salary) },
      metrics,
      people,
      earnings: pay ?? [],
    };
  });

/** Employee tags a genuine, newly registered account they helped sign up. */
export const employeeTagAcquisition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ mobile: z.string().regex(/^[6-9]\d{9}$/), source: z.string().trim().max(80).nullable() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const me = await requireEmployee(context);
    const db = await admin();
    const { data: p } = await db
      .from("profiles")
      .select("id, created_at, acquired_by_employee_id")
      .eq("mobile", data.mobile)
      .maybeSingle();
    if (!p) throw new Error("No account with this mobile. Complete registration in the app first.");
    if (p.id === context.userId) throw new Error("You cannot tag your own account.");
    if (p.acquired_by_employee_id) throw new Error("This account is already attributed.");
    if (Date.now() - Date.parse(p.created_at) > 3 * 864e5)
      throw new Error("Only accounts registered within the last 3 days can be tagged. Ask HQ for older accounts.");
    const roles = await rolesOf(db, [p.id]);
    if (roles.get(p.id)?.has("admin")) throw new Error("Not allowed.");
    const { count } = await db
      .from("rides")
      .select("id", { count: "exact", head: true })
      .or(`customer_id.eq.${p.id},rider_id.eq.${p.id}`)
      .lt("created_at", new Date().toISOString());
    if ((count ?? 0) > 0) throw new Error("This account already has ride activity, so it cannot be tagged.");
    const { error } = await db
      .from("profiles")
      .update({
        acquired_by_employee_id: me.id,
        acquisition_date: new Date().toISOString(),
        acquisition_territory: me.territory,
        acquisition_source: data.source,
      })
      .eq("id", p.id)
      .is("acquired_by_employee_id", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Authorized employee approves a driver in their scope once all conditions are met. */
export const employeeApproveDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ riderId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const me = await requireEmployee(context);
    if (!me.can_approve_drivers) throw new Error("You are not authorized to approve drivers.");
    const db = await admin();
    const [{ data: p }, { data: d }, { count: vehicles }] = await Promise.all([
      db.from("profiles").select("acquired_by_employee_id, portfolio_manager_id, full_name, photo_url").eq("id", data.riderId).maybeSingle(),
      db.from("rider_details").select("*").eq("user_id", data.riderId).maybeSingle(),
      db.from("rider_vehicles").select("id", { count: "exact", head: true }).eq("rider_id", data.riderId).eq("is_active", true),
    ]);
    if (!p || !d) throw new Error("Driver not found.");
    if (p.acquired_by_employee_id !== me.id && p.portfolio_manager_id !== me.id)
      throw new Error("This driver is outside your authorized territory.");
    if (d.is_approved) return { ok: true };
    if (d.is_blocked) throw new Error("This driver is blocked by HQ.");
    const missing: string[] = [];
    if (!p.full_name?.trim()) missing.push("name");
    if (!d.license_number) missing.push("driving licence (KYC)");
    if (!vehicles) missing.push("an active vehicle");
    if (!d.commission_plan_active && (!d.subscription_valid_until || d.subscription_valid_until < today()))
      missing.push("active subscription or commission plan");
    if (missing.length) throw new Error(`Cannot approve yet. Missing: ${missing.join(", ")}.`);
    const { error } = await db
      .from("rider_details")
      .update({ is_approved: true, approved_by: context.userId, approved_at: new Date().toISOString() })
      .eq("user_id", data.riderId);
    if (error) throw new Error(error.message);
    await db.from("admin_audit_logs").insert({
      actor_id: context.userId,
      action: "driver_approved_by_employee",
      target_type: "rider_details",
      target_id: data.riderId,
      details: { employee_code: me.employee_code },
    });
    return { ok: true };
  });
