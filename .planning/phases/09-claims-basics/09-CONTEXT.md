# Phase 9: Claims Basics - Context

**Gathered:** 2026-03-12
**Updated:** 2026-03-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable real insurance billing with payer management, patient insurance records, per-payer fee schedules, and CMS-1500 PDF generation. Extends the existing superbill system (Phase 4) with insurance infrastructure. Electronic claim submission and clearinghouse integration are out of scope (Phase V3-01).

</domain>

<decisions>
## Implementation Decisions

### Payer Management
- New tab in the Admin panel (alongside Staff, Branding, Compliance)
- Essential fields only: name, payer ID (for claims routing), phone, address, active/inactive toggle
- No electronic payer ID yet — deferred to clearinghouse integration (V3-01)
- Pre-seed ~10 common California payers (VSP, EyeMed, Davis Vision, Medicare, Medi-Cal, etc.) in database seed + manual CRUD
- Admin + Owner roles only (matches staff management pattern)

### Patient Insurance Capture
- New "Insurance" tab on the patient detail page (alongside Demographics, Encounters, Flowsheets)
- Primary + secondary insurance slots (two records max)
- Dedicated PatientInsurance DB table with FK to InsurancePayer (not JSONB)
- **Plan type field:** Each insurance record has a Plan Type dropdown (Medical / Vision / Other) — powers the labeled payer selector on superbills
- Standard billing fields per record:
  - Payer (dropdown from payer list)
  - Plan type (Medical / Vision / Other)
  - Subscriber ID (member ID)
  - Group number
  - Plan name
  - Relationship to subscriber (self/spouse/child/other)
  - Subscriber name + DOB (if different from patient)
- Sufficient for CMS-1500 Boxes 1a, 4, 7, 9, 11
- No existing JSONB insurance data to migrate — greenfield implementation

### Fee Schedule Design
- Per-payer fee overrides on top of a base fee catalog
- Base fee catalog moved from hardcoded CPT_CATALOG (TypeScript/Python) to a DB table (FeeScheduleItem)
- Seed base fees with current CPT_CATALOG values; admin can edit via UI
- If payer has a negotiated rate for a CPT code, use it; otherwise fall back to base fee
- No effective dates — single active fee per payer-CPT pair; admin updates when rates change
- Fee management nested under payer detail in admin panel (click payer → see/edit fee overrides)
- Separate admin section for base fee catalog

### Superbill-Insurance Billing Flow
- **Payer selection at creation:** When staff clicks "Create Superbill," a prompt asks "Which insurance are we billing?" listing the patient's saved plans labeled by type (e.g., "Primary Medical: Aetna", "Vision: VSP", "Self-Pay")
- **Self-pay always available:** Even if patient has no insurance on file, the prompt appears with "Self-Pay" as an option. Consistent flow regardless of insurance status.
- **Instant fee lookup:** Once payer is selected, system pulls payer-specific fees for the encounter's CPT codes and pre-fills line item fees
- **Missing payer fee fallback:** If a CPT code has no payer-specific rate, fall back to base fee catalog rate with a visual indicator (asterisk or yellow highlight) meaning "using base fee"
- **Change payer with recalculation:** Staff can change the billed payer on an existing superbill; all line item fees recalculate to the new payer's rates
- **Manual fee overrides are locked:** If staff manually edits a line item fee, that override is preserved during payer change recalculation. Visual indicator shows which fees are overridden vs payer-rate.
- **Simple total only:** Superbill shows total billed amount. No copay/coinsurance/patient responsibility breakdown — deferred to V3 with ERA/EOB integration.

### CMS-1500 PDF Generation
- Clean professional layout (NOT red government form replica) — clinic header, patient/insurance info, service lines table, totals
- Server-side generation using reportlab (Python) — FastAPI endpoint returns binary PDF
- Download button available from both billing dashboard row AND encounter superbill view
- Downloading PDF does NOT auto-transition claim status — separate manual action for status changes
- Superbill must be in "ready_to_bill" or later status to generate PDF

### Claim Status Tracking
- Existing ClaimStatus enum already covers: draft → ready_to_bill → submitted → accepted → rejected
- Status transitions remain manual actions in the billing dashboard and encounter view
- No automated submission workflow in this phase

### Claude's Discretion
- Exact payer seed data (which CA payers to include)
- Base fee catalog admin UI layout
- CMS-1500 PDF visual design details (typography, spacing, clinic logo inclusion)
- Exact reportlab layout implementation details
- Fee override visual indicator design (asterisk vs highlight vs icon)
- Payer selection prompt UI design (modal vs inline dropdown vs popover)

</decisions>

<specifics>
## Specific Ideas

- Payer management should feel like the existing Staff management tab — same glass-card table pattern, same CRUD modal pattern
- Fee schedule editing should feel spreadsheet-like — CPT code, description, base fee, payer override fee in a table
- Patient insurance tab should show primary/secondary as two distinct glass cards with clear visual hierarchy
- CMS-1500 PDF should include the clinic's logo and NPI prominently
- Insurance selection prompt at superbill creation should label plans by type: "Primary Medical: Aetna", "Vision: VSP", "Self-Pay"
- Manual fee overrides should be visually distinct from payer-rate fees (staff needs to see at a glance what was adjusted)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/db/models/tenant/clinical.py`: Superbill + SuperbillLineItem models with ClaimStatus enum — extend with insurance FKs
- `backend/api/routes/billing.py`: Full superbill CRUD, MDM calculation, CPT-ICD validation — extend with fee lookup
- `backend/api/routes/billing_list.py`: Superbill list endpoint with status/date filters
- `backend/schemas/billing.py`: Pydantic models for superbill operations — extend for payer/insurance
- `store/billingStore.ts` + `store/billingDashboardStore.ts`: Zustand stores for superbill operations
- `components/billing/SuperbillEditor.tsx`: Superbill line item editor with CptAddDropdown
- `app/(tenant)/[tenant]/billing/page.tsx`: Billing dashboard with status filters and CSV export
- `lib/utils/cms1500.ts`: CMS-1500 JSON builder + validator — PDF endpoint replaces downloadCms1500Json
- `types/billing.ts`: TypeScript types including CPT_CATALOG constant (will be replaced by API data)
- `app/(tenant)/[tenant]/admin/page.tsx`: Admin panel with tabbed layout — add Payers tab
- `app/(tenant)/[tenant]/patients/[patientId]/page.tsx`: Patient detail with tabs — add Insurance tab

### Established Patterns
- BFF proxy: `app/api/<resource>/route.ts` → `proxyToFastAPI(request, '/api/<resource>/')`
- Admin panel uses tabbed glass-card layout with role gating (admin/owner)
- Patient detail uses tabbed layout with glass cards per section
- Zustand stores: create with devtools, async fetch with loading/error/saving state
- SQLAlchemy enums stored as VARCHAR (native_enum=False)
- Alembic migrations with DO blocks for idempotent operations

### Integration Points
- `backend/api/main.py`: Register new payer, insurance, fee schedule routers
- `backend/db/models/tenant/clinical.py`: Add InsurancePayer, PatientInsurance, FeeScheduleItem models
- `backend/seed_db.py`: Add payer seed data
- Superbill creation flow: Prompt for payer → look up payer-specific fees → pre-fill line items
- CMS-1500 PDF endpoint: Read superbill + patient insurance + payer info → generate PDF with reportlab

</code_context>

<deferred>
## Deferred Ideas

- Copay/coinsurance/patient responsibility breakdown — V3 with ERA/EOB integration
- Auto-suggest insurance based on visit type (medical vs routine eye exam) — future enhancement

</deferred>

---

*Phase: 09-claims-basics*
*Context gathered: 2026-03-12*
