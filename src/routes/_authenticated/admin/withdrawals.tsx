import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime, rupees } from "@/lib/format";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { WITHDRAWAL_STATUS_LABEL } from "@/lib/wallet";

type Row = {
  id: string;
  user_id: string;
  amount: number;
  upi_id: string;
  status: string;
  admin_note: string | null;
  reference_utr: string | null;
  created_at: string;
  processed_at: string | null;
  name: string;
  mobile: string;
};

const FILTERS = ["ALL", "PENDING", "APPROVED", "PROCESSING", "PAID", "REJECTED"] as const;

export const Route = createFileRoute("/_authenticated/admin/withdrawals")({
  head: () => ({
    meta: [
      { title: "Withdrawals | Shahin Travels Admin" },
      { name: "description", content: "Review and pay out Shahin Travels withdrawal requests." },
      { property: "og:title", content: "Withdrawals | Shahin Travels Admin" },
      {
        property: "og:description",
        content: "Review and pay out Shahin Travels withdrawal requests.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Withdrawals,
});

function Withdrawals() {
  useRoleGuard("admin");
  const qc = useQueryClient();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("PENDING");
  const [utr, setUtr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const requests = useQuery({
    queryKey: ["admin-withdrawals"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("withdrawal_requests")
        .select(
          "id, user_id, amount, upi_id, status, admin_note, reference_utr, created_at, processed_at",
        )
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      const ids = [...new Set(rows.map((row) => row.user_id))];
      const { data: people } = ids.length
        ? await supabase.from("profiles").select("id, full_name, mobile").in("id", ids)
        : { data: [] };
      const map = new Map((people ?? []).map((p) => [p.id, p]));
      return rows.map((row) => ({
        ...row,
        amount: Number(row.amount),
        name: map.get(row.user_id)?.full_name || "User",
        mobile: map.get(row.user_id)?.mobile || "—",
      }));
    },
  });

  const ledger = useQuery({
    queryKey: ["admin-wallet-ledger"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_wallet_transactions")
        .select("id, direction, amount, note, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return (data ?? []).map((row) => ({ ...row, amount: Number(row.amount) }));
    },
  });

  async function update(id: string, status: string) {
    setBusy(id);
    const reference = utr[id]?.trim();
    const { error } = await supabase.rpc("admin_update_withdrawal", {
      _id: id,
      _status: status as never,
      ...(reference ? { _utr: reference } : {}),
    });
    setBusy(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Request marked ${WITHDRAWAL_STATUS_LABEL[status] ?? status}.`);
    void qc.invalidateQueries({ queryKey: ["admin-withdrawals"] });
    void qc.invalidateQueries({ queryKey: ["admin-wallet-ledger"] });
  }

  const rows = (requests.data ?? []).filter((row) => filter === "ALL" || row.status === filter);
  const open = (status: string) => ["PENDING", "APPROVED", "PROCESSING"].includes(status);

  return (
    <AdminShell title="Withdrawals" subtitle="Approve, reject and record real payouts.">
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Button
            key={item}
            size="sm"
            variant={filter === item ? "default" : "outline"}
            onClick={() => setFilter(item)}
          >
            {item === "ALL" ? "All" : (WITHDRAWAL_STATUS_LABEL[item] ?? item)}
          </Button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No withdrawal requests"
          description="Requests from customers and drivers appear here."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <article key={row.id} className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {row.name} · {rupees(row.amount)}
                  </p>
                  <p className="text-xs text-muted-foreground">{row.mobile}</p>
                  <p className="text-xs text-muted-foreground">UPI: {row.upi_id}</p>
                  <p className="text-xs text-muted-foreground">
                    Requested {formatDateTime(row.created_at)}
                  </p>
                  {row.reference_utr ? (
                    <p className="text-xs">Reference: {row.reference_utr}</p>
                  ) : null}
                </div>
                <span className="text-sm font-medium">
                  {WITHDRAWAL_STATUS_LABEL[row.status] ?? row.status}
                </span>
              </div>

              {open(row.status) ? (
                <div className="space-y-2">
                  <Input
                    placeholder="Payment reference / UTR"
                    value={utr[row.id] ?? ""}
                    onChange={(e) => setUtr((prev) => ({ ...prev, [row.id]: e.target.value }))}
                  />
                  <div className="flex flex-wrap gap-2">
                    {row.status === "PENDING" ? (
                      <Button
                        size="sm"
                        disabled={busy === row.id}
                        onClick={() => void update(row.id, "APPROVED")}
                      >
                        Approve
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy === row.id}
                      onClick={() => void update(row.id, "PROCESSING")}
                    >
                      Mark processing
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy === row.id}
                      onClick={() => void update(row.id, "PAID")}
                    >
                      Mark paid
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy === row.id}
                      onClick={() => void update(row.id, "REJECTED")}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy === row.id}
                      onClick={() => void update(row.id, "FAILED")}
                    >
                      Payment failed
                    </Button>
                  </div>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <section className="mt-6 space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-semibold">Business payout ledger</h2>
        {ledger.data?.length ? (
          <div className="divide-y divide-border">
            {ledger.data.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span>
                  {row.note || "Payout"} · {formatDateTime(row.created_at)}
                </span>
                <span className="font-semibold">
                  {row.direction === "out" ? "-" : "+"}
                  {rupees(row.amount)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No payouts recorded yet.</p>
        )}
      </section>
    </AdminShell>
  );
}
