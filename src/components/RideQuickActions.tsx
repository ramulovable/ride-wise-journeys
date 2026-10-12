import { MessageSquare, Phone, Share2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const CUSTOMER_MSGS = ["Main pickup par wait kar raha hoon", "Kitni der me aayenge?", "Please call karein", "Thoda jaldi aaiye"];
const DRIVER_MSGS = ["2 minute me pahunch raha hoon", "Main pickup par aa gaya hoon", "Traffic me hoon, thoda wait karein", "Please location confirm karein"];

function smsLink(mobile: string, text: string) {
  return `sms:${mobile.startsWith("+") ? mobile : `+91${mobile.replace(/\D/g, "").slice(-10)}`}?body=${encodeURIComponent(text)}`;
}

/** One-tap quick messages to the other person on the ride. */
export function QuickChat({ mobile, role }: { mobile?: string | null; role: "customer" | "driver" }) {
  if (!mobile) return null;
  const msgs = role === "customer" ? CUSTOMER_MSGS : DRIVER_MSGS;
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <MessageSquare className="h-4 w-4" /> Quick message
      </p>
      <div className="flex flex-wrap gap-2">
        {msgs.map((m) => (
          <a key={m} href={smsLink(mobile, m)} className="rounded-full border border-border bg-muted px-3 py-1.5 text-xs text-foreground">
            {m}
          </a>
        ))}
      </div>
    </section>
  );
}

/** Safety toolkit: share live ride and emergency 112. */
export function SafetyToolkit({ summary }: { summary: string }) {
  async function share() {
    const text = `Main Shahin Travels ride par hoon: ${summary}. Link: ${window.location.href}`;
    try {
      if (navigator.share) await navigator.share({ title: "Meri ride", text });
      else {
        await navigator.clipboard.writeText(text);
        toast.success("Ride details copy ho gaye.");
      }
    } catch {
      /* user cancelled */
    }
  }
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <ShieldAlert className="h-4 w-4 text-destructive" /> Safety toolkit
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={share}>
          <Share2 className="h-4 w-4" /> Ride share karein
        </Button>
        <Button variant="destructive" asChild>
          <a href="tel:112">
            <Phone className="h-4 w-4" /> Call 112
          </a>
        </Button>
      </div>
    </section>
  );
}
