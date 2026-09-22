import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Download, ShieldCheck, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/BrandHeader";
import { useAppSettings } from "@/lib/settings";

export const Route = createFileRoute("/download")({
  head: () => ({
    meta: [
      { title: "Download the Shahin Travels Android app" },
      {
        name: "description",
        content:
          "Install the Shahin Travels Android app for customers and drivers. Book rides, and get full-screen ride alerts even when the phone is locked.",
      },
      { property: "og:title", content: "Download the Shahin Travels Android app" },
      {
        property: "og:description",
        content:
          "One app for customers and drivers — book rides and never miss a ride request in Darbhanga.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DownloadPage,
});

function DownloadPage() {
  const settings = useAppSettings();
  const apkUrl = settings.data?.androidApkUrl ?? "";
  const playUrl = settings.data?.androidPlayStoreUrl ?? "";
  const version = settings.data?.androidAppVersion ?? "";

  return (
    <div className="mx-auto min-h-svh w-full max-w-md px-4 py-8">
      <div className="flex flex-col items-center text-center">
        <BrandMark size={72} />
        <h1 className="mt-4 text-2xl font-bold">Shahin Travels Android App</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ek hi app — customer bhi, driver bhi. Sign up karke turant ride book karein ya driver
          banein.
        </p>
        {version ? (
          <p className="mt-1 text-xs font-medium text-primary">Version {version}</p>
        ) : null}
      </div>

      <div className="mt-6 space-y-3">
        {playUrl ? (
          <Button asChild className="h-12 w-full gap-2 rounded-2xl text-base">
            <a href={playUrl} target="_blank" rel="noreferrer">
              <Smartphone className="h-5 w-5" />
              Get it on Google Play
            </a>
          </Button>
        ) : null}

        {apkUrl ? (
          <Button
            asChild
            variant={playUrl ? "outline" : "default"}
            className="h-12 w-full gap-2 rounded-2xl text-base"
          >
            <a href={apkUrl} download>
              <Download className="h-5 w-5" />
              Download APK
            </a>
          </Button>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            App file abhi taiyar ho rahi hai. Tab tak website ko hi Home screen par install karein.
          </div>
        )}

        <Button asChild variant="ghost" className="w-full rounded-2xl">
          <Link to="/">Website par jaari rakhein</Link>
        </Button>
      </div>

      <div className="mt-8 space-y-3">
        <Feature
          icon={<Bell className="h-5 w-5 text-primary" />}
          title="Drivers: lock screen par ride alert"
          text="Phone band ho tab bhi screen on hoti hai, ringtone bajti hai aur Accept / Decline samne aata hai."
        />
        <Feature
          icon={<ShieldCheck className="h-5 w-5 text-primary" />}
          title="Customers: wahi booking, tez app me"
          text="Nayi ID banayein, ride book karein aur driver ko live map par dekhein."
        />
      </div>

      <div className="mt-8 rounded-2xl border border-border p-4">
        <p className="text-sm font-semibold">Install kaise karein</p>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Upar diye button se file download karein.</li>
          <li>Download hone par file par tap karke “Install” dabayein.</li>
          <li>Agar “Unknown source” ka message aaye to “Install anyway” chunein.</li>
          <li>App khol kar mobile number se login karein.</li>
          <li>Driver hain to Notification aur Location ki permission “Allow all the time” par rakhein.</li>
        </ol>
      </div>
    </div>
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-border p-3">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-xs text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}
