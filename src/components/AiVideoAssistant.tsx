import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Mic, MicOff, X, Minimize2, Maximize2, Loader2 } from "lucide-react";
import { askAyesha, transcribeAyesha, speakAyesha } from "@/lib/ayesha.functions";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import poster from "@/assets/ayesha-studio.jpg";
import idleClip from "@/assets/ayesha-idle.mp4.asset.json";
import speakClip from "@/assets/ayesha-speak.mp4.asset.json";
import checkClip from "@/assets/ayesha-check.mp4.asset.json";

type Mode = "idle" | "listening" | "thinking" | "speaking";
type Msg = { role: "user" | "assistant"; content: string };

const CLIPS: Record<"idle" | "speak" | "check", string> = {
  idle: idleClip.url,
  speak: speakClip.url,
  check: checkClip.url,
};

const greetingFor = (name: string) =>
  `Hello${name ? " " + name + " ji" : ""}! Main Shahin Travels ki AI assistant Ayesha hoon. Ummid hai ki aap acche honge. Bataiye, main aapki kya help kar sakti hoon?`;
const nudgeFor = (name: string) =>
  `${name ? name + " ji, " : "Ji, "}bataiye, main aapki kya help kar sakti hoon?`;

/** Highlights the visible button/tab whose label Ayesha just mentioned. */
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
  const target = best;
  const clear = () => target.classList.remove("ai-guide-highlight");
  target.addEventListener("click", clear, { once: true });
  window.setTimeout(clear, 8000);
}

function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  const hi = voices.filter((v) => v.lang.toLowerCase().startsWith("hi"));
  const female = /female|swara|kalpana|heera|lekha|neerja|aditi|priya/i;
  return (
    hi.find((v) => female.test(v.name)) ||
    hi[0] ||
    voices.find((v) => v.lang.toLowerCase() === "en-in" && female.test(v.name)) ||
    voices.find((v) => v.lang.toLowerCase() === "en-in") ||
    null
  );
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(b);
  });
}

export function AiVideoAssistant() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { language } = useI18n();
  const { profile } = useAuth();
  const firstName = (profile?.full_name ?? "").trim().split(/\s+/)[0] ?? "";
  const [open, setOpen] = useState(false);
  const [mini, setMini] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [caption, setCaption] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [micError, setMicError] = useState<string | null>(null);

  // Two stacked videos cross-fade between action clips.
  const vA = useRef<HTMLVideoElement>(null);
  const vB = useRef<HTMLVideoElement>(null);
  const [front, setFront] = useState<"A" | "B">("A");
  const frontRef = useRef<"A" | "B">("A");
  const nudged = useRef(0);
  const currentClip = useRef<string>("");

  const history = useRef<Msg[]>([]);
  const modeRef = useRef<Mode>("idle");
  const micOnRef = useRef(true);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const openRef = useRef(false);
  const audioEl = useRef<HTMLAudioElement | null>(null);

  modeRef.current = mode;
  micOnRef.current = micOn;

  function playClip(name: keyof typeof CLIPS, loop = true) {
    const url = CLIPS[name];
    if (currentClip.current === url) return;
    currentClip.current = url;
    const nextKey = frontRef.current === "A" ? "B" : "A";
    const next = nextKey === "A" ? vA.current : vB.current;
    const prev = nextKey === "A" ? vB.current : vA.current;
    if (!next) return;
    next.src = url;
    next.loop = loop;
    next.muted = true;
    // Mouth motion in the speaking clip is slower than real speech — speed it up to match the voice.
    next.playbackRate = name === "speak" ? 1.2 : 1;
    void next.play().then(
      () => {
        frontRef.current = nextKey;
        setFront(nextKey);
        // Stop the hidden clip so the old (talking) one never keeps running.
        window.setTimeout(() => prev?.pause(), 550);
      },
      () => null,
    );
  }

  // Map conversation state → studio action clip.
  useEffect(() => {
    if (!open) return;
    if (mode === "speaking") playClip("speak");
    else if (mode === "thinking") playClip("check");
    else playClip("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, open]);

  // If the user stays silent ~12s, gently ask once more (max 2 nudges until they speak).
  useEffect(() => {
    if (!open || mode !== "listening" || nudged.current >= 2) return;
    const t = window.setTimeout(() => {
      if (modeRef.current === "listening" && openRef.current) {
        nudged.current += 1;
        void speak(nudgeFor(firstName));
      }
    }, 12000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, open]);

  function speakWithDevice(text: string) {
    return new Promise<void>((resolve) => {
      const synth = window.speechSynthesis;
      if (!synth) {
        window.setTimeout(resolve, Math.min(9000, 1200 + text.length * 55));
        return;
      }
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = pickVoice();
      if (v) u.voice = v;
      u.lang = v?.lang ?? "hi-IN";
      u.rate = 0.85;
      u.pitch = 1.08;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      synth.speak(u);
    });
  }

  function getAudio() {
    if (!audioEl.current) {
      audioEl.current = new Audio();
      audioEl.current.setAttribute("playsinline", "true");
    }
    return audioEl.current;
  }

  async function speak(text: string) {
    setMode("thinking");
    setCaption(text);
    let played = false;
    try {
      const res = await speakAyesha({ data: { text } });
      if (res.audio && openRef.current) {
        const a = getAudio();
        a.src = `data:audio/mpeg;base64,${res.audio}`;
        a.volume = 1;
        a.playbackRate = 0.9;
        setMode("speaking");
        highlightFromSpeech(text);
        await new Promise<void>((resolve) => {
          a.onended = () => resolve();
          a.onerror = () => resolve();
          a.onpause = () => resolve();
          a.play().then(() => (played = true)).catch(() => resolve());
        });
      }
    } catch {
      /* fall back below */
    }
    if (!played && openRef.current) {
      setMode("speaking");
      highlightFromSpeech(text);
      await speakWithDevice(text);
    }
    if (openRef.current) setMode("listening");
  }

  function stopVoice() {
    window.speechSynthesis?.cancel();
    audioEl.current?.pause();
  }

  async function handleUtterance(text: string) {
    nudged.current = 0;
    history.current.push({ role: "user", content: text });
    setCaption(`Aap: ${text}`);
    setMode("thinking");
    try {
      const res = await askAyesha({
        data: { path: pathname, language, messages: history.current.slice(-16) },
      });
      history.current.push({ role: "assistant", content: res.reply });
      if (openRef.current) await speak(res.reply);
    } catch {
      if (openRef.current) await speak("Maaf kijiye, connection me dikkat aa gayi. Kya aap phir se bolenge?");
    }
  }

  async function startMic() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      setMicError(null);
      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";

      let rec: MediaRecorder | null = null;
      let chunks: Blob[] = [];
      let lastVoice = 0;
      let startedAt = 0;

      const stopRec = () => {
        if (rec && rec.state === "recording") rec.stop();
      };

      const tick = () => {
        rafRef.current = requestAnimationFrame(tick);
        analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const x of buf) sum += (x - 128) * (x - 128);
        const level = Math.sqrt(sum / buf.length);
        const now = performance.now();
        const canListen = micOnRef.current && modeRef.current === "listening";

        if (!canListen) {
          if (rec && rec.state === "recording") {
            chunks = [];
            rec.onstop = null;
            rec.stop();
            rec = null;
          }
          return;
        }
        if (level > 9) lastVoice = now;
        if (!rec && level > 12) {
          chunks = [];
          rec = new MediaRecorder(stream, { mimeType: mime });
          rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
          rec.onstop = async () => {
            const blob = new Blob(chunks, { type: mime });
            rec = null;
            if (blob.size < 6000) return;
            setMode("thinking");
            setCaption("Sun rahi hoon…");
            try {
              const { text } = await transcribeAyesha({
                data: { audio: await blobToBase64(blob), mime },
              });
              if (text && text.length > 1) await handleUtterance(text);
              else if (openRef.current) setMode("listening");
            } catch {
              if (openRef.current) setMode("listening");
            }
          };
          rec.start();
          startedAt = now;
          lastVoice = now;
        }
        if (rec && (now - lastVoice > 1300 || now - startedAt > 15000)) stopRec();
      };
      tick();
      return true;
    } catch (err) {
      const name = err instanceof Error ? `${err.name}` : String(err);
      setMicError(`Mic nahi mila (${name}). Phone settings me Shahin Travels ko Microphone allow karein.`);
      return false;
    }
  }

  function stopMic() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void audioCtx.current?.close().catch(() => null);
    audioCtx.current = null;
  }

  async function openAssistant() {
    setOpen(true);
    openRef.current = true;
    setMini(false);
    const greeting = greetingFor(firstName);
    nudged.current = 0;
    history.current = [{ role: "assistant", content: greeting }];
    currentClip.current = "";
    // Unlock speech on this user tap (required by Android/Chrome).
    window.speechSynthesis?.getVoices();
    try {
      const a = getAudio();
      a.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
      void a.play().catch(() => null);
    } catch {
      /* ignore */
    }
    void startMic();
    await speak(greeting);
  }

  function close() {
    openRef.current = false;
    stopVoice();
    stopMic();
    setOpen(false);
    setMode("idle");
    setCaption("");
    currentClip.current = "";
  }

  useEffect(() => () => close(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function interrupt() {
    if (modeRef.current === "speaking") {
      stopVoice();
      setMode("listening");
    }
  }

  if (!open) {
    return (
      <div data-ai-assistant className="mx-auto w-full max-w-3xl px-4 pt-3">
        <button
          type="button"
          onClick={openAssistant}
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-2 pr-4 text-left shadow-sm"
        >
          <img src={poster} alt="" className="h-12 w-20 rounded-xl object-cover object-[30%_30%]" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">Ayesha · Shahin AI Assistant</span>
            <span className="block truncate text-xs text-muted-foreground">Tap karein aur boliye — main sun rahi hoon</span>
          </span>
          <Mic className="size-5 text-primary" />
        </button>
      </div>
    );
  }

  const status =
    mode === "speaking"
      ? "Ayesha bol rahi hai… (tap to interrupt)"
      : mode === "thinking"
        ? "System me check kar rahi hoon…"
        : micOn
          ? "🎙️ Boliye, main sun rahi hoon"
          : "Mic band hai";

  return (
    <div data-ai-assistant className="mx-auto w-full max-w-3xl px-4 pt-3">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
        {!mini ? (
          <button type="button" onClick={interrupt} className="relative block aspect-video w-full bg-muted">
            {(["A", "B"] as const).map((k) => (
              <video
                key={k}
                ref={k === "A" ? vA : vB}
                poster={poster}
                playsInline
                muted
                className={`absolute inset-0 size-full object-cover transition-opacity duration-500 ${
                  front === k ? "opacity-100" : "opacity-0"
                }`}
              />
            ))}
            {caption ? (
              <p className="absolute inset-x-2 bottom-2 line-clamp-3 rounded-lg bg-background/85 px-2 py-1 text-left text-xs text-foreground">
                {caption}
              </p>
            ) : null}
          </button>
        ) : null}
        <div className="flex items-center gap-2 p-2">
          {mini ? <img src={poster} alt="" className="h-8 w-12 rounded-md object-cover object-[30%_30%]" /> : null}
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
            {mode === "thinking" ? <Loader2 className="size-3.5 animate-spin" /> : null}
            <span className="truncate">{micError ?? status}</span>
          </span>
          <button
            type="button"
            onClick={() => setMicOn((m) => !m)}
            aria-label={micOn ? "Mic band karein" : "Mic chalu karein"}
            className="rounded-full bg-secondary p-2 text-secondary-foreground"
          >
            {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
          </button>
          <button
            type="button"
            onClick={() => setMini((m) => !m)}
            aria-label={mini ? "Bada karein" : "Chhota karein"}
            className="rounded-full bg-secondary p-2 text-secondary-foreground"
          >
            {mini ? <Maximize2 className="size-4" /> : <Minimize2 className="size-4" />}
          </button>
          <button
            type="button"
            onClick={close}
            aria-label="Band karein"
            className="rounded-full bg-destructive p-2 text-destructive-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
