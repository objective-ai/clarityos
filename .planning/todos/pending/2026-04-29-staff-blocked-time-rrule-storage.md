---
created: 2026-04-29T22:35:00.000Z
title: Convert StaffBlockedTime to RRULE storage
area: backend
files:
  - backend/db/models/tenant/clinical.py
  - backend/api/routes/staff_schedule.py
  - backend/schemas/staff_schedule.py
  - components/admin/ScheduleSection.tsx
  - components/schedule/* (booking conflict checks)
---

## Problem

Recurring lunch breaks materialize one row per occurrence. A typical Mon-Fri
lunch series for one staff over 52 weeks = ~260 rows. With 4 staff, the
clinic ends up with 1k+ rows for what is conceptually 4 records. Add/delete
operations cascade through 100s of HTTP requests; even when batched
client-side, the DB row volume grows without bound. Edits to a single
occurrence are awkward and the API surface for series ops is ad-hoc
(client iterates IDs).

## Proposed approach

Store recurrence as a rule, expand on read.

Schema:

```sql
ALTER TABLE staff_blocked_times
  ADD COLUMN recurrence_rule jsonb,
  ADD COLUMN valid_from date,
  ADD COLUMN valid_until date,
  ADD COLUMN exception_dates date[] DEFAULT '{}';
```

`recurrence_rule` is null for single-occurrence blocks (today's holiday/personal),
populated for recurring patterns:

```json
{
  "freq": "weekly",
  "weekdays": [0, 1, 2, 3, 4],
  "start_time": "12:00",
  "end_time": "13:00"
}
```

For recurring rows, `start_datetime` / `end_datetime` become
"first occurrence anchor" rather than the only occurrence. Booking conflict
checks expand the rule into instances for the requested window.

## Touch points

- `availability/` endpoint expands rules into per-day instances for the
  requested week (already does the date-range filter).
- `/api/appointments` booking conflict check needs same expansion.
- Public booking widget (`backend/api/routes/public_booking.py`) needs same.
- ScheduleSection blocks list collapses naturally — one row per rule, no
  client-side `groupBlocksForDisplay` heuristic needed.
- Edit semantics: "skip this occurrence" appends to `exception_dates`;
  "edit just this one" splits the rule (creates a single-occurrence row).

## Out of scope

- Daily / monthly / yearly recurrences (only weekly needed for clinics).
- iCal RRULE compatibility (use a simpler internal shape).

## Captured from

Follow-up to phase 10.4 staff scheduling UI restructure (2026-04-29). User
flagged that 260+ rows per series is "so inefficient" — agreed. Defer until
the new admin UI ships and is in active use, then refactor with proper
test coverage of rule expansion in booking conflict logic.
