# Shahin Travels — Master Prompt Part 1

Brings the existing app in line with the Part 1 specification: new fare rates, richer signup, a reject-and-redispatch dispatch flow, driver details on the customer ride screen, ratings, a mobile-first admin dashboard, and admin-managed settings (subscription fee, support phone/email). No demo data anywhere.

## 1. Registration and profiles
- Customer signup adds profile photo upload, address and an optional referral code, alongside the existing 10-digit mobile (6-9) and password.
- Simple anti-abuse: per-device attempt throttle plus a server-side check that limits repeated signups from the same source; no OTP.
- Driver signup stays "pending approval" until an administrator approves; driver photo upload added.
- Profile photos stored in a new private-read image store with owner-only upload rules.

## 2. Fare engine (replaces current numbers)
Administrator-managed rules, applied on the server only:
- Three wheeler: 0–12 km at ₹6/km; 12–15 km at ₹10/km; exactly 15 km = ₹150; above 15 up to 35 km — Share ₹50 per passenger, Reserve ₹900 fixed; above 35 km ₹30/km.
- Two wheeler: ₹30/km, single price, no share/reserve.
- Four wheeler: AC ₹50/km, Non-AC ₹40/km, single price, configurable extra-km rate.
- Every quote is recalculated and re-validated when the ride is booked, and the accepted breakdown is frozen onto the booking.
- Ranges with no configured price still show "Fare currently unavailable".

## 3. Booking creation is only on "Book Ride"
- Confirm and lock in that searching or calculating a fare never creates a booking, an offer, a driver notification or any stored ride.
- A booking and its broadcast are created only when the customer presses Book Ride.

## 4. Reject, redispatch and "no driver available"
- Driver request card keeps Accept and Reject side by side.
- Accept stays atomic: the first valid acceptance wins; everyone else sees "Booking is no longer available".
- Reject permanently excludes that driver from the booking and passes it to the remaining eligible online drivers.
- When no eligible driver remains, the booking moves to a new "No driver available" state that the customer sees clearly.

## 5. Ride tracking, driver details and ratings
- Customer ride screen shows assigned driver name, photo, vehicle type, brand/model, registration number and a Call Driver button.
- After a completed ride the customer can leave 1–5 stars and an optional review, once per booking; already-rated bookings show the submitted rating.

## 6. Vehicle catalog and locations
- Catalog hierarchy extended with segment and variant levels on top of the existing category, brand, model, AC and seat capacity.
- Starter brands seeded once: Bike and Scooty (2W); E-Rickshaw, Auto Rickshaw and Electric Auto (3W); Hatchback, Sedan, SUV, MUV and Passenger Van (4W). Administrators can add more.
- Locations gain an editable PIN code; Bharwara Bazar set to 847104. Location pickers keep the chosen name inside the input field.

## 7. Administrator panel
- Mobile-first dashboard of centered, near-square, touch-friendly cards with real counts only (zero when empty).
- Sections: Customers (activate/block/delete), Drivers (approve/reject, record cash subscription renewals), Bookings and audit, Fare rules with change history, Locations, Vehicle catalog, Support tickets, Settings.
- Settings screen manages the monthly subscription fee plus support phone (default 9334039007) and support email (default ayankha8866@gmail.com); the WhatsApp/help shortcuts read those values instead of a fixed number.
- No wallet or financial transactions in this part.

## 8. Verification
- Fare checks at 5, 12, 14, 15, 25 and 40 km for each vehicle class, share vs reserve.
- Confirm search creates nothing; confirm two simultaneous accepts leave exactly one winner; confirm rejection by every driver ends in "No driver available".
- Walk customer, driver and administrator screens at 320px and desktop widths, then run the security checks and a clean build.

## Technical details
- Migration adds: `no_rider_available` ride status; `ride_rejections` (or reuse of the existing dismissal table) driving redispatch and the terminal state; `locations.pin_code`; `vehicle_segments` and `vehicle_variants`; `profiles.referral_code`; text-valued app settings for support phone/email; a `fare_rule_history` audit table fed by a trigger.
- Fare rules/slabs reseeded to the Part 1 numbers with the 15 km fixed-price case expressed as a dedicated slab, and Reserve's ₹900 as a flat slab.
- Storage bucket `profile-photos` with owner-scoped write policies and public read of avatars only.
- All new tables get explicit grants, row-level security and owner/administrator policies.
