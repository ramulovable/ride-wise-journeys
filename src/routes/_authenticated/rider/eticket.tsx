import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, CheckCircle2 } from "lucide-react";
import { RiderShell } from "@/components/shells";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { rupees } from "@/lib/format";
import { useRoleGuard } from "@/lib/useRoleGuard";
import { completeETicket, listMyETickets, scanETicket } from "@/lib/eticket.functions";

export const Route = createFileRoute("/_authenticated/rider/eticket")({
  head: () => ({
    meta: [
      { title: "Scan E-Ticket — Shahin Travels Driver" },
      { name: "description", content: "Scan a passenger's prepaid E-Ticket QR and complete the trip." },
      { property: "og:title", content: "Scan E-Ticket — Shahin Travels Driver" },
      { property: "og:description", content: "Scan and complete prepaid E-Ticket trips." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DriverETicket,
});

type Detector = { detect: (s: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> };

function DriverETicket() {
  useRoleGuard("rider");
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const tickets = useQuery({ queryKey: ["my-etickets"], queryFn: () => listMyETickets() });

  async function submit(value: string) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await scanETicket({ data: { code: value } });
      toast.success(`Ticket valid — ${r.passenger}, ${r.passengers} pax. Trip shuru.`);
      setCode("");
      void qc.invalidateQueries({ queryKey: ["my-etickets"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ticket invalid.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!scanning) return;
    const BD = (window as unknown as { BarcodeDetector?: new (o: unknown) => Detector }).BarcodeDetector;
    if (!BD) {
      toast.error("Is phone me camera scan support nahi hai. PNR type karein.");
      setScanning(false);
      return;
    }
    let stream: MediaStream | null = null;
    let stop = false;
    const detector = new BD({ formats: ["qr_code"] });
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then(async (s) => {
        stream = s;
        const v = videoRef.current!;
        v.srcObject = s;
        await v.play();
        while (!stop) {
          const found = await detector.detect(v).catch(() => []);
          if (found[0]?.rawValue) {
            stop = true;
            setScanning(false);
            void submit(found[0].rawValue);
            break;
          }
          await new Promise((r) => setTimeout(r, 300));
        }
      })
      .catch(() => {
        toast.error("Camera ki permission dein.");
        setScanning(false);
      });
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  async function complete(id: string) {
    try {
      await completeETicket({ data: { ticketId: id } });
      toast.success("Trip complete.");
      void qc.invalidateQueries({ queryKey: ["my-etickets"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Complete nahi hua.");
    }
  }

  const mine = tickets.data ?? [];
  return (
    <RiderShell title="E-Ticket Scan">
      <div className="space-y-4">
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
          {scanning ? (
            <video ref={videoRef} className="aspect-square w-full rounded-xl bg-muted object-cover" muted playsInline />
          ) : null}
          <Button size="lg" className="h-14 w-full" onClick={() => setScanning((s) => !s)}>
            <Camera className="mr-2 size-5" /> {scanning ? "Band karein" : "QR Scan karein"}
          </Button>
          <div className="flex gap-2">
            <Input placeholder="PNR likhein" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} />
            <Button disabled={code.length < 6 || busy} onClick={() => submit(code)}>Check</Button>
          </div>
        </section>
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Meri E-Ticket trips</h2>
          {mine.length === 0 ? <p className="text-sm text-muted-foreground">Abhi koi trip nahi.</p> : null}
          {mine.map((t) => (
            <div key={t.id} className="rounded-2xl border border-border bg-card p-3 text-sm">
              <p className="font-bold">PNR {t.pnr} · {t.status}</p>
              <p>{t.passenger_name} · {t.passengers} pax</p>
              <p className="text-muted-foreground">{t.from?.name} → {t.to?.name}</p>
              <p>Fare {rupees(Number(t.fare_amount))}{t.driver_net_amount != null ? ` · Aapki kamai ${rupees(Number(t.driver_net_amount))}` : ""}</p>
              {t.status === "IN_PROGRESS" ? (
                <Button className="mt-2 w-full" onClick={() => complete(t.id)}>
                  <CheckCircle2 className="mr-2 size-4" /> Trip Complete
                </Button>
              ) : null}
            </div>
          ))}
        </section>
      </div>
    </RiderShell>
  );
}
