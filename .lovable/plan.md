# Restore rider decline and reviews

## Goal
Restore two rider-facing capabilities without changing centralized fare calculation or first-driver-wins broadcast acceptance.

## Changes
- Add a private per-rider declined-broadcast record so declining hides that request only from that driver; the booking remains available to other eligible online drivers.
- Add an authenticated decline action and exclude each rider’s declined requests from their incoming list.
- Show **Accept** and **Decline** side by side on eligible incoming request cards, with clear success/error feedback.
- Restore the driver profile rating summary and customer review list, limited to ratings belonging to the signed-in driver.
- Keep customer and admin profiles unchanged.

## Security and data rules
- Drivers can create and view only their own decline records; administrators retain maintenance access.
- Decline records are tied to both the driver and booking, preventing duplicate entries.
- Rating reads continue through the existing privacy policy, which allows each driver to see their own reviews.

## Verification
- Run focused formatting, lint, and type checks.
- Confirm database access rules are clean.
- Verify the rider dashboard and profile at desktop and mobile sizes, including a functional decline flow when test data is available.
