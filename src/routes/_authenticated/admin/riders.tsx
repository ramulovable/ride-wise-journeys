import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  deleteRiderAccount,
  recordSubscription,
  setRiderApproval,
  setRiderBlocked,
} from "@/lib/api.functions";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/admin/riders")({ component: Riders });
function Riders() {
  useRoleGuard("admin");
  const qc = useQueryClient();
  const [amount, setAmount] = useState("500");
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
        ? await supabase.from("profiles").select("id,full_name,mobile").in("id", ids)
        : { data: [] };
      return (details ?? []).map((d) => ({
        ...d,
        profile: profiles?.find((p) => p.id === d.user_id),
      }));
    },
  });
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
                <div>
                  <p className="font-semibold">{r.profile?.full_name || "Unnamed driver"}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.profile?.mobile} · {r.is_online ? "Online" : "Offline"}
                  </p>
                  <p className="mt-1 text-xs">
                    Subscription: {r.subscription_valid_until || "not paid"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
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
    </AdminShell>
  );
}
