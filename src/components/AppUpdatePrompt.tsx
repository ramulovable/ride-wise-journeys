import { useEffect, useState } from "react";
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
import { isNativeApp, isNewerVersion, nativeAppVersion, nativeBridge } from "@/lib/native-permissions";

/**
 * Shows an update dialog inside the Android app when the version published by
 * the admin is newer than the installed one. The new APK is signed with the
 * same key, so it installs straight over the old app.
 */
export function AppUpdatePrompt() {
  const { data: settings } = useAppSettings();
  const [installed, setInstalled] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isNativeApp()) return;
    setInstalled(nativeAppVersion());
  }, []);

  const latest = settings?.androidAppVersion?.trim() || "";
  const downloadUrl = settings?.androidPlayStoreUrl?.trim() || settings?.androidApkUrl?.trim() || "";
  const needsUpdate =
    Boolean(installed) && Boolean(latest) && Boolean(downloadUrl) && isNewerVersion(installed!, latest);

  if (!needsUpdate || dismissed) return null;

  const startUpdate = () => {
    const bridge = nativeBridge();
    if (bridge?.openExternal) bridge.openExternal(downloadUrl);
    else window.open(downloadUrl, "_blank", "noopener");
  };

  return (
    <Dialog open onOpenChange={(open) => !open && setDismissed(true)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Naya update aaya hai (v{latest})
          </DialogTitle>
          <DialogDescription>
            Aapke phone me version {installed} hai. Behtar service aur ride alerts ke liye abhi update
            karein — purani app hatane ki zaroorat nahi.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => setDismissed(true)}>
            Baad me
          </Button>
          <Button onClick={startUpdate}>
            <Download className="mr-2 h-4 w-4" />
            Update now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AppUpdatePrompt;
