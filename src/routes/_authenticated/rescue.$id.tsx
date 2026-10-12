import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MapPin, MessageCircle, Phone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { getRescue, respondRescue } from "@/lib/rescue.functions";
import { formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/rescue/$id")({
  head: () => ({
    meta: [
      { title: "Rescue request | Shahin Travels" },
      { name: "description", content: "Emergency rescue request from a Shahin Travels driver." },
      { property: "og:title", content: "Rescue request | Shahin Travels" },
      { property: "og:description", content: "Emergency rescue request from a Shahin Travels driver." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RescuePage,
});

function Person({
  label,
  p,
  onPhoto,
}: {
  label: string;
  p: { full_name: string; mobile: string; photo_url: string | null; address: string | null };
  onPhoto: (url: string) => void;
}) {
  const ten = p.mobile.replace(/\D/g, "").slice(-10);
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center gap-3">
        {p.photo_url ? (
          <button type="button" onClick={() => onPhoto(p.photo_url!)}>
            <img src={p.photo_url} alt={p.full_name} className="h-16 w-16 rounded-full object-cover" />
          </button>
        ) : (
          <span className="h-16 w-16 rounded-full bg-muted" />
        )}
        <div className="min-w-0">
          <p className="font-semibold">{p.full_name || "—"}</p>
          <p className="text-sm text-muted-foreground">{p.mobile}</p>
          {p.address ? <p className="text-xs text-muted-foreground">{p.address}</p> : null}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button asChild size="sm" className="flex-1">
          <a href={`tel:${p.mobile}`}>
            <Phone className="mr-1 h-4 w-4" /> Call
          </a>
        </Button>
        {ten.length === 10 ? (
          <Button asChild size="sm" variant="outline" className="flex-1">
            <a href={`https://wa.me/91${ten}`} target="_blank" rel="noreferrer">
              <MessageCircle className="mr-1 h-4 w-4" /> WhatsApp
            </a>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function RescuePage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [photo, setPhoto] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["rescue", id], queryFn: () => getRescue({ data: { id } }), refetchInterval: 15000 });
  const act = useMutation({
    mutationFn: (action: "accepted" | "rejected" | "resolved") => respondRescue({ data: { id, action } }),
    onSuccess: (_, a) => {
      toast.success(a === "accepted" ? "Aapne rescue accept kiya." : a === "rejected" ? "Reject kiya." : "Band kar diya.");
      void qc.invalidateQueries({ queryKey: ["rescue", id] });
      void qc.invalidateQueries({ queryKey: ["open-rescues"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isError) return <p className="p-4 text-sm text-destructive">{q.error.message}</p>;
  if (!q.data) return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  const { request: r, driver, vehicle, ride, myResponse, isOwner, isAdmin, responses } = q.data;
  const map = r.latitude != null && r.longitude != null ? `https://maps.google.com/?q=${r.latitude},${r.longitude}` : null;

  return (
    <main className="mx-auto max-w-md space-y-4 p-4 pb-24">
      <div className="rounded-2xl border-2 border-destructive bg-destructive/10 p-4">
        <p className="text-lg font-bold text-destructive">{r.kind === "sos" ? "🚨 SOS Emergency" : "🚨 Rescue Request"}</p>
        <p className="text-xs text-muted-foreground">
          {formatDateTime(r.created_at)} · {r.status === "open" ? "Abhi chal raha" : "Band ho gaya"}
        </p>
        {map ? (
          <Button asChild className="mt-3 w-full" variant="destructive">
            <a href={map} target="_blank" rel="noreferrer">
              <MapPin className="mr-1 h-4 w-4" /> Location map par dekhein
            </a>
          </Button>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Location nahi mili.</p>
        )}
      </div>

      {driver ? <Person label="Driver" p={driver} onPhoto={setPhoto} /> : null}
      {vehicle ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Vehicle</p>
          <p className="mt-1 text-lg font-bold">{vehicle.vehicle_number}</p>
          <p className="text-muted-foreground">{[vehicle.brand_name, vehicle.vehicle_model].filter(Boolean).join(" ")}</p>
        </div>
      ) : null}
      {ride ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Current ride</p>
          <p className="mt-1 font-medium">
            {ride.from} → {ride.to}
          </p>
          <p className="text-xs text-muted-foreground">Status: {ride.status}</p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Is samay koi ride active nahi thi.</p>
      )}
      {ride?.passenger ? <Person label="Passenger" p={ride.passenger} onPhoto={setPhoto} /> : null}

      {r.status === "open" && !isOwner ? (
        <div className="grid grid-cols-2 gap-3">
          <Button className="h-12" disabled={act.isPending || myResponse === "accepted"} onClick={() => act.mutate("accepted")}>
            {myResponse === "accepted" ? "Accepted ✓" : "Rescue Accept"}
          </Button>
          <Button variant="outline" className="h-12" disabled={act.isPending || myResponse === "rejected"} onClick={() => act.mutate("rejected")}>
            Reject
          </Button>
        </div>
      ) : null}
      {r.status === "open" && (isOwner || isAdmin) ? (
        <Button variant="secondary" className="w-full" disabled={act.isPending} onClick={() => act.mutate("resolved")}>
          Main safe hoon / Band karein
        </Button>
      ) : null}

      {responses.length ? (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Responses</p>
          <ul className="mt-2 space-y-1">
            {responses.map((x) => (
              <li key={x.responder_id} className="flex justify-between">
                <span>{x.name}</span>
                <span className={x.response === "accepted" ? "font-semibold text-primary" : "text-muted-foreground"}>
                  {x.response === "accepted" ? "Aa raha hai" : "Reject"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Link to="/" className="block text-center text-sm text-primary">
        Back
      </Link>

      <Dialog open={photo !== null} onOpenChange={(o) => !o && setPhoto(null)}>
        <DialogContent className="p-2">
          <DialogTitle className="sr-only">Photo</DialogTitle>
          {photo ? <img src={photo} alt="" className="w-full rounded-lg" /> : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
