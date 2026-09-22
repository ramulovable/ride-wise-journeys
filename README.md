# Shahin Travels Connect

Build a brand-new Shahin Travels V1 web application from scratch using Lovable Cloud (PostgreSQL, auth, storage, edge functions).

Key specifications:
1. Branding: Use the first attachment (circular logo) as the official App Icon/Logo, and the second attachment (vertical banner) for the Welcome/Login screen with the taglines 'Welcome to Shahin Travels' and 'आपकी यात्रा, हमारी जिम्मेदारी!'.
2. Roles & Auth: Three roles - ADMIN, RIDER, CUSTOMER. V1 Auth uses 10-digit Indian mobile number (starting with 6-9) and secure password without SMS OTP. Admin login is separated.
3. Subscriptions & Payments: Riders require Admin cash approval and monthly subscription fee to go ONLINE. When expired, riders are forced OFFLINE and cannot accept rides. Rides are CASH ONLY on completion.
4. Dynamic Management: Admin can add/edit vehicle categories (e.g. E-Rickshaw, Scorpio, Bike) and add/edit locations without code changes. Seed the 52 specified Darbhanga locations into the database as the initial active locations.
5. Routes & Fares: Each rider sets their own directional route fares per vehicle: Share Fare (per passenger) and Reserve Fare (fixed one-trip price, not multiplied by passenger count). Customers compare riders/vehicles and book either Share or Reserve. Server-side calculates and validates fares.
6. Booking Lifecycle: Requested -> Searching -> Accepted -> On the Way -> Arrived -> Started -> Completed (Cash Received) or Cancelled. Full rider & customer profiles, ratings, support requests, and downloadable/printable QR codes for vehicles.
7. Data integrity: Real database-driven application with clean empty states — do not generate fake business data. Mobile-first responsive design.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://ride-wise-journeys.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e2fcb954-d109-4fde-a12f-e5296792986c).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
