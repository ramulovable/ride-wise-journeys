# Standardize Driver Verification Display

## Goal
Show one consistent, prominent Shahin Travels verification treatment for verified drivers, and remove the old “Approved Driver” badge.

## Changes
- Update the shared verified mark to a larger vibrant blue badge with a white check, plus reusable muted text: “verified by shahin travels”.
- Driver dashboard: place the verification mark beside the driver’s name and the verification text directly below; show nothing when unverified.
- Driver profile: show the same treatment near the driver identity/photo area; remove the old pill treatment.
- Customer live ride: show the same verification mark and text in the accepted-driver card.
- Admin driver list and driver details: show the same verification mark and text beside verified drivers’ names while keeping the existing admin verification toggle functional.
- Remove every “Approved Driver” display without changing approval, subscription, online, fare, map, ride, or notification logic.

## Validation
- Search all app views to confirm “Approved Driver” is gone.
- Run TypeScript and lint checks, then confirm the preview build succeeds.
