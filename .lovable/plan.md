# India-wide location search

## Goal
Let customers and riders search and select any place, village, city, or landmark in India, while keeping the 52 Darbhanga locations available as fast presets and preserving exact rider-fare matching.

## Implementation
1. **Canonical location records**
   - Extend `locations` with Google place identity, full address, latitude, longitude, and source fields.
   - Keep every existing seeded location unchanged and active.
   - Store each selected Google result once, then reuse its local location ID everywhere. This lets rider routes and customer searches match exactly without trusting typed text.
   - Permit same-named places in different parts of India while keeping Google place IDs unique.

2. **Secure India-wide autocomplete**
   - Add signed-in server functions for Google Places autocomplete and selected-place details.
   - Restrict results and accepted selections to India, validate all inputs, return only required fields, and surface provider errors safely.
   - Debounce searches, cap returned suggestions, reuse Google session tokens, ignore stale responses, and briefly cache repeated searches to control usage.

3. **Reusable location picker**
   - Build one mobile-friendly searchable picker used by both customer booking and rider fares.
   - Show matching Darbhanga presets first, then live India-wide results after the user types.
   - Display clear loading, empty, error, selected, and reset states; support keyboard and touch selection.

4. **Customer booking**
   - Replace pickup and destination dropdowns with the new picker.
   - Continue querying offers and creating bookings with canonical local location IDs, preserving server-side Share and Reserve fare validation.
   - Keep swap, passenger count, notes, capacity checks, and cash-payment behavior unchanged.

5. **Rider routes and fares**
   - Replace pickup and destination dropdowns with the same picker.
   - Allow a rider to save fares for any selected India location and keep directional matching, per-vehicle uniqueness, active toggles, and existing fare rules unchanged.
   - Show full location labels in saved route rows so similarly named places remain distinguishable.

6. **Verification**
   - Verify seeded presets, live autocomplete, selection persistence, route creation, exact customer/rider matching, swap behavior, and failure states.
   - Check desktop and mobile layouts, run targeted lint/tests, confirm the preview build is clean, and review the migration’s access rules.

## Technical notes
- Google Places calls stay behind authenticated server functions; connector credentials never reach the browser.
- The linked managed connection is sufficient because this feature does not render a browser map. The existing custom-domain browser-map restriction is therefore not triggered.
- Selecting a preset uses its existing ID. Selecting the same Google place later resolves to one canonical ID through the provider place ID.
- This adds location search and route matching only; it does not add maps, directions, distance pricing, or automatic fares.
