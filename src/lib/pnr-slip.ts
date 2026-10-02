import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import logo from "@/assets/shahin-logo.png.asset.json";
import type { PnrStatus } from "@/lib/indianrail.functions";

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const v = (s: unknown) => (s === undefined || s === null || s === "" ? "-" : esc(s));

const CLASS: Record<string, string> = {
  "1A": "FIRST AC (1A)", "2A": "SECOND AC (2A)", "3A": "THIRD AC (3A)", "3E": "AC 3 ECONOMY (3E)",
  SL: "SLEEPER (SL)", CC: "AC CHAIR CAR (CC)", EC: "EXEC. CHAIR CAR (EC)", "2S": "SECOND SITTING (2S)",
};
const QUOTA: Record<string, string> = {
  GN: "GENERAL (GN)", TQ: "TATKAL (TQ)", PT: "PREMIUM TATKAL (PT)", LD: "LADIES (LD)",
  SS: "SENIOR CITIZEN (SS)", HP: "HANDICAP (HP)", DF: "DEFENCE (DF)", HO: "HEAD QUARTER (HO)",
};

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

async function logoDataUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((r) => {
      const fr = new FileReader();
      fr.onload = () => r(String(fr.result));
      fr.onerror = () => r("");
      fr.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

export async function printPnrSlip(d: PnrStatus): Promise<void> {
  const origin = window.location.origin;
  const logoUrl = await withTimeout(
    logoDataUrl(logo.url.startsWith("http") ? logo.url : origin + logo.url),
    4000,
    "",
  );
  const qrText = `Shahin Travels PNR Slip | PNR:${d.pnr} | Train:${d.trainNo} ${d.trainName} | ${d.fromCode}-${d.toCode} | ${d.journeyDate} | ${d.headline}`;
  const qr = renderToStaticMarkup(createElement(QRCodeSVG, { value: qrText, size: 130, level: "M" }));
  const now = new Date().toLocaleString("en-IN", { hour12: false });
  const board = d.boardingCode || d.fromCode;
  const boardName = d.boardingName || d.fromName;

  const rows = d.passengers.length
    ? d.passengers
        .map(
          (p) => `<tr><td>${p.serial}.</td><td>Passenger ${p.serial}</td><td>-</td><td>-</td>
          <td>${v(p.booking)}</td><td>${v(p.current)}${p.coach ? ` /${esc(p.coach)}` : ""}${p.berth ? `/${esc(p.berth)}` : ""}${p.berthType ? `/${esc(p.berthType).toUpperCase()}` : ""}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="6">Passenger details not available</td></tr>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light only"><title>PNR ${esc(d.pnr)} - Shahin Travels</title>
<style>
@page{size:A4;margin:10mm}*{box-sizing:border-box}html,body{background:#fff !important;color-scheme:light}body{width:800px;padding:8px;font-family:Arial,Helvetica,sans-serif;color:#111;margin:0;font-size:12px}
.slip{border:1.5px solid #000;max-width:800px;margin:0 auto}
.sec{border-bottom:1.5px solid #000;padding:6px 10px}
.hdr{display:flex;align-items:center;justify-content:space-between}
.hdr img{height:58px;width:auto}
.title{text-align:center;flex:1}.title u{font-size:17px;font-weight:600}.title small{font-size:11px}
.brand{font-weight:800;color:#c2410c;font-size:13px;text-align:right}
.g3{display:grid;grid-template-columns:1fr 1fr 1fr;text-align:center;gap:2px 6px}
.lbl{font-size:13px}.big{font-size:14px}.blue{color:#1f5fa8;font-size:16px}
.arrow{display:inline-block;background:#4a86c5;color:#fff;padding:2px 26px;clip-path:polygon(0 0,88% 0,100% 50%,88% 100%,0 100%);font-weight:600}
h3{margin:2px 0 4px;font-size:15px;text-decoration:underline;font-weight:600}
table{width:100%;border-collapse:collapse}th{text-align:left;font-size:12px;padding:2px 4px}td{padding:2px 4px;font-size:12px}
.acr{font-size:8px;display:flex;justify-content:space-between}
.pay{display:flex;justify-content:space-between;gap:10px}.pay table td:last-child{padding-left:40px}
ul{margin:2px 0;padding-left:16px}li{margin:2px 0}
ol{margin:4px 0;padding-left:18px;font-size:10.5px;text-align:justify}ol li{margin:2px 0}
.disc{border:1.5px dashed #b91c1c;background:#fff5f5;margin:8px 10px;padding:8px;font-size:11px}
.disc b{color:#b91c1c}.foot{text-align:center;font-size:10px;padding:6px}
.noprint{text-align:center;margin:10px}.noprint button{padding:10px 22px;font-size:15px;font-weight:700;background:#c2410c;color:#fff;border:0;border-radius:8px}
@media print{.noprint{display:none}}
</style></head><body>
<div class="slip">
 <div class="sec hdr">${logoUrl ? `<img src="${logoUrl}" alt="Shahin Travels"/>` : `<div style="width:58px"></div>`}
  <div class="title"><u>Electronic Reservation Slip (ERS)</u><small>-PNR Status Copy</small></div>
  <div class="brand">SHAHIN<br/>TRAVELS</div></div>
 <div class="sec g3">
  <div class="lbl">Booked From</div><div><span class="arrow">Boarding At</span></div><div class="lbl">To</div>
  <div class="big">${v(d.fromName)} (${v(d.fromCode)})</div><div class="big">${v(boardName)} (${v(board)})</div><div class="big">${v(d.toName)} (${v(d.toCode)})</div>
  <div class="big">Start Date* ${v(d.journeyDate)}</div><div class="big"><b>Departure* ${v(d.departure)} ${v(d.journeyDate)}</b></div><div class="big">Arrival* ${v(d.arrival)}</div>
 </div>
 <div class="sec g3">
  <div class="lbl">PNR</div><div class="lbl">Train No./Name</div><div class="lbl">Class</div>
  <div class="blue">${v(d.pnr)}</div><div class="blue">${v(d.trainNo)} / ${v(String(d.trainName || "").toUpperCase())}</div><div class="blue">${v(CLASS[d.travelClass] ?? d.travelClass)}</div>
  <div class="lbl">Quota</div><div class="lbl">Chart Status</div><div class="lbl">Generated On</div>
  <div>${v(QUOTA[d.quota] ?? d.quota)}</div><div>${d.chartPrepared ? "CHART PREPARED" : "CHART NOT PREPARED"}</div><div>${esc(now)} HRS</div>
 </div>
 <div class="sec"><h3>Passenger Details</h3>
  <table><tr><th>#</th><th>Name</th><th>Age</th><th>Gender</th><th>Booking Status</th><th>Current Status</th></tr>${rows}</table></div>
 <div class="sec acr"><span>Acronyms:</span><span>RLWL: REMOTE LOCATION WAITLIST</span><span>PQWL: POOLED QUOTA WAITLIST</span><span>RSWL: ROAD-SIDE WAITLIST</span></div>
 <div class="sec pay"><div style="flex:1">
  <p style="margin:2px 0"><b>Status: ${v(d.headline)}</b></p>
  <p style="margin:2px 0">IR recovers only 57% of cost of travel on an average.</p>
  <h3>Payment Details</h3>
  <table style="width:auto"><tr><td>Ticket Fare</td><td>${d.fare ? `₹ ${esc(d.fare)}` : "-"}</td></tr>
  <tr><td>Total Fare (as per PNR record)</td><td>${d.fare ? `₹ ${esc(d.fare)}` : "-"}</td></tr></table>
  </div><div>${qr}</div></div>
 <div class="sec"><ul>
  <li><b>Beware of fraudulent customer care numbers. For railway assistance, use only official Indian Railways / IRCTC helpline 139 / 14646.</b></li>
  <li>* The printed Departure and Arrival Times are liable to change. Please check correct departure, arrival from Railway Station Enquiry or Dial 139.</li>
  <li>Prescribed original ID proof is required while travelling along with SMS/ VRM/ ERS otherwise will be treated as without ticket and penalized as per Railway Rules.</li></ul></div>
 <div class="sec"><b><u>INSTRUCTIONS:</u></b><ol>
  <li>Prescribed Original ID proofs are:- Voter Identity Card / Passport / PAN Card / Driving License / Photo ID card issued by Central / State Govt. / Public Sector Undertakings / Student Identity Card with photograph issued by recognized School or College / Nationalized Bank Passbook with photograph / Credit Cards issued by Banks with laminated photograph / Unique Identification Card "Aadhaar", m-Aadhaar, e-Aadhaar.</li>
  <li>PNRs having fully waitlisted status will be dropped and refund processed as per railway rules. Passengers having fully waitlisted e-tickets are not allowed to board the train.</li>
  <li>A clerkage charge is deducted as per railway rules if the ticket remains waitlisted at the time of cancellation/charting.</li>
  <li>Passengers travelling on a fully waitlisted e-ticket will be treated as ticketless.</li>
  <li>In case train is late more than 3 hours, refund is admissible as per railway refund rules only when TDR is filed before actual departure of the train at boarding station.</li>
  <li>In case of train cancellation on its entire run, full refund is granted automatically as per railway rules.</li>
  <li>Never purchase tickets from unauthorized agents or persons using their personal IDs for commercial purposes.</li>
  <li>For detailed rules, refund and terms please visit www.irctc.co.in / www.indianrail.gov.in.</li>
 </ol></div>
 <div class="disc"><b>DISCLAIMER:</b> This slip is generated by <b>Shahin Travels</b> only as a PNR status copy, based on information received from railway enquiry sources at the time of generation. It is <b>NOT an original railway ticket</b> and is not issued by Indian Railways or IRCTC. Shahin Travels is not affiliated with Indian Railways/IRCTC. For PRS counter tickets, the passenger must carry the <b>original physical counter ticket</b> during the journey. For e-tickets, carry the official IRCTC ERS/SMS along with original ID proof. Status, coach, berth and timings may change; always verify with official railway sources before travel. Shahin Travels is not responsible for any loss arising from use of this slip.</div>
 <div class="foot">Generated by Shahin Travels • shahintravels.app • ${esc(now)}</div>
</div>
</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:820px;height:1200px;border:0;background:#fff;";
  document.body.appendChild(iframe);
  try {
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();
    await new Promise((r) => setTimeout(r, 150));
    await withTimeout(
      Promise.all(
        Array.from(doc.images).map((img) =>
          img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }),
        ),
      ),
      3000,
      [],
    );
    iframe.style.height = doc.body.scrollHeight + 20 + "px";
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas-pro"),
      import("jspdf"),
    ]);
    const canvas = await html2canvas(doc.body, {
      scale: 1.6,
      backgroundColor: "#ffffff",
      useCORS: true,
      imageTimeout: 3000,
      logging: false,
      windowWidth: 820,
    });
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pw = 210, ph = 297, m = 6;
    const iw = pw - m * 2;
    const pxPerMm = canvas.width / iw;
    const sliceH = Math.floor((ph - m * 2) * pxPerMm);
    for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
      const h = Math.min(sliceH, canvas.height - y);
      const c = document.createElement("canvas");
      c.width = canvas.width;
      c.height = h;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, c.width, h);
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (page > 0) pdf.addPage();
      pdf.addImage(c.toDataURL("image/jpeg", 0.9), "JPEG", m, m, iw, h / pxPerMm);
    }
    const fileName = `PNR-${d.pnr}-ShahinTravels.pdf`;
    const native = (window as unknown as { ShahinNative?: { savePdf?: (b: string, n: string) => string } }).ShahinNative;
    if (native?.savePdf) {
      const b64 = pdf.output("datauristring").split(",")[1] ?? "";
      if (native.savePdf(b64, fileName) !== "ok") throw new Error("save failed");
      return;
    }
    const blob = pdf.output("blob");
    const file = new File([blob], fileName, { type: "application/pdf" });
    const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
    const isAppWebView = /; wv\)/.test(navigator.userAgent);
    if (isAppWebView && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: fileName });
      return;
    }
    pdf.save(fileName);
  } finally {
    iframe.remove();
  }
}
