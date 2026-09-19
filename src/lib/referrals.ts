import { supabase } from "@/integrations/supabase/client";
import { rupees } from "@/lib/format";

export type ReferralRow = {
  id: string;
  code: string;
  status: string;
  reward_amount: number;
  created_at: string;
  rewarded_at: string | null;
  referred_user_id: string;
};

export const REFERRAL_STATUS_LABEL: Record<string, string> = {
  pending: "Waiting for first ride",
  rewarded: "Reward credited",
  cancelled: "Cancelled",
};

/** Reads the user's permanent code, generating and saving one if the account has none. */
export async function fetchMyReferralCode(): Promise<string> {
  const { data, error } = await supabase.rpc("ensure_referral_code", {});
  if (error) throw new Error(error.message);
  return data ?? "";
}

export async function fetchMyReferrals(userId: string): Promise<ReferralRow[]> {
  const { data, error } = await supabase
    .from("referrals")
    .select("id, code, status, reward_amount, created_at, rewarded_at, referred_user_id")
    .eq("referrer_user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({ ...row, reward_amount: Number(row.reward_amount) }));
}

export async function fetchReferralEarnings(userId: string): Promise<number> {
  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("amount")
    .eq("user_id", userId)
    .eq("type", "REFERRAL_REWARD");
  if (error) throw new Error(error.message);
  return (data ?? []).reduce((total, row) => total + Number(row.amount), 0);
}

export type RewardCondition = {
  code: string;
  display_name: string;
  description: string;
  event_type: string;
};

/** Admin-managed list of reward conditions the referral engine supports. */
export async function fetchRewardConditions(): Promise<RewardCondition[]> {
  const { data, error } = await supabase
    .from("referral_reward_conditions")
    .select("code, display_name, description, event_type")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Personal invite link: the configured landing URL plus the user's own code. */
export function buildInviteLink(baseUrl: string, code: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  if (!code) return base;
  return `${base}/?ref=${encodeURIComponent(code)}`;
}

export function buildInviteMessage(
  template: string,
  code: string,
  reward: number,
  link: string,
): string {
  return template
    .replaceAll("{code}", code)
    .replaceAll("{reward}", rupees(reward))
    .replaceAll("{link}", link)
    .trim();
}
