# Login UI refinement

## Changes
- Rework the mobile login page into a compact, balanced layout that fits better on short screens.
- Place the official circular logo at the far left of a simple top header.
- Show “Shahin Travels” and “आपकी यात्रा हमारी जिम्मेदारी” only once in that header.
- Keep the welcome banner as supporting imagery without repeating the same branding text below it.
- Tighten spacing around the login/create-account tabs and preserve all existing authentication behavior.
- Apply the same clean brand-header treatment to the separate admin login for visual consistency.

## Validation
- Check the login page at the current mobile viewport and a desktop viewport.
- Confirm the forms remain usable and the project builds without errors.

## Technical details
- Update only the existing login presentation and shared brand header.
- Keep current auth logic, routes, and database behavior unchanged.
