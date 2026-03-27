# Phase 10: Encounter Workflow Redesign - Research

**Researched:** 2026-03-27
**Domain:** React/Next.js UI restructuring — encounter page mode split, role-gated visibility, sticky FAB, form accordion, DB migration
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Pre-test mode layout**
- Single long form with accordion sections (all expanded by default, collapsible to reduce clutter)
- Categories: "Visual Acuity", "Pupil & Motility", "Instrument Readings" as collapsible groups within VitalsForm
- Bottom tab bar is completely hidden in pre-test mode — single scrollable view with CC/HPI at top, vitals/preliminary fields below
- "Ready for Doctor" button at bottom of the pre-test form (not in EncounterBottomTabs)
- New preliminary fields: confrontation, motility, color vision, NPC, pupils (mm), autorefractor, keratometer, entrance Rx

**"All Normal" quick-fill**
- Global "All Normal" button at top of the pre-test form — fills ALL preliminary fields with default normal values
- Per-section "Normal" buttons within each accordion section
- Default normal values: PERRL true, no RAPD, confrontation "Full", motility "Full", color vision "Normal", NPC "Normal", cover test "Ortho"

**Doctor exam mode layout**
- Pre-test data accessed via bottom tab bar (Complaint and Vitals tabs scroll to those sections) — NO collapsed summary card
- Section order: Rx → Exam → Dx → Plan → AI Scribe (at bottom)
- All 6 bottom tabs visible in doctor mode: Complaint, Vitals, Rx, Exam, Dx, Plan — scroll-spy highlights current section
- Doctor can edit pre-test values with audit trail — edits logged in existing AuditTrailSidebar

**AI Scribe positioning**
- Full AiScribeWidget relocated to bottom of page (after Plan section) in doctor exam mode
- Not visible in pre-test mode (technicians don't see it)
- Same functionality — just repositioned

**Sticky floating mic button**
- Position: fixed, bottom-right, 80px above bottom tab bar (i.e., bottom: ~128px)
- Only visible in doctor exam mode (status `in_exam` + role `doctor` or `owner`)
- Three states: idle, recording (pulse animation), paused
- Tap toggles recording/paused; separate "Done/Stop" action submits for AI processing
- Not visible to technicians or in pre-test mode

**Role transitions & permissions**
- Status flow uses existing `pre_test → in_exam → finalized` from encounterStore
- Revert-to-pretest already exists in EncounterBottomTabs — keep current behavior

### Claude's Discretion
- Exact accordion animation/transition style
- Mic button pulse animation design
- Pause/resume icon choices
- How "Done" stop action is presented (button in expanded mic area, or icon on the FAB itself)
- Exact positioning offsets for mobile vs desktop
- How doctor override edits are visually indicated in the vitals form

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope
</user_constraints>

---

## Summary

Phase 10 restructures the existing encounter page into two distinct modes — pre-test (technician) and doctor exam — driven by `encounterStore.status` (`pre_test | in_exam | finalized`) and user role. No new dependencies are added. The work involves: (1) conditional rendering of layout variants in `page.tsx`, (2) extending `VitalsForm` with accordion sections and new preliminary fields, (3) a DB migration adding 8 new columns to `vitals_and_pretest`, (4) relocating `AiScribeWidget` to the bottom of the doctor view, and (5) adding a new `StickyMicButton` FAB component.

The key architectural insight is that the page already has all the raw ingredients — `encounterStore.status`, `PermissionGate`, `useEntitlements`, `advanceStatus()`, and a working scroll-spy tab bar. Phase 10 reorganizes how these are exposed per mode rather than building new capabilities. The only genuinely new pieces are the preliminary form fields (requiring a full backend migration + schema + store + UI change chain) and the sticky mic FAB.

**Primary recommendation:** Implement in 4 waves — (1) backend DB+schema+API expansion, (2) VitalsForm accordion + new fields + All Normal, (3) page mode split + AI Scribe relocation + tab visibility, (4) sticky mic FAB.

---

## Standard Stack

### Core (already in project — no new deps)
| Library | Version | Purpose | How Used in Phase 10 |
|---------|---------|---------|----------------------|
| Next.js App Router | 14 | Page rendering | Encounter page conditional layout |
| React | 18 | Component tree | Mode-split rendering, FAB |
| Zustand | 4.5 | State management | encounterStore.status drives mode; vitalsStore new fields |
| shadcn/ui | current | UI primitives | Accordion, Card, Badge |
| Tailwind 3.4 | 3.4 | Styling | FAB positioning, animation classes |
| lucide-react | current | Icons | Mic, Pause, Stop icons for FAB |
| SQLAlchemy (async) | 2.x | ORM | New columns on VitalsAndPretest |
| Alembic | current | Migrations | New vitals columns migration |
| Pydantic v2 | 2.x | API schemas | New fields on VitalsCreate/VitalsResponse |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| shadcn/ui Accordion (Radix) | Hand-rolled collapsible div | shadcn already in project — use it |
| CSS `position: fixed` FAB | Portal/overlay lib | Native CSS sufficient, no lib needed |
| New mic hook | Reuse `useAiScribe` | `useAiScribe.generate()` already handles recording→SSE; FAB calls same hook |

**No new npm install required.**

---

## Architecture Patterns

### Current Page Structure (what exists)

```
page.tsx
├── PrepMeCard (doctor/owner only, pre-finalized)
├── section-complaint: EncounterWorkflowHeader (CC/HPI textarea)
│   └── Audit Trail toggle (admin/owner only)
├── Finalized banner (conditional)
├── section-plan: AiScribeWidget (doctor/owner only) ← CURRENT POSITION (wrong)
├── section-vitals: VitalsForm | VitalsCard
├── section-rx: RefractionGrid
├── ContinuitySidebar
├── section-exam: ExamFindings (anterior + posterior)
├── section-dx: DiagnosisPicker
├── section-plan: Plan textarea (assessment_and_plan)
├── AddendumSection
└── EncounterBottomTabs (fixed bottom bar, all 6 tabs always visible)
```

### Target Structure: Pre-Test Mode (status === "pre_test")

```
page.tsx (pre_test branch)
├── section-complaint: EncounterWorkflowHeader (CC/HPI)
└── PreTestForm (new wrapper component or enhanced VitalsForm)
    ├── "All Normal" global button
    ├── Accordion: "Visual Acuity" (expanded by default)
    │   ├── UCVA OD/OS, BCVA OD/OS, Near VA OD/OS
    │   └── "Normal" section button
    ├── Accordion: "Pupil & Motility" (expanded by default)
    │   ├── PERRL bool, RAPD bool, pupils_mm OD/OS
    │   ├── Confrontation (text), Motility (text), Cover test (text), NPC (text)
    │   └── "Normal" section button
    ├── Accordion: "Instrument Readings" (expanded by default)
    │   ├── IOP OD/OS + method, Autorefractor OD/OS, Keratometer OD/OS
    │   ├── Entrance Rx (text/grid), Color Vision (text)
    │   └── "Normal" section button
    ├── Accordion: "Systemic" (existing BP/pulse)
    └── "Ready for Doctor" button (calls advanceStatus)
    [EncounterBottomTabs: HIDDEN in pre-test mode]
```

### Target Structure: Doctor Exam Mode (status === "in_exam" | "finalized")

```
page.tsx (in_exam/finalized branch)
├── PrepMeCard (doctor/owner, pre-finalized)
├── section-complaint: EncounterWorkflowHeader
├── section-vitals: VitalsForm (full) | VitalsCard (read-only)
├── section-rx: RefractionGrid
├── ContinuitySidebar
├── section-exam: ExamFindings (anterior + posterior)
├── section-dx: DiagnosisPicker
├── section-plan: Plan textarea
├── AddendumSection
├── AiScribeWidget (doctor/owner only, non-finalized) ← MOVED HERE
├── EncounterBottomTabs (all 6 tabs, scroll-spy active)
└── StickyMicButton (doctor/owner only, in_exam only, position: fixed)
```

### Pattern 1: Mode-Split Rendering in page.tsx

**What:** Single page component with conditional branch on `encounterStatus`.
**When to use:** Status-driven layout changes — pre-test vs doctor mode.

```typescript
// Source: existing page.tsx pattern (status from encounterStore)
const encounterStatus = useEncounterStore((s) => s.encounters[params.encounterId]?.status);
const isPreTest = encounterStatus === "pre_test";

return (
  <div className="flex flex-col gap-6 stagger">
    <div id="section-complaint">
      <EncounterWorkflowHeader ... />
    </div>

    {isPreTest ? (
      <PreTestView encounterId={params.encounterId} />
    ) : (
      <DoctorExamView encounterId={params.encounterId} ... />
    )}

    {/* EncounterBottomTabs: only in doctor mode */}
    {!isPreTest && (
      <EncounterBottomTabs ... />
    )}
  </div>
);
```

### Pattern 2: VitalsForm Accordion Sections

**What:** Use shadcn/ui `Accordion` (Radix-based) to group preliminary fields. Each section has a "Normal" button.
**When to use:** Pre-test technician view — all sections expanded by default, collapsible.

```typescript
// Source: shadcn/ui Accordion docs (already in project via @radix-ui/react-accordion)
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

// defaultValue={["va", "pupil", "instruments"]} expands all sections on mount
<Accordion type="multiple" defaultValue={["va", "pupil", "instruments", "systemic"]}>
  <AccordionItem value="va">
    <AccordionTrigger>
      <span>Visual Acuity</span>
      <button onClick={fillNormalVA}>Normal</button>  {/* stops propagation */}
    </AccordionTrigger>
    <AccordionContent>
      {/* VA fields */}
    </AccordionContent>
  </AccordionItem>
</Accordion>
```

**Critical:** The "Normal" per-section button must call `e.stopPropagation()` to prevent accordion toggle.

### Pattern 3: All Normal Quick-Fill

**What:** Button at top of pre-test form that calls `setField()` for every preliminary field with its default normal value.
**Implementation:** Pure client-side — no API call. The store's debounce will batch-save the filled values.

```typescript
// Default normal values (from CONTEXT.md decisions)
const ALL_NORMAL_DEFAULTS: Partial<VitalsDraft> = {
  pupils_equal_round_reactive: true,
  relative_afferent_pupillary_defect: false,
  confrontation: "Full",
  motility: "Full",
  color_vision: "Normal",
  npc: "Normal",
  cover_test_notes: "Ortho",
};

function handleAllNormal(encounterId: string) {
  Object.entries(ALL_NORMAL_DEFAULTS).forEach(([field, value]) => {
    setField(encounterId, field as keyof VitalsDraft, value);
  });
  // Trigger immediate save (don't wait 1.5s)
  flushSave(encounterId);
}
```

### Pattern 4: Sticky Mic FAB

**What:** `position: fixed` button, bottom-right, 80px above the 48px tab bar = `bottom: 128px`.
**Three states:** idle / recording / paused — driven by local component state.
**Integration:** FAB calls into the existing `useAiScribe` hook's recording flow. The `generate()` method accepts a transcript string; the FAB manages the Web Speech API or MediaRecorder separately (or reuses the existing recording logic in `AiScribeWidget`).

```typescript
// StickyMicButton.tsx — new component
"use client";
import { useState } from "react";
import { Mic, Pause, Square } from "lucide-react";

type MicState = "idle" | "recording" | "paused";

export function StickyMicButton({ onDone }: { onDone: (transcript: string) => void }) {
  const [micState, setMicState] = useState<MicState>("idle");

  return (
    <div
      className="fixed z-40"
      style={{ bottom: 128, right: 24 }}  // 80px above 48px tab bar
    >
      {/* Main FAB */}
      <button
        onClick={handleTap}
        className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all
          ${micState === "recording" ? "animate-pulse bg-[var(--state-critical)]" : "bg-[var(--accent)]"}
        `}
      >
        {micState === "paused" ? <Pause size={24} /> : <Mic size={24} />}
      </button>
      {/* Stop/Done — shown when active */}
      {micState !== "idle" && (
        <button onClick={handleDone} className="...">
          <Square size={16} /> Done
        </button>
      )}
    </div>
  );
}
```

**Visibility gate:**
```typescript
// In page.tsx — only show FAB during active doctor exam
{encounterStatus === "in_exam" && (
  <PermissionGate roles={["doctor", "owner"]}>
    <StickyMicButton onDone={handleMicDone} />
  </PermissionGate>
)}
```

### Pattern 5: New Vitals Fields — Full Change Chain

**What:** 8 new preliminary fields require changes at 5 layers (DB → Pydantic → backend route → TS types → vitalsStore → VitalsForm).

**New fields required:**

| Field | DB Type | Pydantic | TS Type | Normal Default |
|-------|---------|----------|---------|----------------|
| `confrontation` | `String(100)` | `str \| None` | `string \| null` | `"Full"` |
| `motility` | `String(100)` | `str \| None` | `string \| null` | `"Full"` |
| `color_vision` | `String(100)` | `str \| None` | `string \| null` | `"Normal"` |
| `npc` | `String(100)` | `str \| None` | `string \| null` | `"Normal"` |
| `pupils_od_mm` | `Numeric(4,1)` | `Decimal \| None` | `number \| null` | `null` |
| `pupils_os_mm` | `Numeric(4,1)` | `Decimal \| None` | `number \| null` | `null` |
| `autorefractor` | `Text` | `str \| None` | `string \| null` | `null` |
| `keratometer` | `Text` | `str \| None` | `string \| null` | `null` |
| `entrance_rx` | `Text` | `str \| None` | `string \| null` | `null` |

**Note:** `entrance_rx` is entered as free text (e.g. "OD: -2.00 -0.75x180 OS: -1.50 -0.50x175") — not a structured refraction grid. The RefractionGrid is for measured/final Rx.

**Alembic migration pattern** (matches existing project style):
```python
# migrations/versions/XXXX_add_preliminary_fields_to_vitals.py
def upgrade() -> None:
    op.add_column("vitals_and_pretest", sa.Column("confrontation", sa.String(100), nullable=True), schema=schema)
    op.add_column("vitals_and_pretest", sa.Column("motility", sa.String(100), nullable=True), schema=schema)
    # ... etc for all 9 new columns
```

**CRITICAL:** Alembic must be run from `backend/` with `PYTHONPATH=c:/Users/duytr/Projects/clarityos`. See project MEMORY.md.

**vitalsStore setField** already uses `keyof VitalsDraft` — adding new fields to `VitalsDraft` interface automatically enables them in the store.

### Anti-Patterns to Avoid

- **Splitting VitalsForm into a separate component file for pre-test only:** The same `VitalsForm` component handles both modes — use props or context to switch between accordion layout and compact layout. Keep one component, not two.
- **Hiding EncounterBottomTabs via CSS `visibility: hidden`:** Remove it from the DOM entirely in pre-test (`{!isPreTest && <EncounterBottomTabs />}`). Scroll-spy observers will error if sections don't exist.
- **Calling `flushSave` in the "Ready for Doctor" handler before `advanceStatus`:** The flush is fire-and-forget async; `advanceStatus` should be called after the save settles or run in parallel (status advance is separate from vitals save — status is in `encounterStore`, vitals in `vitalsStore`).
- **Using `db.refresh()` after `db.flush()` for new columns:** Existing project rule says use `selectinload` after flush — but `vitals.py` already calls `db.refresh(vitals)` (acceptable for a flat model without relationships to load). Keep this pattern consistent.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Collapsible sections | Custom toggle divs | shadcn `Accordion` (Radix) | Already in project, accessible, animated |
| Role gating | Manual `if (role === "doctor")` | `PermissionGate` | Centralized, already handles owner+clinicalRole |
| Debounced vitals save | `setTimeout` in component | `vitalsStore.setField()` + `scheduleSave()` | Already built with 1.5s debounce + flush on blur |
| Recording state machine | New recorder hook | Reuse `useAiScribe` recording logic | `generate(transcript)` already wired to SSE endpoint |
| DB upsert logic | Custom INSERT/UPDATE | Existing `PUT /encounters/{id}/vitals` idempotent pattern | Already handles upsert with `VitalsCreate` payload |

---

## Common Pitfalls

### Pitfall 1: EncounterBottomTabs Scroll-Spy Breaks in Pre-Test Mode
**What goes wrong:** IntersectionObserver in `EncounterBottomTabs` observes `section-rx`, `section-exam`, `section-dx`, `section-plan` by ID. In pre-test mode these sections don't render, causing silent observer failures or stale tab highlighting.
**Why it happens:** The observer runs in `useEffect` on mount and tries `document.getElementById(t.sectionId)` — returns null for missing sections.
**How to avoid:** Remove `EncounterBottomTabs` from the DOM entirely in pre-test mode. The component already filters null sections (`sections.filter(Boolean)`), so it gracefully handles missing sections — but hiding the tab bar is the correct UX behavior anyway.

### Pitfall 2: "Ready for Doctor" Button Triggers Status Before Vitals Flush
**What goes wrong:** User clicks "Ready for Doctor" → `advanceStatus()` fires → status becomes `in_exam` → `EncounterBottomTabs` appears → page re-renders in doctor mode, but vitals dirty state may not have saved.
**How to avoid:** In the "Ready for Doctor" click handler: call `flushSave(encounterId)` first (fire-and-forget is acceptable — don't block on it), then call `advanceStatus(encounterId)`. The status and vitals saves are independent.

### Pitfall 3: New Vitals Fields Not Mapped in vitalsStore loadVitals
**What goes wrong:** Backend returns new fields in `VitalsResponse`, but `vitalsStore.loadVitals()` doesn't map them to `VitalsDraft` — new fields show blank on reload even after save.
**Why it happens:** `vitalsStore` maps API response fields explicitly. Adding to `VitalsDraft` type doesn't auto-wire the load mapping.
**How to avoid:** When adding new fields to `VitalsDraft`, also update `blankVitalsDraft()` (defaults) and the API response → draft mapping in `loadVitals`.

### Pitfall 4: Accordion "Normal" Button Toggles the Accordion
**What goes wrong:** Clicking "Normal" inside `AccordionTrigger` collapses the section instead of filling fields.
**How to avoid:** The "Normal" button must be placed inside `AccordionContent` or call `e.stopPropagation()` if placed inside the trigger area.

### Pitfall 5: Sticky FAB Overlaps Content on Mobile
**What goes wrong:** FAB at `bottom: 128px, right: 24px` may overlap clinical form fields on narrow screens.
**How to avoid:** Add `pointer-events: none` to the FAB container except the button itself. On mobile, consider reducing FAB to icon-only (no label). The 80px gap above the tab bar ensures the Done button is fully visible.

### Pitfall 6: Alembic Schema Migration Targeting Wrong Schema
**What goes wrong:** Alembic `op.add_column` without schema parameter adds columns to `public` schema, not the tenant schema.
**Why it happens:** The project uses schema-per-tenant. The migration must target the correct schema (or use the dynamic schema mechanism).
**How to avoid:** Check existing migration files for the correct schema pattern. The project seed runs into `public` schema only — but tenant clinical tables live in tenant schemas. Review existing vitals migrations for the correct approach.

---

## Code Examples

### Existing Pattern: advanceStatus (encounterStore)
```typescript
// Source: store/encounterStore.ts L92-96
const NEXT_STATUS: Record<EncounterStatus, EncounterStatus | null> = {
  pre_test: "in_exam",
  in_exam: "finalized",
  finalized: null,
};
// advanceStatus(id) already handles pre_test → in_exam
```

### Existing Pattern: PermissionGate usage
```typescript
// Source: components/auth/PermissionGate.tsx
<PermissionGate roles={["doctor", "owner"]}>
  <AiScribeWidget ... />
</PermissionGate>
```

### Existing Pattern: vitalsStore setField
```typescript
// Source: store/vitalsStore.ts
setField(encounterId, field as keyof VitalsDraft, value);
// Triggers 1.5s debounce → PUT /api/encounters/{id}/vitals
```

### Existing Pattern: Dynamic import (keep for new components)
```typescript
// Source: page.tsx — all encounter sub-components use this pattern
const StickyMicButton = dynamic(
  () => import("@/components/encounter/StickyMicButton").then((m) => ({ default: m.StickyMicButton })),
  { ssr: false }
);
```

### New Pattern: Accordion with per-section Normal button
```typescript
// "Normal" button inside AccordionContent (not Trigger) to avoid toggle conflict
<AccordionContent>
  <div className="flex justify-end mb-3">
    <button
      type="button"
      onClick={() => fillSectionNormal("pupil")}
      className="text-xs px-2.5 py-1 rounded-lg hover-btn border border-[var(--border-subtle)] text-[var(--text-secondary)]"
    >
      Normal
    </button>
  </div>
  {/* fields */}
</AccordionContent>
```

---

## State of the Art

| Old Approach | Current Approach | Impact for Phase 10 |
|--------------|------------------|---------------------|
| AI Scribe always at top of page (before vitals) | AI Scribe moves to bottom (after Plan) | Move `section-plan` div containing AiScribeWidget to after Plan textarea |
| All tabs always visible | Tabs hidden in pre-test, shown in doctor mode | Conditional render of `EncounterBottomTabs` |
| VitalsForm is flat list | VitalsForm has accordion sections per category | Add shadcn Accordion wrapper, no new component |
| 14 vitals fields | 23 fields (+ 9 preliminary) | Full 5-layer change chain |

---

## Open Questions

1. **Accordion component availability**
   - What we know: shadcn/ui is in the project. Accordion component is part of shadcn/ui (Radix-based).
   - What's unclear: Whether `components/ui/accordion.tsx` was already installed or needs `npx shadcn@latest add accordion`.
   - Recommendation: Check for `components/ui/accordion.tsx` existence before planning the accordion task. If missing, `npx shadcn add accordion` is safe (no new npm dep — it uses already-installed `@radix-ui/react-accordion`).

2. **Alembic multi-tenant schema migration pattern**
   - What we know: The project has existing Alembic migrations. Vitals table is in tenant schemas.
   - What's unclear: Whether existing migrations use a loop over tenant schemas or a single-schema approach.
   - Recommendation: Read the most recent Alembic migration file before writing the new one.

3. **StickyMicButton recording source**
   - What we know: `useAiScribe.generate(transcript)` accepts a transcript string. The existing `AiScribeWidget` has its own recording UI.
   - What's unclear: Whether the FAB reuses the `AiScribeWidget`'s recording internally, or manages its own MediaRecorder.
   - Recommendation: The FAB should be a thin UI layer that calls `onDone(transcript)` which passes through to `AiScribeWidget.generate()`. The mic FAB does NOT duplicate recording logic — it's a trigger that hands off to the existing scribe flow.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Playwright (E2E) + Vitest (unit) |
| Config file | `playwright.config.ts` (exists), `vitest.config.*` (check) |
| Quick run command | `bash scripts/dev.sh verify tests/e2e/smoke-encounter.spec.ts` |
| Full suite command | `npm run test:e2e` |

### Phase Requirements → Test Map

| Behavior | Test Type | Automated Command | File Exists? |
|----------|-----------|-------------------|-------------|
| Pre-test mode hides tab bar | E2E smoke | `bash scripts/dev.sh verify tests/e2e/smoke-encounter.spec.ts` | ✅ (extend) |
| "Ready for Doctor" advances status | E2E smoke | same | ✅ (extend) |
| Doctor mode shows all 6 tabs | E2E smoke | same | ✅ (extend) |
| AiScribeWidget at bottom in doctor mode | E2E smoke | same | ✅ (extend) |
| StickyMicButton visible in in_exam (doctor) | E2E smoke | same | ✅ (extend) |
| StickyMicButton hidden in pre_test | E2E smoke | same | ✅ (extend) |
| All Normal fills all fields | Vitest unit | `npx vitest run lib/` | ❌ Wave 0 |
| New vitals fields persist through API round-trip | E2E smoke | `bash scripts/dev.sh verify tests/e2e/smoke-encounter.spec.ts` | ✅ (extend) |

### Sampling Rate
- **Per task commit:** `bash scripts/dev.sh verify tests/e2e/smoke-encounter.spec.ts`
- **Per wave merge:** `npm run test:e2e`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/e2e/smoke-encounter.spec.ts` — add pre-test mode assertions, mode switch, FAB visibility
- [ ] Unit test for `All Normal` fill logic in vitals store or component

---

## Sources

### Primary (HIGH confidence)
- Direct file reads: `page.tsx`, `EncounterBottomTabs.tsx`, `VitalsForm.tsx`, `encounterStore.ts`, `vitalsStore.ts`, `types/vitals.ts`, `types/session.ts`, `PermissionGate.tsx`, `backend/schemas/vitals.py`, `backend/db/models/tenant/clinical.py L516-595`, `backend/api/routes/vitals.py`, `hooks/useAiScribe.ts`
- CONTEXT.md: Phase 10 locked decisions (canonical)

### Secondary (MEDIUM confidence)
- shadcn/ui Accordion: in project via @radix-ui/react-accordion (standard shadcn component, unverified if accordion.tsx file was added)

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries confirmed present in codebase
- Architecture patterns: HIGH — all existing patterns verified from source
- New fields change chain: HIGH — DB model, Pydantic schema, vitals route all read directly
- Pitfalls: HIGH — derived from actual code structure (IntersectionObserver, advanceStatus, store mapping)
- FAB implementation: MEDIUM — pattern is standard React, but recording source/handoff TBD

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable codebase, no fast-moving deps)
