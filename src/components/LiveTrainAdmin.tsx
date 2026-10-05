import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LIVE_TRAIN_KEYS, useLiveTrainSettings, type LiveTrainSettingKey, type LiveTrainSettings } from "@/lib/live-train-settings";

const TOGGLES: Array<[LiveTrainSettingKey, string]> = [
  ["enabled", "Live Train Status enabled"],
  ["autoRefresh", "Auto refresh"],
  ["animation", "Animated railway scene"],
  ["dayNight", "Day / night scene"],
  ["showSpeed", "Show speed"],
  ["showTravelled", "Show distance travelled"],
  ["showRemaining", "Show distance remaining"],
  ["showPrev", "Show previous station"],
  ["showNext", "Show next station"],
  ["showEta", "Show ETA"],
  ["showDelay", "Show delay"],
  ["showTimeline", "Show route timeline"],
];
const NUMBERS: Array<[LiveTrainSettingKey, string, number, number]> = [
  ["intervalSec", "Refresh interval (seconds)", 1, 3600],
  ["quality", "Animation quality (1 low – 3 high)", 1, 3],
  ["staleMin", "Stale data threshold (minutes)", 1, 600],
  ["fallbackMin", "API failure fallback (minutes)", 1, 1440],
];

export function LiveTrainAdmin() {
  const { data } = useLiveTrainSettings();
  const qc = useQueryClient();
  const [v, setV] = useState<LiveTrainSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setV(data); }, [data]);
  if (!v) return null;

  async function save() {
    if (!v) return;
    for (const [k, label, min, max] of NUMBERS) {
      if (!Number.isFinite(v[k]) || v[k] < min || v[k] > max) { toast.error(`${label}: ${min}–${max}`); return; }
    }
    setBusy(true);
    const res = await Promise.all(
      (Object.keys(LIVE_TRAIN_KEYS) as LiveTrainSettingKey[]).map((k) =>
        supabase.from("app_settings").update({ numeric_value: v[k] }).eq("key", LIVE_TRAIN_KEYS[k]),
      ),
    );
    setBusy(false);
    const f = res.find((r) => r.error);
    if (f?.error) { toast.error(f.error.message); return; }
    toast.success("Live train settings saved.");
    void qc.invalidateQueries({ queryKey: ["live-train-settings"] });
  }

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <p className="font-bold">Live Train Status</p>
      {TOGGLES.map(([k, label]) => (
        <label key={k} className="flex items-center justify-between gap-2 text-sm">
          {label}
          <input type="checkbox" className="size-5" checked={v[k] === 1}
            onChange={(e) => setV({ ...v, [k]: e.target.checked ? 1 : 0 })} />
        </label>
      ))}
      {NUMBERS.map(([k, label]) => (
        <div key={k} className="space-y-1">
          <Label>{label}</Label>
          <Input type="number" value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} />
        </div>
      ))}
      <Button onClick={save} disabled={busy} className="w-full">{busy ? "Saving..." : "Save live train settings"}</Button>
    </div>
  );
}
