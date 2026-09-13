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
import { formatDateTime } from "@/lib/format";
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
              <div className="mt-4 border-t pt-3">
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
              </div>
            </article>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
