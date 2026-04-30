---
phase: 12
plan: 03
slug: sender-service
status: complete
completed: 2026-04-30
tasks_completed: 3/3
tests_added: 67
tests_passing: 136  # full backend/tests/messaging suite
---

# Plan 12-03 — Sender Service (Choke Point + Guard Chain) — SUMMARY

## What was built

The single chokepoint that every outbound CRM message — reminder, recall,
manual, AI-drafted, bulk — must pass through. Code review answers
"is this bypass-able?" by reading one file: `sender.py`.

### Task 1 — Three deterministic guard modules
- `backend/services/messaging/opt_out_guard.py` — `preflight_or_raise`
  enforces per-channel × per-purpose consent (sms/email × operational/
  marketing), STOP keyword carrier opt-out, paused_until window,
  recall_exhausted (marketing only), and deceased flag. Manual collapses
  to operational class for TCPA classification.
- `backend/services/messaging/quiet_hours.py` — `is_in_quiet_hours` and
  `next_allowed_window` use `zoneinfo.ZoneInfo` (DST-safe). Falls back
  from patient timezone to tenant timezone.
- `backend/services/messaging/cost_cap.py` — `reserve_spend_or_raise`,
  `refund_reservation`, `get_cap_state`. Backs onto `tenant.settings_jsonb
  ["messaging"]` (`daily_sms_cap_cents`, `daily_spend_cents`,
  `daily_spend_date`). Counter resets on date rollover. 80% warn / 100%
  hard stop with `admin_override` bypass.
- 3 test files: 16 opt-out matrix combinations + 11 named cases (27 total),
  10 quiet-hours cases including DST spring-forward + fall-back ambiguity,
  8 cost-cap cases.

### Task 2 — Recipient resolver
- `backend/services/messaging/recipient_resolver.py`
  - `resolve_recipient(patient, channel)` — returns Recipient(phone/email)
    routed to guardian when patient < 18 (raises `NoValidRecipient` when
    minor lacks guardian contact for the channel).
  - `bundle_household_recipients` — groups recipients sharing
    contact + same date into a single Recipient with
    `bundled_appointment_ids`. Single-member groups pass through
    unchanged. Different days → not bundled.
  - `render_bundled_body` — canonical "N family appointments" body.
- 13 tests including 18th-birthday boundary (inclusive of birthday-day),
  missing-contact errors, no-dob fallback to adult.

### Task 3 — Sender choke-point service
- `backend/services/messaging/sender.py` — `dispatch(db, ctx, req,
  patient, tenant, template, status_callback_url)` orchestrates the
  8-step guard chain in fixed order. The function is intentionally pure
  orchestration — caller pre-fetches patient/tenant/template to keep
  hidden ORM round-trips out of the hot path.
- The dispatch path:
  1. resolve_recipient → Recipient
  2. preflight_or_raise (raises OptOutBlocked)
  3. is_in_quiet_hours / next_allowed_window (skip if force=True)
  4. render_template + scrub_phi_for_operational_sms (raises PHIInTemplate)
  5. reserve_spend_or_raise (skipped when deferred — only reserve to send)
  6. MessageLog insert (status=queued|deferred) in the primary TXN
  7. log_action(MESSAGE_SENT|MESSAGE_DEFERRED) in the same TXN
  8. send_sms / send_email out-of-txn → on failure: status=failed,
     failure_reason set, refund_reservation called
- 14 sender tests including the choke-point invariant code-review test
  (greps the messaging directory and asserts no module other than
  `twilio_client.py` and `email_client.py` references the provider SDKs).

## Final guard chain order (canonical)

The order is mirrored in the `sender.py` docstring and MUST NOT be
reordered without HIPAA/TCPA review.

| Step | Check | Effect |
|------|-------|--------|
| 1 | resolve_recipient | minor → guardian; raises NoValidRecipient |
| 2 | preflight_or_raise | raises OptOutBlocked |
| 3 | is_in_quiet_hours | sets deferred_until via next_allowed_window |
| 4 | render_template + scrub_phi | raises PHIInTemplate (operational SMS only) |
| 5 | reserve_spend_or_raise | raises CostCapExceeded; skipped when deferred |
| 6 | MessageLog insert | primary TXN; status=queued|deferred |
| 7 | log_action | same TXN; MESSAGE_SENT or MESSAGE_DEFERRED |
| 8 | send_sms / send_email | out-of-txn; failure → status=failed + refund |

## Cost cap accounting decision

Storage: `tenant.settings_jsonb["messaging"]` JSONB read-modify-write.

Reasoning: pilot scale is <500 sends/day per clinic and the messaging
system runs entirely behind the choke point on a single async event loop.
A dedicated `daily_spend_reservations` table with row-level locking is
unnecessary at this volume and adds an extra table + migration to ship.
RESEARCH § Open Questions #6 documents the migration path when scale
warrants it.

`flag_modified(tenant, "settings_jsonb")` is called after every mutation
so SQLAlchemy's JSONB change-detection actually fires (the dict is
otherwise mutated in place and SA misses it).

## Test count + breakdown

| Module | Test file | Tests |
|--------|-----------|-------|
| opt_out_guard | test_opt_out_guard.py | 27 (11 named + 16 matrix) |
| quiet_hours | test_quiet_hours.py | 10 (incl DST spring/fall) |
| cost_cap | test_cost_cap.py | 8 |
| recipient_resolver | test_recipient_resolver.py | 13 |
| sender | test_sender.py | 14 |
| **Plan 12-03 total** | | **72** |
| Full messaging suite (12-00 → 12-03) | | **136** all green |

## Deviations from plan

1. **email_client.py vs resend_client.py.** The plan imports from
   `resend_client.py`. Wave 0's BAA decision (RESEND-BAA-CHECKPOINT.md,
   2026-04-29) chose Postmark; the actual file is `email_client.py`.
   `sender.py` imports `from .email_client import send_email` and the
   choke-point invariant test allows `email_client.py` (not
   `resend_client.py`).
2. **cost_cap tests use mocked Tenant ORM, not in-memory SQLite.** Project
   rule "Don't add new pip packages without asking" → skipped adding
   `aiosqlite` as a dev dep. Tests instantiate transient `Tenant()` ORM
   objects with a fake AsyncSession; this still exercises
   `flag_modified` correctly.
3. **PostmarkClient pattern in choke-point grep.** Plan checked for
   `resend.Emails.send`. Updated to `postmarker.core.PostmarkClient` to
   match the actual provider.
4. **log_action call shape.** Plan called it as
   `log_action(... resource_type=..., resource_id=...)`; actual signature
   has both as positional args after `action`. Fixed in `dispatch()`.
5. **Mapper bootstrap import in test_sender.py.** Importing
   `backend.db.models.tenant.intake` is required so SQLAlchemy can resolve
   the `Appointment → IntakeToken` relationship before instantiating
   `MessageLog`/`AuditLog`. Documented inline.
