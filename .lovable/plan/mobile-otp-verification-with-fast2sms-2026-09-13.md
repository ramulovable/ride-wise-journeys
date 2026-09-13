# Mobile OTP verification with Fast2SMS

Add SMS one-time-password verification for customers and drivers, at sign-up and as an alternative way to log in. Admin sign-in with email and password stays exactly as it is.

## What people will see

**Creating an account (customer or driver)**
1. Fill the existing form (name, mobile, password, address, referral code, photo).
2. Tap "Send code" — a 6-digit code arrives by SMS on that mobile number.
3. Enter the code. A 60-second countdown controls the "Resend code" button.
4. Once the code is accepted, the account is created and they continue as today (drivers still start pending approval).

**Logging in**
Two tabs on the login card: "Password" (current behaviour, unchanged) and "OTP".
For OTP: enter mobile → receive code → enter code → signed in and sent to their home screen.
Codes only go to mobile numbers that already have an account; unknown numbers get "No account found for this number."

**Messages people see**
- Wrong code entered → "Incorrect code. Please try again." (5 attempts, then the code is dead)
- Code older than 5 minutes → "This code has expired. Please request a new one."
- Too many requests → "Too many code requests. Please wait a few minutes."
- SMS gateway problem or low balance → "We couldn't send the code right now. Please try again or log in with your password."

## Technical design

**Secret**: `FAST2SMS_API_KEY` stored in the secret store (never in code); read inside handlers only.

**Table `public.mobile_otps`**
`id, mobile (text), code_hash (text), purpose (text: 'signup' | 'login'), status (text: 'pending' | 'verified' | 'expired'), attempts (int), expires_at, consumed_at, created_at, updated_at`
plus indexes on `(mobile, created_at desc)` and `(mobile, purpose, status)`.
RLS enabled with **no policies** and no grants to `anon`/`authenticated` — only server code (service role) touches it. Codes are stored as SHA-256 hashes, never plaintext.

**Server functions** in `src/lib/otp.functions.ts` (unauthenticated by design — these run before sign-in; each loads `supabaseAdmin` inside the handler):
- `sendOtp({ mobile, purpose })` — Zod-validates the 10-digit 6-9 mobile; for `login` requires an existing profile, for `signup` requires that the number is free; rate limits (max 3 codes per number per 15 min, max 1 per 60 s, plus a per-number daily cap of 10); generates a 6-digit code; POSTs to `https://www.fast2sms.com/dev/bulkV2` with `{ route: "otp", variables_values, numbers }` and the `authorization` header; inserts the hashed record with `expires_at = now() + 5 min`; returns `{ ok, retryAfterSeconds }` and never the code.
- `verifyOtp({ mobile, code, purpose })` — finds the newest pending record, checks expiry and attempt count, compares hashes, marks `verified`. For `purpose: 'login'` it then mints a session: `supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email: mobileToEmail(mobile) })` and returns only the `hashed_token`, which the browser exchanges via `supabase.auth.verifyOtp({ type: 'magiclink', token_hash })`. For `purpose: 'signup'` it returns a short-lived signed verification ticket (HMAC over mobile + timestamp, 10-minute life) so the sign-up step can prove the number was verified.
- `finalizeSignup` is not needed: sign-up still runs client-side `supabase.auth.signUp`, but the form only enables it after the ticket is issued, and the ticket is passed in `options.data.otp_ticket`; a `BEFORE INSERT` check is not added to auth, so the ticket is validated in a small server function `assertSignupVerified` called immediately before `signUp`.

**Frontend**
- New `src/components/OtpField.tsx` — 6-box code entry using the existing `input-otp` component, with the 60-second resend countdown and inline error text.
- `src/routes/index.tsx` — login card gains Password/OTP tabs; the sign-up form gains the verify step between "Create account" and submission.
- `src/routes/admin-login.tsx` — untouched.

**Verification**: `bunx tsgo --noEmit`, ESLint on changed files, production build, and a Playwright pass on the welcome screen to confirm both tabs render and the countdown runs.

## Notes

- Fast2SMS's `route: "otp"` uses their DLT-approved OTP template, so the message text is fixed by the gateway.
- The API key you pasted in chat will be saved through the secure secret form rather than kept in the message.
