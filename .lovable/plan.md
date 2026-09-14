# Day & Night Fare Pricing

Add a night-time price layer on top of the existing fare rules, controlled entirely from the admin panel, with Indian time as the single source of truth.

## How it will work

- The server decides whether a trip is priced as **Day** or **Night** using Indian Standard Time, never the phone's clock.
- Default: Night from 8:00 PM to 4:59 AM, Day from 5:00 AM to 7:59 PM. Times are configurable and the midnight crossover is handled automatically.
- Night pricing can work in two ways:
  - **Multiplier** — base fare × chosen factor (default 2.0×)
  - **Direct rate** — a fixed night per-km rate that replaces the day rate
- Existing base fares, distance slabs, Share pricing and vehicle types stay exactly as they are; the night layer is applied on top.
- Can be switched on/off globally, and limited to specific ride kinds (per-km, share, reserve) or specific vehicle categories.

## What customers see

- On the booking screen: a live Indian time clock with a Day/Night badge, and a short note on fares when night pricing is active ("Night fare 2× applies until 5:00 AM").
- Fares shown during search are informational only — no booking is created until "Book ride" is tapped.

## Admin panel

New **Day/Night pricing** section inside Fare Management:

- On/off switch
- Day start and Night start times
- Pricing mode (multiplier or direct rate) with the value
- Applicability toggles: per-km fares, share fares, reserve fares
- Per-vehicle-category overrides (add/edit/remove rows)
- Every change is written to the existing fare change history

## Technical details

**Database (one migration)**

- `day_night_pricing_config` — single-row global config: `is_enabled`, `day_start_time`, `night_start_time`, `pricing_mode` ('multiplier' | 'direct_rate'), `night_multiplier`, `night_direct_rate`, `applies_to_per_km`, `applies_to_share`, `applies_to_reserve`, timestamps. Public read for authenticated, admin write, audit trigger reusing `log_fare_change` + `audit_admin_catalog_change`.
- `day_night_vehicle_overrides` — `vehicle_category_id` (unique), `is_enabled`, `pricing_mode`, `night_multiplier`, `night_direct_rate`, `is_active`. Same policies and audit triggers.
- Seed one config row with defaults (enabled, 05:00, 20:00, multiplier 2.0).
- GRANTs: SELECT to `authenticated`, ALL to `service_role`; writes gated to admins by policy.

**Pricing engine (`src/lib/api.functions.ts`)**

- New helper `resolvePricingPeriod(now)` computing IST wall-clock time via `Intl.DateTimeFormat` with `timeZone: "Asia/Kolkata"`; crossover-safe comparison.
- `calculateRuleFare` keeps producing the base fare; a new `applyDayNight(base, rule, category, config)` wraps it — multiplier scales `unitFare`; direct rate replaces the per-km rate before distance multiplication. Share still multiplies by passengers after the night layer.
- `loadFareOptions` loads the config + overrides once and returns per-fare `pricingPeriod`, `multiplierUsed`, `nightRateOverride`, `baseFare`.
- `createBooking` recalculates server-side (unchanged flow) and stores the extended immutable snapshot: `base_fare`, `pricing_period`, `pricing_mode`, `multiplier_used`, `night_rate_override`, `distance_km`, `vehicle_category`, `final_fare`, `timezone: "Asia/Kolkata"`, `fare_calculated_at` — alongside the existing snapshot fields so old rides stay readable.

**Frontend**

- `src/components/IstClock.tsx` — live IST clock + Day/Night badge, driven by a server-provided period so the badge never disagrees with pricing.
- New server fn `getPricingStatus()` returning current IST time, period and active night settings; used by the clock and the booking note.
- `src/routes/_authenticated/app/index.tsx` — clock above the fare list, night note on fare cards.
- `src/routes/_authenticated/admin/fares.tsx` — new Day/Night pricing section with the controls and override rows.
- `src/lib/settings.ts` untouched (config lives in its own table, not `app_settings`).

**Verification** — typecheck, lint on changed files, production build, and a Playwright pass on the booking screen.
