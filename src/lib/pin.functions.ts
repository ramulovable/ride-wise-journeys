import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MOBILE_RE = /^[6-9]\d{9}$/;
const MOBILE_DOMAIN = "shahintravels.app";

const mobileSchema = z
  .string()
  .regex(MOBILE_RE, "Enter a valid 10-digit mobile number starting with 6-9.");

const lookupInput = z.object({ mobile: mobileSchema });

const setPinInput = z.object({
  mobile: mobileSchema,
  ticket: z.string().min(10).max(500),
  pin: z.string().regex(/^\d{4,8}$/, "Enter your PIN."),
});

const loginInput = z.object({
  mobile: mobileSchema,
  pin: z.string().regex(/^\d{4,8}$/, "Enter your PIN."),
});

const signupInput = z.object({
  mobile: mobileSchema,
  ticket: z.string().min(10).max(500),
  role: z.enum(["customer", "rider"]),
  pin: z.string().regex(/^\d{4,8}$/, "Choose a PIN."),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().max(60).default(""),
  dateOfBirth: z.string().trim().max(20).optional(),
  address: z.string().trim().max(200).default(""),
  language: z.string().trim().min(2).max(10).default("en"),
  referralCode: z.string().trim().max(20).default(""),
});

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function admin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

type SecuritySettings = {
  pinLength: number;
  maxFailedAttempts: number;
  lockoutMinutes: number;
  pinLoginEnabled: boolean;
};

async function securitySettings(db: Admin): Promise<SecuritySettings> {
  const { data } = await db
    .from("app_settings")
    .select("key, numeric_value")
    .in("key", [
      "pin_length",
      "max_failed_pin_attempts",
      "pin_lockout_minutes",
      "pin_login_enabled",
    ]);
  const map = new Map((data ?? []).map((row) => [row.key, Number(row.numeric_value)]));
  return {
    pinLength: map.get("pin_length") ?? 4,
    maxFailedAttempts: map.get("max_failed_pin_attempts") ?? 5,
    lockoutMinutes: map.get("pin_lockout_minutes") ?? 15,
    pinLoginEnabled: (map.get("pin_login_enabled") ?? 1) === 1,
  };
}

async function logAttempt(
  db: Admin,
  mobile: string,
  kind: string,
  success: boolean,
  detail?: string,
) {
  await db.from("auth_attempt_logs").insert({ mobile, kind, success, detail: detail ?? null });
}

async function profileByMobile(db: Admin, mobile: string) {
  const { data } = await db
    .from("profiles")
    .select("id, is_blocked")
    .eq("mobile", mobile)
    .maybeSingle();
  return data;
}

async function roleOf(db: Admin, userId: string): Promise<"admin" | "rider" | "customer"> {
  const { data } = await db.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((row) => row.role as string);
  if (roles.includes("admin")) return "admin";
  if (roles.includes("rider")) return "rider";
  return "customer";
}

async function mintSession(db: Admin, mobile: string): Promise<string> {
  const { data, error } = await db.auth.admin.generateLink({
    type: "magiclink",
    email: `${mobile}@${MOBILE_DOMAIN}`,
  });
  if (error || !data?.properties?.hashed_token) {
    console.error("[pin] session mint failed", error);
    throw new Error("We couldn't sign you in. Please try again.");
  }
  return data.properties.hashed_token;
}

/** Tells the sign-in screen which step to show. Never reveals personal details. */
export const lookupMobile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => lookupInput.parse(input))
  .handler(async ({ data }) => {
    const db = await admin();
    const profile = await profileByMobile(db, data.mobile);
    if (!profile) return { exists: false, hasPin: false, role: null as string | null };
    const { data: security } = await db
      .from("user_security")
      .select("pin_hash")
      .eq("user_id", profile.id)
      .maybeSingle();
    return {
      exists: true,
      hasPin: Boolean(security?.pin_hash),
      role: await roleOf(db, profile.id),
    };
  });

/** Sets or resets the PIN. Only possible right after an SMS code was verified. */
export const setPin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => setPinInput.parse(input))
  .handler(async ({ data }) => {
    const db = await admin();
    const { ticketIsValid, hashPin, randomSalt } = await import("@/lib/auth-tickets.server");
    if (!(await ticketIsValid(data.mobile, data.ticket))) {
      throw new Error("Mobile verification expired. Please verify your number again.");
    }
    const settings = await securitySettings(db);
    if (data.pin.length !== settings.pinLength) {
      throw new Error(`Your PIN must be exactly ${settings.pinLength} digits.`);
    }
    const profile = await profileByMobile(db, data.mobile);
    if (!profile) throw new Error("No account found for this number.");
    if (profile.is_blocked) throw new Error("This account is blocked. Please contact support.");

    const salt = randomSalt();
    const pinHash = await hashPin(data.pin, salt);
    const { error } = await db.from("user_security").upsert(
      {
        user_id: profile.id,
        pin_hash: pinHash,
        pin_salt: salt,
        pin_set_at: new Date().toISOString(),
        failed_attempts: 0,
        locked_until: null,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error("We couldn't save your PIN. Please try again.");
    await logAttempt(db, data.mobile, "pin_set", true);
    return { ok: true as const, tokenHash: await mintSession(db, data.mobile) };
  });

/** Signs a returning customer or driver in with their PIN. */
export const loginWithPin = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => loginInput.parse(input))
  .handler(async ({ data }) => {
    const db = await admin();
    const { hashPin, timingSafeEqual } = await import("@/lib/auth-tickets.server");
    const settings = await securitySettings(db);
    if (!settings.pinLoginEnabled) throw new Error("PIN login is currently switched off.");

    const profile = await profileByMobile(db, data.mobile);
    if (!profile) {
      await logAttempt(db, data.mobile, "pin_login", false, "unknown mobile");
      throw new Error("Wrong mobile number or PIN.");
    }
    if (profile.is_blocked) throw new Error("This account is blocked. Please contact support.");

    const { data: security } = await db
      .from("user_security")
      .select("pin_hash, pin_salt, failed_attempts, locked_until")
      .eq("user_id", profile.id)
      .maybeSingle();

    if (!security?.pin_hash || !security.pin_salt) {
      throw new Error("No PIN set for this number yet. Please use 'Forgot PIN' to create one.");
    }
    if (security.locked_until && new Date(security.locked_until).getTime() > Date.now()) {
      const minutes = Math.ceil((new Date(security.locked_until).getTime() - Date.now()) / 60_000);
      throw new Error(`Too many wrong attempts. Please try again in ${minutes} minute(s).`);
    }

    const candidate = await hashPin(data.pin, security.pin_salt);
    if (!timingSafeEqual(candidate, security.pin_hash)) {
      const attempts = (security.failed_attempts ?? 0) + 1;
      const locked = attempts >= settings.maxFailedAttempts;
      await db
        .from("user_security")
        .update({
          failed_attempts: locked ? 0 : attempts,
          locked_until: locked
            ? new Date(Date.now() + settings.lockoutMinutes * 60_000).toISOString()
            : null,
        })
        .eq("user_id", profile.id);
      await logAttempt(db, data.mobile, "pin_login", false, "wrong pin");
      throw new Error(
        locked
          ? `Too many wrong attempts. Please try again in ${settings.lockoutMinutes} minutes.`
          : `Wrong PIN. ${settings.maxFailedAttempts - attempts} attempt(s) left.`,
      );
    }

    await db
      .from("user_security")
      .update({ failed_attempts: 0, locked_until: null })
      .eq("user_id", profile.id);
    await logAttempt(db, data.mobile, "pin_login", true);

    return {
      ok: true as const,
      role: await roleOf(db, profile.id),
      tokenHash: await mintSession(db, data.mobile),
    };
  });

/** Creates a customer or driver account after the number was verified by SMS. */
export const signupWithMobile = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => signupInput.parse(input))
  .handler(async ({ data }) => {
    const db = await admin();
    const { ticketIsValid, hashPin, randomSalt } = await import("@/lib/auth-tickets.server");
    if (!(await ticketIsValid(data.mobile, data.ticket))) {
      throw new Error("Mobile verification expired. Please verify your number again.");
    }
    const settings = await securitySettings(db);
    if (data.pin.length !== settings.pinLength) {
      throw new Error(`Your PIN must be exactly ${settings.pinLength} digits.`);
    }

    const existing = await profileByMobile(db, data.mobile);
    if (existing) {
      const role = await roleOf(db, existing.id);
      throw new Error(
        `This mobile number is already registered as a ${role === "rider" ? "Driver" : "Customer"}. Please log in with your existing account.`,
      );
    }

    const fullName = [data.firstName, data.lastName].filter(Boolean).join(" ").trim();
    const { data: created, error } = await db.auth.admin.createUser({
      email: `${data.mobile}@${MOBILE_DOMAIN}`,
      email_confirm: true,
      user_metadata: {
        mobile: data.mobile,
        full_name: fullName,
        role: data.role,
        address: data.address,
        referral_code: data.referralCode.toUpperCase(),
      },
    });
    if (error || !created.user) {
      console.error("[signup] create user failed", error);
      await logAttempt(db, data.mobile, "signup", false, error?.message);
      throw new Error("We couldn't create your account. Please try again.");
    }

    const userId = created.user.id;
    await db
      .from("profiles")
      .update({
        first_name: data.firstName,
        last_name: data.lastName || null,
        date_of_birth: data.dateOfBirth ? data.dateOfBirth : null,
        preferred_language: data.language,
        onboarding_step: data.role === "rider" ? "vehicle" : "done",
      })
      .eq("id", userId);

    const salt = randomSalt();
    await db.from("user_security").upsert(
      {
        user_id: userId,
        pin_hash: await hashPin(data.pin, salt),
        pin_salt: salt,
        pin_set_at: new Date().toISOString(),
        failed_attempts: 0,
      },
      { onConflict: "user_id" },
    );

    await logAttempt(db, data.mobile, "signup", true, data.role);
    return {
      ok: true as const,
      role: data.role,
      userId,
      tokenHash: await mintSession(db, data.mobile),
    };
  });
