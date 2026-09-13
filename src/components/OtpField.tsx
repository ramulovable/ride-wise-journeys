import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { sendOtp, verifyOtp } from "@/lib/otp.functions";

const RESEND_SECONDS = 60;

function readableError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const cleaned = message.replace(/^Error:\s*/i, "").trim();
  if (!cleaned || cleaned.length > 160 || /fetch|network error|\{|\[/i.test(cleaned)) {
    return "Something went wrong. Please try again.";
  }
  return cleaned;
}

export type OtpResult = { ticket: string | null; tokenHash: string | null };

export function OtpField({
  mobile,
  purpose,
  onVerified,
  onChangeNumber,
}: {
  mobile: string;
  purpose: "signup" | "login";
  onVerified: (result: OtpResult) => void | Promise<void>;
  onChangeNumber: () => void;
}) {
  const send = useServerFn(sendOtp);
  const verify = useServerFn(verifyOtp);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const requested = useRef(false);

  const request = useCallback(
    async (isResend: boolean) => {
      setBusy(true);
      setError(null);
      try {
        await send({ data: { mobile, purpose } });
        setSent(true);
        setSeconds(RESEND_SECONDS);
        setNotice(
          isResend
            ? `A new code has been sent to ${mobile}.`
            : `We sent a 6-digit code to ${mobile}.`,
        );
      } catch (err) {
        setNotice(null);
        setSeconds(0);
        setError(readableError(err));
      } finally {
        setBusy(false);
      }
    },
    [send, mobile, purpose],
  );


  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    void request(false);
  }, [request]);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = window.setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);

  async function submit(value: string) {
    setBusy(true);
    setError(null);
    try {
      const result = (await verify({ data: { mobile, code: value, purpose } })) as OtpResult;
      await onVerified(result);
    } catch (err) {
      setCode("");
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Verify your mobile number</p>
        <p className="text-xs text-muted-foreground">
          {notice ?? `Sending a 6-digit code to ${mobile}…`}
        </p>
      </div>

      <div className="flex justify-center">
        <InputOTP
          maxLength={6}
          value={code}
          disabled={busy}
          onChange={(value) => {
            setCode(value);
            setError(null);
            if (value.length === 6) void submit(value);
          }}
        >
          <InputOTPGroup className="gap-2">
            {[0, 1, 2, 3, 4, 5].map((index) => (
              <InputOTPSlot key={index} index={index} className="h-11 w-10 rounded-md border" />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>

      {error ? <p className="text-center text-xs font-medium text-destructive">{error}</p> : null}

      <Button
        type="button"
        className="h-10 w-full"
        disabled={busy || code.length !== 6}
        onClick={() => void submit(code)}
      >
        {busy ? "Please wait…" : "Verify"}
      </Button>

      <div className="flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={onChangeNumber}
          className="text-muted-foreground underline underline-offset-4"
        >
          Change number
        </button>
        <button
          type="button"
          disabled={busy || seconds > 0}
          onClick={() => void request(true)}
          className="font-medium text-primary underline underline-offset-4 disabled:text-muted-foreground disabled:no-underline"
        >
          {seconds > 0 ? `Resend code in ${seconds}s` : "Resend code"}
        </button>
      </div>
    </div>
  );
}
