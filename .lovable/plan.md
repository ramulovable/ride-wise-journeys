# Customer & Driver Master Update

## Goal
Rebuild the customer booking screen and driver home screen to match the supplied mockups, show exactly five ride categories with real fares, simplify adding a vehicle, and add a live tracking map once a ride is accepted — with all current accounts, fares, rides, payments and alerts working exactly as today.

## 1. Customer booking screen
- Branded app header: menu, logo with the Hindi tagline, notification bell.
- Promotional banner slider stays at the top, wide and undistorted, from the banners you manage.
- One combined route card: green pickup pin, dashed connector, red destination pin, and a working swap button. Tapping a row opens the existing Darbhanga quick picks and India-wide search.
- "Choose Vehicle Type" shows exactly five cards — Bike (Fast & Affordable), Scooty (Easy & Comfortable), Auto (For Your Daily Ride), E-Rickshaw (Eco Friendly), Car (Spacious & Safe) — each with a clear vehicle picture and a green selected state.
- Fares: before pickup and destination are chosen, cards show a placeholder dash. Once both are set, each card shows the real fare from the existing pricing rules, including day/night pricing and Reserve for three-wheelers between 15 and 35 km. No price is ever calculated in the app itself.
- Large "Book Ride Now" button books the selected category using today's booking flow.
- Four round shortcuts: My Rides, Fare Details, Help & Support, My Profile.
- "Are you a Driver?" green callout card.
- Bottom tabs: Home, My Bookings, Support, Profile.

## 2. Driver home screen
- Same branded header.
- Driver card: photo, name, "Verified Driver" badge when approved, star rating and completed-ride count from real records.
- Online/Offline card with a toggle that keeps all approval, subscription and blocked-account checks.
- Four stat tiles: Total Rides, Rating, Total Earning, On Time. Each shows a dash instead of a number when there is no real data yet.
- "Today's Bookings": incoming requests with pickup, destination, distance, fare and time since request, plus Reject and Accept buttons, and in-progress trips with their next step.
- Eight quick actions: My Vehicles, My Routes & Fare, Earnings, Wallet, QR Code, Rider History, Profile, Help & Support.
- Subscription card with crown, status pill and validity date from the stored subscription.
- Bottom tabs: Home, Bookings, Earning, Profile.

## 3. Simpler vehicle registration
Adding a vehicle asks only for: category (Bike, Scooty, Auto, E-Rickshaw, Car), brand/company name, model name, and vehicle number. Brand and model are free text with suggestions from the existing catalogue, so drivers are never blocked by a missing entry. Existing vehicles keep working unchanged.

## 4. Live tracking map
- The moment a driver accepts, both driver and customer get a full-screen interactive map.
- The map draws the route from the driver's current position to the pickup point and on to the destination, with traffic colours turned on.
- The driver's device shares its live position while the trip is active; both sides see the vehicle marker move along the route, plus pickup and drop markers and the trip status.
- Location sharing asks permission, stops automatically when the trip ends or is cancelled, and the screen still works (without the moving marker) if permission is denied.

## 5. Categories and artwork
The five categories are set up in the vehicle catalogue so every screen — booking, driver vehicles, admin — uses the same list. Each gets a high-quality image; admin-uploaded images always win over the built-in artwork.

## Technical details
- Frontend restructuring of the customer and driver routes plus shared shell/navigation; admin screens untouched.
- Fare engine, booking, dispatch, wallet, referral and notification server functions are reused as-is; only reads are added for driver rating/earnings.
- Live positions stored in a new driver-location table with strict access rules (only the paired customer and the driver on an active ride), updated over the existing realtime channel.
- Map rendered with the Google Maps JavaScript API using the managed browser key; routing/geocoding stays on the backend.
- Category and artwork setup applied as data changes, not hardcoded lists.
- Verified with typecheck, lint, build and browser checks of both dashboards.

## Note
The mockups show sample numbers (320 rides, ₹12,450, 96% on time). Those tiles will show your real figures, and a dash where the app has no truthful value yet — on-time percentage in particular has no recorded schedule data, so it stays blank until we define how it should be measured.
