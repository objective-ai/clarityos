# ClarityOS HIPAA Security Risk Assessment (SRA) Report

**Generated:** 2026-03-07
**Assessor:** Sub Auditor (Automated Codebase Analysis)
**Scope:** Full codebase — backend (FastAPI), frontend (Next.js 14), database layer (PostgreSQL/Supabase), AI features
**Applicable Standards:** HIPAA Security Rule (45 CFR Part 164), California Civil Code 1798.82, California H&S Code 123100-123149.5

---

## Executive Summary

ClarityOS demonstrates a **mature security posture for an early-stage EHR** with several critical HIPAA controls already implemented: JWT-based authentication with JWKS verification, comprehensive RBAC (5 roles x 26 actions), immutable audit logging (HIPAA 164.312(b)), soft-delete on all PHI models, finalization locks on clinical records, session timeout with ePHI cleanup, and security headers (CSP, X-Frame-Options, X-Content-Type-Options).

However, the assessment identifies **4 Critical**, **8 High**, **6 Medium**, and **5 Low** risk findings that must be addressed before production deployment with real patient data.

---

## Table of Contents

1. [Security Risk Assessment (SRA)](#1-security-risk-assessment-sra)
   - 1.1 [Administrative Safeguards (164.308)](#11-administrative-safeguards-164308)
   - 1.2 [Physical Safeguards (164.310)](#12-physical-safeguards-164310)
   - 1.3 [Technical Safeguards (164.312)](#13-technical-safeguards-164312)
   - 1.4 [Organizational Requirements (164.314)](#14-organizational-requirements-164314)
2. [Business Associate Agreement (BAA) Analysis](#2-business-associate-agreement-baa-analysis)
3. [ePHI Data Flow Mapping](#3-ephi-data-flow-mapping)
4. [Findings Summary Table](#4-findings-summary-table)
5. [Remediation Roadmap](#5-remediation-roadmap)

---

## 1. Security Risk Assessment (SRA)

### 1.1 Administrative Safeguards (164.308)

#### 1.1.1 Security Management Process -- 164.308(a)(1)

| Control | Status | Details |
|---------|--------|---------|
| Risk Analysis | PARTIAL | This document constitutes an automated code-level risk analysis. A formal organizational risk analysis (paper policies, workforce procedures) is out of scope but required. |
| Risk Management | PARTIAL | Technical controls exist; organizational risk management program not evidenced in codebase. |
| Sanction Policy | NOT EVIDENCED | No workforce sanction policy found in codebase. Required as organizational policy. |
| Information System Activity Review | IMPLEMENTED | `AuditLog` model with append-only design, tenant-wide log review endpoint with CSV export (`backend/api/routes/audit.py`). Supports filtering by user, action, date range, patient. |

#### 1.1.2 Workforce Security -- 164.308(a)(3)

| Control | Status | Details |
|---------|--------|---------|
| Authorization/Supervision | IMPLEMENTED | RBAC permission matrix (`backend/core/permissions.py`) with 5 roles (doctor, technician, receptionist, admin, owner) x 26 clinical actions. Role checked on every API call via `require_permission()`. |
| Workforce Clearance | NOT EVIDENCED | No background check workflow in codebase (organizational control). |
| Termination Procedures | IMPLEMENTED | Staff `is_active` flag (`clinical.py:181`). Inactive staff records are filtered out in `resolve_staff()`. Deactivation via `PATCH /api/staff/{id}` with `is_active: false`. |

#### 1.1.3 Security Awareness and Training -- 164.308(a)(5)

| Control | Status | Details |
|---------|--------|---------|
| Security Reminders | NOT EVIDENCED | No in-app security reminders. |
| Login Monitoring | IMPLEMENTED | Session timeout modal warns at 28 minutes idle (`SessionTimeoutModal.tsx`). Supabase Auth handles login events. |
| Password Management | DELEGATED | Password management delegated to Supabase Auth (bcrypt hashing, password policy configurable via Supabase dashboard). |

#### 1.1.4 Contingency Plan -- 164.308(a)(7)

| Control | Status | Severity | Details |
|---------|--------|----------|---------|
| Data Backup Plan | NOT EVIDENCED | **HIGH** | No backup configuration found in codebase. Relies on Supabase's managed PostgreSQL backups (daily snapshots). Must be documented and tested. |
| Disaster Recovery Plan | NOT EVIDENCED | **HIGH** | No DR plan documented. Supabase provides point-in-time recovery (PITR) on Pro plans but this must be verified and documented. |
| Emergency Mode Operation | NOT EVIDENCED | **MEDIUM** | No emergency access procedure defined for system outages. |
| Testing & Revision | NOT EVIDENCED | **MEDIUM** | No evidence of backup/DR testing procedures. |

**Finding SRA-001 [HIGH]:** No documented data backup and disaster recovery plan. Supabase provides managed backups but the organization must document retention periods, RPO/RTO targets, and test restore procedures quarterly.

#### 1.1.5 Security Incident Procedures -- 164.308(a)(6)

| Control | Status | Severity | Details |
|---------|--------|----------|---------|
| Incident Response | PARTIAL | **MEDIUM** | AuditLog captures all access events. No automated breach detection, alerting, or incident response workflow. No breach notification template per California Civil Code 1798.82. |

**Finding SRA-002 [MEDIUM]:** No security incident response plan. The audit log infrastructure exists but there is no automated anomaly detection (e.g., bulk PHI access, off-hours access, failed auth spikes) and no documented incident response runbook.

---

### 1.2 Physical Safeguards (164.310)

Physical safeguards are largely organizational and infrastructure-level controls. The following codebase-level controls are noted:

| Control | Status | Details |
|---------|--------|---------|
| Facility Access | N/A (SaaS) | Cloud-hosted on Supabase (AWS infrastructure). Physical security is Supabase/AWS responsibility. Must be covered by BAA. |
| Workstation Security | PARTIAL | Session timeout auto-logout at 30 minutes idle with ePHI cleanup (`SessionTimeoutModal.tsx`). `clearEphi()` clears all clinical Zustand stores + localStorage keys prefixed with `draft-transcript-`, `encounter-`, `clinical-`. |
| Device Controls | NOT EVIDENCED | No MDM integration, no local data encryption beyond browser TLS. |

**Finding SRA-003 [LOW]:** `clearEphi()` in `LogoutButton.tsx` only clears localStorage keys matching 3 specific prefixes. If any clinical data is stored under other keys (e.g., by a future feature), it would be missed. Recommend a more comprehensive approach: clear ALL localStorage on logout, preserving only an explicit allow-list of non-PHI keys (theme, accent).

---

### 1.3 Technical Safeguards (164.312)

#### 1.3.1 Access Control -- 164.312(a)(1)

| Control | Status | Details |
|---------|--------|---------|
| Unique User Identification | IMPLEMENTED | Every user has a unique Supabase Auth UUID (`ctx.user_id`). Staff records map auth UUID to internal `staff.id` via `resolve_staff()`. |
| Emergency Access | NOT EVIDENCED | **HIGH** -- No emergency access procedure for when normal auth is unavailable. |
| Automatic Logoff | IMPLEMENTED | 30-minute idle timeout with 2-minute warning countdown. Cross-tab detection via `react-idle-timer`. ePHI cleared on auto-logout. |
| Encryption/Decryption | PARTIAL | See Encryption section below. |

**Finding SRA-004 [HIGH]:** No emergency access procedure. If Supabase Auth is down, there is no break-glass mechanism for accessing patient records in a clinical emergency. Consider implementing a local emergency access mode with enhanced audit logging.

##### Encryption Assessment

| Layer | Status | Details |
|-------|--------|---------|
| Data in Transit (Browser to Next.js) | IMPLEMENTED | HTTPS enforced via `upgrade-insecure-requests` CSP directive. |
| Data in Transit (Next.js BFF to FastAPI) | **CRITICAL** | Communication is over `http://127.0.0.1:8000` (plaintext HTTP). In production, if BFF and FastAPI are on separate hosts, ePHI traverses the network unencrypted. |
| Data in Transit (FastAPI to Supabase DB) | IMPLEMENTED | Supabase PostgreSQL connections use SSL by default (`asyncpg` with Supabase-managed certificates). |
| Data at Rest (Database) | PARTIAL | Supabase uses AWS RDS with storage encryption (AES-256). However, **no application-level encryption** exists for sensitive fields (`ssn_last4`, `contact_info_jsonb`). Comment in `clinical.py:222` says "Encrypted at the infrastructure level (RDS encryption / pgcrypto)" but no pgcrypto usage is found in the codebase. |
| Data at Rest (Browser) | PARTIAL | ePHI in Zustand stores is in-memory only (not persisted to localStorage). Draft transcripts stored in localStorage are plaintext. Cleared on logout. |

**Finding SRA-005 [CRITICAL]:** `ssn_last4` is stored as plaintext `String(4)` in the `patients` table. While RDS provides transparent disk encryption, any database dump, backup, or log that includes this column exposes SSN data. The codebase comment claims pgcrypto but no implementation exists.

**Finding SRA-006 [CRITICAL]:** BFF-to-FastAPI communication uses plaintext HTTP (`http://127.0.0.1:8000`). If these services are deployed on separate hosts (common in containerized deployments), ePHI including patient records, diagnoses, and clinical data traverses the network unencrypted.

#### 1.3.2 Audit Controls -- 164.312(b)

| Control | Status | Details |
|---------|--------|---------|
| Audit Log Model | IMPLEMENTED | `AuditLog` model in `clinical.py:818-878`. Append-only, no SoftDeleteMixin, no `updated_at`. Records: `user_id`, `staff_id`, `action`, `resource_type`, `resource_id`, `encounter_id`, `patient_id`, `detail`, `changes` (JSONB before/after), `ip_address`, `created_at`. |
| Write Operation Logging | IMPLEMENTED | All create/update/delete/finalize routes call `log_action()`. |
| Read Operation Logging | IMPLEMENTED | GET routes for encounters, vitals, diagnoses, superbills, and patient detail log `AuditAction.READ` or `AuditAction.PHI_VIEWED`. |
| Log Immutability | IMPLEMENTED | `AuditLog` has no `updated_at`, no `SoftDeleteMixin`. No UPDATE or DELETE operations exist for audit records. |
| Log Retention | NOT EVIDENCED | **HIGH** -- No log retention policy. California requires 10-year retention for adult records, age 19 for minors. No automated purge/archive mechanism. |
| Log Review | IMPLEMENTED | Paginated audit log endpoint with CSV export (`GET /api/audit-logs`, `GET /api/audit-logs/export`). Restricted to admin/owner roles. |
| IP Address Tracking | IMPLEMENTED | `ip_address` captured from `request.client.host` on every logged action. |

**Finding SRA-007 [HIGH]:** No documented or configured audit log retention policy. HIPAA requires 6-year retention of security documentation; California requires 10-year retention of medical records for adults and until age 19 for minors. Consider implementing time-partitioned audit tables and an archive-to-cold-storage policy.

#### 1.3.3 Integrity Controls -- 164.312(c)(1)

| Control | Status | Details |
|---------|--------|---------|
| Finalization Lock | IMPLEMENTED | `Encounter.is_finalized` flag. All write routes (vitals, refraction, exam findings, diagnosis, encounter update) check `is_finalized` and raise HTTP 409 if true. |
| Electronic Signature | IMPLEMENTED | `signed_by_id` + `signed_at` on Encounter. Set during `POST /encounters/{id}/finalize`. Links to `Staff` FK. |
| Soft Delete | IMPLEMENTED | `SoftDeleteMixin` on Patient, Encounter, Diagnosis, PatientProblem, SuperbillLineItem. All DELETE routes set `is_deleted=True` + `deleted_at`. No `db.delete()` calls found in any route file. |
| Amendment Workflow | NOT IMPLEMENTED | **MEDIUM** -- No addendum/amendment model per HIPAA 164.526. Once finalized, records cannot be amended. `encounterStore.ts` has a `TODO: unlockForAddendum()` comment. |
| Data Integrity Verification | NOT EVIDENCED | No checksums, digital signatures, or hash verification on stored clinical data. |

**Finding SRA-008 [MEDIUM]:** No amendment/addendum workflow. HIPAA 164.526 requires a mechanism for patients to request amendments and for providers to append addenda to finalized records without modifying the original. The `unlockForAddendum()` TODO in `encounterStore.ts` indicates this is planned but not implemented.

#### 1.3.4 Person or Entity Authentication -- 164.312(d)

| Control | Status | Details |
|---------|--------|---------|
| Authentication Mechanism | IMPLEMENTED | Supabase JWT authentication with JWKS verification (`security.py`). Uses `PyJWKClient` to fetch signing keys from Supabase JWKS endpoint. Verifies `ES256` and `HS256` algorithms, `authenticated` audience. |
| User Attribution | IMPLEMENTED | `recorded_by_id` FK to `Staff` on all clinical models (VitalsAndPretest, Refraction, ExamFindings, Diagnosis). Routes use `resolve_staff()` to map `ctx.user_id` (auth UUID) to `staff.id` (internal FK). |
| Token Lifetime | IMPLEMENTED | `ACCESS_TOKEN_EXPIRE_MINUTES = 60` (1 hour). Within HIPAA best practice range of 15-60 minutes. |
| Multi-Factor Auth | NOT EVIDENCED | **MEDIUM** -- No MFA enforcement. Supabase supports MFA but it must be enabled and enforced at the application level. For healthcare, MFA should be required for all staff accounts. |

**Finding SRA-009 [MEDIUM]:** No multi-factor authentication enforcement. While Supabase supports TOTP-based MFA, the application does not enforce it. For an EHR handling ePHI, MFA should be mandatory for all clinical staff. Consider enforcing MFA enrollment on first login and requiring it for sensitive operations (finalization, PHI export).

#### 1.3.5 Transmission Security -- 164.312(e)(1)

| Control | Status | Details |
|---------|--------|---------|
| TLS (Browser) | IMPLEMENTED | CSP `upgrade-insecure-requests` directive. Supabase endpoints use HTTPS. |
| HSTS | NOT IMPLEMENTED | **MEDIUM** -- No `Strict-Transport-Security` header in `next.config.mjs`. Without HSTS, the first request to the application could be intercepted via HTTP before the redirect to HTTPS (SSL stripping attack). |
| API Token Security | IMPLEMENTED | JWT passed via `Authorization: Bearer` header. BFF proxy re-attaches the access token from the server-side Supabase session, never exposing it to client-side JavaScript in API calls. |

**Finding SRA-010 [MEDIUM]:** Missing `Strict-Transport-Security` (HSTS) header. The `next.config.mjs` security headers include X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, and CSP, but HSTS is absent. Add: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.

---

### 1.4 Organizational Requirements (164.314)

#### 1.4.1 Business Associate Agreements

See Section 2 below for the full BAA analysis.

#### 1.4.2 Tenant Isolation -- Multi-Tenant Security

| Control | Status | Details |
|---------|--------|---------|
| Application-Layer Isolation | IMPLEMENTED | Every query in every route file includes `.where(Model.tenant_id == ctx.tenant_id)`. The `TenantContext` is extracted from the verified JWT and is immutable (`frozen=True` dataclass). |
| Database-Layer Isolation (RLS) | NOT IMPLEMENTED | **CRITICAL** -- No PostgreSQL Row-Level Security policies found in the codebase. `security.py` explicitly notes that "FastAPI connects with the Supabase service role key, which bypasses all RLS policies." The application relies entirely on Python-level tenant filtering. |
| Service Role Key Risk | **CRITICAL** | FastAPI uses the Supabase `service_role` key which has full database access. Any application-level bug (SQL injection, missing tenant filter) could expose data across tenants. |

**Finding SRA-011 [CRITICAL]:** No PostgreSQL Row-Level Security (RLS) as defense-in-depth. The system relies exclusively on Python-level `.where(tenant_id == ctx.tenant_id)` filtering. A single missed filter or a SQL injection vulnerability would enable cross-tenant ePHI access. RLS policies should be implemented on all tenant-scoped tables.

##### Intake Route Tenant Isolation Gap

**Finding SRA-012 [CRITICAL]:** Public intake routes (`backend/api/routes/intake.py`) query the `Patient` table **without tenant_id filtering** at lines 107, 115, and 188:
```python
select(Patient).where(Patient.id == appt.patient_id)
```
While these queries use `patient_id` from the appointment (which is tenant-scoped via the token), the absence of an explicit `tenant_id` filter means:
1. Without RLS, the query could theoretically return a patient from any tenant if UUIDs collide or are manipulated.
2. This violates the project's own security doctrine stated in `security.py`: "every query must include `.where(Model.tenant_id == ctx.tenant_id)`."

---

## 2. Business Associate Agreement (BAA) Analysis

### 2.1 Third-Party Service Inventory

| Service | Role | ePHI Exposure | BAA Status | Risk |
|---------|------|---------------|------------|------|
| **Supabase** | Database, Auth, Storage | **Full ePHI** -- All patient records, clinical data, audit logs stored in Supabase PostgreSQL. Auth credentials. | **REQUIRED -- AVAILABLE** | Supabase offers HIPAA BAA on Team/Enterprise plans. Must be executed before production launch. |
| **Anthropic (Claude API)** | AI Scribe, AI Prep Me, AI Triage | **Full ePHI** -- Raw clinical transcripts, patient names, DOB, SOAP notes, diagnosis codes, chief complaints sent to Claude API. | **REQUIRED -- VERIFY AVAILABILITY** | `ai_scribe.py:178` sends full transcript. `patient.py:634` sends patient name + DOB + SOAP notes. `backend/core/triage.py` sends chief complaint + review of systems. Anthropic must execute a BAA. |
| **Vercel** (if used for hosting) | Frontend hosting | **Minimal** -- BFF proxy routes process ePHI transiently. Server-side rendering may render patient data. | **REQUIRED** | Vercel offers HIPAA BAA on Enterprise plan. Required if ePHI passes through Vercel infrastructure. |
| **AWS** (via Supabase) | Infrastructure | **Full ePHI** -- Underlying infrastructure for Supabase PostgreSQL. | **COVERED** | Covered by Supabase's BAA with AWS. Verify chain-of-custody. |

### 2.2 AI Service ePHI Exposure Analysis

The AI Scribe feature sends the following ePHI to Anthropic's Claude API:

1. **`POST /encounters/{id}/ai-scribe`** (`ai_scribe.py:175-183`):
   - Full clinical dictation transcript (contains patient identifiers, conditions, medications)
   - Model: `claude-sonnet-4-6-20250514`
   - No data retention configuration specified in the API call

2. **`POST /patients/{id}/prep-me`** (`patient.py:620-637`):
   - Patient full name and date of birth
   - Up to 3 finalized SOAP notes (full clinical history)
   - Chief complaints and assessment/plan text

3. **`triage_chief_complaint()`** (called from `intake.py:229`):
   - Chief complaint text
   - Review of systems data

**Finding SRA-013 [HIGH]:** No documented BAA with Anthropic for AI Scribe usage. ePHI including full clinical transcripts, patient names, DOBs, and SOAP notes are transmitted to Anthropic's API. A BAA must be executed before production use. Additionally:
- No minimum necessary standard applied (full transcripts sent, not de-identified)
- No Anthropic API data retention configuration set (e.g., `anthropic-beta: no-storage`)
- No patient consent workflow for AI-assisted documentation

### 2.3 Required BAA Checklist

| Vendor | BAA Executed | BAA Available | Priority |
|--------|-------------|---------------|----------|
| Supabase | NO (assumed) | Yes (Team/Enterprise) | **P0** |
| Anthropic | NO (assumed) | Verify with Anthropic | **P0** |
| Vercel (if used) | NO (assumed) | Yes (Enterprise) | **P1** |
| Domain/DNS provider | N/A | Varies | **P2** |
| Email service (if used for notifications) | N/A | Varies | **P2** |

---

## 3. ePHI Data Flow Mapping

### 3.1 Data at Rest

```
+----------------------------------------------------------+
| Supabase PostgreSQL (AWS RDS, AES-256 disk encryption)   |
|                                                           |
| PUBLIC SCHEMA:                                            |
|   tenants          - Clinic names, slugs (non-PHI)       |
|   tenant_members   - user_id <-> tenant_id mapping       |
|   subscription_plans - Plan details (non-PHI)            |
|                                                           |
| TENANT TABLES (public schema, tenant_id filtered):       |
|   patients         - Name, DOB, sex, SSN_last4, contact  |
|   appointments     - Chief complaint, internal notes     |
|   encounters       - Clinical notes, AI summaries        |
|   vitals_and_pretest - IOP, VA, BP, pulse               |
|   refractions      - Rx data (sphere, cylinder, axis)    |
|   exam_findings    - JSONB findings_od/findings_os       |
|   diagnoses        - ICD-10 codes, descriptions          |
|   patient_problems - Chronic condition history           |
|   superbills       - Billing records, CPT codes          |
|   audit_log        - All access records (immutable)      |
|   intake_tokens    - Full intake form data (JSONB)       |
+----------------------------------------------------------+
```

### 3.2 Data in Transit

```
Browser (HTTPS)
   |
   v
Next.js BFF Proxy (lib/bff.ts)
   |-- Supabase Auth: getUser() + getSession()
   |-- Extracts access_token from server-side session
   |
   v (HTTP - http://127.0.0.1:8000) <-- RISK: plaintext if cross-host
FastAPI Backend
   |-- JWT verification via JWKS (security.py)
   |-- TenantContext extraction from verified claims
   |
   v (SSL - asyncpg to Supabase PostgreSQL)
PostgreSQL Database

Browser (HTTPS)
   |
   v (direct HTTPS)
Supabase Auth API (login, token refresh)

FastAPI Backend
   |
   v (HTTPS)
Anthropic Claude API (ai_scribe.py, patient.py, triage.py)
   |-- Sends: transcripts, patient names, DOBs, SOAP notes
   |-- Receives: SOAP narrative, structured clinical JSON
```

### 3.3 ePHI Leak Points

| # | Location | Risk | Severity | Mitigation |
|---|----------|------|----------|------------|
| 1 | BFF error messages | `bff.ts:98` includes `debug: msg` in 500 error responses. Could leak internal details to the browser. | **Medium** | Remove `debug` field in production or gate behind NODE_ENV. |
| 2 | Global exception handler | `main.py:23` logs full stack traces including potentially ePHI-containing query parameters. | **Low** | Sanitize log output to redact patient identifiers from logged URLs. |
| 3 | AI Scribe error stream | `ai_scribe.py:203` yields `{'error': str(exc)}` in SSE stream. Exception messages could contain ePHI from the transcript. | **Medium** | Return generic error message; log details server-side only. |
| 4 | Client-side localStorage | Draft transcripts stored under `draft-transcript-*` keys in plaintext. | **Low** | Cleared on logout. Consider not persisting transcripts to localStorage at all, or encrypting with a session-derived key. |
| 5 | Intake routes without tenant_id | `intake.py` queries Patient by ID only, without `tenant_id` filter. | **Critical** | See Finding SRA-012. |
| 6 | Supabase service role in logs | `supabase_admin.py` makes HTTP calls with service role key in headers. If request logging is enabled, the key could appear in logs. | **Medium** | Ensure HTTP request logging does not capture Authorization headers. |
| 7 | Patient name in AI Prep Me | `patient.py:634` sends `Patient: {patient.full_name}, DOB: {patient.dob}` to Claude API. This is identifiable PHI. | **High** | Apply minimum necessary standard: use a pseudonym or omit name. The AI does not need the real name to generate a clinical summary. |

### 3.4 Authentication Flow Security Analysis

```
Login Flow:
1. User enters email/password on /login
2. Supabase Auth validates credentials (bcrypt, server-side)
3. Supabase mints JWT via custom_access_token_hook.sql:
   - SECURITY DEFINER function
   - Injects: tenant_id, tenant_slug, role, schema_name, staff_id, full_name
   - Restricted execution: only supabase_auth_admin
4. JWT stored in HTTP-only cookies by Supabase SSR
5. Middleware (middleware.ts) uses getUser() for server-side verification
6. BFF proxy (bff.ts) extracts access_token from server session
7. FastAPI verifies JWT via JWKS endpoint (security.py)
8. TenantContext extracted from verified claims

Security Properties:
+ JWKS-based verification (no shared secret for verification)
+ HTTP-only cookies (not accessible to JavaScript)
+ Server-side getUser() verification (not spoofable getSession())
+ Immutable TenantContext dataclass
+ Cross-tab idle detection for session timeout

Weaknesses:
- No MFA enforcement
- No IP-based session binding
- No concurrent session limiting
- JWT role claim trusted without server-side re-verification
  (role could be stale if changed since last token mint)
```

---

## 4. Findings Summary Table

| ID | Severity | Category | Title | HIPAA Reference |
|----|----------|----------|-------|-----------------|
| SRA-001 | HIGH | Administrative | No documented backup/DR plan | 164.308(a)(7) |
| SRA-002 | MEDIUM | Administrative | No incident response plan | 164.308(a)(6) |
| SRA-003 | LOW | Physical | ePHI cleanup uses prefix-matching (brittle) | 164.310(b) |
| SRA-004 | HIGH | Technical | No emergency access procedure | 164.312(a)(2)(ii) |
| SRA-005 | CRITICAL | Technical | ssn_last4 stored as plaintext (no pgcrypto) | 164.312(a)(2)(iv) |
| SRA-006 | CRITICAL | Technical | BFF-to-FastAPI plaintext HTTP | 164.312(e)(1) |
| SRA-007 | HIGH | Technical | No audit log retention policy | 164.312(b) |
| SRA-008 | MEDIUM | Technical | No amendment/addendum workflow | 164.526 |
| SRA-009 | MEDIUM | Technical | No MFA enforcement | 164.312(d) |
| SRA-010 | MEDIUM | Technical | Missing HSTS header | 164.312(e)(1) |
| SRA-011 | CRITICAL | Organizational | No RLS defense-in-depth | 164.312(a)(1) |
| SRA-012 | CRITICAL | Organizational | Intake routes missing tenant_id filter | 164.312(a)(1) |
| SRA-013 | HIGH | Organizational | No BAA with Anthropic for AI Scribe | 164.314(a)(1) |
| SRA-014 | HIGH | Technical | AI Prep Me sends identifiable PHI unnecessarily | 164.502(b) minimum necessary |
| SRA-015 | MEDIUM | Technical | Error responses may leak ePHI | 164.312(c)(1) |
| SRA-016 | HIGH | Administrative | No patient consent for AI documentation | State law varies |
| SRA-017 | HIGH | Technical | Stale JWT role not re-verified server-side | 164.312(d) |
| SRA-018 | LOW | Technical | No concurrent session limiting | 164.312(a)(2)(iii) |
| SRA-019 | LOW | Technical | No rate limiting on auth endpoints | 164.312(a)(1) |
| SRA-020 | HIGH | Technical | Intake DOB verification brute-force (3 attempts, no lockout duration) | 164.312(d) |
| SRA-021 | LOW | Administrative | Supabase service role key scope too broad | 164.312(a)(1) |
| SRA-022 | LOW | Technical | No database connection encryption validation | 164.312(e)(2) |
| SRA-023 | MEDIUM | Technical | PatientProblem model has no recorded_by_id | 164.312(b) |

---

## 5. Remediation Roadmap

### P0 -- Must Fix Before Production (Critical + High)

| Priority | Finding | Remediation | Effort |
|----------|---------|-------------|--------|
| P0.1 | SRA-011 | Implement PostgreSQL RLS policies on all tenant-scoped tables. Use `SET app.current_tenant_id = ...` in connection init, policy: `USING (tenant_id = current_setting('app.current_tenant_id')::uuid)`. | 2-3 days |
| P0.2 | SRA-012 | Add `Patient.tenant_id == ictx.tenant_id` to all Patient queries in `intake.py`. The `IntakeContext` already has `tenant_id`. | 30 min |
| P0.3 | SRA-005 | Encrypt `ssn_last4` using pgcrypto `pgp_sym_encrypt()` or application-level AES-256-GCM. Create a `decrypt_ssn()` helper that only returns plaintext when needed. | 1 day |
| P0.4 | SRA-006 | Deploy FastAPI behind a reverse proxy with TLS (e.g., nginx with self-signed cert for internal traffic, or use a service mesh). In production, ensure BFF-to-API traffic is encrypted. | 1 day |
| P0.5 | SRA-013 | Execute BAA with Anthropic. Until BAA is in place, disable AI Scribe in production (`ANTHROPIC_API_KEY` empty = feature disabled, which is already handled). | 1 week (business) |
| P0.6 | SRA-001 | Document backup/DR plan. Verify Supabase Pro PITR is enabled. Document RPO/RTO. Test restore from backup. | 2 days |
| P0.7 | SRA-007 | Define 10-year audit log retention policy. Implement table partitioning by month. Plan cold-storage archive after 2 years. | 1 day |
| P0.8 | SRA-004 | Implement break-glass emergency access with enhanced audit logging. | 2 days |
| P0.9 | SRA-014 | Remove patient name from AI Prep Me prompt. Use "Patient" or a pseudonym. The AI does not need the real name. | 15 min |
| P0.10 | SRA-016 | Add patient consent capture for AI-assisted documentation. Store consent flag on encounter or patient record. | 1 day |
| P0.11 | SRA-017 | Add server-side role re-verification. On sensitive operations (finalize, delete, staff management), reload role from `tenant_members` table instead of relying solely on JWT claim. | 4 hours |
| P0.12 | SRA-020 | Add lockout duration to intake DOB verification. After 3 failed attempts, lock for 15 minutes (not just permanently until manual reset). Add exponential backoff. | 2 hours |

### P1 -- Should Fix Before GA

| Priority | Finding | Remediation | Effort |
|----------|---------|-------------|--------|
| P1.1 | SRA-009 | Enforce MFA for all staff accounts. Use Supabase MFA API to require TOTP enrollment. Gate access to clinical routes on MFA verification. | 2 days |
| P1.2 | SRA-010 | Add HSTS header to `next.config.mjs`: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` | 5 min |
| P1.3 | SRA-008 | Implement `EncounterAddendum` model: timestamped text additions to finalized encounters, with audit trail. Does not modify original record. | 2 days |
| P1.4 | SRA-002 | Write incident response runbook. Include breach notification procedures per HIPAA (60 days) and California (expedient, no unreasonable delay). | 1 day |
| P1.5 | SRA-015 | Remove `debug: msg` from BFF error responses in production. Sanitize AI Scribe error stream to generic message. | 1 hour |
| P1.6 | SRA-023 | Add `recorded_by_id` FK to `PatientProblem` model to track who created/modified problems. | 1 hour |

### P2 -- Best Practice Improvements

| Priority | Finding | Remediation | Effort |
|----------|---------|-------------|--------|
| P2.1 | SRA-003 | Refactor `clearEphi()` to clear ALL localStorage and rebuild only allowed keys. | 30 min |
| P2.2 | SRA-018 | Implement concurrent session limiting (max 2 active sessions per user). | 1 day |
| P2.3 | SRA-019 | Add rate limiting on Supabase Auth endpoints (configure via Supabase dashboard). Add rate limiting on BFF proxy routes. | 4 hours |
| P2.4 | SRA-021 | Create a read-only Supabase database role for FastAPI instead of using the service role key. | 2 hours |
| P2.5 | SRA-022 | Add `sslmode=verify-full` to DATABASE_URL to enforce TLS certificate verification on database connections. | 15 min |

---

## Appendix A: What Is Already Done Well

The following controls are implemented and functioning correctly. These represent significant security investment:

1. **JWT Authentication with JWKS Verification** (`security.py`) -- Industry-standard asymmetric key verification, no hardcoded secrets for token validation.

2. **Comprehensive RBAC** (`permissions.py`) -- 26 clinical actions mapped to 5 roles with a clear permission matrix. Every route uses `require_permission()`.

3. **Immutable Audit Logging** (`audit.py`, `clinical.py:818-878`) -- Append-only `AuditLog` table with 22 action types covering all CRUD operations, AI actions, scheduling, billing, and optical workflows. Records user_id, staff_id, IP address, resource type, detail, and before/after changes.

4. **Soft Delete on All PHI Models** -- `SoftDeleteMixin` on Patient, Encounter, Diagnosis, PatientProblem, SuperbillLineItem. No `db.delete()` calls anywhere in the codebase.

5. **Finalization Lock** -- `is_finalized` check on every write route for encounter-linked data. HTTP 409 returned if attempting to modify finalized records.

6. **Electronic Signature** -- `signed_by_id` + `signed_at` on Encounter with FK to Staff.

7. **Session Timeout** (`SessionTimeoutModal.tsx`) -- 30-minute idle auto-logout with 2-minute warning, cross-tab detection, ePHI cleanup on logout.

8. **Security Headers** (`next.config.mjs`) -- CSP with restrictive policy (no `unsafe-eval` in production), X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy.

9. **BFF Proxy Pattern** (`lib/bff.ts`) -- Server-side token management. Browser never directly calls FastAPI. Access tokens are extracted server-side and forwarded, reducing XSS token theft risk.

10. **Server-Side Auth Verification** (`lib/supabase/middleware.ts`) -- Uses `getUser()` (server-verified) not `getSession()` (locally spoofable).

11. **Staff Identity Resolution** (`resolve_staff()`) -- Maps global auth UUID to internal staff.id for proper FK attribution on clinical records.

12. **Intake DOB Verification Gate** -- Public intake routes require DOB verification before exposing any PHI, with max 3 attempts.

13. **Tenant-Scoped Queries** -- Every route handler consistently includes `Model.tenant_id == ctx.tenant_id` in queries (except the noted intake gap).

14. **No Hard-Coded Secrets** -- All sensitive configuration uses environment variables via pydantic `BaseSettings` with `Field(...)` (required, no defaults).

---

## Appendix B: Compliance Certifications Needed for Production

| Certification | Required For | Status |
|---------------|-------------|--------|
| Supabase HIPAA BAA | Database/Auth hosting | Must execute on Team/Enterprise plan |
| Anthropic BAA | AI Scribe feature | Must verify availability and execute |
| SOC 2 Type II (Supabase) | Auditor assurance | Supabase has SOC 2 -- verify current report |
| Penetration Test | Production readiness | Not yet conducted |
| HIPAA Security Risk Assessment | Regulatory compliance | This document (code-level only; needs organizational SRA supplement) |
| Notice of Privacy Practices | Patient-facing requirement | Not evidenced in codebase |
| Breach Notification Procedures | California Civil Code 1798.82 | Not yet documented |

---

*This report assesses the codebase as of 2026-03-07. It covers technical safeguards implementable in code. Organizational policies, workforce training, and physical safeguards require separate assessment. This automated analysis should be supplemented by a qualified HIPAA security officer's review and a formal penetration test before production deployment.*
