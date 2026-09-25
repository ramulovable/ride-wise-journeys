import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { resolveVehicleQr } from "@/lib/qr.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/vehicle/$token")({
  loader: ({ params }) => resolveVehicleQr({ data: { token: params.token } }),
  head: () => ({
    meta: [
      { title: "Book with your Shahin Travels driver" },
      { name: "description", content: "Scan, sign up and ride with Shahin Travels." },
      { property: "og:title", content: "Book with your Shahin Travels driver" },
      { property: "og:description", content: "Scan, sign up and ride with Shahin Travels." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: VehicleScan,
});

function VehicleScan() {
  const info = Route.useLoaderData();
  const target = info?.referralCode ? `/?ref=${encodeURIComponent(info.referralCode)}` : "/";

  useEffect(() => {
    if (!info?.referralCode) return;
    try {
      window.localStorage.setItem("shahin_ref", info.referralCode);
    } catch {
      // storage blocked
    }
    const t = window.setTimeout(() => window.location.replace(target), 1500);
    return () => window.clearTimeout(t);
  }, [info?.referralCode, target]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">Shahin Travels</p>
        {info ? (
          <>
            <h1 className="mt-3 text-2xl font-bold text-foreground">{info.driverName} ke saath ride karein</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {info.vehicleNumber}
              {info.vehicle ? ` • ${info.vehicle}` : ""}
            </p>
            {info.referralCode ? (
              <p className="mt-4 rounded-xl bg-muted px-3 py-2 font-mono text-lg text-foreground">
                {info.referralCode}
              </p>
            ) : null}
            <p className="mt-3 text-sm text-muted-foreground">Signup khul raha hai…</p>
          </>
        ) : (
          <h1 className="mt-3 text-xl font-bold text-foreground">Yeh QR ab active nahi hai</h1>
        )}
        <Button asChild className="mt-5 w-full">
          <a href={target}>Abhi shuru karein</a>
        </Button>
        <Link to="/download" className="mt-3 block text-sm text-primary underline">
          Android app download karein
        </Link>
      </div>
    </main>
  );
}
