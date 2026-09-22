/** Short-lived signed tickets proving a mobile number was verified by SMS code. */

const TICKET_TTL_MS = 10 * 60_000;

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function ticketSecret(): string {
  const secret = process.env["OTP_TICKET_SECRET"];
  if (!secret) throw new Error("Verification is not configured. Please try again later.");
  return secret;
}

export async function issueTicket(mobile: string): Promise<string> {
  const payload = `${mobile}.${Date.now() + TICKET_TTL_MS}`;
  return `${payload}.${await hmacHex(payload, ticketSecret())}`;
}

export async function ticketIsValid(mobile: string, ticket: string): Promise<boolean> {
  const parts = ticket.split(".");
  if (parts.length !== 3) return false;
  const [ticketMobile, expiryRaw, signature] = parts as [string, string, string];
  if (ticketMobile !== mobile) return false;
  const expiry = Number(expiryRaw);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  return timingSafeEqual(await hmacHex(`${ticketMobile}.${expiryRaw}`, ticketSecret()), signature);
}

/** PBKDF2-SHA256 so a stolen database row never reveals the PIN. */
export async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: new TextEncoder().encode(salt),
      iterations: 100_000,
      hash: "SHA-256",
    },
    key,
    256,
  );
  return toHex(bits);
}

export function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}
