import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell, CustomerShell, RiderShell } from "@/components/shells";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDateTime, rupees } from "@/lib/format";
import { useAppSettings } from "@/lib/settings";

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
  const { user, role, profile } = useAuth();
  const settings = useAppSettings();
  const code = (profile as { my_referral_code?: string } | null)?.my_referral_code ?? "";

  const referrals = useQuery({
    queryKey: ["my-referrals", user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referrals")
        .select("id, status, created_at, rewarded_at")
        .eq("referrer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const reward = settings.data?.referralReward ?? 20;
  const shareText = code
    ? `Book rides with Shahin Travels. Use my referral code ${code} and we both earn ${rupees(reward)}.`
    : "";

  async function copyCode() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    toast.success("Referral code copied.");
  }

  async function share() {
    if (!shareText) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "Shahin Travels", text: shareText });
        return;
      } catch {
        // sharing cancelled — fall back to copy
      }
    }
    await navigator.clipboard.writeText(shareText);
    toast.success("Invite message copied.");
  }

  const body = (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4 text-center">
        <p className="text-sm text-muted-foreground">Your referral code</p>
        <p className="text-3xl font-bold tracking-[0.2em]">{code || "—"}</p>
        <p className="text-sm text-muted-foreground">
          You and your friend each get {rupees(reward)} after their first completed ride.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => void copyCode()}>
            <Copy className="mr-2 h-4 w-4" /> Copy
          </Button>
          <Button className="flex-1" onClick={() => void share()}>
            <Share2 className="mr-2 h-4 w-4" /> Share
          </Button>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">People you referred</h2>
        {referrals.data?.length ? (
          <div className="divide-y divide-border">
            {referrals.data.map((row) => (
              <article key={row.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">
                    {row.status === "rewarded" ? "Reward credited" : "Waiting for first ride"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Joined {formatDateTime(row.created_at)}
                  </p>
                </div>
                <span className="text-sm font-semibold">
                  {row.status === "rewarded" ? rupees(reward) : "—"}
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
