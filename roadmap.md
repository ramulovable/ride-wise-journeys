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
- [ ] Full-screen new ride alert for drivers (in-app full-screen request screen, sticky until accept/reject/cancel/expiry, admin-configurable sound/vibration/timeout/priority, race-safe accept)
