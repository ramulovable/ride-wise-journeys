# Complete Shahin Travels V1

## Goal
Finish the production-ready rider and admin experiences, load the supplied Darbhanga service locations, and leave the app passing build and workflow checks.

## Implementation
1. **Stabilize the current app**
   - Fix the optional subtitle typing in shared shells.
   - Remove unsafe route and user assertions where touched.
   - Correct booking so a customer's chosen rider and vehicle are preserved securely.

2. **Complete the backend model and controls**
   - Add a rider-owned vehicles table so each rider can manage multiple vehicles and QR identities.
   - Link route fares and bookings to the selected vehicle.
   - Add rider blocking and secure server operations for admin-only approval, renewal, blocking, deletion, catalog changes, support replies, and ride monitoring.
   - Enforce valid rider subscriptions and allowed ride-state transitions on the server.

3. **Load initial locations and admin**
   - Add the supplied 52 Darbhanga locations, including the Bharwara Bazar PIN detail, without duplicating existing rows.
   - Provision the configured default admin through a restricted setup path and verify the ADMIN role.

4. **Build rider screens**
   - Ride request queue and active-ride controls through cash completion.
   - Online/offline status with clear approval and subscription gating.
   - Multiple vehicle add/edit controls and downloadable/printable QR codes.
   - Directional share/reserve fare management with active switches.
   - Earnings totals and completed/cancelled ride history.

5. **Build admin screens**
   - Real dashboard counters.
   - Rider approval, blocking, renewal/payment recording, and deletion.
   - Vehicle category and location add/edit/active controls.
   - Booking monitor, support replies, and vehicle QR lookup/download.

6. **Verify**
   - Run database security checks and targeted data checks.
   - Confirm the app builds cleanly.
   - Exercise primary rider and admin flows at desktop and mobile sizes.

## Technical notes
- All privileged actions will verify the signed-in ADMIN role on the server; credentials and role decisions never live in browser storage.
- User-owned reads and writes remain protected by row-level access rules.
- QR codes identify vehicle records and open a safe app URL; they do not expose private account data.
- Existing customer, profile, and support screens remain in place and are only adjusted where needed for the corrected vehicle/booking model.
