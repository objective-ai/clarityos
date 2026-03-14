# Phase 9: Claims Basics - Research

**Researched:** 2026-03-14
**Domain:** Insurance billing infrastructure — payer management, patient insurance records, fee schedules, CMS-1500 PDF generation
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Payer management as new Admin panel tab (alongside Staff, Branding, Compliance)
- Essential payer fields: name, payer ID, phone, address, active/inactive toggle
- No electronic payer ID yet — deferred to clearinghouse integration (V3-01)
- Pre-seed ~10 common California payers (VSP, EyeMed, Davis Vision, Medicare, Medi-Cal, etc.)
- Admin + Owner roles only for payer CRUD
- New "Insurance" tab on patient detail page — replaces existing single-insurance card
- Primary + secondary insurance slots (two records max)
- Dedicated PatientInsurance DB table with FK to InsurancePayer (not JSONB)
- Plan type field per insurance record: Medical / Vision / Other
- Standard billing fields: Payer, Plan type, Subscriber ID, Group number, Plan name, Relationship to subscriber, Subscriber name + DOB
- No JSONB insurance data to migrate — greenfield
- Per-payer fee overrides on top of base fee catalog
- Base fee catalog moved from hardcoded CPT_CATALOG to FeeScheduleItem DB table
- Seed base fees from current CPT_CATALOG values
- No effective dates — single active fee per payer-CPT pair
- Fee management nested under payer detail in admin panel
- Payer selection prompt at superbill creation (modal/prompt): lists patient's saved plans by type
- Self-pay always available as an option
- Instant fee lookup on payer selection; fallback to base fee with visual indicator
- Change payer with recalculation; manual fee overrides are locked/preserved
- Simple total only — no copay/coinsurance breakdown
- CMS-1500 PDF: clean professional layout (NOT red government form replica)
- Server-side generation using reportlab (Python) — FastAPI endpoint returns binary PDF
- Download button from both billing dashboard row AND encounter superbill view
- Downloading PDF does NOT auto-transition claim status
- Superbill must be in "ready_to_bill" or later status to generate PDF
- New "Billing" tab on patient detail page
- New GET /api/patients/{id}/superbills endpoint
- Table view: Date | Status badge | E&M code | CPT codes | Total amount
- Existing ClaimStatus enum covers all states — no changes needed
- Status transitions remain manual — no automated workflow

### Claude's Discretion
- Exact payer seed data (which CA payers to include)
- Base fee catalog admin UI layout
- CMS-1500 PDF visual design details (typography, spacing, clinic logo inclusion)
- Exact reportlab layout implementation details
- Fee override visual indicator design (asterisk vs highlight vs icon)
- Payer selection prompt UI design (modal vs inline dropdown vs popover)

### Deferred Ideas (OUT OF SCOPE)
- Copay/coinsurance/patient responsibility breakdown (V3 with ERA/EOB integration)
- Auto-suggest insurance based on visit type
- Electronic payer ID / clearinghouse integration (V3-01)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INS-01 | New DB models: InsurancePayer, FeeScheduleItem, PatientInsurance | SQLAlchemy pattern confirmed; see Architecture Patterns |
| INS-02 | Extend Superbill with payer FK and fee_override_source field | ORM extension pattern confirmed; migration 0008_claims_basics |
| INS-03 | Admin Payers tab: CRUD payers with fee schedule management | Admin tab pattern identical to Staff tab in admin/page.tsx |
| INS-04 | Patient Insurance tab: primary/secondary insurance capture | Patient detail tab pattern confirmed in patients/[patientId]/page.tsx |
| INS-05 | Fee lookup at superbill creation: payer-specific + base fallback | billing_service.py extension pattern identified |
| INS-06 | CMS-1500 PDF generation: FastAPI endpoint + reportlab | reportlab 4.4.10 confirmed installed; PDF response pattern documented |
| INS-07 | Patient Billing/Claims tab: superbill list per patient | New FastAPI endpoint + BFF route pattern confirmed |
</phase_requirements>

---

## Summary

Phase 9 extends the existing Phase 4 superbill system with insurance infrastructure. The codebase has solid foundations: the `Superbill` ORM model already has `patient_id` and `encounter_id` FKs, `ClaimStatus` enum covers all required states, and `billing_service.py` contains the CPT catalog that will be migrated to the database. The primary new work is three new DB tables (InsurancePayer, FeeScheduleItem, PatientInsurance), extending Superbill with a payer FK, and building three new UI surfaces (admin Payers tab, patient Insurance tab, patient Billing tab).

The CMS-1500 PDF generation is a backend-only concern: `reportlab 4.4.10` is already installed in the Python environment. The existing `lib/utils/cms1500.ts` builds a JSON claim object — the new PDF endpoint reads that same data and renders it via reportlab, returning `application/pdf` binary. The current `downloadCms1500Json()` in cms1500.ts should remain but a new download-PDF BFF route will be added.

The fee schedule design — per-payer overrides with base catalog fallback — is a straightforward lookup pattern. Fee resolution logic belongs in `billing_service.py` as a new pure function, following the existing pattern where billing service has no FastAPI or DB dependencies for its core logic. The Zustand billing store will need new payer-selection state to drive the creation prompt flow.

**Primary recommendation:** Build in dependency order — DB models + migration first, then backend routes, then frontend stores + UI. The payer selection flow at superbill creation is the most complex new interaction; design the state machine for that flow before building the UI.

---

## Standard Stack

### Core (all already in project)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| SQLAlchemy (async) | Project standard | New ORM models | Use existing `Enum(enum_class)` wrapper — `native_enum=False` |
| Alembic | Project standard | Migration 0008_claims_basics | DO blocks for idempotent operations |
| FastAPI | Project standard | New payer, insurance, fee, PDF routes | Register in `backend/main.py` |
| Pydantic v2 | Project standard | New schemas in `backend/schemas/billing.py` | Extend existing file |
| reportlab | 4.4.10 (installed) | CMS-1500 PDF generation | Server-side only; returns `Response(content=pdf_bytes, media_type="application/pdf")` |
| Zustand 4.5 | Project standard | New payerStore + billing store extensions | Use devtools + selectors pattern |
| shadcn/ui | Project standard | Dialog, Table, Badge, Button | Admin tab = same components as Staff tab |
| Tailwind 3.4 | Project standard | Glassmorphism UI | Use existing glass-card classes |

### New BFF Routes Needed
| BFF Route | FastAPI Upstream | Method(s) |
|-----------|-----------------|-----------|
| `app/api/payers/route.ts` | `GET/POST /api/payers/` | GET, POST |
| `app/api/payers/[payerId]/route.ts` | `GET/PATCH/DELETE /api/payers/{id}/` | GET, PATCH, DELETE |
| `app/api/payers/[payerId]/fee-schedule/route.ts` | `GET/PUT /api/payers/{id}/fee-schedule/` | GET, PUT |
| `app/api/fee-catalog/route.ts` | `GET/PUT /api/fee-catalog/` | GET, PUT |
| `app/api/patients/[patientId]/insurance/route.ts` | `GET/POST /api/patients/{id}/insurance/` | GET, POST |
| `app/api/patients/[patientId]/insurance/[insuranceId]/route.ts` | `PATCH/DELETE /api/patients/{id}/insurance/{iid}/` | PATCH, DELETE |
| `app/api/patients/[patientId]/superbills/route.ts` | `GET /api/patients/{id}/superbills/` | GET |
| `app/api/encounters/[encounterId]/superbill/pdf/route.ts` | `GET /api/encounters/{id}/superbill/pdf/` | GET |

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
backend/
├── api/routes/
│   ├── payer.py              # InsurancePayer CRUD + fee schedule endpoints
│   └── patient_insurance.py  # PatientInsurance CRUD
├── schemas/
│   └── billing.py            # EXTEND: add payer/insurance/fee schemas + PatientSuperbillSummary
├── services/
│   └── billing_service.py    # EXTEND: add resolve_line_item_fee(), build_pdf_claim()
├── alembic/versions/
│   └── 0008_claims_basics.py # New migration

app/api/
├── payers/
│   ├── route.ts
│   └── [payerId]/
│       ├── route.ts
│       └── fee-schedule/route.ts
├── fee-catalog/route.ts
├── patients/[patientId]/
│   ├── insurance/
│   │   ├── route.ts
│   │   └── [insuranceId]/route.ts
│   └── superbills/route.ts
└── encounters/[encounterId]/superbill/pdf/route.ts

store/
└── payerStore.ts             # NEW: payer list + patient insurance state

types/
└── billing.ts                # EXTEND: InsurancePayer, PatientInsurance, FeeScheduleItem types

components/
├── billing/
│   └── PayerSelectionModal.tsx  # Payer selection at superbill creation
└── patient/
    ├── InsuranceTab.tsx          # Primary/secondary insurance cards
    └── PatientBillingTab.tsx     # Superbill list on patient detail

app/(tenant)/[tenant]/
├── admin/page.tsx            # EXTEND: add "payers" tab
└── patients/[patientId]/page.tsx  # EXTEND: add "insurance" + "billing" tabs
```

### Pattern 1: New ORM Models (follow existing clinical.py conventions)

**What:** Three new SQLAlchemy models in `backend/db/models/tenant/clinical.py`
**When to use:** All new models live in this file; TenantBase + TimestampMixin

```python
# Source: clinical.py — existing pattern

class InsurancePayer(TimestampMixin, TenantBase):
    __tablename__ = "insurance_payers"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    payer_id: Mapped[str | None] = mapped_column(String(50), nullable=True)  # routing ID
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    fee_items: Mapped[list["FeeScheduleItem"]] = relationship(
        "FeeScheduleItem", back_populates="payer", cascade="all, delete-orphan"
    )


class FeeScheduleItem(TimestampMixin, TenantBase):
    """Per-payer CPT fee override. NULL payer_id = base catalog."""
    __tablename__ = "fee_schedule_items"
    __table_args__ = (
        UniqueConstraint("tenant_id", "payer_id", "cpt_code", name="uq_fee_payer_cpt"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    payer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("insurance_payers.id", ondelete="CASCADE"), nullable=True
    )  # NULL = base fee catalog entry
    cpt_code: Mapped[str] = mapped_column(String(10), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    payer: Mapped["InsurancePayer | None"] = relationship("InsurancePayer", back_populates="fee_items")


class PatientInsurance(TimestampMixin, TenantBase):
    __tablename__ = "patient_insurance"
    __table_args__ = (
        CheckConstraint("priority IN ('primary', 'secondary')", name="ck_insurance_priority"),
        UniqueConstraint("patient_id", "priority", name="uq_patient_insurance_priority"),
    )
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
    subscriber_dob: Mapped[str | None] = mapped_column(Date, nullable=True)
    payer: Mapped["InsurancePayer"] = relationship("InsurancePayer")
    patient: Mapped["Patient"] = relationship("Patient")
```

### Pattern 2: Superbill Extension

**What:** Add `payer_id` FK and `billed_payer_id` to Superbill; add `fee_override` flag to SuperbillLineItem
**When to use:** Alembic migration adds columns with defaults; no data loss

New Superbill columns:
- `billed_payer_id: UUID | None` — FK to insurance_payers (nullable for self-pay)
- `is_self_pay: bool` — true when no payer selected

New SuperbillLineItem columns:
- `is_fee_overridden: bool` — true when staff manually edited fee (preserved on payer change)
- `fee_source: str` — "payer_rate" | "base_rate" | "manual" (for visual indicator)

### Pattern 3: Fee Resolution Service Function

**What:** Pure function in `billing_service.py` to resolve fee for a CPT code given a payer
**When to use:** Called at superbill creation (pre-fill) and on payer change (recalculate)

```python
# Source: billing_service.py pattern — pure function, no FastAPI/DB deps
async def resolve_line_item_fee(
    cpt_code: str,
    payer_id: uuid.UUID | None,
    tenant_id: uuid.UUID,
    db: AsyncSession,
) -> tuple[Decimal, str]:
    """Returns (fee, fee_source) where fee_source is 'payer_rate'|'base_rate'."""
    if payer_id:
        # Try payer-specific rate first
        payer_fee = await db.execute(
            select(FeeScheduleItem).where(
                FeeScheduleItem.payer_id == payer_id,
                FeeScheduleItem.cpt_code == cpt_code,
                FeeScheduleItem.tenant_id == tenant_id,
            )
        )
        item = payer_fee.scalar_one_or_none()
        if item:
            return item.fee, "payer_rate"
    # Fallback to base catalog (payer_id IS NULL)
    base = await db.execute(
        select(FeeScheduleItem).where(
            FeeScheduleItem.payer_id == None,
            FeeScheduleItem.cpt_code == cpt_code,
            FeeScheduleItem.tenant_id == tenant_id,
        )
    )
    base_item = base.scalar_one_or_none()
    if base_item:
        return base_item.fee, "base_rate"
    return Decimal("0.00"), "base_rate"
```

**NOTE:** `resolve_line_item_fee` needs `db` access (unlike existing pure functions). It must be `async` and called from the route handler, not from `billing_service.py` directly. Place it in a new `services/fee_service.py` or as an async helper inside `billing.py`.

### Pattern 4: CMS-1500 PDF Generation (reportlab)

**What:** FastAPI endpoint returns binary PDF; client triggers file download
**When to use:** GET `/api/encounters/{id}/superbill/pdf/` — requires `ready_to_bill` or later

```python
# Source: reportlab 4.4.10 installed — confirmed via pip show
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet
from fastapi.responses import Response

@router.get("/{encounter_id}/superbill/pdf")
async def generate_superbill_pdf(
    encounter_id: str,
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    # ... fetch superbill, validate status, build PDF
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    # Build story with Paragraph + Table elements
    doc.build(story)
    pdf_bytes = buffer.getvalue()
    filename = f"claim-{encounter_id[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
```

The BFF route for PDF must NOT use `proxyToFastAPI()` directly — it needs to stream binary. Use a raw `fetch()` in the BFF route and return the binary response.

### Pattern 5: Alembic Migration for New Tables

**What:** New migration file `0008_claims_basics.py`
**When to use:** After all ORM models are defined; follow DO block pattern for idempotency

```python
# Source: 0003_billing.py pattern
revision: str = "0008_claims_basics"
down_revision: Union[str, None] = "0007_appt_finalized"

def upgrade() -> None:
    # Create insurance_payers table
    op.create_table("insurance_payers", ...)
    # Create fee_schedule_items table (payer_id nullable = base catalog)
    op.create_table("fee_schedule_items", ...)
    # Create patient_insurance table
    op.create_table("patient_insurance", ...)
    # Add columns to superbills
    op.add_column("superbills", sa.Column("billed_payer_id", UUID, nullable=True))
    op.add_column("superbills", sa.Column("is_self_pay", sa.Boolean, nullable=False, server_default="false"))
    # Add columns to superbill_line_items
    op.add_column("superbill_line_items", sa.Column("is_fee_overridden", sa.Boolean, nullable=False, server_default="false"))
    op.add_column("superbill_line_items", sa.Column("fee_source", sa.String(20), nullable=False, server_default="base_rate"))
    # Add billing AuditAction values
    op.execute("ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'create_insurance'")
    op.execute("ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'update_insurance'")
    op.execute("ALTER TYPE audit_action_enum ADD VALUE IF NOT EXISTS 'generate_pdf'")
```

### Pattern 6: Payer Selection at Superbill Creation

**What:** Modal that fires before superbill creation, selects payer, then creates superbill with payer pre-loaded
**When to use:** Triggered by "Create Superbill" button in billing view

Flow:
1. Frontend calls `GET /api/patients/{patientId}/insurance` to get patient's insurance plans
2. Modal shows: "Primary Medical: Aetna", "Vision: VSP", "Self-Pay"
3. Staff selects payer → frontend calls `POST /api/encounters/{id}/superbill` with `{ billed_payer_id: uuid, is_self_pay: false }`
4. Backend's `create_superbill` calls `resolve_line_item_fee()` for each suggested CPT, stores `fee_source` on each line item
5. Response includes line items with `fee_source` field → frontend shows asterisk/indicator on "base_rate" items

State in `billingStore.ts`:
- Add `payerSelectionState: "idle" | "selecting" | "selected"` and `selectedPayerId: string | null`
- `PayerSelectionModal` reads from patient insurance store, not billing store

### Anti-Patterns to Avoid

- **Do not modify the existing ClaimStatus enum** — it already covers all required states
- **Do not use JSONB for PatientInsurance** — the decision is a dedicated relational table
- **Do not call `db.refresh()` after async operations** — use `selectinload` re-fetch (existing project rule)
- **Do not store effective dates on FeeScheduleItem** — single active fee per payer-CPT pair, admin updates when rates change
- **Do not auto-transition claim status on PDF download** — download is decoupled from status
- **Do not use `downloadCms1500Json()` for PDFs** — keep it for the existing JSON export; PDF is a new server-side endpoint
- **Do not proxyToFastAPI for the PDF BFF route** — binary response requires raw fetch forwarding

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PDF generation | Custom HTML-to-PDF renderer | reportlab (already installed v4.4.10) | reportlab is the Python standard for programmatic PDFs; handles layout, tables, fonts |
| Fee cascade/inheritance | Custom hierarchy resolver | Simple two-query pattern (payer-specific → base catalog) | The schema already makes this a straightforward nullable FK lookup |
| Insurance form validation | Custom field validators | Pydantic `field_validator` (existing pattern in billing.py) | Re-use `ICD10_PATTERN` approach for field-level validation |
| Status badge colors | New design system | Copy `STATUS_STYLES` from `billing/page.tsx` | Already defined for draft/submitted/accepted/rejected |
| Admin tab pattern | New tab infrastructure | Clone existing `SectionKey` pattern in `admin/page.tsx` | Admin already has tabs for general/staff/compliance/demo |

**Key insight:** The fee schedule is not a complex pricing engine — it is a two-level lookup (payer rate → base rate). Any attempt to add effective dates, tiered pricing, or rule-based resolution belongs in V3 with ERA/EOB integration.

---

## Common Pitfalls

### Pitfall 1: Seeding Base Fee Catalog Per-Tenant vs. Global
**What goes wrong:** Fee catalog is seeded globally (no tenant_id) and breaks multi-tenant isolation
**Why it happens:** `CPT_CATALOG` in `billing_service.py` is currently a static dict — no tenant concept
**How to avoid:** `FeeScheduleItem` with `payer_id=NULL` uses the same `tenant_id` column as all other tables. Seed the base fee catalog rows with the demo tenant's `tenant_id`. Each new tenant gets their own base catalog seeded on provisioning.
**Warning signs:** 500 errors when a second tenant tries to create a superbill with no fee data

### Pitfall 2: pdf BFF Binary Response
**What goes wrong:** `proxyToFastAPI()` returns a JSON error instead of binary PDF
**Why it happens:** `proxyToFastAPI()` is designed for JSON; content-type negotiation may strip binary
**How to avoid:** The PDF BFF route must use raw `fetch()` with Supabase auth token, then return `new NextResponse(body, { headers: { "Content-Type": "application/pdf", ... } })`
**Warning signs:** PDF download triggers a JSON parse error or downloads a 0-byte file

### Pitfall 3: UniqueConstraint on patient_insurance priority
**What goes wrong:** Staff can add two "primary" insurance records for the same patient
**Why it happens:** Without a DB constraint, application-level enforcement can be bypassed
**How to avoid:** `UniqueConstraint("patient_id", "priority")` in the ORM model + migration. When staff updates to primary, check if primary already exists and either update in place or reject.
**Warning signs:** Patient has two "primary" insurance records; superbill payer selection shows duplicates

### Pitfall 4: Re-fetching After flush() on New Models
**What goes wrong:** `MissingGreenlet` error when accessing relationships on newly flushed ORM objects
**Why it happens:** Project rule — `db.refresh()` is unsafe in async context (noted in CLAUDE.md and MEMORY.md)
**How to avoid:** After `db.flush()` on InsurancePayer/PatientInsurance, use `selectinload` re-fetch. Same pattern as `create_superbill` in `billing.py` (lines 261-267)
**Warning signs:** `MissingGreenlet` traceback in FastAPI logs

### Pitfall 5: CPT_CATALOG in billing_service.py Becoming Stale
**What goes wrong:** Old hardcoded `CPT_CATALOG` dict is still used for fee suggestions after migration to DB
**Why it happens:** `suggest_line_items()` in `billing_service.py` uses the hardcoded dict for fees
**How to avoid:** After seeding `FeeScheduleItem`, update `suggest_line_items()` to accept fees as a parameter. The calling route handler looks up fees from DB and passes them in.
**Warning signs:** Superbill line items show old hardcoded fees even after admin updates fee catalog

### Pitfall 6: Decimal Serialization in PDF
**What goes wrong:** reportlab fails on SQLAlchemy `Decimal` types
**Why it happens:** Pydantic serializes `Decimal` as `float` for JSON but ORM objects carry raw `Decimal`
**How to avoid:** Always call `float(item.fee)` or `str(item.fee)` before passing to reportlab. Pattern in `billing.py`: `_build_superbill_response` already converts via `LineItemResponse(fee=li.fee, ...)` where Pydantic schema has `fee: float`
**Warning signs:** `TypeError: can't convert Decimal to float` in PDF generation

### Pitfall 7: AuditAction enum ALTER TYPE timing
**What goes wrong:** New AuditAction values (`create_insurance`, `generate_pdf`) cause `LookupError` if migration hasn't run
**Why it happens:** AuditLog stores action as VARCHAR(50) in code, but `audit_action_enum` PostgreSQL type must include values before Alembic can add them
**How to avoid:** Add `IF NOT EXISTS` to all `ALTER TYPE audit_action_enum ADD VALUE` statements in migration (already the project pattern in 0003_billing.py)
**Warning signs:** 500 error on first payer create; `LookupError: audit_action_enum has no value 'create_insurance'`

---

## Code Examples

### CMS-1500 PDF Binary BFF Route (do NOT use proxyToFastAPI)

```typescript
// app/api/encounters/[encounterId]/superbill/pdf/route.ts
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

const FASTAPI_URL = process.env.FASTAPI_URL ?? "http://127.0.0.1:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: { encounterId: string } },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const upstream = `${FASTAPI_URL}/api/encounters/${params.encounterId}/superbill/pdf/`;
  const res = await fetch(upstream, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "PDF generation failed" }));
    return NextResponse.json(err, { status: res.status });
  }
  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="claim-${params.encounterId.slice(0, 8)}.pdf"`,
    },
  });
}
```

### Fee Catalog Seeding Pattern (in seed_db.py)

```python
# Base fee catalog — payer_id=None means "base rate"
CPT_CATALOG_SEED = [
    {"cpt_code": "92004", "description": "Comprehensive new patient eye exam", "fee": Decimal("250.00")},
    {"cpt_code": "92014", "description": "Comprehensive established patient eye exam", "fee": Decimal("175.00")},
    {"cpt_code": "92002", "description": "Intermediate new patient eye exam", "fee": Decimal("150.00")},
    {"cpt_code": "92012", "description": "Intermediate established patient eye exam", "fee": Decimal("100.00")},
    {"cpt_code": "99213", "description": "Office visit E&M Level 3", "fee": Decimal("110.00")},
    {"cpt_code": "99214", "description": "Office visit E&M Level 4", "fee": Decimal("165.00")},
    {"cpt_code": "99215", "description": "Office visit E&M Level 5", "fee": Decimal("225.00")},
    {"cpt_code": "92015", "description": "Refraction", "fee": Decimal("45.00")},
    {"cpt_code": "92083", "description": "Visual field test", "fee": Decimal("85.00")},
    {"cpt_code": "92250", "description": "Fundus photography", "fee": Decimal("65.00")},
    {"cpt_code": "92134", "description": "OCT retina scan", "fee": Decimal("75.00")},
]
for entry in CPT_CATALOG_SEED:
    session.add(FeeScheduleItem(
        tenant_id=tenant.id, payer_id=None, **entry
    ))
```

### California Payers Seed Data

```python
CA_PAYERS = [
    {"name": "VSP Vision Care", "payer_id": "39026", "phone": "800-852-7600"},
    {"name": "EyeMed Vision Care", "payer_id": "62308", "phone": "866-939-3633"},
    {"name": "Davis Vision", "payer_id": "04213", "phone": "800-999-5431"},
    {"name": "Medicare Part B", "payer_id": "01112", "phone": "800-633-4227"},
    {"name": "Medi-Cal (DHCS)", "payer_id": "68069", "phone": "916-552-9200"},
    {"name": "Aetna", "payer_id": "60054", "phone": "800-872-3862"},
    {"name": "Blue Shield of California", "payer_id": "94333", "phone": "800-642-5599"},
    {"name": "Anthem Blue Cross CA", "payer_id": "00831", "phone": "800-676-2583"},
    {"name": "United Healthcare", "payer_id": "87726", "phone": "800-328-5979"},
    {"name": "Humana", "payer_id": "61101", "phone": "800-448-6262"},
]
```

### reportlab PDF Generation Pattern

```python
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

def build_superbill_pdf(superbill_data: dict, patient_data: dict, payer_data: dict | None) -> bytes:
    """Returns raw PDF bytes. All inputs are plain dicts (no ORM objects)."""
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=letter,
        leftMargin=0.75*inch, rightMargin=0.75*inch,
        topMargin=0.75*inch, bottomMargin=0.75*inch,
    )
    styles = getSampleStyleSheet()
    story = []
    # Header: clinic name + NPI
    # Patient/payer info block
    # Service lines table
    # Total
    doc.build(story)
    return buffer.getvalue()
```

### PatientSuperbillSummary Pydantic Schema

```python
# Add to backend/schemas/billing.py
class PatientSuperbillSummary(AppBaseModel):
    """Lightweight superbill summary for patient Billing tab."""
    id: uuid.UUID
    encounter_id: uuid.UUID
    encounter_date: str  # ISO date
    claim_status: str
    total_fee: float
    mdm_level: str | None = None
    suggested_em_code: str | None = None
    cpt_codes: list[str]
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `downloadCms1500Json()` — client-side JSON export | `GET .../superbill/pdf` — server-side PDF via reportlab | PDF is professional-grade; JSON export remains for clearinghouse (V3) |
| Hardcoded `CPT_CATALOG` dict in billing_service.py | `FeeScheduleItem` DB table with per-payer overrides | Admins can update fees without code deploys |
| Single-plan JSONB insurance in patient contact_info_jsonb | Dedicated `PatientInsurance` relational table with primary/secondary | Enables proper FK references, payer selection, CMS-1500 box population |
| No payer selection at superbill creation | Payer selection modal pre-fills fees at creation time | Correct fees from the start; less manual correction |

**Currently hardcoded (will be replaced):**
- `CPT_CATALOG` in `backend/services/billing_service.py` — replaced by `FeeScheduleItem` DB queries
- `CPT_CATALOG` in `types/billing.ts` — replaced by API data from `GET /api/fee-catalog/`; keep the constant as fallback for existing CMS-1500 JSON builder until fee catalog API is available

---

## Open Questions

1. **Patient detail existing insurance JSONB**
   - What we know: `contact_info_jsonb` in `Patient` model can hold arbitrary data; Phase 5 stored insurance there
   - What's unclear: Is there any existing JSONB insurance data to avoid showing stale info on the new Insurance tab?
   - Recommendation: CONTEXT.md confirms "No existing JSONB insurance data to migrate — greenfield." Safe to ignore JSONB. The new Insurance tab reads only from `PatientInsurance` table.

2. **Clinic NPI for PDF header**
   - What we know: `Staff.npi_number` holds provider NPI; tenant settings exist via `/api/tenant/settings/`
   - What's unclear: Is there a clinic-level NPI in tenant settings?
   - Recommendation: For MVP, use provider NPI from superbill's `provider_id`. Read `tenant.settings_jsonb` for clinic name/address. If clinic NPI is absent, leave blank with placeholder text.

3. **Fee catalog admin — base rate vs. payer override UX**
   - What we know: Fee management is nested under payer detail; separate section for base catalog
   - What's unclear: Should base catalog be editable per-tenant or read-only (only payer overrides editable)?
   - Recommendation: Make base catalog editable — it's seeded but tenant should be able to update. Same table (FeeScheduleItem with payer_id=NULL), same CRUD endpoints.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (configured, globals mode, jsdom env) |
| Config file | `vitest.config.ts` (project root) |
| Quick run command | `npx vitest run tests/unit/lib/feeService.test.ts tests/unit/store/payerStore.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INS-01 | ORM models compile + migration applies | Integration (manual Alembic) | `python -m alembic upgrade head` | ❌ Wave 0 (migration file) |
| INS-02 | Superbill creation with payer_id sets fee_source correctly | Unit | `npx vitest run tests/unit/lib/feeService.test.ts` | ❌ Wave 0 |
| INS-03 | Admin payer CRUD renders + saves | Manual smoke | `bash scripts/dev.sh verify tests/e2e/verify-payers-admin.js` | ❌ Wave 0 |
| INS-04 | Patient insurance tab shows primary/secondary cards | Manual smoke | `bash scripts/dev.sh verify tests/e2e/verify-patient-insurance.js` | ❌ Wave 0 |
| INS-05 | `resolve_line_item_fee` returns payer rate when available, base rate fallback | Unit (Python pytest) | `pytest backend/tests/test_fee_service.py -x` | ❌ Wave 0 |
| INS-06 | PDF endpoint returns `application/pdf` binary with correct headers | Integration (manual) | `bash scripts/dev.sh check-api && curl -I .../superbill/pdf` | ❌ Wave 0 |
| INS-07 | Patient billing tab lists superbills with correct status badges | Manual smoke | `bash scripts/dev.sh verify tests/e2e/verify-patient-billing.js` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/lib/ tests/unit/store/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/lib/feeService.test.ts` — covers INS-02, INS-05 (TS side)
- [ ] `backend/tests/test_fee_service.py` — covers INS-05 (Python side: payer rate resolution)
- [ ] `tests/unit/store/payerStore.test.ts` — covers payer list + insurance state
- [ ] `backend/alembic/versions/0008_claims_basics.py` — covers INS-01
- [ ] No new test framework install needed — vitest + pytest both already configured

---

## Sources

### Primary (HIGH confidence)
- Direct code inspection: `backend/db/models/tenant/clinical.py` — ORM patterns, existing Superbill/SuperbillLineItem models
- Direct code inspection: `backend/api/routes/billing.py` — route patterns, selectinload re-fetch pattern
- Direct code inspection: `backend/services/billing_service.py` — CPT_CATALOG values to migrate
- Direct code inspection: `backend/main.py` — router registration pattern
- Direct code inspection: `backend/alembic/versions/0003_billing.py` — migration pattern, AuditAction ALTER TYPE
- Direct code inspection: `backend/core/permissions.py` — MANAGE_BILLING permission for admin+owner
- Direct code inspection: `vitest.config.ts` — test infrastructure confirmed
- `pip show reportlab` — reportlab 4.4.10 confirmed installed
- Direct code inspection: `types/billing.ts` — CPT_CATALOG values (11 codes with fees)
- Direct code inspection: `app/api/encounters/[encounterId]/superbill/route.ts` — BFF proxy pattern
- Direct code inspection: `lib/bff.ts` — proxyToFastAPI helper; binary limitation confirmed

### Secondary (MEDIUM confidence)
- Direct code inspection: `app/(tenant)/[tenant]/admin/page.tsx` — tab pattern (SectionKey type + SECTIONS array) to clone for Payers tab
- Direct code inspection: `app/(tenant)/[tenant]/patients/[patientId]/page.tsx` — TabKey type + tab pattern to extend for Insurance/Billing tabs
- Direct code inspection: `app/(tenant)/[tenant]/billing/page.tsx` — STATUS_STYLES to reuse on patient Billing tab
- Direct code inspection: `backend/schemas/billing.py` — AppBaseModel usage, field validators pattern

### Tertiary (LOW confidence)
- None — all critical claims verified from codebase inspection

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed installed and in use
- Architecture: HIGH — all patterns verified against existing code
- Pitfalls: HIGH — sourced from project rules (CLAUDE.md + MEMORY.md) + code inspection
- Seed data (CA payers): MEDIUM — payer IDs are approximations; admin can correct via UI

**Research date:** 2026-03-14
**Valid until:** 2026-04-14 (stable stack, 30-day window)
