import logoAsset from "@/assets/shahin-logo.png.asset.json";
import sunrise from "@/assets/qs-sunrise.jpg";
import deen from "@/assets/qs-deen.jpg";
import motivation from "@/assets/qs-motivation.jpg";
import emotional from "@/assets/qs-emotional.jpg";
import festival from "@/assets/qs-festival.jpg";
import birthday from "@/assets/qs-birthday.jpg";
import shayari from "@/assets/qs-shayari.jpg";
import type { QuoteCategory } from "./quotes-library";

export const BACKGROUNDS: Record<Exclude<QuoteCategory, "today">, string[]> = {
  deen: [deen, shayari],
  motivation: [motivation, sunrise],
  emotional: [emotional, shayari],
  morning: [sunrise, emotional],
  shayari: [shayari, deen],
  festival: [festival],
  birthday: [birthday],
};

export function bgFor(cat: QuoteCategory, idx: number) {
  const list = BACKGROUNDS[cat === "today" ? "morning" : cat];
  return list[idx % list.length];
}

const cache = new Map<string, Promise<HTMLImageElement | null>>();
function loadImg(src: string, cors = false): Promise<HTMLImageElement | null> {
  const key = `${cors}${src}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      new Promise((res) => {
        const img = new Image();
        if (cors) img.crossOrigin = "anonymous";
        img.onload = () => res(img);
        img.onerror = () => res(null);
        img.src = src;
      }),
    );
  }
  return cache.get(key)!;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const w of para.split(" ")) {
      const t = line ? `${line} ${w}` : w;
      if (ctx.measureText(t).width > max && line) {
        out.push(line);
        line = w;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}

export type PosterInput = {
  text: string;
  by?: string;
  bg: string;
  name: string;
  photo?: string | null;
};

const W = 1080;
const H = 1350;

export async function renderPoster(canvas: HTMLCanvasElement, p: PosterInput) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const [bg, logo, photo] = await Promise.all([
    loadImg(p.bg),
    loadImg(logoAsset.url),
    p.photo ? loadImg(p.photo, true) : Promise.resolve(null),
  ]);

  ctx.fillStyle = "#111";
  ctx.fillRect(0, 0, W, H);
  if (bg) {
    const s = Math.max(W / bg.width, H / bg.height);
    ctx.drawImage(bg, (W - bg.width * s) / 2, (H - bg.height * s) / 2, bg.width * s, bg.height * s);
  }
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(0,0,0,0.55)");
  g.addColorStop(0.45, "rgba(0,0,0,0.35)");
  g.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Top branding
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  roundRect(ctx, 290, 36, 500, 96, 48);
  ctx.fill();
  if (logo) ctx.drawImage(logo, 310, 46, 76, 76);
  ctx.fillStyle = "#0b3d2e";
  ctx.font = "800 44px 'Noto Sans Devanagari', system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText("Shahin Travels", 400, 86);

  // Quote
  ctx.textAlign = "center";
  let size = 62;
  let lines: string[] = [];
  for (; size >= 36; size -= 4) {
    ctx.font = `700 ${size}px 'Noto Sans Devanagari', system-ui, sans-serif`;
    lines = wrap(ctx, p.text, W - 160);
    if (lines.length * size * 1.45 < 760) break;
  }
  const lh = size * 1.45;
  const blockH = lines.length * lh + (p.by ? 70 : 0);
  let y = 200 + (840 - blockH) / 2 + lh / 2;
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = "#fff";
  for (const l of lines) {
    ctx.fillText(l, W / 2, y);
    y += lh;
  }
  if (p.by) {
    ctx.font = "600 36px 'Noto Sans Devanagari', system-ui, sans-serif";
    ctx.fillStyle = "#ffd78a";
    ctx.fillText(`— ${p.by}`, W / 2, y + 20);
  }
  ctx.shadowBlur = 0;

  // Bottom user bar
  const barY = H - 210;
  ctx.fillStyle = "rgba(255,255,255,0.96)";
  roundRect(ctx, 40, barY, W - 80, 170, 85);
  ctx.fill();
  const cx = 125;
  const cy = barY + 85;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, 70, 0, Math.PI * 2);
  ctx.clip();
  if (photo) {
    const s = Math.max(140 / photo.width, 140 / photo.height);
    ctx.drawImage(photo, cx - (photo.width * s) / 2, cy - (photo.height * s) / 2, photo.width * s, photo.height * s);
  } else {
    ctx.fillStyle = "#0b7a55";
    ctx.fillRect(cx - 70, cy - 70, 140, 140);
    ctx.fillStyle = "#fff";
    ctx.font = "800 64px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText((p.name.trim()[0] || "S").toUpperCase(), cx, cy + 4);
  }
  ctx.restore();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#f5b301";
  ctx.beginPath();
  ctx.arc(cx, cy, 70, 0, Math.PI * 2);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.fillStyle = "#111";
  let nsize = 54;
  ctx.font = `800 ${nsize}px 'Noto Sans Devanagari', system-ui, sans-serif`;
  while (ctx.measureText(p.name).width > 760 && nsize > 30) {
    nsize -= 2;
    ctx.font = `800 ${nsize}px 'Noto Sans Devanagari', system-ui, sans-serif`;
  }
  ctx.fillText(p.name || "Shahin Travels", 220, cy - 22);
  ctx.fillStyle = "#0b7a55";
  ctx.font = "600 30px 'Noto Sans Devanagari', system-ui, sans-serif";
  ctx.fillText("Shahin Travels • आपकी सुखद यात्रा का साथी", 220, cy + 36);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((res) => {
    try {
      canvas.toBlob((b) => res(b), "image/jpeg", 0.92);
    } catch {
      res(null);
    }
  });
}
