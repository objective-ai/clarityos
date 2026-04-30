---
phase: 12
plan: 01
slug: schema-orm
status: complete
date: 2026-04-29
---

# Plan 12-01 Summary — DB + Types Foundation

## What landed

### New tenant tables (4)

| Table | Indexes | Notes |
|-------|---------|-------|
| `message_template` | `tenant_id`, `(tenant_id, kind, language)` UNIQUE | Per-clinic editable templates; `is_default` flags ClarityOS seeds |
| `message_log` | `tenant_id`, `(tenant_id, patient_id, created_at)`, `provider_message_id`, `batch_id`, `appointment_id`, `(tenant_id, status, created_at)` | One row per send attempt (incl. deferred + cancelled). `status_priority` int drives idempotent webhook upserts. |
| `recall_queue_run` | `tenant_id`, `(tenant_id, started_at)` | One row per "Send All" batch. |
| `inbound_message` | `tenant_id`, `(tenant_id, is_read, received_at)`, `(patient_id, received_at)`, `provider_message_id` UNIQUE | Non-STOP replies. STOP routes via Twilio Advanced Opt-Out, not here. |

### Appointments column adds (4)

`patient_confirmed_at`, `reminder_status`, `last_reminder_sent_at`, `reminders_sent_count` — all `ADD COLUMN IF NOT EXISTS` (idempotent).

### Recall query support indexes (2)

- `ix_encounters_tenant_finalized_patient` — partial index `WHERE finalized_at IS NOT NULL`, used by recall candidate query (encounters > 12 months ago)
- `ix_appointments_tenant_patient_starttime` — drives the "no future appointment" half of the recall query

### AuditAction enum extension (18 values)

`MESSAGE_SENT`, `MESSAGE_DELIVERED`, `MESSAGE_FAILED`, `MESSAGE_READ`, `MESSAGE_DEFERRED`, `INBOUND_MESSAGE_RECEIVED`, `OPT_OUT_RECORDED`, `OPT_IN_RECORDED`, `CONSENT_GRANTED`, `CONSENT_REVOKED`, `CHANNEL_PREFERENCE_UPDATED`, `TEMPLATE_CREATED`, `TEMPLATE_UPDATED`, `BULK_MESSAGE_BATCH_CREATED`, `RECALL_QUEUE_RUN_STARTED`, `RECALL_QUEUE_RUN_COMPLETED`, `MESSAGING_ENABLED`, `MESSAGING_DISABLED`.

Stored as `VARCHAR(50)` — no `ALTER TYPE` needed (confirmed via `0008_claims_basics.py:78` and the `AuditLog.action` column type). The plan's frontmatter `key_links` mentioned an `ALTER TYPE audit_action_enum ADD VALUE` pattern; this was retained as outdated guidance — actual storage is plain VARCHAR. Migration omits ALTER TYPE accordingly.

### Migration revision chain

`0015_system_health_samples → 0016_crm_messaging`. Verified upgrade → downgrade → upgrade is clean (no dangling state).

### Type mirroring

- **Server (`backend/schemas/messaging.py`)** — Pydantic v2 with `model_config = ConfigDict(from_attributes=True)`, snake_case fields. No `by_alias` aliases (apiFetch camelizes client-side).
- **Client (`types/messaging.ts`)** — camelCase mirror. `BulkRecipient.tokens` flagged in comment to skip camelization (RESEARCH Pitfall 9).
- `BulkSendRequest` enforces `max_length=50` per CRM-10.

### Entitlement (`messaging`)

- `lib/entitlements.ts`: `Entitlement.MESSAGING = "messaging"` added; included in `PLAN_FEATURES.Plus` and `PLAN_FEATURES.Premium`; `ENTITLEMENT_META.messaging` provides upsell label/description.
- `types/session.ts`: `EntitlementKey` union extended with `"messaging"`.
- `backend/core/entitlements.py`: `MESSAGING = "MESSAGING"` added to the StrEnum.

### REQUIREMENTS.md

20 new `CRM-*` rows (definition + traceability). Coverage updated: 83 → 103 total, 16 → 36 pending, 67 complete (unchanged).

## Decisions / deviations from plan

| # | Decision | Plan said | Why |
|---|----------|-----------|-----|
| 1 | JSONB vs columns | Same as plan | Patient consent flags + tenant messaging settings live in `contact_info_jsonb` / `settings_jsonb`. Confirmed (RESEARCH § Conflicts §3-§5). No schema change. |
| 2 | ORM imports | `from .base import …` | Project structure: `from backend.db.base import TenantBase`, `from backend.db.mixins import SoftDeleteMixin`. Plan path was wrong — `base.py` and `mixins.py` live one level up from `models/tenant/`. |
| 3 | `down_revision` | `"0015_system_health"` | Actual head per `alembic heads` is `"0015_system_health_samples"`. |
| 4 | Pydantic email type | `EmailStr` (in plan-implied "edit email patterns") | Switched to `str` — `EmailStr` requires `pydantic[email]` extras. Project rule: no new deps without approval. Format validation is FE responsibility. |
| 5 | Python entitlement scaffolding | "Add `require_messaging_entitlement` dependency function, mirror `PLAN_FEATURES` and `ENTITLEMENT_META`" | Python `entitlements.py` is just a minimal `StrEnum`. `PLAN_FEATURES` + `ENTITLEMENT_META` are TS-only; subscription plan lookup is client-side from JWT-injected `plan_name`. Added the enum entry only — matches existing pattern. |
| 6 | Path | `app/core/entitlements.py` | Actual file is `backend/core/entitlements.py`. |
| 7 | AuditAction `ALTER TYPE` | Frontmatter `key_links` referenced an `ALTER TYPE audit_action_enum ADD VALUE` pattern | `audit_log.action` is `String(50)` (VARCHAR), not a PG enum. No ALTER TYPE migration needed. Plan's action notes already correctly skipped this — only the frontmatter was misleading. |

## Verification

- ✓ `alembic upgrade head` (`0016_crm_messaging` is now head)
- ✓ `alembic downgrade -1 && alembic upgrade head` — idempotent
- ✓ All 4 tables exist in dev DB (`to_regclass` confirmed)
- ✓ All 4 new appointment columns exist in dev DB
- ✓ Python ORM + Pydantic schemas import cleanly
- ✓ `npx tsc --noEmit` — no new errors (pre-existing e2e smoke spec errors are unrelated)
- ✓ All grep acceptance criteria pass (40 `CRM-*` references, all class definitions present, etc.)

## Commits

- `09add37` — Task 1: ORM models + AuditAction enum extension
- `6f659cc` — Task 2: Alembic 0016 + Pydantic schemas + TS types
- `9615763` — Task 3: messaging entitlement + CRM-01..CRM-20

## Downstream consumers ready

| Plan | Needs from 12-01 | Status |
|------|-----------------|--------|
| 12-02 provider-clients | `MessageLog` ORM + Pydantic schemas | ✓ |
| 12-03 sender-service | `MessageStatus`, `MessageChannel`, `MessagePurpose` enums; `MessageLog` model; `messaging` entitlement | ✓ |
| 12-04 webhooks | `MessageLog` upsert by `provider_message_id` index; `InboundMessage` table | ✓ |
| 12-05 routes-bff | All schemas, all tables, entitlement gate | ✓ |
| 12-06 scheduler-classifier | `MessageLog`, appointments reminder columns, `InboundMessage` | ✓ |
| 12-07 ui-primitives | `types/messaging.ts` for component props | ✓ |
| 12-08–10 | `Entitlement.MESSAGING` for gating in admin/settings/sidebar | ✓ |
