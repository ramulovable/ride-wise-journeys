import { Link } from "@tanstack/react-router";
import logo from "@/assets/shahin-logo.png.asset.json";

export function BrandMark({ size = 40 }: { size?: number }) {
  return (
    <img
      src={logo.url}
      alt="Shahin Travels logo"
      width={size}
      height={size}
      className="rounded-full object-contain"
      style={{ width: size, height: size }}
    />
  );
}

export function BrandHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <Link to="/" className="shrink-0">
          <BrandMark size={38} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-foreground">{title}</h1>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        {right}
      </div>
    </header>
  );
}
