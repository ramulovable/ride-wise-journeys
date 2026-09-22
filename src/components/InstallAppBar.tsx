import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download, X } from "lucide-react";

import { toast } from "sonner";
import { BrandMark } from "@/components/BrandHeader";
import { Button } from "@/components/ui/button";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "shahin-install-dismissed";

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

function isIOS() {
  if (typeof window === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) && !(window as unknown as { MSStream?: unknown }).MSStream
  );
}

function fallbackInstallMessage() {
  if (isIOS()) {
    return "Tap the Share button in Safari, then select 'Add to Home Screen' to install Shahin Travels.";
  }
  return "Tap the browser menu (⋮) at the top right and select 'Install app' or 'Add to Home screen'.";
}

export function InstallAppBar({ offsetNav = true }: { offsetNav?: boolean }) {
  const [deferredPrompt, setDeferredPrompt] = useState<InstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone()) return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;

    // On mobile browsers, show the bar by default even before beforeinstallprompt fires.
    if (isMobileBrowser()) setHidden(false);

    function onBeforeInstall(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as InstallPromptEvent);
      setHidden(false);
    }
    function onInstalled() {
      setHidden(true);
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden) return null;

  async function install() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") setHidden(true);
      setDeferredPrompt(null);
      return;
    }

    toast.info(fallbackInstallMessage(), {
      duration: 8000,
      position: "top-center",
    });
  }

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
          <Link to="/download" className="truncate text-[11px] font-medium text-primary underline">
            ● Android app download karein
          </Link>
        </div>

        <Button size="sm" className="shrink-0 gap-1.5 rounded-full" onClick={install}>
          <Download className="h-4 w-4" />
          Install App
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          aria-label="Dismiss install banner"
          onClick={dismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
