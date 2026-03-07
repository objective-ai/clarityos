# ClarityOS EHR — Directory Structure

## Full Directory Tree

```
clarityos-erp/
│
├── .claude/                            Claude Code configuration
│   ├── agents/                         Sub-agent definitions (architect, auditor, frontend, qa, git)
│   ├── agent-memory/                   Persistent memory per sub-agent
│   ├── commands/                       Custom slash commands
│   │   ├── audit-clinical.md           /audit-clinical command definition
│   │   └── git-strategy.md             /git-strategy command definition
│   └── settings.json                   Claude Code settings
│
├── .planning/                          GSD planning system
│   ├── config.json                     GSD configuration
│   └── codebase/                       (this directory) Architecture docs
│
├── app/                                DUAL PURPOSE — Next.js pages AND Python backend
│   │
│   ├── (tenant)/                       Next.js route group (no URL segment)
│   │   └── [tenantId]/                 Dynamic route: /sunview/...
│   │       ├── layout.tsx              Tenant shell (Sidebar + TopNav + PatientStickyHeader)
│   │       ├── dashboard/
│   │       │   └── page.tsx            Command center: stat cards + quick nav
│   │       ├── schedule/
│   │       │   └── page.tsx            Timeline schedule (entitlement-gated)
│   │       ├── patients/
│   │       │   ├── page.tsx            Patient list: glass table + search
│   │       │   └── [patientId]/
│   │       │       └── page.tsx        Patient detail + Rx history
│   │       ├── encounter/
│   │       │   └── [encounterId]/
│   │       │       └── page.tsx        Full clinical workspace (main exam page)
│   │       ├── admin/
│   │       │   └── page.tsx            Admin panel (admin/owner only)
│   │       ├── analytics/
│   │       │   └── page.tsx            Analytics dashboard
│   │       └── settings/
│   │           └── page.tsx            Logo upload + accent color customization
│   │
│   ├── layout.tsx                      Root Next.js layout (fonts + ThemeProvider)
│   ├── page.tsx                        Root redirect → /sunview/dashboard
│   ├── globals.css                     Design tokens, glass system, animations, utilities
│   │
│   ├── __init__.py                     Python package marker
│   ├── main.py                         FastAPI application entry point
│   │
│   ├── api/                            FastAPI route modules
│   │   ├── __init__.py
│   │   └── routes/
│   │       ├── __init__.py
│   │       ├── ai_scribe.py            SSE streaming AI Scribe + accept endpoint
│   │       ├── audit.py                Audit log query endpoints
│   │       ├── diagnosis.py            ICD-10 diagnosis CRUD
│   │       ├── encounter.py            Encounter CRUD + finalize
│   │       ├── exam_findings.py        Exam findings JSONB upsert
│   │       ├── patient_problem.py      Master problem list CRUD
│   │       ├── promotion.py            Diagnosis → problem list promotion
│   │       ├── refraction.py           Refraction entry per column
│   │       ├── staff.py                Staff management
│   │       └── vitals.py               Vitals/pre-test upsert
│   │
│   ├── core/                           Shared backend logic
│   │   ├── __init__.py
│   │   ├── audit.py                    log_action() — HIPAA append-only audit writer
│   │   ├── config.py                   Settings via pydantic-settings (reads .env)
│   │   ├── entitlements.py             Feature key enum (mirrors frontend lib/entitlements.ts)
│   │   ├── permissions.py              RBAC: ClinicalAction enum + PERMISSION_MATRIX + require_permission()
│   │   └── security.py                 JWT verification → TenantContext, resolve_staff()
│   │
│   ├── db/                             Database layer
│   │   ├── base.py                     PublicBase + TenantBase declarative bases
│   │   ├── mixins.py                   TimestampMixin + SoftDeleteMixin
│   │   ├── session.py                  Async engine + AsyncSessionLocal + get_db dependency
│   │   └── models/
│   │       ├── __init__.py
│   │       ├── public/
│   │       │   ├── __init__.py
│   │       │   └── saas.py             SubscriptionPlan, Tenant, TenantAddon, TenantMember
│   │       └── tenant/
│   │           ├── __init__.py
│   │           └── clinical.py         Staff, Patient, Appointment, Encounter,
│   │                                   VitalsAndPretest, Refraction, ExamFindings,
│   │                                   Diagnosis, PatientProblem, AuditLog
│   │
│   └── schemas/                        Pydantic request/response models
│       ├── __init__.py
│       ├── audit.py                    AuditLog response schema
│       ├── common.py                   Shared base schemas (pagination, etc.)
│       ├── diagnosis.py                DiagnosisCreate, DiagnosisResponse
│       ├── encounter.py                EncounterCreate/Update/Finalize/Response
│       ├── exam_findings.py            ExamFindingsUpsert, ExamFindingsResponse
│       ├── patient_problem.py          PatientProblemCreate, PatientProblemResponse
│       ├── refraction.py               RefractionCreate, RefractionSummary
│       ├── staff.py                    StaffCreate, StaffResponse
│       └── vitals.py                   VitalsUpsert, VitalsResponse
│
├── components/                         React components
│   ├── PatientChartModal.tsx            Patient chart modal overlay
│   ├── PatientStickyHeader.tsx          Clinical safety banner with alert pills
│   ├── Sidebar.tsx                      Glass nav sidebar with glow active states
│   ├── ThemeProvider.tsx                Headless provider: syncs theme + accent CSS vars
│   ├── TopNav.tsx                       Page title + sun/moon toggle + avatar
│   │
│   ├── auth/
│   │   └── PermissionGate.tsx           Declarative role gate (hide/disable modes)
│   │
│   ├── encounter/                       All encounter-specific components
│   │   ├── AuditTrailSidebar.tsx        Slide-over audit trail (admin/owner only)
│   │   ├── ClinicalDiffViewer.tsx       Before/after diff viewer for AI Scribe changes
│   │   ├── ContinuitySidebar.tsx        Active master problems sidebar
│   │   ├── DiagnosisPicker.tsx          ICD-10 search + laterality selection
│   │   ├── EncounterBottomTabs.tsx      Fixed bottom navigation bar
│   │   ├── ExamFindings.tsx             Accordion (anterior/posterior) — editable mode
│   │   ├── ExamFindingsCard.tsx         Findings display — read-only mode
│   │   ├── FinalizeModal.tsx            Guided sign & finalize dialog
│   │   ├── RefractionGrid.tsx           Keyboard-optimized 4-column Rx entry grid
│   │   ├── VitalsCard.tsx               Vitals display — read-only mode
│   │   └── VitalsForm.tsx               Vitals entry form — editable mode
│   │
│   ├── patient/
│   │   └── ProblemListCard.tsx          Master problem list display card
│   │
│   └── ui/                             shadcn/ui primitives (customized)
│       ├── badge.tsx                   7 variants: default/secondary/destructive/success/warning/info/outline
│       ├── button.tsx                  6 variants + 4 sizes, rounded-xl
│       ├── card.tsx                    glass-card + glass-card-hover + glass-card-accent
│       ├── dialog.tsx                  shadcn Dialog with glass styling
│       ├── dropdown-menu.tsx           shadcn DropdownMenu with glass styling
│       └── stat-card.tsx               KPI card with optional accent glow
│
├── contexts/
│   └── SidebarContext.tsx              React Context for sidebar collapsed state
│
├── docs/
│   ├── pitch-california.md             Sales pitch document
│   └── technical-specification.md     Technical specification
│
├── hooks/                              Custom React hooks
│   ├── useAiScribe.ts                  SSE client for AI Scribe streaming + mock fallback
│   ├── useEntitlements.ts              Feature gate hook (has/hasAll/hasAny/requireRole)
│   └── useRefractionKeyboard.ts        Arrow key navigation for RefractionGrid
│
├── lib/                                Utilities and data
│   ├── api-client.ts                   apiFetch() — attaches Supabase Bearer token
│   ├── color-utils.ts                  hexToRgb(), lightenHex() — accent color math
│   ├── entitlements.ts                 Entitlement constant enum + ENTITLEMENT_META
│   ├── exam-findings-fields.ts         Anterior/posterior structure definitions
│   ├── mock-patient-data.ts            Mock patient records
│   ├── mock-refraction-data.ts         Demo Rx data
│   ├── mock-schedule-data.ts           Mock schedule/appointment data
│   ├── mock-staff-data.ts              Mock staff records
│   ├── mock-vitals-data.ts             Mock vitals data
│   ├── rx-format.ts                    Rx formatting, parsing, rounding, validation
│   ├── supabase.ts                     Supabase JS client initialization
│   ├── utils.ts                        cn() utility (clsx + tailwind-merge)
│   ├── auth/
│   │   └── mock-session.ts             4 mock role scenarios + hydrateRealSession()
│   └── mock/
│       └── personas.ts                 getInitialStoreState() — persona-based mock seeding
│
├── store/                              Zustand stores
│   ├── diagnosisStore.ts               ICD-10 diagnoses per encounter
│   ├── encounterStore.ts               Encounter status, finalization, AI summary
│   ├── examFindingsStore.ts            Anterior + posterior findings per encounter
│   ├── problemListStore.ts             Master problem list per patient
│   ├── refractionStore.ts              4-column Rx grid, draft/committed, debounce save
│   ├── sessionStore.ts                 Auth session (AppSession | null)
│   ├── tenantCustomizationStore.ts     Logo URL + accent color (localStorage)
│   ├── themeStore.ts                   Dark/light preference (localStorage)
│   └── vitalsStore.ts                  Vitals/pre-test fields per encounter
│
├── types/                              TypeScript type definitions
│   ├── diagnosis.ts                    Diagnosis types, EyeLaterality
│   ├── encounter.ts                    EncounterStatus, EncounterState
│   ├── exam-findings.ts                ExamSection, FindingsStoreKey, StructureFinding
│   ├── patient-problem.ts              PatientProblem types
│   ├── patient.ts                      Patient types, PatientAlert
│   ├── refraction.ts                   RefractionDraft, ColumnState, GridCoord, RowKey
│   ├── session.ts                      AppSession, JwtPayload, EntitlementKey, StaffRole
│   └── vitals.ts                       VitalsDraft, VitalsCommitted
│
├── backend/
│   └── seed_db.py                      Database seed script
│
├── venv/                               Python virtual environment (not committed)
│
├── .env                                Environment variables (local, not committed)
├── .env.example                        Environment variable template
├── .env.local                          Next.js local env vars
├── .env.local.example                  Next.js env var template
├── .gitignore
├── ARCHITECTURE.md                     Root-level architecture doc (older version)
├── BRAND_GUIDELINES.md                 Design system documentation
├── DESIGN_TEMPLATE.md                  Quick-reference for building new pages/components
├── README.md
├── architecture.txt                    Original architecture brainstorm
├── next-env.d.ts                       Next.js TypeScript declarations
├── next.config.js                      Next.js configuration (if present)
├── package.json                        Node dependencies
├── package-lock.json
├── postcss.config.js                   PostCSS: tailwindcss + autoprefixer (v3 config)
├── requirements.txt                    Python dependencies
├── tailwind.config.ts                  Tailwind configuration
└── tsconfig.json                       TypeScript configuration (strict, @/* alias)
```

---

## Key File Locations and Purposes

### Authentication and Session

| File | Purpose |
|------|---------|
| `app/core/security.py` | JWT verification, TenantContext extraction, resolve_staff() |
| `app/core/permissions.py` | RBAC: ClinicalAction enum, PERMISSION_MATRIX, require_permission() factory |
| `store/sessionStore.ts` | Frontend auth state: AppSession \| null, setSession(), clearSession() |
| `lib/auth/mock-session.ts` | 4 mock personas, getMockSession(), hydrateRealSession() |
| `types/session.ts` | AppSession, JwtPayload, EntitlementKey, StaffRole type definitions |
| `hooks/useEntitlements.ts` | useEntitlements() hook — has(), hasAll(), hasAny(), requireRole() |
| `components/auth/PermissionGate.tsx` | Declarative role gate React component |

### Database Models

| File | Purpose |
|------|---------|
| `app/db/base.py` | PublicBase + TenantBase declarative bases |
| `app/db/mixins.py` | TimestampMixin, SoftDeleteMixin |
| `app/db/session.py` | Async engine, session factory, get_db dependency |
| `app/db/models/public/saas.py` | SaaS layer: Tenant, SubscriptionPlan, TenantAddon, TenantMember |
| `app/db/models/tenant/clinical.py` | Clinical layer: Staff, Patient, Appointment, Encounter, VitalsAndPretest, Refraction, ExamFindings, Diagnosis, PatientProblem, AuditLog; all enums (StaffRole, RefractionType, EyeAffected, AuditAction, etc.) |

### API Routes

| File | Route Prefix | Purpose |
|------|-------------|---------|
| `app/api/routes/encounter.py` | `/api/encounters` | CRUD + finalize |
| `app/api/routes/ai_scribe.py` | `/api/encounters/{id}/ai-scribe` | SSE streaming + accept |
| `app/api/routes/refraction.py` | `/api/encounters/{id}/...` | Rx entry per column |
| `app/api/routes/vitals.py` | `/api/encounters/{id}/vitals` | Vitals upsert |
| `app/api/routes/exam_findings.py` | `/api/encounters/{id}/exam-findings` | JSONB findings upsert |
| `app/api/routes/diagnosis.py` | `/api/encounters/{id}/diagnoses` | ICD-10 CRUD |
| `app/api/routes/promotion.py` | `/api/encounters/{id}/promote` | Dx → problem list |
| `app/api/routes/patient_problem.py` | `/api/patients/{id}/problems` | Master problem list |
| `app/api/routes/staff.py` | `/api/staff` | Staff management |
| `app/api/routes/audit.py` | `/api/audit` | Audit log queries |

### Design System

| File | Purpose |
|------|---------|
| `app/globals.css` | All CSS custom properties, glass system classes, animation utilities |
| `tailwind.config.ts` | Tailwind theme extending with CSS var references |
| `BRAND_GUIDELINES.md` | Full design system documentation |
| `DESIGN_TEMPLATE.md` | Quick-reference templates for building new pages/components |
| `lib/color-utils.ts` | hexToRgb(), lightenHex(), WCAG contrast ratio computation |
| `components/ThemeProvider.tsx` | Runtime CSS var injection from Zustand stores |

### Clinical Workflow Components

| File | Purpose |
|------|---------|
| `components/encounter/RefractionGrid.tsx` | 4-column Rx grid with keyboard navigation |
| `components/encounter/ExamFindings.tsx` | Accordion-based exam findings editor |
| `components/encounter/DiagnosisPicker.tsx` | ICD-10 search with laterality (OD/OS/OU) |
| `components/encounter/VitalsForm.tsx` | Pre-test vitals entry (technician role) |
| `components/encounter/FinalizeModal.tsx` | Guided finalization with diagnosis guardrail |
| `components/encounter/AuditTrailSidebar.tsx` | Slide-over audit log viewer with field revert |
| `components/encounter/ClinicalDiffViewer.tsx` | Before/after diff for AI Scribe auto-fill |
| `components/PatientStickyHeader.tsx` | Patient safety banner: name, DOB, alert pills |

---

## Naming Conventions

### Files

| Pattern | Convention | Examples |
|---------|-----------|---------|
| React components | PascalCase `.tsx` | `Sidebar.tsx`, `RefractionGrid.tsx`, `PermissionGate.tsx` |
| Zustand stores | camelCase `Store.ts` | `sessionStore.ts`, `refractionStore.ts` |
| Hooks | `use` prefix camelCase | `useEntitlements.ts`, `useAiScribe.ts` |
| Lib utilities | camelCase | `api-client.ts`, `color-utils.ts`, `rx-format.ts` |
| Type definitions | kebab-case | `exam-findings.ts`, `patient-problem.ts` |
| Python modules | snake_case | `ai_scribe.py`, `exam_findings.py` |
| Next.js conventions | lowercase | `page.tsx`, `layout.tsx` |

### Components

| Pattern | Convention |
|---------|-----------|
| Page component export | `export default function XxxPage({ params })` |
| Layout component export | `export default function XxxLayout({ children, params })` |
| Shared UI component export | Named export: `export function ComponentName(...)` |
| shadcn/ui primitives | Named exports matching shadcn conventions |

### Stores

Every store exports:
- The store hook: `export const useXxxStore = create<XxxState>()(...)`
- Selector hooks: `export const useXxx = () => useXxxStore((s) => s.xxx)`

### Python

| Pattern | Convention |
|---------|-----------|
| FastAPI routers | `router = APIRouter()` then `@router.get/post/patch/...` |
| Pydantic schemas | `XxxCreate`, `XxxUpdate`, `XxxResponse` |
| SQLAlchemy models | Singular PascalCase noun: `Encounter`, `VitalsAndPretest` |
| Table names | plural snake_case via auto-generated `__tablename__` |
| Enums | PascalCase class, UPPER_SNAKE values |

---

## Route Structure and URL Patterns

### Next.js URL Patterns

| URL Pattern | Page File | Description |
|------------|-----------|-------------|
| `/` | `app/page.tsx` | Redirect to `/sunview/dashboard` |
| `/:tenantId/dashboard` | `app/(tenant)/[tenantId]/dashboard/page.tsx` | Command center |
| `/:tenantId/schedule` | `app/(tenant)/[tenantId]/schedule/page.tsx` | Appointment timeline |
| `/:tenantId/patients` | `app/(tenant)/[tenantId]/patients/page.tsx` | Patient list |
| `/:tenantId/patients/:patientId` | `app/(tenant)/[tenantId]/patients/[patientId]/page.tsx` | Patient chart |
| `/:tenantId/encounter/:encounterId` | `app/(tenant)/[tenantId]/encounter/[encounterId]/page.tsx` | Clinical workspace |
| `/:tenantId/admin` | `app/(tenant)/[tenantId]/admin/page.tsx` | Admin panel |
| `/:tenantId/analytics` | `app/(tenant)/[tenantId]/analytics/page.tsx` | Analytics |
| `/:tenantId/settings` | `app/(tenant)/[tenantId]/settings/page.tsx` | Tenant settings |

**Demo URL**: The hardcoded demo clinic slug is `sunview`, so the default landing URL is `/sunview/dashboard`.

### FastAPI Endpoint Patterns

| Method | Endpoint | Action | Role Required |
|--------|---------|--------|--------------|
| `POST` | `/api/encounters/` | Create encounter | doctor, technician, admin, owner |
| `GET` | `/api/encounters/{id}` | Get encounter + all sub-resources | all roles |
| `PATCH` | `/api/encounters/{id}` | Update encounter fields | doctor, technician, admin, owner |
| `POST` | `/api/encounters/{id}/finalize` | Sign and lock | doctor, owner |
| `POST` | `/api/encounters/{id}/ai-scribe` | Stream SOAP note (SSE) | doctor, owner |
| `POST` | `/api/encounters/{id}/ai-scribe/accept` | Log AI auto-fill | doctor, owner |
| `PUT/PATCH` | `/api/encounters/{id}/vitals` | Upsert vitals | doctor, technician, owner |
| `GET/PUT` | `/api/encounters/{id}/refractions` | Rx entry | doctor, technician, owner |
| `PUT` | `/api/encounters/{id}/exam-findings/{section}` | Upsert findings | doctor, owner |
| `POST` | `/api/encounters/{id}/diagnoses` | Add diagnosis | doctor, owner |
| `DELETE` | `/api/encounters/{id}/diagnoses/{dxId}` | Soft-delete diagnosis | doctor, owner |
| `POST` | `/api/encounters/{id}/promote/{dxId}` | Promote to problem list | doctor, owner |
| `GET/POST` | `/api/patients/{id}/problems` | Problem list | varies |
| `GET/POST` | `/api/staff` | Staff management | admin, owner |
| `GET` | `/api/audit` | Query audit log | admin, owner |

---

## Environment Configuration

### Next.js (.env.local)

| Variable | Purpose |
|---------|---------|
| `NEXT_PUBLIC_API_URL` | FastAPI base URL (default: `http://localhost:8000`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key for client-side auth |

### Python (.env)

| Variable | Purpose |
|---------|---------|
| `DATABASE_URL` | asyncpg connection string for Supabase Postgres |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS — backend only) |
| `SUPABASE_JWT_SECRET` | JWT secret for token verification (dev bypass if unset) |
| `ANTHROPIC_API_KEY` | Claude API key for AI Scribe |
| `SECRET_KEY` | Application secret key |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token lifetime (default 10080 = 7 days) |
| `CORS_ORIGINS` | Allowed origins (default: `["http://localhost:3000"]`) |
| `DB_ECHO_SQL` | Log SQL queries (default: false) |
