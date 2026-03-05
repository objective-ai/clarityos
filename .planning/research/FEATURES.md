# Feature Landscape

**Domain:** Optometry EHR/PMS — Production Readiness Milestone
**Project:** ClarityOS EHR (multi-tenant SaaS, California solo/small-group practices)
**Researched:** 2026-03-05
**Research mode:** Ecosystem + Feasibility
**Scope:** Auth, scheduling, FHIR R4 interoperability, clinical amendments, patient timeline, analytics

---

## Context: Current State vs Target State

The frontend is fully built on mock data. The encounter workflow (vitals, refractions, findings, AI Scribe, finalization, RBAC, audit) is complete. This milestone wires everything to real data: real auth, real API, and adds the missing clinical capabilities (addenda, patient detail, scheduling) plus regulatory compliance (FHIR export, HIPAA read-logging, session security).

---

## Table Stakes

Features users expect from any production clinical system. Shipping without these means the system cannot be used in a real practice — or exposes the business to HIPAA liability.

### Authentication & Session Security

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Login page with email/password | Every SaaS product has one. No real auth exists today — root redirects to demo tenant. | Low | Supabase Auth `signInWithPassword`. Requires `/login` route + `middleware.ts`. |
| Next.js middleware route protection | Without it, all 9 tenant pages are publicly accessible via direct URL. CRITICAL gap per CONCERNS.md #5. | Low | `middleware.ts` at project root, `supabase.auth.getUser()` on every request. |
| Real session hydration replacing mock | `getMockSession("premium_doctor")` runs unconditionally. CRITICAL gap per CONCERNS.md #4. | Medium | `sessionStore.ts` must call `supabase.auth.getUser()` on mount, parse JWT claims for role/entitlements. |
| Automatic session timeout (15–30 min inactivity) | HIPAA requires automatic logoff after inactivity. 7-day token is non-compliant. Current CONCERNS.md #16. | Medium | Supabase Pro plan enables inactivity timeout config. Alternatively implement activity tracker in React. |
| Logout clears all ePHI from localStorage | Current logout only clears session store. Patient data and AI transcripts persist across users on shared workstations. CONCERNS.md #24. | Low | `clearSession()` must call `localStorage.clear()` or selectively purge known keys. |
| JWT secret from environment (no dev bypass) | Backend grants doctor access when `SUPABASE_JWT_SECRET` is empty. CRITICAL gap per CONCERNS.md #1. | Low | Guard must require env var at startup — no fallback identity. |
| Remove hardcoded `SECRET_KEY` and Supabase URL | Committed secrets are public. CONCERNS.md #2, #3. | Low | Config must fail startup if these are not set from env. |

### Scheduling

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Appointment data model + API | Schedule page is 100% mock. No ORM model, no FastAPI router exists. CONCERNS.md #8. | Medium | `Appointment` model: patient_id, provider_id, start_time, end_time, type, status, notes. FastAPI router + CRUD. |
| Calendar view (day/week) with existing appointments | Clinics plan their day from a calendar. The UI shell exists; it needs real data. | Medium | Replace `lib/mock-schedule-data.ts` with `GET /api/appointments?date=&provider_id=` fetch. |
| Create appointment from schedule view | Clicking a time slot should open a booking form and persist via API. | Medium | `POST /api/appointments`. Status transitions: `scheduled → checked_in → in_exam → completed → cancelled`. |
| Appointment status transitions (check-in workflow) | Front desk marks patients as arrived; provider sees queue. Standard PMS workflow. | Medium | Status field + `PATCH /api/appointments/{id}/status`. RBAC: receptionist can check in, provider can start exam. |
| Cancel / reschedule appointment | Required for any functional schedule. Must log who cancelled and when. | Low | `DELETE` soft-delete or status=cancelled. Audit log entry required. |
| Create encounter from appointment | Pressing "Start Exam" on a scheduled appointment creates an encounter record. | Medium | Links `Appointment.encounter_id` to the resulting `Encounter`. Prevents duplicate encounters per appointment. |

### Patient Detail Page

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Patient API (CRUD) | No patient routes exist in FastAPI. CONCERNS.md #8. All patient data is mock. | High | `Patient` model routes: `GET /patients/`, `GET /patients/{id}`, `POST /patients/`, `PATCH /patients/{id}`. |
| Patient detail page with Rx history | Clinicians need to compare current vs prior Rx at a glance — this is central to optometric care. | Medium | `/patients/[patientId]` page. Show: demographics, master problem list, refraction timeline (OD/OS side-by-side across visits), IOP trend graph. |
| Encounter timeline on patient chart | "What has this patient been seen for?" is a daily clinical question. | Medium | Chronological list of finalized encounters with chief complaint, diagnoses, date, provider. Link to encounter view. |
| Refraction comparison across visits | Tracking Rx change over time is diagnostic (myopia progression, post-surgical). | Medium | Table or sparkline showing sphere/cylinder/axis/VA per visit per eye. Diff vs prior visit highlighted. |
| Patient search (name, DOB, MRN) | Basic PMS functionality — without it staff cannot find patients. | Low | Already has UI. Needs `GET /patients/?q=` endpoint with ilike search on name + exact match on DOB/MRN. |

### Clinical Amendments (Addenda)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Addendum creation on finalized encounter | HIPAA requires that corrections do not overwrite original signed content. Standard clinical workflow. | Medium | New `EncounterAddendum` model: `encounter_id`, `author_id`, `created_at`, `content` (text, immutable after creation). No field-level editing of original. |
| Original record preserved verbatim | Amendment must not alter the original finalized encounter. Records that are altered post-finalization are inadmissible. | Low | Backend enforces: finalized encounter fields are read-only. Addenda are append-only separate records. |
| Addendum displayed in encounter view | Clinical staff must see addenda inline with the encounter, clearly labeled with author and timestamp. | Low | UI: below the finalized encounter section, chronological list of addenda with "Added by [Dr. X] on [date]" header. |
| Addendum audit log entry | Every addendum creation is a PHI modification event. HIPAA requires attribution and timestamp. | Low | `log_action(action="ADDENDUM_CREATED", ...)` in addendum creation route. |
| No reopening of finalized encounters | Reopening and re-signing is legally problematic and creates attribution ambiguity. | Low | Backend `is_finalized=True` check blocks all field updates. Only addendum endpoint is permitted. |

### HIPAA Compliance (Blocking Gaps)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| PHI read access logging on GET endpoints | HIPAA 164.312(b) requires logging all ePHI access, including reads. CONCERNS.md #6 is CRITICAL. | Medium | `log_action(action="READ", resource_type=..., resource_id=...)` on every GET that returns ePHI. |
| Audit trail sidebar working in production | Currently calls a non-existent Next.js route — 404 in every deployment. CONCERNS.md #13. | Low | Point `AuditTrailSidebar` fetch to the FastAPI URL via `apiFetch()` instead of relative path. |
| AI transcript cleared from localStorage after finalization | Clinical transcript persists indefinitely on shared workstations. CONCERNS.md #14. | Low | Clear `localStorage['draft-transcript-{encounterId}']` in the finalization callback. |
| Devtools disabled in production | Supabase + encounter state (ePHI) is broadcast to Redux DevTools extension. CONCERNS.md (LOW). | Low | Wrap all `devtools(...)` in `process.env.NODE_ENV === 'development'` guard. |
| Diagnosis `recorded_by_id` column | Most clinically significant data has no direct staff attribution. CONCERNS.md HIPAA #4. | Low | Add `recorded_by_id` FK to `Diagnosis` model. Alembic migration. Backfill via audit log for existing rows. |

### Infrastructure Prerequisites (Blocking All Features)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Move FastAPI out of `app/` directory | Python files co-located with Next.js pages causes namespace collision and build contamination. CONCERNS.md #7 CRITICAL. | Low | Move everything to `backend/`. Update import paths. Update Vercel ignore settings. |
| Alembic migrations | No migration tooling means every schema change is manual SQL. Schema cannot evolve safely without it. CONCERNS.md #20. | Medium | `alembic init`, generate initial migration from existing models, workflow: `alembic revision --autogenerate` + `alembic upgrade head`. |
| Fix Next.js API route mismatches | Three frontend calls target relative `/api/*` paths that don't exist as Next.js handlers. CONCERNS.md #13. | Low | Either create Next.js proxy `route.ts` files, or rewrite those fetch calls to use `apiFetch()` with full FastAPI URL. |
| Pin Python dependencies | `>=` constraints mean non-deterministic installs. CONCERNS.md #35. | Low | `pip freeze > requirements.lock` or migrate to `uv` + `uv.lock`. |
| Next.js security headers | Empty `next.config.mjs` — no CSP, no X-Frame-Options, no HSTS. | Low | Add security headers in `nextConfig.headers()`. Standard list for healthcare. |

---

## Differentiators

Features that distinguish ClarityOS from legacy optometry EHRs (RevolutionEHR, MaximEyes, Eyefinity). Not expected by default, but valued by modern practices.

### FHIR R4 Export

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| `VisionPrescription` FHIR export | Optometry's primary interoperability output. Unique to vision care — most general EHRs handle it poorly. Maps sphere/cylinder/axis/add/prism per eye directly from `Refraction` model. | Medium | FHIR R4 `VisionPrescription` resource has exact fields for optometric Rx. Required: status, created, patient ref, dateWritten, prescriber ref, lensSpecification[]. Source: [HL7 R4 spec](https://hl7.org/fhir/R4/visionprescription.html). |
| `Patient` + `Encounter` FHIR export | Enables care coordination — patient moves to a specialist, takes their record. | Medium | `Patient` resource: name, DOB, gender, address, identifier (MRN). `Encounter` resource: status, class, type (routine eye exam), subject (patient ref), period, participant (provider ref). |
| `Condition` FHIR export (diagnoses) | Referring providers need structured diagnosis data (ICD-10), not just free text. | Medium | One `Condition` resource per finalized diagnosis. Maps `icd10_code`, `laterality`, `encounter_id`. `clinicalStatus`, `verificationStatus`, `code` (CodeableConcept with ICD-10 system). |
| `Observation` FHIR export (vitals, IOP) | Downstream systems can trend IOP and VA over time when structured as Observations. | Medium | IOP, uncorrected VA, corrected VA each as `Observation` resources. LOINC codes for standard ophthalmic measurements. |
| Per-encounter export endpoint | Clinician clicks "Export for referral" on a finalized encounter and gets a FHIR Bundle. | Low | `GET /api/encounters/{id}/fhir-export` returns `Bundle` with Patient + Encounter + Condition[] + Observation[] + VisionPrescription. |
| Tenant-level bulk export | Practice downloads all patient data (portability requirement). | High | Bulk FHIR export is complex — defer to later milestone unless 21st Century Cures Act certification is a near-term goal. |

**FHIR implementation strategy:** Export-only (no full FHIR server). Per the project's established decision, `GET /fhir/Encounter/{id}` style endpoints returning FHIR-shaped JSON are achievable without a dedicated FHIR server. This is appropriate for the target market (solo practices do not need FHIR servers — they need referral export). Confidence: HIGH (aligns with project KEY DECISIONS and industry pattern for small EHR vendors).

### AI-Enhanced Clinical Workflow

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| AI Scribe (already shipped) | Streaming SOAP generation from clinical transcript. Differentiates from any legacy optometry EHR. Already built. | — | Exists. Key gap: accept endpoint calls non-existent Next.js route. Wire to `apiFetch()`. |
| ICD-10 search against full code set | Current picker has 25 hardcoded codes. Full ICD-10-CM has ~70,000 codes. Real practices need search across all of them. | Medium | Options: (a) embed SQLite with full ICD-10 data served by FastAPI search endpoint; (b) use a free public API (CMS ICD-10 API). Option (a) is more reliable offline. Endpoint: `GET /api/icd10/search?q=`. |
| AI-generated assessment summary on patient chart | Show an AI-synthesized summary of the patient's clinical history across all visits. | High | Requires patient timeline data first. Defer to later milestone. |

### Analytics

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Real encounter KPIs (patients seen, no-shows, avg exam time) | Current analytics page shows hardcoded strings. No chart library exists. CONCERNS.md #30. Premium users expect this. | Medium | Backend: aggregation queries on `Appointment` and `Encounter` tables. Frontend: add Recharts (131KB gzipped). KPIs: total visits, no-show rate, new vs returning, provider utilization. |
| Refraction trend chart per practice | Aggregate myopia progression data across patient population — valuable for practice research. | High | Defer. Requires enough real encounter data to be meaningful. |
| Revenue per exam (ClinicalKPI) | Optometry derives ~61% of profit from optical sales. Connecting Rx-to-dispense rates would be differentiating. | Very High | Blocked by absence of billing/optical module (out of scope). |

### UX Differentiators (Already Present, Maintain)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Glassmorphism design system | Modern aesthetic vs legacy EHR ugliness. Major differentiator for clinician adoption. | — | Already built. Must be maintained as new pages are added. Use `DESIGN_TEMPLATE.md`. |
| Keyboard-optimized refraction grid | Clinicians enter Rx data without lifting hands from keyboard. Speed differentiator. | — | Already built. No changes needed. |
| Clinical diff viewer for AI suggestions | Field-level comparison before accepting AI-generated data. Builds trust in AI recommendations. | — | Already built. Wire to real accept endpoint. |

---

## Anti-Features

Features to explicitly NOT build in this milestone. Either out of scope, complexity not justified for target market, or architecturally premature.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Full FHIR server (FHIR REST API with search, update, delete) | Implementation cost $50K–$500K. Solo practices do not use FHIR servers — they consume referral exports. ONC certification not a near-term goal. | Export-only FHIR Bundle endpoint per encounter. |
| Patient portal (online booking, Rx viewing, secure messaging) | Explicitly deferred in PROJECT.md. Adds multi-user auth complexity (patient auth separate from staff auth). Different auth domain. | Add to next major milestone after auth is proven stable. |
| Billing & insurance integration (CMS-1500, ERA, clearinghouse) | Out of scope per PROJECT.md. Clearinghouse integrations require EDI 837/835, which is a separate specialty. | `BILLING_EXPORT` entitlement placeholder exists. Document as future milestone. |
| Optical POS / frame inventory | Out of scope per PROJECT.md. Separate data model (inventory, lens matrix, supplier catalogs). | Future milestone. RevolutionEHR is the benchmark to eventually compete with here. |
| OCT / visual field device import (HL7 ORU, DICOM) | Out of scope per PROJECT.md. Device integration requires vendor SDKs and DICOM server. | Future milestone. Most devices use proprietary protocols. |
| Multi-provider real-time collaboration on same encounter | Explicitly out of scope per PROJECT.md. WebSocket complexity not justified for 1-4 provider target market. | Single-provider locking on encounter is sufficient. |
| SMS/email appointment reminders | Valuable but requires Twilio/SendGrid integration. Adds vendor dependency and cost. | Defer to scheduling V2. Slots exist in the appointment model design. |
| Online patient self-scheduling | Valuable but requires public-facing booking page (separate auth domain, availability logic). | Defer. Internal staff scheduling is the immediate need. |
| Native mobile app | Web-first per PROJECT.md. Responsive design covers clinical tablet use. | Do not add React Native. |
| SMART on FHIR authorization server | Required for ONC certification but enormously complex. Not needed for export-only FHIR. | Export with standard bearer token auth (Supabase JWT). |
| Real-time analytics (live dashboard streaming) | WebSocket/SSE complexity for no tangible benefit at solo-practice scale. | Daily-aggregated KPIs via REST are sufficient. Recharts renders from static queries. |

---

## Feature Dependencies

```
Real auth (Supabase + middleware)
  └── Real session hydration (sessionStore.ts)
       └── Backend JWT verification (remove dev bypass)
            └── All protected API calls work end-to-end

Move FastAPI to backend/
  └── Alembic migrations
       └── Patient API (new table + routes)
            └── Patient detail page
                 └── Refraction timeline (needs real encounter data)
                      └── FHIR VisionPrescription export (maps from Refraction model)

Patient API
  └── Appointment API (appointments reference patients)
       └── Calendar view with real data
            └── Create encounter from appointment (appointment.encounter_id)

Real encounter data (non-mock)
  └── Real addenda (finalized encounters in DB)
       └── Analytics KPIs (aggregate real data)

PHI read logging (HIPAA prerequisite)
  └── Audit trail sidebar working in production
       └── Fix API route mismatches (audit log calls 404 today)

Alembic migrations
  └── Diagnosis recorded_by_id column (schema change)
  └── EncounterAddendum table (new model)
  └── Appointment table (new model)

ICD-10 full search
  └── ICD-10 data embedded in backend (SQLite or fixture)
       └── Search endpoint: GET /api/icd10/search?q=
            └── DiagnosisPicker search replaces static list

Real analytics data
  └── Appointment model (no-show tracking)
       └── Encounter + appointment join queries
            └── KPI aggregation endpoints
                 └── Analytics page (replace hardcoded StatCards + add Recharts)
```

---

## MVP Recommendation for This Milestone

### Must Ship (Blocking — Cannot Claim "Production Ready" Without These)

1. **Security hardening** — Remove dev bypasses, add `middleware.ts`, fix `clearSession`, add security headers. No live practice can use the system with current gaps.
2. **Real authentication** — Supabase Auth login page, real session hydration, inactivity timeout.
3. **Move FastAPI to `backend/`** — Resolves architectural conflict. All subsequent work depends on this.
4. **Alembic migrations** — Cannot safely evolve schema without them.
5. **Wire existing frontend to FastAPI** — Replace all 9 mock imports with real API calls store by store.
6. **PHI read logging** — HIPAA required. Add `log_action("READ", ...)` on all GET ePHI endpoints.
7. **Fix 404 API routes** — Audit sidebar, AI accept, admin audit log all call non-existent handlers.

### Should Ship (Core New Capabilities)

8. **Patient API + patient detail page** — Patient chart with Rx history is a primary clinical tool.
9. **Encounter addenda** — Required for clinical correction workflow. Straightforward to implement.
10. **Appointment model + scheduling API** — Schedule page backend. Calendar view wired to real data.
11. **FHIR R4 export** — VisionPrescription + Patient + Encounter + Condition per encounter. Core interoperability. Export-only, no FHIR server.
12. **ICD-10 full code search** — 25-code picker is a clinical liability. Embed SQLite ICD-10 fixture.

### Defer (Desirable but Not Blocking)

13. **Analytics dashboard with real data + Recharts** — Useful but data-dependent. Priority after real encounter data flows.
14. **MFA (TOTP)** — HIPAA 2025 rule will mandate it for remote access. Supabase TOTP is free and easy. Can be added after core auth is stable.
15. **Appointment reminders (SMS/email)** — Requires third-party vendor. Defer to scheduling V2.
16. **Bulk FHIR export** — Per-encounter export covers the referral use case. Bulk is for ONC certification.
17. **AI patient history synthesis** — Needs real multi-visit data first. Milestone after analytics.

---

## Sources

- [HIPAA 2025 Security Rule Updates (MFA mandate)](https://www.aqedigital.com/blog/hipaa-2025-security-rule-updates/)
- [HIPAA Password & Session Requirements](https://www.hipaajournal.com/hipaa-password-requirements/)
- [Supabase Auth Session Configuration](https://supabase.com/docs/guides/auth/sessions)
- [Supabase Auth with Next.js App Router](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
- [Supabase MFA TOTP](https://supabase.com/docs/guides/auth/auth-mfa/totp)
- [HL7 FHIR R4 VisionPrescription Resource](https://hl7.org/fhir/R4/visionprescription.html)
- [FHIR R4 Observation Resource](https://hl7.org/fhir/R4/observation.html)
- [HIPAA Medical Record Amendments](https://hipaatimes.com/handling-medical-record-corrections-and-amendments-under-hipaa)
- [MedPro EHR Amendment Best Practices](https://www.medpro.com/ehr-amendments)
- [RevolutionEHR: 10 Must-Have Optometry EHR Features](https://www.revolutionehr.com/blogs/10-must-have-features-optometry-software)
- [Optometry Practice Analytics Metrics](https://www.optometrytimes.com/view/know-what-practice-metrics-measure)
- [EHR Scheduling Features 2025](https://www.nexhealth.com/resources/ehr-appointment-scheduling)
- [FHIR Implementation Complexity for Small EHR Vendors](https://www.sprypt.com/blog/fhir-guide)
- [21st Century Cures Act FHIR R4 Requirements](https://dynamichealthit.com/post/the-21st-century-cures-act-final-rule-what-it-means-for-developers/)
