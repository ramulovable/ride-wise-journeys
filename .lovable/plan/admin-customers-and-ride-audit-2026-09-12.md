# Admin Customers and Ride Audit

## Goal
Give administrators a complete customer directory and a detailed, privacy-safe audit view for every booking.

## Changes
- Add an **All Customers** admin menu and page showing customer name, 10-digit mobile number, registration date/time, total rides, and account status.
- Add a customer count card to the admin overview linking to the new page.
- Replace the basic booking list with an expanded audit view showing customer, rider, vehicle, exact route, booking type, fare, current status, and all available lifecycle timestamps.
- Keep historical records readable when a ride is unassigned or incomplete, using clear “Not assigned” and “Not reached” states.
- Load sensitive customer and rider contact details through administrator-only server functions with server-side role verification.

## Data and security
- Add customer account status fields with active/blocked state managed by administrators.
- Add dedicated ride lifecycle timestamps for “on the way” and “arrived” so future bookings have a complete audit trail; retain existing acceptance, start, completion, cancellation, creation, and last-update timestamps.
- Update ride status actions to write the matching timestamp automatically.
- Apply database access grants and row-level policies without broadening customer or rider access.

## Validation
- Verify customer totals and ride-detail joins against real database rows.
- Check admin pages on mobile and desktop, including empty and partially completed rides.
- Confirm formatting, type checks, and the preview build pass cleanly.
