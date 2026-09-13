import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_SUPPORT_PHONE = "9334039007";
export const DEFAULT_SUPPORT_EMAIL = "ayankha8866@gmail.com";
export const DEFAULT_SUBSCRIPTION_FEE = 99;
export const DEFAULT_REFERRAL_REWARD = 20;
export const DEFAULT_WITHDRAWAL_MIN = 100;
export const DEFAULT_WITHDRAWAL_MAX = 10000;
export const DEFAULT_QR_BASE_URL = "https://shahintravels.app/vehicle";
export const DEFAULT_PUSH_TITLE = "New ride request";
export const DEFAULT_PUSH_BODY = "{pickup} to {drop} · {distance} km · Rs {fare}";
export const DEFAULT_REFERRAL_ENABLED = true;
export const DEFAULT_REFERRAL_MAX_PER_USER = 0;
export const DEFAULT_REFERRAL_CONDITION = "first_ride";
export const DEFAULT_REFERRAL_INVITE_URL = "https://shahintravels.app";
export const DEFAULT_REFERRAL_INVITE_MESSAGE =
  "Book rides with Shahin Travels. Use my referral code {code} and we both earn {reward}. {link}";
export const DEFAULT_REFERRAL_COPY_TOAST = "Referral code copied.";

export type AppSettings = {
  supportPhone: string;
  supportEmail: string;
  subscriptionFee: number;
  referralReward: number;
  withdrawalMin: number;
  withdrawalMax: number;
  qrBaseUrl: string;
  pushTitle: string;
  pushBody: string;
  referralEnabled: boolean;
  referralMaxPerUser: number;
  referralCondition: string;
  referralInviteUrl: string;
  referralInviteMessage: string;
  referralCopyToast: string;
};

export async function fetchAppSettings(): Promise<AppSettings> {
  const [textResult, numericResult] = await Promise.all([
    supabase.from("app_text_settings").select("key, value"),
    supabase.from("app_settings").select("key, numeric_value"),
  ]);
  const text = new Map((textResult.data ?? []).map((row) => [row.key, row.value]));
  const numeric = new Map(
    (numericResult.data ?? []).map((row) => [row.key, Number(row.numeric_value)]),
  );
  return {
    supportPhone: text.get("support_phone") || DEFAULT_SUPPORT_PHONE,
    supportEmail: text.get("support_email") || DEFAULT_SUPPORT_EMAIL,
    subscriptionFee: numeric.get("rider_monthly_subscription_fee") ?? DEFAULT_SUBSCRIPTION_FEE,
    referralReward: numeric.get("referral_reward_amount") ?? DEFAULT_REFERRAL_REWARD,
    withdrawalMin: numeric.get("withdrawal_min_amount") ?? DEFAULT_WITHDRAWAL_MIN,
    withdrawalMax: numeric.get("withdrawal_max_amount") ?? DEFAULT_WITHDRAWAL_MAX,
    qrBaseUrl: text.get("qr_base_url") || DEFAULT_QR_BASE_URL,
    pushTitle: text.get("push_title_template") || DEFAULT_PUSH_TITLE,
    pushBody: text.get("push_body_template") || DEFAULT_PUSH_BODY,
  };
}

export function useAppSettings() {
  return useQuery({ queryKey: ["app-settings"], queryFn: fetchAppSettings, staleTime: 60_000 });
}

export function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}`;
}
