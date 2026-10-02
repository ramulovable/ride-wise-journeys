import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** DB keys (app_settings) driving the Live Train Journey screen. */
export const LIVE_TRAIN_KEYS = {
  enabled: "live_train_enabled",
  autoRefresh: "live_train_auto_refresh_enabled",
  intervalSec: "live_train_refresh_interval_seconds",
  animation: "live_train_animation_enabled",
  quality: "live_train_animation_quality",
  dayNight: "live_train_day_night_enabled",
  showSpeed: "live_train_show_speed",
  showTravelled: "live_train_show_distance_travelled",
  showRemaining: "live_train_show_distance_remaining",
  showPrev: "live_train_show_previous_station",
  showNext: "live_train_show_next_station",
  showEta: "live_train_show_eta",
  showDelay: "live_train_show_delay",
  showTimeline: "live_train_show_route_timeline",
  staleMin: "live_train_stale_threshold_minutes",
  fallbackMin: "live_train_failure_fallback_minutes",
} as const;

export type LiveTrainSettingKey = keyof typeof LIVE_TRAIN_KEYS;
export type LiveTrainSettings = Record<LiveTrainSettingKey, number>;

/** Used only until the DB rows load (or if a row is missing). */
const FALLBACK: LiveTrainSettings = {
  enabled: 1, autoRefresh: 1, intervalSec: 90, animation: 1, quality: 2, dayNight: 1,
  showSpeed: 1, showTravelled: 1, showRemaining: 1, showPrev: 1, showNext: 1, showEta: 1,
  showDelay: 1, showTimeline: 1, staleMin: 15, fallbackMin: 60,
};

export async function fetchLiveTrainSettings(): Promise<LiveTrainSettings> {
  const { data } = await supabase
    .from("app_settings")
    .select("key, numeric_value")
    .like("key", "live_train_%");
  const map = new Map((data ?? []).map((r) => [r.key, Number(r.numeric_value)]));
  const out = { ...FALLBACK };
  for (const [k, dbKey] of Object.entries(LIVE_TRAIN_KEYS) as [LiveTrainSettingKey, string][]) {
    const v = map.get(dbKey);
    if (v !== undefined && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export function useLiveTrainSettings() {
  return useQuery({ queryKey: ["live-train-settings"], queryFn: fetchLiveTrainSettings, staleTime: 60_000 });
}
