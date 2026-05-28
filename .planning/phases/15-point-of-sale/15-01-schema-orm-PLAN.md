---
phase: 15-point-of-sale
plan: 01
type: execute
wave: 2
depends_on: [15-00]
files_modified:
  - backend/alembic/versions/0020_phase15_point_of_sale.py
  - backend/db/models/tenant/clinical.py
  - backend/db/models/public/saas.py
  - backend/core/permissions.py
autonomous: true
requirements: [POS-05, POS-08, POS-09, POS-11, POS-12, POS-13]

must_haves:
  truths:
    - "Alembic migration 0020 applies cleanly (DDL-only via --sql) and adds Sale/SaleLineItem/Payment/Refund/RefundLineItem/RefundPayment/DailyCloseRun/StripeWebhookEvent tables + 4 Tenant columns + InventoryTransaction.sale_id column + SaleLineItem.optical_order_line_item_id FK + extends ck_inventory_reason CHECK with 'sale_placed' and 'refund_restock'"
    - "All 8 new ORM classes import without errors from backend.db.models.tenant.clinical"
    - "13 new AuditAction VARCHAR values + 6 new ClinicalAction values added with correct PERMISSION_MATRIX rows"
    - "Encounter / Patient back-references for Sale work via selectinload (no MissingGreenlet)"
    - "Wave-0 test_pos_models.py + test_pos_enums.py + test_permissions_pos.py exit GREEN (no skip) after this plan lands"
  artifacts:
    - path: "backend/alembic/versions/0020_phase15_point_of_sale.py"
      provides: "Migration for 8 new tables + 4 Tenant columns + indexes + audit/permission enum is VARCHAR so no DDL for those"
      contains: "def upgrade()"
    - path: "backend/db/models/tenant/clinical.py"
      provides: "Sale (with SaleLineItem.optical_order_line_item_id FK), Payment, Refund, RefundLineItem, RefundPayment, DailyCloseRun, StripeWebhookEvent ORMs + Sale lifecycle enums + 14 new AuditAction values + extended InventoryTransaction (sale_id column + widened ck_inventory_reason CHECK)"
      contains: "class Sale("
    - path: "backend/db/models/public/saas.py"
      provides: "Tenant model gets sales_tax_rate + stripe_publishable_key + stripe_secret_key_encrypted + stripe_webhook_secret_encrypted columns"
      contains: "stripe_secret_key_encrypted"
    - path: "backend/core/permissions.py"
      provides: "6 new ClinicalAction values + PERMISSION_MATRIX rows"
      contains: "RECORD_WRITE_OFF"
  key_links:
    - from: "Sale.tenant_id"
      to: "tenants.id"
      via: "ForeignKey"
      pattern: "ForeignKey\\(.tenants\\.id."
    - from: "Refund.sale_id"
      to: "sales.id"
      via: "ForeignKey"
      pattern: "ForeignKey\\(.sales\\.id."
    - from: "RefundLineItem.refund_id + RefundLineItem.sale_line_item_id"
      to: "refunds.id + sale_line_items.id"
      via: "join table FKs"
      pattern: "RefundLineItem"
    - from: "StripeWebhookEvent.event_id"
      to: "Stripe webhook idempotency"
      via: "unique constraint on event_id"
      pattern: "UniqueConstraint.*event_id|unique=True"
---

<objective>
Land the Phase 15 financial-ledger schema. Alembic migration 0020 creates 8 new tables (Sale, SaleLineItem, Payment, Refund, RefundLineItem, RefundPayment, DailyCloseRun, StripeWebhookEvent) and adds 4 columns to Tenant (sales_tax_rate, stripe_publishable_key, stripe_secret_key_encrypted, stripe_webhook_secret_encrypted). ORM models mirror migration. 13 new AuditAction values + 6 new ClinicalAction values + PERMISSION_MATRIX rows.

Purpose: provide the storage substrate that every other plan reads from. This plan is interface-first — nothing else writes data until tables exist.

Output: clean `alembic upgrade head --sql` output; all Wave-0 model + enum + permission tests flip from skip to PASS.
</objective>

<execution_context>
@C:/Users/duytr/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/duytr/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/REQUIREMENTS.md
@.planning/phases/15-point-of-sale/15-CONTEXT.md
@.planning/phases/15-point-of-sale/15-RESEARCH.md
@backend/db/models/tenant/clinical.py
@backend/db/models/public/saas.py
@backend/core/permissions.py
@backend/alembic/versions/0019_optical_order_configuration.py
@backend/alembic/versions/0017_retail_inventory.py

<interfaces>
<!-- AuditAction enum extension point — clinical.py:127 -->
```python
# Existing pattern from Phase 14:
class AuditAction(str, enum.Enum):
    # ... existing values ...
    GENERATE_JOB_TICKET = "GENERATE_JOB_TICKET"  # last Phase 14 value
    # Phase 15 additions go here
```

<!-- ClinicalAction enum + PERMISSION_MATRIX extension — permissions.py -->
```python
# Existing role keys: OWNER, ADMIN, DOCTOR, TECHNICIAN, RECEPTIONIST
class ClinicalAction(str, enum.Enum):
    # ... existing values ...
    MANAGE_LENS_CATALOG = "MANAGE_LENS_CATALOG"

PERMISSION_MATRIX: dict[ClinicalAction, set[Role]] = {
    # ... existing rows ...
}
```

<!-- Tenant model — public/saas.py: extension point follows the existing pattern for timezone column added in Phase 10.4 -->
```python
class Tenant(TimestampMixin, Base):
    # Existing columns ...
    timezone = Column(String(64), nullable=False, default="America/Los_Angeles")
    # Phase 15 additions:
    # sales_tax_rate, stripe_publishable_key, stripe_secret_key_encrypted, stripe_webhook_secret_encrypted
```

<!-- VARCHAR-enum wrapper convention (Phase 9 onward) -->
```python
from sqlalchemy import Enum as SAEnum
# native_enum=False stores as VARCHAR — no ALTER TYPE migrations needed for enum extensions
status = Column(SAEnum(SaleStatus, native_enum=False, length=20), nullable=False)
```

<!-- Phase 13 partial unique index pattern (for is_active soft-delete) — NOT used here since Sale doesn't soft-delete -->

<!-- Stripe webhook idempotency pattern -->
```python
# StripeWebhookEvent: unique on event_id alone (NOT scoped to tenant — Stripe event IDs are globally unique)
class StripeWebhookEvent(TenantBase):
    event_id = Column(String(64), nullable=False, unique=True, index=True)
    event_type = Column(String(64), nullable=False)
    received_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Alembic migration 0020 + ORM additions for 8 tables (Sale, SaleLineItem, Payment, Refund, RefundLineItem, RefundPayment, DailyCloseRun, StripeWebhookEvent) + 4 Tenant columns + 13 AuditAction + 6 ClinicalAction values + PERMISSION_MATRIX rows</name>
  <files>backend/alembic/versions/0020_phase15_point_of_sale.py, backend/db/models/tenant/clinical.py, backend/db/models/public/saas.py, backend/core/permissions.py</files>
  <read_first>
    - backend/alembic/versions/0019_optical_order_configuration.py (Phase 14 migration — clone JSONB server_default `sa.text("'{}'::jsonb")` pattern, ADD COLUMN IF NOT EXISTS pattern, Decimal column spec)
    - backend/alembic/versions/0017_retail_inventory.py (Phase 13 migration — clone Product/OpticalOrder table-creation shape, FK patterns, index conventions)
    - backend/db/models/tenant/clinical.py (read fully — confirm AuditAction enum location at line 127; confirm Superbill structure at 1109; confirm Product/OpticalOrder/InventoryTransaction at 1487/1541/1706 for FK targets)
    - backend/db/models/public/saas.py (read fully — confirm Tenant model column ordering convention)
    - backend/core/permissions.py (read fully — confirm Role keys, ClinicalAction enum, PERMISSION_MATRIX shape)
    - .planning/phases/15-point-of-sale/15-CONTEXT.md §A (schema spec), §I (permissions), §J (audit)
  </read_first>
  <action>
    Four concrete sets of edits — write `alembic upgrade head --sql > /tmp/0020.sql` and inspect to confirm DDL is reasonable before claiming done.

    **A. Migration file `backend/alembic/versions/0020_phase15_point_of_sale.py`**

    Header:
    ```python
    """Phase 15: Point of Sale — Sale ledger, Payments, Refunds, DailyCloseRun, Tenant payment config, StripeWebhookEvent

    Revision ID: 0020_phase15_point_of_sale
    Revises: 0019_optical_order_configuration
    Create Date: 2026-05-28
    """
    from alembic import op
    import sqlalchemy as sa
    from sqlalchemy.dialects import postgresql

    revision = "0020_phase15_point_of_sale"
    down_revision = "0019_optical_order_configuration"
    branch_labels = None
    depends_on = None
    ```

    `def upgrade():` creates (use `sa.text("'{}'::jsonb")` for any JSONB server_default; use `ADD COLUMN IF NOT EXISTS` pattern for the Tenant column adds wrapped in DO blocks for idempotency):

    0. **Inventory transaction extension** (BLOCKER fixes #1 + #2 from checker iter 1):
       - Drop and recreate `ck_inventory_reason` CHECK constraint to add Phase 15 reasons:
         ```python
         op.drop_constraint('ck_inventory_reason', 'inventory_transactions', type_='check')
         op.create_check_constraint(
             'ck_inventory_reason', 'inventory_transactions',
             "reason IN ('order_placed','order_cancelled','receive_stock','manual_adjust','sale_placed','refund_restock')",
         )
         ```
       - Add `sale_id` column to `inventory_transactions` (nullable, SET NULL on sale delete) for audit traceability:
         ```python
         op.add_column('inventory_transactions',
             sa.Column('sale_id', postgresql.UUID(as_uuid=True), nullable=True))
         # FK added AFTER `sales` table CREATE TABLE in this same upgrade():
         op.create_foreign_key(
             'fk_inventory_transactions_sale', 'inventory_transactions', 'sales',
             ['sale_id'], ['id'], ondelete='SET NULL',
         )
         op.create_index('ix_inventory_transactions_sale',
                         'inventory_transactions', ['tenant_id', 'sale_id'])
         ```
         NOTE: The `add_column` runs FIRST (before `sales` CREATE TABLE) so the column exists; the FK constraint is added LATER in the same upgrade() function, after `sales` table is created. This avoids forward-reference issues with Alembic.

    1. **Tenant column additions** (DO block for idempotency, ADD COLUMN IF NOT EXISTS):
       - `sales_tax_rate Numeric(5,4) NOT NULL DEFAULT 0.0725`
       - `stripe_publishable_key VARCHAR(128) NULL`
       - `stripe_secret_key_encrypted TEXT NULL`
       - `stripe_webhook_secret_encrypted TEXT NULL`

    2. **`sales` table:**
       - id UUID PK default uuid_generate_v4()
       - tenant_id UUID NOT NULL FK → tenants.id
       - patient_id UUID NULL FK → patients.id (NULL for walk-in retail)
       - status VARCHAR(20) NOT NULL DEFAULT 'open'  -- enum {open, paid, refunded, voided}
       - subtotal Numeric(10,2) NOT NULL DEFAULT 0.00
       - tax Numeric(10,2) NOT NULL DEFAULT 0.00
       - discount_total Numeric(10,2) NOT NULL DEFAULT 0.00
       - total Numeric(10,2) NOT NULL DEFAULT 0.00
       - receipt_number VARCHAR(20) NULL  -- format R-YYYYMMDD-NNNN; populated on close
       - receipt_url TEXT NULL  -- reserved for future Supabase Storage cache (Phase 15 always regenerates per Open Q 2)
       - notes VARCHAR(1000) NULL
       - created_by_id UUID NULL FK → staff.id
       - opened_at TIMESTAMPTZ NOT NULL DEFAULT now()
       - closed_at TIMESTAMPTZ NULL
       - created_at, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
       - Indexes: (tenant_id, patient_id), (tenant_id, status, closed_at) for daily-close queries, (tenant_id, opened_at desc) for list view, UNIQUE (tenant_id, receipt_number) WHERE receipt_number IS NOT NULL

    3. **`sale_line_items` table:**
       - id UUID PK
       - tenant_id UUID NOT NULL FK
       - sale_id UUID NOT NULL FK → sales.id ON DELETE CASCADE
       - source_type VARCHAR(20) NOT NULL  -- {superbill, optical_order, product, adhoc}
       - source_id UUID NULL  -- nullable for adhoc; for optical_order rows still points at OpticalOrder.id (shared across the order's lines for UI grouping)
       - **optical_order_line_item_id UUID NULL FK → optical_order_line_items.id ON DELETE SET NULL** (WARNING #3 fix from checker iter 1): exact restock target for `source_type='optical_order'` lines. Populated by `prefill_from_optical_order` in Plan 15-03. NULL for non-optical_order lines. Plan 15-05 `restock_for_refund_line` uses this FK directly (no `line_total` heuristic).
       - description VARCHAR(500) NOT NULL
       - qty Integer NOT NULL DEFAULT 1 (CHECK qty > 0)
       - unit_price Numeric(10,2) NOT NULL
       - discount_amount Numeric(10,2) NOT NULL DEFAULT 0.00
       - discount_reason VARCHAR(200) NULL
       - taxable Boolean NOT NULL DEFAULT true
       - line_total Numeric(10,2) NOT NULL  -- = qty * unit_price - discount_amount (computed app-side, stored)
       - created_at, updated_at
       - Indexes: (sale_id), (tenant_id, source_type, source_id) for cross-references, **partial index `ix_sale_line_items_optical_oli (tenant_id, optical_order_line_item_id) WHERE optical_order_line_item_id IS NOT NULL`** for Plan 15-05 refund lookups

    4. **`payments` table:**
       - id UUID PK
       - tenant_id, sale_id (FK → sales.id ON DELETE CASCADE)
       - method VARCHAR(20) NOT NULL  -- {cash, stripe_card, external_card, write_off}
       - amount Numeric(10,2) NOT NULL  (CHECK amount > 0)
       - tendered Numeric(10,2) NULL  -- cash only
       - change_due Numeric(10,2) NULL  -- cash only
       - processor_payment_id VARCHAR(128) NULL  -- pi_xxx
       - processor_charge_id VARCHAR(128) NULL  -- ch_xxx
       - last4 VARCHAR(4) NULL
       - card_brand VARCHAR(20) NULL  -- "visa" / "mastercard" / etc.
       - auth_code VARCHAR(20) NULL  -- external_card free-typed
       - status VARCHAR(20) NOT NULL DEFAULT 'pending'  -- {pending, succeeded, failed, refunded, partial_refund}
       - reason_note VARCHAR(500) NULL  -- mandatory for write_off (enforced app-side)
       - created_by_id UUID NULL FK → staff.id
       - created_at, updated_at
       - Indexes: (sale_id), (tenant_id, processor_payment_id) UNIQUE WHERE processor_payment_id IS NOT NULL, (tenant_id, status, created_at) for daily close

    5. **`refunds` table:**
       - id UUID PK
       - tenant_id, sale_id (FK ON DELETE CASCADE)
       - total_amount Numeric(10,2) NOT NULL (CHECK total_amount > 0)
       - reason VARCHAR(500) NOT NULL  -- never null per CONTEXT §E
       - refunded_by_id UUID NULL FK → staff.id
       - processor_refund_id VARCHAR(128) NULL  -- re_xxx for Stripe
       - created_at, updated_at
       - Index: (sale_id), (tenant_id, created_at desc)

    6. **`refund_line_items` table (join):**
       - id UUID PK
       - tenant_id
       - refund_id UUID NOT NULL FK → refunds.id ON DELETE CASCADE
       - sale_line_item_id UUID NOT NULL FK → sale_line_items.id
       - qty Integer NOT NULL (CHECK qty > 0)
       - amount Numeric(10,2) NOT NULL
       - created_at
       - Index: (refund_id), (sale_line_item_id)

    7. **`refund_payments` table (join):**
       - id UUID PK
       - tenant_id
       - refund_id UUID NOT NULL FK → refunds.id ON DELETE CASCADE
       - payment_id UUID NOT NULL FK → payments.id
       - amount Numeric(10,2) NOT NULL (CHECK amount > 0)
       - processor_refund_id VARCHAR(128) NULL
       - created_at
       - Index: (refund_id), (payment_id)

    8. **`daily_close_runs` table:**
       - id UUID PK
       - tenant_id NOT NULL
       - close_date DATE NOT NULL
       - expected_cash Numeric(10,2) NOT NULL DEFAULT 0.00
       - counted_cash Numeric(10,2) NOT NULL
       - variance Numeric(10,2) NOT NULL  -- = counted - expected (signed)
       - notes VARCHAR(1000) NULL
       - run_by_id UUID NOT NULL FK → staff.id
       - run_at TIMESTAMPTZ NOT NULL DEFAULT now()
       - UNIQUE (tenant_id, close_date)  -- one close per day per tenant (POS-10)
       - Index: (tenant_id, close_date desc)

    9. **`stripe_webhook_events` table:**
       - id UUID PK
       - tenant_id UUID NOT NULL  -- resolved from event metadata.tenant_id
       - event_id VARCHAR(64) NOT NULL UNIQUE  -- Stripe evt_xxx — global uniqueness (Pitfall 6)
       - event_type VARCHAR(64) NOT NULL  -- "payment_intent.succeeded", etc.
       - payment_intent_id VARCHAR(128) NULL
       - received_at TIMESTAMPTZ NOT NULL DEFAULT now()
       - Index: (event_id), (tenant_id, received_at desc)

    `def downgrade():` drops all 8 tables in reverse FK order then drops the 4 Tenant columns.

    Validate via dry run: `cd backend && alembic upgrade head --sql > /tmp/0020.sql && grep -c "CREATE TABLE" /tmp/0020.sql` must return ≥ 8.

    **B. ORM `backend/db/models/tenant/clinical.py`**

    Add 13 new AuditAction values AFTER existing `GENERATE_JOB_TICKET = "GENERATE_JOB_TICKET"`:
    ```python
        SALE_CREATE = "SALE_CREATE"
        SALE_OPENED = "SALE_OPENED"
        SALE_PAID = "SALE_PAID"
        SALE_VOIDED = "SALE_VOIDED"
        PAYMENT_RECORDED = "PAYMENT_RECORDED"
        PAYMENT_FAILED = "PAYMENT_FAILED"
        WRITE_OFF_RECORDED = "WRITE_OFF_RECORDED"
        REFUND_ISSUED = "REFUND_ISSUED"
        RECEIPT_EMAILED = "RECEIPT_EMAILED"
        RECEIPT_PRINTED = "RECEIPT_PRINTED"
        DAILY_CLOSE_RUN = "DAILY_CLOSE_RUN"
        SALE_DISCOUNT_APPLIED = "SALE_DISCOUNT_APPLIED"
        STRIPE_KEYS_UPDATED = "STRIPE_KEYS_UPDATED"
        STRIPE_WEBHOOK_RECEIVED = "STRIPE_WEBHOOK_RECEIVED"
    ```
    (Note: that's 14 values — POS-12 says 13. Recount on commit; the canonical 13 is the CONTEXT.md §J list minus STRIPE_WEBHOOK_RECEIVED if separated. Pull final list from REQUIREMENTS.md POS-12 wording — include all 14 listed there for completeness.)

    Add Sale-related enums at module level (mirror SaleStatus pattern from Phase 13's OpticalOrderStatus):
    ```python
    class SaleStatus(str, enum.Enum):
        OPEN = "open"; PAID = "paid"; REFUNDED = "refunded"; VOIDED = "voided"
    class SaleLineItemSourceType(str, enum.Enum):
        SUPERBILL = "superbill"; OPTICAL_ORDER = "optical_order"; PRODUCT = "product"; ADHOC = "adhoc"
    class PaymentMethod(str, enum.Enum):
        CASH = "cash"; STRIPE_CARD = "stripe_card"; EXTERNAL_CARD = "external_card"; WRITE_OFF = "write_off"
    class PaymentStatus(str, enum.Enum):
        PENDING = "pending"; SUCCEEDED = "succeeded"; FAILED = "failed"; REFUNDED = "refunded"; PARTIAL_REFUND = "partial_refund"
    ```

    Add 8 new ORM classes near the end of the file (after the last Phase 14 class), each inheriting `TimestampMixin, TenantBase` (except join tables which only need TenantBase + a `created_at` column). VARCHAR-enum wrapper via `SAEnum(..., native_enum=False, length=20)`. Decimal columns as `Numeric(10, 2)`.

    For `Sale`: add `lines = relationship("SaleLineItem", back_populates="sale", cascade="all, delete-orphan", lazy="selectin")`, `payments = relationship("Payment", back_populates="sale", cascade="all, delete-orphan", lazy="selectin")`, `refunds = relationship("Refund", back_populates="sale", cascade="all, delete-orphan", lazy="selectin")`, `patient = relationship("Patient", lazy="selectin")`, `created_by = relationship("Staff", foreign_keys=[created_by_id], lazy="selectin")`.

    For `Patient`: add `sales = relationship("Sale", back_populates="patient", lazy="dynamic")` back-reference (find existing Patient class, add the line under existing back-refs).

    Use `foreign_keys=[created_by_id]` and `foreign_keys=[refunded_by_id]` etc. explicitly anywhere a class has multiple Staff FKs (mirror Phase 13 OpticalOrder.created_by_id ambiguity fix).

    **C. Tenant `backend/db/models/public/saas.py`**

    Add 4 columns to `Tenant` after `timezone`:
    ```python
        sales_tax_rate = Column(Numeric(5, 4), nullable=False, server_default=sa.text("0.0725"))
        stripe_publishable_key = Column(String(128), nullable=True)
        stripe_secret_key_encrypted = Column(Text, nullable=True)
        stripe_webhook_secret_encrypted = Column(Text, nullable=True)
    ```

    **D. Permissions `backend/core/permissions.py`**

    Add to `ClinicalAction` enum:
    ```python
        OPEN_POS = "OPEN_POS"
        RECORD_PAYMENT = "RECORD_PAYMENT"
        RECORD_WRITE_OFF = "RECORD_WRITE_OFF"
        ISSUE_REFUND = "ISSUE_REFUND"
        RUN_DAILY_CLOSE = "RUN_DAILY_CLOSE"
        MANAGE_PAYMENT_CONFIG = "MANAGE_PAYMENT_CONFIG"
    ```

    Add to `PERMISSION_MATRIX` (use Role enum values from existing code — likely `Role.OWNER`, `Role.ADMIN`, `Role.TECHNICIAN`, `Role.RECEPTIONIST`):
    ```python
        ClinicalAction.OPEN_POS: {Role.OWNER, Role.ADMIN, Role.TECHNICIAN, Role.RECEPTIONIST},
        ClinicalAction.RECORD_PAYMENT: {Role.OWNER, Role.ADMIN, Role.TECHNICIAN, Role.RECEPTIONIST},
        ClinicalAction.RECORD_WRITE_OFF: {Role.OWNER, Role.ADMIN},
        ClinicalAction.ISSUE_REFUND: {Role.OWNER, Role.ADMIN},
        ClinicalAction.RUN_DAILY_CLOSE: {Role.OWNER, Role.ADMIN},
        ClinicalAction.MANAGE_PAYMENT_CONFIG: {Role.OWNER},
    ```

    **E. InventoryTransaction ORM extension (`backend/db/models/tenant/clinical.py:1706-1766`) — BLOCKER #1 + #2 mirror**

    Update the existing `InventoryTransaction.__table_args__` CheckConstraint string to mirror the migration (BLOCKER #1):
    ```python
    __table_args__ = (
        Index(
            "ix_inventory_transactions_product",
            "product_id", "created_at",
        ),
        Index(
            "ix_inventory_transactions_sale",
            "tenant_id", "sale_id",
        ),
        CheckConstraint(
            "reason IN ('order_placed','order_cancelled','receive_stock','manual_adjust','sale_placed','refund_restock')",
            name="ck_inventory_reason",
        ),
    )
    ```

    Add the `sale_id` column field (place AFTER existing `optical_order_id` column for grouping audit-link FKs) (BLOCKER #2):
    ```python
    sale_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sales.id", ondelete="SET NULL"),
        nullable=True,
    )
    ```

    No back-ref relationship is required (audit-only). If Sale ever needs to list its inventory transactions, a one-way `sale = relationship("Sale", lazy="selectin")` may be added later — not in scope for Phase 15.

    **F. SaleLineItem ORM — optical_order_line_item_id FK (WARNING #3)**

    The new `SaleLineItem` class created in Section B MUST include the new FK column to OpticalOrderLineItem:
    ```python
    optical_order_line_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("optical_order_line_items.id", ondelete="SET NULL"),
        nullable=True,
    )
    ```
    Plus a partial index entry in `SaleLineItem.__table_args__`:
    ```python
    Index(
        "ix_sale_line_items_optical_oli",
        "tenant_id", "optical_order_line_item_id",
        postgresql_where=text("optical_order_line_item_id IS NOT NULL"),
    ),
    ```
    Plan 15-03 `prefill_from_optical_order` populates this column on each cart line; Plan 15-05 `restock_for_refund_line` reads it directly to find the OpticalOrderLineItem (and therefore the product_id to restock) — no fragile `line_total` matching.
  </action>
  <verify>
    <automated>cd backend && alembic upgrade head --sql > /tmp/0020.sql && grep -E "CREATE TABLE.*(sales|sale_line_items|payments|refunds|refund_line_items|refund_payments|daily_close_runs|stripe_webhook_events)" /tmp/0020.sql | wc -l && grep -c "sale_placed\|refund_restock" /tmp/0020.sql && python -c "from backend.db.models.tenant.clinical import Sale, SaleLineItem, Payment, Refund, RefundLineItem, RefundPayment, DailyCloseRun, StripeWebhookEvent, InventoryTransaction, SaleStatus, PaymentMethod, PaymentStatus, SaleLineItemSourceType, AuditAction; assert AuditAction.SALE_PAID.value == 'SALE_PAID'; assert AuditAction.REFUND_ISSUED.value == 'REFUND_ISSUED'; assert AuditAction.STRIPE_WEBHOOK_RECEIVED.value == 'STRIPE_WEBHOOK_RECEIVED'; assert 'sale_id' in {c.name for c in InventoryTransaction.__table__.columns}; assert 'optical_order_line_item_id' in {c.name for c in SaleLineItem.__table__.columns}; print('ok')" && python -c "from backend.db.models.tenant.clinical import InventoryTransaction; cs = [c for c in InventoryTransaction.__table__.constraints if getattr(c,'name','')=='ck_inventory_reason']; assert cs and 'sale_placed' in str(cs[0].sqltext) and 'refund_restock' in str(cs[0].sqltext); print('ok')" && python -c "from backend.core.permissions import ClinicalAction, PERMISSION_MATRIX, Role; assert ClinicalAction.RECORD_WRITE_OFF in PERMISSION_MATRIX; assert Role.OWNER in PERMISSION_MATRIX[ClinicalAction.RECORD_WRITE_OFF]; assert Role.TECHNICIAN not in PERMISSION_MATRIX[ClinicalAction.RECORD_WRITE_OFF]; print('ok')" && python -c "from backend.db.models.public.saas import Tenant; cols = {c.name for c in Tenant.__table__.columns}; assert 'sales_tax_rate' in cols; assert 'stripe_secret_key_encrypted' in cols; print('ok')" && pytest backend/tests/test_pos_models.py backend/tests/test_pos_enums.py backend/tests/test_permissions_pos.py -v</automated>
  </verify>
  <acceptance_criteria>
    - `alembic upgrade head --sql` exits 0 and contains exactly 8 `CREATE TABLE ... (sales|sale_line_items|payments|refunds|refund_line_items|refund_payments|daily_close_runs|stripe_webhook_events)` statements
    - `python -c "from backend.db.models.tenant.clinical import Sale, SaleLineItem, Payment, Refund, RefundLineItem, RefundPayment, DailyCloseRun, StripeWebhookEvent"` exits 0
    - `python -c "from backend.db.models.tenant.clinical import AuditAction; print([a.value for a in AuditAction if a.value in ('SALE_CREATE','SALE_OPENED','SALE_PAID','SALE_VOIDED','PAYMENT_RECORDED','PAYMENT_FAILED','WRITE_OFF_RECORDED','REFUND_ISSUED','RECEIPT_EMAILED','RECEIPT_PRINTED','DAILY_CLOSE_RUN','SALE_DISCOUNT_APPLIED','STRIPE_KEYS_UPDATED','STRIPE_WEBHOOK_RECEIVED')])"` lists all 14 values
    - `python -c "from backend.core.permissions import ClinicalAction; [getattr(ClinicalAction, k) for k in ('OPEN_POS','RECORD_PAYMENT','RECORD_WRITE_OFF','ISSUE_REFUND','RUN_DAILY_CLOSE','MANAGE_PAYMENT_CONFIG')]"` exits 0
    - `PERMISSION_MATRIX[ClinicalAction.RECORD_WRITE_OFF]` contains exactly `{Role.OWNER, Role.ADMIN}` — TECHNICIAN, RECEPTIONIST, DOCTOR absent
    - `PERMISSION_MATRIX[ClinicalAction.MANAGE_PAYMENT_CONFIG]` contains exactly `{Role.OWNER}` — ADMIN absent
    - `Tenant.__table__.columns` contains `sales_tax_rate`, `stripe_publishable_key`, `stripe_secret_key_encrypted`, `stripe_webhook_secret_encrypted`
    - `pytest backend/tests/test_pos_models.py -v` passes (no longer skipped) — all enum tests green
    - `pytest backend/tests/test_pos_enums.py -v` passes — 14 audit + 6 clinical values verified
    - `pytest backend/tests/test_permissions_pos.py -v` passes — role matrix verified
    - `grep -c "ON DELETE CASCADE" /tmp/0020.sql` returns >= 6 (Sale-owned children cascade)
    - `grep -c "UNIQUE.*event_id" /tmp/0020.sql` returns >= 1 (StripeWebhookEvent global uniqueness)
    - `grep -c "UNIQUE.*tenant_id.*close_date\|UNIQUE.*close_date.*tenant_id" /tmp/0020.sql` returns >= 1 (DailyCloseRun one-per-day)
    - `grep -c "sale_placed" /tmp/0020.sql` returns >= 1 — BLOCKER #1: ck_inventory_reason CHECK extended with 'sale_placed'
    - `grep -c "refund_restock" /tmp/0020.sql` returns >= 1 — BLOCKER #1: CHECK extended with 'refund_restock'
    - `grep -c "ck_inventory_reason" /tmp/0020.sql` returns >= 2 — BLOCKER #1: DROP CONSTRAINT + ADD CONSTRAINT both emitted
    - `python -c "from backend.db.models.tenant.clinical import InventoryTransaction; assert 'sale_id' in {c.name for c in InventoryTransaction.__table__.columns}"` exits 0 — BLOCKER #2: sale_id column present
    - `python -c "from backend.db.models.tenant.clinical import InventoryTransaction; cs = [c for c in InventoryTransaction.__table__.constraints if getattr(c,'name','')=='ck_inventory_reason']; assert cs and 'sale_placed' in str(cs[0].sqltext) and 'refund_restock' in str(cs[0].sqltext)"` exits 0 — BLOCKER #1: ORM CheckConstraint mirrors migration
    - `python -c "from backend.db.models.tenant.clinical import SaleLineItem; assert 'optical_order_line_item_id' in {c.name for c in SaleLineItem.__table__.columns}"` exits 0 — WARNING #3: FK column present
  </acceptance_criteria>
  <done>Schema substrate in place; downstream plans can import all ORM classes; Wave-0 models/enums/permissions tests green; migration validates offline via --sql (live DB application gated on Supabase pooler access — see STATE.md blocker).</done>
</task>

</tasks>

<verification>
- Alembic --sql dry-run produces 8 new tables + 4 column adds
- All 8 ORM classes importable
- 14 AuditAction + 6 ClinicalAction values + PERMISSION_MATRIX populated
- test_pos_models / test_pos_enums / test_permissions_pos flip from skip to PASS
- Tenant has Stripe + tax columns
</verification>

<success_criteria>
Phase 15 schema complete: 8 tables + 4 Tenant columns + audit/permission enums.
</success_criteria>

<output>
After completion, create `.planning/phases/15-point-of-sale/15-01-SUMMARY.md`
</output>
