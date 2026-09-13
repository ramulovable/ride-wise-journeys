# Complete referral code system

Builds a proper, configurable referral programme on top of the existing wallet and referral pieces: a dedicated code record per user, validated signup, ledger-backed rewards, a richer wallet section, and an admin Referral & Rewards screen.

## 1. Every user gets a permanent code

- A new referral code record holds one unique code per customer or driver (letters and digits, e.g. `ST8K4P2X`), created automatically the moment the account is created — the user never types or picks it.
- Uniqueness is enforced by the database; if a generated code clashes, it retries with a new one.
- A one-time job creates a code for every existing customer and driver that does not have one.
- If an old account somehow still has none when it opens the wallet, one is generated and saved on the spot.

## 2. Signup with a friend's code

- The optional "Referral code" field stays on signup for both customers and drivers.
- Checks done on the server as the account is created: the code must exist, belong to an active, non-blocked account, must not be the person's own code, and a new user can only ever be linked once.
- A wrong code shows a clear message and never blocks registration — the account is still created, just without a referral link.

## 3. Reward, paid from the ledger

- Reward is credited as a normal wallet entry (type "referral reward") tied to the referral record, so balances stay computed from real entries only.
- Credit happens once the configured condition is met (first completed ride of the referred user, as today). Duplicate credit is impossible: a single reward row per referral, enforced by the database.
- Concurrency is handled inside one database function, so two simultaneous events can't double-pay.

## 4. Wallet page (customer and driver)

Sections, all read from the database:

- Wallet balance and amount on hold
- Refer & Earn: "My referral code: CODE" with Copy code and Share & Earn buttons
- Referral earnings total and successful-referrals count
- Referral history: who joined, date, reward amount, status
- Withdraw button and withdrawal history (existing)

Copy puts the code on the clipboard and shows a confirmation. Share & Earn uses the phone's share sheet where available and falls back to copying. The invite text and link both come from admin settings — nothing written into the app.

## 5. Admin → Referral & Rewards

- Totals: total referrals, successful, pending, total rewards paid, current reward amount.
- Records list: referrer, referred user, code used, date, reward status, with a tap to see the detail.
- Settings block: reward amount (starts at ₹20), programme on/off, reward condition, per-user referral limit, invite message and invite link. All saved to the database and changeable any time.

## 6. Abuse protection

Self-referral blocked, one referral link per new user, one reward per referral, balance can never go negative, and reward writes only happen inside trusted server-side database functions so no one can mint money from the app.

## Technical notes

- New tables: `referral_codes` (user_id, code unique, is_active, timestamps) and a reworked `referrals` (referrer_user_id, referred_user_id, referral_code_id, status, eligible_at, reward_amount, timestamps) with a unique constraint on the referred user; existing `referral_transactions` and `wallet_transactions` keep the money trail. Existing referral rows are migrated across.
- Signup linking moves into the `handle_new_user` trigger path plus a security-definer `link_referral` / `ensure_referral_code` function; reward crediting stays inside `credit_ride_completion`, reading amount and rules from `app_settings` / `app_text_settings`.
- New config keys: `referral_program_enabled`, `referral_max_per_user`, `referral_reward_condition`, `referral_invite_message`, `referral_invite_url`, `referral_copy_toast`.
- Frontend: extend `src/lib/settings.ts`, rewrite `src/routes/_authenticated/wallet.tsx` and `referral.tsx` around shared referral helpers, add `src/routes/_authenticated/admin/referrals.tsx` plus an admin nav entry, and extend admin settings.
- Verification: strict typecheck, clean production build, and a browser pass over signup with a code, wallet display, copy/share and the admin list.
