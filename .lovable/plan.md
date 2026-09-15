# Customer and Driver Dashboard Redesign

## Goal
Rebuild the customer booking and driver home screens to closely match the supplied mobile references while keeping all current live data, authentication, location search, fare calculation, booking, dispatch, wallet, and notification behavior intact.

## Customer booking dashboard
- Replace the generic page header with a compact mobile app header: menu icon, centered Shahin Travels logo and Hindi tagline, and ride-alert control.
- Keep the database-backed promotional carousel directly below the header, using a stable wide banner ratio and undistorted images.
- Combine pickup and destination into one route card with green/red pins, connector line, and a working swap control. The existing India-wide search and Darbhanga quick picks remain unchanged behind each row.
- Show vehicle types as a horizontal, touch-friendly selector with the best available database vehicle image, type icon fallback, seat information, short category label, and green selected state.
- Before a route is calculated, show vehicle types without prices. After calculation, show only server-returned fare choices, including AC, Share, and eligible Three Wheeler Reserve options; never derive fares in the browser.
- Keep passenger count and pickup note as compact booking controls. The main `BOOK RIDE NOW` button books the currently selected live fare and keeps the existing cash-payment flow.
- Add the driver recruitment callout and a four-item customer navigation: Home, My Rides, Help, Profile.

## Driver dashboard
- Use the same compact branded app header.
- Add a real profile summary using the signed-in driver’s name/photo, approval badge, completed-trip count, and rating data.
- Restyle the existing online control as a status card while preserving approval, subscription, blocked-account, and server/database checks.
- Add a four-card summary from real records: completed rides, rating, completed ride earnings, and on-time value only when it can be truthfully derived; otherwise show an unavailable mark rather than invented data.
- Present current requests and assigned rides as “Today’s Bookings” cards with real route, distance, fare, relative request time, status, and existing accept/decline/lifecycle actions.
- Add a 2×4 quick-action grid linking only to existing working destinations: vehicles, route/vehicle setup, earnings, wallet, QR, history, profile, and support.
- Add a real subscription card using the stored approval/expiry state.
- Update driver navigation to Home, Bookings, Earning, Profile.

## Shared presentation
- Extend the existing green Shahin Travels design tokens with semantic success, warning, route-pin, and surface treatments; no hardcoded page colors.
- Keep layouts mobile-first and polished on wider screens without stretching the phone-style content excessively.
- Use existing uploaded/catalog vehicle imagery where available and icon fallbacks where no managed image exists.
- Preserve accessibility: labelled controls, usable focus states, readable contrast, non-overlapping text, and reduced-motion behavior.

## Technical details
- Restructure the shared shell/header so customer and driver views can use branded mobile headers and their role-specific four-tab navigation without affecting admin screens.
- Reuse current queries and server functions. Add only safe read queries needed for driver ratings and earnings; no schema or fare-rule changes.
- Keep location selection informational until `BOOK RIDE NOW`; changing route, passengers, or category refreshes server fare options and Reserve eligibility.
- Validate with the project checks and authenticated mobile/desktop browser captures when a test session is available.
