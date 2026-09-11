import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTime } from "@/lib/format";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/admin/support")({ component: Support });
function Support() {
  useRoleGuard("admin");
  const qc = useQueryClient();
  const [replies, setReplies] = useState<Record<string, string>>({});
  const requests = useQuery({
    queryKey: ["admin-support"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  async function reply(id: string) {
    const text = replies[id]?.trim();
    if (!text) {
      toast.error("Enter a reply.");
      return;
    }
    const { error } = await supabase
      .from("support_requests")
      .update({ admin_reply: text, status: "resolved" })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Reply sent.");
      void qc.invalidateQueries({ queryKey: ["admin-support"] });
    }
  }
  return (
    <AdminShell title="Support inbox" subtitle="Reply to customer and driver requests.">
      {requests.isSuccess && requests.data.length === 0 ? (
        <EmptyState title="No support requests" description="New help requests will appear here." />
      ) : (
        <div className="space-y-3">
          {requests.data?.map((r) => (
            <article key={r.id} className="rounded-2xl border bg-card p-4">
              <div className="flex justify-between">
                <p className="font-semibold">{r.subject}</p>
                <span className="text-xs capitalize">{r.status}</span>
              </div>
              <p className="text-xs text-muted-foreground">{formatDateTime(r.created_at)}</p>
              <p className="my-3 text-sm">{r.message}</p>
              {r.admin_reply ? (
                <p className="rounded-xl bg-primary/10 p-3 text-sm">
                  <strong>Reply:</strong> {r.admin_reply}
                </p>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Write an admin reply"
                    value={replies[r.id] ?? ""}
                    onChange={(e) => setReplies({ ...replies, [r.id]: e.target.value })}
                  />
                  <Button onClick={() => reply(r.id)}>Reply & resolve</Button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
