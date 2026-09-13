import { supabase } from "@/integrations/supabase/client";

export type WalletTxn = {
  id: string;
  type: string;
  amount: number;
  note: string | null;
  created_at: string;
};

export const WALLET_TXN_LABEL: Record<string, string> = {
  REFERRAL_REWARD: "Referral reward",
  RIDE_EARNING: "Ride earning",
  WITHDRAWAL_HOLD: "Withdrawal on hold",
  WITHDRAWAL_DEBIT: "Payout completed",
  WITHDRAWAL_REVERSAL: "Withdrawal returned",
  ADMIN_ADJUSTMENT: "Adjustment",
};

export const WITHDRAWAL_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  PROCESSING: "Processing",
  PAID: "Paid",
  REJECTED: "Rejected",
  FAILED: "Failed",
  REVERSED: "Reversed",
};

export const OPEN_WITHDRAWAL_STATUSES = ["PENDING", "APPROVED", "PROCESSING"] as const;

export type WithdrawalRequest = {
  id: string;
  user_id: string;
  amount: number;
  upi_id: string;
  status: string;
  admin_note: string | null;
  reference_utr: string | null;
  processed_at: string | null;
  created_at: string;
};

export async function fetchWalletTransactions(userId: string): Promise<WalletTxn[]> {
  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("id, type, amount, note, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ ...row, amount: Number(row.amount) }));
}

export async function fetchWithdrawals(userId: string): Promise<WithdrawalRequest[]> {
  const { data, error } = await supabase
    .from("withdrawal_requests")
    .select("id, user_id, amount, upi_id, status, admin_note, reference_utr, processed_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ ...row, amount: Number(row.amount) }));
}

export function walletTotals(txns: WalletTxn[], withdrawals: WithdrawalRequest[]) {
  const balance = txns.reduce((total, txn) => total + txn.amount, 0);
  const onHold = withdrawals
    .filter((request) => (OPEN_WITHDRAWAL_STATUSES as readonly string[]).includes(request.status))
    .reduce((total, request) => total + request.amount, 0);
  return { balance, onHold };
}
