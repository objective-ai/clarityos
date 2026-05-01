---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Completed 13-08-PLAN.md (retail inventory seed)
last_updated: "2026-05-01T19:38:22.730Z"
progress:
  total_phases: 12
  completed_phases: 6
  total_plans: 55
  completed_plans: 46
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: Phase 12 context gathered
last_updated: "2026-04-29T23:35:33.099Z"
progress:
  total_phases: 12
  completed_phases: 5
  total_plans: 29
  completed_plans: 29
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Executing Phase 10.3
stopped_at: "10.3-07 Task 3 — awaiting live-Sentry PHI seatbelt verification"
last_updated: "2026-04-21T22:10:00.000Z"
progress:
  total_phases: 12
  completed_phases: 4
  total_plans: 29
  completed_plans: 27
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-05)

**Core value:** Clinicians can complete a full eye exam encounter in a workflow that feels faster than paper, with every action audited and every record tamper-proof.
**Current focus:** Phase 13 — retail-inventory

## Current Position

Phase: 13 (retail-inventory) — EXECUTING
Plan: 2 of 15

## Performance Metrics

**Velocity:**

- Total plans completed: 11
- Average duration: ~11min
- Total execution time: ~2 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01 | 3/3 | ~41min | ~14min |
| 02 | 3/3 | ~65min | ~22min |
| 03 | 2/2 | ~25min | ~13min |
| 04 | 1/1 | ~9min | ~9min |
| 05 | 1/1 | ~11min | ~11min |
| 06 | 1/1 | ~10min | ~10min |

**Recent Trend:**

- Last 11 plans: 01-01 (~25min), 01-02 (~5min), 01-03 (~11min), 02-01 (~12min), 02-02 (~8min), 02-03 (~45min), 03-01 (~12min), 03-02 (~13min), 04-01 (~9min), 05-01 (~11min), 06-01 (~10min)
- Trend: Improving — parallel execution of 3 phases completed in ~10min wall time

| Phase 08-analytics-dashboard P00 | 12 | 2 tasks | 5 files |
| Phase 08-analytics-dashboard P02 | 25 | 1 tasks | 1 files |
| Phase 09-claims-basics P05 | 6 | 2 tasks | 8 files |
| Phase 09-claims-basics P04 | 6 | 2 tasks | 7 files |
| Phase 09-claims-basics P06 | 4 | 2 tasks | 6 files |
| Phase 09-claims-basics P07 | 20 | 1 tasks | 5 files |
| Phase 09.1-security-integration-hardening P01 | 8 | 2 tasks | 2 files |
| Phase 10.1 P01 | 15 | 2 tasks | 5 files |
| Phase 10.2 P02 | 20 | 2 tasks | 6 files |
| Phase 10.2 P04 | 4 | 2 tasks | 2 files |
| Phase 10.2 P03 | 25 | 2 tasks | 2 files |
| Phase 10.2 P07 | 8 | 2 tasks | 2 files |
| Phase 10.2 P08 | 5 | 1 tasks | 2 files |
| Phase 10.4 P01 | 3 | 3 tasks | 4 files |
| Phase 10.4 P02 | 20 | 2 tasks | 2 files |
| Phase 10.4 P04 | 15 | 2 tasks | 11 files |
| Phase 10.4 P06 | 8 | 2 tasks | 2 files |
| Phase 10.4 P05 | 12 | 3 tasks | 2 files |
| Phase 10.4-staff-scheduling P07 | 15 | 3 tasks | 3 files |
| Phase 11-marketing-pages P04 | 5 | 1 tasks | 1 files |
| Phase 10.3 P03 | 6 | 3 tasks | 5 files |
| Phase 10.3 P02 | 8 | 3 tasks | 7 files |
| Phase 10.3 P01 | 4 min | 3 tasks | 5 files |
| Phase 10.3 P04 | 25min | 3 tasks | 10 files |
| Phase 13-retail-inventory P02 | 2min | 2 tasks | 4 files |
| Phase 13 P03 | 3min | 2 tasks | 4 files |
| Phase 13-retail-inventory P00 | 5min | 2 tasks | 10 files |
| Phase 13 P01 | 25min | 2 tasks | 2 files |
| Phase 13-retail-inventory P08 | 2min | 1 tasks | 1 files |
| Phase 13-retail-inventory P06 | 2min | 2 tasks | 9 files |

## Accumulated Context

### Roadmap Evolution

- Phase 10 added: Encounter Workflow Redesign — pre-test/doctor mode split, sticky mic, AI Scribe at bottom, role-based tab visibility. Old Phases 10-16 renumbered to 11-17.
- Phase 10.2 inserted after Phase 10: Revamp Schedule & Booking Page (URGENT)
- Phase 10.3 inserted after Phase 10: Error Monitoring & System Status — Sentry integration (FastAPI + Next.js) + admin status page (URGENT)
- Phase 10.1 inserted after Phase 10: Insurance Revamp — enrich insurance fields (copay, auth code, eligibility, position, active) (URGENT)
- Phase 10.4 inserted after Phase 10.3: Staff Scheduling — weekly hours, blocked time, shift overview, clock-in/clock-out, attendance log, CSV payroll export (URGENT)
- Patient Document Management moved back to V3-08 — research captured in memory (research_document_management.md)
- Phase 11 added: Marketing pages — /features, /pricing, /compare (Trust & Authority style, compare vs RevolutionEHR/Barti/EyeCloudPro); old phases 11-17 shifted to 12-18

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Combined Security + Infrastructure into Phase 1 (hard dependency chain)
- Roadmap: HIPAA compliance grouped with API Integration in Phase 2
- Roadmap: Phases 3-6 can execute in parallel after Phase 2; Phase 7 depends on Phase 3
- 01-02: BFF proxy pattern uses getUser() auth check then getSession() for token forwarding
- 01-03: Browser client uses @supabase/ssr createBrowserClient (not legacy singleton)
- 01-03: Middleware uses getUser() for server-side JWT verification
- 01-03: ePHI cleanup clears 6 clinical stores + localStorage keys
- [Phase 02-01]: SSR-safe Supabase createClient factory replaces legacy singleton in api-client
- [Phase 02-01]: withRetry exponential backoff: 500ms base, retries at 500ms, 1000ms, 2000ms
- [Phase 02-02]: refractionSummaryToDraft converter maps camelCase API to snake_case RefractionDraft
- [Phase 02]: Login uses window.location.href (not router.push) for full page load after auth
- [Phase 02]: Root page is auth-aware server component (redirects authenticated users to dashboard)
- [Phase 02]: TopNav mock-session import is dynamic (only loaded in dev when role switcher used)
- [Phase 03-01]: Migration uses DO block for idempotent appointment_id FK addition to encounters
- [Phase 03-01]: end_time is always derived (start_time + duration_minutes), never accepted as input
- [Phase 03-01]: start-exam returns HTTP 200 + already_existed=true if encounter pre-exists (idempotent)
- [Phase 03-01]: AuditAction scheduling values added as Python enum only (no DB ALTER TYPE needed)
- [Phase 03-02]: Schedule uses day view with date navigation (prev/next/today/date picker)
- [Phase 03-02]: Start Exam creates linked Encounter and navigates to encounter view
- [Phase 03-02]: Booking modal accepts patient/provider UUID, type, date/time, duration, chief complaint
- [Phase 03-02]: Cancel requires reason (min 3 chars) matching backend validation
- [Phase 04-01]: Superbill auto-creates with AI-suggested CPT codes from encounter data
- [Phase 04-01]: MDM uses 2021 E&M 2-of-3 rule (problem, data, risk scoring)
- [Phase 04-01]: CMS-1500 export as standard clearinghouse JSON (not PDF)
- [Phase 04-01]: Billing permissions: doctor, admin, owner (not tech/receptionist)
- [Phase 04-01]: Superbill is 1:1 with encounter (unique constraint)
- [Phase 05-01]: Contact/insurance/emergency stored in JSONB (contact_info_jsonb, medical_history_jsonb)
- [Phase 05-01]: Flowsheet prefers FINAL refraction, falls back to MANIFEST
- [Phase 05-01]: Prep Me uses Claude claude-sonnet-4-6-20250514 with 300 max_tokens for 2-sentence summary
- [Phase 05-01]: PHI_VIEWED audit action logged on patient detail access
- [Phase 06-01]: Optical queue queries finalized encounters with is_final_rx refractions
- [Phase 06-01]: Rx Change Alert uses SE formula: sphere + (cylinder/2), threshold 0.50D
- [Phase 06-01]: Rx PDF uses window.print() with print-optimized div (no external lib)
- [Phase 06-01]: Optical status: waiting -> in_progress -> dispensed
- [Phase 06-01]: Print styles use dangerouslySetInnerHTML (not styled-jsx)
- [Phase 08-analytics-dashboard]: kpi_avg_exam_duration used instead of kpi_avg_wait_time (no actual_start_time DB column)
- [Phase 08-analytics-dashboard]: Single aggregate /api/analytics endpoint returns all 7 charts + 4 KPIs in one request
- [Phase 08-analytics-dashboard]: All 7 Recharts chart components defined inline in analytics/page.tsx for SSR safety
- [Phase 08-analytics-dashboard]: GlassCardSkeleton used for KPI loading (shadcn Skeleton not available in project)
- [Phase 08-analytics-dashboard]: Date range picker filters all 7 charts dynamically (7d/30d/90d/6m)
- [AI Scribe V2]: ValidationStationModal provides full-screen SOAP review with field-level confidence scores (HIGH/MEDIUM/LOW)
- [AI Scribe V2]: ConfidenceBadge color-codes suspect fields; FieldReviewer allows field-by-field approval/edit
- [AI Scribe V2]: RefractionMiniGrid shows OD/OS sphere/cylinder/axis with confidence coloring
- [AI Scribe V2]: PATCH `/encounters/{id}/ai-findings` endpoint finalizes validated AI-populated fields
- [Phase 09-claims-basics]: STATUS_STYLES copied inline in PatientBillingTab (not imported from billing page) to avoid cross-component coupling
- [Phase 09-claims-basics]: Old JSONB InsuranceCard removed from DemographicsTab; Insurance tab is the sole insurance surface on patient detail page
- [Phase 09-04]: CreatePayerModal onSave prop typed as Promise<InsurancePayer | void> — avoids TS error when store returns InsurancePayer
- [Phase 09-04]: Payers tab role-gated via session.user.role (AppSession nests role inside user sub-object)
- [Phase 09-claims-basics]: PayerSelectionModal reads open/encounterId from billingStore directly (no props) — only patientId needed at call site
- [Phase 09-claims-basics]: openPayerSelection intercepts auto-superbill-create path in SuperbillEditor — user must pick payer first
- [Phase 09-claims-basics]: 09-07: Per-row PDF loading state uses Record<string, boolean> so multiple rows can download PDFs in parallel without blocking each other
- [Phase 9.1-02]: fetchPayerFeeSchedule uses raw fetch + getAuthHeaders (not apiFetch) to preserve snake_case FeeScheduleItem keys
- [Phase 9.1-02]: Returns Map<string, number> for O(1) CPT lookups; empty map on error or self-pay; payer fee overlay uses ?? fallback to CPT_CATALOG defaultFee
- [Phase 09.1-01]: Use getAuthHeaders() directly (not apiFetch) for insurance/PDF fetches — preserves snake_case keys and supports Blob responses
- [Phase 09.1-01]: Middleware allowlist enumerates /api/public/ and /api/address/ as public; all other /api/* routes require auth (defense-in-depth)
- [Phase 10.1]: Partial unique index (WHERE is_active = true) replaces hard UniqueConstraint on patient_insurance so inactive records are preserved historically
- [Phase 10.1]: Auto-deactivate replaces 409 conflict check on insurance create — new active record silently deactivates same-priority predecessor
- [Phase 10.1-02]: EligibilityBadge defined inline in InsuranceTab.tsx — keeps all insurance UI co-located, no new file
- [Phase 10.1-02]: InsuranceRow replaced by InsuranceCell (stacked label/value) to support 2-column grid card layout
- [Phase 10.1-02]: aria-label used on select/date inputs for accessibility (not htmlFor/id) — simpler given existing visual label siblings
- [Phase 10.1-03]: Eligibility badge added to AppointmentCard (not schedule/page.tsx) — card is the canonical row renderer covering all three view modes
- [Phase 10.1-03]: BillingWorkflow copay derived from existing insurancePlans state matched by billedPayerId — no additional fetch needed
- [Phase 10.1-03]: Batch insurance lookup uses patient_id.in_() single query on appointment list — avoids N+1
- [Phase 10.2-06]: Public booking page uses explicit Tailwind classes (bg-gray-50, text-gray-900) not CSS variables — prevents dark glassmorphism leakage
- [Phase 10.2-06]: data-theme="public-booking" attribute + globals.css override block as defense-in-depth for public pages
- [Phase 10.2-06]: 7-day availability strip replaces full date picker — better mobile UX for patient-facing booking
- [Phase 10.2]: ADD COLUMN IF NOT EXISTS used in migration 0013 for idempotency (checked_in_at already in dev DB)
- [Phase 10.2]: BFF GET already forwards query params — no BFF changes needed for date_from/date_to
- [Phase 10.2]: BookingDrawer calls createAppointment directly from store — no onSubmit prop needed
- [Phase 10.2-07]: Explicit Tailwind opacity classes (text-white/60) used over CSS variables for tab text — CSS variables have insufficient contrast on glassmorphism
- [Phase 10.2-07]: Early return null when !open && !appointment prevents SSR hydration flash in AppointmentDetailDrawer — more reliable than CSS-only translate
- [Phase 10.2-07]: Always-visible X button placed outside appt ternary in AppointmentDetailDrawer so it renders even in empty/loading state
- [Phase 10.2]: staffList mapped at call site to { id, full_name } — keeps BookingDrawer API clean
- [Phase 10.2-03]: Drawer already existed as skeleton — enhanced wiring rather than rewriting; TimelineView/ClinicView onCardClick passthrough deferred
- [Phase 10.2]: dob/sex made optional in PublicBookingRequest; frontend sends null not undefined; FastAPI 422 array detail unwrapped to readable sentences
- [Phase 10.4]: block_type stored as String(20) not SQLAlchemy Enum — avoids native PostgreSQL enum complications
- [Phase 10.4]: Staff back-references use lazy=selectin for eager loading compatibility
- [Phase 10.4-03]: _is_blocked() was already defined in public_booking.py but not called — added call in slot loop to complete wire-up
- [Phase 10.4-03]: public_booking.py imports ORM models only (not staff_schedule routes) — plan independence maintained
- [Phase 10.4]: Tenant.timezone is a direct column (not settings_jsonb) — _resolve_tenant_tz reads it directly; raises HTTP 400 if missing
- [Phase 10.4]: staff_schedule.router registered at /api/staff-schedule to avoid conflict with staff.router at /api/staff
- [Phase 10.4]: TenantContext has no staff_id — resolve_staff(ctx, db) used in clock-in/out routes
- [Phase 10.4-04]: BFF upstream prefix is /api/staff-schedule/ (not /api/staff/) — all 10 BFF routes proxy to this prefix; CSV export uses raw fetch to stream body (proxyToFastAPI would break streaming)
- [Phase 10.4]: [Phase 10.4-06]: staffId sourced from session.user.staffId (camelCase) — confirmed via AppSession type in types/session.ts
- [Phase 10.4]: [Phase 10.4-06]: ClockInButton inserted before theme-toggle in TopNav right-hand action cluster; returns null when staffId absent
- [Phase 10.4]: getWeekDays accepts string not Date — toYMD called at useMemo call site in ScheduleSection
- [Phase 11-marketing-pages]: app/page.tsx deleted (not kept as thin re-export) — Next.js App Router treats (marketing)/page.tsx as / making both routes conflict; deletion resolves build error cleanly
- [Phase 11-marketing-pages]: All five marketing primitives are server components with static inline styles — no use client, no JS hover handlers needed
- [Phase 11-marketing-pages]: 10 compare rows authored with unverified source comments; Wave 2 polish plan will replace with verified vendor URLs
- [Phase 10.3]: [Phase 10.3-03]: init_sentry() lazy-imports sentry_sdk — module importable in dev/test without dep
- [Phase 10.3]: [Phase 10.3-03]: _before_send thin-wraps scrub_event (Plan 01) — tests exercise hook without sentry_sdk
- [Phase 10.3]: [Phase 10.3-03]: requirements.txt lives at repo root (not backend/) — edited root file
- [Phase 10.3]: [Phase 10.3-03]: init_sentry() called at main.py line 19, strictly before first middleware at line 29
- [Phase 10.3]: [Phase 10.3-02]: Next.js sentry configs gate on vercelEnv === production exactly — preview deploys silent to avoid capturing synthetic PHI
- [Phase 10.3]: [Phase 10.3-02]: next.config.mjs wrapped via ES import of withSentryConfig (project uses .mjs, not .js)
- [Phase 10.3]: [Phase 10.3-01]: Single deny list holds snake_case AND camelCase keys (41 total) — avoids second-pass transforms, matches PHI reality in both runtimes
- [Phase 10.3]: [Phase 10.3-01]: Clinical body-drop uses path.startswith(prefix) so nested routes like /api/encounters/123/vitals are covered by parent prefix
- [Phase 10.3]: [Phase 10.3-01]: Structural SentryEvent interface defined locally in TS scrubber — keeps plan independent of @sentry/nextjs install (Plan 10.3-02 territory)
- [Phase 10.3]: [Phase 10.3-01]: Python scrubber applies clinical body-drop BEFORE deny-list — dropping full payload protects against unknown future PHI fields
- [Phase 10.3]: [Phase 10.3-04]: Endpoint tests use direct-handler + fake AsyncSession pattern (not ASGITransport/httpx full-app) because config requires env vars and backend/tests has no conftest
- [Phase 10.3]: [Phase 10.3-04]: Self-pinger guarded on SENTRY_ENVIRONMENT=='production'; dev/test silent
- [Phase 10.3]: [Phase 10.3-04]: Self-pinger loop swallows per-iteration exceptions (WARN log) — Sentry captures the real issue; failing probes must not kill the 60s loop
- [Phase 13-retail-inventory]: 13-02: retail_pos is the first true add-on entitlement — exists in BE Entitlement enum + FE Entitlement const + EntitlementKey union BUT deliberately absent from every PLAN_FEATURES tier (Core/Plus/Premium). Add-ons are billing-layer concerns.
- [Phase 13-retail-inventory]: 13-02: MANAGE_INVENTORY and CANCEL_OPTICAL_ORDER restricted to OWNER/ADMIN only; CREATE_OPTICAL_ORDER excludes DOCTOR (tech/recep/admin/owner only) per CONTEXT §F
- [Phase 13]: [Phase 13-03]: All Phase 13 schemas inherit CamelCaseModel — model_dump default by_alias=True gives camelCase wire format without per-route response_model_by_alias=True
- [Phase 13]: [Phase 13-03]: Product.attributes ships as dict[str, Any] on the wire (NOT a typed Pydantic union) — preserves snake_case JSONB nested keys per Pitfall 1 / feedback_camelizekeys_nested.md; FrameAttributes/ContactLensAttributes are validation-only shapes
- [Phase 13]: [Phase 13-03]: FrameAttributes/ContactLensAttributes override inherited model_config to drop alias_generator while keeping from_attributes + populate_by_name + extra=allow — cleaner than per-field alias= overrides
- [Phase 13]: [Phase 13-03]: Decimal fields typed as string in TS interfaces (retailPrice, costPrice, unitPrice, lineTotal, totalPrice) — matches Pydantic JSON serialization convention
- [Phase 13-retail-inventory]: [Phase 13-00]: Used try/except → pytest.skip(allow_module_level=True) instead of pytest.importorskip for backend modules whose import triggers Settings() instantiation (importorskip only catches ImportError, not pydantic.ValidationError)
- [Phase 13-retail-inventory]: [Phase 13-00]: db_session and tenant_context fixtures defined as Wave-0 skip-stubs in conftest.py so tests skip cleanly during fixture resolution; Wave 1 replaces with real async-session + TenantContext fixtures
- [Phase 13-01]: JSONB server_default uses sa.text() to bypass SQLAlchemy double-quoting under asyncpg driver
- [Phase 13-01]: Partial unique index on (tenant_id, sku) WHERE is_active=true mirrors PatientInsurance pattern from Phase 10.1 — preserves historical SKUs
- [Phase 13-01]: OpticalOrder.created_by uses explicit foreign_keys=[created_by_id] to avoid Staff multi-FK ambiguity
- [Phase 13-retail-inventory]: 13-08: Idempotent seed pre-checks (tenant_id, sku, is_active=true) — matches partial unique index from migration 0017; re-runs of python backend/seed_db.py add zero rows
- [Phase 13-retail-inventory]: 13-08: snake_case JSONB attribute keys (eye_size, base_curve, box_size, etc.) preserved end-to-end per Pitfall 1 — frame attrs has 8 keys, contact attrs has 6 keys
- [Phase 13-retail-inventory]: 13-06: All 9 BFF routes use Promise<{ ... }> async params shape (matches dominant Next.js 14 convention; 46 of 54 existing dynamic-segment BFF routes use it)
- [Phase 13-retail-inventory]: 13-06: Trailing slash on every upstream URL including action endpoints (place/cancel/dispense/receive/adjust) per .claude/rules/bff-api.md — without it FastAPI returns 307 that drops auth headers

### Pending Todos

None.

### Blockers/Concerns

- **10.3-07 Task 3 (HIPAA-critical human checkpoint):** Phase 10.3 cannot close until OWNER runs the staging canary procedure in `10.3-07-PLAN.md` Task 3 `<how-to-verify>` against a real Sentry DSN and ticks the 6 Manual rows in `10.3-VERIFICATION.md`. Automated coverage (plans 01-06 + 07 tasks 1-2) is green; remaining work is live-Sentry + scrubber + email alert verification. Canary routes must be reverted before merge.

## Session Continuity

Last session: 2026-05-01T19:38:16.239Z
Stopped at: Completed 13-08-PLAN.md (retail inventory seed)
Resume file: None

**Phase 9 Overview:**

- Extends Phase 4 (Superbill) with insurance infrastructure: payer CRUD, patient insurance records, per-payer fee schedules
- New admin tab for payer management + fee schedule editing
- New Insurance tab on patient detail page (primary/secondary capture)
- CMS-1500 PDF generation via reportlab (server-side, clean professional layout)
- Pre-seed ~10 California payers (VSP, EyeMed, Davis Vision, Medicare, Medi-Cal, etc.)
- Manual status transitions (draft → ready_to_bill → submitted → accepted/rejected)
- Electronic clearinghouse integration deferred to V3-01
