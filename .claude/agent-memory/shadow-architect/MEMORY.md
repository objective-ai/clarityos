# Shadow Architect — Working Memory

## Last Scan
- Commit: `6da46f9` + uncommitted Phase 1 Audit Fixes
- Date: 2026-03-04
- Scope: Full audit — models, routes, schemas, stores + audit infrastructure

## Known Issues Being Tracked

| # | Severity | Issue | File | Status |
|---|----------|-------|------|--------|
| 1 | CRITICAL | No AuditLog table (HIPAA 164.312b) | `clinical.py` | **RESOLVED** — AuditLog model + `log_action()` implemented |
| 2 | WARNING | Diagnosis hard-deletes (no SoftDeleteMixin) | `diagnosis.py` | **RESOLVED** — SoftDeleteMixin added, soft-delete endpoint |
| 3 | WARNING | ExamFindings recorded_by_id uses ctx.user_id | `exam_findings.py` | **RESOLVED** — uses `resolve_staff()` now |
| 4 | WARNING | Vitals route never sets recorded_by_id | `vitals.py` | **RESOLVED** — uses `resolve_staff()` now |
| 5 | WARNING | patient_problem.py missing audit logging | `patient_problem.py` | OPEN |
| 6 | WARNING | No RBAC enforcement on routes | `permissions.py` | **RESOLVED** — `require_permission()` + `PERMISSION_MATRIX` |
| 7 | WARNING | Dev auth bypass unguarded | `security.py` | OPEN |
| 8 | INFO | RLS policies not implemented | — | PLANNED |
| 9 | INFO | No ICD-10 lookup table | — | PHASE 2 |
| 10 | INFO | Refraction lacks SoftDeleteMixin | `clinical.py` | OPEN |
| 11 | INFO | No amendment workflow (HIPAA 164.526) | — | PLANNED |

## Change Log

| Date | Commit | Files Changed | Impact | Manual Updated |
|------|--------|---------------|--------|----------------|
| 2026-03-04 | 6da46f9 | Initial seed | Full Phase 1 Clinical Core documented | Yes — all 6 sections |
| 2026-03-04 | uncommitted | audit.py, security.py, clinical.py, diagnosis.py, vitals.py, exam_findings.py, encounter.py, promotion.py | AuditLog table, resolve_staff, soft-delete for Diagnosis, audit logging on all routes except patient_problem.py | Yes — Sections II, III, IV, VI updated |
| 2026-03-04 | uncommitted | permissions.py, staff.py, PermissionGate.tsx, useEntitlements.ts | RBAC engine (16 actions × 5 roles), staff management endpoints, frontend PermissionGate | Yes — Sections VIII, IX added; VI.G gap closed |
| 2026-03-04 | uncommitted | session.ts, useEntitlements.ts, mock-session.ts, mock-staff-data.ts, admin/page.tsx | Dual owner/practician module: optional clinical_role on owner, dual-role RBAC resolution, admin panel with staff form | Yes — VIII.A, VIII.E, IX.B, IX.D updated |
| 2026-03-04 | uncommitted | encounterStore.ts, layout.tsx, encounter page, mock-patient-data.ts | chiefComplaint field + Patient Context Fallback (3-tier: Store → mapping lib → patient hydration) | Yes — Section V updated |
| 2026-03-04 | planned | ai_scribe.py, useAiScribe.ts, encounter page (AiScribeWidget), encounterStore.ts | Phase 2: AI Scribe — streaming SSE, dual-output (SOAP + JSON), Accept auto-fill 5 stores, mock fallback | Yes — Section X added; VIII.B updated (17 actions) |
| 2026-03-04 | uncommitted | TECHNICAL_MANUAL.md (X.I–X.L), pitch-california.md | Phase 2 complete: ClinicalDiffViewer (field-level diff, per-revert), FinalizeModal (7-step, attestation, IOP alert), AuditTrailSidebar (Bot icon + embedded diff), new AuditActions (AI_SCRIBE_GENERATED, AI_SCRIBE_AUTOFILL), Accept endpoint; pitch updated with Section 8 + roadmap | Yes — Section X.I, X.J, X.K, X.L added; pitch Section 8 added |
| 2026-03-04 | uncommitted | encounterStore.ts, FinalizeModal.tsx, PatientStickyHeader.tsx, encounter page | FinalizeModal: Zustand-trigger (single instance via `finalizeModalOpen` + `partialize`), diagnosis guardrail (blocks submit without ICD-10), API integration (`POST /finalize`), AI Scribe lockdown on finalized encounters (sans-serif prose), removed inline Dialog from PatientStickyHeader | Yes — X.J updated with actual implementation |

| 2026-03-05 | uncommitted | TECHNICAL_MANUAL.md (Sections IV, V, XI, XII) | Full gap-fill from codebase scan: audit routes, EncounterStore Phase 2 fields, api-client, personas.ts, EncounterBottomTabs, ProblemListCard, problemListStore, patient detail page, PatientChartModal, analytics skeleton | Yes — IV, V, XI, XII added/expanded |
| 2026-03-05 | uncommitted | TECHNICAL_MANUAL.md (correctons) | Full audit pass (grade A+): Fixed SidebarContext (prop-based, no Context file), fixed admin/page.tsx (not yet built), FinalizeModal confirmed 5-section + attestation | Yes — V, VIII.E, IX.D corrected |

## Last Full Audit
- Date: 2026-03-05
- Grade: A+ — all core systems verified accurate against live codebase
- Confirmed accurate: ai_scribe.py, useAiScribe.ts, FinalizeModal.tsx, ClinicalDiffViewer.tsx, AuditTrailSidebar.tsx, audit.py, api-client.ts, encounterStore.ts, problemListStore.ts, personas.ts, ProblemListCard.tsx, EncounterBottomTabs.tsx, patient detail page
- Corrections applied: SidebarContext (doesn't exist — sidebar passed as prop), admin/page.tsx (planned, not built)

## Next Audit Focus
- Add audit logging to patient_problem.py (gap #5)
- Build `app/(tenant)/[tenantId]/admin/page.tsx` staff management UI (backend ready, frontend planned)
- Track `unlockForAddendum()` TODO in encounterStore — Phase 3 amendment workflow (gap #11)
- Check entitlement gating on ADVANCED_ANALYTICS premium feature
- Implement RLS policies (gap #8 — Python-layer enforcement is current primary)
