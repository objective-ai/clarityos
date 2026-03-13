# AI Scribe: Staged Commit Review Mode — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the AI Scribe Review & Merge flow with tiered conflict classification, keyboard navigation, commit animation, and undo safety net.

**Architecture:** `buildConflicts` gains a `tier` field derived from confidence + field metadata. `InlineReviewSection` splits rows into auto (banner) and review (focused diff) tiers. Commit is atomic — nothing writes to stores until Enter. Undo captures raw Zustand snapshots and restores them within an 8-second toast window.

**Tech Stack:** React 18, Zustand 4.5, TypeScript 5.5, Tailwind 3.4, Vitest

**Spec:** `docs/superpowers/specs/2026-03-13-ai-scribe-staged-commit-design.md`

---

## Chunk 1: Data Layer — Tiered Conflicts + Apply Fix

### Task 1: Add `tier` field and `isNormalFinding` to `buildConflicts`

**Files:**
- Modify: `components/encounter/conflict-resolver/buildConflicts.ts`
- Test: `tests/unit/lib/buildConflicts.test.ts` (CREATE)

**Reference docs:**
- `lib/exam-findings-fields.ts` — `ANTERIOR_FIELD_META`, `POSTERIOR_FIELD_META` with `defaultStatus`
- `lib/ai-status-mapper.ts` — `mapAiStatus(section, structure, aiStatus, aiNotes)` for case normalization
- `types/scribe.ts` — `ConfidenceLevel`, `ScribeStructuredDataV2`
- Spec section 1: "Tiered Conflict Classification"

- [ ] **Step 1: Write failing tests for tier classification**

Create `tests/unit/lib/buildConflicts.test.ts`:

```ts
import { describe, test, expect } from "vitest";
import { buildConflicts, type StoreSnapshots } from
  "@/components/encounter/conflict-resolver/buildConflicts";
import type { ScribeStructuredDataV2 } from "@/types/scribe";

// ---------------------------------------------------------------------------
// Factory: empty store snapshots (no doctor data, exam not saved)
// ---------------------------------------------------------------------------
function emptySnapshots(overrides?: Partial<StoreSnapshots>): StoreSnapshots {
  return {
    chiefComplaint: null,
    assessmentAndPlan: null,
    vitals: null,
    examAnterior: null,
    examPosterior: null,
    diagnoses: [],
    refractionManifest: null,
    examAnteriorSaved: false,
    examPosteriorSaved: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Factory: minimal AI data with one high-confidence normal finding
// ---------------------------------------------------------------------------
function aiDataWithNormalCornea(): ScribeStructuredDataV2 {
  return {
    chief_complaint: { value: "Blurry vision", confidence: "high" },
    assessment_and_plan: { value: null, confidence: "high" },
    exam_findings: {
      anterior: {
        OD: {
          cornea: { status: "Clear", notes: "", confidence: "high" },
        },
        OS: {
          cornea: { status: "Clear", notes: "", confidence: "high" },
        },
      },
    },
  };
}

describe("buildConflicts — tier classification", () => {
  test("high-confidence normal finding on empty field → auto tier", () => {
    const rows = buildConflicts(aiDataWithNormalCornea(), emptySnapshots());
    const corneaRows = rows.filter((r) => r.fieldKey.includes("cornea"));
    expect(corneaRows.length).toBeGreaterThan(0);
    for (const row of corneaRows) {
      expect(row.tier).toBe("auto");
      expect(row.resolution).toBe("use_ai");
    }
  });

  test("high-confidence abnormal finding on empty field → review tier", () => {
    const data: ScribeStructuredDataV2 = {
      chief_complaint: { value: null, confidence: "high" },
      assessment_and_plan: { value: null, confidence: "high" },
      exam_findings: {
        anterior: {
          OD: { lens: { status: "2+ NS", notes: "", confidence: "high" } },
        },
      },
    };
    const rows = buildConflicts(data, emptySnapshots());
    const lensRow = rows.find((r) => r.fieldKey.includes("lens"));
    expect(lensRow).toBeDefined();
    expect(lensRow!.tier).toBe("review");
  });

  test("diagnosis always → review tier regardless of confidence", () => {
    const data: ScribeStructuredDataV2 = {
      chief_complaint: { value: null, confidence: "high" },
      assessment_and_plan: { value: null, confidence: "high" },
      diagnoses: [
        { icdCode: "H52.13", description: "Myopia bilateral", laterality: "OU", confidence: "high" },
      ],
    };
    const rows = buildConflicts(data, emptySnapshots());
    const dxRow = rows.find((r) => r.section === "diagnoses");
    expect(dxRow).toBeDefined();
    expect(dxRow!.tier).toBe("review");
  });

  test("medium confidence + empty field → review tier", () => {
    const data: ScribeStructuredDataV2 = {
      chief_complaint: { value: null, confidence: "high" },
      assessment_and_plan: { value: null, confidence: "high" },
      vitals: {
        iop_od: { value: 14, confidence: "medium" },
        iop_os: { value: null, confidence: "high" },
        va_od_distance: { value: null, confidence: "high" },
        va_os_distance: { value: null, confidence: "high" },
        va_od_near: { value: null, confidence: "high" },
        va_os_near: { value: null, confidence: "high" },
        bp_systolic: { value: null, confidence: "high" },
        bp_diastolic: { value: null, confidence: "high" },
        pupils_od: { value: null, confidence: "high" },
        pupils_os: { value: null, confidence: "high" },
      },
    };
    const rows = buildConflicts(data, emptySnapshots());
    const iopRow = rows.find((r) => r.fieldKey === "vitals.iop_od");
    expect(iopRow).toBeDefined();
    expect(iopRow!.tier).toBe("review");
  });

  test("A&P always → review tier regardless of confidence", () => {
    const data: ScribeStructuredDataV2 = {
      chief_complaint: { value: null, confidence: "high" },
      assessment_and_plan: { value: "1. Myopia — updated Rx.", confidence: "high" },
    };
    const rows = buildConflicts(data, emptySnapshots());
    const apRow = rows.find((r) => r.fieldKey === "assessment_and_plan");
    expect(apRow).toBeDefined();
    expect(apRow!.tier).toBe("review");
  });

  test("conflict (human has value, AI differs) → review tier", () => {
    const data: ScribeStructuredDataV2 = {
      chief_complaint: { value: "Dry eyes", confidence: "high" },
      assessment_and_plan: { value: null, confidence: "high" },
    };
    const rows = buildConflicts(data, emptySnapshots({
      chiefComplaint: "Blurry vision",
    }));
    const ccRow = rows.find((r) => r.fieldKey === "chief_complaint");
    expect(ccRow).toBeDefined();
    expect(ccRow!.tier).toBe("review");
    expect(ccRow!.hasConflict).toBe(true);
  });

  test("case-insensitive normal check via mapAiStatus: 'clear' matches 'Clear'", () => {
    const data: ScribeStructuredDataV2 = {
      chief_complaint: { value: null, confidence: "high" },
      assessment_and_plan: { value: null, confidence: "high" },
      exam_findings: {
        anterior: {
          OD: { cornea: { status: "clear", notes: "", confidence: "high" } },
        },
      },
    };
    const rows = buildConflicts(data, emptySnapshots());
    const corneaRow = rows.find((r) => r.fieldKey.includes("cornea.status"));
    expect(corneaRow).toBeDefined();
    expect(corneaRow!.tier).toBe("auto");
  });
});

describe("buildConflicts — default detection", () => {
  test("AI matches unsaved default → row created as auto tier (confirmed)", () => {
    const data: ScribeStructuredDataV2 = {
      chief_complaint: { value: null, confidence: "high" },
      assessment_and_plan: { value: null, confidence: "high" },
      exam_findings: {
        anterior: {
          OD: { cornea: { status: "Clear", notes: "", confidence: "high" } },
        },
      },
    };
    // examAnteriorSaved: false → defaults are virtual empty
    const rows = buildConflicts(data, emptySnapshots({
      examAnterior: {
        findings_od: { cornea: { status: "Clear" } } as Record<string, { status: string }>,
        findings_os: {} as Record<string, { status: string }>,
      },
      examAnteriorSaved: false,
    }));
    const corneaRow = rows.find((r) => r.fieldKey.includes("cornea"));
    expect(corneaRow).toBeDefined();
    expect(corneaRow!.tier).toBe("auto");
  });

  test("AI matches saved real data → row skipped (genuine match)", () => {
    const data: ScribeStructuredDataV2 = {
      chief_complaint: { value: null, confidence: "high" },
      assessment_and_plan: { value: null, confidence: "high" },
      exam_findings: {
        anterior: {
          OD: { cornea: { status: "Clear", notes: "", confidence: "high" } },
        },
      },
    };
    // examAnteriorSaved: true → this is real data, match = skip
    const rows = buildConflicts(data, emptySnapshots({
      examAnterior: {
        findings_od: { cornea: { status: "Clear" } } as Record<string, { status: string }>,
        findings_os: {} as Record<string, { status: string }>,
      },
      examAnteriorSaved: true,
    }));
    const corneaRow = rows.find((r) => r.fieldKey.includes("cornea"));
    expect(corneaRow).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx vitest run tests/unit/lib/buildConflicts.test.ts`
Expected: FAIL — `tier` property does not exist on `ConflictRow`

- [ ] **Step 3: Implement tier classification in `buildConflicts.ts`**

Add to `components/encounter/conflict-resolver/buildConflicts.ts`:

1. Add `tier: "auto" | "review"` to `ConflictRow` interface
2. Add `examAnteriorSaved: boolean` and `examPosteriorSaved: boolean` to `StoreSnapshots`
3. Build `NORMAL_VALUES` map from field metadata:

```ts
import { ANTERIOR_FIELD_META, POSTERIOR_FIELD_META } from "@/lib/exam-findings-fields";
import { mapAiStatus } from "@/lib/ai-status-mapper";
import type { ExamSection } from "@/types/exam-findings";

// Derive normal values from field metadata — single source of truth
const NORMAL_VALUES: Record<string, string> = {};
for (const field of [...ANTERIOR_FIELD_META, ...POSTERIOR_FIELD_META]) {
  NORMAL_VALUES[field.key] = field.defaultStatus;
}

function isNormalFinding(
  section: ConflictSection,
  fieldKey: string,
  aiValue: string,
): boolean {
  // Only applies to exam findings
  if (section !== "exam_anterior" && section !== "exam_posterior") return false;

  // Extract structure name from fieldKey: "exam.anterior.od.cornea.status" → "cornea"
  const parts = fieldKey.split(".");
  if (parts.length < 5) return false;
  const structure = parts[3];
  const fieldName = parts[4];

  // Only check status fields, not notes
  if (fieldName !== "status") return false;

  const normalValue = NORMAL_VALUES[structure];
  if (!normalValue) return false;

  // Normalize AI value through mapAiStatus for case-insensitive matching
  const examSection = (section === "exam_anterior" ? "anterior_segment" : "posterior_segment") as ExamSection;
  const mapped = mapAiStatus(examSection, structure, aiValue, "");
  return mapped.status === normalValue;
}
```

4. Modify `addRow` to compute tier:

```ts
function addRow(
  rows: ConflictRow[],
  section: ConflictSection,
  fieldKey: string,
  label: string,
  humanValue: string | null,
  aiValue: string | null,
  confidence: ConfidenceLevel,
  opts?: { examSaved?: boolean },
) {
  if (!aiValue) return;

  const humanStr = humanValue?.trim() || null;
  const aiStr = aiValue.trim();
  if (!aiStr) return;

  // Both match — skip IF the exam data was explicitly saved by doctor
  if (humanStr && humanStr === aiStr) {
    if (opts?.examSaved !== false) return; // genuine match, skip
    // examSaved === false: default data, fall through to create auto-tier row
  }

  const hasConflict = humanStr != null && humanStr !== aiStr && opts?.examSaved !== false;

  // Tier classification
  const isEmptyOrDefault = humanStr == null || opts?.examSaved === false;
  const isHighConf = confidence === "high";
  const isDx = section === "diagnoses";
  const isNormal = isNormalFinding(section, fieldKey, aiStr);

  // A&P is always review tier (clinical narrative — doctor must read it)
  const isAP = section === "assessment";

  let tier: "auto" | "review";
  if (isHighConf && isEmptyOrDefault && !isDx && !isAP && !hasConflict) {
    // For exam fields, must also be a normal finding
    if (section === "exam_anterior" || section === "exam_posterior") {
      tier = isNormal ? "auto" : "review";
    } else {
      tier = "auto";
    }
  } else {
    tier = "review";
  }

  rows.push({
    section,
    fieldKey,
    label,
    humanValue: humanStr,
    aiValue: aiStr,
    confidence,
    hasConflict,
    // Auto-tier defaults to accept; review-tier: conflicts default to keep, non-conflicts to use_ai
    resolution: tier === "auto" ? "use_ai" : (hasConflict ? "keep" : "use_ai"),
    tier,
  });
}
```

5. Update all `addRow` call sites in `buildConflicts()` to pass `opts`:
   - Exam findings calls: pass `{ examSaved: stores.examAnteriorSaved }` or `examPosteriorSaved`
   - Other calls: no opts needed (defaults to `undefined`)

6. **Fix manually-pushed rows** (pupils, BP) that bypass `addRow`: Add `tier: "review"` to the
   `rows.push()` calls for `perrlRow` (~line 169) and `rapdRow` (~line 187) since these involve
   clinical interpretation (PERRL parsing from free text). Same for any manually-pushed diagnosis rows.

7. Diagnoses section: new diagnosis rows explicitly set `tier: "review"` (already handled since `isDx` check)

- [ ] **Step 4: Run tests — verify they pass**

Run: `npx vitest run tests/unit/lib/buildConflicts.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Run full type-check**

Run: `npx tsc --noEmit`
Expected: No errors (StoreSnapshots change may cause downstream errors — fix in calling code)

- [ ] **Step 6: Commit**

```bash
git add components/encounter/conflict-resolver/buildConflicts.ts tests/unit/lib/buildConflicts.test.ts
git commit -m "feat(ai-scribe): add tier classification to buildConflicts with isNormalFinding gate"
```

---

### Task 2: Fix `applyResolutions` — new signature + dx laterality/description handlers

**Files:**
- Modify: `components/encounter/conflict-resolver/applyResolutions.ts`
- Test: `tests/unit/lib/applyResolutions.test.ts` (CREATE)

**Reference docs:**
- `store/diagnosisStore.ts` — `updateDiagnosis(encounterId, diagnosisId, payload)` for dx updates
- Spec section 6: "applyResolutions Signature Change"

- [ ] **Step 1: Write failing tests for new behavior**

Create `tests/unit/lib/applyResolutions.test.ts`:

```ts
import { describe, test, expect, vi, beforeEach } from "vitest";

// Mock all stores before importing applyResolutions
vi.mock("@/store/encounterStore", () => ({
  useEncounterStore: {
    getState: vi.fn(() => ({
      encounters: { "enc-1": { chiefComplaint: "" } },
      setChiefComplaint: vi.fn(),
      setAssessmentAndPlan: vi.fn(),
      setAiSummary: vi.fn(),
    })),
  },
}));
vi.mock("@/store/vitalsStore", () => ({
  useVitalsStore: { getState: vi.fn(() => ({ setField: vi.fn() })) },
}));
vi.mock("@/store/examFindingsStore", () => ({
  useExamFindingsStore: { getState: vi.fn(() => ({ setStructureField: vi.fn() })) },
}));
vi.mock("@/store/diagnosisStore", () => ({
  useDiagnosisStore: {
    getState: vi.fn(() => ({
      addDiagnosis: vi.fn(),
      encounters: {
        "enc-1": {
          diagnoses: [
            { id: "dx-1", icd10Code: "H52.13", description: "Myopia", eyeAffected: "OD" },
          ],
        },
      },
      updateDiagnosis: vi.fn(),
    })),
  },
}));
vi.mock("@/store/refractionStore", () => ({
  useRefractionStore: { getState: vi.fn(() => ({ setCellValue: vi.fn() })) },
}));
vi.mock("@/lib/ai-status-mapper", () => ({
  mapAiStatus: vi.fn((_s, _str, v) => ({ status: v, finding: "" })),
}));

import { applyResolutions } from
  "@/components/encounter/conflict-resolver/applyResolutions";
import type { ConflictRow } from
  "@/components/encounter/conflict-resolver/buildConflicts";

// Suppress audit fetch
beforeEach(() => {
  vi.spyOn(global, "fetch").mockResolvedValue(new Response("ok"));
});

function makeRow(overrides: Partial<ConflictRow>): ConflictRow {
  return {
    section: "chief_complaint",
    fieldKey: "chief_complaint",
    label: "Chief Complaint",
    humanValue: null,
    aiValue: "Blurry vision",
    confidence: "high",
    hasConflict: false,
    resolution: "use_ai",
    tier: "auto",
    ...overrides,
  };
}

describe("applyResolutions", () => {
  test("returns count of applied rows", async () => {
    const rows = [makeRow({}), makeRow({ fieldKey: "assessment_and_plan", section: "assessment", label: "A&P", aiValue: "Follow up" })];
    const count = await applyResolutions("enc-1", rows, "SOAP text");
    expect(count).toBe(2);
  });

  test("returns 0 for empty rows array", async () => {
    const count = await applyResolutions("enc-1", [], "SOAP text");
    expect(count).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `npx vitest run tests/unit/lib/applyResolutions.test.ts`
Expected: FAIL — return type mismatch (currently returns `void`)

- [ ] **Step 3: Update `applyResolutions` implementation**

In `components/encounter/conflict-resolver/applyResolutions.ts`:

1. Change return type: `Promise<void>` → `Promise<number>`
2. Remove internal `resolution === "use_ai"` filter — apply ALL rows passed in:
   ```ts
   // OLD: const selected = rows.filter((r) => r.resolution === "use_ai");
   // NEW: all rows are pre-filtered by caller
   if (rows.length === 0) return 0;
   ```
3. Add dx laterality handler:
   ```ts
   // --- Diagnoses (laterality update) ---
   if (row.fieldKey.startsWith("dx.") && row.fieldKey.endsWith(".laterality")) {
     const icdCode = row.fieldKey.split(".")[1];
     const dxStore = useDiagnosisStore.getState();
     const existing = dxStore.encounters[encounterId]?.diagnoses?.find(
       (d) => d.icd10Code === icdCode,
     );
     if (existing) {
       await dxStore.updateDiagnosis(encounterId, existing.id, {
         eyeAffected: row.aiValue as EyeLaterality,
       });
     }
     continue;
   }

   // NOTE: dx.*.description conflicts are shown in the review UI but cannot be
   // applied yet — DiagnosisUpdateRequest has no `description` field. This
   // requires a schema change (backend Pydantic + types/diagnosis.ts) which
   // needs explicit approval. For now, these rows are display-only.
   // Skip dx description rows silently:
   if (row.fieldKey.startsWith("dx.") && row.fieldKey.endsWith(".description")) {
     continue;
   }
   ```
4. Return `rows.length` at the end

- [ ] **Step 4: Run tests — verify they pass**

Run: `npx vitest run tests/unit/lib/applyResolutions.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Run full type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add components/encounter/conflict-resolver/applyResolutions.ts tests/unit/lib/applyResolutions.test.ts
git commit -m "feat(ai-scribe): update applyResolutions signature, add dx laterality/description handlers"
```

---

### Task 3: Update snapshot callers to pass `examAnteriorSaved` / `examPosteriorSaved`

**Files:**
- Modify: `components/encounter/review-section/InlineReviewSection.tsx` (snapshot builder)
- Modify: `components/encounter/AiScribeWidget.tsx` (suggestion count)

The `StoreSnapshots` interface now requires `examAnteriorSaved` and `examPosteriorSaved`. Both `InlineReviewSection` and `AiScribeWidget` build `StoreSnapshots` objects.

- [ ] **Step 1: Update `InlineReviewSection.tsx` snapshot builder**

In the `useMemo<StoreSnapshots>` block (~line 59), after getting `examAnterior` and `examPosterior` draft values, also check `committed`:

```ts
const anteriorSlice = useExamFindingsStore.getState().findings[anteriorKey];
const posteriorSlice = useExamFindingsStore.getState().findings[posteriorKey];

return {
  // ... existing fields ...
  examAnteriorSaved: anteriorSlice?.committed != null,
  examPosteriorSaved: posteriorSlice?.committed != null,
};
```

- [ ] **Step 2: Update `AiScribeWidget.tsx` suggestion count**

Same pattern in the `useMemo` block (~line 489) that builds `StoreSnapshots` for `buildConflicts`:

```ts
const anteriorSlice = useExamFindingsStore.getState().findings[anteriorKey];
const posteriorSlice = useExamFindingsStore.getState().findings[posteriorKey];
// ... add to snapshots object:
examAnteriorSaved: anteriorSlice?.committed != null,
examPosteriorSaved: posteriorSlice?.committed != null,
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add components/encounter/review-section/InlineReviewSection.tsx components/encounter/AiScribeWidget.tsx
git commit -m "feat(ai-scribe): pass examSaved flags to StoreSnapshots for default detection"
```

---

## Chunk 2: UI Layer — Banner, Keyboard Nav, Focused Rows

### Task 4: Add `isFocused` prop and visual styling to `ConflictRowItem`

**Files:**
- Modify: `components/encounter/conflict-resolver/ConflictRowItem.tsx`

- [ ] **Step 1: Add `isFocused` prop and ARIA attributes**

Add `isFocused?: boolean` (optional, defaults to `false`) and `id?: string` to `ConflictRowItemProps`. Optional props avoid breaking existing callers until Task 5 provides them. Update the root `div`:

```tsx
export function ConflictRowItem({ row, onToggle, isFocused, id }: ConflictRowItemProps) {
  const isNew = !row.hasConflict && row.humanValue == null;
  const isConflict = row.hasConflict;

  return (
    <div
      id={id}
      role="option"
      aria-selected={row.resolution === "use_ai"}
      className={`grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-3 px-3 py-2 rounded-lg text-xs transition-all ${
        isFocused
          ? "ring-2 ring-[var(--accent)]/40 bg-[var(--bg-elevated)] border-l-2 border-l-[var(--accent)]"
          : isConflict
            ? "border border-amber-500/30 bg-amber-500/5"
            : "border border-transparent"
      }`}
    >
      {/* ... rest unchanged ... */}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS — props are optional so existing callers still compile

- [ ] **Step 3: Commit**

```bash
git add components/encounter/conflict-resolver/ConflictRowItem.tsx
git commit -m "feat(ai-scribe): add isFocused prop and ARIA attributes to ConflictRowItem"
```

---

### Task 5: Refactor `ConflictTable` — banner, focused index, keyboard legend, ARIA

**Files:**
- Modify: `components/encounter/conflict-resolver/ConflictTable.tsx`

**Reference docs:**
- Spec section 2: "Review UI Layout" — banner copy, keyboard legend styling
- Spec section 3: "Keyboard Navigation" — ARIA attributes

- [ ] **Step 1: Add new props to `ConflictTable`**

```tsx
interface ConflictTableProps {
  rows: ConflictRow[];
  onToggle: (fieldKey: string, resolution: "keep" | "use_ai") => void;
  focusedIndex: number;
  autoCount: number;          // number of auto-tier rows (for banner)
  confirmedCount: number;     // number of AI-confirmed matches (for banner)
  conflictCount: number;      // number of conflicts in review tier
  newDxCount: number;         // number of new diagnoses in review tier
}
```

- [ ] **Step 2: Add the tier banner at the top of the table**

Above the header row:

```tsx
{(autoCount > 0 || confirmedCount > 0) && (
  <div className="px-4 py-3 rounded-lg mb-3 bg-[var(--accent)]/5 border border-[var(--accent)]/20">
    <div className="flex items-center gap-2 text-xs font-medium text-[var(--accent)]">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 7.5l2.5 2.5 4.5-5" />
      </svg>
      {confirmedCount > 0
        ? `${confirmedCount + autoCount} findings confirmed by AI`
        : `${autoCount} findings staged`}
    </div>
    <div className="text-[11px] text-[var(--text-muted)] mt-0.5 ml-6">
      Review {rows.length} item{rows.length !== 1 ? "s" : ""} below
      {conflictCount > 0 && ` (${conflictCount} conflict${conflictCount !== 1 ? "s" : ""})`}
      {newDxCount > 0 && `${conflictCount > 0 ? "," : ""} ${newDxCount} new Dx`}
    </div>
  </div>
)}
```

- [ ] **Step 3: Add `role="listbox"` and `aria-activedescendant` to the scrollable body**

```tsx
<div
  className="flex-1 overflow-y-auto px-1 py-2 space-y-4"
  role="listbox"
  aria-activedescendant={rows[focusedIndex] ? `conflict-row-${rows[focusedIndex].fieldKey}` : undefined}
  aria-label="AI suggestions for review"
>
```

- [ ] **Step 4: Pass `isFocused` and `id` to each `ConflictRowItem`**

```tsx
{sectionRows.map((row, idx) => {
  const globalIdx = rows.indexOf(row);
  return (
    <ConflictRowItem
      key={row.fieldKey}
      row={row}
      onToggle={onToggle}
      isFocused={globalIdx === focusedIndex}
      id={`conflict-row-${row.fieldKey}`}
    />
  );
})}
```

- [ ] **Step 5: Add the keyboard legend bar below the table body**

```tsx
{/* Keyboard legend */}
<div className="flex items-center justify-center gap-4 px-4 py-2.5 border-t border-[var(--border-subtle)]">
  {[
    { keys: "j/k", label: "Nav" },
    { keys: "a", label: "Accept" },
    { keys: "i", label: "Ignore" },
    { keys: "Enter", label: "Commit" },
  ].map(({ keys, label }) => (
    <span key={keys} className="flex items-center gap-1.5 text-[var(--text-muted)]">
      <kbd className="px-1.5 py-0.5 rounded border border-[var(--glass-border)] bg-[var(--bg-glass)] font-mono text-[10px] text-[var(--text-secondary)]">
        {keys}
      </kbd>
      <span className="text-[10px]">{label}</span>
    </span>
  ))}
</div>
```

- [ ] **Step 6: Type-check and run tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add components/encounter/conflict-resolver/ConflictTable.tsx
git commit -m "feat(ai-scribe): add tier banner, keyboard legend, ARIA to ConflictTable"
```

---

### Task 6: Keyboard navigation + tier split in `InlineReviewSection`

**Files:**
- Modify: `components/encounter/review-section/InlineReviewSection.tsx`

**Reference docs:**
- Spec section 3: keyboard shortcuts, input guard, auto-advance
- Spec section 4: concurrent generation guard

- [ ] **Step 1: Split conflicts by tier and derive banner counts**

After `initialConflicts`:

```tsx
const autoRows = useMemo(
  () => conflicts.filter((r) => r.tier === "auto"),
  [conflicts],
);
const reviewRows = useMemo(
  () => conflicts.filter((r) => r.tier === "review"),
  [conflicts],
);

// Count AI-confirmed matches (auto tier where human matched default)
const confirmedCount = autoRows.filter((r) => r.humanValue != null).length;
const autoStagedCount = autoRows.length - confirmedCount;
const newDxCount = reviewRows.filter(
  (r) => r.section === "diagnoses" && r.fieldKey.endsWith(".new"),
).length;
const reviewConflictCount = reviewRows.filter((r) => r.hasConflict).length;
```

- [ ] **Step 2: Add focused index state and keyboard handler**

```tsx
const [focusedIndex, setFocusedIndex] = useState(0);
const containerRef = useRef<HTMLDivElement>(null);

// Auto-focus container on mount
useEffect(() => {
  containerRef.current?.focus();
}, []);

// Keyboard handler
useEffect(() => {
  const container = containerRef.current;
  if (!container) return;

  const handleKeyDown = (e: KeyboardEvent) => {
    // Input guard: don't capture keys when typing in text fields
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    ) {
      return;
    }

    switch (e.key) {
      case "j":
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((prev) => Math.min(prev + 1, reviewRows.length - 1));
        break;
      case "k":
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((prev) => Math.max(prev - 1, 0));
        break;
      case "a":
        e.preventDefault();
        if (reviewRows[focusedIndex]) {
          handleToggle(reviewRows[focusedIndex].fieldKey, "use_ai");
          // Auto-advance
          setFocusedIndex((prev) => Math.min(prev + 1, reviewRows.length - 1));
        }
        break;
      case "i":
        e.preventDefault();
        if (reviewRows[focusedIndex]) {
          handleToggle(reviewRows[focusedIndex].fieldKey, "keep");
          // Auto-advance
          setFocusedIndex((prev) => Math.min(prev + 1, reviewRows.length - 1));
        }
        break;
      case "Enter":
        e.preventDefault();
        handleCommit();
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  };

  container.addEventListener("keydown", handleKeyDown);
  return () => container.removeEventListener("keydown", handleKeyDown);
}, [reviewRows, focusedIndex, handleToggle, onClose]);
```

Note: `handleCommit` is defined in Task 8 (undo). For now, wire it to the existing `handleApply`.

- [ ] **Step 3: Add `tabIndex` and `ref` to the container div**

Replace the root `<div>` with:

```tsx
<div
  ref={containerRef}
  tabIndex={0}
  className="flex flex-col gap-0 animate-fade-in outline-none"
>
```

- [ ] **Step 4: Update ConflictTable call to pass new props**

```tsx
<ConflictTable
  rows={reviewRows}
  onToggle={handleToggle}
  focusedIndex={focusedIndex}
  autoCount={autoStagedCount}
  confirmedCount={confirmedCount}
  conflictCount={reviewConflictCount}
  newDxCount={newDxCount}
/>
```

- [ ] **Step 5: Update action bar — remove "Approve All Safe", rename to "Commit"**

Replace the bottom action bar buttons:

```tsx
{/* Remove the "Approve All Safe" button entirely */}

{/* Rename "Apply N Selected" → "Commit" */}
<button
  type="button"
  onClick={handleCommit}
  disabled={applying}
  className="text-xs px-5 py-2 rounded-xl font-semibold bg-[var(--accent)] text-[var(--text-inverse)] hover:brightness-110 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
>
  {applying
    ? "Committing..."
    : `Commit (${autoRows.filter((r) => r.resolution === "use_ai").length + reviewRows.filter((r) => r.resolution === "use_ai").length})`}
</button>
```

- [ ] **Step 6: Add concurrent generation guard**

Add a reactive selector for the live store value (not `getState()` — that's not reactive):

```tsx
// At the top of InlineReviewSection, after the existing structuredData selector:
const liveStructuredData = useEncounterStore(
  (s) => s.encounters[encounterId]?.aiStructuredData ?? null,
);
// structuredData was captured via useMemo on mount; liveStructuredData stays current
const hasStaleData = structuredData !== liveStructuredData && liveStructuredData !== null;
```

Below the split-pane div, before the action bar:

```tsx
{hasStaleData && (
  <div className="px-4 py-2 text-xs text-amber-400 bg-amber-500/5 border border-amber-500/20 rounded-lg mx-6">
    New AI data available — close and re-open review.
  </div>
)}
```

- [ ] **Step 7: Type-check and run tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add components/encounter/review-section/InlineReviewSection.tsx
git commit -m "feat(ai-scribe): add tier split, keyboard nav, and banner to InlineReviewSection"
```

---

## Chunk 3: Commit Animation + Undo Toast

### Task 7: Add `animate-fade-out` CSS + Tailwind registration

**Files:**
- Modify: `app/globals.css`
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Add keyframe to `globals.css`**

After the existing `animate-fade-in` block (~line 439):

```css
@keyframes fade-out {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.98); }
}
.animate-fade-out { animation: fade-out 200ms ease both; }
```

- [ ] **Step 2: Register in `tailwind.config.ts`**

In `extend.keyframes`, add:

```ts
"fade-out": {
  from: { opacity: "1", transform: "scale(1)" },
  to: { opacity: "0", transform: "scale(0.98)" },
},
```

In `extend.animation`, add:

```ts
"fade-out": "fade-out 200ms ease both",
```

- [ ] **Step 3: Commit**

```bash
git add app/globals.css tailwind.config.ts
git commit -m "feat(ui): add animate-fade-out keyframe for review mode exit transition"
```

---

### Task 8: Undo toast + commit flow in encounter page

**Files:**
- Modify: `app/(tenant)/[tenant]/encounter/[encounterId]/page.tsx`
- Modify: `components/encounter/review-section/InlineReviewSection.tsx`

**Reference docs:**
- Spec section 4: commit flow steps
- Spec section 5: undo snapshot shape, toast behavior, clinical safety exclusions

- [ ] **Step 1: Add missing imports and define `UndoSnapshot` type**

Add imports to `page.tsx`:

```tsx
import { applyResolutions } from "@/components/encounter/conflict-resolver/applyResolutions";
import type { ConflictRow } from "@/components/encounter/conflict-resolver/buildConflicts";
```

Add to `page.tsx` (above the component):

```tsx
interface UndoSnapshot {
  encounter: {
    chiefComplaint: string;
    assessmentAndPlan: string;
  };
  vitals: unknown;
  examAnterior: unknown;
  examPosterior: unknown;
  diagnoses: unknown;
  refractionColumns: unknown;
  appliedCount: number;
}

function captureUndoSnapshot(encounterId: string): Omit<UndoSnapshot, "appliedCount"> {
  const enc = useEncounterStore.getState().encounters[encounterId];
  const anteriorKey = `${encounterId}:anterior_segment`;
  const posteriorKey = `${encounterId}:posterior_segment`;

  return {
    encounter: {
      chiefComplaint: enc?.chiefComplaint ?? "",
      assessmentAndPlan: enc?.assessmentAndPlan ?? "",
    },
    vitals: structuredClone(useVitalsStore.getState().encounters[encounterId] ?? null),
    examAnterior: structuredClone(useExamFindingsStore.getState().findings[anteriorKey] ?? null),
    examPosterior: structuredClone(useExamFindingsStore.getState().findings[posteriorKey] ?? null),
    diagnoses: structuredClone(useDiagnosisStore.getState().encounters[encounterId]?.diagnoses ?? []),
    refractionColumns: structuredClone(useRefractionStore.getState().columns),
  };
}
```

- [ ] **Step 2: Add undo state to the page component**

Inside `EncounterPage`:

```tsx
const undoRef = useRef<UndoSnapshot | null>(null);
const [undoToast, setUndoToast] = useState<{ count: number; timer: ReturnType<typeof setTimeout> } | null>(null);
const [exitingReview, setExitingReview] = useState(false);
```

- [ ] **Step 3: Wire up the commit handler**

```tsx
const handleCommit = useCallback(async (
  autoRows: ConflictRow[],
  reviewRows: ConflictRow[],
  soapText: string,
) => {
  // 1. Snapshot before writing
  const snapshot = captureUndoSnapshot(params.encounterId);

  // 2. Pre-filter: auto-tier (all use_ai) + review-tier (only use_ai)
  const rowsToApply = [
    ...autoRows.filter((r) => r.resolution === "use_ai"),
    ...reviewRows.filter((r) => r.resolution === "use_ai"),
  ];

  // 3. Apply
  const count = await applyResolutions(params.encounterId, rowsToApply, soapText);

  // 4. Store snapshot with count
  undoRef.current = { ...snapshot, appliedCount: count };

  // 5. Exit animation
  setExitingReview(true);
  setTimeout(() => {
    setReviewMode(false);
    setExitingReview(false);
    setAiStructuredData(params.encounterId, null);
  }, 200);

  // 6. Show undo toast
  const timer = setTimeout(() => {
    undoRef.current = null;
    setUndoToast(null);
  }, 8000);
  setUndoToast({ count, timer });
}, [params.encounterId, setAiStructuredData]);
```

- [ ] **Step 4: Wire up the undo handler**

```tsx
const handleUndo = useCallback(() => {
  const snapshot = undoRef.current;
  if (!snapshot) return;

  const eid = params.encounterId;

  // Restore encounter fields (A&P included per spec)
  useEncounterStore.getState().setChiefComplaint(eid, snapshot.encounter.chiefComplaint);
  useEncounterStore.getState().setAssessmentAndPlan(eid, snapshot.encounter.assessmentAndPlan);

  // Restore vitals — use store's internal setState for atomic replace
  if (snapshot.vitals) {
    const vitalsState = useVitalsStore.getState();
    useVitalsStore.setState({
      encounters: { ...vitalsState.encounters, [eid]: snapshot.vitals as typeof vitalsState.encounters[string] },
    });
  }

  // Restore exam findings
  const anteriorKey = `${eid}:anterior_segment`;
  const posteriorKey = `${eid}:posterior_segment`;
  if (snapshot.examAnterior) {
    const examState = useExamFindingsStore.getState();
    useExamFindingsStore.setState({
      findings: { ...examState.findings, [anteriorKey]: snapshot.examAnterior as typeof examState.findings[string] },
    });
  }
  if (snapshot.examPosterior) {
    const examState = useExamFindingsStore.getState();
    useExamFindingsStore.setState({
      findings: { ...examState.findings, [posteriorKey]: snapshot.examPosterior as typeof examState.findings[string] },
    });
  }

  // Restore refraction
  if (snapshot.refractionColumns) {
    useRefractionStore.setState({
      columns: snapshot.refractionColumns as typeof useRefractionStore.getState().columns,
    });
  }

  // NOTE: Diagnoses NOT auto-removed (clinical safety per spec)
  // Fire audit log for revert
  fetch(`/api/encounters/${eid}/ai-scribe/accept`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ changes: { reverted: true, count: snapshot.appliedCount } }),
  }).catch(() => {});

  // Clean up toast
  if (undoToast?.timer) clearTimeout(undoToast.timer);
  undoRef.current = null;
  setUndoToast(null);

  // Re-open review mode
  setReviewMode(true);
}, [params.encounterId, undoToast]);
```

- [ ] **Step 5: Update `InlineReviewSection` to accept `onCommit` prop**

Change `InlineReviewSectionProps`:

```tsx
interface InlineReviewSectionProps {
  encounterId: string;
  onClose: () => void;
  onCommit: (autoRows: ConflictRow[], reviewRows: ConflictRow[], soapText: string) => Promise<void>;
}
```

Replace the old `onApply` prop and remove internal `handleApply`/`handleApproveAllSafe`. The `handleCommit` inside `InlineReviewSection` calls `onCommit(autoRows, reviewRows, soapText)`.

Update the keyboard `Enter` handler to call this.

- [ ] **Step 6: Update page.tsx to pass `onCommit` and add exit animation class**

```tsx
{(reviewMode || exitingReview) && (
  <div className={exitingReview ? "animate-fade-out" : ""}>
    <InlineReviewSection
      encounterId={params.encounterId}
      onClose={() => setReviewMode(false)}
      onCommit={handleCommit}
    />
  </div>
)}
```

- [ ] **Step 7: Render the undo toast**

Below the encounter content, before the spacer div:

```tsx
{undoToast && (
  <div className="fixed bottom-20 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--glass-border)] shadow-[var(--shadow-lg)] animate-fade-in">
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 7.5l2.5 2.5 4.5-5" />
    </svg>
    <span className="text-xs font-medium text-[var(--text-primary)]">
      {undoToast.count} field{undoToast.count !== 1 ? "s" : ""} applied
    </span>
    <button
      type="button"
      onClick={handleUndo}
      className="text-xs px-3 py-1.5 rounded-lg font-semibold text-[var(--accent)] border border-[var(--accent)]/30 hover:bg-[var(--accent)]/10 transition-colors"
    >
      Undo
    </button>
    {/* 8-second progress bar */}
    <div className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl overflow-hidden">
      <div
        className="h-full bg-[var(--accent)]/30"
        style={{ animation: "shrink-bar 8s linear forwards" }}
      />
    </div>
  </div>
)}
```

Add the shrink-bar keyframe to `globals.css`:

```css
@keyframes shrink-bar {
  from { width: 100%; }
  to   { width: 0%; }
}
```

- [ ] **Step 8: Type-check and run tests**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add app/(tenant)/[tenant]/encounter/[encounterId]/page.tsx components/encounter/review-section/InlineReviewSection.tsx app/globals.css
git commit -m "feat(ai-scribe): add staged commit flow with undo toast and exit animation"
```

---

## Chunk 4: Integration Testing + Final Cleanup

### Task 9: Integration tests — full commit + undo flow

**Files:**
- Create: `tests/unit/lib/staged-commit-flow.test.ts`

- [ ] **Step 1: Write integration test for tier split**

```ts
import { describe, test, expect } from "vitest";
import { buildConflicts, type StoreSnapshots } from
  "@/components/encounter/conflict-resolver/buildConflicts";
import type { ScribeStructuredDataV2 } from "@/types/scribe";

function realisticAiData(): ScribeStructuredDataV2 {
  return {
    chief_complaint: { value: "Comprehensive eye exam", confidence: "high" },
    assessment_and_plan: {
      value: "1. Myopia — updated Rx.\n2. Elevated IOP OD — order OCT.",
      confidence: "high",
    },
    vitals: {
      iop_od: { value: 23, confidence: "high" },
      iop_os: { value: 18, confidence: "high" },
      va_od_distance: { value: "20/200", confidence: "high" },
      va_os_distance: { value: "20/100", confidence: "high" },
      va_od_near: { value: null, confidence: "high" },
      va_os_near: { value: null, confidence: "high" },
      bp_systolic: { value: null, confidence: "high" },
      bp_diastolic: { value: null, confidence: "high" },
      pupils_od: { value: null, confidence: "high" },
      pupils_os: { value: null, confidence: "high" },
    },
    exam_findings: {
      anterior: {
        OD: {
          cornea: { status: "Clear", notes: "", confidence: "high" },
          lids_lashes: { status: "Normal", notes: "", confidence: "high" },
          lens: { status: "2+ NS", notes: "Nuclear sclerosis", confidence: "high" },
          anterior_chamber: { status: "Deep & quiet", notes: "", confidence: "high" },
        },
        OS: {
          cornea: { status: "Clear", notes: "", confidence: "high" },
          lids_lashes: { status: "Normal", notes: "", confidence: "high" },
          lens: { status: "2+ NS", notes: "Nuclear sclerosis", confidence: "high" },
          anterior_chamber: { status: "Deep & quiet", notes: "", confidence: "high" },
        },
      },
      posterior: {
        OD: {
          macula: { status: "Flat & intact", notes: "", confidence: "high" },
          vessels: { status: "Normal A/V ratio", notes: "", confidence: "high" },
        },
        OS: {
          macula: { status: "Flat & intact", notes: "", confidence: "high" },
          vessels: { status: "Normal A/V ratio", notes: "", confidence: "high" },
        },
      },
    },
    diagnoses: [
      { icdCode: "H52.13", description: "Myopia, bilateral", laterality: "OU", confidence: "high" },
      { icdCode: "H40.001", description: "Glaucoma suspect", laterality: "OD", confidence: "medium" },
    ],
    refraction: {
      OD: { sphere: "-2.00", cylinder: "-0.75", axis: "180", add: "+2.00", confidence: "low" },
      OS: { sphere: "-1.75", cylinder: "-0.50", axis: "175", add: "+2.00", confidence: "low" },
    },
  };
}

function emptySnapshots(): StoreSnapshots {
  return {
    chiefComplaint: null,
    assessmentAndPlan: null,
    vitals: null,
    examAnterior: null,
    examPosterior: null,
    diagnoses: [],
    refractionManifest: null,
    examAnteriorSaved: false,
    examPosteriorSaved: false,
  };
}

describe("Realistic encounter — tier split", () => {
  test("normal findings → auto, abnormal + dx + low-conf → review", () => {
    const rows = buildConflicts(realisticAiData(), emptySnapshots());
    const autoRows = rows.filter((r) => r.tier === "auto");
    const reviewRows = rows.filter((r) => r.tier === "review");

    // Normal findings: cornea Clear (OD+OS), lids Normal (OD+OS),
    // AC Deep & quiet (OD+OS), macula Flat & intact (OD+OS),
    // vessels Normal A/V (OD+OS) = 10 auto
    // Plus chief complaint (high conf + empty) and vitals (high conf + empty)
    expect(autoRows.length).toBeGreaterThanOrEqual(10);

    // Abnormal: lens 2+ NS (OD+OS status + notes = 4 rows)
    // Dx: 2 diagnoses (always review)
    // Refraction: low confidence → review (8 fields)
    // A&P: review (text block)
    expect(reviewRows.length).toBeGreaterThanOrEqual(5);

    // Diagnoses are always review tier
    const dxRows = rows.filter((r) => r.section === "diagnoses");
    for (const dx of dxRows) {
      expect(dx.tier).toBe("review");
    }

    // Low confidence refraction → review
    const rxRows = rows.filter((r) => r.section === "refraction");
    for (const rx of rxRows) {
      expect(rx.tier).toBe("review");
    }
  });

  test("auto-tier rows default to resolution use_ai", () => {
    const rows = buildConflicts(realisticAiData(), emptySnapshots());
    const autoRows = rows.filter((r) => r.tier === "auto");
    for (const row of autoRows) {
      expect(row.resolution).toBe("use_ai");
    }
  });

  test("review-tier rows default to resolution keep", () => {
    const rows = buildConflicts(realisticAiData(), emptySnapshots());
    const reviewRows = rows.filter((r) => r.tier === "review");
    for (const row of reviewRows) {
      expect(row.resolution).toBe("keep");
    }
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/unit/lib/staged-commit-flow.test.ts`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add tests/unit/lib/staged-commit-flow.test.ts
git commit -m "test(ai-scribe): add integration tests for tier classification with realistic encounter data"
```

---

### Task 10: Final type-check + full test suite

- [ ] **Step 1: Full type-check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Verify no regressions in existing scribe tests**

Run: `npx vitest run tests/unit/hooks/useAiScribe.test.ts tests/unit/lib/scribe-normalizer.test.ts`
Expected: ALL PASS — these tests should not be affected by our changes

- [ ] **Step 4: Final commit with any cleanup**

If any type fixes or minor adjustments were needed:

```bash
git add -A
git commit -m "chore(ai-scribe): type fixes and cleanup for staged commit review mode"
```
