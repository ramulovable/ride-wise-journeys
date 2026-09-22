import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download, X } from "lucide-react";

import { BrandMark } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "shahin-install-dismissed";

/** True when running inside the Shahin Travels Android app (Capacitor WebView). */
function isNativeApp() {
  if (typeof window === "undefined") return false;
  const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean; platform?: string } }).Capacitor;
  if (cap) {
    if (typeof cap.isNativePlatform === "function") return cap.isNativePlatform();
    if (cap.platform && cap.platform !== "web") return true;
  }
  return /ShahinTravelsApp/i.test(window.navigator.userAgent);
}

function isStandalone() {
  if (typeof window === "undefined") return true;
  const navStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia("(display-mode: standalone)").matches || navStandalone === true;
}

function isMobileBrowser() {
  if (typeof window === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    window.navigator.userAgent,
  );
}

export function InstallAppBar({ offsetNav = true }: { offsetNav?: boolean }) {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isNativeApp()) return;
    if (isStandalone()) return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    if (isMobileBrowser()) setHidden(false);
  }, []);

  if (hidden) return null;

  function dismiss() {
    if (typeof window !== "undefined") window.localStorage.setItem(DISMISS_KEY, "1");
    setHidden(true);
  }

  return (
    <div className={`fixed inset-x-0 z-50 px-3 ${offsetNav ? "bottom-16 sm:bottom-20" : "bottom-3 sm:bottom-4"}`}>
      <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 via-card to-accent/20 p-3 shadow-lg backdrop-blur">
        <div className="shrink-0 rounded-xl bg-card p-1 shadow-sm">
          <BrandMark size={36} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">Shahin Travels App</p>
          <p className="truncate text-[11px] text-muted-foreground">Android app download karein</p>
        </div>

        <Button asChild size="sm" className="shrink-0 gap-1.5 rounded-full">
          <Link to="/download">
            <Download className="h-4 w-4" />
            Download App
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label="Dismiss download banner"
          onClick={dismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
