# Phase 2: API Integration & HIPAA Compliance - Context

**Gathered:** 2026-03-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace all mock data imports with real FastAPI API calls across 6 clinical Zustand stores and 8 pages/components. Add PHI access logging on all GET endpoints that return patient/encounter data. Wire the audit trail sidebar to real audit log API. After this phase, the application runs entirely on real data — no mock imports remain in production code.

Note: HIPAA-03 (30-minute session timeout) was already completed in Phase 1.

</domain>

<decisions>
## Implementation Decisions

### Save Failure UX
- Auto-retry silently: 3 retries with exponential backoff on save failure. Only surface error if all retries fail
- Error display after retry exhaustion: subtle status indicator on the section header (e.g., red dot or warning icon) that expands on hover/click — non-intrusive to clinical workflow
- Per-section save status indicators: each section (Vitals, Refraction, Findings, Diagnoses, Problems) shows its own status: dirty → saving → saved → error
- When API is completely unreachable: show read-only from last loaded data, disable save indicators, toast "Working offline — changes will sync when connection restores." Clinician can review but new edits queue locally

### Data Loading Experience
- Skeleton screens matching glassmorphism aesthetic: glass-card shaped shimmer placeholders for each section while data loads (~200-500ms)
- All sections load in parallel: fire all fetches simultaneously (vitals, refraction, findings, diagnoses, problems, encounter metadata). Each section renders independently as its data arrives
- Section load failure: auto-retry 2 times, then show "Could not load [section] — tap to retry" inside the section card. Other sections remain usable
- Patient sticky header loads from API: fetch patient demographics from /api/patients/{patientId} to ensure current data (allergies may have changed)

### PHI Access Logging
- Encounter-level read logging: one "phi_viewed" audit entry per encounter open (who, when, which patient, which encounter). Standard for optometry EHR HIPAA compliance
- Mixed timeline in audit sidebar: PHI read entries ("Dr. Smith viewed this encounter") appear alongside write actions chronologically. Read entries styled subtly (gray icon) vs. write entries (blue icon)
- Backend middleware logging: FastAPI middleware automatically logs every GET to patient/encounter endpoints. No frontend changes needed. Catches all API access sources
- Patient-indexed audit entries: audit log entries include patient_id for breach notification queries ("show all access to Patient X in last 90 days")

### Mock Data Retention
- Delete all mock data files entirely after migration (~1,565 lines across 6 files + lib/mock/ directory). Clean break — prevents accidental mock imports in production
- No mock fallback for local dev: developer must run FastAPI locally. Error states show naturally. Forces realistic testing
- Encounter page triggers fetches: page calls each store's fetch/load action on mount. Stores handle their own API calls internally. Page just reads state. Clean separation of concerns

### Case Convention
- API client layer handles camelCase↔snake_case conversion: apiFetch() converts outgoing payloads to snake_case and incoming responses to camelCase. All stores use camelCase internally. Single conversion point

### Claude's Discretion
- Skeleton screen shimmer animation design
- Exact retry timing (exponential backoff intervals)
- Save status indicator visual design (icons, colors, positioning)
- API client conversion utility implementation (lodash/snakeCase or custom)
- BFF route handler patterns for new endpoints needed
- Order of store migration (which store first)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/api-client.ts`: apiFetch() wrapper with Supabase auth token — needs camelCase/snake_case conversion added
- `lib/supabase/server.ts`: Server-side Supabase client factory (from Phase 1) — used by BFF routes
- `lib/supabase/client.ts`: Browser-side Supabase client (from Phase 1) — used for auth token in apiFetch
- `components/encounter/AuditTrailSidebar.tsx`: Existing audit sidebar with ClinicalDiffViewer, action type icons, revert support — needs PHI read entries added
- All 6 clinical stores already have apiFetch() calls with 400ms mock delay fallbacks — migration = remove fallbacks + add retry logic + add fetch actions

### Established Patterns
- Draft/committed dual-state in vitals, refraction, exam findings stores — 1.5s debounce + flush on blur
- Immediate save (no debounce) in diagnosis and problem list stores — each CRUD action hits API directly
- External timer registry pattern for debounced saves (keyed by section/column)
- `persist` middleware on some stores (encounterStore) — be careful with SSR hydration
- `subscribeWithSelector(devtools(...))` composition order established in Phase 1

### Integration Points
- `app/(tenant)/[tenantId]/encounter/[encounterId]/page.tsx`: Currently calls `getInitialStoreState()` from mock personas — must become store.fetch() calls
- `lib/mock/personas.ts` (788 lines): Deepest mock module — seeds all 6 stores. Primary removal target
- `app/api/audit-logs/route.ts`: BFF proxy already exists (Phase 1) — may need PHI read log integration
- `backend/api/routes/audit.py`: Backend audit route exists — needs PHI read logging middleware
- 8 files import from mock modules (6 pages + PatientChartModal + personas.ts)

### Schema Risks
- Refraction store sends camelCase (refractionType, isFinalRx) but backend expects snake_case — conversion layer needed
- encounterStore has no save mechanism yet — needs API endpoints for encounter metadata (chief complaint, status)

</code_context>

<specifics>
## Specific Ideas

- Save status indicators should be subtle enough that clinicians don't watch them instead of charting — think "ambient awareness" not "progress bar"
- Skeleton screens should use the glass-card styling with shimmer animation to feel like the section is "warming up"
- PHI read entries in audit sidebar should be clearly visually distinct from write actions — gray vs blue icons, lighter text
- The camelCase/snake_case conversion should be transparent to stores — stores never deal with snake_case

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-api-integration-hipaa-compliance*
*Context gathered: 2026-03-05*
