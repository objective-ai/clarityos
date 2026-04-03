---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: Completed 10.1-03-PLAN.md — insurance surface (TopNav chips, schedule badges, billing copay)
last_updated: "2026-04-03T22:48:35Z"
progress:
  total_phases: 10
  completed_phases: 0
  total_plans: 3
  completed_plans: 3
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: Completed 10-03-PLAN.md — encounter mode split and StickyMicButton FAB
last_updated: "2026-03-27T21:49:17.472Z"
progress:
  total_phases: 19
  completed_phases: 7
  total_plans: 24
  completed_plans: 29
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: in_progress
stopped_at: Phase 9.2 complete — all 60 requirements marked Complete
last_updated: "2026-03-27T09:24:51.157Z"
progress:
  total_phases: 18
  completed_phases: 6
  total_plans: 21
  completed_plans: 26
  percent: 100

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-05)

**Core value:** Clinicians can complete a full eye exam encounter in a workflow that feels faster than paper, with every action audited and every record tamper-proof.
**Current focus:** Phase 10.1 — insurance-revamp

## Current Position

Phase: 10.1 (insurance-revamp) — COMPLETE
Plan: 3 of 3 (all complete)

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

## Accumulated Context

### Roadmap Evolution

- Phase 10 added: Encounter Workflow Redesign — pre-test/doctor mode split, sticky mic, AI Scribe at bottom, role-based tab visibility. Old Phases 10-16 renumbered to 11-17.
- Phase 10.2 inserted after Phase 10: Revamp Schedule & Booking Page (URGENT)
- Phase 10.5 inserted after Phase 10: Error Monitoring & System Status — Sentry integration (FastAPI + Next.js) + admin status page (URGENT)
- Phase 10.1 inserted after Phase 10: Insurance Revamp — enrich insurance fields (copay, auth code, eligibility, position, active) (URGENT)
- Patient Document Management moved back to V3-08 — research captured in memory (research_document_management.md)

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

### Pending Todos

None.

### Blockers/Concerns

None active.

## Session Continuity

Last session: 2026-04-03T22:48:35Z
Stopped at: Completed 10.1-03-PLAN.md — insurance surface (TopNav chips, schedule badges, billing copay)
Resume file: None

**Phase 9 Overview:**

- Extends Phase 4 (Superbill) with insurance infrastructure: payer CRUD, patient insurance records, per-payer fee schedules
- New admin tab for payer management + fee schedule editing
- New Insurance tab on patient detail page (primary/secondary capture)
- CMS-1500 PDF generation via reportlab (server-side, clean professional layout)
- Pre-seed ~10 California payers (VSP, EyeMed, Davis Vision, Medicare, Medi-Cal, etc.)
- Manual status transitions (draft → ready_to_bill → submitted → accepted/rejected)
- Electronic clearinghouse integration deferred to V3-01
