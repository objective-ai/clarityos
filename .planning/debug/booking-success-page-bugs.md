---
status: fixing
trigger: "booking-success-page-bugs"
created: 2026-04-03T00:00:00Z
updated: 2026-04-03T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: |
  Bug 1: intake_url built with a hardcoded :8000→:3000 port substitution in Python — fails in production where no port is in the URL. In dev, the `<a href>` link itself works but opens an absolute URL that may not behave as expected.
  Bug 2: "Back" is the browser back button. The success state lives only in React useState. Browser back re-mounts the component fresh, wiping confirmation=null → shows step 0 blank.
test: confirmed by reading backend construction of intake_url and the absence of any state persistence (sessionStorage, URL param, or router.push) in the component
expecting: fix intake_url construction to use NEXT_PUBLIC_APP_URL env var, and persist confirmation state in sessionStorage so browser back restores it
next_action: apply fixes to app/book/[slug]/page.tsx and backend/api/routes/public_booking.py

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: (1) "Complete intake form" button should navigate to or open the intake form. (2) Clicking "back" should allow user to go back without losing the success page state.
actual: (1) "Complete intake form" button does nothing or fails silently. (2) Clicking "back" clears out the success page (state is lost).
errors: none reported
reproduction: 1. Go to /book/[slug]. 2. Complete booking. 3. On success page, click "Complete intake form" — nothing. 4. Click "back" — success page state wiped.
started: likely introduced in recent changes to app/book/[slug]/page.tsx (modified in current branch feat/full-chart-modal)

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: camelizeKeys transforms intake_url to intakeUrl causing mismatch
  evidence: BFF route.ts passes JSON through raw (res.json() → NextResponse.json(data)) with no camelization
  timestamp: 2026-04-03

- hypothesis: intake button renders but handler throws silently
  evidence: it's a plain <a href=...> tag — no JS handler — navigates directly. If it renders (intake_url truthy), it should work locally.
  timestamp: 2026-04-03

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-04-03
  checked: backend/api/routes/public_booking.py line 521
  found: intake_url = f"{base_url.replace(':8000', ':3000')}/intake/{token_str}" — hardcoded port substitution. In production base_url has no :8000 so substitution is a no-op; URL points to backend domain.
  implication: intake_url is malformed in production — link goes nowhere valid

- timestamp: 2026-04-03
  checked: app/book/[slug]/page.tsx success section (lines 651-732)
  found: no browser history management. confirmation stored only in useState. No sessionStorage, no URL param, no router.push to a dedicated success route.
  implication: browser back re-mounts component at step 0 with confirmation=null — all state wiped

- timestamp: 2026-04-03
  checked: app/api/public/booking/[slug]/book/route.ts
  found: raw JSON passthrough — no camelization applied
  implication: intake_url key name is preserved as-is from backend

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: |
  Bug 1 (intake button): Backend builds intake_url using a fragile :8000→:3000 port substitution. In production this fails silently, producing a URL pointing to the backend domain instead of the frontend. In dev the URL is correct but the button may appear to do nothing if the intake route doesn't exist at that path.
  Bug 2 (back wipes state): The entire booking wizard (including confirmation) lives in React useState with no persistence. Browser back triggers a full component remount, resetting all state to initial values.

fix: |
  Bug 1: Change backend to use FRONTEND_URL env var for building intake_url, falling back to replacing the port only as a dev convenience. Add FRONTEND_URL to backend env config.
  Bug 2: Persist confirmation to sessionStorage after successful booking; restore from sessionStorage on mount. Clear it when user explicitly starts a new booking.

verification:
files_changed:
  - backend/api/routes/public_booking.py
  - app/book/[slug]/page.tsx
