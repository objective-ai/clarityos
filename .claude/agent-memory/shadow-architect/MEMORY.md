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

## Next Audit Focus
- Add audit logging to patient_problem.py (gap #5)
- Verify ALL routes use `require_permission()` instead of bare `get_current_tenant`
- Verify refraction route checks is_finalized before writes
- Check for schema drift between Pydantic schemas and TypeScript types
- Verify all Zustand store API URLs match actual FastAPI routes
- Check entitlement gating on premium features (AI Scribe)
