import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RangeFilter({ kind, setKind, custom, setCustom }: { kind: string; setKind: (k: string) => void; custom: { from: string; to: string }; setCustom: (c: { from: string; to: string }) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {[["today", "Today"], ["7d", "7 Days"], ["month", "This Month"], ["last", "Last Month"], ["custom", "Custom"]].map(([k, l]) => (
        <Button key={k} size="sm" variant={kind === k ? "default" : "outline"} onClick={() => setKind(k!)}>{l}</Button>
      ))}
      {kind === "custom" ? (
        <>
          <Input type="date" className="h-8 w-auto" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
          <Input type="date" className="h-8 w-auto" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
        </>
      ) : null}
    </div>
  );
}

export function Stat({ l, v }: { l: string; v: string | number }) {
  return <div className="flex justify-between gap-2 border-b border-border/50 py-0.5"><span className="text-muted-foreground">{l}</span><span className="font-medium">{v}</span></div>;
}

