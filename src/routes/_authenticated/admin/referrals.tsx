import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, rupees } from "@/lib/format";
import { REFERRAL_STATUS_LABEL } from "@/lib/referrals";
import { useAppSettings } from "@/lib/settings";

export const Route = createFileRoute("/_authenticated/admin/referrals")({
  head: () => ({
    meta: [
      { title: "Referral & rewards — Shahin Travels admin" },
      {
        name: "description",
        content: "Track referrals, reward payouts and the referral programme settings.",
      },
      { property: "og:title", content: "Referral & rewards — Shahin Travels admin" },
      {
        property: "og:description",
        content: "Track referrals, reward payouts and the referral programme settings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminReferralsPage,
});

type ReferralRecord = {
  id: string;
  code: string;
  status: string;
  reward_amount: number;
  created_at: string;
  rewarded_at: string | null;
  referrer_user_id: string;
  referred_user_id: string;
  referrerName: string;
  referrerMobile: string;
  referredName: string;
  referredMobile: string;
};

async function fetchAdminReferrals(): Promise<ReferralRecord[]> {
  const { data, error } = await supabase
    .from("referrals")
    .select(
      "id, code, status, reward_amount, created_at, rewarded_at, referrer_user_id, referred_user_id",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const ids = Array.from(
    new Set(rows.flatMap((row) => [row.referrer_user_id, row.referred_user_id])),
  );
  const people = new Map<string, { name: string; mobile: string }>();
  if (ids.length) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, mobile")
      .in("id", ids);
    for (const profile of profiles ?? []) {
      people.set(profile.id, { name: profile.full_name, mobile: profile.mobile });
    }
  }
  return rows.map((row) => ({
    ...row,
    reward_amount: Number(row.reward_amount),
    referrerName: people.get(row.referrer_user_id)?.name || "Unknown",
    referrerMobile: people.get(row.referrer_user_id)?.mobile || "",
    referredName: people.get(row.referred_user_id)?.name || "Unknown",
    referredMobile: people.get(row.referred_user_id)?.mobile || "",
  }));
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function AdminReferralsPage() {
  const settings = useAppSettings();
  const records = useQuery({ queryKey: ["admin-referrals"], queryFn: fetchAdminReferrals });

  const rows = records.data ?? [];
  const successful = rows.filter((row) => row.status === "rewarded");
  const pending = rows.filter((row) => row.status === "pending");
  const paid = successful.reduce((total, row) => total + row.reward_amount * 2, 0);

  return (
    <AdminShell title="Referral & rewards">
      <div className="space-y-4">
        <section className="grid grid-cols-2 gap-3">
          <Stat label="Total referrals" value={rows.length} />
          <Stat label="Successful" value={successful.length} />
          <Stat label="Pending" value={pending.length} />
          <Stat label="Rewards paid" value={rupees(paid)} />
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Current reward per side</p>
          <p className="text-xl font-bold">{rupees(settings.data?.referralReward ?? 0)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Programme is {settings.data?.referralEnabled === false ? "off" : "on"}. Change the
            amount and rules in Settings.
          </p>
        </section>

        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          <h2 className="font-semibold">Referral records</h2>
          {rows.length ? (
            <div className="divide-y divide-border">
              {rows.map((row) => (
                <article key={row.id} className="space-y-1 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">
                      {row.referrerName} → {row.referredName}
                    </p>
                    <span className="text-sm font-semibold">
                      {row.status === "rewarded" ? rupees(row.reward_amount) : "—"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {row.referrerMobile} → {row.referredMobile}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Code {row.code} · joined {formatDateTime(row.created_at)}
                    {row.rewarded_at ? ` · rewarded ${formatDateTime(row.rewarded_at)}` : ""}
                  </p>
                  <p className="text-xs font-medium">
                    {REFERRAL_STATUS_LABEL[row.status] ?? row.status}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No referrals yet"
              description="Referrals appear here as soon as someone signs up with a code."
            />
          )}
        </section>
      </div>
    </AdminShell>
  );
}
