# Shahin Travels V1

A mobile-first ride booking app for Darbhanga with three kinds of users: Admin, Rider, Customer. Built on Lovable Cloud (database, logins, file storage, server code).

## What I need from you
- The list of **52 Darbhanga location names**. I will not invent them — send the list and I will load them as the starting active locations. Until then the location list starts empty and the Admin can add locations.

## Branding
- Circular logo becomes the app icon and header mark.
- Vertical banner is the backdrop of the Welcome/Login screen with "Welcome to Shahin Travels" and "आपकी यात्रा, हमारी जिम्मेदारी!".
- Colour direction taken from the logo: deep navy, brand green, orange accent.

## Sign in
- Mobile number (10 digits, starts 6-9) + password. No SMS code in V1.
- Customer and Rider sign up on the main welcome screen; Admin signs in from a separate hidden admin entry.
- Roles stored separately from profiles so they can't be self-assigned.

## Customer experience
- Pick pickup and drop locations, see every rider offering that route with their vehicle, rating and both prices.
- Share price is per passenger; Reserve price is one fixed price for the whole trip.
- Book, then follow the ride: Requested, Searching, Accepted, On the way, Arrived, Started, Completed (cash paid) or Cancelled.
- Ride history, rate the rider, profile, support requests.

## Rider experience
- Register with vehicle details; stays pending until Admin approves the cash payment.
- Monthly subscription: rider can go Online only while it is active. On expiry the rider is forced Offline and cannot accept rides.
- Rider sets their own fares per route direction and vehicle: share fare and reserve fare.
- Incoming ride requests, accept/decline, move the ride through each stage, mark cash received.
- Earnings summary, profile, printable QR code for the vehicle.

## Admin experience
- Approve riders and record cash subscription payments, extend or expire subscriptions.
- Add/edit vehicle categories (E-Rickshaw, Scorpio, Bike, and any new ones) and locations, no code changes needed.
- View all rides, riders, customers, support requests.

## Data & rules (technical)
- Tables: profiles, user_roles, vehicle_categories, locations, rider_vehicles, rider_route_fares, subscriptions/payments, rides, ratings, support_requests.
- Row Level Security on every table; roles checked through a security-definer `has_role` function.
- Fares are recalculated and validated on the server at booking time — the price is never trusted from the browser. Reserve fare is not multiplied by passenger count.
- Rider going Online is blocked server-side unless approved and subscription end date is in the future.
- Realtime updates for ride status and rider ride requests.
- QR codes generated client-side from the vehicle ID, downloadable and printable.
- No seeded fake rides, riders or customers. Empty states everywhere.

## Build order
1. Enable Lovable Cloud, database schema + policies, brand theme and assets.
2. Welcome/Login/Signup, role routing, separate admin login.
3. Admin: categories, locations, rider approvals, subscriptions.
4. Rider: onboarding, vehicles, route fares, online toggle, QR.
5. Customer: search/compare, booking, ride tracking.
6. Ride lifecycle both sides, cash completion, ratings, support, profiles.
