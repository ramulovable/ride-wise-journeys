import { useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PUSH_MESSAGE, enablePush } from "@/lib/push";

export function EnablePushButton({
  label = "Turn on ride alerts",
  doneLabel = "Ride alerts on",
}: {
  label?: string;
  doneLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function turnOn() {
    setBusy(true);
    const result = await enablePush();
    setBusy(false);
    if (result.status === "registered") {
      setDone(true);
      toast.success(PUSH_MESSAGE.registered);
      return;
    }
    toast.error(PUSH_MESSAGE[result.status]);
  }

  return (
    <Button variant="outline" size="sm" disabled={busy || done} onClick={() => void turnOn()}>
      <Bell className="mr-2 h-4 w-4" />
      {done ? doneLabel : busy ? "Turning on…" : label}
    </Button>
  );
}
