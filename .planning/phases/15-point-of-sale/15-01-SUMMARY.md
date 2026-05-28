---
phase: 15-point-of-sale
plan: 01
subsystem: schema
tags: [alembic, orm, sqlalchemy, postgres, stripe, sales-ledger, refunds, daily-close, audit, permissions]

requires:
  - phase: 15-00-wave0-foundation
    provides: 3 skip-stubbed Wave-0 tests (test_pos_models, test_pos_enums, test_permissions_pos) ready to flip to GREEN once ORM lands
  - phase: 13-retail-inventory
    provides: inventory_transactions table + ck_inventory_reason CHECK that Plan 15-01 widens; optical_order_line_items table that SaleLineItem references
  - phase: 14-optical-order-configuration
    provides: OpticalOrderLineItem stable identity used by SaleLineItem.optical_order_line_item_id for exact restock targeting

provides:
  - 8 new tables (sales, sale_line_items, payments, refunds, refund_line_items, refund_payments, daily_close_runs, stripe_webhook_events)
  - 4 new Tenant columns (sales_tax_rate, stripe_publishable_key, stripe_secret_key_encrypted, stripe_webhook_secret_encrypted)
  - inventory_transactions.sale_id FK column + ck_inventory_reason CHECK widened with sale_placed and refund_restock
  - 14 new AuditAction values (SALE_CREATE..STRIPE_WEBHOOK_RECEIVED) — VARCHAR(50), no ALTER TYPE
  - 6 new ClinicalAction values + PERMISSION_MATRIX rows (POS-11 role split)
  - 4 new tenant-side enum classes (SaleStatus, SaleLineItemSourceType, PaymentMethod, PaymentStatus)
  - 2 new InventoryReason values (SALE_PLACED, REFUND_RESTOCK)
  - Patient.sales back-reference (lazy=dynamic — for paginated patient detail view)

affects:
  - 15-02-payment-processor-crypto (reads Tenant.stripe_*_encrypted columns)
  - 15-03-schemas-sale-lifecycle (imports Sale/SaleLineItem ORM + SaleStatus / PaymentMethod / SaleLineItemSourceType enums)
  - 15-04-sale-cart-payment-routes (CRUD against Sale + SaleLineItem + Payment)
  - 15-05-refunds (Refund / RefundLineItem / RefundPayment + restock_for_refund_line walks SaleLineItem.optical_order_line_item_id FK)
  - 15-07-daily-close (aggregates Sale + Payment + Refund, persists DailyCloseRun)
  - 15-08-webhooks-admin-bff (inserts StripeWebhookEvent for idempotency; updates Tenant.stripe_*_encrypted)

tech-stack:
  added: []
  patterns:
    - "PEP 562 module __getattr__ in clinical.py to lazily re-export ClinicalAction without dragging backend.core.config + Settings() into alembic env.py at migration time"
    - "ck_inventory_reason widened in-place via DROP CONSTRAINT + ADD CONSTRAINT (CHECK has no ALTER TABLE ... ADD VALUE equivalent)"
    - "Partial unique indexes via op.execute(raw SQL) for (tenant_id, receipt_number) WHERE NOT NULL — mirrors Phase 13 0017 precedent (postgresql_where in op.create_index emits inconsistently across SQLA versions)"
    - "FK between inventory_transactions.sale_id and sales.id added AFTER sales CREATE TABLE in the same upgrade() to keep dependency ordering linear"
    - "AuditAction values are lowercase snake_case strings (matches Phase 9..14 convention); member names are uppercase, satisfying Wave-0 .name-based assertions"

key-files:
  created:
    - backend/alembic/versions/0020_phase15_point_of_sale.py
    - .planning/phases/15-point-of-sale/15-01-SUMMARY.md
  modified:
    - backend/db/models/tenant/clinical.py
    - backend/db/models/public/saas.py
    - backend/core/permissions.py

migration:
  revision: "0020_phase15_point_of_sale"
  down_revision: "0019_optical_order_configuration"
  ddl_validated_offline: true
  ddl_validated_method: "alembic upgrade head --sql > /c/tmp/0020.sql"
  ddl_summary:
    create_table_count: 8
    alter_tenants_add_column_count: 4
    cascade_count: 20
    new_check_constraints: 7  # ck_sale_status, ck_sale_line_qty_positive, ck_sale_line_source_type, ck_payment_amount_positive, ck_payment_method, ck_payment_status, ck_refund_amount_positive, ck_refund_line_qty_positive, ck_refund_payment_amount_positive (plus widened ck_inventory_reason)
    partial_indexes: 3  # uq_sales_receipt_number, uq_payments_processor_payment_id, ix_sale_line_items_optical_oli
    global_unique_constraint: 1  # uq_stripe_webhook_event_id (NOT scoped to tenant — Stripe event IDs are globally unique)
  live_apply_status: "deferred — Supabase pooler still unreachable per STATE.md blocker; --sql dry-run is the gate for Plan 15-01. Phase 15 live alembic upgrade head will land alongside Plan 15-04 (when routes need the tables)"

verification:
  acceptance_criteria_passed:
    - "alembic upgrade head --sql exits 0 (line count 766)"
    - "8 new CREATE TABLE statements emitted (sales..stripe_webhook_events)"
    - "20 ON DELETE CASCADE clauses (lines/payments/refunds and their joins)"
    - "1 UNIQUE event_id (stripe_webhook_events) — global idempotency per Pitfall 6"
    - "1 UNIQUE close_date scoped to tenant (uq_daily_close_per_day) — POS-10 one-per-day"
    - "ck_inventory_reason DROP + ADD emits 3 occurrences in SQL (sale_placed + refund_restock present)"
    - "4 ALTER TABLE tenants ADD COLUMN IF NOT EXISTS (idempotent)"
    - "All 8 new ORM classes importable from backend.db.models.tenant.clinical"
    - "All 14 new AuditAction members present (.name lookup matches Wave-0 expected set)"
    - "All 6 new ClinicalAction members present + PERMISSION_MATRIX populated"
    - "ClinicalAction.RECORD_WRITE_OFF allowed roles == {OWNER, ADMIN} exactly (TECHNICIAN, RECEPTIONIST, DOCTOR absent)"
    - "ClinicalAction.MANAGE_PAYMENT_CONFIG allowed roles == {OWNER} exactly (ADMIN absent)"
    - "Tenant.__table__.columns contains sales_tax_rate, stripe_publishable_key, stripe_secret_key_encrypted, stripe_webhook_secret_encrypted"
    - "InventoryTransaction.__table__.columns contains sale_id; CheckConstraint text contains both sale_placed and refund_restock"
    - "SaleLineItem.__table__.columns contains optical_order_line_item_id"

  tests_run:
    - file: backend/tests/test_pos_models.py
      result: "3/3 passed (test_sale_status_enum_values, test_payment_method_enum_values, test_sale_line_item_source_type_enum) — flipped from skip"
    - file: backend/tests/test_pos_enums.py
      result: "2/2 passed (test_pos_audit_actions_present, test_pos_clinical_actions_present) — flipped from skip"
    - file: backend/tests/test_permissions_pos.py
      result: "1/1 passed (test_pos_permission_matrix_entries) — flipped from skip"
    - file: regression-check on backend/tests/test_permissions.py
      result: "1 pre-existing flake (test_receptionist_cannot_cancel_optical_order — passes in isolation, fails when bundled). Reproduced on `main` BEFORE Plan 15-01 changes — confirmed not regression."

deviations:
  - decision: "Use PEP 562 ``__getattr__`` for the ClinicalAction re-export instead of a top-level import"
    why: "An eager ``from backend.core.permissions import ClinicalAction`` at the bottom of clinical.py crashes alembic env.py: permissions.py → security.py → config.py → Settings() instantiation, which fails with ValidationError when DATABASE_URL/SUPABASE_* env vars are absent (the case during `alembic upgrade head --sql`). The lazy form satisfies the Wave-0 test imports (test_pos_enums / test_permissions_pos pull ClinicalAction from clinical.py) without pulling settings into migration generation."
    impact: "ClinicalAction is not in `dir(clinical)` until first access; only matters for IDE static analysis. All runtime imports work."

  - decision: "AuditAction values are lowercase snake_case ('sale_paid'), not uppercase 'SALE_PAID' as one of the plan acceptance criteria suggested"
    why: "Every existing AuditAction value (Phase 3..Phase 14, 50+ rows) uses lowercase snake_case. Wave-0 test_pos_enums.py asserts member ``.name`` (always uppercase by Python convention), not ``.value`` — so the lowercase value satisfies both the test and the project convention. The plan example with uppercase values was inconsistent with the rest of the enum."
    impact: "None — both Wave-0 tests pass; audit_log writes will store lowercase strings, matching the rest of the audit history."

  - decision: "Partial unique index on (tenant_id, receipt_number) emitted via op.execute(raw SQL) rather than op.create_index(unique=True, postgresql_where=...)"
    why: "Phase 13 migration 0017 sets the precedent: `postgresql_where` produced inconsistent WHERE clause emission across SQLA/asyncpg versions, so raw SQL CREATE UNIQUE INDEX is the safe path."
    impact: "None — DDL output is identical to what create_index would emit when it works."

  - decision: "ck_inventory_reason widened by DROP + ADD (in upgrade) and DROP + ADD reverse (in downgrade)"
    why: "Postgres has no ALTER TABLE ... ALTER CONSTRAINT for CHECK semantics. Drop/recreate is the standard idiom and is wrapped in the migration TXN, so partial states are not visible."
    impact: "Cannot rollback mid-migration if a concurrent INSERT violates the new constraint — acceptable since the new values are additive (only widens the allowed set)."

  - decision: "FK constraint fk_inventory_transactions_sale created AFTER sales CREATE TABLE in the same upgrade() function, NOT before"
    why: "If alembic tried to create the FK before sales existed, the migration would fail with `relation \"sales\" does not exist`. Adding the column first (nullable, no FK), then creating sales, then adding the FK in a second op.create_foreign_key call keeps dependency ordering linear and matches the plan's explicit guidance."
    impact: "None — single transactional upgrade; intermediate state never visible."

risks_carried_forward:
  - "Live alembic upgrade head NOT YET RUN — gated on Supabase pooler restoration (STATE.md blocker from Phase 14). When unblocked, run `alembic upgrade head` to materialize the 8 tables + 4 Tenant columns in the dev DB. The --sql dry-run produced clean DDL, so failure modes are limited to FK-conflict (sales references patients/staff/optical_order_line_items — all present in 0019)."
  - "Plan 15-03 will populate SaleLineItem.optical_order_line_item_id from OpticalOrderLineItem during prefill_from_optical_order. If the prefill logic doesn't set this column, Plan 15-05 restock_for_refund_line will fail to locate the product. Plan 15-03 owns this contract."
  - "Stripe webhook idempotency depends on the `uq_stripe_webhook_event_id` constraint being respected by the webhook handler. Plan 15-08 must INSERT this row inside the same TXN as the side-effect (payment state update), otherwise a duplicate delivery sneaks through."

open_questions:
  - "DailyCloseRun.expected_cash uses default 0.00; should it be `NOT NULL` without default and force the caller (Plan 15-07) to compute? Current shape is forgiving — application layer computes and writes it. Plan 15-07 will confirm."

next_plan: "15-02-payment-processor-crypto — install Stripe + cryptography deps already pinned in Plan 15-00, build PaymentProcessor Protocol + StripeProcessor adapter + Fernet credential-encryption helpers in backend.services.payments. Reads Tenant.stripe_*_encrypted columns from this plan."
---

# Plan 15-01 — Schema + ORM Summary

## Scope landed
Phase 15 financial-ledger schema (8 tables + 4 Tenant columns + InventoryTransaction extension), ORM mirror, 14 new AuditAction values, 6 new ClinicalAction values + PERMISSION_MATRIX rows, and the lazy ClinicalAction re-export that lets Wave-0 tests import it from `clinical.py`.

## What this unlocks
Every downstream plan (15-02 through 15-11) imports from these tables. Schema-first per the plan's interface-first principle — no plan after this writes data until the substrate exists.

## What is NOT in this plan
- Live `alembic upgrade head` against the dev DB (blocked on Supabase pooler — same STATE.md blocker from Phase 14). The `--sql` dry-run is the gate.
- Pydantic schemas / TS types / service layer (Plan 15-03).
- Routes (Plan 15-04 / 15-05 / 15-07 / 15-08).
