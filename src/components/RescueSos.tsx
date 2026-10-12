import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, Phone, ShieldAlert, Siren, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { listOpenRescues, raiseRescue } from "@/lib/rescue.functions";

const POLICE = { name: "Police / Emergency (112)", phone: "112" };

function getPosition(): Promise<{ latitude: number | null; longitude: number | null }> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve({ latitude: null, longitude: null });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
      () => resolve({ latitude: null, longitude: null }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  });
}

/** Driver dashboard card: Rescue request, SOS, and family emergency contacts. */
export function RescueSosCard() {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState<"rescue" | "sos" | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const contacts = useQuery({
    queryKey: ["emergency-contacts"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return [];
      const { data, error } = await supabase
        .from("driver_emergency_contacts")
        .select("id, name, phone")
        .eq("driver_id", u.user.id)
        .order("created_at");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Please sign in again.");
      const digits = phone.replace(/\D/g, "").slice(-10);
      if (digits.length !== 10) throw new Error("10 digit mobile number likhein.");
      const { error } = await supabase
        .from("driver_emergency_contacts")
        .insert({ driver_id: u.user.id, name: name.trim(), phone: digits });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setName("");
      setPhone("");
      toast.success("Contact add ho gaya.");
      void qc.invalidateQueries({ queryKey: ["emergency-contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("driver_emergency_contacts").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["emergency-contacts"] }),
  });

  const raise = useMutation({
    mutationFn: async (kind: "rescue" | "sos") => {
      const pos = await getPosition();
      return raiseRescue({ data: { kind, ...pos } });
    },
    onSuccess: (r, kind) => {
      toast.success(`Alert bhej diya: ${r.notified} log (${r.delivered} phone).`);
      if (kind === "sos") {
        if (r.smsSent > 0) toast.success(`${r.smsSent} family contacts ko SMS gaya.`);
        else if (r.smsError) toast.error(`Family SMS nahi gaya: ${r.smsError}. Neeche call button use karein.`);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const list = contacts.data ?? [];

  return (
    <section className="space-y-3 rounded-2xl border border-destructive/40 bg-card p-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5 text-destructive" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-foreground">Suraksha / Safety</h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="outline"
          className="h-14 border-destructive/50 text-destructive"
          disabled={raise.isPending}
          onClick={() => setConfirm("rescue")}
        >
          <LifeBuoy className="mr-2 h-5 w-5" /> Rescue Rider
        </Button>
        <Button
          variant="destructive"
          className="h-14 text-base font-bold"
          disabled={raise.isPending}
          onClick={() => setConfirm("sos")}
        >
          <Siren className="mr-2 h-5 w-5" /> SOS
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Rescue: admin aur sabhi drivers ko alert. SOS: sabko alert + family ko SMS.
      </p>

      <div className="space-y-2 border-t border-border pt-3">
        <p className="text-xs font-semibold text-foreground">Emergency contacts ({list.length}/5)</p>
        <ul className="space-y-1.5">
          <li className="flex items-center justify-between text-sm">
            <span>{POLICE.name}</span>
            <a href={`tel:${POLICE.phone}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary">
              <Phone className="h-3.5 w-3.5" /> Call
            </a>
          </li>
          {list.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                {c.name} · {c.phone}
              </span>
              <span className="flex items-center gap-3">
                <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  <Phone className="h-3.5 w-3.5" /> Call
                </a>
                <button type="button" aria-label="Remove" onClick={() => remove.mutate(c.id)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </button>
              </span>
            </li>
          ))}
        </ul>
        {list.length < 5 ? (
          <div className="flex gap-2">
            <Input placeholder="Naam" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
            <Input
              placeholder="Mobile"
              inputMode="tel"
              value={phone}
              maxLength={13}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Button disabled={add.isPending || !name.trim() || phone.length < 10} onClick={() => add.mutate()}>
              Add
            </Button>
          </div>
        ) : null}
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === "sos" ? "SOS bhejna hai?" : "Rescue request bhejni hai?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "sos"
                ? "Admin, sabhi drivers aur aapke family contacts ko aapki location ke saath alert jayega."
                : "Admin aur sabhi drivers ko aapki location aur ride details ke saath alert jayega."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm) raise.mutate(confirm);
                setConfirm(null);
              }}
            >
              Haan, bhejo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function playSiren(): () => void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    gain.gain.value = 0.25;
    osc.connect(gain).connect(ctx.destination);
    const now = ctx.currentTime;
    for (let i = 0; i < 12; i++) {
      osc.frequency.setValueAtTime(700, now + i * 0.8);
      osc.frequency.linearRampToValueAtTime(1400, now + i * 0.8 + 0.4);
      osc.frequency.linearRampToValueAtTime(700, now + i * 0.8 + 0.8);
    }
    osc.start();
    osc.stop(now + 9.6);
    return () => void ctx.close();
  } catch {
    return () => undefined;
  }
}

function speakHindi(text: string) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "hi-IN";
    u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    // speech not available
  }
}

/** Banner of open rescue requests for drivers/admin, with siren + Hindi voice for new ones. */
export function OpenRescueAlerts() {
  const seen = useRef<Set<string>>(new Set());
  const first = useRef(true);
  const open = useQuery({ queryKey: ["open-rescues"], queryFn: () => listOpenRescues(), refetchInterval: 15000 });

  useEffect(() => {
    const rows = open.data ?? [];
    const fresh = rows.filter((r) => !seen.current.has(r.id));
    rows.forEach((r) => seen.current.add(r.id));
    const recent = fresh.filter((r) => Date.now() - new Date(r.created_at).getTime() < 10 * 60 * 1000);
    if (recent.length && !(first.current && recent.length === 0)) {
      const stop = playSiren();
      speakHindi(`सावधान! ड्राइवर ${recent[0]!.name} मुसीबत में हैं। उन्हें तुरंत मदद चाहिए।`);
      window.setTimeout(stop, 10000);
    }
    first.current = false;
  }, [open.data]);

  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    try {
      setHidden(JSON.parse(localStorage.getItem("dismissed-rescues") || "[]"));
    } catch {
      /* ignore */
    }
  }, []);
  const dismiss = (id: string) => {
    setHidden((h) => {
      const next = [...h, id].slice(-100);
      try {
        localStorage.setItem("dismissed-rescues", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const rows = (open.data ?? []).filter(
    (r) => !hidden.includes(r.id) && Date.now() - new Date(r.created_at).getTime() < 24 * 60 * 60 * 1000,
  );
  if (!rows.length) return null;
  return (
    <section className="space-y-2">
      {rows.map((r) => (
        <SwipeAlert key={r.id} onDismiss={() => dismiss(r.id)}>
          <Link
            to="/rescue/$id"
            params={{ id: r.id }}
            className="flex items-center gap-3 rounded-2xl border-2 border-destructive bg-destructive/10 p-3 pr-10"
          >
            <Siren className="h-6 w-6 animate-pulse text-destructive" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-destructive">
                {r.kind === "sos" ? "SOS" : "Rescue"}: {r.name} ko madad chahiye
              </p>
              <p className="text-xs text-muted-foreground">Tap karke details dekhein · Swipe karke hatayein</p>
            </div>
          </Link>
        </SwipeAlert>
      ))}
    </section>
  );
}

function SwipeAlert({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState(false);
  const start = useRef<number | null>(null);
  const moved = useRef(false);
  const finish = () => {
    if (Math.abs(dx) > 100) {
      setGone(true);
      setDx(dx > 0 ? 600 : -600);
      window.setTimeout(onDismiss, 200);
    } else setDx(0);
    start.current = null;
  };
  return (
    <div
      className="relative touch-pan-y"
      style={{ transform: `translateX(${dx}px)`, opacity: gone ? 0 : 1 - Math.min(Math.abs(dx) / 300, 0.7), transition: start.current === null ? "transform 200ms, opacity 200ms" : "none" }}
      onPointerDown={(e) => {
        start.current = e.clientX;
        moved.current = false;
      }}
      onPointerMove={(e) => {
        if (start.current === null) return;
        const d = e.clientX - start.current;
        if (Math.abs(d) > 8) moved.current = true;
        setDx(d);
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onClickCapture={(e) => {
        if (moved.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {children}
      <button
        type="button"
        aria-label="Alert hatayein"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        className="absolute right-2 top-2 rounded-full p-1 text-destructive hover:bg-destructive/10"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
