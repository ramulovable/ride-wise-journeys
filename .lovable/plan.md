# Naya login system: bhasha → mobile → OTP → permission → profile → 4-digit PIN

Purana password wala login customer aur driver ke liye hata kar mobile number + OTP + 4-digit PIN kar denge. Admin login bilkul alag aur jaisa hai waisa hi rahega. Booking, fare, dispatch, wallet, referral, QR, notification — sab kuch waisa hi chalta rahega, sirf jodna hai, kuch hataana nahi.

## Naya user pehli baar app kholega

1. **Bhasha chunav** — list database se aayegi (English, Hindi, Maithili, Bhojpuri, Marathi, Gujarati, Bangla, Asamiya, Odia, Punjabi, Tamil, Telugu, Kannada, Malayalam, Urdu, Nepali, Konkani, Kashmiri, Sindhi, Sanskrit, Santali, Bodo, Dogri, Manipuri). Admin kisi bhi bhasha ko on/off kar sakega. Screen ka text English, Hindi aur Maithili me poora taiyaar rahega; baaki bhashayein chunne par abhi English dikhega aur baad me add karte jayenge.
2. **"Aap Shahin Travels kaise use karna chahte hain?"** — 🚗 Driver Signup / 👤 Customer Signup. Admin ka option kahin nahi.
3. **Mobile number** (10 digit, 6-9 se shuru).
4. **OTP** — 6 digit SMS, expiry/limit/cooldown sab database se.
5. **Permission screen** — kyun chahiye samjha kar Location aur Notification maangenge. Camera/photo sirf tab jab user khud photo lena chahe. Call ke liye normal dialer use hoga, alag permission nahi. Driver ko ONLINE jaane se pehle location permission zaroori.
6. **Profile** — First name, Last name, Date of birth, Address, Photo, Bhasha.
7. **Driver ke liye** ek extra step: gaadi ki jaankari (segment, category, brand, model, variant, number, AC, seats) — bilkul aaj jaisa, wahi catalogue se.
8. **4-digit PIN banayein → dobara confirm karein.**
9. Customer seedha apne dashboard par; driver "approval pending" par, aur admin approve + subscription ke baad hi ONLINE ja sakega.

## Purana user

Mobile number → 4-digit PIN → backend khud role dekh kar sahi dashboard kholta hai. Role kabhi frontend se nahi liya jayega.

**PIN bhool gaye:** mobile → OTP → naya PIN → login.

**Jinke paas abhi password hai:** login par mobile daalte hi agar PIN nahi bana hai to OTP bhej kar ek baar PIN set karwa lenge. Koi account delete ya duplicate nahi hoga. Password wale box customer/driver ki screens se hata diye jayenge.

## Ek mobile = ek account

Agar number pehle se customer hai aur wahi number Driver Signup karta hai to saaf message: "Ye number pehle se Customer ke roop me registered hai. Apne account se login karein." Naya account nahi banega. Role baad me profile se badla nahi ja sakta.

## Admin ke naye control

- **Settings → Authentication & Onboarding**: OTP on/off, PIN login on/off, PIN length, OTP expiry, resend cooldown, OTP attempts, PIN attempts, lockout time.
- **Settings → Permissions**: kaunsi permission kis feature ke liye hai aur zaroori hai ya nahi. Admin kisi permission ko "granted" nahi bana sakta — asli phone ki setting hi maani jayegi.
- **Settings → Languages**: bhashayein on/off aur kram.

## Wallet

Withdrawal history me har request ka amount, date, status aur reject hone par reject karne ka kaaran saaf dikhega.

## Technical summary

Nayi tables (sab additive, RLS ke saath):
- `languages` (code, native_name, english_name, is_active, sort_order)
- `user_security` (user_id, pin_hash, pin_salt, failed_attempts, locked_until, pin_set_at)
- `auth_settings` / `app_settings` keys: pin_length, max_failed_pin_attempts, pin_lockout_minutes, otp_expiry_seconds, otp_resend_cooldown_seconds, otp_max_attempts, otp_enabled, pin_login_enabled
- `permission_policies` (permission_key, display_name, description, required_for, is_mandatory, is_active, sort_order)
- `user_permission_status` (user_id, permission_key, status, platform, last_checked_at, granted_at, denied_at)
- `profiles` me naye columns: first_name, last_name, date_of_birth, preferred_language, onboarding_step (purana full_name waise hi rahega, naam dono se bhar jayega)
- `auth_attempt_logs` (mobile, kind, success, created_at) — brute force aur audit ke liye

Server functions (`src/lib/pin.functions.ts`, `otp.functions.ts` extend):
- `lookupMobile(mobile)` — sirf "PIN set hai / nahi / account nahi" batata hai, role leak nahi karta
- `setPin({ mobile, ticket, pin })` — OTP ticket se hi PIN set hota hai; PIN salted SHA-256 hash ke roop me store, plain kabhi nahi
- `loginWithPin({ mobile, pin })` — attempts + lockout DB settings se; sahi hone par admin API se magiclink token mint karke session banta hai (wahi tarika jo abhi OTP login me chal raha hai)
- `signupWithMobile({ ticket, role, profile })` — server par role tay hota hai, duplicate mobile check hota hai
- permission status save karne ke liye `savePermissionStatus`

i18n: `src/lib/i18n.tsx` (React context + `t()` + JSON resources `src/locales/en.json`, `hi.json`, `mai.json`). Naye screens ke saare text keys se aayenge; purani screens dheere-dheere convert hongi taaki kuch toote na.

Naye routes: `/onboarding` (bhasha → role → mobile → OTP → permission → profile → PIN) aur `/login` ka naya PIN flow `/` par hi. `_authenticated` gate aur role guards me role-wise redirect sakht kiya jayega (customer → /app, rider → /rider, admin → /admin).

Dispatch engine, presence, fare, notification code ko haath nahi lagayenge; sirf permission screen ke baad location watch shuru hoga. Ant me typecheck, build, aur ek asli signup + login + dispatch regression test chalayenge.
