import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_SUPPORT_PHONE = "9334039007";
export const DEFAULT_SUPPORT_EMAIL = "ayankha8866@gmail.com";
export const DEFAULT_SUBSCRIPTION_FEE = 99;

export type AppSettings = {
  supportPhone: string;
  supportEmail: string;
  subscriptionFee: number;
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
