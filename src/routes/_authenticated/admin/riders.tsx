import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BadgeCheck, Star, Wallet } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { ProfileAvatar, VerifiedByline, VerifiedTick } from "@/components/ProfileAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteRiderAccount,
  getAdminRiderProfile,
  getAdminRiderReviews,
  getAdminRiderWallet,
  getAdminRiderWalletSummaries,
  recordSubscription,
  setRiderApproval,
  setRiderBlocked,
  setRiderVerified,
} from "@/lib/api.functions";
import { formatDateTime, rupees } from "@/lib/format";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { WALLET_TXN_LABEL, WITHDRAWAL_STATUS_LABEL } from "@/lib/wallet";

export const Route = createFileRoute("/_authenticated/admin/riders")({ component: Riders });

function Riders() {
  useRoleGuard("admin");
  const qc = useQueryClient();
  const [amount, setAmount] = useState("99");
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const [reviewsFor, setReviewsFor] = useState<string | null>(null);
  const [walletFor, setWalletFor] = useState<string | null>(null);

  const riders = useQuery({
    queryKey: ["admin-riders"],
    queryFn: async () => {
      const { data: details, error } = await supabase
        .from("rider_details")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      const ids = (details ?? []).map((x) => x.user_id);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id,full_name,mobile,photo_url").in("id", ids)
        : { data: [] };
      return (details ?? []).map((d) => ({
        ...d,
        profile: profiles?.find((p) => p.id === d.user_id),
      }));
    },
  });

  const riderIds = (riders.data ?? []).map((r) => r.user_id);
  const wallets = useQuery({
    queryKey: ["admin-rider-wallets", riderIds.join(",")],
    enabled: riderIds.length > 0,
    queryFn: () => getAdminRiderWalletSummaries({ data: { riderIds } }),
  });
  const walletOf = (id: string) => wallets.data?.find((w) => w.riderId === id);

  async function run(fn: Promise<unknown>, message: string) {
    try {
      await fn;
      toast.success(message);
      void qc.invalidateQueries({ queryKey: ["admin-riders"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  }

  return (
    <AdminShell title="Driver management" subtitle="Approve drivers and record cash subscriptions.">
      <div className="mb-4 flex max-w-xs items-center gap-2">
        <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <span className="text-xs text-muted-foreground">monthly cash fee</span>
      </div>
      {riders.isSuccess && riders.data.length === 0 ? (
        <EmptyState title="No drivers" description="Registered driver accounts will appear here." />
      ) : (
        <div className="space-y-3">
          {riders.data?.map((r) => (
            <article key={r.user_id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div className="flex gap-3">
                  <ProfileAvatar
                    path={r.profile?.photo_url}
                    name={r.profile?.full_name}
                    size={44}
                  />
                  <div>
                    <p className="flex items-center gap-1.5 font-semibold">
                      <span>{r.profile?.full_name || "Unnamed driver"}</span>
                      {r.is_verified ? <VerifiedTick /> : null}
                    </p>
                    {r.is_verified ? <VerifiedByline className="block" /> : null}
                    <p className="text-xs text-muted-foreground">
                      {r.profile?.mobile} · {r.is_online ? "Online" : "Offline"}
                    </p>
                    <p className="mt-1 text-xs">
                      Subscription: {r.subscription_valid_until || "not paid"}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
                        <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                        Wallet: {wallets.isPending ? "…" : rupees(walletOf(r.user_id)?.balance ?? 0)}
                      </span>
                      {(walletOf(r.user_id)?.onHold ?? 0) > 0 ? (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-medium text-amber-700 dark:text-amber-400">
                          Payout pending: {rupees(walletOf(r.user_id)!.onHold)}
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDetailsFor(r.user_id)}>
                    View details
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setReviewsFor(r.user_id)}>
                    Ratings &amp; reviews
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setWalletFor(r.user_id)}>
                    <Wallet className="mr-1.5 h-4 w-4" />
                    View wallet
                  </Button>
                  <Button
                    size="sm"
                    variant={r.is_verified ? "secondary" : "outline"}
                    onClick={() =>
                      run(
                        setRiderVerified({
                          data: { riderId: r.user_id, verified: !r.is_verified },
                        }),
                        r.is_verified ? "Blue tick removed." : "Blue tick granted.",
                      )
                    }
                  >
                    <BadgeCheck className="mr-1.5 h-4 w-4" />
                    {r.is_verified ? "Remove blue tick" : "Grant blue tick"}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      run(
                        setRiderApproval({
                          data: { riderId: r.user_id, approved: !r.is_approved },
                        }),
                        r.is_approved ? "Approval removed." : "Driver approved.",
                      )
                    }
                  >
                    {r.is_approved ? "Unapprove" : "Approve"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      run(
                        recordSubscription({
                          data: { riderId: r.user_id, amount: Number(amount), months: 1 },
                        }),
                        "Cash subscription recorded.",
                      )
                    }
                  >
                    Record 1 month
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      run(
                        setRiderBlocked({ data: { riderId: r.user_id, blocked: !r.is_blocked } }),
                        r.is_blocked ? "Driver unblocked." : "Driver blocked.",
                      )
                    }
                  >
                    {r.is_blocked ? "Unblock" : "Block"}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (confirm("Permanently delete this driver account?"))
                        void run(
                          deleteRiderAccount({ data: { riderId: r.user_id } }),
                          "Driver deleted.",
                        );
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <RiderDetailsDialog riderId={detailsFor} onClose={() => setDetailsFor(null)} />
      <RiderReviewsDialog riderId={reviewsFor} onClose={() => setReviewsFor(null)} />
      <RiderWalletDialog riderId={walletFor} onClose={() => setWalletFor(null)} />
    </AdminShell>
  );
}

function RiderDetailsDialog({ riderId, onClose }: { riderId: string | null; onClose: () => void }) {
  const details = useQuery({
    queryKey: ["admin-rider-profile", riderId],
    enabled: Boolean(riderId),
    queryFn: () => getAdminRiderProfile({ data: { riderId: riderId! } }),
  });

  return (
    <Dialog open={Boolean(riderId)} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Driver details</DialogTitle>
          <DialogDescription>Personal information and registered vehicles.</DialogDescription>
        </DialogHeader>
        {details.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {details.data ? (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-3">
              <ProfileAvatar path={details.data.photoPath} name={details.data.name} size={56} />
              <div>
                <p className="flex items-center gap-1.5 font-semibold">
                  <span>{details.data.name}</span>
                  {details.data.isVerified ? <VerifiedTick /> : null}
                </p>
                {details.data.isVerified ? <VerifiedByline className="block" /> : null}
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2">
              <dt className="text-muted-foreground">Mobile</dt>
              <dd>{details.data.mobile || "—"}</dd>
              <dt className="text-muted-foreground">Address</dt>
              <dd>{details.data.address || "—"}</dd>
              <dt className="text-muted-foreground">Joined</dt>
              <dd>
                {details.data.joinedAt
                  ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
                      new Date(details.data.joinedAt),
                    )
                  : "—"}
              </dd>
              <dt className="text-muted-foreground">Subscription</dt>
              <dd>{details.data.subscriptionValidUntil || "not paid"}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                {details.data.isBlocked
                  ? "Blocked"
                  : details.data.isApproved
                    ? "Approved"
                    : "Pending approval"}
              </dd>
            </dl>
            <div>
              <h3 className="mb-2 font-semibold">Registered vehicles</h3>
              {details.data.vehicles.length === 0 ? (
                <p className="text-muted-foreground">No vehicles added yet.</p>
              ) : (
                <ul className="space-y-2">
                  {details.data.vehicles.map((vehicle) => (
                    <li key={vehicle.id} className="rounded-xl border p-3">
                      <p className="font-medium">{vehicle.number}</p>
                      <p className="text-xs text-muted-foreground">
                        {[
                          vehicle.category,
                          vehicle.brand,
                          vehicle.model,
                          vehicle.hasAc ? "AC" : null,
                          vehicle.isActive ? "Active" : "Inactive",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RiderReviewsDialog({ riderId, onClose }: { riderId: string | null; onClose: () => void }) {
  const reviews = useQuery({
    queryKey: ["admin-rider-reviews", riderId],
    enabled: Boolean(riderId),
    queryFn: () => getAdminRiderReviews({ data: { riderId: riderId! } }),
  });

  return (
    <Dialog open={Boolean(riderId)} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ratings &amp; reviews</DialogTitle>
          <DialogDescription>Customer feedback for this driver.</DialogDescription>
        </DialogHeader>
        {reviews.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {reviews.data ? (
          <div className="space-y-4 text-sm">
            <div className="flex items-center gap-2 text-lg font-bold">
              <Star className="fill-primary text-primary" aria-hidden="true" />
              {reviews.data.total ? reviews.data.average.toFixed(1) : "—"}
              <span className="text-sm font-normal text-muted-foreground">
                ({reviews.data.total} {reviews.data.total === 1 ? "review" : "reviews"})
              </span>
            </div>
            {reviews.data.total === 0 ? (
              <p className="text-muted-foreground">No customer reviews yet.</p>
            ) : (
              <div className="divide-y divide-border">
                {reviews.data.reviews.map((review) => (
                  <article key={review.id} className="space-y-1 py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{review.customerName}</span>
                      <span className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-primary text-primary" aria-hidden="true" />
                        {review.stars.toFixed(1)}
                      </span>
                    </div>
                    {review.comment ? (
                      <p className="text-muted-foreground">{review.comment}</p>
                    ) : null}
                    <time
                      className="block text-xs text-muted-foreground"
                      dateTime={review.createdAt}
                    >
                      {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
                        new Date(review.createdAt),
                      )}
                    </time>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RiderWalletDialog({ riderId, onClose }: { riderId: string | null; onClose: () => void }) {
  const wallet = useQuery({
    queryKey: ["admin-rider-wallet", riderId],
    enabled: Boolean(riderId),
    queryFn: () => getAdminRiderWallet({ data: { riderId: riderId! } }),
  });

  return (
    <Dialog open={Boolean(riderId)} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Driver wallet</DialogTitle>
          <DialogDescription>Balance, earnings history and payout requests.</DialogDescription>
        </DialogHeader>
        {wallet.isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {wallet.data ? (
          <div className="space-y-4 text-sm">
            <div className="rounded-2xl border bg-muted/40 p-4">
              <p className="font-semibold">{wallet.data.name}</p>
              <p className="text-xs text-muted-foreground">{wallet.data.mobile || "—"}</p>
              <p className="mt-3 text-3xl font-bold text-primary">{rupees(wallet.data.balance)}</p>
              <p className="text-xs text-muted-foreground">Available balance</p>
              {wallet.data.onHold > 0 ? (
                <p className="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                  {rupees(wallet.data.onHold)} held for pending payout requests
                </p>
              ) : null}
            </div>

            <div>
              <h3 className="mb-2 font-semibold">Payout requests</h3>
              {wallet.data.withdrawals.length === 0 ? (
                <p className="text-muted-foreground">No payout requests yet.</p>
              ) : (
                <ul className="space-y-2">
                  {wallet.data.withdrawals.map((row) => (
                    <li key={row.id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium">{rupees(row.amount)}</span>
                        <span className="text-xs text-muted-foreground">
                          {WITHDRAWAL_STATUS_LABEL[row.status] ?? row.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">UPI: {row.upi_id}</p>
                      {row.reference_utr ? (
                        <p className="text-xs text-muted-foreground">UTR: {row.reference_utr}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {formatDateTime(row.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Process payments from the Withdrawals page.
              </p>
            </div>

            <div>
              <h3 className="mb-2 font-semibold">Wallet history</h3>
              {wallet.data.transactions.length === 0 ? (
                <p className="text-muted-foreground">No wallet activity yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {wallet.data.transactions.map((txn) => (
                    <article key={txn.id} className="flex items-center justify-between gap-3 py-2">
                      <div>
                        <p className="font-medium">{WALLET_TXN_LABEL[txn.type] ?? txn.type}</p>
                        <p className="text-xs text-muted-foreground">
                          {txn.note || formatDateTime(txn.created_at)}
                        </p>
                      </div>
                      <span
                        className={
                          txn.amount < 0 ? "font-semibold text-destructive" : "font-semibold"
                        }
                      >
                        {rupees(txn.amount)}
                      </span>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
