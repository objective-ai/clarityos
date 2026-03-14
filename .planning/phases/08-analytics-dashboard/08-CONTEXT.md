# Phase 8: Analytics Dashboard - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the 6 placeholder analytics charts with 7 real data visualizations covering clinical and financial metrics. Wire the existing 4 KPI stat cards to live data with trend comparisons. Add a global date range filter. Page remains gated behind ADVANCED_ANALYTICS entitlement.

</domain>

<decisions>
## Implementation Decisions

### Chart Styling
- Charts render with transparent background directly on glass-card surface (no inset)
- Subtle horizontal grid lines (rgba(255,255,255,0.05)), axis labels in --text-muted (#505868)
- No grid lines on donut chart (Claims Pipeline)
- Glass-style tooltips on hover with exact values

### Color Palette
- Claude's discretion: pick a palette that works with glassmorphism dark mode and teal accent (#2DD4BF)
- Must be distinct enough to differentiate multiple data series

### Layout
- 4 KPI stat cards in a row at top (Total Patients, Exams, Avg Wait, Revenue) — wired to real data with trend indicators
- KPI trends compare current period to previous equivalent period (e.g., 30d vs prior 30d) — green/red arrows with percentage
- Below KPIs: 2-column grid with mixed card sizes
- Full-width charts: Encounter Volume (bar), Revenue Trend (line), Patient Growth (area)
- Half-width charts: Top Diagnoses (horizontal bar), Claims Pipeline (donut), Appointment Utilization (multi-metric), Rx/Optical Metrics (mixed)
- Global date range picker (segmented control: 7d | 30d | 90d | 6mo) positioned top-right next to page title
- All charts respond to the same date range filter
- Responsive: collapses to single column on mobile

### Loading & Empty States
- Skeleton placeholder per chart card while data loads (uses existing Skeleton component)
- New clinics with zero data: show chart structure (axes, labels) with zero/empty data + subtle banner: "Analytics will populate as you create encounters and appointments"
- Partial data: show what exists, no zero-padding. If 30d selected but only 14 days exist, subtitle shows "Showing 14 of 30 days"
- Per-chart error state with "Unable to load" message and retry button

### Data Freshness
- Fresh query on page load and date range change — no auto-refresh, no polling
- Backend computes aggregates fresh each request — no caching (small clinic data, queries <200ms)
- Single aggregate endpoint returns all 7 chart datasets + 4 KPI values in one response

### Claude's Discretion
- Exact color palette for multi-series charts (anchored by #2DD4BF teal accent)
- Tooltip visual design (glass-style or minimal dark)
- Chart animation on load (subtle fade-in or none)
- Exact spacing, typography, and responsive breakpoints
- Whether Rx/Optical Metrics uses a combined chart or two small charts

</decisions>

<specifics>
## Specific Ideas

- Glassmorphism design must feel consistent with existing dashboard and billing pages
- StatCard component already supports trend display with accent variants — reuse it for KPIs
- The existing analytics page has both KPI cards and chart placeholders — extend, don't rebuild

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/ui/card.tsx` — Base Card with glass-card class for chart containers
- `components/ui/stat-card.tsx` — StatCard with icon, label, value, trend, accent variants for KPI row
- `components/ui/skeleton.tsx` — Loading placeholder for chart skeletons
- `store/billingDashboardStore.ts` — Template for analytics Zustand store (async fetch pattern)
- `lib/api-client.ts` — apiFetch with camelCase conversion and retry logic
- `lib/bff.ts` — proxyToFastAPI for BFF route
- `hooks/useEntitlements.ts` — ADVANCED_ANALYTICS gate already wired

### Established Patterns
- BFF proxy: `app/api/<resource>/route.ts` → `proxyToFastAPI(request, '/api/<resource>/')`
- Zustand stores: create with devtools, async fetch with loading/error state
- Date filtering: Query params `date_from`/`date_to` on backend (see billing_list.py)
- Page setup: "use client", usePageHeaderStore for subtitle, entitlement gate check
- SQLAlchemy: After db.flush(), use selectinload (never db.refresh — MissingGreenlet)

### Integration Points
- `app/(tenant)/[tenant]/analytics/page.tsx` — Replace placeholder content
- `backend/api/main.py` — Register new analytics router
- `backend/db/models/tenant/clinical.py` — Query from: appointments, encounters, diagnoses, superbills, patients, optical_queue_items
- No charting library installed yet — must add recharts to package.json

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-analytics-dashboard*
*Context gathered: 2026-03-11*
