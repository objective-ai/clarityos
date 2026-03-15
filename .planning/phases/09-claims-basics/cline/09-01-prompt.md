# Phase 9 Wave 2 — ORM Models, Migration, Seed, TS Types

## Goal
Define InsurancePayer, FeeScheduleItem, PatientInsurance ORM models; extend Superbill and SuperbillLineItem; write Alembic migration 0008; seed 10 CA payers + base fee catalog; add TypeScript interfaces.

**Depends on:** 09-00 (test stubs) complete

## Read These Files First
1. `backend/db/models/tenant/clinical.py` — LARGE FILE. Find existing `Superbill` and `SuperbillLineItem` class definitions (~line 1060+). New models go AFTER these.
2. `backend/alembic/versions/0007_appt_finalized.py` — check the `revision` string (needed as `down_revision`)
3. `types/billing.ts` — existing exports to preserve (CPT_CATALOG, ClaimStatus, Superbill, SuperbillLineItem)
4. `backend/seed_db.py` — find the existing seed structure and final `session.commit()` call
5. `backend/alembic/versions/` — list to confirm 0007 is current head

## Context

**Existing model pattern (from clinical.py):**
```python
class Superbill(TimestampMixin, TenantBase):
    __tablename__ = "superbills"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    # all enums stored as VARCHAR (native_enum=False)
    claim_status: Mapped[ClaimStatus] = mapped_column(SAEnum(ClaimStatus, native_enum=False), ...)
```

**Migration chain:** `down_revision = "0007_appt_finalized"` — this is the current head.

**AuditLog audit_action_enum:** The migration must add new values via:
```python
op.execute("ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'generate_pdf'")
```

**Seed pattern (existing in seed_db.py):**
```python
if not session.execute(select(InsurancePayer).where(InsurancePayer.tenant_id == tenant.id)).first():
    # seed payers and fee catalog
```
Use the demo `tenant.id` variable already present in seed_db.py.

## Do NOT / Instead
- Do NOT use `native_enum=True` for any SQLAlchemy Enum — always `native_enum=False` (store as VARCHAR)
- Do NOT remove or rename CPT_CATALOG or existing exports from `types/billing.ts` — append new interfaces at the bottom
- Do NOT add `metadata_jsonb` column to migration without JSONB import: `from sqlalchemy.dialects.postgresql import UUID, JSONB`
- Do NOT run alembic from the project root — run from `backend/` dir with:
  ```bash
  cd backend && PYTHONPATH=C:/Users/duytr/Projects/clarityos python -m alembic upgrade head
  ```

## Instructions

### Task 1 — Add ORM models to clinical.py + extend Superbill/SuperbillLineItem

Open `backend/db/models/tenant/clinical.py`. After the existing SuperbillLineItem class definition, add:

**InsurancePayer:**
```python
class InsurancePayer(TimestampMixin, TenantBase):
    __tablename__ = "insurance_payers"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    payer_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    metadata_jsonb: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # metadata_jsonb: junk drawer for clearinghouse IDs, EDI fields, etc.
    # e.g. {"electronic_payer_id": "12345", "clearinghouse": "availity"}
    fee_items: Mapped[list["FeeScheduleItem"]] = relationship(
        "FeeScheduleItem", back_populates="payer", cascade="all, delete-orphan",
        foreign_keys="FeeScheduleItem.payer_id",
    )
```

**FeeScheduleItem:**
```python
class FeeScheduleItem(TimestampMixin, TenantBase):
    __tablename__ = "fee_schedule_items"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    payer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("insurance_payers.id", ondelete="CASCADE"), nullable=True
    )
    cpt_code: Mapped[str] = mapped_column(String(10), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    fee: Mapped[decimal.Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    payer: Mapped["InsurancePayer | None"] = relationship("InsurancePayer", back_populates="fee_items", foreign_keys=[payer_id])
    __table_args__ = (
        UniqueConstraint("tenant_id", "payer_id", "cpt_code", name="uq_fee_payer_cpt"),
    )
```

**PatientInsurance:**
```python
class PatientInsurance(TimestampMixin, TenantBase):
    __tablename__ = "patient_insurance"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    patient_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, index=True
    )
    payer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("insurance_payers.id", ondelete="RESTRICT"), nullable=False
    )
    priority: Mapped[str] = mapped_column(String(10), nullable=False)  # "primary" | "secondary"
    plan_type: Mapped[str] = mapped_column(String(20), nullable=False)  # "medical" | "vision" | "other"
    subscriber_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    group_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    plan_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    relationship_to_subscriber: Mapped[str] = mapped_column(String(20), nullable=False, default="self")
    subscriber_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    subscriber_dob: Mapped[datetime.date | None] = mapped_column(sa.Date, nullable=True)
    payer: Mapped["InsurancePayer"] = relationship("InsurancePayer", foreign_keys=[payer_id])
    __table_args__ = (
        CheckConstraint("priority IN ('primary', 'secondary')", name="ck_insurance_priority"),
        UniqueConstraint("patient_id", "priority", name="uq_patient_insurance_priority"),
    )
```

Then **extend the existing Superbill class** — add these columns inside the class body:
```python
billed_payer_id: Mapped[uuid.UUID | None] = mapped_column(
    UUID(as_uuid=True), ForeignKey("insurance_payers.id", ondelete="SET NULL"), nullable=True
)
is_self_pay: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
last_pdf_generated_at: Mapped[datetime.datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
pdf_generation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
billed_payer: Mapped["InsurancePayer | None"] = relationship("InsurancePayer", foreign_keys=[billed_payer_id])
```

Then **extend the existing SuperbillLineItem class** — add:
```python
is_fee_overridden: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
fee_source: Mapped[str] = mapped_column(String(20), nullable=False, default="base_rate")
# fee_source values: "payer_rate" | "base_rate" | "manual"
```

Add any missing imports at top of clinical.py (check what's already there):
- `from decimal import Decimal`
- `from sqlalchemy.dialects.postgresql import UUID, JSONB`
- `from sqlalchemy import Numeric, CheckConstraint, Integer`
- `import datetime` or `from datetime import datetime, date`

### Task 2 — Alembic migration + seed + TypeScript types

**Create `backend/alembic/versions/0008_claims_basics.py`:**
```python
"""claims_basics: InsurancePayer, FeeScheduleItem, PatientInsurance + Superbill extensions

Revision ID: 0008_claims_basics
Revises: 0007_appt_finalized
Create Date: 2026-03-14
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision: str = "0008_claims_basics"
down_revision: str = "0007_appt_finalized"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "insurance_payers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("payer_id", sa.String(50), nullable=True),
        sa.Column("phone", sa.String(20), nullable=True),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("metadata_jsonb", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )
    op.create_index("ix_insurance_payers_tenant_id", "insurance_payers", ["tenant_id"])

    op.create_table(
        "fee_schedule_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("payer_id", UUID(as_uuid=True), sa.ForeignKey("insurance_payers.id", ondelete="CASCADE"), nullable=True),
        sa.Column("cpt_code", sa.String(10), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("fee", sa.Numeric(10, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "payer_id", "cpt_code", name="uq_fee_payer_cpt"),
    )
    op.create_index("ix_fee_schedule_items_tenant_id", "fee_schedule_items", ["tenant_id"])

    op.create_table(
        "patient_insurance",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", UUID(as_uuid=True), nullable=False),
        sa.Column("patient_id", UUID(as_uuid=True), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("payer_id", UUID(as_uuid=True), sa.ForeignKey("insurance_payers.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("priority", sa.String(10), nullable=False),
        sa.Column("plan_type", sa.String(20), nullable=False),
        sa.Column("subscriber_id", sa.String(100), nullable=True),
        sa.Column("group_number", sa.String(100), nullable=True),
        sa.Column("plan_name", sa.String(200), nullable=True),
        sa.Column("relationship_to_subscriber", sa.String(20), nullable=False, server_default="self"),
        sa.Column("subscriber_name", sa.String(200), nullable=True),
        sa.Column("subscriber_dob", sa.Date, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.CheckConstraint("priority IN ('primary', 'secondary')", name="ck_insurance_priority"),
        sa.UniqueConstraint("patient_id", "priority", name="uq_patient_insurance_priority"),
    )
    op.create_index("ix_patient_insurance_patient_id", "patient_insurance", ["patient_id"])

    # Extend superbills
    op.add_column("superbills", sa.Column("billed_payer_id", UUID(as_uuid=True), sa.ForeignKey("insurance_payers.id", ondelete="SET NULL"), nullable=True))
    op.add_column("superbills", sa.Column("is_self_pay", sa.Boolean, nullable=False, server_default="false"))
    op.add_column("superbills", sa.Column("last_pdf_generated_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("superbills", sa.Column("pdf_generation_count", sa.Integer, nullable=False, server_default="0"))

    # Extend superbill_line_items
    op.add_column("superbill_line_items", sa.Column("is_fee_overridden", sa.Boolean, nullable=False, server_default="false"))
    op.add_column("superbill_line_items", sa.Column("fee_source", sa.String(20), nullable=False, server_default="base_rate"))

    # Add new audit action enum values
    op.execute("ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'create_insurance'")
    op.execute("ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'update_insurance'")
    op.execute("ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'delete_insurance'")
    op.execute("ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'generate_pdf'")


def downgrade() -> None:
    op.drop_column("superbill_line_items", "fee_source")
    op.drop_column("superbill_line_items", "is_fee_overridden")
    op.drop_column("superbills", "pdf_generation_count")
    op.drop_column("superbills", "last_pdf_generated_at")
    op.drop_column("superbills", "is_self_pay")
    op.drop_column("superbills", "billed_payer_id")
    op.drop_table("patient_insurance")
    op.drop_table("fee_schedule_items")
    op.drop_table("insurance_payers")
```

**Extend `backend/seed_db.py`** — add before the final `session.commit()`:
```python
from backend.db.models.tenant.clinical import InsurancePayer, FeeScheduleItem
from decimal import Decimal
import uuid as _uuid

if not session.execute(select(InsurancePayer).where(InsurancePayer.tenant_id == tenant.id)).first():
    CA_PAYERS = [
        {"name": "VSP Vision Care", "payer_id": "VSP001"},
        {"name": "EyeMed Vision Care", "payer_id": "EYEMED"},
        {"name": "Davis Vision", "payer_id": "DAVIS"},
        {"name": "Medicare Part B", "payer_id": "MEDICAREB"},
        {"name": "Medi-Cal", "payer_id": "MEDCAL"},
        {"name": "Aetna", "payer_id": "AETNA"},
        {"name": "Blue Shield of California", "payer_id": "BLUESHIELD"},
        {"name": "Anthem Blue Cross CA", "payer_id": "ANTHEM"},
        {"name": "United Healthcare", "payer_id": "UHC"},
        {"name": "Humana", "payer_id": "HUMANA"},
    ]
    for p in CA_PAYERS:
        session.add(InsurancePayer(id=_uuid.uuid4(), tenant_id=tenant.id, **p))
    session.flush()

    CPT_CATALOG_SEED = [
        ("92002", "Medical examination new patient, intermediate", Decimal("120.00")),
        ("92004", "Medical examination new patient, comprehensive", Decimal("175.00")),
        ("92012", "Medical examination established patient, intermediate", Decimal("95.00")),
        ("92014", "Medical examination established patient, comprehensive", Decimal("150.00")),
        ("92015", "Determination of refractive state", Decimal("45.00")),
        ("92025", "Computerized corneal topography", Decimal("65.00")),
        ("92081", "Visual field examination, limited", Decimal("55.00")),
        ("92082", "Visual field examination, intermediate", Decimal("75.00")),
        ("92083", "Visual field examination, extended", Decimal("95.00")),
        ("92134", "Scanning computerized ophthalmic imaging (OCT)", Decimal("120.00")),
        ("92250", "Fundus photography", Decimal("85.00")),
    ]
    for cpt, desc, fee in CPT_CATALOG_SEED:
        session.add(FeeScheduleItem(
            id=_uuid.uuid4(), tenant_id=tenant.id, payer_id=None,
            cpt_code=cpt, description=desc, fee=fee
        ))
```

**Extend `types/billing.ts`** — append at the bottom (do NOT remove CPT_CATALOG or existing exports):
```typescript
export interface InsurancePayer {
  id: string;
  name: string;
  payer_id: string | null;
  phone: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PatientInsurance {
  id: string;
  patient_id: string;
  payer_id: string;
  payer?: InsurancePayer;
  priority: "primary" | "secondary";
  plan_type: "medical" | "vision" | "other";
  subscriber_id: string | null;
  group_number: string | null;
  plan_name: string | null;
  relationship_to_subscriber: "self" | "spouse" | "child" | "other";
  subscriber_name: string | null;
  subscriber_dob: string | null;
}

export interface FeeScheduleItem {
  id: string;
  payer_id: string | null; // null = base catalog
  cpt_code: string;
  description: string;
  fee: number;
}

export interface PatientSuperbillSummary {
  id: string;
  encounter_id: string;
  encounter_date: string;
  claim_status: ClaimStatus;
  total_fee: number;
  mdm_level: string | null;
  suggested_em_code: string | null;
  cpt_codes: string[];
}
```

Also extend the existing `Superbill` interface to add:
- `billed_payer_id: string | null`
- `is_self_pay: boolean`
- `billed_payer?: InsurancePayer`
- `last_pdf_generated_at: string | null`
- `pdf_generation_count: number`

And extend `SuperbillLineItem` interface to add:
- `is_fee_overridden: boolean`
- `fee_source: "payer_rate" | "base_rate" | "manual"`

## Verify
```bash
cd C:/Users/duytr/Projects/clarityos && python -c "from backend.db.models.tenant.clinical import InsurancePayer, FeeScheduleItem, PatientInsurance; print('ORM models OK')"
```
Then run migration:
```bash
cd C:/Users/duytr/Projects/clarityos/backend && PYTHONPATH=C:/Users/duytr/Projects/clarityos python -m alembic upgrade head 2>&1 | tail -5
```
Then TypeScript:
```bash
npx tsc --noEmit 2>&1 | grep -c "error TS" || echo "0"
```

## Done When
- All 3 new ORM models importable without errors
- `alembic upgrade head` applies cleanly (no errors)
- `npx tsc --noEmit` shows 0 TS errors
- `types/billing.ts` exports `InsurancePayer`, `PatientInsurance`, `FeeScheduleItem`, `PatientSuperbillSummary`
- `Superbill` interface has `billed_payer_id`, `is_self_pay`, `last_pdf_generated_at`, `pdf_generation_count`
- `SuperbillLineItem` interface has `is_fee_overridden`, `fee_source`

## Commit
```
feat(claims-db): add insurance payer models and 0008 migration
```
