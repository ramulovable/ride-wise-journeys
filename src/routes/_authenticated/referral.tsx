import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminShell, CustomerShell, RiderShell } from "@/components/shells";
import { ReferralCard } from "@/components/ReferralCard";
import { useAuth } from "@/lib/auth";
import { formatDateTime, rupees } from "@/lib/format";
import { REFERRAL_STATUS_LABEL, fetchMyReferrals } from "@/lib/referrals";

export const Route = createFileRoute("/_authenticated/referral")({
  head: () => ({
    meta: [
      { title: "Refer & earn — Shahin Travels" },
      {
        name: "description",
        content: "Share your Shahin Travels referral code and earn wallet rewards.",
      },
      { property: "og:title", content: "Refer & earn — Shahin Travels" },
      {
        property: "og:description",
        content: "Share your Shahin Travels referral code and earn wallet rewards.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReferralPage,
});

function ReferralPage() {
  const { user, role } = useAuth();

  const referrals = useQuery({
    queryKey: ["my-referrals", user?.id],
    enabled: Boolean(user),
    queryFn: () => fetchMyReferrals(user!.id),
  });

  const body = (
    <div className="space-y-4">
      <ReferralCard />

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">People you referred</h2>
        {referrals.data?.length ? (
          <div className="divide-y divide-border">
            {referrals.data.map((row) => (
              <article key={row.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {REFERRAL_STATUS_LABEL[row.status] ?? row.status}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Joined {formatDateTime(row.created_at)}
                  </p>
                </div>
                <span className="text-sm font-semibold">
                  {row.status === "rewarded" ? rupees(row.reward_amount) : "—"}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No one has joined with your code yet. Share it to start earning.
          </p>
        )}
      </section>
    </div>
  );

  if (role === "admin") return <AdminShell title="Refer & earn">{body}</AdminShell>;
  if (role === "rider") return <RiderShell title="Refer & earn">{body}</RiderShell>;
  return <CustomerShell title="Refer & earn">{body}</CustomerShell>;
}
