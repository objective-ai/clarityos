# Phase 8: Analytics Dashboard - Research

**Researched:** 2026-03-11
**Domain:** Data visualization, FastAPI aggregate queries, Recharts, glassmorphism UI
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Chart Styling
- Charts render with transparent background directly on glass-card surface (no inset)
- Subtle horizontal grid lines (rgba(255,255,255,0.05)), axis labels in --text-muted (#505868)
- No grid lines on donut chart (Claims Pipeline)
- Glass-style tooltips on hover with exact values

#### Color Palette
- Claude's discretion: pick a palette that works with glassmorphism dark mode and teal accent (#2DD4BF)
- Must be distinct enough to differentiate multiple data series

#### Layout
- 4 KPI stat cards in a row at top (Total Patients, Exams, Avg Wait, Revenue) — wired to real data with trend indicators
- KPI trends compare current period to previous equivalent period (e.g., 30d vs prior 30d) — green/red arrows with percentage
- Below KPIs: 2-column grid with mixed card sizes
- Full-width charts: Encounter Volume (bar), Revenue Trend (line), Patient Growth (area)
- Half-width charts: Top Diagnoses (horizontal bar), Claims Pipeline (donut), Appointment Utilization (multi-metric), Rx/Optical Metrics (mixed)
- Global date range picker (segmented control: 7d | 30d | 90d | 6mo) positioned top-right next to page title
- All charts respond to the same date range filter
- Responsive: collapses to single column on mobile

#### Loading & Empty States
- Skeleton placeholder per chart card while data loads (uses existing Skeleton component)
- New clinics with zero data: show chart structure (axes, labels) with zero/empty data + subtle banner: "Analytics will populate as you create encounters and appointments"
- Partial data: show what exists, no zero-padding. If 30d selected but only 14 days exist, subtitle shows "Showing 14 of 30 days"
- Per-chart error state with "Unable to load" message and retry button

#### Data Freshness
- Fresh query on page load and date range change — no auto-refresh, no polling
- Backend computes aggregates fresh each request — no caching (small clinic data, queries <200ms)
- Single aggregate endpoint returns all 7 chart datasets + 4 KPI values in one response

### Claude's Discretion
- Exact color palette for multi-series charts (anchored by #2DD4BF teal accent)
- Tooltip visual design (glass-style or minimal dark)
- Chart animation on load (subtle fade-in or none)
- Exact spacing, typography, and responsive breakpoints
- Whether Rx/Optical Metrics uses a combined chart or two small charts

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ANAL-V2-01 | Analytics dashboard with real KPI data (Recharts) | Recharts 2.x confirmed as the library; BarChart, LineChart, AreaChart, PieChart, ResponsiveContainer patterns documented below |
| ANAL-V2-02 | Revenue and utilization dashboards | Revenue Trend (line) and Appointment Utilization charts; Superbill.total_fee + Appointment model queries documented |
</phase_requirements>

---

## Summary

Phase 8 replaces the 6 placeholder chart cards in `app/(tenant)/[tenant]/analytics/page.tsx` with 7 live Recharts visualizations and wires 4 KPI stat cards to real data. No new DB migrations are needed — all required data is in existing tables (patients, encounters, appointments, diagnoses, superbills, refractions). The only new dependency is `recharts`, which is not yet installed.

The implementation has three work streams: (1) a new FastAPI analytics router with a single aggregate endpoint that computes all 7 datasets + 4 KPIs in one database round-trip, (2) a BFF route at `app/api/analytics/route.ts`, and (3) the frontend analytics page with a Zustand store, date picker, and 7 chart components.

**Primary recommendation:** Add `recharts@^2.12` (latest stable), build one aggregate FastAPI endpoint at `/api/analytics/` accepting `date_from`/`date_to`, and render all charts from a single `useAnalyticsStore` fetch triggered by the date range picker.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| recharts | ^2.12 | All 7 chart types (bar, line, area, pie, composed) | Confirmed in CONTEXT.md as the required library; React-native, responsive container built-in, actively maintained |
| zustand | ^4.5 (already installed) | Analytics data store | Project standard; billingDashboardStore is the template |
| FastAPI + SQLAlchemy | already installed | Aggregate queries | Project standard; async sessions, selectinload pattern established |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| shadcn Skeleton | already installed | Loading state per chart card | While analytics fetch is in-flight |
| lucide-react | already installed | Icons in KPI cards | Re-use existing icon set |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| recharts | victory-charts, chart.js | CONTEXT.md locks recharts; no reason to deviate |
| single aggregate endpoint | 7 parallel endpoints | Single endpoint reduces network overhead, simpler store state; decided in CONTEXT.md |

**Installation:**
```bash
npm install recharts@^2.12
```

---

## Architecture Patterns

### Recommended Project Structure

New files to create:

```
backend/api/routes/analytics.py          # New FastAPI router
backend/schemas/analytics.py             # Pydantic response schemas
app/api/analytics/route.ts               # BFF proxy
store/analyticsStore.ts                  # Zustand store
app/(tenant)/[tenant]/analytics/page.tsx # Replace existing placeholder page
```

No Alembic migration needed — reads from existing tables only.

### Pattern 1: Single Aggregate Endpoint

**What:** One FastAPI GET endpoint returns all chart data and KPI values in a single response.
**When to use:** Dashboards where multiple charts all share the same date filter.

```python
# Source: established pattern in billing_list.py + new aggregate design
@router.get("/", response_model=AnalyticsDashboardResponse)
async def get_analytics_dashboard(
    date_from: date = Query(...),
    date_to: date = Query(...),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    ...
```

The permission gate reuses `VIEW_BILLING` (already covers doctor, admin, owner) since analytics is a reporting function. Alternatively, add `VIEW_ANALYTICS` to `ClinicalAction` — recommended for clarity.

### Pattern 2: Zustand Store — Analytics

**What:** Mirrors `billingDashboardStore.ts`. Holds `data`, `loading`, `error`, `dateRange`.
**When to use:** Whenever a page fetches a single endpoint and passes sub-slices to child components.

```typescript
// Source: store/billingDashboardStore.ts pattern
interface AnalyticsState {
  data: AnalyticsDashboardData | null;
  loading: boolean;
  error: string | null;
  dateRange: "7d" | "30d" | "90d" | "6mo";
}
interface AnalyticsActions {
  fetch: (range: AnalyticsState["dateRange"]) => Promise<void>;
  setDateRange: (range: AnalyticsState["dateRange"]) => void;
}
```

`setDateRange` calls `fetch` immediately (matches `billingDashboardStore.setStatusFilter` pattern).

### Pattern 3: Recharts ResponsiveContainer

**What:** All charts wrap in `<ResponsiveContainer width="100%" height={height}>` to fill their glass-card container.
**When to use:** Every chart.

```typescript
// Source: Recharts official docs — ResponsiveContainer pattern
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

<ResponsiveContainer width="100%" height={280}>
  <BarChart data={encounterVolume} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
    <XAxis dataKey="date" tick={{ fill: "#505868", fontSize: 11 }} axisLine={false} tickLine={false} />
    <YAxis tick={{ fill: "#505868", fontSize: 11 }} axisLine={false} tickLine={false} />
    <Tooltip content={<CustomGlassTooltip />} />
    <Bar dataKey="count" fill="#2DD4BF" radius={[3, 3, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

### Pattern 4: KPI Trend Computation (backend)

**What:** Compare current period metric against previous equivalent period for green/red arrows.
**When to use:** All 4 KPI cards require this.

```python
# Example: encounters this period vs previous period
from datetime import timedelta

period_days = (date_to - date_from).days + 1
prev_date_to = date_from - timedelta(days=1)
prev_date_from = prev_date_to - timedelta(days=period_days - 1)

# Query current + previous period separately, compute pct_change
pct_change = ((current - previous) / previous * 100) if previous > 0 else None
```

### Pattern 5: BFF Route Registration

**What:** New analytics BFF at `app/api/analytics/route.ts` using `proxyToFastAPI`.
**When to use:** Every new FastAPI endpoint needs a corresponding BFF route.

```typescript
// Source: app/api/superbills/route.ts pattern
import { proxyToFastAPI } from "@/lib/bff";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  return proxyToFastAPI(request, "/api/analytics/");
}
```

Note the trailing slash on the FastAPI path — required per CLAUDE.md.

### Pattern 6: Date Range Picker (segmented control)

**What:** 4-button segmented control (7d | 30d | 90d | 6mo) that computes `date_from`/`date_to` relative to today.
**When to use:** No existing date picker component exists with this exact UI — build a simple `DateRangePicker` component using shadcn `Button` variants.

```typescript
const RANGES = {
  "7d":  7,
  "30d": 30,
  "90d": 90,
  "6mo": 180,
} as const;

function toDateParams(range: keyof typeof RANGES) {
  const days = RANGES[range];
  const dateTo = new Date();
  const dateFrom = new Date(Date.now() - days * 86400000);
  return {
    date_from: dateFrom.toISOString().slice(0, 10),
    date_to: dateTo.toISOString().slice(0, 10),
  };
}
```

### Anti-Patterns to Avoid

- **Fetching each chart separately:** The CONTEXT.md decision is a single endpoint — don't split into 7 calls.
- **Using `db.refresh()` after flush:** Project-wide rule — use `selectinload` instead (MissingGreenlet error).
- **Storing recharts in devDependencies:** It's a runtime UI library; put it in `dependencies`.
- **Hardcoding tenant IDs in queries:** All queries must include `.where(Model.tenant_id == ctx.tenant_id)`.
- **Using native PostgreSQL enums:** Project uses `native_enum=False` VARCHAR storage — no `CREATE TYPE` in migration.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Responsive chart sizing | Manual resize observer | `recharts ResponsiveContainer` | Built-in, handles all edge cases |
| Loading skeleton per chart | Custom shimmer CSS | `components/ui/skeleton.tsx` (already exists) | Project standard, consistent with other pages |
| Tooltip styling | Custom positioned tooltip | `recharts Tooltip content={<CustomTooltip />}` | recharts manages positioning; only override the render function |
| Date arithmetic | Moment.js or date-fns | Native JS Date + ISO string slice | No new deps needed; only simple +/- days operations |
| Permission check | Custom middleware | `require_permission(ClinicalAction.VIEW_BILLING)` | Existing RBAC matrix already covers doctor/admin/owner |

**Key insight:** Recharts handles all layout, SVG, animation, and resize logic internally. The only custom code needed is tooltip render functions and color constants.

---

## Common Pitfalls

### Pitfall 1: Recharts + SSR (Next.js App Router)
**What goes wrong:** `recharts` uses browser APIs (`window`, `ResizeObserver`) and throws during server-side rendering.
**Why it happens:** Next.js App Router server components cannot import browser-only libraries.
**How to avoid:** The analytics page already has `"use client"` at the top — this is correct. All chart components must be in client components or lazy-loaded with `dynamic(() => import(...), { ssr: false })` if extracted to separate files.
**Warning signs:** `ReferenceError: window is not defined` at build time.

### Pitfall 2: SQLAlchemy date_trunc in async context
**What goes wrong:** Using `func.date_trunc("day", Encounter.encounter_date)` with async SQLAlchemy may produce unexpected results if `encounter_date` is a `Date` column (not DateTime).
**Why it happens:** `encounter_date` in the ORM is `Date`, not `DateTime`. Grouping by date directly works without `date_trunc`.
**How to avoid:** Group by `Encounter.encounter_date` directly for the encounter volume time series. Use `func.date_trunc("day", Superbill.created_at)` for revenue (which is a DateTime column).
**Warning signs:** Query returns one row per encounter instead of one row per day.

### Pitfall 3: Empty data in Recharts
**What goes wrong:** If the analytics endpoint returns an empty array, Recharts renders an empty SVG with no visible chart structure (no axes labels, no "no data" message).
**Why it happens:** Recharts does not render axes when there are zero data points.
**How to avoid:** The CONTEXT.md decision is "show chart structure with zero/empty data." Implement by returning zero-filled time series from the backend (generate all date slots, fill with 0 if no data) OR handle on frontend by checking `data.length === 0` and rendering the axes with a "No data" overlay.
**Warning signs:** Users see a completely blank card with no visual cues.

### Pitfall 4: camelCase conversion for nested arrays
**What goes wrong:** `apiFetch` uses `camelizeKeys` which recursively converts keys. If the backend returns `[{icd10_code: "H52.13", count: 5}]`, the frontend receives `[{icd10Code: "H52.13", count: 5}]`.
**Why it happens:** `camelizeKeys` in `lib/api-client.ts` is applied to the full response recursively.
**How to avoid:** TypeScript types for the analytics response must use camelCase keys. The Pydantic schema uses snake_case; the TS types mirror the camelized version. Document this in the Pydantic schema and TS types together.
**Warning signs:** Chart `dataKey` prop references fail silently — chart renders with no bars/lines.

### Pitfall 5: Avg Wait Time computation
**What goes wrong:** "Average wait time" is not directly stored in the DB. It would require comparing appointment `start_time` against when the encounter actually started, which is not tracked.
**Why it happens:** The `Encounter` model has `encounter_date` but not a `started_at` timestamp. The `Appointment` model has `start_time` (scheduled) but no actual arrival timestamp beyond `arrived` status.
**How to avoid:** The KPI card for "Avg Wait Time" cannot be accurately computed from existing data. Two options: (a) compute as average `duration_minutes` of completed appointments as a proxy metric, or (b) show appointment slot duration as "Avg Exam Duration." The planner should decide — recommend option (b) with label "Avg Exam Duration."
**Warning signs:** Confusing metric that doesn't match clinical reality.

### Pitfall 6: FastAPI router import in main.py
**What goes wrong:** Adding a new router to `backend/api/routes/analytics.py` but forgetting to import and register it in `backend/main.py`.
**Why it happens:** `backend/main.py` has explicit imports — there is no auto-discovery.
**How to avoid:** The plan must include a step to add `from backend.api.routes import analytics` and `app.include_router(analytics.router, prefix="/api/analytics", tags=["Analytics"])` to `main.py`.
**Warning signs:** 404 on the analytics endpoint despite the file existing.

---

## Code Examples

Verified patterns from official sources and project codebase:

### Backend: Analytics Router Structure
```python
# backend/api/routes/analytics.py
from fastapi import APIRouter, Depends, Query
from datetime import date
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from backend.core.permissions import ClinicalAction, require_permission
from backend.core.security import TenantContext
from backend.db.session import get_db
from backend.db.models.tenant.clinical import (
    Encounter, Patient, Appointment, Diagnosis, Superbill, Refraction
)

router = APIRouter()

@router.get("/", response_model=AnalyticsDashboardResponse)
async def get_analytics_dashboard(
    date_from: date = Query(...),
    date_to: date = Query(...),
    ctx: TenantContext = Depends(require_permission(ClinicalAction.VIEW_BILLING)),
    db: AsyncSession = Depends(get_db),
):
    ...
```

### Backend: Encounter Volume Time Series Query
```python
# Group by day using Date column directly (no date_trunc needed for Date type)
from sqlalchemy import func, select, case

stmt = (
    select(
        Encounter.encounter_date.label("date"),
        func.count(Encounter.id).label("count"),
    )
    .where(
        Encounter.tenant_id == ctx.tenant_id,
        Encounter.is_deleted == False,
        Encounter.encounter_date >= date_from,
        Encounter.encounter_date <= date_to,
    )
    .group_by(Encounter.encounter_date)
    .order_by(Encounter.encounter_date)
)
```

### Backend: Revenue Trend Query (DateTime grouped by day)
```python
from sqlalchemy import cast, Date as SADate

stmt = (
    select(
        cast(Superbill.created_at, SADate).label("date"),
        func.sum(Superbill.total_fee).label("revenue"),
    )
    .where(
        Superbill.tenant_id == ctx.tenant_id,
        cast(Superbill.created_at, SADate) >= date_from,
        cast(Superbill.created_at, SADate) <= date_to,
    )
    .group_by(cast(Superbill.created_at, SADate))
    .order_by(cast(Superbill.created_at, SADate))
)
```

### Backend: Top Diagnoses Query
```python
stmt = (
    select(
        Diagnosis.icd10_code,
        Diagnosis.description,
        func.count(Diagnosis.id).label("count"),
    )
    .join(Encounter, Diagnosis.encounter_id == Encounter.id)
    .where(
        Diagnosis.tenant_id == ctx.tenant_id,
        Diagnosis.is_deleted == False,
        Encounter.encounter_date >= date_from,
        Encounter.encounter_date <= date_to,
    )
    .group_by(Diagnosis.icd10_code, Diagnosis.description)
    .order_by(func.count(Diagnosis.id).desc())
    .limit(10)
)
```

### Backend: Claims Pipeline (count by ClaimStatus)
```python
from sqlalchemy import cast, Date as SADate

stmt = (
    select(
        Superbill.claim_status,
        func.count(Superbill.id).label("count"),
    )
    .where(
        Superbill.tenant_id == ctx.tenant_id,
        cast(Superbill.created_at, SADate) >= date_from,
        cast(Superbill.created_at, SADate) <= date_to,
    )
    .group_by(Superbill.claim_status)
)
# Returns: [{claim_status: "draft", count: 12}, {claim_status: "submitted", count: 7}, ...]
```

### Backend: Appointment Utilization
```python
from backend.db.models.tenant.clinical import AppointmentStatus

stmt = (
    select(
        func.count(Appointment.id).label("total"),
        func.sum(
            case((Appointment.status == AppointmentStatus.COMPLETED.value, 1), else_=0)
        ).label("completed"),
        func.sum(
            case((Appointment.status == AppointmentStatus.NO_SHOW.value, 1), else_=0)
        ).label("no_show"),
        func.sum(
            case((Appointment.status == AppointmentStatus.CANCELLED.value, 1), else_=0)
        ).label("cancelled"),
    )
    .where(
        Appointment.tenant_id == ctx.tenant_id,
        cast(Appointment.start_time, SADate) >= date_from,
        cast(Appointment.start_time, SADate) <= date_to,
    )
)
```

### Backend: Patient Growth (cumulative new patients)
```python
# New patients created within the period (using TimestampMixin.created_at)
stmt = (
    select(
        cast(Patient.created_at, SADate).label("date"),
        func.count(Patient.id).label("new_patients"),
    )
    .where(
        Patient.tenant_id == ctx.tenant_id,
        Patient.is_deleted == False,
        cast(Patient.created_at, SADate) >= date_from,
        cast(Patient.created_at, SADate) <= date_to,
    )
    .group_by(cast(Patient.created_at, SADate))
    .order_by(cast(Patient.created_at, SADate))
)
```

### Backend: Rx/Optical Metrics
```python
# Count refractions by modality (glasses vs contact_lens) and finalization status
stmt = (
    select(
        Refraction.rx_modality,
        func.count(Refraction.id).label("count"),
    )
    .join(Encounter, Refraction.encounter_id == Encounter.id)
    .where(
        Refraction.tenant_id == ctx.tenant_id,
        Refraction.is_final_rx == True,
        Encounter.encounter_date >= date_from,
        Encounter.encounter_date <= date_to,
        Encounter.is_deleted == False,
    )
    .group_by(Refraction.rx_modality)
)
```

### Frontend: Recharts Custom Glass Tooltip
```typescript
// Source: Recharts docs — custom Tooltip content prop
interface TooltipPayload {
  name: string;
  value: number | string;
  color: string;
}
interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function GlassTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card px-3 py-2 text-sm">
      {label && <p className="text-[var(--text-muted)] text-xs mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-mono font-medium">{p.value}</span>
        </p>
      ))}
    </div>
  );
}
```

### Frontend: Date Range Segmented Control
```typescript
// Uses shadcn Button group; no new component library needed
const RANGES = ["7d", "30d", "90d", "6mo"] as const;
type DateRange = typeof RANGES[number];

function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  return (
    <div className="flex gap-1 bg-[var(--glass-bg)] border border-[var(--border-default)] rounded-lg p-1">
      {RANGES.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={cn(
            "px-3 py-1 rounded-md text-sm transition-colors",
            value === r
              ? "bg-[var(--accent)] text-black font-medium"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          )}
        >
          {r}
        </button>
      ))}
    </div>
  );
}
```

### Frontend: Color Palette for Multi-Series Charts

Recommended palette anchored to project teal accent, distinct on dark backgrounds:

```typescript
export const CHART_COLORS = {
  teal:    "#2DD4BF",  // accent — primary series
  violet:  "#818CF8",  // secondary series
  amber:   "#FBBF24",  // tertiary / warning
  rose:    "#FB7185",  // negative / cancelled
  sky:     "#38BDF8",  // quaternary
  muted:   "#505868",  // grid lines, axis labels
} as const;
```

---

## Data Availability Analysis

Critical check: which charts can be computed from existing DB tables.

| Chart | Source Tables | Available Columns | Feasible |
|-------|--------------|-------------------|---------|
| Encounter Volume (bar) | `encounters` | `encounter_date`, `tenant_id`, `is_deleted` | YES |
| Revenue Trend (line) | `superbills` | `total_fee`, `created_at`, `tenant_id` | YES |
| Top Diagnoses (horiz bar) | `diagnoses`, `encounters` | `icd10_code`, `description`, `encounter_date` | YES |
| Claims Pipeline (donut) | `superbills` | `claim_status` | YES |
| Appointment Utilization | `appointments` | `status`, `start_time`, `duration_minutes` | YES |
| Patient Growth (area) | `patients` | `created_at`, `is_deleted` | YES (new patients per period) |
| Rx/Optical Metrics | `refractions`, `encounters` | `rx_modality`, `is_final_rx`, `encounter_date` | YES |
| KPI: Total Patients | `patients` | `tenant_id`, `is_deleted` | YES (COUNT all time) |
| KPI: Exams This Period | `encounters` | `encounter_date` | YES |
| KPI: Avg Wait Time | `appointments` | NO `actual_start_time` column | **PARTIAL — proxy only** |
| KPI: Revenue | `superbills` | `total_fee`, `created_at` | YES |

**Avg Wait Time limitation:** The `Appointment` model has `start_time` (scheduled) and `duration_minutes` but no actual-arrival or actual-start timestamp. Recommend replacing "Avg Wait Time" KPI with "Avg Exam Duration" (= AVG(duration_minutes) for completed appointments in the period) or "Scheduled Slots" (total appointment count). The CONTEXT.md specifies "Avg Wait Time" as a KPI label — the planner should flag this to the user or choose the proxy metric.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Manual SVG charts | Recharts `<BarChart>`, `<LineChart>`, etc. | Zero SVG math; declarative composition |
| Multiple endpoint calls per dashboard | Single aggregate endpoint | One network round-trip; simpler loading state |
| chart.js (imperative, canvas) | Recharts (declarative, SVG) | Better React integration; easier custom tooltips; accessible |

**Deprecated/outdated:**
- chart.js with react-chartjs-2: canvas-based, harder to style for glassmorphism (SVG transparency is trivial with Recharts)
- Polling / auto-refresh: explicitly decided against in CONTEXT.md

---

## Open Questions

1. **Avg Wait Time KPI**
   - What we know: No `actual_start_time` or `checked_in_at` timestamp exists in the Appointment or Encounter models
   - What's unclear: Whether to relabel the KPI or use `duration_minutes` AVG as a proxy
   - Recommendation: Planner should substitute "Avg Exam Duration" (AVG duration_minutes for completed appointments) with a note in the UI tooltip clarifying it's the scheduled slot length

2. **Analytics Permission: VIEW_BILLING vs new VIEW_ANALYTICS**
   - What we know: `VIEW_BILLING` covers doctor, admin, owner — same roles that should see analytics
   - What's unclear: Whether a separate `ClinicalAction.VIEW_ANALYTICS` is worth adding for semantic clarity
   - Recommendation: Add `VIEW_ANALYTICS` to ClinicalAction and PERMISSION_MATRIX (same role set as VIEW_BILLING) for clarity and auditability

3. **Rx/Optical Metrics chart type**
   - What we know: Claude's discretion for whether to use one combined chart or two small charts
   - What's unclear: Final data shape — glasses count vs contact lens count per day, or just totals
   - Recommendation: Use a simple grouped bar chart (two bars per day: glasses / contacts) with the Recharts `<ComposedChart>` or a two-mini-stat display with totals only; the data is sparse (only encounters with final Rx qualify)

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.x + @testing-library/react |
| Config file | `vitest.config.ts` or `vite.config.ts` (check project root) |
| Quick run command | `npm run test` |
| Full suite command | `npm run test` |
| E2E framework | Playwright (existing `tests/e2e/` suite) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ANAL-V2-01 | Analytics page renders 7 charts (no placeholders) | E2E smoke | `bash scripts/dev.sh verify tests/e2e/smoke-analytics.spec.js` | Wave 0 |
| ANAL-V2-01 | Date range picker changes data displayed | E2E smoke | same file | Wave 0 |
| ANAL-V2-01 | ADVANCED_ANALYTICS entitlement gate shows upsell for non-premium users | E2E smoke | same file | Wave 0 |
| ANAL-V2-02 | Revenue KPI card shows non-zero value when superbills exist | E2E smoke | same file | Wave 0 |
| ANAL-V2-02 | Claims Pipeline donut shows claim statuses | E2E smoke | same file | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx tsc --noEmit` (type-check)
- **Per wave merge:** `npm run test`
- **Phase gate:** Full Playwright E2E suite (`bash scripts/dev.sh verify tests/e2e/smoke-analytics.spec.js`) green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/e2e/smoke-analytics.spec.js` — covers ANAL-V2-01, ANAL-V2-02 (new file; existing smoke tests are the model)
- [ ] `backend/schemas/analytics.py` — Pydantic response types for the aggregate endpoint
- [ ] `store/analyticsStore.ts` — Zustand store (follows billingDashboardStore template)

---

## Sources

### Primary (HIGH confidence)
- Project codebase: `backend/db/models/tenant/clinical.py` — all ORM models and column names verified directly
- Project codebase: `store/billingDashboardStore.ts` — Zustand store template confirmed
- Project codebase: `backend/api/routes/billing_list.py` — date filter pattern (`date_from`/`date_to` as Query params)
- Project codebase: `backend/main.py` — router registration pattern confirmed
- Project codebase: `lib/bff.ts` — proxyToFastAPI signature and trailing slash requirement
- Project codebase: `app/(tenant)/[tenant]/analytics/page.tsx` — existing placeholder confirmed (4 charts, `"use client"`, entitlement gate)
- Project codebase: `package.json` — recharts NOT yet installed (confirmed absent from both dependencies and devDependencies)
- Project codebase: `backend/core/permissions.py` — ClinicalAction enum and PERMISSION_MATRIX

### Secondary (MEDIUM confidence)
- Recharts official docs (https://recharts.org/en-US) — ResponsiveContainer, BarChart, LineChart, AreaChart, PieChart, ComposedChart, custom Tooltip API
- CONTEXT.md decisions — locked design choices verified

### Tertiary (LOW confidence)
- Recharts version 2.12 as latest stable — based on training data; run `npm show recharts version` to confirm before install

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — recharts confirmed in CONTEXT.md; all other libraries already installed and in use
- Architecture: HIGH — single aggregate endpoint pattern directly derived from existing billing_list.py; all ORM columns verified in clinical.py
- Data availability: HIGH — all 7 chart data sources confirmed against live ORM models; one caveat on Avg Wait Time documented
- Pitfalls: HIGH — SSR issue is a well-known recharts gotcha; others derived from reading actual project code
- Query patterns: HIGH — SQLAlchemy async patterns verified against existing routes (optical.py, billing_list.py)

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (stable stack; recharts API changes slowly)
