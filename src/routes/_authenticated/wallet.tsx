import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell, CustomerShell, RiderShell } from "@/components/shells";
import { ReferralCard } from "@/components/ReferralCard";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDateTime, rupees } from "@/lib/format";
import { REFERRAL_STATUS_LABEL, fetchMyReferrals } from "@/lib/referrals";
import { useAppSettings } from "@/lib/settings";
import {
  WALLET_TXN_LABEL,
  WITHDRAWAL_STATUS_LABEL,
  fetchWalletTransactions,
  fetchWithdrawals,
  walletTotals,
} from "@/lib/wallet";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => ({
    meta: [
      { title: "My wallet — Shahin Travels" },
      {
        name: "description",
        content: "See your Shahin Travels balance, referral rewards and withdrawal history.",
      },
      { property: "og:title", content: "My wallet — Shahin Travels" },
      {
        property: "og:description",
        content: "See your Shahin Travels balance, referral rewards and withdrawal history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WalletPage,
});

function WalletPage() {
  const { user, role } = useAuth();
  const qc = useQueryClient();
  const settings = useAppSettings();
  const [amount, setAmount] = useState("");
  const [upi, setUpi] = useState("");
  const [busy, setBusy] = useState(false);

  const txns = useQuery({
    queryKey: ["wallet-txns", user?.id],
    enabled: Boolean(user),
    queryFn: () => fetchWalletTransactions(user!.id),
  });
  const withdrawals = useQuery({
    queryKey: ["withdrawals", user?.id],
    enabled: Boolean(user),
    queryFn: () => fetchWithdrawals(user!.id),
  });
  const referrals = useQuery({
    queryKey: ["my-referrals", user?.id],
    enabled: Boolean(user),
    queryFn: () => fetchMyReferrals(user!.id),
  });

  const totals = walletTotals(txns.data ?? [], withdrawals.data ?? []);
  const min = settings.data?.withdrawalMin ?? 100;
  const max = settings.data?.withdrawalMax ?? 10000;

  const referralEarnings = (txns.data ?? [])
    .filter((txn) => txn.type === "REFERRAL_REWARD")
    .reduce((total, txn) => total + txn.amount, 0);
  const successfulReferrals = (referrals.data ?? []).filter(
    (row) => row.status === "rewarded",
  ).length;

  async function withdraw() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Enter the amount you want to withdraw.");
      return;
    }
    if (value > totals.balance) {
      toast.error("You do not have that much balance available.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc("request_withdrawal", {
      _amount: value,
      _upi: upi.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Withdrawal requested.");
    setAmount("");
    void qc.invalidateQueries({ queryKey: ["wallet-txns"] });
    void qc.invalidateQueries({ queryKey: ["withdrawals"] });
  }

  const body = (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Available balance</p>
          <p className="text-2xl font-bold">{rupees(totals.balance)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">On hold</p>
          <p className="text-2xl font-bold">{rupees(totals.onHold)}</p>
        </div>
      </section>

      <ReferralCard />

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Referral earnings</p>
          <p className="text-2xl font-bold">{rupees(referralEarnings)}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Successful referrals</p>
          <p className="text-2xl font-bold">{successfulReferrals}</p>
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Referral history</h2>
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

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div>
          <h2 className="font-semibold">Withdraw to UPI</h2>
          <p className="text-sm text-muted-foreground">
            Between {rupees(min)} and {rupees(max)} per request.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="w-upi">UPI ID</Label>
          <Input
            id="w-upi"
            placeholder="name@bank"
            value={upi}
            onChange={(e) => setUpi(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="w-amount">Amount (₹)</Label>
          <Input
            id="w-amount"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          />
        </div>
        <Button className="w-full" disabled={busy} onClick={() => void withdraw()}>
          {busy ? "Requesting…" : "Withdraw"}
        </Button>
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Withdrawal history</h2>
        {withdrawals.data?.length ? (
          <div className="divide-y divide-border">
            {withdrawals.data.map((request) => (
              <article key={request.id} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">{rupees(request.amount)}</p>
                  <p className="text-xs text-muted-foreground">{request.upi_id}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(request.created_at)}
                  </p>
                  {request.reference_utr ? (
                    <p className="text-xs">Reference: {request.reference_utr}</p>
                  ) : null}
                  {request.admin_note ? <p className="text-xs">{request.admin_note}</p> : null}
                </div>
                <span className="text-sm font-medium">
                  {WITHDRAWAL_STATUS_LABEL[request.status] ?? request.status}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No withdrawals yet.</p>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Transactions</h2>
        {txns.data?.length ? (
          <div className="divide-y divide-border">
            {txns.data.map((txn) => (
              <article key={txn.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium">{WALLET_TXN_LABEL[txn.type] ?? txn.type}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(txn.created_at)}</p>
                </div>
                <span
                  className={`text-sm font-semibold ${txn.amount < 0 ? "text-destructive" : ""}`}
                >
                  {txn.amount < 0 ? "-" : "+"}
                  {rupees(Math.abs(txn.amount))}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No transactions yet"
            description="Earnings and rewards will appear here."
          />
        )}
      </section>
    </div>
  );

  if (role === "admin") return <AdminShell title="My wallet">{body}</AdminShell>;
  if (role === "rider") return <RiderShell title="My wallet">{body}</RiderShell>;
  return <CustomerShell title="My wallet">{body}</CustomerShell>;
}
