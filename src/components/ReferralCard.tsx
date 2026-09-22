import { useQuery } from "@tanstack/react-query";
import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { rupees } from "@/lib/format";
import {
  buildInviteLink,
  buildInviteMessage,
  fetchMyReferralCode,
  fetchRewardConditions,
} from "@/lib/referrals";
import { useAppSettings } from "@/lib/settings";

export function useMyReferralCode() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-referral-code", user?.id],
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    queryFn: fetchMyReferralCode,
  });
}

export function ReferralCard() {
  const settings = useAppSettings();
  const codeQuery = useMyReferralCode();
  const code = codeQuery.data ?? "";
  const reward = settings.data?.referralReward ?? 0;
  const enabled = settings.data?.referralEnabled ?? true;
  const conditions = useQuery({
    queryKey: ["referral-reward-conditions"],
    staleTime: 5 * 60_000,
    queryFn: fetchRewardConditions,
  });
  const activeCondition = conditions.data?.find(
    (item) => item.code === settings.data?.referralCondition,
  );
  const conditionNote =
    activeCondition?.event_type === "FIRST_COMPLETED_RIDE"
      ? "after their first completed ride."
      : "as soon as they create their account.";

  const link = settings.data ? buildInviteLink(settings.data.referralInviteUrl, code) : "";
  const message = settings.data
    ? buildInviteMessage(settings.data.referralInviteMessage, code, reward, link)
    : "";

  async function copyCode() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    toast.success(settings.data?.referralCopyToast ?? "Referral code copied.");
  }

  async function share() {
    if (!message) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "Shahin Travels", text: message });
        return;
      } catch {
        // sharing cancelled — fall back to copying
      }
    }
    await navigator.clipboard.writeText(message);
    toast.success(settings.data?.referralCopyToast ?? "Invite message copied.");
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 text-center">
      <p className="text-sm text-muted-foreground">My referral code</p>
      <p className="text-3xl font-bold tracking-[0.2em]">
        {codeQuery.isPending ? "…" : code || "—"}
      </p>
      {enabled ? (
        <p className="text-sm text-muted-foreground">
          You get {rupees(reward)} for every friend who joins with your code — credited{" "}
          {conditionNote}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Referral rewards are paused right now, but your code stays the same.
        </p>
      )}
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          disabled={!code}
          onClick={() => void copyCode()}
        >
          <Copy className="mr-2 h-4 w-4" /> Copy code
        </Button>
        <Button className="flex-1" disabled={!code} onClick={() => void share()}>
          <Share2 className="mr-2 h-4 w-4" /> Share &amp; earn
        </Button>
      </div>
    </section>
  );
}
