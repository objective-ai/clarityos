# ClarityOS ERP — System Architecture

> **Version:** 1.0 | **Updated:** 2026-03-04 | **Status:** Phase 3 Complete (Frontend MVP)

---

## 1. System Overview

| Property | Value |
|----------|-------|
| Product | Clarity EHR / ClarityOS ERP |
| Domain | Optometry EHR/PMS (Electronic Health Record / Practice Management System) |
| Model | Multi-tenant SaaS (schema-per-tenant PostgreSQL) |
| Frontend | Next.js 14 (App Router) + React 18 + TypeScript 5.5 strict |
| Styling | Tailwind CSS 3.4 + shadcn/ui + CSS custom properties |
| State | Zustand 4.5 with devtools + persist middleware |
| Backend (planned) | Python FastAPI + PostgreSQL + Redis/Celery |
| Auth (current) | Mock JWT sessions (4 role scenarios) |
| Auth (planned) | JWT with entitlements payload from FastAPI |

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
| class-variance-authority | latest | Component variant system |
| clsx + tailwind-merge | latest | Conditional class composition (`cn()`) |
| lucide-react | latest | Icon library |

### Build Tools

| Tool | Config File | Notes |
|------|-------------|-------|
| PostCSS | `postcss.config.mjs` | `tailwindcss` (v3) + `autoprefixer` |
| Tailwind | `tailwind.config.ts` | Extended theme with CSS variable aliases |
| TypeScript | `tsconfig.json` | Strict mode, `@/*` path alias, ES2017 target |

> **Important:** PostCSS uses Tailwind v3 (`tailwindcss`), NOT v4 (`@tailwindcss/postcss`). All CSS uses v3 `@tailwind` directives.

---

## 3. Folder Structure

```
app/
├── layout.tsx                              Root layout (fonts + ThemeProvider)
├── globals.css                             Design tokens, glassmorphism, animations
├── page.tsx                                Redirect → /demo-clinic/dashboard
└── (tenant)/[tenantId]/
    ├── layout.tsx                          Tenant shell (ambient-bg + Sidebar + TopNav)
    ├── dashboard/page.tsx                  Clinic overview (StatCards + quick-nav)
    ├── schedule/page.tsx                   Daily appointment timeline
    ├── patients/page.tsx                   Searchable patient table
    ├── encounter/[encounterId]/page.tsx    Full exam room workspace
    └── settings/page.tsx                   Logo + accent color (admin/owner)

components/
├── Sidebar.tsx                             Glass nav, collapsible, role-aware
├── TopNav.tsx                              Page title + gear icon + theme toggle + avatar
├── ThemeProvider.tsx                       Syncs theme + derives accent CSS vars
├── PatientStickyHeader.tsx                 Clinical safety banner (alerts, status)
├── encounter/
│   ├── RefractionGrid.tsx                  Keyboard-optimized Rx entry (4×12 grid)
│   ├── ExamFindings.tsx                    Anterior/posterior accordion
│   └── DiagnosisPicker.tsx                 ICD-10 search + OD/OS/OU laterality
└── ui/
    ├── card.tsx                            shadcn Card (glass-card base)
    ├── badge.tsx                           7 variants (pill-shaped)
    ├── button.tsx                          6 variants, 4 sizes
    ├── stat-card.tsx                       KPI display with optional glow
    └── dropdown-menu.tsx                   Radix dropdown (glass styling)

hooks/
├── useEntitlements.ts                      Feature gating (has/hasAll/hasAny/requireRole)
└── useRefractionKeyboard.ts                Grid keyboard navigation

store/
├── sessionStore.ts                         JWT + auth state (mock in dev)
├── refractionStore.ts                      Draft/committed Rx with debounced save
├── themeStore.ts                           Dark/light preference
└── tenantCustomizationStore.ts             Logo URL + accent color

types/
├── session.ts                              JWT payload, entitlements, roles
└── refraction.ts                           Rx types, row keys, grid coords

lib/
├── utils.ts                                cn() utility
├── color-utils.ts                          Hex/RGB/HSL + WCAG contrast
├── rx-format.ts                            Rx formatting, parsing, validation
├── entitlements.ts                         Feature keys, plan mappings, metadata
├── auth/mock-session.ts                    4 mock role scenarios
└── mock-refraction-data.ts                 Demo Rx data
```

---

## 4. Routing

Next.js App Router with route groups and dynamic segments.

| Route | Page | Access |
|-------|------|--------|
| `/` | Redirect → `/demo-clinic/dashboard` | Public |
| `/[tenantId]/dashboard` | Clinic overview | Authenticated |
| `/[tenantId]/schedule` | Daily appointments | `scheduling` entitlement |
| `/[tenantId]/patients` | Patient search/table | `patient_demographics` entitlement |
| `/[tenantId]/encounter/[encounterId]` | Exam room workspace | `basic_exam` entitlement |
| `/[tenantId]/settings` | Branding + customization | `admin` or `owner` role |

### Layout Nesting

```
Root Layout (app/layout.tsx)
  └── fonts (Plus Jakarta Sans) + ThemeProvider (returns null, runs useEffect)
      └── Tenant Layout (app/(tenant)/[tenantId]/layout.tsx)
          ├── Sidebar (fixed left, z-20)
          ├── TopNav (sticky top, z-30)
          ├── PatientStickyHeader (conditional, encounter routes only)
          └── <main> (page content, z-10)
```

---

## 5. State Management

All stores use Zustand with devtools middleware. Selector hooks prevent unnecessary re-renders.

### sessionStore

| Field | Type | Description |
|-------|------|-------------|
| `session` | `AppSession \| null` | Full JWT-hydrated session |
| `setSession()` | function | Replace session |
| `clearSession()` | function | Logout |

**Selectors:** `useSession()`, `useCurrentUser()`, `useCurrentTenant()`

**Dev initialization:** Auto-populates with `getMockSession("premium_doctor")` when `NODE_ENV === "development"`.

### refractionStore

| Field | Type | Description |
|-------|------|-------------|
| `draft` | `Record<ColType, RowData>` | Live editing state |
| `committed` | `Record<ColType, RowData>` | Last saved state |
| `saveStatus` | `idle \| dirty \| saving \| saved \| error` | Save lifecycle |
| `errors` | `Record<string, string>` | Field-level validation errors |
| `focusedCell` | `GridCoord \| null` | Keyboard focus tracking |

**Save lifecycle:**
```
idle → (user types) → dirty → (1.5s debounce) → saving → (API response) → saved → (2s) → idle
                                                       → (API error) → error
```

**Patterns:** Debounced auto-save (1.5s), flush on blur, draft/committed dual-state.

### themeStore

| Field | Type | Default |
|-------|------|---------|
| `theme` | `"dark" \| "light"` | `"dark"` |

Persisted to `clarity-theme` localStorage key. Toggle via `nextTheme()` helper.

### tenantCustomizationStore

| Field | Type | Default |
|-------|------|---------|
| `logoUrl` | `string \| null` | `null` |
| `accentColor` | `string` (hex) | `"#2DD4BF"` |

Persisted to `clarity-tenant-customization` localStorage key.

---

## 6. Type System

### Session Types (`types/session.ts`)

```typescript
type StaffRole = "owner" | "admin" | "doctor" | "technician" | "receptionist"
type EntitlementKey = "scheduling" | "patient_demographics" | "basic_exam" | ...

interface JwtPayload {
  sub: string           // user ID
  tenant_id: string
  schema_name: string
  role: StaffRole
  entitlements: EntitlementKey[]
  plan_name: string
  exp: number
}

interface AppSession {
  user: UserProfile
  tenant: TenantContext
  entitlements: Set<EntitlementKey>
  role: StaffRole
  planName: string
  expiresAt: Date
}
```

### Refraction Types (`types/refraction.ts`)

```typescript
type RefractionColumn = "habitual" | "auto" | "manifest" | "final"

type RowKey = "od_sph" | "od_cyl" | "od_axis" | "od_add" | "od_va"
            | "os_sph" | "os_cyl" | "os_axis" | "os_add" | "os_va"
            | "pd_dist" | "pd_near"

interface GridCoord { colIndex: number; rowKey: RowKey }
```

Cell IDs follow the pattern: `rx-cell-{colIndex}-{rowKey}`

---

## 7. Entitlement System

### Subscription Tiers

| Tier | Features |
|------|----------|
| **Core** | scheduling, patient_demographics, basic_exam, icd10_diagnoses |
| **Plus** | Core + billing_export, multi_provider |
| **Premium** | Plus + ai_scribe, advanced_analytics, equipment_import |
| **Internal** | All + super_admin |

### Hook API (`useEntitlements()`)

```typescript
const { has, hasAll, hasAny, requireRole, planName, role, isSuperuser } = useEntitlements()

has("ai_scribe")                    // O(1) Set lookup
hasAll("billing_export", "ai_scribe")  // All required
hasAny("ai_scribe", "advanced_analytics")  // Any sufficient
requireRole("admin", "owner")       // Role check
```

### UX Pattern

Locked features are **visible but gated** — shown with a lock icon and reduced opacity. Clicking triggers an upsell modal. Features are never hidden entirely, to drive upgrade awareness.

### Mock Scenarios

| Scenario | Role | Tier | Use Case |
|----------|------|------|----------|
| `premium_doctor` | doctor | Premium | Full access (default dev) |
| `technician` | technician | Core | Clinical only, no AI/billing |
| `core_plan` | doctor | Core | Upsell UI testing |
| `receptionist` | receptionist | Core | Scheduling + demographics only |

---

## 8. Component Hierarchy

### Encounter Page (Clinical Workspace)

```
Encounter Page
├── Dev Banner (NODE_ENV check, floating chip)
├── VitalsCard (Card)
│   ├── IOP (OD/OS) — amber glow if elevated
│   └── Visual Acuity (OD/OS)
├── RefractionGrid
│   └── 4 columns × 12 rows (keyboard-optimized)
├── ExamFindings (Accordion)
│   ├── Slit Lamp / Anterior Segment
│   └── Fundus / Posterior Segment
├── DiagnosisPicker
│   └── ICD-10 search + OD/OS/OU laterality buttons
└── AI Scribe Widget (entitlement-gated)
    ├── Premium: glass-card-accent, generate button
    └── Locked: UpsellModal with blur backdrop
```

### Sidebar Navigation

```
Sidebar (fixed left, collapsible 260px ↔ 60px)
├── Logo + Business Name
├── Collapse Toggle (ghost icon button)
├── Main Nav
│   ├── Dashboard
│   ├── Schedule (lock if no entitlement)
│   ├── Patients (lock if no entitlement)
│   └── Encounters
├── Divider
├── Secondary Nav
│   └── Settings (admin/owner only)
└── User Footer (avatar + name + role)
```

---

## 9. Refraction Grid

### Validation Rules

| Field | Range | Precision |
|-------|-------|-----------|
| Sphere | -25.00 to +25.00 | 0.25D steps |
| Cylinder | -25.00 to +25.00 | 0.25D steps |
| Axis | 1–180 (wraps) | Integer |
| Add | +0.75 to +3.50 | 0.25D steps |
| PD | 40–80 mm | 0.5mm |
| VA | Free-form | String (e.g., "20/20") |

### Display Formatting

| Field | Example | Rule |
|-------|---------|------|
| Sphere | `-2.25` | Always 2 decimals, explicit sign |
| Axis | `090` | Always 3 digits, zero-padded |
| Add | `+2.00` | Always positive, explicit + |
| PD | `63.5` | One decimal |

### Keyboard Navigation

| Key | Action |
|-----|--------|
| Tab / Shift+Tab | Move between columns (wrap at edges) |
| Arrow Up/Down | Move between rows, or increment/decrement values |
| Enter | Clinical smart-advance: SPH → CYL → AXIS (if cyl≠0) → VA |
| Escape | Clear cell |
| +/- | Increment/decrement diopter or axis at cursor start |

---

## 10. Theme & Customization

### ThemeProvider Logic

1. Reads `theme` from `themeStore` → sets `data-theme` attribute on `<html>`
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

### Settings Page (admin/owner only)

- Logo: drag-and-drop upload (stored as data URL)
- Accent: 8 preset swatches + custom hex picker
- WCAG AA contrast indicator on selected color
- Theme toggle: light/dark segmented control

---

## 11. Authentication

### Current (Development)

```
App initializes → sessionStore populated with getMockSession("premium_doctor")
→ All components read from useSession()/useCurrentUser()/useCurrentTenant()
→ No network auth required
```

### Planned (Production)

```
User submits credentials → POST /api/v1/global/auth/login
← Backend validates, returns JWT with entitlements[] payload
→ Frontend calls sessionStore.setSession(hydrateRealSession(jwt))
→ All components use real auth context
→ JWT refresh handled via middleware
```

---

## 12. Database Design (Planned)

### Public Schema (SaaS Overhead)

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `tenants` | id, name, schema_name, status | Clinic registry |
| `subscription_plans` | id, name, price, base_features_jsonb | Tier definitions |
| `tenant_addons` | id, tenant_id, feature_name, active | Add-on entitlements |
| `global_users` | id, email, password_hash, tenant_id | Authentication |

### Tenant Schema (Per-Clinic, Isolated)

| Table | Key Columns | Purpose |
|-------|-------------|---------|
| `patients` | id, first_name, last_name, dob, contact_info_jsonb | Demographics |
| `staff` | id, global_user_id, role, first_name, last_name | Clinic staff |
| `appointments` | id, patient_id, staff_id, start_time, status | Scheduling |
| `encounters` | id, patient_id, staff_id, date, chief_complaint, ai_summary_text | Visit records |
| `vitals_and_pretest` | id, encounter_id, iop_od, iop_os, blood_pressure | Pre-exam data |
| `refractions` | id, encounter_id, type, od_sph/cyl/axis/add, os_sph/cyl/axis/add, pd_dist/near | Prescriptions |
| `exam_findings` | id, encounter_id, category, details_jsonb | Flexible exam notes |
| `diagnoses` | id, encounter_id, icd10_code, description, eye_affected | Medical coding |

### Tenant Isolation

FastAPI middleware decodes JWT → extracts `tenant_id` → sets `SET search_path TO {schema_name}` per request. Impossible for queries to cross tenant boundaries.

---

## 13. API Design (Planned)

### Global Endpoints (`/api/v1/global`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/global/auth/login` | POST | Authenticate, return JWT |
| `/global/tenants/{id}/billing` | GET/POST | Stripe integration |

### Patient Endpoints (`/api/v1/patients`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/patients` | GET | Search/list (paginated) |
| `/patients` | POST | Create patient |
| `/patients/{id}` | GET | Full patient dashboard |

### Encounter Endpoints (`/api/v1/encounters`)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/encounters` | POST | Start new visit |
| `/encounters/{id}/vitals` | PUT | Save pre-test data |
| `/encounters/{id}/findings` | PATCH | Save exam notes (JSONB) |
| `/encounters/{id}/refractions` | POST | Log prescription |
| `/encounters/{id}/diagnoses` | POST | Attach ICD-10 code |

### AI Endpoints (Premium, Async)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/encounters/{id}/ai-scribe` | POST | Queue AI summary (returns 202 + job_id) |
| `/jobs/{job_id}` | GET | Poll job status |

AI jobs use Celery + Redis queue. WebSocket option for real-time streaming.

---

## 14. Key Utilities

### `lib/color-utils.ts`

- `hexToRgb()` / `rgbToHex()` / `rgbToHsl()` / `hslToRgb()` — Color conversions
- `lightenHex(hex, amount)` — Lighten by relative amount (0–1)
- `contrastRatio(fg, bg)` — WCAG 2.1 relative luminance ratio
- `meetsAA(fg, bg)` — ≥4.5:1 normal text | `meetsAALarge(fg, bg)` — ≥3:1 large text

### `lib/rx-format.ts`

- `roundToQuarter(value)` — Round to nearest 0.25D
- `formatDiopter()` / `formatAxis()` / `formatAdd()` / `formatPD()` — Display formatters
- `parseCellValue(rowKey, raw)` — Parse + validate input → `{ value, error }`
- `incrementDiopter()` / `decrementDiopter()` / `incrementAxis()` / `decrementAxis()`
- `clampSphere()` / `clampCylinder()` / `clampAxis()` / `clampAdd()` — Range enforcement

### `lib/entitlements.ts`

- `Entitlement` — Feature key constants object
- `PLAN_FEATURES` — Mapping of tier → feature keys
- `ENTITLEMENT_META` — Human-readable labels + descriptions (for upsell UI)

---

## 15. Related Documentation

| Document | Description |
|----------|-------------|
| `architecture.txt` | Original brainstorming & design planning |
| `ARCHITECTURE.md` | This file — current system architecture |
| `BRAND_GUIDELINES.md` | Full design system (colors, typography, components, motion) |
| `DESIGN_TEMPLATE.md` | Quick-reference templates for building new pages |

---

## 16. Roadmap

### Completed
- Phase 1: Type system, stores, RefractionGrid, PatientStickyHeader, Sidebar
- Phase 2: Tenant layout, Dashboard, Schedule, Patients pages
- Phase 3: ExamFindings, DiagnosisPicker, encounter page
- UI: Glassmorphism redesign, shadcn/ui components, settings page

### Next
- Patient detail page with Rx history (`/patients/[patientId]`)
- Encounter status flow (Pre-Test → In Exam → Finalized)
- FastAPI backend skeleton
- Real auth flow replacing mock sessions

### Future
- AI Scribe (async Celery job + WebSocket streaming)
- Advanced Analytics (Rx trends, revenue dashboards)
- Equipment Import (autorefractor/OCT via Local Agent)
- Optical POS & Inventory (frame/lens matrix)
- Billing & Insurance (clearinghouse integration)
