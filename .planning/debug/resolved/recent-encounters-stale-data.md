---
status: resolved
trigger: "recent-encounters-stale-data"
created: 2026-03-13T00:00:00Z
updated: 2026-03-13T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED. `formatEncounterDate` calls `formatClinicTime` on a date-only string "2026-03-13". JS parses date-only ISO strings as UTC midnight. America/Los_Angeles is currently PDT (UTC-7), so midnight UTC = 5:00 PM PDT. All encounters show "Today, 5:00 PM" because all today-encounters have the same date-only value parsed to the same time.
test: N/A — root cause confirmed via code analysis.
expecting: Fix: change `formatEncounterDate` to not extract time from encounter_date (it's a DATE not DATETIME). Show date-only labels.
next_action: Fix formatEncounterDate in dashboard/page.tsx

## Symptoms

expected: Recent Encounters should show actual appointments from today's date (2026-03-13) with accurate times. Patients without appointments should not appear.
actual: All 4 patients show "Today, 5:00 PM" — looks like leftover seed data with hardcoded times. David Kim shows up even though he has no appointment. Donovan's entry shows 5:00 PM but clicking it opens a 9:00 AM appointment.
errors: No UI errors visible.
reproduction: Open the dashboard / home page and look at "Recent Encounters" widget.
timeline: Started after the last reseed. Suspect seed data has old/wrong appointment timestamps, or the query logic is wrong.

## Eliminated

- hypothesis: Seed data has hardcoded 5:00 PM timestamps
  evidence: Seed uses _dt(TODAY, X) helper that builds UTC datetimes from local Pacific time. Appointments have correct times (8:30 AM, 9:00 AM etc). The problem is in encounter_date which is a DATE-only column, not DATETIME.
  timestamp: 2026-03-13

- hypothesis: David Kim appearing is wrong — he has no appointment
  evidence: David Kim IS a valid walk-in (appointment_id=None) with encounter_date=TODAY. His appearance is correct behavior. The only bug is the time display.
  timestamp: 2026-03-13

## Evidence

- timestamp: 2026-03-13
  checked: dashboard/page.tsx formatEncounterDate function
  found: Calls formatClinicTime(enc.encounterDate, clinicTimezone) which does new Date("2026-03-13"). JS parses date-only ISO strings as UTC midnight per spec.
  implication: UTC midnight in PDT (UTC-7) = 5:00 PM local. Every encounter shows the same "5:00 PM".

- timestamp: 2026-03-13
  checked: backend/schemas/encounter.py EncounterResponse
  found: encounter_date field is typed as `date` (not `datetime`) — it's a date-only value "YYYY-MM-DD"
  implication: There is no time in encounter_date. Calling formatClinicTime on it extracts a meaningless time artifact.

- timestamp: 2026-03-13
  checked: backend/seed_db.py encounters E7 (David Kim)
  found: appointment_id=None, encounter_date=TODAY. Walk-in patient, intentionally has no appointment.
  implication: David Kim appearing is correct. The "no appointment" assumption in the bug report is wrong.

- timestamp: 2026-03-13
  checked: lib/api-client.ts apiFetch
  found: camelizeKeys() converts snake_case to camelCase — encounter_date becomes encounterDate in the store.
  implication: Store access is correct. The date string arrives as "2026-03-13" in encounterDate.

## Resolution

root_cause: formatEncounterDate() in dashboard/page.tsx calls formatClinicTime() on enc.encounterDate which is a date-only string "YYYY-MM-DD". JS parses date-only ISO 8601 strings as UTC midnight. In America/Los_Angeles (PDT=UTC-7), UTC midnight = 5:00 PM local, so all encounters show "Today, 5:00 PM". The encounter_date field carries no time data — it is a DATE column, not DATETIME.
fix: Remove time extraction from formatEncounterDate. Since encounter_date is date-only, show "Today", "Yesterday", or "Mar 13" without a time component.
verification: Type-check passes (npx tsc --noEmit clean). Fix removes time extraction from date-only string. All today encounters will now show "Today" (no time), yesterday's show "Yesterday", older show "Mar 13" style. The UTC midnight parsing trap is gone.
files_changed: [app/(tenant)/[tenant]/dashboard/page.tsx]
