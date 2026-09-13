# Shahin Travels — Part 2: Money, Referrals, Wallet, Images, QR, Push

Adds real earnings, referrals, wallets and withdrawals, vehicle photos, QR management and ride-request notifications, without changing anything from Part 1.

## 1. Earnings (real money only)

- New `earning_transactions` record: one row per completed ride, per driver, with the exact fare from the ride's saved fare snapshot.
- Credited automatically the moment a ride is marked **Completed** — never earlier. A database rule makes a second credit for the same ride impossible.
- Driver earnings screens read from this record. With no completed rides they show ₹0 and a clean empty message.

## 2. Referral & earn

- Every customer and driver gets a unique code like `ST8K4P2X`, generated at sign-up and backfilled for existing accounts.
- Sign-up keeps its optional referral field. The code is checked when the account is created: unknown code, own code, or an account that already used one is rejected with a clear message.
- Reward (default ₹20, changeable in Admin Settings) is credited to both sides' wallets once the referred person completes their first ride.
- New **My Referral** page for customers and drivers: their code, copy and share buttons, reward amount, and the real list of people they referred with status and amount earned. Empty until someone joins.

## 3. Wallet & withdrawals

- Each user gets one wallet with a running balance built only from real entries: referral reward, ride earning, withdrawal hold, withdrawal payout, withdrawal reversal, admin adjustment.
- **My Wallet** page (customer and driver): available balance, on-hold amount, full transaction list.
- **Withdraw**: user enters UPI ID and amount. The backend checks the balance and the admin-set minimum/maximum, then puts the amount on hold and creates a request. Users cannot withdraw money they don't have.
- **Withdrawal History** page showing each request and its stage: Pending, Approved, Processing, Paid, Rejected, Failed, Reversed.
- **Admin → Withdrawals**: list with filters, approve or reject, mark as paid with a payment reference/UTR. Rejecting or failing a request automatically releases the hold and returns the money to the wallet.
- **Admin wallet ledger** recording business money out for every payout, viewable in Admin.

## 4. Vehicle images

- New vehicle image library linked to a category, brand, model or variant, each with a primary flag and active switch.
- **Admin → Catalog → Vehicle Images**: upload, replace, delete, set primary, and choose what the image applies to. Files go to a new images bucket.
- Picking rule everywhere: exact variant image, else model, else brand, else category, else a built-in fallback graphic — so no broken pictures ever appear.
- Images shown on customer booking vehicle choices, driver's own vehicles, driver's incoming request cards and the admin ride details.

## 5. QR codes

- Every driver vehicle already has a unique code; Admin QR page gains download (PNG), print and regenerate, plus search.
- Drivers see their own vehicle QR in their profile.
- The link the QR points at is built from a setting in Admin, not fixed in the app.

## 6. Ride-request notifications for drivers

- Driver devices register for push and are stored against the driver account; logging out or revoking permission deactivates the device.
- Notifications are sent **only** when a customer presses **Book Ride** — never during fare search.
- They go only to drivers who are online, approved, unblocked, have a valid subscription, run a matching vehicle category, and have not rejected that booking.
- The message carries pickup, destination, distance, fare and vehicle type, and opens the app straight on that request card with working Accept and Reject.
- First driver to accept gets the ride; anyone else tapping later sees "Ride no longer available" (this protection already exists and is reused).
- Every notification is logged; Admin gets a Notifications view with the message templates editable in Settings.
- In-app: the driver dashboard keeps live-updating request cards so this works even for drivers who decline notification permission.

## 7. Settings (nothing hardcoded)

Admin Settings gains: referral reward, minimum and maximum withdrawal, QR destination URL, and notification title/body templates — alongside the existing subscription fee and support contacts.

## Technical notes

- New tables: `earning_transactions`, `referrals`, `referral_transactions`, `wallet_accounts`, `wallet_transactions`, `withdrawal_requests`, `admin_wallet_transactions`, `vehicle_images`, `notification_devices`, `notifications`. All with row-level security: users read only their own rows; admins read all; balance-changing writes happen only inside server-side functions (security definer) so no client can mint money.
- Balances are derived from the ledger, never stored as an editable number; holds and reversals are separate signed entries.
- Ride completion, referral crediting, withdrawal hold/approve/reject are all single atomic database functions to avoid double-credit under concurrency.
- Push uses Firebase Cloud Messaging through the Lovable connector; sending happens in a server function called by `createBooking`. **This needs the user to connect Firebase Cloud Messaging with web push enabled** — a connect card will be shown. Until connected, everything else works and the in-app realtime request feed remains the fallback.
- New storage bucket `vehicle-images` (private, admin-write, authenticated-read) with signed URLs.
- Verification: build, lint, strict typecheck, plus a browser pass over wallet, referral, withdrawal and admin approval flows.
