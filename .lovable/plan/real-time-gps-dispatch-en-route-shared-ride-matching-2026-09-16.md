# Real-time GPS dispatch + en-route shared ride matching

Additive extension of the existing app. No existing table, booking flow, fare engine, subscription rule, map or notification behaviour is removed.

## What changes for people using the app

**Drivers**
- The app keeps sending the driver's real GPS position (while online), not just during an active trip.
- A new booking only reaches drivers who are genuinely near the pickup point, within a distance the admin sets.
- A driver already carrying share passengers toward a destination can receive a second/third share booking whose pickup lies ahead on the road they are already on. A clearly marked "En-route share request" card shows the extra distance, extra time and seats left, with working Accept and Reject buttons.
- Drivers are never assigned a passenger automatically; they always choose.
- A pickup behind the driver, off the corridor, in the wrong direction, or beyond the seat capacity never appears.

**Customers**
- Booking, fares, share/reserve rules and the live map stay exactly as they are.
- Searching a route still sends nothing to anyone; only "Book Ride" dispatches.
- If no nearby driver and no compatible en-route driver exists, the booking ends as "No driver available" as today.

**Admin**
- New "Dispatch & matching" page: switch nearby dispatch and en-route matching on/off, set pickup radius, corridor width, maximum detour, maximum extra travel time, location freshness, GPS accuracy limit, dispatch priority, reserve exclusivity and share capacity cap. Every value is stored in the database and editable — nothing is fixed in code.
- New "Live drivers" monitor: real drivers with status, last known position, last update time, accuracy, vehicle, current booking, passengers on board and seats left. No demo data.

## Technical outline

**Migrations (additive only)**
- `dispatch_settings` — one row, all tunables above, seeded with sensible starting values, admin-writable, audit-logged like other config tables.
- `rider_presence` — one row per driver: status (`offline` / `online_available` / `online_on_ride`), current lat/lng, accuracy, active vehicle, active ride, `last_location_at`, `last_seen_at`.
- `rider_live_locations` — append-only GPS history (rider, vehicle, lat/lng, accuracy, recorded_at).
- `ride_route_state` — per active ride: origin/destination coords, route polyline, current position, progress fraction, remaining distance/duration, occupied passengers, remaining capacity.
- `ride_route_stops` — ordered pickup/drop stops per driver leg (ride, stop type, location, coords, sequence, passenger count, status).
- `en_route_matches` — audit of each evaluation/offer: new ride, active ride, driver, detour km, corridor deviation km, extra minutes, result, status.
- Existing `ride_dismissals` is reused for rejections; existing `rides`, `notifications`, `rider_details`, `rider_vehicles` are untouched apart from reads.
- All new public tables get GRANTs, RLS (driver reads/writes own rows, admin reads all, service role full) and `updated_at` triggers.

**Backend (server functions in `src/lib/`)**
- `updateRiderPresence` — driver app posts GPS + status; validated server-side, writes presence + history row.
- Dispatch engine used by `createBooking` (replaces the current `eligibleRiderIds` filter, same call site):
  - Path A (nearby): existing eligibility checks (approved, unblocked, subscription valid, matching vehicle category/AC, not dismissed) plus fresh location, accuracy within limit, and haversine pre-filter then real road distance via the existing Routes integration, compared against the configured radius.
  - Path B (en-route): drivers in `online_on_ride` on an active share ride — new booking must be share, pickup must project onto the remaining polyline ahead of the current position (no backtracking), lie within the corridor limit, destination must be compatible (same or further along the route direction), detour and extra time within limits, and remaining seat capacity must cover the passenger count.
  - Results ranked by the configured priority (`nearest_available_first`, `en_route_first`, `combined_matching` with weighted proximity/detour/time/capacity factors read from settings).
- `acceptEnRouteRide` — atomic Postgres function: re-verifies availability, eligibility, capacity, freshness and route compatibility at accept time, assigns the ride, appends route stops in the correct sequence, updates capacity/route state, notifies the customer. Losing or stale attempts get "Booking is no longer available".
- Reject reuses `dismissRide`, then re-runs dispatch for the next eligible driver; the customer's booking is never cancelled by a rejection.
- Route state refreshes as GPS arrives, so compatibility is recalculated from the driver's real progress.
- Notifications: normal alerts unchanged; en-route offers use their own template rows in `app_text_settings`.

**Frontend**
- Driver dashboard: continuous background location while online (permission-aware, existing broadcast hook extended), plus a visually distinct en-route request card with Accept/Reject and the match metrics.
- Admin: new `dispatch.tsx` settings page and `live-drivers.tsx` monitor, linked from the admin navigation.
- Customer screens unchanged.

**Verification**
- A test suite covering the 32 listed dispatch scenarios (radius edges, offline/blocked/expired/stale/inaccurate GPS, vehicle mismatch, rejection exclusion, en-route ahead/behind/off-corridor/opposite-destination, detour and time caps, capacity full, reserve exclusivity, concurrent accepts, search-vs-book) run against the real database with seeded test rows that are cleaned up afterwards.
- Typecheck, lint, build, plus a live click-through of booking → dispatch → accept.
