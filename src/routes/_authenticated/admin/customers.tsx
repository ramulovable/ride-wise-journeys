import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/shells";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  deleteCustomerAccount,
  getAdminCustomers,
  setCustomerBlocked,
} from "@/lib/api.functions";
import { formatDateTime, rupees } from "@/lib/format";
import { getAdminCustomerDetails } from "@/lib/rescue.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRoleGuard } from "@/lib/useRoleGuard";

export const Route = createFileRoute("/_authenticated/admin/customers")({
  head: () => ({
    meta: [
      { title: "All Customers | Shahin Travels Admin" },
      {
        name: "description",
        content: "Review Shahin Travels customer accounts and booking totals.",
      },
      { property: "og:title", content: "All Customers | Shahin Travels Admin" },
      {
        property: "og:description",
        content: "Review Shahin Travels customer accounts and booking totals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Customers,
});

function Customers() {
  useRoleGuard("admin");
  const queryClient = useQueryClient();
  const customers = useQuery({ queryKey: ["admin-customers"], queryFn: () => getAdminCustomers() });
  const blockCustomer = useMutation({
    mutationFn: ({ customerId, blocked }: { customerId: string; blocked: boolean }) =>
      setCustomerBlocked({ data: { customerId, blocked } }),
    onSuccess: (_, variables) => {
      toast.success(variables.blocked ? "Customer blocked." : "Customer reactivated.");
      void queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    full_name: string;
    mobile: string;
  } | null>(null);
  const removeCustomer = useMutation({
    mutationFn: (customerId: string) => deleteCustomerAccount({ data: { customerId } }),
    onSuccess: () => {
      toast.success("Customer account deleted successfully.");
      setPendingDelete(null);
      void queryClient.invalidateQueries({ queryKey: ["admin-customers"] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <AdminShell title="All customers" subtitle="Registered customer accounts and booking activity.">
      {customers.isError ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {customers.error.message}
        </p>
      ) : customers.isSuccess && customers.data.length === 0 ? (
        <EmptyState
          title="No customers"
          description="Registered customer accounts will appear here."
        />
      ) : (
        <div className="space-y-3">
          {customers.data?.map((customer) => (
            <article key={customer.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">{customer.full_name || "Unnamed customer"}</h2>
                    <Badge variant={customer.is_blocked ? "destructive" : "secondary"}>
                      {customer.is_blocked ? "Blocked" : "Active"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{customer.mobile}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Registered {formatDateTime(customer.created_at)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary">{customer.totalRides}</p>
                  <p className="text-xs text-muted-foreground">rides booked</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t pt-3">
                <Button size="sm" variant="outline" onClick={() => setDetailsFor(customer.id)}>
                  View details
                </Button>
                <Button
                  size="sm"
                  variant={customer.is_blocked ? "outline" : "destructive"}
                  disabled={blockCustomer.isPending}
                  onClick={() =>
                    blockCustomer.mutate({ customerId: customer.id, blocked: !customer.is_blocked })
                  }
                >
                  {customer.is_blocked ? "Reactivate account" : "Block account"}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={removeCustomer.isPending}
                  onClick={() =>
                    setPendingDelete({
                      id: customer.id,
                      full_name: customer.full_name || "Unnamed customer",
                      mobile: customer.mobile,
                    })
                  }
                >
                  <Trash2 className="mr-1 h-4 w-4" />
                  Delete Customer
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      <CustomerDetailsDialog id={detailsFor} onClose={() => setDetailsFor(null)} />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer Account?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {pendingDelete?.full_name} ({pendingDelete?.mobile})?
              This action will permanently remove their profile, authentication record, and
              associated customer records. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removeCustomer.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={removeCustomer.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (pendingDelete) removeCustomer.mutate(pendingDelete.id);
              }}
            >
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminShell>
  );
}

function CustomerDetailsDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["admin-customer-details", id],
    queryFn: () => getAdminCustomerDetails({ data: { id: id! } }),
    enabled: Boolean(id),
  });
  const d = q.data;
  const row = (k: string, v: import("react").ReactNode) => (
    <div className="flex justify-between gap-3 border-b border-border py-1.5 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
  return (
    <Dialog open={id !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Customer details</DialogTitle>
        </DialogHeader>
        {q.isError ? <p className="text-sm text-destructive">{q.error.message}</p> : null}
        {!d ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {d.profile.photo_url ? (
                <a href={d.profile.photo_url} target="_blank" rel="noreferrer">
                  <img src={d.profile.photo_url} alt="" className="h-16 w-16 rounded-full object-cover" />
                </a>
              ) : (
                <span className="h-16 w-16 rounded-full bg-muted" />
              )}
              <div>
                <p className="font-semibold">{d.profile.full_name || "Unnamed customer"}</p>
                <p className="text-sm text-muted-foreground">{d.profile.mobile}</p>
              </div>
            </div>
            <div>
              {row("Address", d.profile.address || "—")}
              {row("Date of birth", d.profile.date_of_birth || "—")}
              {row("Language", d.profile.preferred_language)}
              {row("Registered", formatDateTime(d.profile.created_at))}
              {row("App version", d.profile.app_version ? `v${d.profile.app_version}` : "Website / unknown")}
              {row("Phone alerts", d.phoneAlerts ? "On" : "Off")}
              {row("Status", d.profile.is_blocked ? "Blocked" : "Active")}
              {row("Own referral code", d.profile.my_referral_code || "—")}
              {row("Referred by", d.referrerName || "—")}
              {row("People referred", d.referredCount)}
              {row("Wallet balance", rupees(d.wallet))}
              {row("Total rides", d.stats.total)}
              {row("Completed / Cancelled", `${d.stats.completed} / ${d.stats.cancelled}`)}
              {row("Total spent", rupees(d.stats.spent))}
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold">Recent rides</p>
              {d.recent.length === 0 ? (
                <p className="text-xs text-muted-foreground">No rides yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {d.recent.map((r) => (
                    <li key={r.id} className="rounded-md border border-border p-2 text-xs">
                      <p className="font-medium">
                        {r.from} → {r.to}
                      </p>
                      <p className="text-muted-foreground">
                        {formatDateTime(r.created_at)} · {r.status} · {rupees(Number(r.total_fare))}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
