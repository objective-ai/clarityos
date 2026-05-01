---
phase: 12-crm-patient-engagement
plan: 06
subsystem: messaging
tags: [scheduler, asyncio, advisory-lock, claude-haiku, anthropic, reminders, household-bundling]

requires:
  - phase: 12-01
    provides: messaging ORM (MessageLog, MessageTemplate, InboundMessage), TemplateKind enum, alembic 0016 reminder columns
  - phase: 12-03
    provides: dispatch() chokepoint + DispatchRequest dataclass
  - phase: 12-04
    provides: webhook _handle_inbound_sms callsite that fires classify_inbound_async via asyncio.create_task
provides:
  - "Background scheduler asyncio loop (5-min tick, advisory-lock-gated)"
  - "Reminder cadence module: 7d/72h/24h touches with idempotency counter"
  - "CRM-19 household bundling wired into _process_tenant — multi-member households receive ONE bundled SMS, not N"
  - "v1 deferred-message cancellation (no re-dispatch)"
  - "Inbound SMS classifier (Claude Haiku, 6 labels, lazy-init, exception-safe)"
affects: [12-08-patient-schedule-inbox, 12-09-recall-analytics-settings, 12-10-onboarding-compliance-e2e]

tech-stack:
  added: []
  patterns:
    - "Phase 10.3 self-pinger pattern reused for all background asyncio loops"
    - "pg_try_advisory_lock for multi-instance scheduler safety"
    - "Lazy-init Anthropic AsyncAnthropic client (no eager API key access)"

key-files:
  created:
    - backend/services/messaging/reminder_cadence.py
    - backend/services/messaging/scheduler.py
    - backend/tests/messaging/test_reminder_cadence.py
    - backend/tests/messaging/test_scheduler.py
    - backend/tests/messaging/test_classifier.py
  modified:
    - backend/services/messaging/classifier.py
    - backend/services/messaging/sender.py
    - backend/db/models/tenant/clinical.py
    - backend/main.py

key-decisions:
  - "v1 deferred-message handling = CANCEL (not re-dispatch). PHI-scrub state and consent re-check cannot be reconstructed safely from a stored row at v1; user re-composes the next morning."
  - "DispatchRequest gained bundled_appointment_ids field for CRM-19 audit fan-out (Plan 12-03 sender extension as plan anticipated)."
  - "Tick interval 5 minutes (matches CONTEXT.md 5-15min cron range)."
  - "Classifier confidence is qualitative (high|medium|low) not numeric — high when raw model output equals a label exactly, medium when it contains a label substring, low otherwise."
  - "Appointment ORM did not map the four reminder columns added in alembic 0016 (gap from 12-01); added in this plan since 12-06 needs them."

patterns-established:
  - "All background asyncio loops follow Phase 10.3 self-pinger lifecycle (env-gated start_X / stop_X with @app.on_event)."
  - "Scheduler tick = pg_advisory_lock → iterate tenants → bundle BEFORE dispatch loop → dispatch group-aware → process_deferred → unlock."
  - "Fire-and-forget classifier path swallows ALL exceptions to never fail the webhook (Pitfall 8)."

requirements-completed: [CRM-01, CRM-08, CRM-11, CRM-19]

duration: ~50min
completed: 2026-04-30
---

# Phase 12-06: Scheduler + Classifier Summary

**5-minute advisory-locked reminder scheduler with CRM-19 household bundling wired into production, v1 deferred-message cancellation, and Claude Haiku inbound classifier replacing the 12-04 stub**

## Accomplishments
- 3-touch reminder cadence (7d/72h/24h) with idempotency via `appointments.reminders_sent_count`
- CRM-19 household bundling **fires in production**: `_process_tenant` calls `bundle_household_reminders` before the dispatch loop; multi-member groups produce ONE `dispatch_bundled_reminder` call, singletons go through `dispatch_reminder`. Verified by `test_household_bundling_dispatches_one_sms`
- Scheduler asyncio loop registered via `main.py @app.on_event("startup"|"shutdown")`, gated by `MESSAGING_SCHEDULER_ENABLED` env (Pitfall 7) and pg_advisory_lock (Pattern 2)
- v1 deferred-message handling: scheduler CANCELS deferred MessageLog rows whose `deferred_until` has passed (no re-dispatch — see decisions)
- Inbound classifier replaces the 12-04 stub: Claude Haiku, 6-label set, lazy-init Anthropic client, exception-safe, defaults to `spam`/`low` on unrecognized output

## Task Commits
1. **Task 1: Reminder cadence service** — `a6036ca` (feat)
2. **Task 2: Scheduler asyncio loop + CRM-19 wiring + deferred cancel** — `ad86695` (feat)
3. **Task 3: Inbound SMS classifier (Claude Haiku)** — `55a4042` (feat)

## Final REMINDER_OFFSETS
```python
REMINDER_OFFSETS = [
    (0, 7 * 24, "reminder_7d"),
    (1, 72,     "reminder_72h"),
    (2, 24,     "reminder_24h"),
]
```

## CRM-19 Production Wiring (the must-have)
`backend/services/messaging/scheduler.py::_process_tenant` order:
1. `compute_due_reminders(db, tenant_id)` → list[DueReminder]
2. `bundle_household_reminders(due, fetch_patient=...)` → dict keyed `(contact, ISO_date, touch, kind)`
3. For each group:
   - `len > 1` → `dispatch_bundled_reminder` (ONE SMS to household primary)
   - `len == 1` → `dispatch_reminder`
4. `_process_deferred(...)` cancels expired deferred rows
5. `db.commit()`

`grep -E "bundle_household_reminders\(" backend/services/messaging/scheduler.py` → 1 line in `_process_tenant` (production code path).

## v1 Deferred-Message Handling
Scope: scheduler CANCELS — does NOT re-dispatch. Rationale documented inline in `_process_deferred` and reflected in CONTEXT.md scope. V2 work would require:
- Durable payload storage (PHI-scrubbed body + tokens + guard chain inputs)
- Re-validation against current consent state, opt-out list, cost cap, and AI-draft state
- Decision on whether `force_outside_quiet_hours=True` is auto-applied for re-sends or requires staff re-approval

## DispatchRequest Extension
Added `bundled_appointment_ids: list[UUID] | None = None` to `backend/services/messaging/sender.py`. Audited in the `MESSAGE_SENT` audit metadata so the household scope is durable. Plan 12-06 anticipated this Plan 12-03 sender extension.

## Tick Interval
**5 minutes** (`_TICK_SECONDS = 300`) — matches CONTEXT.md cron range and gives the scheduler a 7-minute "due now" window (5min tick + 2min slack) that prevents misses without double-firing.

## Test Counts
| File | Tests |
|------|-------|
| `tests/messaging/test_reminder_cadence.py` | 12 |
| `tests/messaging/test_scheduler.py` | 7 |
| `tests/messaging/test_classifier.py` | 7 |
| **Total** | **26** |

Plan target was ≥24. Combined run: `26 passed in 1.63s`.

## Files Created/Modified
- `backend/services/messaging/reminder_cadence.py` — cadence logic + household bundling primitives
- `backend/services/messaging/scheduler.py` — 5-min tick + advisory lock + CRM-19 wiring + deferred cancel
- `backend/services/messaging/classifier.py` — replaced stub with Haiku classifier
- `backend/services/messaging/sender.py` — `bundled_appointment_ids` field + audit metadata
- `backend/db/models/tenant/clinical.py` — `Appointment` ORM gained the four reminder columns from alembic 0016
- `backend/main.py` — scheduler start/stop registered as @app.on_event hooks
- `backend/tests/messaging/test_*.py` — 26 new tests

## Decisions Made
See frontmatter `key-decisions`. Most consequential:
- **v1 deferred = CANCEL not re-dispatch** — clinical-safety rule says PHI-scrub and consent state must be live, not reconstructed. Pushing re-dispatch to v2.
- **Appointment ORM patch in this plan** — alembic 0016 added the columns but never updated the SQLAlchemy model. Detected during compute_due_reminders implementation; fixed inline rather than splitting into a 12-01 gap-closure plan.

## Deviations from Plan
None substantive. The plan flagged that DispatchRequest might need `bundled_appointment_ids`; it did, and was added. The plan did not mention the missing Appointment ORM columns — those were added as a necessary precondition with no scope creep.

## Issues Encountered
- Initial scheduler test failures from FakeSchedulerDB substring matchers (`"FROM tenants"` vs the schema-qualified `"FROM public.tenants"` SQLAlchemy emits). Fixed to use `"tenants" in sql` substring.
- TenantContext does not accept a `staff_id` kwarg (plan template assumed it did); removed.

## Next Phase Readiness
- 12-07 UI primitives can render bundled-reminder confirmation states, and 12-08 inbox can display `classification` + `classification_confidence` from this classifier.
- One pre-existing path-dependent test in `test_sender.py::test_choke_point_invariant_no_other_module_calls_sdks` requires running pytest from repo root (not from `backend/`); not introduced by this plan.

---
*Phase: 12-crm-patient-engagement*
*Plan: 06*
*Completed: 2026-04-30*
