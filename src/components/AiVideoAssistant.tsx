import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Mic, MicOff, PhoneOff, Loader2 } from "lucide-react";
import { startAssistantSession, endAssistantSession } from "@/lib/ai-assistant.functions";
import { useI18n } from "@/lib/i18n";

const AVATAR_THUMB =
  "https://static.liveavatar.com/avatars/thumbnails/7b259367428f49138bdaa716565c3636/emotion-curated-20261004/10ba14ab-3911-4b89-8dfd-86b5ba25876f-250-c6d3d7236b2b6135.jpg";

type Status = "idle" | "connecting" | "live" | "error";

/** Highlights the visible button/tab whose label the avatar just mentioned. */
function highlightFromSpeech(text: string) {
  const said = text.toLowerCase();
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>("nav a, nav button, main a, main button, [data-guide]"),
  ).filter((el) => el.offsetParent !== null && !el.closest("[data-ai-assistant]"));
  let best: HTMLElement | null = null;
  let bestLen = 0;
  for (const el of nodes) {
    const label = (el.dataset["guide"] || el.innerText || el.getAttribute("aria-label") || "")
      .trim()
      .toLowerCase();
    if (label.length < 3 || label.length > 40) continue;
    if (said.includes(label) && label.length > bestLen) {
      best = el;
      bestLen = label.length;
    }
  }
  if (!best) return;
  document.querySelectorAll(".ai-guide-highlight").forEach((e) => e.classList.remove("ai-guide-highlight"));
  best.classList.add("ai-guide-highlight");
  best.scrollIntoView({ behavior: "smooth", block: "center" });
  const target = best;
  const clear = () => target.classList.remove("ai-guide-highlight");
  target.addEventListener("click", clear, { once: true });
  window.setTimeout(clear, 8000);
}

export function AiVideoAssistant() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { language } = useI18n();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [caption, setCaption] = useState("");
  const [listening, setListening] = useState(false);
  const [micAvailable, setMicAvailable] = useState(true);
  const [micNote, setMicNote] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  function sendText(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    const s = sessionRef.current;
    if (!text || !s) return;
    try {
      s.message(text);
      setCaption(`Aap: ${text}`);
      setDraft("");
    } catch (err) {
      setMicNote(err instanceof Error ? err.message : "Message nahi gaya");
    }
  }
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<import("@heygen/liveavatar-web-sdk").LiveAvatarSession | null>(null);
  const contextRef = useRef<string | null>(null);

  async function cleanup() {
    const s = sessionRef.current;
    sessionRef.current = null;
    if (s) await s.stop().catch(() => null);
    const ctx = contextRef.current;
    contextRef.current = null;
    if (ctx) void endAssistantSession({ data: { contextId: ctx } }).catch(() => null);
  }

  useEffect(() => () => void cleanup(), []);

  async function start() {
    setOpen(true);
    setStatus("connecting");
    setError(null);
    setCaption("");
    try {
      const { sessionToken, contextId } = await startAssistantSession({
        data: { path: pathname, language },
      });
      contextRef.current = contextId;
      // Try the mic; if the phone blocks it, continue in typing mode instead of failing.
      let micOk = false;
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("getUserMedia unavailable");
        const s = await navigator.mediaDevices.getUserMedia({ audio: true });
        s.getTracks().forEach((t) => t.stop());
        micOk = true;
      } catch (err) {
        const name = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        console.warn("Ayesha mic unavailable", name);
        setMicNote(`Mic nahi mila (${name}). Neeche type karke baat karein.`);
      }
      setMicAvailable(micOk);
      const sdk = await import("@heygen/liveavatar-web-sdk");
      const session = new sdk.LiveAvatarSession(sessionToken, {
        autoKeepAlive: true,
        ...(micOk
          ? { voiceChat: { mode: sdk.SessionInteractivityMode.CONVERSATIONAL, defaultMuted: false } }
          : {}),
      });
      sessionRef.current = session;
      session.on(sdk.SessionEvent.SESSION_STREAM_READY, () => {
        if (videoRef.current) session.attach(videoRef.current);
        setStatus("live");
      });
      session.on(sdk.SessionEvent.SESSION_DISCONNECTED, () => {
        setStatus((s) => (s === "error" ? s : "idle"));
        void cleanup();
        setOpen(false);
      });
      session.on(sdk.AgentEventsEnum.USER_SPEAK_STARTED, () => setListening(true));
      session.on(sdk.AgentEventsEnum.USER_SPEAK_ENDED, () => setListening(false));
      session.on(sdk.AgentEventsEnum.USER_TRANSCRIPTION, (e: { text?: string }) => {
        if (e?.text) setCaption(`Aap: ${e.text}`);
      });
      session.on(sdk.AgentEventsEnum.AVATAR_TRANSCRIPTION, (e: { text?: string }) => {
        if (e?.text) {
          setCaption(e.text);
          highlightFromSpeech(e.text);
        }
      });
      await session.start();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "Assistant start nahi ho payi");
      await cleanup();
    }
  }

  async function end() {
    await cleanup();
    setStatus("idle");
    setOpen(false);
  }

  function toggleMic() {
    const vc = sessionRef.current?.voiceChat;
    if (!vc) return;
    if (muted) void vc.unmute();
    else void vc.mute();
    setMuted(!muted);
  }

  if (!open) {
    return (
      <button
        type="button"
        data-ai-assistant
        onClick={start}
        aria-label="Talk to Emma, live AI assistant"
        className="fixed bottom-20 left-4 z-40 size-14 overflow-hidden rounded-full border-2 border-primary shadow-lg ring-4 ring-primary/20 animate-pulse"
      >
        <img src={AVATAR_THUMB} alt="" className="size-full object-cover" />
      </button>
    );
  }

  return (
    <div
      data-ai-assistant
      className="fixed bottom-20 left-3 z-50 w-[min(300px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
    >
      <div className="relative aspect-[3/4] bg-muted">
        <video ref={videoRef} autoPlay playsInline className="size-full object-cover" />
        {status !== "live" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 p-4 text-center">
            <img src={AVATAR_THUMB} alt="Emma" className="size-20 rounded-full object-cover" />
            {status === "connecting" ? (
              <p className="flex items-center gap-2 text-sm text-foreground">
                <Loader2 className="size-4 animate-spin" /> Emma se jud rahe hain…
              </p>
            ) : (
              <>
                <p className="text-sm text-destructive">{error}</p>
                <button
                  type="button"
                  onClick={start}
                  className="rounded-full bg-primary px-4 py-1.5 text-sm text-primary-foreground"
                >
                  Dobara try karein
                </button>
              </>
            )}
          </div>
        ) : null}
        {caption && status === "live" ? (
          <p className="absolute inset-x-2 bottom-2 rounded-lg bg-background/85 px-2 py-1 text-xs text-foreground">
            {caption}
          </p>
        ) : null}
      </div>
      {micNote ? <p className="px-2 pt-2 text-[11px] text-muted-foreground">{micNote}</p> : null}
      {status === "live" ? (
        <form onSubmit={sendText} className="flex gap-2 px-2 pt-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={micAvailable ? "Ya yahan type karein…" : "Apna sawal likhiye…"}
            className="min-w-0 flex-1 rounded-full border border-input bg-background px-3 py-1.5 text-sm text-foreground"
          />
          <button type="submit" className="rounded-full bg-primary px-3 text-sm text-primary-foreground">
            Bhejein
          </button>
        </form>
      ) : null}
      <div className="flex items-center justify-between gap-2 p-2">
        <span className="text-xs text-muted-foreground">
          {status === "live" && !muted
            ? listening
              ? "🎙️ Ayesha sun rahi hai…"
              : "Ayesha · boliye"
            : "Ayesha · Live AI"}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={toggleMic}
            disabled={status !== "live"}
            aria-label={muted ? "Unmute mic" : "Mute mic"}
            className="rounded-full bg-secondary p-2 text-secondary-foreground disabled:opacity-50"
          >
            {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </button>
          <button
            type="button"
            onClick={end}
            aria-label="End call"
            className="rounded-full bg-destructive p-2 text-destructive-foreground"
          >
            <PhoneOff className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
