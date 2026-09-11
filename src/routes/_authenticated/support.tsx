import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell, CustomerShell, RiderShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({
    meta: [
      { title: "Support — Shahin Travels" },
      {
        name: "description",
        content: "Contact the Shahin Travels team for help with a ride or your account.",
      },
      { property: "og:title", content: "Support — Shahin Travels" },
      { property: "og:description", content: "Contact the Shahin Travels team for help." },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  const { user, role } = useAuth();
  const queryClient = useQueryClient();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const requests = useQuery({
    queryKey: ["my-support", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("support_requests")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  async function submit() {
    if (subject.trim().length < 3 || message.trim().length < 5) {
      toast.error("Add a short subject and describe the problem.");
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from("support_requests")
      .insert({ user_id: user!.id, subject: subject.trim(), message: message.trim() });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setSubject("");
    setMessage("");
    toast.success("Support request sent.");
    void queryClient.invalidateQueries({ queryKey: ["my-support", user?.id] });
  }

  const body = (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="s-subject">Subject</Label>
          <Input
            id="s-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={120}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-message">How can we help?</Label>
          <Textarea
            id="s-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={1000}
          />
        </div>
        <Button className="w-full" onClick={submit} disabled={busy}>
          {busy ? "Sending…" : "Send request"}
        </Button>
      </section>

      {requests.isSuccess && requests.data.length === 0 ? (
        <EmptyState
          title="No support requests yet"
          description="Anything you send will be listed here with its reply."
        />
      ) : (
        <div className="space-y-3">
          {(requests.data ?? []).map((r) => (
            <article key={r.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{r.subject}</p>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize">
                  {r.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(r.created_at)}</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{r.message}</p>
              {r.admin_reply ? (
                <p className="mt-3 rounded-xl bg-primary/10 p-3 text-sm text-foreground">
                  <span className="font-medium">Reply: </span>
                  {r.admin_reply}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </div>
  );

  if (role === "admin") return <AdminShell title="Support">{body}</AdminShell>;
  if (role === "rider") return <RiderShell title="Support">{body}</RiderShell>;
  return <CustomerShell title="Support">{body}</CustomerShell>;
}
