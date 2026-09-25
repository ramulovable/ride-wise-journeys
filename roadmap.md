# Shahin Travels V1 roadmap

- [x] Lovable Cloud enabled, database schema + RLS
- [x] Brand assets and theme
- [x] Auth: mobile+password (rider/customer), email+password (admin)
- [x] Fix TypeScript errors and unsafe inferred route casts
- [x] Seed the supplied 52 Darbhanga locations
- [x] Provision and verify the default ADMIN account
- [x] Add multi-vehicle data model with secure rider/admin access
- [x] Rider: vehicles, route fares, online toggle, ride lifecycle, QR, earnings/history
- [x] Admin: dashboard, riders, subscriptions, catalog, locations, rides, support, QR
- [x] Harden server-side booking, rider state transitions, and admin actions
- [x] Verify database security checks, clean build, and mobile workflows
- [x] Add authenticated India-wide location autocomplete with Darbhanga presets
- [x] Persist canonical selected places and preserve exact route matching
- [x] Show Google driving distance in customer booking and rider fare screens
- [x] Verify location search, distance, matching, mobile UI, and clean build
- [x] Add WhatsApp support shortcut to customer and driver screens only
- [x] Add admin customer management and complete ride audit history
- [x] Replace rider fares with centralized admin fare engine and broadcast dispatch
- [x] Restore per-driver broadcast decline and rider profile reviews

- [x] Show live IST Day/Night fare status on driver and admin dashboards

## Master update (customer + driver redesign)
- [x] Redesign customer booking dashboard to match reference mockup
- [x] Redesign driver dashboard to match reference mockup
- [x] Show exactly 5 vehicle categories with quality artwork and live fares
- [x] Simplify driver vehicle registration to category + brand + model + number
- [x] Live Google Maps tracking with route, traffic and moving driver marker
- [x] Standardize the admin-controlled verified driver badge across driver, customer and admin views

## Open
- [x] Google Maps custom key stored as secret GOOGLE_MAPS_CUSTOM_BROWSER_KEY; LiveRideMap loads it via getMapsBrowserKey server fn with managed-key fallback; published and verified live (map + route render on shahintravels.app).

## Pending
- Referral reward condition fully admin-configurable (DB table referral_reward_conditions); NEW_ACCOUNT_CREATED credits referrer wallet immediately on signup (idempotent, anti-abuse, limit enforced); remove hardcoded first_ride helper text; ?ref= link attribution; admin referral history detail.

## In progress (Sep 21)
- [x] Live drivers page: show every online driver, even without GPS yet
- [x] Admin broadcast notifications (all / customers / drivers) + history
- [x] Full-screen new ride alert (driver overlay + admin controls) for drivers (in-app full-screen request screen, sticky until accept/reject/cancel/expiry, admin-configurable sound/vibration/timeout/priority, race-safe accept)

## Auth rebuild (Sep 22)
- [x] Language selection (DB-driven, i18n) before signup
- [x] Role choice: Driver signup / Customer signup (no public admin signup)
- [x] Mobile + OTP signup, 4-digit PIN login, forgot PIN via OTP
- [x] Permission onboarding screen (location, notifications) + DB policy table
- [x] Role-aware profile setup; rider vehicle step preserved (existing /rider/vehicle page)
- [x] Existing users migrate to PIN via OTP; password UI removed for customer/rider
- [x] Admin -> Sign-in page: auth rules, permissions, languages
- [x] Wallet withdrawal history with rejection reason
- [ ] Translate remaining 21 languages (English, Hindi, Maithili done; others fall back to English)

## Android app (APK/Play Store)
- [ ] Capacitor Android wrapper + full-screen ride alert (native)
- [ ] GitHub Actions workflow to build APK + AAB
- [ ] Website /download page + buttons, admin-configurable APK URL
- [ ] Single app for both customers and drivers (customer signup works in app)

## Android app (APK + Play Store)
- [x] Capacitor Android wrapper (com.shahintravels.app, one app for customers + drivers)
- [x] Full-screen lock-screen ride alert activity + Firebase messaging service
- [x] GitHub Actions workflow building signed APK + AAB into a Release
- [x] Public /download page with admin-configurable APK / Play Store link
- [x] Native FCM token saved to notification_devices (device_type android)
- [ ] Firebase google-services.json + release keystore GitHub secrets (needs owner)
- [ ] Play Store listing + first AAB upload (needs developer account)

## Android ride alerts (Sep 22)
- [x] Removed the old browser "Turn on ride alerts" button (customer + driver)
- [x] Native bridge window.ShahinNative: notifications, appear-on-top, battery unrestricted
- [x] Driver dashboard "Ride alert setup" card (APK only) with one-tap Allow for all three

## Wallet + QR + alerts (Sep 24)
- [x] Admin driver list: live wallet balance + pending payout badge, "View wallet" dialog (balance, payout requests, full wallet history)
- [ ] Existing drivers' QR auto-upgraded to stylish per-driver referral QR (no re-registration)
- [ ] Android v1.0.4: continuous loud voice alert until accept/decline (silent/vibrate bypass)
- [ ] Android v1.0.4: in-app direct APK updater (no browser download)
- [ ] Customer home extras inside existing UI: auto GPS pickup, mic voice search, live nearby drivers on map, per-vehicle ETA
