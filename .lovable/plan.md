# Add IST fare status to driver and admin dashboards

## Changes
- Reuse the existing live IST clock and server-authoritative Day/Night pricing status.
- Show it near the top of the Driver dashboard.
- Show it near the top of the Admin overview dashboard.
- Update the shared status label to clearly read “☀️ Day Fare Active” or “🌙 Night Fare Active” while preserving configured fare details.

## Verification
- Check the app compiles cleanly.
- Confirm both dashboards render the clock without changing booking or fare logic.
