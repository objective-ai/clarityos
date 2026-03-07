# ClarityOS EHR — System Architecture

> **Version:** 3.0 | **Updated:** 2026-03-07 | **Status:** MVP Complete (All 7 Phases)

---

## 1. System Overview

| Property | Value |
|----------|-------|
| Product | ClarityOS EHR |
| Domain | Optometry EHR/PMS (Electronic Health Record / Practice Management System) |
| Model | Multi-tenant SaaS (schema-per-tenant PostgreSQL) |
| Frontend | Next.js 14 (App Router) + React 18 + TypeScript 5.5 strict |
| Styling | Tailwind CSS 3.4 + shadcn/ui + CSS custom properties |
| State | Zustand 4.5 with devtools + persist middleware |
| Backend | Python FastAPI + PostgreSQL (schema-per-tenant) + Supabase Auth |
| Auth | Supabase Auth (JWT HS256) with custom access token hook |
| AI | Anthropic Claude API (Sonnet) — Scribe, Triage, Prep Me, MDM |

---

## 2. Tech Stack

### Frontend Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| next | 14.2.5 | App Router, SSR, file-based routing |
| react | 18.3.1 | UI rendering |
| typescript | 5.5.3 | Strict type safety |
| tailwindcss | 3.4.6 | Utility-first CSS |
| zustand | 4.5.4 | Lightweight state management |
| @radix-ui/* | latest | Accessible UI primitives (shadcn/ui) |
| qrcode.react | latest | QR code generation for intake links |
| class-variance-authority | latest | Component variant system |
| clsx + tailwind-merge | latest | Conditional class composition (`cn()`) |
| lucide-react | latest | Icon library |

### Backend Dependencies

| Package | Purpose |
|---------|---------|
| fastapi | Web framework |
| sqlalchemy | ORM (async, 2.0 style) |
| pydantic | Request/response validation |
| uvicorn | ASGI server |
| anthropic | Claude API client |
| supabase-py | Supabase admin client |
| python-jose | JWT verification |

### Build Tools

| Tool | Config File | Notes |
|------|-------------|-------|
| PostCSS | `postcss.config.mjs` | `tailwindcss` (v3) + `autoprefixer` |
| Tailwind | `tailwind.config.ts` | Extended theme with CSS variable aliases |
| TypeScript | `tsconfig.json` | Strict mode, `@/*` path alias, ES2017 target |
| Vitest | `vitest.config.ts` | Unit tests with testing-library |
| Playwright | skill-based | E2E tests via `scripts/dev.sh verify` |

> **Important:** PostCSS uses Tailwind v3 (`tailwindcss`), NOT v4 (`@tailwindcss/postcss`). All CSS uses v3 `@tailwind` directives.

---

## 3. Folder Structure

```
app/
├── layout.tsx                              Root layout (fonts + ThemeProvider)
├── globals.css                             Design tokens, glassmorphism, animations
├── page.tsx                                Auth-aware root (redirects to dashboard or /login)
├── login/page.tsx                          Login page (Supabase Auth)
├── intake/                                 Public intake form (no auth required)
│   ├── page.tsx                            Token entry / redirect
│   └── [token]/page.tsx                    Multi-step intake form
├── api/                                    BFF proxy routes
│   ├── encounters/                         Encounter CRUD + sub-resources
│   ├── patients/                           Patient CRUD
│   ├── appointments/                       Scheduling
│   ├── superbills/                         Billing
│   ├── staff/                              Staff management
│   ├── audit-logs/                         HIPAA audit trail
│   └── optical/                            Optical queue
└── (tenant)/[tenant]/
    ├── layout.tsx                          Tenant shell (ambient-bg + Sidebar + TopNav)
    ├── dashboard/page.tsx                  Command center (stats + quick actions)
    ├── schedule/page.tsx                   Day view with appointment timeline
    ├── patients/page.tsx                   Searchable patient table
    ├── patients/[patientId]/page.tsx       Patient detail (timeline + flowsheets)
    ├── encounter/[encounterId]/page.tsx    Full exam room workspace
    ├── admin/page.tsx                      Staff management + branding + compliance
    └── optical/page.tsx                    Optical dashboard + Rx queue

backend/
├── main.py                                FastAPI app + middleware
├── seed_db.py                             Demo data seeder (10 patients, 13 appointments, 7 encounters)
├── api/routes/                            FastAPI endpoints
│   ├── encounter.py                       Encounter CRUD + finalize + AI scribe
│   ├── patient.py                         Patient CRUD + problems
│   ├── appointment.py                     Scheduling + status transitions
│   ├── superbill.py                       Billing + CMS-1500 export
│   ├── staff.py                           Staff management
│   ├── intake.py                          Public intake API (token auth)
│   ├── optical.py                         Optical queue + Rx
│   └── audit.py                           Audit log retrieval + export
├── core/
│   ├── config.py                          Settings (env vars)
│   ├── security.py                        JWT verification + TenantContext
│   ├── triage.py                          AI chief complaint classification
│   └── entitlements.py                    Permission matrix (16 actions x 5 roles)
├── db/
│   ├── base.py                            PublicBase + TenantBase
│   ├── mixins.py                          TimestampMixin + SoftDeleteMixin
│   ├── session.py                         Async SQLAlchemy session factory
│   └── models/
│       ├── public/saas.py                 Tenant, SubscriptionPlan, TenantAddon, TenantMember
│       └── tenant/
│           ├── clinical.py                Staff, Patient, Appointment, Encounter, Vitals, Refraction, ExamFindings, Diagnosis, PatientProblem, Superbill, AuditLog
│           └── intake.py                  IntakeToken
└── schemas/                               Pydantic request/response models

components/
├── Sidebar.tsx                            Glass nav, collapsible, role-aware
├── TopNav.tsx                             Page title + patient info on encounter routes + avatar
├── ThemeProvider.tsx                       Syncs theme + derives accent CSS vars
├── PatientChartModal.tsx                   Quick patient chart overlay
├── encounter/
│   ├── RefractionGrid.tsx                 Keyboard-optimized Rx entry (4x12 grid)
│   ├── ExamFindings.tsx                   Anterior/posterior accordion with WNL
│   ├── DiagnosisPicker.tsx                ICD-10 search + OD/OS/OU laterality
│   ├── FinalizeModal.tsx                  Sign & Seal 7-step review
│   ├── SuperbillModal.tsx                 CPT/ICD billing review + CMS-1500 export
│   ├── ClinicalDiffViewer.tsx             AI change diff with per-field revert
│   ├── AuditTrailSidebar.tsx              Encounter audit timeline
│   ├── AiScribeWidget.tsx                 AI dictation -> SOAP + structured autofill
│   ├── VitalsForm.tsx                     Editable vitals entry
│   ├── VitalsCard.tsx                     Read-only vitals display
│   ├── ExamFindingsCard.tsx               Read-only exam findings
│   ├── EncounterBottomTabs.tsx            Bottom tab nav + status actions
│   └── ContinuitySidebar.tsx              Master Problem List sidebar
├── schedule/
│   ├── BookingModal.tsx                   New appointment form
│   ├── IntakeLinkModal.tsx                Token link + QR code generator
│   └── CancelModal.tsx                    Cancel with reason
└── ui/
    ├── card.tsx                           shadcn Card (glass-card base)
    ├── badge.tsx                          7 variants (pill-shaped)
    ├── button.tsx                         6 variants, 4 sizes
    ├── stat-card.tsx                      KPI display with optional glow
    └── dropdown-menu.tsx                  Radix dropdown (glass styling)

hooks/
├── useEntitlements.ts                     Feature gating (has/hasAll/hasAny/requireRole)
├── useRefractionKeyboard.ts               Grid keyboard navigation
└── useAiScribe.ts                         AI Scribe SSE streaming + structured data parsing

store/
├── sessionStore.ts                        Supabase Auth + session state
├── encounterStore.ts                      Encounter state + finalize modal toggle
├── refractionStore.ts                     Draft/committed Rx with debounced save
├── vitalsStore.ts                         Draft/committed vitals with debounced save
├── examFindingsStore.ts                   Per-section exam findings with WNL workflow
├── diagnosisStore.ts                      ICD-10 diagnoses per encounter
├── appointmentStore.ts                    Schedule data + booking/check-in/cancel
├── superbillStore.ts                      Billing data + CPT line items
├── patientStore.ts                        Patient list + detail data
├── pageHeaderStore.ts                     Dynamic page title/subtitle
├── themeStore.ts                          Dark/light preference
└── tenantCustomizationStore.ts            Logo URL + accent color

types/
├── session.ts                             JWT payload, entitlements, roles
├── refraction.ts                          Rx types, row keys, grid coords
├── appointment.ts                         Appointment + status types
├── encounter.ts                           Encounter types
└── patient.ts                             Patient types

lib/
├── bff.ts                                 BFF proxy utility (proxyToFastAPI)
├── utils.ts                               cn() utility
├── color-utils.ts                         Hex/RGB/HSL + WCAG contrast
├── rx-format.ts                           Rx formatting, parsing, validation
├── entitlements.ts                        Feature keys, plan mappings, metadata
└── auth/
    ├── session-hydrator.ts                JWT claims -> AppSession
    └── mock-session.ts                    Dev-only mock role scenarios
```

---

## 4. Routing

Next.js App Router with route groups and dynamic segments.

### Public Routes (No Auth)

| Route | Page | Purpose |
|-------|------|---------|
| `/login` | Login | Supabase email/password auth |
| `/intake` | Intake entry | Token-based intake form access |
| `/intake/[token]` | Intake form | Multi-step patient intake |

### Protected Routes (Authenticated)

| Route | Page | Access |
|-------|------|--------|
| `/[tenant]/dashboard` | Command center | All roles |
| `/[tenant]/schedule` | Day schedule | `scheduling` entitlement |
| `/[tenant]/patients` | Patient search/table | `patient_demographics` entitlement |
| `/[tenant]/patients/[patientId]` | Patient detail | `patient_demographics` entitlement |
| `/[tenant]/encounter/[encounterId]` | Exam room workspace | `basic_exam` entitlement |
| `/[tenant]/admin` | Staff + branding + compliance | `admin` or `owner` role |
| `/[tenant]/optical` | Optical dashboard | `optical_dispensing` entitlement |

### BFF Proxy Routes

| Frontend Route | Upstream FastAPI | Purpose |
|---------------|-----------------|---------|
| `/api/encounters/*` | `http://localhost:8000/encounters/*` | Encounter CRUD + sub-resources |
| `/api/patients/*` | `http://localhost:8000/patients/*` | Patient CRUD + problems |
| `/api/appointments/*` | `http://localhost:8000/appointments/*` | Scheduling |
| `/api/superbills/*` | `http://localhost:8000/superbills/*` | Billing |
| `/api/staff/*` | `http://localhost:8000/staff/*` | Staff management |
| `/api/audit-logs/*` | `http://localhost:8000/audit-logs/*` | HIPAA audit trail |
| `/api/optical/*` | `http://localhost:8000/optical/*` | Optical queue |

All BFF routes authenticate via Supabase `getUser()`, then forward to FastAPI using `lib/bff.ts` `proxyToFastAPI()`.

### Layout Nesting

```
Root Layout (app/layout.tsx)
  └── fonts (Plus Jakarta Sans) + ThemeProvider
      └── Tenant Layout (app/(tenant)/[tenant]/layout.tsx)
          ├── Sidebar (fixed left, z-20, collapsible)
          ├── TopNav (sticky top, z-30, patient info on encounter routes)
          └── <main> (page content, z-10)
```

---

## 5. Authentication Pipeline

```
Login page
  → Supabase signInWithPassword()
  → Supabase custom_access_token_hook (SQL, SECURITY DEFINER)
    → Injects into JWT app_metadata:
        tenant_slug, tenant_id, role, schema_name,
        clinic_name, plan_name, staff_id, full_name
  → window.location.href redirect (full page load)
  → middleware.ts reads JWT via getUser()
    → Unauthenticated → redirect /login
    → No tenant_slug → redirect /login
    → Authenticated → allow through
  → session-hydrator.ts extracts claims → AppSession
  → useEntitlements() derives permissions from PLAN_FEATURES[planName]
  → All stores/components read from sessionStore selectors
```

### Session Security
- 30-minute inactivity timeout
- Logout clears: 6 clinical Zustand stores + localStorage keys
- JWT refresh via Supabase client (automatic)

### Intake Auth (Separate Pipeline)
```
Patient receives link → /intake/[token]
  → Backend validates token (not expired, not revoked, attempts < 3)
  → DOB verification (patient enters DOB, backend checks against appointment.patient.dob)
  → On match → form unlocked, session cookie set
  → On submit → intake_data_jsonb stored, AI triage runs, status → submitted
```

---

## 6. State Management

All stores use Zustand with devtools middleware. Selector hooks prevent unnecessary re-renders.

### Store Inventory

| Store | Purpose | Persistence |
|-------|---------|------------|
| `sessionStore` | Auth state, user profile, tenant context | Memory (re-hydrated from Supabase on mount) |
| `encounterStore` | Active encounter + finalize modal toggle | Memory |
| `vitalsStore` | Draft/committed vitals with debounced save | API (1.5s debounce) |
| `refractionStore` | Draft/committed Rx with debounced save | API (1.5s debounce) |
| `examFindingsStore` | Per-section findings with WNL workflow | API (1.5s debounce) |
| `diagnosisStore` | ICD-10 diagnoses per encounter | API (immediate) |
| `appointmentStore` | Schedule data + booking/status actions | API |
| `superbillStore` | Billing data + CPT line items | API |
| `patientStore` | Patient list + detail data | API |
| `pageHeaderStore` | Dynamic page title/subtitle | Memory |
| `themeStore` | Dark/light preference | localStorage |
| `tenantCustomizationStore` | Logo URL + accent color | localStorage |

### Save Lifecycle (Clinical Stores)

```
idle → (user types) → dirty → (1.5s debounce) → saving → (API response) → saved → (2s) → idle
                                                       → (API error) → error
```

Patterns: Debounced auto-save (1.5s), flush on blur, draft/committed dual-state.

---

## 7. Entitlement System

### Subscription Tiers

| Tier | Features |
|------|----------|
| **Core** | scheduling, patient_demographics, basic_exam, icd10_diagnoses |
| **Plus** | Core + billing_export, multi_provider |
| **Premium** | Plus + ai_scribe, advanced_analytics, equipment_import, optical_dispensing |
| **Internal** | All + super_admin |

### RBAC Permission Matrix (16 Actions x 5 Roles)

| Action | Doctor | Technician | Receptionist | Admin | Owner |
|--------|--------|------------|--------------|-------|-------|
| scheduling | Y | Y | Y | Y | Y |
| patient_demographics | Y | Y | Y | Y | Y |
| basic_exam | Y | Y | - | - | Y |
| vitals_entry | Y | Y | - | - | Y |
| exam_findings | Y | - | - | - | Y |
| diagnoses | Y | - | - | - | Y |
| finalize_encounter | Y | - | - | - | Y |
| ai_scribe | Y | - | - | - | Y |
| billing_export | Y | - | - | Y | Y |
| optical_dispensing | Y | Y | - | - | Y |
| admin_panel | - | - | - | Y | Y |
| staff_management | - | - | - | Y | Y |
| audit_logs | Y | - | - | Y | Y |

### Hook API

```typescript
const { has, hasAll, hasAny, requireRole, planName, role } = useEntitlements()

has("ai_scribe")                        // O(1) Set lookup
hasAll("billing_export", "ai_scribe")   // All required
hasAny("ai_scribe", "advanced_analytics") // Any sufficient
requireRole("admin", "owner")           // Role check
```

---

## 8. Database Design

### Public Schema (SaaS Control Plane)

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `subscription_plans` | id, name, slug, price_cents, interval, base_features_jsonb | Tier definitions |
| `tenants` | id, name, slug, schema_name, status, plan_id, owner_id | Clinic registry |
| `tenant_addons` | id, tenant_id, feature_key, enabled_at | Add-on entitlements |
| `tenant_members` | id, user_id, tenant_id, role, is_active | User-tenant associations |

### Tenant Schema (Per-Clinic, Isolated)

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `staff` | id, user_id, tenant_id, role, first_name, last_name, license_number, npi | Clinic staff |
| `patients` | id, tenant_id, first_name, last_name, dob, sex, contact_info_jsonb, medical_history_jsonb | Demographics |
| `appointments` | id, tenant_id, patient_id, provider_id, start_time, duration_minutes, status, type, chief_complaint | Scheduling |
| `encounters` | id, tenant_id, patient_id, provider_id, appointment_id, encounter_date, chief_complaint, is_finalized, signed_by_id, assessment_and_plan | Visit records |
| `vitals_and_pretest` | id, encounter_id, iop_od, iop_os, bcva_od, bcva_os, blood_pressure, recorded_by_id | Pre-exam data (1:1) |
| `refractions` | id, encounter_id, refraction_type, od_sphere/cyl/axis/add, os_sphere/cyl/axis/add, pd_distance, is_final_rx | Prescriptions (1:many) |
| `exam_findings` | id, encounter_id, patient_id, exam_section, is_normal_wnl, findings_od, findings_os | Structured exam notes (JSONB) |
| `diagnoses` | id, encounter_id, icd10_code, description, eye_affected, severity, status | ICD-10 coded conditions |
| `patient_problems` | id, patient_id, icd10_code, eye_affected, status, onset_date, source_encounter_id | Master problem list |
| `superbills` | id, encounter_id, patient_id, provider_id, status, total_amount_cents | Billing records |
| `superbill_line_items` | id, superbill_id, cpt_code, description, units, charge_cents, diagnosis_pointers | CPT line items |
| `intake_tokens` | id, tenant_id, appointment_id, token, status, expires_at, dob_verified, intake_data_jsonb, triage_flags_jsonb | Patient intake |
| `audit_logs` | id, tenant_id, staff_id, action, resource_type, resource_id, details_jsonb, ip_address | HIPAA audit trail |

### Enum Strategy

All enums stored as VARCHAR (`native_enum=False`) via SQLAlchemy wrapper with `values_callable`. No database migrations needed for new enum values.

### Tenant Isolation

FastAPI middleware decodes JWT -> extracts `tenant_id` -> sets `SET search_path TO {schema_name}` per request. All queries include `WHERE tenant_id = ctx.tenant_id` via TenantBase mixin.

---

## 9. AI Integration

| Feature | Model | Max Tokens | Trigger |
|---------|-------|-----------|---------|
| AI Scribe | claude-sonnet-4-6-20250514 | streaming | Doctor clicks "Generate" in AiScribeWidget |
| AI Triage | claude-sonnet-4-6-20250514 | 300 | Patient submits intake form chief complaint |
| AI Prep Me | claude-sonnet-4-6-20250514 | 300 | Doctor clicks "Prep Me" on patient detail page |
| AI MDM | Rule-based + AI | — | Encounter finalized, superbill generated |

All AI features gracefully degrade when `ANTHROPIC_API_KEY` is not set (return fallback values, not errors).

---

## 10. Theme & Customization

### ThemeProvider Logic

1. Reads `theme` from `themeStore` -> sets `data-theme` attribute on `<html>`
2. Reads `accentColor` from `tenantCustomizationStore`
3. Derives 9 CSS variables dynamically from the accent hex:

```
--accent           → hex (base)
--accent-dim       → rgba(r,g,b, 0.10)
--accent-hover     → lightenHex(color, 0.15)
--accent-glow      → rgba(r,g,b, 0.15)
--accent-strong    → rgba(r,g,b, 0.25)
--mono-bg          → rgba(r,g,b, 0.05)
--mono-border      → rgba(r,g,b, 0.20)
--border-glow      → rgba(r,g,b, 0.20)
--shadow-glow      → 0 0 20px rgba(r,g,b, 0.08)
```

### Admin Settings (admin/owner only)

- Logo: drag-and-drop upload (stored as data URL)
- Accent: 8 preset swatches + custom hex picker
- WCAG AA contrast indicator on selected color
- Theme toggle: light/dark segmented control

---

## 11. Testing

| Layer | Tool | Location |
|-------|------|----------|
| Unit | Vitest + testing-library | `tests/` |
| E2E | Playwright (via skill) | `tests/e2e/` |
| Backend | Manual + E2E (no pytest yet) | — |
| Type check | `npx tsc --noEmit` | — |

### E2E Test Coverage

- `smoke-login.spec.js` — login flow + slug URL verification
- `smoke-pages.spec.js` — schedule/patients access + API 200s
- `smoke-intake.spec.js` — intake form submission
- `debug-auth.spec.js` — auth diagnostic with network capture

---

## 12. Related Documentation

| Document | Description |
|----------|-------------|
| `README.md` | Project overview, features, getting started |
| `docs/pitch-california.md` | Market positioning & feature pitch for CA optometrists |
| `docs/technical-specification.md` | California-compliant technical spec |
| `docs/BRAND_GUIDELINES.md` | Design system (colors, typography, components, motion) |
| `docs/SUPABASE_SECURITY_AUDIT.md` | Supabase configuration security review |
| `CLAUDE.md` | Claude Code development instructions |
| `.planning/ROADMAP.md` | MVP phase roadmap (7/7 complete) |
