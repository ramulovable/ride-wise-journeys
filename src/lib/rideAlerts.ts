import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type RideAlertSettings = {
  id: string;
  full_screen_enabled: boolean;
  sound_enabled: boolean;
  vibration_enabled: boolean;
  alert_sound: string;
  alert_duration_seconds: number;
  response_timeout_seconds: number;
  max_riders_notified: number;
  retry_interval_seconds: number;
  notification_priority: string;
};

export const DEFAULT_RIDE_ALERT_SETTINGS: RideAlertSettings = {
  id: "",
  full_screen_enabled: true,
  sound_enabled: true,
  vibration_enabled: true,
  alert_sound: "chime",
  alert_duration_seconds: 30,
  response_timeout_seconds: 60,
  max_riders_notified: 5,
  retry_interval_seconds: 15,
  notification_priority: "high",
};

export async function fetchRideAlertSettings(): Promise<RideAlertSettings> {
  const { data, error } = await supabase
    .from("ride_alert_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RideAlertSettings | null) ?? DEFAULT_RIDE_ALERT_SETTINGS;
}

/** Live ride-alert rules set by the admin. Never hardcoded in the app. */
export function useRideAlertSettings() {
  return useQuery({
    queryKey: ["ride-alert-settings"],
    queryFn: fetchRideAlertSettings,
    staleTime: 60_000,
  });
}
