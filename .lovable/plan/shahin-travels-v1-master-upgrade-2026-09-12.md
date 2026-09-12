# Shahin Travels V1 Master Upgrade

## Goal
Replace rider-entered route prices with one administrator-controlled fare engine, broadcast bookings to eligible drivers by vehicle type, and preserve every quoted fare and ride action for audit.

## Implementation

1. **Central fare and vehicle catalog**
   - Add administrator-managed vehicle brands and models linked to vehicle categories.
   - Classify categories as Two Wheeler, Three Wheeler, or Four Wheeler while preserving existing category records and vehicles.
   - Add centralized fare rules and distance slabs with active states, timestamps, and administrator-only writes.
   - Seed only the requested defaults:
     - Two Wheeler: ₹30/km, with an administrator-set included-distance limit and extra-km rate.
     - Three Wheeler Share: 0–5 km at ₹30/passenger and 20–35 km at ₹50/passenger.
     - Three Wheeler Reserve: 0–5 km at ₹20/km and 20–35 km at ₹30/km.
     - Three Wheeler extra distance: ₹10/km beyond the highest configured slab.
     - Four Wheeler AC and Non-AC rules remain unpriced initially and therefore unavailable to customers.
   - Treat gaps between configured slabs as unavailable rather than guessing a price.
   - Remove the rider route-fare table and all rider fare-management access after the new engine is active.

2. **Server-authoritative fare calculation and snapshots**
   - Calculate driving distance through the existing Google route service, then calculate fares only on the server from active administrator rules.
   - Two Wheeler offers one standard whole-trip price; Three Wheeler offers Share and Reserve; Four Wheeler offers AC or Non-AC only when its matching rule is configured.
   - Validate passenger capacity and all selected options again when booking.
   - Store immutable distance, duration, fare-rule details, unit price, total price, vehicle class, AC choice, and calculation breakdown on each booking.
   - Show “Fare currently unavailable” for unconfigured ranges and “Fare currently unavailable for this vehicle” for unconfigured vehicle classes.

3. **Broadcast booking and concurrency safety**
   - Change customer booking from choosing a rider to choosing a vehicle category and available journey option.
   - Create each booking unassigned and broadcast it to online, approved, unblocked, subscribed drivers with an active matching vehicle.
   - Let a driver accept with one eligible vehicle; use an atomic conditional database operation so only the first valid acceptance succeeds.
   - Return exactly “Booking is no longer available” to later acceptance attempts.
   - Make every later ride-state transition conditional on the expected current state to prevent duplicate or out-of-order updates.

4. **Rider experience**
   - Remove the Routes & Fares menu and screen.
   - Expand My Vehicles to category, brand, model, registration number, capacity, and AC/Non-AC where applicable, with add/edit and activate/deactivate controls.
   - Keep approval/subscription-gated Online status, matching incoming requests, full ride progression, QR codes, earnings, and a clear “CASH RECEIVED” completion action.

5. **Administrator experience**
   - Expand Catalog into category, brand, and model management with add, edit, and activate/deactivate controls.
   - Add Fare Management for Two Wheeler rates/limits, Three Wheeler Share and Reserve slabs, extra-km rates, and separate Four Wheeler AC/Non-AC settings.
   - Keep dashboard figures database-derived only; add catalog/fare configuration counts where useful without demo values.
   - Record administrator catalog, fare, rider, customer, and subscription changes in an audit log.

6. **Customer booking and location interface**
   - Keep India-wide autocomplete and Darbhanga quick suggestions.
   - Refine the location combobox so the chosen location remains inside the field with no external selected badge.
   - Show route distance and server-calculated vehicle/journey choices, including passenger totals for Three Wheeler Share.
   - Clearly disable unavailable vehicle classes or distance ranges.

7. **Database security and auditability**
   - Add RLS and explicit grants for every new table; catalog and fare writes require an administrator role.
   - Add ride-status history containing previous status, new status, actor, timestamp, and relevant reason.
   - Keep existing ride timestamps and cash-paid status while making the event history the complete audit trail.
   - Update administrator ride audit views to show the immutable fare snapshot, assigned vehicle details, and event history.

8. **Verification**
   - Validate seeded defaults, unavailable slab gaps, passenger multiplication, Reserve non-multiplication, extra-distance calculations, Four Wheeler AC/Non-AC availability, and immutable snapshots.
   - Race two eligible driver acceptances and confirm one wins while the other receives the required message.
   - Verify customer, rider, and administrator workflows at 320px mobile and desktop widths.
   - Run database security checks, focused tests, linting, and final build validation.

## Technical details

- Extend the booking type enum with a standard ride type for Two/Four Wheeler while retaining Share and Reserve for Three Wheeler and historical rides.
- Fare slabs use explicit inclusive lower and upper kilometre bounds; overlapping active slabs are rejected. Distances in gaps are unavailable. Beyond the highest slab, the last slab amount plus configured extra-km pricing is used only where that rule enables it.
- Vehicle acceptance validates category, active status, ownership, AC requirement, driver eligibility, and unassigned booking state in the same atomic operation.
- Historical bookings retain their existing stored fares; no old booking is repriced.
