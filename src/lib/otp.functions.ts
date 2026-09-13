import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MOBILE_RE = /^[6-9]\d{9}$/;
const MOBILE_DOMAIN = "shahintravels.app";
const OTP_TTL_MS = 5 * 60_000;
const TICKET_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SEC = 60;
const WINDOW_MS = 15 * 60_000;
const MAX_PER_WINDOW = 3;
const MAX_PER_DAY = 10;

const sendInput = z.object({
  mobile: z.string().regex(MOBILE_RE, "Enter a valid 10-digit mobile number starting with 6-9."),
  purpose: z.enum(["signup", "login"]),
});

const verifyInput = z.object({
  mobile: z.string().regex(MOBILE_RE, "Enter a valid 10-digit mobile number starting with 6-9."),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
  purpose: z.enum(["signup", "login"]),
});

const ticketInput = z.object({
  mobile: z.string().regex(MOBILE_RE),
  ticket: z.string().min(10).max(500),
});

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toHex(digest);
}

async function hmac(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function randomCode(): string {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(100000 + ((bytes[0] ?? 0) % 900000));
}

function ticketSecret(): string {
  const secret = process.env["OTP_TICKET_SECRET"];
  if (!secret) throw new Error("Verification is not configured. Please try again later.");
  return secret;
}

async function issueTicket(mobile: string): Promise<string> {
  const payload = `${mobile}.${Date.now() + TICKET_TTL_MS}`;
  const signature = await hmac(payload, ticketSecret());
  return `${payload}.${signature}`;
}

async function ticketIsValid(mobile: string, ticket: string): Promise<boolean> {
  const parts = ticket.split(".");
  if (parts.length !== 3) return false;
  const [ticketMobile, expiryRaw, signature] = parts as [string, string, string];
  if (ticketMobile !== mobile) return false;
  const expiry = Number(expiryRaw);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  const expected = await hmac(`${ticketMobile}.${expiryRaw}`, ticketSecret());
  return timingSafeEqual(expected, signature);
}

type Fast2SmsBody = { return?: boolean; message?: unknown; status_code?: number };

async function postFast2Sms(
  apiKey: string,
  payload: Record<string, string>,
): Promise<{ ok: boolean; body: Fast2SmsBody; text: string; status: number }> {
  const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
    method: "POST",
    headers: { authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  let body: Fast2SmsBody = {};
  try {
    body = JSON.parse(text) as Fast2SmsBody;
  } catch {
    body = {};
  }
  return { ok: response.ok && body.return !== false, body, text, status: response.status };
}

function gatewayMessage(body: Fast2SmsBody): string {
  return Array.isArray(body.message)
    ? String(body.message[0] ?? "")
    : String(body.message ?? "");
}

async function sendSms(mobile: string, code: string): Promise<void> {
  const apiKey = process.env["FAST2SMS_API_KEY"];
  if (!apiKey) throw new Error("SMS service is not configured. Please log in with your password.");

  let result: Awaited<ReturnType<typeof postFast2Sms>>;
  try {
    result = await postFast2Sms(apiKey, {
      route: "otp",
      variables_values: code,
      numbers: mobile,
    });
    // status_code 996 = OTP route needs website/DLT verification on the account.
    if (!result.ok && result.body.status_code === 996) {
      result = await postFast2Sms(apiKey, {
        route: "q",
        message: `${code} is your Shahin Travels verification code. It expires in 5 minutes.`,
        language: "english",
        numbers: mobile,
      });
    }
  } catch (error) {
    console.error("[fast2sms] network error", error);
    throw new Error("We couldn't send the code right now. Please try again in a moment.");
  }

  if (!result.ok) {
    console.error("[fast2sms] send failed", result.status, result.text.slice(0, 300));
    const message = gatewayMessage(result.body);
    if (/insufficient|balance|wallet/i.test(message)) {
      throw new Error("SMS service is temporarily unavailable. Please log in with your password.");
    }
    throw new Error(
      message
        ? `SMS could not be sent: ${message}`
        : "We couldn't send the code right now. Please try again in a moment.",
    );
  }
}


export const sendOtp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => sendInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { mobile, purpose } = data;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("mobile", mobile)
      .maybeSingle();

    if (purpose === "login" && !profile) {
      throw new Error("No account found for this number.");
    }
    if (purpose === "signup" && profile) {
      throw new Error("This mobile number is already registered. Please log in instead.");
    }

    const now = Date.now();
    const { data: recent } = await supabaseAdmin
      .from("mobile_otps")
      .select("created_at")
      .eq("mobile", mobile)
      .gte("created_at", new Date(now - 24 * 60 * 60_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(MAX_PER_DAY);

    const history = (recent ?? []).map((row) => new Date(row.created_at).getTime());
    const last = history[0];
    if (last !== undefined && now - last < RESEND_COOLDOWN_SEC * 1000) {
      throw new Error("Please wait a moment before requesting another code.");
    }
    if (history.filter((time) => now - time < WINDOW_MS).length >= MAX_PER_WINDOW) {
      throw new Error("Too many code requests. Please wait a few minutes.");
    }
    if (history.length >= MAX_PER_DAY) {
      throw new Error("Daily limit reached for this number. Please try again tomorrow.");
    }

    const code = randomCode();
    await sendSms(mobile, code);

    await supabaseAdmin
      .from("mobile_otps")
      .update({ status: "expired" })
      .eq("mobile", mobile)
      .eq("purpose", purpose)
      .eq("status", "pending");

    const { error } = await supabaseAdmin.from("mobile_otps").insert({
      mobile,
      purpose,
      code_hash: await sha256(`${mobile}:${code}`),
      expires_at: new Date(now + OTP_TTL_MS).toISOString(),
    });
    if (error) throw new Error("We couldn't send the code right now. Please try again.");

    return { ok: true as const, retryAfterSeconds: RESEND_COOLDOWN_SEC };
  });

export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => verifyInput.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { mobile, code, purpose } = data;

    const { data: record } = await supabaseAdmin
      .from("mobile_otps")
      .select("id, code_hash, attempts, expires_at")
      .eq("mobile", mobile)
      .eq("purpose", purpose)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!record) throw new Error("Please request a new code.");

    if (new Date(record.expires_at).getTime() < Date.now()) {
      await supabaseAdmin.from("mobile_otps").update({ status: "expired" }).eq("id", record.id);
      throw new Error("This code has expired. Please request a new one.");
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      await supabaseAdmin.from("mobile_otps").update({ status: "expired" }).eq("id", record.id);
      throw new Error("Too many incorrect attempts. Please request a new code.");
    }

    const matches = timingSafeEqual(record.code_hash, await sha256(`${mobile}:${code}`));
    if (!matches) {
      await supabaseAdmin
        .from("mobile_otps")
        .update({ attempts: record.attempts + 1 })
        .eq("id", record.id);
      throw new Error("Incorrect code. Please try again.");
    }

    await supabaseAdmin
      .from("mobile_otps")
      .update({ status: "verified", consumed_at: new Date().toISOString() })
      .eq("id", record.id);

    if (purpose === "signup") {
      return { ticket: await issueTicket(mobile), tokenHash: null as string | null };
    }

    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: `${mobile}@${MOBILE_DOMAIN}`,
    });
    if (error || !link?.properties?.hashed_token) {
      console.error("[otp] session mint failed", error);
      throw new Error("We couldn't sign you in. Please log in with your password.");
    }

    return { ticket: null as string | null, tokenHash: link.properties.hashed_token };
  });

export const assertSignupVerified = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ticketInput.parse(input))
  .handler(async ({ data }) => {
    if (!(await ticketIsValid(data.mobile, data.ticket))) {
      throw new Error("Mobile verification expired. Please verify your number again.");
    }
    return { ok: true as const };
  });
