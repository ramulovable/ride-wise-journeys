import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
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

export function InstallAppBar() {
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (isStandalone()) return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;

    function onBeforeInstall(event: Event) {
      event.preventDefault();
      setPrompt(event as InstallPromptEvent);
      setHidden(false);
    }
    function onInstalled() {
      setHidden(true);
      setPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (hidden || !prompt) return null;

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") setHidden(true);
    setPrompt(null);
  }

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setHidden(true);
  }

  return (
    <div className="fixed inset-x-0 bottom-16 z-40 px-3 sm:bottom-20">
      <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 via-card to-accent/20 p-3 shadow-lg backdrop-blur">
        <div className="shrink-0 rounded-xl bg-card p-1 shadow-sm">
          <BrandMark size={36} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">Shahin Travels App</p>
          <p className="truncate text-[11px] font-medium text-primary">
            ● Verified • Fast 1-Tap Install
          </p>
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
