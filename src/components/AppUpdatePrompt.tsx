import { useEffect, useRef, useState } from "react";
import { Download, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAppSettings } from "@/lib/settings";
import {
  isNativeApp,
  isNewerVersion,
  nativeAppVersion,
  readUpdateProgress,
  startInAppUpdate,
  supportsInAppUpdate,
} from "@/lib/native-permissions";

/**
 * Shows an update dialog inside the Android app when the version published by
 * the admin is newer than the installed one. The new APK downloads inside the
 * app and the system installer replaces the old app in place.
 */
export function AppUpdatePrompt() {
  const { data: settings } = useAppSettings();
  const [installed, setInstalled] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;
    setInstalled(nativeAppVersion());
  }, []);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  const latest = settings?.androidAppVersion?.trim() || "";
  const downloadUrl = settings?.androidPlayStoreUrl?.trim() || settings?.androidApkUrl?.trim() || "";
  const needsUpdate =
    Boolean(installed) &&
    Boolean(latest) &&
    Boolean(downloadUrl) &&
    isNewerVersion(installed!, latest);

  if (!needsUpdate || dismissed) return null;

  const startUpdate = () => {
    setFailed(false);
    startInAppUpdate(downloadUrl);
    if (!supportsInAppUpdate()) return;
    setBusy(true);
    setProgress(0);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      const { state, progress: pct } = readUpdateProgress();
      setProgress(pct);
      if (state === "error") {
        setFailed(true);
        setBusy(false);
        if (timer.current) clearInterval(timer.current);
      }
      if (state === "permission") {
        setNeedsPermission(true);
        setBusy(false);
        if (timer.current) clearInterval(timer.current);
      }
      if (state === "installing") {
        setProgress(100);
      }
    }, 700);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && setDismissed(true)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Naya update aaya hai (v{latest})
          </DialogTitle>
          <DialogDescription>
            {busy
              ? "Update download ho raha hai, app band mat kijiye."
              : `Aapke phone me version ${installed} hai. Behtar service aur ride alerts ke liye abhi update karein — purani app hatane ki zaroorat nahi.`}
          </DialogDescription>
        </DialogHeader>

        {busy ? (
          <div className="space-y-2">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.max(4, progress)}%` }}
              />
            </div>
            <p className="text-center text-sm text-muted-foreground">
              {progress < 100 ? `${progress}% download hua` : "Install screen khul rahi hai…"}
            </p>
          </div>
        ) : null}

        {needsPermission && !busy ? (
          <p className="text-sm text-muted-foreground">
            Pehli baar: "Shahin Travels" ke liye "Allow from this source" ON karke wapas aaiye, phir
            "Update now" dobara dabaiye.
          </p>
        ) : null}

        {failed ? (
          <p className="text-sm text-destructive">
            Download poora nahi ho paya. Internet check karke dobara koshish kijiye.
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" disabled={busy} onClick={() => setDismissed(true)}>
            Baad me
          </Button>
          <Button onClick={startUpdate} disabled={busy}>
            <Download className="mr-2 h-4 w-4" />
            {failed ? "Dobara koshish karein" : busy ? "Download ho raha hai…" : "Update now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AppUpdatePrompt;
