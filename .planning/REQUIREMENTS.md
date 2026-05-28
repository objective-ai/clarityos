# Requirements: ClarityOS EHR — MVP

**Defined:** 2026-03-05
**Core Value:** Clinicians can complete a full eye exam encounter in a workflow that feels faster than paper, with every action audited and every record tamper-proof.

## v1 Requirements

Requirements for the full MVP. Each maps to roadmap phases.

### Security & Auth

- [x] **SEC-01**: Dev auth bypass removed — backend requires valid JWT at startup, no fallback identity when SUPABASE_JWT_SECRET is empty
- [x] **SEC-02**: Hardcoded SECRET_KEY default removed — startup fails if SECRET_KEY env var is unset
- [x] **SEC-03**: Hardcoded Supabase project reference in config.py replaced with env var
- [x] **SEC-04**: User can log in with email/password via Supabase Auth on a dedicated /login page
- [x] **SEC-05**: User can log out and all ePHI is cleared from localStorage (SOAP notes, encounter data, clinical transcripts)
- [x] **SEC-06**: User session persists across browser refresh via Supabase JWT cookie
- [x] **SEC-07**: Next.js middleware protects all tenant routes — unauthenticated users redirected to /login
- [x] **SEC-08**: sessionStore hydrates from real Supabase JWT claims (role, tenant_id, entitlements) instead of mock session
- [x] **SEC-09**: Security headers added to Next.js config (CSP, X-Frame-Options, X-Content-Type-Options)
- [x] **SEC-10**: Zustand devtools disabled in production builds

### Infrastructure

- [x] **INF-01**: Python backend relocated from app/ to backend/ directory (resolves Next.js namespace conflict)
- [x] **INF-02**: Alembic initialized with async migration environment for existing SQLAlchemy models
- [x] **INF-03**: Initial Alembic migration generated from current model state (baseline migration)
- [x] **INF-04**: Next.js BFF route handler for audit log API (/api/audit-logs proxying to FastAPI)
- [x] **INF-05**: Next.js BFF route handler for AI Scribe accept endpoint (/api/ai-scribe/accept proxying to FastAPI)
- [x] **INF-06**: Supabase Custom Access Token Hook injects tenant_id and role into JWT claims

### API Integration

- [x] **API-01**: encounterStore migrated from mock data to real apiFetch() calls
- [x] **API-02**: vitalsStore migrated from mock data to real apiFetch() calls
- [x] **API-03**: refractionStore migrated from mock data to real apiFetch() calls
- [x] **API-04**: examFindingsStore migrated from mock data to real apiFetch() calls
- [x] **API-05**: diagnosisStore migrated from mock data to real apiFetch() calls
- [x] **API-06**: problemListStore migrated from mock data to real apiFetch() calls
- [x] **API-07**: Mock persona seed imports removed from all 9 production pages
- [x] **API-08**: apiFetch() updated to use Supabase session token for Authorization header

### Scheduling

- [ ] **SCHED-01**: Appointment model and Alembic migration (patient_id, provider_id, datetime, duration, status, type, notes)
- [ ] **SCHED-02**: Appointment CRUD API endpoints on FastAPI (create, read, update, cancel, list by date range)
- [ ] **SCHED-03**: Schedule page wired to real appointment data instead of mock schedule
- [ ] **SCHED-04**: Check-in workflow — appointment status transitions (scheduled -> checked_in -> in_exam -> completed)
- [ ] **SCHED-05**: Encounter creation from appointment (link appointment to new encounter)

### HIPAA Compliance

- [x] **HIPAA-01**: PHI read logging on all GET endpoints that return patient/encounter data
- [x] **HIPAA-02**: Audit trail sidebar in encounter view wired to real audit log API (currently 404s)
- [x] **HIPAA-03**: Automatic session timeout after 30 minutes of inactivity

### Billing & Coding (Revenue Engine)

- [ ] **BILL-01**: Superbill modal triggered from Finalize button — displays suggested CPT codes mapped to ICD-10 diagnoses via pointers
- [ ] **BILL-02**: billingStore (store/billingStore.ts) manages lineItems (CPT, fee, units, diagnosis pointers) and claimStatus (draft, ready_to_bill)
- [ ] **BILL-03**: CMS-1500 exporter utility (lib/utils/cms1500.ts) maps billingStore payload to standard clearinghouse JSON schema
- [ ] **BILL-04**: AI MDM Calculator — AI Scribe evaluates Medical Decision Making complexity from exam findings and problem list
- [ ] **BILL-05**: AI suggests correct E&M code (99213/99214/99215) based on MDM complexity level
- [ ] **BILL-06**: CPT-to-ICD pointer validation — system warns if CPT code lacks a supporting diagnosis

### Patient Profile (Longitudinal Record)

- [ ] **PAT-01**: Patient CRUD API endpoints on FastAPI (create, read, update, list with search)
- [ ] **PAT-02**: Patient detail page (/patients/[patientId]) with demographics, alerts, insurance, active MPPL
- [ ] **PAT-03**: Chronological encounter feed — scrolling timeline with date, provider, chief complaint, AI-generated one-paragraph visit summary
- [ ] **PAT-04**: Clinical flowsheets — data table tracking IOP and refractive changes over time
- [ ] **PAT-05**: "Prep Me" button — AI reads last 3 finalized SOAP notes and outputs 2-sentence clinical summary for pre-visit preparation

### Optical Handoff

- [ ] **OPT-01**: Optical dashboard page (/optical) — real-time queue of patients who finished exams and are ready for glasses/contacts
- [ ] **OPT-02**: Rx PDF generator (lib/utils/generateRxPdf.ts) — converts is_final_rx data to printable, legally compliant prescription with doctor signature, license number, expiration date
- [ ] **OPT-03**: opticalStore (store/opticalStore.ts) — listens to encounterStore; when encounter is finalized, pushes patient to optical queue
- [ ] **OPT-04**: Rx Change Alert — compares today's final refraction to previous year's; if spherical equivalent changes >0.50D, adds bright badge to optical queue

### Patient Intake

- [ ] **INTAKE-01**: Public intake route (/intake/[clinicId]/[appointmentToken]) — mobile-first, no auth required, secured by unique expiring token
- [ ] **INTAKE-02**: Intake forms capture demographics, medical history, review of systems (ROS), and chief complaint using shadcn UI
- [ ] **INTAKE-03**: Intake webhook/API receives submission, creates/updates Patient record, pre-seeds encounterStore for that day's appointment
- [ ] **INTAKE-04**: AI Triage — async AI check on "Reason for Visit"; flags urgent conditions (e.g., flashing lights -> "Possible RD") with red badge on Schedule View

### Insurance & Claims

- [ ] **INS-01**: InsurancePayer model with CRUD API — admin can create, read, update, delete insurance payers
- [ ] **INS-02**: FeeScheduleItem model with per-payer fee schedule management (CPT code to fee amount mapping)
- [ ] **INS-03**: Admin Payers tab UI — payer list with CRUD forms and inline fee schedule editor
- [ ] **INS-04**: PatientInsurance model with CRUD API — patient detail Insurance tab showing primary/secondary coverage with subscriber info
- [ ] **INS-05**: Superbill auto-populates line item fees from patient's payer fee schedule via fee_service
- [ ] **INS-06**: CMS-1500 PDF generation — posted superbills generate downloadable PDF forms via reportlab
- [ ] **INS-07**: Patient Billing/Claims tab — list all superbills for patient with status, E&M code, CPT codes, and total

### Schedule & Booking Revamp (Phase 10.2)

- [x] **SCH-01**: Horizontal Mon-Sun week strip with count badges replaces prev/next arrows at top of schedule page
- [x] **SCH-02**: 5 view mode tabs (List, Timeline, Clinic, Flow, Week) with active tab accent indicator
- [x] **SCH-03**: Role-based default view (receptionist/technician -> Flow, doctor -> Clinic, owner -> List)
- [x] **SCH-04**: View mode persists to localStorage, role default applies only on first visit
- [x] **SCH-05**: Appointment model has checked_in_at timestamp, auto-set when status transitions to arrived
- [x] **SCH-06**: Backend appointment list endpoint supports date_from/date_to range query (max 31 days)
- [x] **SCH-07**: Appointment cards show color-coded left border by status, wait time badge (amber >15min, red >30min), and intake status icon
- [x] **SCH-08**: Clicking an appointment card opens a right-side detail drawer with full info, patient summary, and all actions
- [x] **SCH-09**: Detail drawer closes via ESC, backdrop click, or Close button; 480px width with slide animation
- [x] **SCH-10**: Booking flow uses right-side drawer with visual 30-min slot picker grid instead of modal dialog
- [x] **SCH-11**: Slot picker shows available/occupied/selected states; overbooking shows warning but does not block staff
- [x] **SCH-12**: Flow board view with 4 Kanban columns (Waiting, Pre-Test, In Exam, Done) and upcoming appointments strip
- [x] **SCH-13**: Flow board auto-refreshes via 30-second polling; wait time displayed on each card
- [x] **SCH-14**: Week view shows 7-day time-aligned grid with appointment blocks positioned by time (Google Calendar style)
- [x] **SCH-15**: Public booking page at /book/[slug] uses light/white theme with 5-step wizard (Type, Provider, Date+Time, Info, Confirm)
- [x] **SCH-16**: Public booking wizard validates patient info, shows slot availability from backend, and displays success state on confirm

### CRM & Patient Engagement (Phase 12)

- [ ] **CRM-01**: Operational appointment reminders sent automatically at 7d, 72h, 24h pre-appointment via patient's preferred channel(s)
- [ ] **CRM-02**: Staff can manually send a message from patient detail header, schedule kebab, inbox reply, or bulk-select on schedule
- [ ] **CRM-03**: Recall reminders triggered for patients whose last finalized encounter > 12 months ago AND no future appointment, surfaced in staff-approved queue
- [ ] **CRM-04**: Patients can opt out of SMS via STOP keyword (Twilio Advanced Opt-Out + DB sync); opt-out respected on every send via preflight check
- [ ] **CRM-05**: Per-patient message history viewable on patient detail Messages tab with states (queued/sent/delivered/read/failed)
- [ ] **CRM-06**: Per-channel × per-purpose consent flags (4 flags) captured at intake/booking with explicit timestamps for TCPA audit trail
- [ ] **CRM-07**: Twilio + email-provider webhooks verify provider signatures and update message status idempotently by provider_message_id
- [ ] **CRM-08**: Quiet hours 9pm–8am patient-local enforced by scheduler; messages deferred to next allowed window
- [ ] **CRM-09**: Daily per-clinic spend cap with 80% warn + 100% hard-stop with admin override
- [ ] **CRM-10**: Bulk-send safeguards: max 50 recipients, throttle 1 msg/sec, mandatory preview-confirm, single batch_id audit
- [ ] **CRM-11**: Inbound non-STOP SMS classified by Claude into 6 categories; reschedule/cancellation tagged float to top of inbox
- [ ] **CRM-12**: "Draft with AI" composer button: staff intent → HIPAA-safe message respecting opt-out + minor routing
- [ ] **CRM-13**: Onboarding wizard with test-send + "I received them" gate before clinic_messaging_enabled=true
- [ ] **CRM-14**: Per-clinic dedicated local Twilio number auto-provisioned during wizard step 3
- [ ] **CRM-15**: /messaging/analytics page (reminder funnel, recall conversion, opt-out trend, cost+volume) + dashboard hero cards
- [ ] **CRM-16**: Monthly "Communications Compliance Report" PDF export, OWNER-gated
- [ ] **CRM-17**: messaging entitlement key added to lib/entitlements.ts and backend/core/entitlements.py; included in Plus + Premium plans
- [ ] **CRM-18**: Minors (<18) route to Guardian (name+phone+email+relationship); 18th-birthday "switch to patient" prompt
- [ ] **CRM-19**: Household bundling: shared contact + same-day appointments → single bundled SMS
- [ ] **CRM-20**: Bounce fallback: 3 fails on preferred channel → auto-flip to alternate + "needs update" badge

### Retail Inventory (Phase 13)

- [x] **INV-01**: Admin can add, edit, and deactivate Products (frames + contact lenses) with brand, model, price, and stock_qty via Inventory page UI (ROADMAP success criterion #1)
- [x] **INV-02**: Optical staff can create an OpticalOrder from a patient's encounter Rx, selecting products from the catalog (ROADMAP success criterion #2)
- [x] **INV-03**: Placing an OpticalOrder atomically decrements Product.stock_qty in the same DB transaction as the line-item insert and the InventoryTransaction audit row; low-stock items (`stock_qty <= reorder_threshold`) display a warning badge in the Inventory page (ROADMAP success criterion #3)
- [ ] **INV-04**: Inventory page shows stock levels filterable by product_type (Frames | Contacts tabs) plus brand/model search, stock-status filter (in stock / low / out), active/inactive toggle, and type-specific filter (frames: gender; contacts: modality) (ROADMAP success criterion #4)
- [ ] **INV-05**: Patient detail Orders tab shows chronological order history (newest first) with order date, status badge, line-item count, and total — clickable to open OrderDetailDrawer (ROADMAP success criterion #5)
- [x] **INV-06**: Single `Product` table with `product_type` enum {`frame`,`contact_lens`} stored as VARCHAR(20) plus JSONB `attributes` column carrying type-specific keys (frame: `brand,model,color,eye_size,bridge_size,temple_size,gender,material`; contact_lens: `brand,modality,base_curve,diameter,power,cylinder?,axis?,box_size`) — mirrors `Patient.medical_history_jsonb` precedent
- [x] **INV-07**: Partial unique index `CREATE UNIQUE INDEX uq_products_active_sku ON products (tenant_id, sku) WHERE is_active = true` — soft-deleted rows preserve their SKU; mirrors Phase 10.1 PatientInsurance pattern
- [x] **INV-08**: Restock workflow ("Receive Stock" action) writes an `InventoryTransaction` audit row with `reason='receive_stock'`, signed positive `delta`, optional `po_reference` and `staff_id`, in the same primary TXN as the `Product.stock_qty` update; manual qty edits write `reason='manual_adjust'` audit rows
- [x] **INV-09**: `OpticalOrder` (patient_id, encounter_id?, status, total_price, created_by_id, timestamps) + `OpticalOrderLineItem` (order_id, product_id, qty, unit_price, line_total) tables created with status lifecycle `draft → placed → dispensed` and `* → cancelled`; status stored as VARCHAR(20) — designed Phase-14-extensible (ADD COLUMN only)
- [x] **INV-10**: Cancelling a `placed` order atomically restocks Product.stock_qty for each line item AND writes one `InventoryTransaction` per line with `reason='order_cancelled'` AND writes audit `OPTICAL_ORDER_CANCEL` — all in the same primary TXN
- [x] **INV-11**: Concurrent `POST /optical-orders/{id}/place` calls against orders sharing a Product cannot over-decrement stock — enforced via `SELECT ... FOR UPDATE` (`with_for_update()`) on the Product row inside the place handler before mutating `stock_qty`
- [x] **INV-12**: Zero-stock soft-block — placing an order with `stock_qty <= 0` returns 200 with a warning marker (toast on FE), does NOT 4xx; allows the order to be created/placed (mirrors Phase 10.2 overbooking pattern)
- [x] **INV-13**: Pydantic `by_alias=True` snake↔camel contract test for `ProductResponse` and `OpticalOrderResponse` — backend pytest snapshot of `model_dump(by_alias=True)` matches a TS literal-keys assertion in vitest (per `feedback_contract_tests.md`)
- [x] **INV-14**: `retail_pos` entitlement key added to BOTH `backend/core/entitlements.py` `Entitlement` enum AND `lib/entitlements.ts` `Entitlement` const + `ENTITLEMENT_META` (label "Retail & POS", plan "Add-on") — and explicitly NOT added to `PLAN_FEATURES["Core"]`, `["Plus"]`, or `["Premium"]` arrays
- [ ] **INV-15**: `OrderDetailDrawer` component — 480px right-slide drawer with ESC + backdrop close, hydration safety (`if (!open && !order) return null`), rendering line items, status timeline, and Cancel CTA gated on `CANCEL_OPTICAL_ORDER` permission; mirrors `AppointmentDetailDrawer.tsx`
- [x] **INV-16**: Encounter optical-queue card status rollup — any related `OpticalOrder.status == 'placed'` for that encounter → display `in_progress`; orders exist AND all are `dispensed` → display `dispensed`; otherwise fall back to `Encounter.optical_status` (Phase 6 column unchanged); cancelled-only orders treated as "no live orders" → fall back
- [x] **INV-17**: Dev seed file `backend/seed_db.py` extended with `_seed_retail_inventory(session)` adding 10 synthetic frames + 5 contact-lens products (idempotent — guards on `tenant_id + sku + is_active`) and wired into `seed_tenant_schema()` orchestrator
- [x] **INV-18**: 9 new `AuditAction` VARCHAR enum values added — `PRODUCT_CREATE`, `PRODUCT_UPDATE`, `PRODUCT_DEACTIVATE`, `STOCK_RECEIVE`, `STOCK_ADJUST`, `OPTICAL_ORDER_CREATE`, `OPTICAL_ORDER_PLACE`, `OPTICAL_ORDER_CANCEL`, `OPTICAL_ORDER_DISPENSE` — all logged via `log_action()` in primary TXN of the corresponding route
- [x] **INV-19**: 5 new `ClinicalAction` enum values added with PERMISSION_MATRIX rows: `VIEW_INVENTORY` {D,T,R,A,O}, `MANAGE_INVENTORY` {A,O}, `CREATE_OPTICAL_ORDER` {T,R,A,O}, `VIEW_OPTICAL_ORDER` {D,T,R,A,O}, `CANCEL_OPTICAL_ORDER` {A,O}
- [ ] **INV-20**: Inventory admin page at `app/(tenant)/[tenant]/inventory/page.tsx` with per-type tabs (Frames | Contacts), filter row, product table with stock badge column, and modal-driven CRUD + Receive Stock + Adjust Stock actions; sidebar Inventory link gated on `Entitlement.RETAIL_POS`

### Optical Order Configuration (Phase 14)

- [ ] **OPT14-01**: Configurator route opens from optical queue with Final Rx pre-populated and PD pre-filled from `refraction.pd_distance` / `pd_near` (ROADMAP success criterion #1)
- [ ] **OPT14-02**: Habitual Rx column rendered side-by-side with Final Rx in configurator left pane (OD/OS × sphere/cyl/axis/add/prism); delta-flag row when |Final − Habitual| SE > 0.50D (ROADMAP success criterion #2)
- [ ] **OPT14-03**: Frame picker reads Phase 13 products?type=frame catalog; lens type/material/coatings selectable from new admin-managed reference catalogs `lens_types`/`lens_materials`/`lens_coatings` (ROADMAP success criterion #3)
- [ ] **OPT14-04**: Seg height OD/OS captured; required-marker triggers when `lens_type.requires_seg_height=true`; vertex distance required when `requires_vertex=true`; place handler 400s with `field_errors: [{path, code, message}]` on missing required fields (ROADMAP success criterion #4)
- [ ] **OPT14-05**: Vision plan name, member ID, group number captured in `vision_plan_jsonb` (snake_case keys: name, member_id, group_number, authorization_number?, copay?, allowance?) (ROADMAP success criterion #5)
- [ ] **OPT14-06**: `POST /optical-orders/{id}/job-ticket/` returns reportlab PDF with header (clinic), patient block, two-column Rx (Habitual | Final), frame, lens, coatings, measurements, vision plan, footer (staff + timestamp); sets `job_ticket_generated_at`; gated on `status='placed'` (ROADMAP success criterion #6)
- [ ] **OPT14-07**: AI Scribe optical recommendations surface as ghosted ✨ chips inline in configurator; accept fills field; dismiss persists to `OpticalOrder.suggestion_resolutions_jsonb`; deterministic keyword extractor — no new Claude calls (ROADMAP success criterion #7)
- [ ] **OPT14-08**: Alembic migration 0019 adds 3 lens reference tables (`lens_types`, `lens_materials`, `lens_coatings`) + 5 OpticalOrder columns (`vision_plan_jsonb`, `fitting_jsonb`, `suggestion_resolutions_jsonb`, `final_refraction_id`, `habitual_refraction_id`, `job_ticket_generated_at`) + 1 OpticalOrderLineItem column (`lens_config_jsonb`); JSONB server_default via `sa.text("'{}'::jsonb")`; partial unique indexes `(tenant_id, name) WHERE is_active=true` on each reference table
- [ ] **OPT14-09**: 2 new ClinicalAction values wired into PERMISSION_MATRIX: `GENERATE_JOB_TICKET` {T,R,A,O}, `MANAGE_LENS_CATALOG` {A,O}
- [ ] **OPT14-10**: 5 new AuditAction VARCHAR values logged via `log_action()` in primary TXN: `OPTICAL_ORDER_CONFIGURE_UPDATE`, `JOB_TICKET_GENERATE`, `LENS_TYPE_CREATE`, `LENS_MATERIAL_CREATE`, `LENS_COATING_CREATE`; UPDATE/DEACTIVATE reuse with `metadata.action` discriminator
- [ ] **OPT14-11**: `_seed_lens_reference()` idempotently seeds 4 lens types (Single Vision, Bifocal, Progressive, Reading) + 6 materials (CR-39, polycarbonate, trivex, hi-index 1.67/1.74/1.80) + 7 coatings (AR, UV, blue light, photochromic, polarized, scratch-resistant, mirror); wired into `seed_tenant_schema()` after `_seed_retail_inventory()`
- [ ] **OPT14-12**: Full-page configurator route at `app/(tenant)/[tenant]/optical/orders/[orderId]/page.tsx`; autosave 1.5s debounce + flush-on-blur via `opticalOrderConfigStore` (raw fetch + getAuthHeaders to preserve JSONB snake_case per Pitfall 1); no-ops when status != 'draft' (Pitfall 11)
- [ ] **OPT14-13**: Three configurator entry points wired: (1) optical-queue card "Configure Order" CTA, (2) Patient Orders tab draft-order click, (3) walk-in modal redirect on submit for spectacle orders
- [ ] **OPT14-14**: `OpticalQueueItem.draft_order_count: int = 0` schema field + "Draft pending" pill on `OpticalQueueCard.tsx` (absorbs 2026-05-08-optical-queue-draft-order-indicator todo); pill click routes to most recent draft (Open Question #3 resolution)
- [ ] **OPT14-15**: `OrderDetailDrawer` component — 480px right-slide drawer with ESC + backdrop close, hydration safety (`if (!open && !order) return null`), renders status timeline + line items + lens config (read-only) + vision plan + Generate Job Ticket button; mirrors `AppointmentDetailDrawer.tsx`; absorbs Phase 13 INV-15
- [ ] **OPT14-16**: BFF proxies registered for all new endpoints (11 routes): PATCH /optical-orders/[id]/; POST /optical-orders/[id]/job-ticket/ (raw fetch — Blob); GET /optical-orders/[id]/suggestions/; POST /optical-orders/[id]/suggestions/[suggestionId]/{accept|dismiss}/; lens-catalog/{types|materials|coatings}/ GET+POST + [id]/ GET+PATCH+DELETE; all with trailing-slash upstream URLs
- [ ] **OPT14-17**: Pydantic `by_alias` contract tests for `OpticalOrderResponse` (extended), `OpticalOrderLineItemResponse` (lens_config), `LensTypeResponse`, `LensMaterialResponse`, `LensCoatingResponse`, `JobTicketMetaResponse`; vitest literal-keys mirror per `feedback_contract_tests.md`
- [ ] **OPT14-18**: Playwright E2E covering optical queue → "Configure Order" CTA → configurator autosave (PATCH intercept) → place with missing seg height (400 field_errors) → fix → place succeeds → Generate Job Ticket (PDF download) → OrderDetailDrawer view for placed order

### Point of Sale (Phase 15)

- [x] **POS-01**: Front desk can open a checkout adding clinical charges (Superbill copay) and retail/optical items (ad-hoc Product or placed OpticalOrder) on a dedicated /pos full-page checkout (ROADMAP success criterion #1)
- [x] **POS-02**: Payment supported via cash (tendered + change_due) and card via Stripe Elements (PaymentElement + automatic_payment_methods PaymentIntent + server-confirm on retrieve, never client-reported status) (ROADMAP success criterion #2)
- [ ] **POS-03**: PDF receipt delivered by email (Postmark + React Email + PDF attachment) or browser print (hidden iframe + window.print) — server-side reportlab letter-size template cloned from job_ticket_pdf.py (ROADMAP success criterion #3)
- [ ] **POS-04**: Daily close report with totals by payment method (cash/stripe_card/external_card/write_off/refund_returned) and category (clinical/retail/optical) — exportable to PDF (reportlab landscape) and CSV (ROADMAP success criterion #4)
- [x] **POS-05**: Refunds supported in patient payment history — item-level OR full-sale, with restock for product/optical lines via InventoryTransaction(reason='refund_restock'), OWNER+ADMIN gated, mandatory reason (ROADMAP success criterion #5)
- [x] **POS-06**: Split tender supported — multiple Payment rows per Sale; remaining=Sale.total-sum(succeeded payments); close gate enforces remaining<=0
- [x] **POS-07**: PaymentProcessor abstract interface in backend/services/payments/base.py with 4 async methods (create_payment_intent, confirm_payment, refund_payment, verify_webhook_signature); StripeProcessor is the only shipped adapter for Phase 15
- [x] **POS-08**: Per-tenant Stripe credentials stored Fernet-encrypted at rest (`stripe_secret_key_encrypted`, `stripe_webhook_secret_encrypted`); master key in PAYMENTS_FERNET_KEY env var; ciphertext prefix `gAAAA` asserted in encrypt-on-write tests
- [x] **POS-09**: Item-level refunds with restock for product/optical_order lines (InventoryTransaction reason='refund_restock' in primary TXN); superbill lines NEVER restock (clinical service)
- [ ] **POS-10**: Daily close cash reconciliation persisted on DailyCloseRun(close_date, expected_cash, counted_cash, variance, notes?, run_by_id, run_at); same date can only be closed once (subsequent reads are read-only)
- [x] **POS-11**: Write-off (`method='write_off'`) gated to OWNER+ADMIN via RECORD_WRITE_OFF permission with mandatory `reason_note` text
- [x] **POS-12**: Enum extensions — 13 new AuditAction VARCHAR values (SALE_CREATE, SALE_OPENED, SALE_PAID, SALE_VOIDED, PAYMENT_RECORDED, PAYMENT_FAILED, WRITE_OFF_RECORDED, REFUND_ISSUED, RECEIPT_EMAILED, RECEIPT_PRINTED, DAILY_CLOSE_RUN, SALE_DISCOUNT_APPLIED, STRIPE_KEYS_UPDATED, STRIPE_WEBHOOK_RECEIVED) and 6 new ClinicalAction values (OPEN_POS, RECORD_PAYMENT, RECORD_WRITE_OFF, ISSUE_REFUND, RUN_DAILY_CLOSE, MANAGE_PAYMENT_CONFIG)
- [x] **POS-13**: Single per-tenant `Tenant.sales_tax_rate Numeric(5,4) default 0.0725`; per-line `taxable` boolean override; superbill source_type forced non-taxable; tax = sum(line_total WHERE taxable=true) × rate quantize(0.01, ROUND_HALF_EVEN)
- [x] **POS-14**: Superbill copay derivation — when `Superbill.billed_payer_id IS NOT NULL` AND matching active `PatientInsurance` exists, use `PatientInsurance.copay_amount`; else (self-pay) use `Superbill.total_fee`
- [x] **POS-15**: Per-line discount ($/% toggle) with mandatory `discount_reason String(200)` text; audit `SALE_DISCOUNT_APPLIED` with metadata `{line_id, type, amount, reason}`
- [x] **POS-16**: Pydantic `by_alias=True` contract test for SaleResponse, SaleLineItemResponse, PaymentResponse, RefundResponse, DailyCloseResponse (backend snapshot) mirrored by vitest literal-keys assertion (`feedback_contract_tests.md`)

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### Auth Enhancements

- **SEC-V2-01**: MFA via TOTP (HIPAA 2025 mandates for remote ePHI access)
- **SEC-V2-02**: OAuth login (Google Workspace for clinic staff)

### Interoperability

- **FHIR-V2-01**: FHIR R4 per-encounter export (Patient, Observation, Condition Bundle)
- **FHIR-V2-02**: FHIR VisionPrescription resource for dispensed Rx

### Analytics

- **ANAL-V2-01**: Analytics dashboard with real KPI data (Recharts)
- **ANAL-V2-02**: Revenue and utilization dashboards

### Deployment

- **DEP-V2-01**: Deploy FastAPI to Render with HIPAA BAA
- **DEP-V2-02**: CI/CD pipeline (GitHub Actions -> Vercel + Render)
- **DEP-V2-03**: Supabase RLS policies as defense-in-depth

### Encounter Workflow Redesign

- [x] **EWR-01**: Encounter page splits into pre-test and doctor exam modes based on encounter status
- [x] **EWR-02**: Pre-test mode shows only CC/HPI + vitals form — no doctor sections, no tab bar
- [x] **EWR-03**: AI Scribe widget renders after Plan/Addendum section in doctor exam mode
- [x] **EWR-04**: Sticky floating mic button visible for doctor/owner roles during in_exam status
- [x] **EWR-05**: Tab bar removed from DOM (not hidden via CSS) in pre-test mode
- [x] **EWR-06**: 9 preliminary test fields (confrontation, motility, color vision, NPC, pupils mm, autorefractor, keratometer, entrance Rx) in full data chain
- [x] **EWR-07**: "All Normal" quick-fill and "Ready for Doctor" transition button in pre-test view

## Out of Scope

| Feature | Reason |
|---------|--------|
| Full clearinghouse integration (ERA processing) | Requires vendor contract, deferred beyond MVP |
| Patient portal (secure messaging) | Requires separate frontend app |
| OCT & visual field device import | Requires hardware integration research |
| Mobile native app | Web-first, responsive design covers mobile |
| Real-time multi-provider collaboration | Unnecessary for solo/small practice market |
| FHIR server (full read/write) | Export-only sufficient; full server is $50K-$500K |
| SMS/email appointment reminders | Requires vendor decision (Twilio/Resend) |
| Encounter addenda | Architectural decision needed on locking model |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 1 | Complete |
| SEC-02 | Phase 1 | Complete |
| SEC-03 | Phase 1 | Complete |
| SEC-04 | Phase 1 | Complete |
| SEC-05 | Phase 1 | Complete |
| SEC-06 | Phase 1 | Complete |
| SEC-07 | Phase 1 | Complete |
| SEC-08 | Phase 1 | Complete |
| SEC-09 | Phase 1 | Complete |
| SEC-10 | Phase 1 | Complete |
| INF-01 | Phase 1 | Complete |
| INF-02 | Phase 1 | Complete |
| INF-03 | Phase 1 | Complete |
| INF-04 | Phase 1 | Complete |
| INF-05 | Phase 1 | Complete |
| INF-06 | Phase 1 | Complete |
| API-01 | Phase 2 | Complete |
| API-02 | Phase 2 | Complete |
| API-03 | Phase 2 | Complete |
| API-04 | Phase 2 | Complete |
| API-05 | Phase 2 | Complete |
| API-06 | Phase 2 | Complete |
| API-07 | Phase 9.1 | Complete |
| API-08 | Phase 2 | Complete |
| HIPAA-01 | Phase 2 | Complete |
| HIPAA-02 | Phase 2 | Complete |
| HIPAA-03 | Phase 2 | Complete |
| SCHED-01 | Phase 3 | Complete |
| SCHED-02 | Phase 3 | Complete |
| SCHED-03 | Phase 3 | Complete |
| SCHED-04 | Phase 3 | Complete |
| SCHED-05 | Phase 3 | Complete |
| BILL-01 | Phase 4 | Complete |
| BILL-02 | Phase 4 | Complete |
| BILL-03 | Phase 4 | Complete |
| BILL-04 | Phase 4 | Complete |
| BILL-05 | Phase 4 | Complete |
| BILL-06 | Phase 4 | Complete |
| PAT-01 | Phase 5 | Complete |
| PAT-02 | Phase 5 | Complete |
| PAT-03 | Phase 5 | Complete |
| PAT-04 | Phase 5 | Complete |
| PAT-05 | Phase 5 | Complete |
| OPT-01 | Phase 6 | Complete |
| OPT-02 | Phase 6 | Complete |
| OPT-03 | Phase 6 | Complete |
| OPT-04 | Phase 6 | Complete |
| INTAKE-01 | Phase 7 | Complete |
| INTAKE-02 | Phase 7 | Complete |
| INTAKE-03 | Phase 7 | Complete |
| INTAKE-04 | Phase 7 | Complete |
| INS-01 | Phase 9 | Complete |
| INS-02 | Phase 9 | Complete |
| INS-03 | Phase 9 | Complete |
| INS-04 | Phase 9 | Complete |
| INS-05 | Phase 9 | Complete |
| INS-06 | Phase 9 | Complete |
| INS-07 | Phase 9 | Complete |
| ANAL-V2-01 | Phase 8 | Complete |
| ANAL-V2-02 | Phase 8 | Complete |
| EWR-01 | Phase 10 | Complete |
| EWR-02 | Phase 10 | Complete |
| EWR-03 | Phase 10 | Complete |
| EWR-04 | Phase 10 | Complete |
| EWR-05 | Phase 10 | Complete |
| EWR-06 | Phase 10 | Complete |
| EWR-07 | Phase 10 | Complete |
| SCH-01 | Phase 10.2 | Complete |
| SCH-02 | Phase 10.2 | Complete |
| SCH-03 | Phase 10.2 | Complete |
| SCH-04 | Phase 10.2 | Complete |
| SCH-05 | Phase 10.2 | Complete |
| SCH-06 | Phase 10.2 | Complete |
| SCH-07 | Phase 10.2 | Complete |
| SCH-08 | Phase 10.2 | Complete |
| SCH-09 | Phase 10.2 | Complete |
| SCH-10 | Phase 10.2 | Complete |
| SCH-11 | Phase 10.2 | Complete |
| SCH-12 | Phase 10.2 | Complete |
| SCH-13 | Phase 10.2 | Complete |
| SCH-14 | Phase 10.2 | Complete |
| SCH-15 | Phase 10.2 | Complete |
| SCH-16 | Phase 10.2 | Complete |
| CRM-01 | Phase 12 | Pending |
| CRM-02 | Phase 12 | Pending |
| CRM-03 | Phase 12 | Pending |
| CRM-04 | Phase 12 | Pending |
| CRM-05 | Phase 12 | Pending |
| CRM-06 | Phase 12 | Pending |
| CRM-07 | Phase 12 | Pending |
| CRM-08 | Phase 12 | Pending |
| CRM-09 | Phase 12 | Pending |
| CRM-10 | Phase 12 | Pending |
| CRM-11 | Phase 12 | Pending |
| CRM-12 | Phase 12 | Pending |
| CRM-13 | Phase 12 | Pending |
| CRM-14 | Phase 12 | Pending |
| CRM-15 | Phase 12 | Pending |
| CRM-16 | Phase 12 | Pending |
| CRM-17 | Phase 12 | Pending |
| CRM-18 | Phase 12 | Pending |
| CRM-19 | Phase 12 | Pending |
| CRM-20 | Phase 12 | Pending |
| INV-01 | Phase 13 | Complete |
| INV-02 | Phase 13 | Complete |
| INV-03 | Phase 13 | Complete |
| INV-04 | Phase 13 | Pending |
| INV-05 | Phase 13 | Pending |
| INV-06 | Phase 13 | Complete |
| INV-07 | Phase 13 | Complete |
| INV-08 | Phase 13 | Complete |
| INV-09 | Phase 13 | Complete |
| INV-10 | Phase 13 | Complete |
| INV-11 | Phase 13 | Complete |
| INV-12 | Phase 13 | Complete |
| INV-13 | Phase 13 | Complete |
| INV-14 | Phase 13 | Complete |
| INV-15 | Phase 13 | Pending |
| INV-16 | Phase 13 | Complete |
| INV-17 | Phase 13 | Complete |
| INV-18 | Phase 13 | Complete |
| INV-19 | Phase 13 | Complete |
| INV-20 | Phase 13 | Pending |
| OPT14-01 | Phase 14 | Pending |
| OPT14-02 | Phase 14 | Pending |
| OPT14-03 | Phase 14 | Pending |
| OPT14-04 | Phase 14 | Pending |
| OPT14-05 | Phase 14 | Pending |
| OPT14-06 | Phase 14 | Pending |
| OPT14-07 | Phase 14 | Pending |
| OPT14-08 | Phase 14 | Pending |
| OPT14-09 | Phase 14 | Pending |
| OPT14-10 | Phase 14 | Pending |
| OPT14-11 | Phase 14 | Pending |
| OPT14-12 | Phase 14 | Pending |
| OPT14-13 | Phase 14 | Pending |
| OPT14-14 | Phase 14 | Pending |
| OPT14-15 | Phase 14 | Pending |
| OPT14-16 | Phase 14 | Pending |
| OPT14-17 | Phase 14 | Pending |
| OPT14-18 | Phase 14 | Pending |
| POS-01 | Phase 15 | Complete |
| POS-02 | Phase 15 | Complete |
| POS-03 | Phase 15 | Pending |
| POS-04 | Phase 15 | Pending |
| POS-05 | Phase 15 | Complete |
| POS-06 | Phase 15 | Complete |
| POS-07 | Phase 15 | Complete |
| POS-08 | Phase 15 | Complete |
| POS-09 | Phase 15 | Complete |
| POS-10 | Phase 15 | Pending |
| POS-11 | Phase 15 | Complete |
| POS-12 | Phase 15 | Complete |
| POS-13 | Phase 15 | Complete |
| POS-14 | Phase 15 | Complete |
| POS-15 | Phase 15 | Complete |
| POS-16 | Phase 15 | Complete |

**Coverage:**
- Total requirements: 157
- Complete: 67
- Pending: 90
- Unmapped: 0

---
*Requirements defined: 2026-03-05*
*Last updated: 2026-05-27 — Phase 15 Point of Sale (16 POS requirements added)*
