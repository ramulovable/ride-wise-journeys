import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Download, Printer } from "lucide-react";
import { EmployeeShell } from "@/components/shells";
import { Button } from "@/components/ui/button";
import { useAvatarUrl } from "@/components/ProfileAvatar";
import { getMyIdCard } from "@/lib/field.functions";
import logo from "@/assets/shahin-logo.png.asset.json";

export const Route = createFileRoute("/_authenticated/employee/id-card")({
  head: () => ({
    meta: [
      { title: "My Employee ID Card | Shahin Travels" },
      { name: "description", content: "View, download and print your official Shahin Travels employee ID card." },
      { property: "og:title", content: "My Employee ID Card | Shahin Travels" },
      { property: "og:description", content: "Your official Shahin Travels employee ID card." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: IdCardPage,
});

function loadImg(src: string) {
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    setTimeout(() => resolve(null), 6000);
    img.src = src;
  });
}

function cssColor(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v ? (v.startsWith("oklch") || v.startsWith("#") || v.startsWith("rgb") || v.startsWith("hsl") ? v : `hsl(${v})`) : fallback;
}

function IdCardPage() {
  const q = useQuery({ queryKey: ["my-id-card"], queryFn: () => getMyIdCard() });
  const photo = useAvatarUrl(q.data?.photo_url);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const qrWrap = useRef<HTMLDivElement>(null);
  const [img, setImg] = useState<string | null>(null);
  const verifyUrl = q.data && typeof window !== "undefined"
    ? `${window.location.origin}/admin/verify-employee/${q.data.verification_token}`
    : "";

  useEffect(() => {
    const c = q.data;
    const canvas = canvasRef.current;
    if (!c || !canvas || (c.photo_url && photo.isLoading)) return;
    let cancelled = false;
    void (async () => {
      const W = 640, H = 1000;
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      const primary = cssColor("--primary", "#0f5132");
      const active = c.status === "active";
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = primary; ctx.fillRect(0, 0, W, 230);
      const lg = await loadImg(logo.url);
      if (lg) ctx.drawImage(lg, W / 2 - 50, 22, 100, 100);
      ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
      ctx.font = "bold 40px sans-serif"; ctx.fillText("SHAHIN TRAVELS", W / 2, 165);
      ctx.font = "20px sans-serif"; ctx.fillText("EMPLOYEE IDENTITY CARD", W / 2, 202);
      // photo
      ctx.fillStyle = "#e5e7eb"; ctx.fillRect(W / 2 - 110, 260, 220, 260);
      const ph = photo.data ? await loadImg(photo.data) : null;
      if (ph) {
        const s = Math.max(220 / ph.width, 260 / ph.height);
        const w = ph.width * s, h = ph.height * s;
        ctx.save(); ctx.beginPath(); ctx.rect(W / 2 - 110, 260, 220, 260); ctx.clip();
        ctx.drawImage(ph, W / 2 - w / 2, 390 - h / 2, w, h); ctx.restore();
      } else {
        ctx.fillStyle = "#6b7280"; ctx.font = "bold 90px sans-serif";
        ctx.fillText((c.full_name || "?").charAt(0).toUpperCase(), W / 2, 420);
      }
      ctx.strokeStyle = primary; ctx.lineWidth = 4; ctx.strokeRect(W / 2 - 110, 260, 220, 260);
      ctx.fillStyle = "#111827"; ctx.font = "bold 34px sans-serif"; ctx.fillText(c.full_name || "", W / 2, 570);
      ctx.fillStyle = primary; ctx.font = "22px sans-serif"; ctx.fillText(c.designation, W / 2, 604);
      ctx.fillStyle = "#111827"; ctx.font = "bold 30px monospace"; ctx.fillText(c.employee_code, W / 2, 648);
      // details
      ctx.textAlign = "left"; ctx.font = "19px sans-serif";
      const rows: [string, string][] = [
        ["Date of Birth", c.date_of_birth ?? "—"],
        ["Joining Date", c.joining_date],
        ["Territory", c.territory],
        ["Address", c.address ?? "—"],
      ];
      let y = 700;
      for (const [k, v] of rows) {
        ctx.fillStyle = "#6b7280"; ctx.fillText(k, 40, y);
        ctx.fillStyle = "#111827";
        const text = v.length > 34 ? `${v.slice(0, 33)}…` : v;
        ctx.fillText(text, 200, y); y += 36;
      }
      // QR
      const qr = qrWrap.current?.querySelector("canvas");
      if (qr) ctx.drawImage(qr, W - 190, 690, 150, 150);
      // status band
      ctx.fillStyle = active ? "#15803d" : "#b91c1c";
      ctx.fillRect(0, H - 110, W, 110);
      ctx.fillStyle = "#ffffff"; ctx.textAlign = "center"; ctx.font = "bold 32px sans-serif";
      ctx.fillText(active ? "ACTIVE EMPLOYEE" : `NOT ACTIVE · ${c.status.toUpperCase()}`, W / 2, H - 62);
      ctx.font = "16px sans-serif"; ctx.fillText("Scan QR at Shahin Travels HQ to verify", W / 2, H - 30);
      if (!cancelled) {
        try { setImg(canvas.toDataURL("image/png")); } catch { setImg(null); }
      }
    })();
    return () => { cancelled = true; };
  }, [q.data, photo.data, photo.isLoading]);

  function download() {
    if (!img || !q.data) return;
    const a = document.createElement("a");
    a.href = img; a.download = `ShahinTravels-ID-${q.data.employee_code}.png`; a.click();
  }
  function print() {
    if (!img) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<html><head><title>Employee ID</title><style>@page{margin:10mm}body{margin:0;display:flex;justify-content:center}img{width:54mm*2;max-width:100%;height:auto}</style></head><body><img src="${img}" onload="window.print()"/></body></html>`);
    w.document.close();
  }

  return (
    <EmployeeShell title="My ID Card">
      {q.isError ? <p className="text-sm text-destructive">{q.error.message}</p> : null}
      <div ref={qrWrap} className="hidden">{verifyUrl ? <QRCodeCanvas value={verifyUrl} size={300} includeMargin /> : null}</div>
      <canvas ref={canvasRef} className="hidden" />
      <div className="mx-auto max-w-sm space-y-3">
        {img ? <img src={img} alt="Employee ID card" className="w-full rounded-xl border shadow-sm" /> : <p className="text-sm text-muted-foreground">Preparing your ID card…</p>}
        <div className="flex gap-2">
          <Button className="flex-1" onClick={download} disabled={!img}><Download className="mr-1 h-4 w-4" />Download</Button>
          <Button className="flex-1" variant="outline" onClick={print} disabled={!img}><Printer className="mr-1 h-4 w-4" />Print</Button>
        </div>
        <p className="text-xs text-muted-foreground">Card details come from your profile and HQ record and update automatically when they change.</p>
      </div>
    </EmployeeShell>
  );
}
